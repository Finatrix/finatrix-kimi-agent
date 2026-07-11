-- ════════════════════════════════════════════════════════════════════════
-- FinatriX Careers — Phase 4.1: Company Intelligence Search Expansion
--
-- Global, read-only reference metadata that ENRICHES existing job search.
-- These tables never hold live jobs; they are structured company intelligence
-- (804 companies + relations) matched onto results from the existing engine.
--
-- Design notes
--   • Prefixed `ci_` so nothing collides with the per-user `public.companies`
--     table (Phase 2). No existing model is duplicated or altered.
--   • company_id is the persistent business key ("CMP-00001"); every relation
--     references it. No array-index relationships anywhere.
--   • Reference tables are world-readable to authenticated users (mirrors the
--     `job_sources` precedent). Per-user tables (saved / recent) are RLS-scoped.
--   • Idempotent: safe to re-run. Seed data lives in
--     company_intelligence_seed.sql (generated).
-- ════════════════════════════════════════════════════════════════════════

-- ───────────────────────── reference: companies ─────────────────────────
create table if not exists public.ci_companies (
  company_id            text primary key,
  company_name          text not null,
  name_normalized       text not null default '',
  country_code          text not null default '',
  industry              text not null default '',
  sector                text not null default '',
  sub_sector            text not null default '',
  hq_city               text not null default '',
  hq_state              text not null default '',
  hq_country            text not null default '',
  official_website      text not null default '',
  company_size_band     text not null default '',
  ownership_type        text not null default '',
  listed_exchange       text not null default '',
  market_cap_category   text not null default '',
  freshers_friendly     boolean,
  graduate_friendly     boolean,
  intern_friendly       boolean,
  experienced_hiring    boolean,
  visa_sponsorship      text not null default '',
  work_modes            text not null default '',
  hiring_frequency      text not null default '',
  notice_period_preference text not null default '',
  hiring_confidence_score int,
  priority_tier         int,
  confidence_level      text not null default '',
  verification_status   text not null default '',
  last_verified_date    date,
  data_source           text not null default '',
  needs_review          boolean,
  notes                 text not null default ''
);
create index if not exists ci_companies_name_norm_idx on public.ci_companies (name_normalized);
create index if not exists ci_companies_industry_idx  on public.ci_companies (industry);
create index if not exists ci_companies_sector_idx    on public.ci_companies (sector);
create index if not exists ci_companies_hqcity_idx    on public.ci_companies (hq_city);
create index if not exists ci_companies_grad_idx      on public.ci_companies (graduate_friendly);
create index if not exists ci_companies_intern_idx    on public.ci_companies (intern_friendly);

-- ───────────────────────── reference: career pages ─────────────────────────
create table if not exists public.ci_career_pages (
  page_id          text primary key,
  company_id       text not null references public.ci_companies (company_id) on delete cascade,
  page_type        text not null default '',
  url              text not null default '',
  url_status       text not null default '',
  confidence_level text not null default '',
  source           text not null default ''
);
create index if not exists ci_career_pages_company_idx on public.ci_career_pages (company_id);

-- ───────────────────────── reference: graduate programs ─────────────────────────
create table if not exists public.ci_graduate_programs (
  program_id       text primary key,
  company_id       text not null references public.ci_companies (company_id) on delete cascade,
  program_name     text not null default '',
  program_type     text not null default '',
  program_url      text not null default '',
  is_generic_record boolean,
  confidence_level text not null default ''
);
create index if not exists ci_grad_company_idx on public.ci_graduate_programs (company_id);
create index if not exists ci_grad_type_idx    on public.ci_graduate_programs (program_type);

-- ───────────────────────── reference: internships ─────────────────────────
create table if not exists public.ci_internships (
  internship_id    text primary key,
  company_id       text not null references public.ci_companies (company_id) on delete cascade,
  internship_type  text not null default '',
  typical_season   text not null default '',
  internship_url   text not null default '',
  confidence_level text not null default ''
);
create index if not exists ci_intern_company_idx on public.ci_internships (company_id);
create index if not exists ci_intern_type_idx    on public.ci_internships (internship_type);

-- ───────────────────────── reference: ATS platforms ─────────────────────────
create table if not exists public.ci_ats_platforms (
  ats_record_id        text primary key,
  company_id           text not null references public.ci_companies (company_id) on delete cascade,
  detected_ats         text not null default '',
  detection_confidence text not null default '',
  detection_method     text not null default '',
  detected_url         text not null default '',
  last_checked         date
);
create index if not exists ci_ats_company_idx on public.ci_ats_platforms (company_id);
create index if not exists ci_ats_platform_idx on public.ci_ats_platforms (detected_ats);

-- ───────────────────────── reference: locations ─────────────────────────
create table if not exists public.ci_company_locations (
  location_id     text primary key,
  company_id      text not null references public.ci_companies (company_id) on delete cascade,
  city            text not null default '',
  state_region    text not null default '',
  country_code    text not null default '',
  is_headquarters boolean
);
create index if not exists ci_loc_company_idx on public.ci_company_locations (company_id);
create index if not exists ci_loc_city_idx    on public.ci_company_locations (city);

-- ───────────────────────── reference: functions (departments) ─────────────────────────
create table if not exists public.ci_company_functions (
  function_id      text primary key,
  company_id       text not null references public.ci_companies (company_id) on delete cascade,
  function_name    text not null default '',
  hiring_active    text not null default '',
  confidence_level text not null default ''
);
create index if not exists ci_fn_company_idx on public.ci_company_functions (company_id);
create index if not exists ci_fn_name_idx    on public.ci_company_functions (function_name);

-- ───────────────────────── reference: tags (incl. synonyms/aliases) ─────────────────────────
create table if not exists public.ci_company_tags (
  tag_id     text primary key,
  company_id text not null references public.ci_companies (company_id) on delete cascade,
  tag_type   text not null default '',
  tag_value  text not null default ''
);
create index if not exists ci_tag_company_idx on public.ci_company_tags (company_id);
create index if not exists ci_tag_type_idx    on public.ci_company_tags (tag_type);
create index if not exists ci_tag_value_idx    on public.ci_company_tags (tag_value);

-- ───────────────────────── reference: opportunity sources (dimension) ─────────────────────────
create table if not exists public.ci_opportunity_sources (
  source_id        text primary key,
  source_name      text not null default '',
  source_type      text not null default '',
  coverage_country text not null default '',
  website_url      text not null default '',
  notes            text not null default '',
  data_source      text not null default ''
);

-- ───────────────────────── reference: company ↔ source links ─────────────────────────
create table if not exists public.ci_company_sources (
  link_id          text primary key,
  company_id       text not null references public.ci_companies (company_id) on delete cascade,
  source_id        text not null references public.ci_opportunity_sources (source_id) on delete cascade,
  presence         text not null default '',
  listing_url      text not null default '',
  confidence_level text not null default ''
);
create index if not exists ci_compsrc_company_idx on public.ci_company_sources (company_id);
create index if not exists ci_compsrc_source_idx  on public.ci_company_sources (source_id);

-- ───────────────────────── reference: salary intelligence ─────────────────────────
create table if not exists public.ci_salary_intelligence (
  salary_id        text primary key,
  company_id       text not null references public.ci_companies (company_id) on delete cascade,
  role_family      text not null default '',
  experience_level text not null default '',
  currency         text not null default '',
  min_annual       int,
  max_annual       int,
  unit             text not null default '',
  basis            text not null default '',
  confidence_level text not null default ''
);
create index if not exists ci_salary_company_idx on public.ci_salary_intelligence (company_id);

-- ───────────────────────── per-user: saved / favourite companies ─────────────────────────
create table if not exists public.ci_saved_companies (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  company_id text not null references public.ci_companies (company_id) on delete cascade,
  favourite  boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, company_id)
);
create index if not exists ci_saved_user_idx on public.ci_saved_companies (user_id, created_at desc);

-- ───────────────────────── per-user: recently viewed companies ─────────────────────────
create table if not exists public.ci_recent_companies (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  company_id text not null references public.ci_companies (company_id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  unique (user_id, company_id)
);
create index if not exists ci_recent_user_idx on public.ci_recent_companies (user_id, viewed_at desc);

-- ════════════════════════════════ RLS ════════════════════════════════
alter table public.ci_companies            enable row level security;
alter table public.ci_career_pages         enable row level security;
alter table public.ci_graduate_programs    enable row level security;
alter table public.ci_internships          enable row level security;
alter table public.ci_ats_platforms        enable row level security;
alter table public.ci_company_locations    enable row level security;
alter table public.ci_company_functions    enable row level security;
alter table public.ci_company_tags         enable row level security;
alter table public.ci_opportunity_sources  enable row level security;
alter table public.ci_company_sources      enable row level security;
alter table public.ci_salary_intelligence  enable row level security;
alter table public.ci_saved_companies      enable row level security;
alter table public.ci_recent_companies     enable row level security;

-- Reference tables: world-readable to signed-in users (mirrors job_sources).
do $$
declare t text;
begin
  foreach t in array array[
    'ci_companies','ci_career_pages','ci_graduate_programs','ci_internships',
    'ci_ats_platforms','ci_company_locations','ci_company_functions',
    'ci_company_tags','ci_opportunity_sources','ci_company_sources',
    'ci_salary_intelligence'
  ] loop
    execute format('drop policy if exists "%s_select" on public.%I', t, t);
    execute format('create policy "%s_select" on public.%I for select to authenticated using (true)', t, t);
  end loop;
end $$;

-- Per-user tables: owner-scoped full access.
do $$
declare t text;
begin
  foreach t in array array['ci_saved_companies','ci_recent_companies'] loop
    execute format('drop policy if exists "%s_all_own" on public.%I', t, t);
    execute format('create policy "%s_all_own" on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
  end loop;
end $$;
