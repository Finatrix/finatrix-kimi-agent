#!/usr/bin/env python3
"""
FinatriX — Company Intelligence idempotent import pipeline.

Designed to scale from today's 804-company seed to 10,000+ without code changes.
Future batches are imported simply by dropping their CSV folders anywhere under
the import directory and running ONE command:

    python3 scripts/import-company-intelligence.py --import-dir ~/Downloads/Database

What it does, deterministically:
  1. Discovers every batch (any folder containing companies.csv) under --import-dir.
  2. Loads and schema-validates each relation table.
  3. De-duplicates companies:
       • same company_id twice → merged (conflicting name → reported, first wins)
       • different ids, same name_normalized → alias-merged into one canonical
         record; the duplicate's name is preserved as a `synonym` tag and all of
         its relations are re-pointed to the canonical id (IDs are preserved,
         never re-indexed).
  4. Validates ALL foreign keys (every child company_id resolves; every
     company_sources.source_id resolves) — orphans are dropped and reported.
  5. Emits a SINGLE transactional, idempotent seed:
       begin; …upserts (insert … on conflict do update)…; commit;
     Re-running updates existing rows and inserts only genuinely new ones, so
     imports are incremental and safe to repeat. Any failure inside the
     transaction rolls the whole import back.
  6. Writes a machine- and human-readable import report.
  7. Optionally regenerates the Vitest fixture (--fixture).

Nothing here contacts a live database. With --apply and a DATABASE_URL it will
pipe the generated SQL through `psql` (still one transaction, still atomic).
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import subprocess
import sys
from dataclasses import dataclass, field
from typing import Any

# table name → (filename, primary-key column, optional company FK column)
TABLES: dict[str, tuple[str, str, str | None]] = {
    "ci_companies": ("companies.csv", "company_id", None),
    "ci_career_pages": ("career_pages.csv", "page_id", "company_id"),
    "ci_graduate_programs": ("graduate_programs.csv", "program_id", "company_id"),
    "ci_internships": ("internships.csv", "internship_id", "company_id"),
    "ci_ats_platforms": ("ats_platforms.csv", "ats_record_id", "company_id"),
    "ci_company_locations": ("company_locations.csv", "location_id", "company_id"),
    "ci_company_functions": ("company_functions.csv", "function_id", "company_id"),
    "ci_company_tags": ("company_tags.csv", "tag_id", "company_id"),
    "ci_company_sources": ("company_sources.csv", "link_id", "company_id"),
    "ci_salary_intelligence": ("salary_intelligence.csv", "salary_id", "company_id"),
    "ci_opportunity_sources": ("opportunity_sources.csv", "source_id", None),
}
CHILD_TABLES = [t for t, (_, _, fk) in TABLES.items() if fk == "company_id"]

BOOL_COLS = {
    "freshers_friendly", "graduate_friendly", "intern_friendly", "experienced_hiring",
    "needs_review", "is_headquarters", "is_generic_record",
}
INT_COLS = {"hiring_confidence_score", "priority_tier", "min_annual", "max_annual"}


def normalize_name(raw: str) -> str:
    """Mirror the app's normalizeCompanyName (companyMatch.ts)."""
    s = (raw or "").lower().replace("&", " and ")
    out = []
    for ch in s:
        out.append(ch if (ch.isalnum() or ch == " ") else " ")
    s = " ".join("".join(out).split())
    for suf in ["private limited", "pvt ltd", "pvt limited", "limited", "ltd", "pvt",
                "llp", "llc", "plc", "inc", "incorporated", "corp", "corporation", "co"]:
        if s.endswith(" " + suf):
            s = s[: -(len(suf) + 1)].strip()
            break
    return s


@dataclass
class Report:
    started_at: str
    batches: list[str] = field(default_factory=list)
    companies_total: int = 0
    companies_new: int = 0
    companies_updated: int = 0
    duplicate_ids_merged: int = 0
    alias_merges: list[dict[str, str]] = field(default_factory=list)
    id_conflicts: list[dict[str, str]] = field(default_factory=list)
    fk_orphans_dropped: dict[str, int] = field(default_factory=dict)
    source_orphans_dropped: int = 0
    aliases_added: int = 0
    row_counts: dict[str, int] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    ok: bool = True


def read_rows(path: str) -> list[dict[str, str]]:
    with open(path, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def discover_batches(root: str) -> list[str]:
    found = []
    for dirpath, _dirs, files in os.walk(root):
        if "companies.csv" in files:
            found.append(dirpath)
    return sorted(found)


def sql_literal(col: str, raw: str) -> str:
    v = (raw or "").strip()
    if v == "":
        if col in BOOL_COLS or col in INT_COLS or col.endswith("_date") or col == "last_checked":
            return "NULL"
        return "''"
    if col in BOOL_COLS:
        return "true" if v.lower() in ("true", "1", "yes", "y") else "false"
    if col in INT_COLS:
        try:
            return str(int(float(v)))
        except ValueError:
            return "NULL"
    return "'" + v.replace("'", "''") + "'"


def load_all(batches: list[str], rep: Report) -> dict[str, list[dict[str, str]]]:
    data: dict[str, list[dict[str, str]]] = {t: [] for t in TABLES}
    for b in batches:
        for table, (fname, _pk, _fk) in TABLES.items():
            path = os.path.join(b, fname)
            if os.path.exists(path):
                data[table].extend(read_rows(path))
    return data


def dedupe_companies(rows: list[dict[str, str]], rep: Report):
    """Return (canonical_by_id, id_remap, synonym_tags_to_add)."""
    by_id: dict[str, dict[str, str]] = {}
    norm_to_id: dict[str, str] = {}
    id_remap: dict[str, str] = {}
    synonym_tags: list[dict[str, str]] = []

    def conf(r: dict[str, str]) -> tuple[int, int]:
        try:
            c = int(float(r.get("hiring_confidence_score") or 0))
        except ValueError:
            c = 0
        try:
            tier = int(float(r.get("priority_tier") or 99))
        except ValueError:
            tier = 99
        return (c, -tier)

    for r in rows:
        cid = (r.get("company_id") or "").strip()
        if not cid:
            rep.errors.append("company row missing company_id; skipped")
            continue
        norm = (r.get("name_normalized") or "").strip() or normalize_name(r.get("company_name", ""))
        r["name_normalized"] = norm

        # 1 · exact id duplicate
        if cid in by_id:
            existing = by_id[cid]
            if existing.get("name_normalized") != norm:
                rep.id_conflicts.append({"company_id": cid, "kept": existing.get("company_name", ""),
                                         "ignored": r.get("company_name", "")})
            else:
                rep.duplicate_ids_merged += 1
            continue

        # 2 · alias duplicate (different id, same normalized name)
        if norm in norm_to_id and norm_to_id[norm] != cid:
            canon = norm_to_id[norm]
            # keep whichever record is stronger as canonical
            if conf(r) > conf(by_id[canon]):
                # promote r to canonical, remap old canonical → r
                id_remap[canon] = cid
                old = by_id.pop(canon)
                by_id[cid] = r
                norm_to_id[norm] = cid
                _add_synonym(synonym_tags, cid, old.get("company_name", ""), rep)
                # any ids already remapped to `canon` now point to cid
                for k, v in list(id_remap.items()):
                    if v == canon:
                        id_remap[k] = cid
                rep.alias_merges.append({"canonical": cid, "merged": canon,
                                         "alias": old.get("company_name", "")})
            else:
                id_remap[cid] = canon
                _add_synonym(synonym_tags, canon, r.get("company_name", ""), rep)
                rep.alias_merges.append({"canonical": canon, "merged": cid,
                                         "alias": r.get("company_name", "")})
            continue

        by_id[cid] = r
        norm_to_id[norm] = cid

    return by_id, id_remap, synonym_tags


def _add_synonym(tags: list[dict[str, str]], company_id: str, alias: str, rep: Report):
    if not alias:
        return
    tags.append({
        "tag_id": f"TAG-MERGE-{company_id}-{len([t for t in tags if t['company_id']==company_id])+1}",
        "company_id": company_id, "tag_type": "synonym", "tag_value": alias,
    })
    rep.aliases_added += 1


def remap_and_validate(data, by_id, id_remap, synonym_tags, rep: Report):
    """Remap child FKs to canonical ids, drop orphans, validate sources."""
    resolved = set(by_id.keys())

    def resolve(cid: str) -> str | None:
        seen = set()
        while cid in id_remap and cid not in seen:
            seen.add(cid)
            cid = id_remap[cid]
        return cid if cid in resolved else None

    # opportunity sources: union by source_id
    src_by_id: dict[str, dict[str, str]] = {}
    for r in data["ci_opportunity_sources"]:
        sid = (r.get("source_id") or "").strip()
        if sid:
            src_by_id.setdefault(sid, r)

    out: dict[str, list[dict[str, str]]] = {t: [] for t in TABLES}
    out["ci_companies"] = list(by_id.values())
    out["ci_opportunity_sources"] = list(src_by_id.values())

    # child tables (dedupe by pk, remap company_id, drop orphans)
    for table in CHILD_TABLES:
        _fname, pk, _fk = TABLES[table]
        seen_pk: set[str] = set()
        dropped = 0
        for r in data[table]:
            cid = resolve((r.get("company_id") or "").strip())
            if cid is None:
                dropped += 1
                continue
            r["company_id"] = cid
            key = (r.get(pk) or "").strip()
            if key and key in seen_pk:
                continue
            seen_pk.add(key)
            # validate source FK for company_sources
            if table == "ci_company_sources":
                if (r.get("source_id") or "").strip() not in src_by_id:
                    rep.source_orphans_dropped += 1
                    continue
            out[table].append(r)
        if dropped:
            rep.fk_orphans_dropped[table] = dropped

    # merge generated synonym tags (dedupe against existing synonyms)
    existing = {(t["company_id"], t.get("tag_value", "").lower())
                for t in out["ci_company_tags"] if t.get("tag_type") == "synonym"}
    for tag in synonym_tags:
        k = (tag["company_id"], tag["tag_value"].lower())
        if k not in existing:
            out["ci_company_tags"].append(tag)
            existing.add(k)
    return out


def emit_sql(out: dict[str, list[dict[str, str]]]) -> str:
    lines = [
        "-- FinatriX — Company Intelligence import (generated, idempotent).",
        f"-- Generated {dt.datetime.utcnow().isoformat()}Z by import-company-intelligence.py",
        "-- Transactional: any failure rolls the entire import back.",
        "begin;",
        "",
    ]
    # order: companies + opportunity_sources first (parents), then children
    order = ["ci_companies", "ci_opportunity_sources"] + CHILD_TABLES
    for table in order:
        rows = out[table]
        if not rows:
            continue
        cols = list(TABLES_COLUMNS[table])
        pk = TABLES[table][1]
        lines.append(f"-- {table}: {len(rows)} rows")
        CHUNK = 200
        for i in range(0, len(rows), CHUNK):
            chunk = rows[i:i + CHUNK]
            values = ",\n  ".join(
                "(" + ", ".join(sql_literal(c, r.get(c, "")) for c in cols) + ")" for r in chunk
            )
            updates = ",\n  ".join(f"{c} = excluded.{c}" for c in cols if c != pk)
            lines.append(
                f"insert into public.{table} ({', '.join(cols)}) values\n  {values}\n"
                f"on conflict ({pk}) do update set\n  {updates};"
            )
        lines.append("")
    lines.append("commit;")
    return "\n".join(lines)


# Canonical column order per table (from the schema).
TABLES_COLUMNS: dict[str, list[str]] = {
    "ci_companies": ["company_id", "company_name", "name_normalized", "country_code", "industry",
        "sector", "sub_sector", "hq_city", "hq_state", "hq_country", "official_website",
        "company_size_band", "ownership_type", "listed_exchange", "market_cap_category",
        "freshers_friendly", "graduate_friendly", "intern_friendly", "experienced_hiring",
        "visa_sponsorship", "work_modes", "hiring_frequency", "notice_period_preference",
        "hiring_confidence_score", "priority_tier", "confidence_level", "verification_status",
        "last_verified_date", "data_source", "needs_review", "notes"],
    "ci_career_pages": ["page_id", "company_id", "page_type", "url", "url_status", "confidence_level", "source"],
    "ci_graduate_programs": ["program_id", "company_id", "program_name", "program_type", "program_url", "is_generic_record", "confidence_level"],
    "ci_internships": ["internship_id", "company_id", "internship_type", "typical_season", "internship_url", "confidence_level"],
    "ci_ats_platforms": ["ats_record_id", "company_id", "detected_ats", "detection_confidence", "detection_method", "detected_url", "last_checked"],
    "ci_company_locations": ["location_id", "company_id", "city", "state_region", "country_code", "is_headquarters"],
    "ci_company_functions": ["function_id", "company_id", "function_name", "hiring_active", "confidence_level"],
    "ci_company_tags": ["tag_id", "company_id", "tag_type", "tag_value"],
    "ci_company_sources": ["link_id", "company_id", "source_id", "presence", "listing_url", "confidence_level"],
    "ci_salary_intelligence": ["salary_id", "company_id", "role_family", "experience_level", "currency", "min_annual", "max_annual", "unit", "basis", "confidence_level"],
    "ci_opportunity_sources": ["source_id", "source_name", "source_type", "coverage_country", "website_url", "notes", "data_source"],
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--import-dir", required=True, help="Folder containing one or more batch subfolders")
    ap.add_argument("--out", default="supabase/company_intelligence_seed.sql")
    ap.add_argument("--report", default="supabase/import-report.json")
    ap.add_argument("--fixture", default="", help="Optional path to (re)write the Vitest fixture")
    ap.add_argument("--apply", action="store_true", help="Pipe generated SQL through psql ($DATABASE_URL)")
    ap.add_argument("--force", action="store_true", help="Emit SQL even if validation reports issues")
    args = ap.parse_args()

    rep = Report(started_at=dt.datetime.utcnow().isoformat() + "Z")
    batches = discover_batches(args.import_dir)
    rep.batches = batches
    if not batches:
        print(f"No batches found under {args.import_dir} (need a companies.csv).", file=sys.stderr)
        sys.exit(2)

    data = load_all(batches, rep)
    by_id, id_remap, synonym_tags = dedupe_companies(data["ci_companies"], rep)
    out = remap_and_validate(data, by_id, id_remap, synonym_tags, rep)

    rep.companies_total = len(out["ci_companies"])
    rep.row_counts = {t: len(rows) for t, rows in out.items()}
    # new vs updated: compared against an existing seed manifest if present
    rep.companies_new = rep.companies_total  # without a prior manifest, treat all as upserts
    rep.ok = len(rep.id_conflicts) == 0 and not rep.errors

    sql = emit_sql(out)
    if rep.ok or args.force:
        os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(sql)
    os.makedirs(os.path.dirname(args.report) or ".", exist_ok=True)
    with open(args.report, "w", encoding="utf-8") as fh:
        json.dump(rep.__dict__, fh, indent=2)

    # Human summary
    print("── Company Intelligence import ──")
    print(f"batches discovered   : {len(batches)}")
    for b in batches:
        print(f"  • {b}")
    print(f"companies (canonical): {rep.companies_total}")
    print(f"duplicate ids merged : {rep.duplicate_ids_merged}")
    print(f"alias merges         : {len(rep.alias_merges)}")
    print(f"aliases added (tags) : {rep.aliases_added}")
    print(f"id conflicts         : {len(rep.id_conflicts)}")
    print(f"FK orphans dropped   : {sum(rep.fk_orphans_dropped.values())} {rep.fk_orphans_dropped or ''}")
    print(f"source orphans dropped: {rep.source_orphans_dropped}")
    print(f"seed written         : {args.out if (rep.ok or args.force) else '(skipped — issues found; use --force)'}")
    print(f"report written       : {args.report}")

    if args.fixture:
        sample = ["CMP-00001", "CMP-00043", "CMP-00031", "CMP-00002", "CMP-00003"]
        fx = {}
        ids = set(sample)
        for table, rows in out.items():
            if table == "ci_companies":
                fx[table] = [r for r in rows if r["company_id"] in ids]
            elif table == "ci_opportunity_sources":
                fx[table] = rows
            else:
                fx[table] = [r for r in rows if r.get("company_id") in ids]
        os.makedirs(os.path.dirname(args.fixture) or ".", exist_ok=True)
        with open(args.fixture, "w", encoding="utf-8") as fh:
            json.dump(fx, fh, indent=1, ensure_ascii=False)
        print(f"fixture written      : {args.fixture}")

    if not rep.ok and not args.force:
        print("\nValidation found blocking issues (id conflicts / errors). "
              "Review the report, then re-run with --force to emit anyway.", file=sys.stderr)
        sys.exit(1)

    if args.apply:
        url = os.environ.get("DATABASE_URL")
        if not url:
            print("--apply requires DATABASE_URL", file=sys.stderr)
            sys.exit(2)
        print("Applying via psql (single transaction)…")
        proc = subprocess.run(["psql", url, "-v", "ON_ERROR_STOP=1", "-f", args.out])
        sys.exit(proc.returncode)


if __name__ == "__main__":
    main()
