#!/usr/bin/env python3
"""
FinatriX Phase 4.1 — Company Intelligence seed builder.

Reads the Company Intelligence CSV export (companies.csv + relation tables) and
emits deterministic SQL seed statements plus a small JSON fixture used by the
Vitest suite. This is a build-time tool only; it never touches a live database.

The two exported "batches" are byte-identical, so we read a single canonical
batch. Company ids ("CMP-00001") are treated as persistent primary keys and all
relationships reference those ids — never array indexes.

Usage:
    python3 scripts/build-company-intelligence.py \
        --src "/path/to/Database/Batch 1" \
        --seed supabase/company_intelligence_seed.sql \
        --fixture src/careers/test/fixtures/company-intelligence.json
"""
from __future__ import annotations

import argparse
import csv
import json
import os
from typing import Any

# ── table → (csv file, primary key column) ────────────────────────────────
TABLES: dict[str, str] = {
    "ci_companies": "companies.csv",
    "ci_career_pages": "career_pages.csv",
    "ci_graduate_programs": "graduate_programs.csv",
    "ci_internships": "internships.csv",
    "ci_ats_platforms": "ats_platforms.csv",
    "ci_company_locations": "company_locations.csv",
    "ci_company_functions": "company_functions.csv",
    "ci_company_tags": "company_tags.csv",
    "ci_company_sources": "company_sources.csv",
    "ci_salary_intelligence": "salary_intelligence.csv",
    "ci_opportunity_sources": "opportunity_sources.csv",
}

# Boolean-ish columns per table (converted to true/false/NULL).
BOOL_COLS = {
    "freshers_friendly", "graduate_friendly", "intern_friendly", "experienced_hiring",
    "needs_review", "is_headquarters", "is_generic_record",
}
# Integer columns.
INT_COLS = {"hiring_confidence_score", "priority_tier", "min_annual", "max_annual"}


def read_rows(path: str) -> list[dict[str, str]]:
    with open(path, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def sql_literal(col: str, raw: str) -> str:
    v = (raw or "").strip()
    if v == "":
        # Empty → NULL for numerics/bools/dates, '' for text handled by caller default.
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


def build_seed(src: str) -> str:
    out: list[str] = [
        "-- FinatriX Phase 4.1 — Company Intelligence seed (generated).",
        "-- Source: knowledge_base_2026_01 export. Idempotent via ON CONFLICT.",
        "-- Do NOT edit by hand; regenerate with scripts/build-company-intelligence.py.",
        "begin;",
        "",
    ]
    for table, fname in TABLES.items():
        path = os.path.join(src, fname)
        rows = read_rows(path)
        if not rows:
            continue
        cols = list(rows[0].keys())
        pk = cols[0]
        col_list = ", ".join(cols)
        out.append(f"-- {table}: {len(rows)} rows")
        # Insert in chunks to keep statements readable and within limits.
        CHUNK = 200
        for i in range(0, len(rows), CHUNK):
            chunk = rows[i : i + CHUNK]
            values = ",\n  ".join(
                "(" + ", ".join(sql_literal(c, r.get(c, "")) for c in cols) + ")"
                for r in chunk
            )
            out.append(
                f"insert into public.{table} ({col_list}) values\n  {values}\n"
                f"on conflict ({pk}) do update set\n  "
                + ",\n  ".join(f"{c} = excluded.{c}" for c in cols if c != pk)
                + ";"
            )
        out.append("")
    out.append("commit;")
    return "\n".join(out)


def build_fixture(src: str, sample_ids: list[str]) -> dict[str, Any]:
    """A compact, deterministic fixture: a handful of companies with every relation,
    plus all opportunity sources (small table). Used by unit tests only."""
    fixture: dict[str, Any] = {}
    for table, fname in TABLES.items():
        rows = read_rows(os.path.join(src, fname))
        if table == "ci_companies":
            fixture[table] = [r for r in rows if r["company_id"] in sample_ids]
        elif table == "ci_opportunity_sources":
            fixture[table] = rows  # small; keep all so source joins resolve
        else:
            fixture[table] = [r for r in rows if r.get("company_id") in sample_ids]
    return fixture


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--seed", required=True)
    ap.add_argument("--fixture", required=True)
    args = ap.parse_args()

    seed = build_seed(args.src)
    os.makedirs(os.path.dirname(args.seed), exist_ok=True)
    with open(args.seed, "w", encoding="utf-8") as fh:
        fh.write(seed)

    # Representative sample across industries incl. ones with real ATS/synonyms.
    sample_ids = [
        "CMP-00001",  # HDFC Bank (banking, synonyms)
        "CMP-00043",  # JPMorgan (career page, synonyms)
        "CMP-00031",  # SBI
        "CMP-00002",  # ICICI
        "CMP-00003",  # Axis
    ]
    fixture = build_fixture(args.src, sample_ids)
    os.makedirs(os.path.dirname(args.fixture), exist_ok=True)
    with open(args.fixture, "w", encoding="utf-8") as fh:
        json.dump(fixture, fh, indent=1, ensure_ascii=False)

    counts = {t: len(read_rows(os.path.join(args.src, f))) for t, f in TABLES.items()}
    print("Seed written:", args.seed)
    print("Fixture written:", args.fixture, "(companies:", len(fixture["ci_companies"]), ")")
    for t, n in counts.items():
        print(f"  {t:26} {n}")


if __name__ == "__main__":
    main()
