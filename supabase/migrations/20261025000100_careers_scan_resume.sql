-- careers-scan: read a board too big for one call as a pass over several runs.
--
-- A large Workday board (a whole country of a big employer) cannot be read inside one edge call, so each run used to
-- re-read the same first ~2,000 postings and never finished a scan: nothing it stopped listing was ever expired, and
-- postings past that point were never found. scan_pass holds the provider's cursor between runs; see
-- supabase/functions/careers-scan/run.ts (ScanPass). career_sources stays service-role only.
alter table public.career_sources add column if not exists scan_pass jsonb;

comment on column public.career_sources.scan_pass is
  'Pass in progress over a board too big for one careers-scan run: {started_on, cursor, lossy}. Null when none.';
