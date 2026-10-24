-- FinatriX Careers engine: direct-from-employer postings for US, UK, India, Australia and New Zealand.
--
-- Adapted from @finatrix/careers-engine db/001_finatrix_careers.sql (shared tables only). The package's
-- per-user tables are deliberately NOT created: applications, their history and interviews already live in
-- public.applications / public.application_history / public.interview_sessions, and later phases reuse them.
--
-- Access model
--   career_postings      signed-in users may read active postings; only the service role writes.
--   career_sources       service role only (the employer registry the scanner works through).
--   posting_events,
--   scan_runs,
--   scan_run_employers   service role only (operational history).
-- No views are created, so there is nothing that could run with its owner's rights over RLS.
--
-- Idempotent: safe to re-run.

begin;

-- ── employers to scan ───────────────────────────────────────────────────────────────────────────────
-- Official sources only: each row is an employer's own applicant-tracking board. Unknown stays NULL.
create table if not exists public.career_sources (
  id                  uuid primary key default gen_random_uuid(),
  registry_company_id text,
  name                text not null,
  provider            text,
  careers_url         text not null,
  api_url             text,
  markets             text[] not null default '{}',
  enabled             boolean not null default true,
  options             jsonb not null default '{}'::jsonb,
  verified_on         date,
  last_scanned_at     timestamptz,
  last_status         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint career_sources_provider_chk check (provider is null or provider ~ '^[a-z0-9_-]{2,40}$'),
  constraint career_sources_https_chk check (careers_url ~ '^https://'),
  constraint career_sources_markets_chk check (markets <@ array['us','gb','in','au','nz']::text[] and cardinality(markets) > 0)
);
create unique index if not exists career_sources_url_uidx on public.career_sources (careers_url);
create index if not exists career_sources_due_idx on public.career_sources (last_scanned_at nulls first) where enabled;

-- ── postings ────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.career_postings (
  id                  uuid primary key default gen_random_uuid(),
  source_id           uuid references public.career_sources (id) on delete set null,
  listing_key         text,
  posting_key         text not null,
  company_key         text not null,
  company             text not null,
  title               text not null,
  location            text not null default '',
  url                 text not null,
  requisition_id      text,
  fingerprint         text not null default '',
  source              text,
  first_seen          date not null,
  last_seen           date not null,
  status              text not null default 'active' check (status in ('active','expired','uncertain')),
  repost_of           uuid references public.career_postings (id) on delete set null,
  aggregator          boolean not null default false,
  posted_at           timestamptz,
  -- What the market layer read from the posting. Every field is NULL/empty when the posting does not say.
  countries           text[] not null default '{}',
  region              text,
  city                text,
  workplace_type      text check (workplace_type is null or workplace_type in ('remote','hybrid','onsite')),
  employment_type     text,
  salary_min          numeric check (salary_min is null or salary_min > 0),
  salary_max          numeric check (salary_max is null or salary_max > 0),
  salary_currency     text,
  salary_period       text check (salary_period is null or salary_period in ('hour','day','week','month','year')),
  salary_contribution text,
  work_rights         jsonb,
  summary             text not null default '',
  search              tsvector generated always as (
                        to_tsvector('english', title || ' ' || company || ' ' || location || ' ' || summary)
                      ) stored,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint career_postings_dates_chk check (last_seen >= first_seen),
  constraint career_postings_salary_chk check (salary_min is null or salary_max is null or salary_min <= salary_max),
  constraint career_postings_countries_chk check (countries <@ array['US','GB','IN','AU','NZ']::text[])
);
create unique index if not exists career_postings_posting_key_uidx on public.career_postings (posting_key);
create unique index if not exists career_postings_listing_key_uidx on public.career_postings (listing_key) where listing_key is not null;
create index if not exists career_postings_company_seen_idx on public.career_postings (company_key, first_seen desc);
create index if not exists career_postings_fingerprint_seen_idx on public.career_postings (first_seen desc) where fingerprint <> '';
create index if not exists career_postings_status_idx on public.career_postings (status, last_seen desc);
create index if not exists career_postings_countries_idx on public.career_postings using gin (countries);
create index if not exists career_postings_search_idx on public.career_postings using gin (search);
create index if not exists career_postings_source_idx on public.career_postings (source_id, last_seen desc);

create table if not exists public.posting_events (
  id         bigint generated always as identity primary key,
  posting_id uuid not null references public.career_postings (id) on delete cascade,
  type       text not null check (type in ('added','seen','reactivated','expired','repost','variant')),
  at         date not null,
  detail     text,
  created_at timestamptz not null default now()
);
create index if not exists posting_events_posting_idx on public.posting_events (posting_id, at desc);

-- ── scan history: what was fetched, what failed, what was cut short ────────────────────────────────
create table if not exists public.scan_runs (
  id           uuid primary key default gen_random_uuid(),
  started_at   timestamptz not null,
  finished_at  timestamptz,
  employers    integer not null default 0 check (employers >= 0),
  jobs_kept    integer not null default 0 check (jobs_kept >= 0),
  notes        text
);
create index if not exists scan_runs_started_idx on public.scan_runs (started_at desc);

create table if not exists public.scan_run_employers (
  id                   bigint generated always as identity primary key,
  run_id               uuid not null references public.scan_runs (id) on delete cascade,
  source_id            uuid references public.career_sources (id) on delete set null,
  employer             text not null,
  provider             text,
  status               text not null check (status in ('ok','truncated','error','no-provider')),
  fetched              integer not null default 0,
  kept                 integer not null default 0,
  in_market            integer not null default 0,
  dropped_by_title     integer not null default 0,
  duplicates_in_scan   integer not null default 0,
  truncation_reason    text,
  truncation_transient boolean,
  error                text,
  duration_ms          integer not null default 0
);
create index if not exists scan_run_employers_run_idx on public.scan_run_employers (run_id);
create index if not exists scan_run_employers_source_idx on public.scan_run_employers (source_id, run_id);

-- ── updated_at maintenance ─────────────────────────────────────────────────────────────────────────
create or replace function public.career_engine_touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists career_sources_touch on public.career_sources;
create trigger career_sources_touch before update on public.career_sources
  for each row execute function public.career_engine_touch_updated_at();
drop trigger if exists career_postings_touch on public.career_postings;
create trigger career_postings_touch before update on public.career_postings
  for each row execute function public.career_engine_touch_updated_at();

-- ── row level security ──────────────────────────────────────────────────────────────────────────────
alter table public.career_sources     enable row level security;
alter table public.career_postings    enable row level security;
alter table public.posting_events     enable row level security;
alter table public.scan_runs          enable row level security;
alter table public.scan_run_employers enable row level security;

-- Only one policy exists: signed-in users read active postings. Every other table has no policy, so only the
-- service role (which bypasses RLS) can touch it.
drop policy if exists career_postings_read on public.career_postings;
create policy career_postings_read on public.career_postings
  for select to authenticated using (status = 'active');

revoke all on public.career_sources, public.posting_events, public.scan_runs, public.scan_run_employers from anon, authenticated;
revoke all on public.career_postings from anon;
revoke insert, update, delete, truncate on public.career_postings from authenticated;
grant select on public.career_postings to authenticated;

-- ── search ──────────────────────────────────────────────────────────────────────────────────────────
-- Runs as the caller (no SECURITY DEFINER), so the RLS policy above still applies.
create or replace function public.search_career_postings(
  p_query   text    default null,
  p_country text    default null,
  p_city    text    default null,
  p_remote  boolean default null,
  p_limit   integer default 50,
  p_offset  integer default 0
)
returns table (
  job_id              uuid,
  title               text,
  company             text,
  location            text,
  city                text,
  region              text,
  countries           text[],
  workplace_type      text,
  employment_type     text,
  salary_min          numeric,
  salary_max          numeric,
  salary_currency     text,
  salary_period       text,
  salary_contribution text,
  work_rights         jsonb,
  summary             text,
  source              text,
  url                 text,
  posted_at           timestamptz,
  first_seen          date,
  relevance           real
)
language sql stable
set search_path = public
as $$
  with q as (
    select case when nullif(trim(p_query), '') is null then null
                else websearch_to_tsquery('english', p_query) end as tsq
  )
  select p.id, p.title, p.company, p.location, p.city, p.region, p.countries, p.workplace_type, p.employment_type,
         p.salary_min, p.salary_max, p.salary_currency, p.salary_period, p.salary_contribution, p.work_rights,
         p.summary, p.source, p.url, p.posted_at, p.first_seen,
         case when q.tsq is null then 0::real else ts_rank(p.search, q.tsq) end as relevance
    from public.career_postings p, q
   where p.status = 'active'
     and p.last_seen >= current_date - 14
     and (q.tsq is null or p.search @@ q.tsq)
     and (nullif(trim(p_country), '') is null or upper(trim(p_country)) = any (p.countries))
     and (nullif(trim(p_city), '') is null
          or position(lower(trim(p_city)) in lower(p.location)) > 0
          or lower(coalesce(p.city, '')) = lower(trim(p_city)))
     and (p_remote is not true or p.workplace_type = 'remote')
   order by relevance desc, p.posted_at desc nulls last, p.first_seen desc
   limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset least(greatest(coalesce(p_offset, 0), 0), 1000);
$$;

revoke all on function public.search_career_postings(text, text, text, boolean, integer, integer) from public, anon;
grant execute on function public.search_career_postings(text, text, text, boolean, integer, integer) to authenticated;

commit;
