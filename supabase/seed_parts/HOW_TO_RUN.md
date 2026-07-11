# Loading the Company Intelligence seed

The full `company_intelligence_seed.sql` (~7 MB, 22.9k lines) exceeds the Supabase
**web SQL Editor** size cap — that's the only reason it failed. The data and schema
are fine. Pick either option below.

## Option A — Direct connection (easiest, no size limit) ✅ recommended

The error message itself links "connecting to your database directly". Or:

1. Supabase Dashboard → **Connect** (top bar) → **Session pooler** → copy the URI.
2. In a terminal:
   ```bash
   # schema first (only needed once)
   psql "postgresql://postgres.<ref>:<password>@<host>:5432/postgres" \
     -v ON_ERROR_STOP=1 -f supabase/careers_phase4_1_schema.sql
   # then the whole seed in one go — no size limit over a direct connection
   psql "postgresql://postgres.<ref>:<password>@<host>:5432/postgres" \
     -v ON_ERROR_STOP=1 -f supabase/company_intelligence_seed.sql
   ```

That's it — one command loads all 804 companies + relations.

## Option B — Web SQL Editor, in parts (no terminal needed)

Run these **in numeric order** (each is a self-contained transaction, safe to re-run):

1. First run `supabase/careers_phase4_1_schema.sql` (small — creates the tables).
2. Then paste and Run `seed_part_01.sql`, then `seed_part_02.sql`, … through `seed_part_17.sql`.

Order matters only in that **part 01 must run before the rest** (it loads the parent
`ci_companies` + `ci_opportunity_sources` rows that the later parts reference). Parts
02–17 can otherwise run in any order. Every statement is an idempotent upsert
(`on conflict … do update`), so re-running a part never duplicates or corrupts data.

After loading, verify:
```sql
select count(*) from public.ci_companies;              -- 804
select count(*) from public.ci_company_functions;      -- 6986
```
