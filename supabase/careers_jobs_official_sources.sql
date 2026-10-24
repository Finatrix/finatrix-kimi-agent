-- ============================================================================
-- FinatriX Careers — official national job boards (USAJOBS, Reed)
-- Run AFTER careers_phase2_schema.sql: SQL Editor → New query → paste → Run.
-- Safe to re-run: the insert upserts on id.
--
-- Registers the two query-driven official APIs served by the careers-jobs
-- edge function. Each is country-scoped (USAJOBS → US, Reed → UK) and stays
-- inactive until its secrets are set with `npx supabase secrets set`.
-- ============================================================================

insert into public.job_sources (id, name, kind, description, needs_secret, sort_order) values
  ('usajobs', 'USAJOBS', 'api', 'Official US federal government job board (US searches only).', 'USAJOBS_API_KEY + USAJOBS_EMAIL', 5),
  ('reed',    'Reed',    'api', 'Official Reed.co.uk jobs API (UK searches only).', 'REED_API_KEY', 6)
on conflict (id) do update
  set name = excluded.name, kind = excluded.kind, description = excluded.description,
      needs_secret = excluded.needs_secret, sort_order = excluded.sort_order;
