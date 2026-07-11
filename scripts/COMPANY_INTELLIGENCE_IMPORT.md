# Company Intelligence — import & scale guide

The Company Intelligence layer is a **global reference dataset** that enriches
every Careers feature (job-search enrichment, company profiles, multi-entity
search, dashboard, reports). It is metadata — never a source of live jobs.

It is designed to scale from today's **804-company seed to 10,000+** with **no
code changes**. Nothing in the app or import pipeline hardcodes the current
company count.

## One-command imports (future batches)

Drop any new export — one folder per batch, each containing the standard CSVs
(`companies.csv`, `career_pages.csv`, …) — anywhere under an import directory,
then run:

```bash
python3 scripts/import-company-intelligence.py \
  --import-dir ~/Downloads/Database \
  --out       supabase/company_intelligence_seed.sql \
  --report    supabase/import-report.json \
  --fixture   src/careers/test/fixtures/company-intelligence.json   # optional
```

Apply the generated seed to Supabase (single transaction — all-or-nothing):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/company_intelligence_seed.sql
# …or let the pipeline apply it directly:
DATABASE_URL=… python3 scripts/import-company-intelligence.py --import-dir … --apply
```

## What the pipeline guarantees

- **Batch auto-discovery** — every folder containing a `companies.csv` is picked
  up; add a batch by dropping a folder, no config edits.
- **Idempotent / incremental** — emits `insert … on conflict (pk) do update`,
  wrapped in `begin; … commit;`. Re-running updates existing rows and inserts
  only genuinely new ones. Safe to repeat.
- **Deterministic de-duplication**
  - same `company_id` twice → merged (a conflicting name is reported, first wins);
  - different ids, same normalized name → **alias-merged** into one canonical
    record. The duplicate's name is preserved as a `synonym` tag and all of its
    relations are re-pointed to the canonical id. **IDs are preserved, never
    re-indexed.**
- **Foreign-key validation** — every child `company_id` and every
  `company_sources.source_id` must resolve; orphans are dropped and counted.
- **Rollback on failure** — blocking issues (id conflicts / load errors) stop the
  seed from being written unless you pass `--force`; and the SQL transaction
  rolls the whole import back if any statement fails on apply.
- **Import report** — `supabase/import-report.json`: batches, canonical company
  count, duplicates merged, alias merges, id conflicts, FK orphans dropped,
  aliases added, per-table row counts.

## Why it stays fast at 10k+

- The client store (`services/companyIntelligence.ts`) **pages** through Supabase
  in 1,000-row chunks (`fetchAll`) — not bounded to any fixed size — then builds
  O(1) match indexes once and memoizes them for the session.
- Company matching (job-search enrichment) is O(1) map lookups per result.
- All search surfaces are **paginated** (`searchCompaniesPaged`,
  `searchByFacetPaged`) returning `{ results, total }`, so payloads and latency
  stay flat as the dataset grows.
- Reference tables are indexed on every searchable column
  (`careers_phase4_1_schema.sql`).

## Files

| File | Purpose |
|------|---------|
| `supabase/careers_phase4_1_schema.sql` | `ci_*` tables, indexes, RLS |
| `supabase/company_intelligence_seed.sql` | generated seed (idempotent) |
| `supabase/import-report.json` | generated import report |
| `scripts/import-company-intelligence.py` | the import pipeline |
| `scripts/build-company-intelligence.py` | original single-batch seed builder (superseded by the import pipeline) |
| `src/careers/services/companyIntelligence.ts` | in-memory store + paginated search |
| `src/careers/search/companyMatch.ts` | pure, deterministic matching engine |
