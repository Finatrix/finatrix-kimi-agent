-- ============================================================================
-- FinatriX Careers — Phase 2 backend schema (Job Intelligence Platform)
-- Run AFTER careers_schema.sql: SQL Editor → New query → paste → Run.
-- Safe to re-run: every statement is idempotent.
--
-- Adds the job search / match / application / company / interview / coach
-- tables. Same conventions as Phase 1: user-owned rows guarded by RLS on
-- auth.uid(), no PostgreSQL reserved words as column names, jsonb for AI
-- payloads that the client validates on read and write.
-- ============================================================================

-- ───────────────────────── job_sources ─────────────────────────
-- Registry of job providers. Global read-only reference data; rows are
-- seeded here and managed by the operator, not by users.
create table if not exists public.job_sources (
  id           text primary key,              -- 'remotive' | 'adzuna' | 'jsearch' | 'jooble' | 'manual'
  name         text not null,
  kind         text not null default 'api',   -- api | aggregator | manual
  description  text not null default '',
  needs_secret text not null default '',      -- which edge-function secret enables it
  enabled      boolean not null default true,
  sort_order   int not null default 0
);

insert into public.job_sources (id, name, kind, description, needs_secret, sort_order) values
  ('manual',   'Paste / Upload JD', 'manual',     'Analyse any job description you paste or upload.', '', 0),
  ('remotive', 'Remotive',          'api',        'Remote jobs API (no key required).', '', 1),
  ('adzuna',   'Adzuna',            'aggregator', 'Aggregated listings incl. India (LinkedIn, company sites and more).', 'ADZUNA_APP_ID + ADZUNA_APP_KEY', 2),
  ('jsearch',  'JSearch',           'aggregator', 'Google-for-Jobs aggregation: LinkedIn, Indeed, Naukri, Glassdoor, Foundit and more.', 'RAPIDAPI_KEY', 3),
  ('jooble',   'Jooble',            'aggregator', 'Global job aggregation incl. Indian portals.', 'JOOBLE_KEY', 4)
on conflict (id) do update
  set name = excluded.name, kind = excluded.kind, description = excluded.description,
      needs_secret = excluded.needs_secret, sort_order = excluded.sort_order;

-- ───────────────────────── jobs ─────────────────────────
-- Normalized job records a user has fetched, saved or pasted. sha256 is the
-- content fingerprint used for dedupe + AI-analysis caching.
create table if not exists public.jobs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  source         text not null default 'manual',
  external_id    text not null default '',
  company        text not null default '',
  title          text not null default '',
  industry       text not null default '',
  description    text not null default '',
  responsibilities text[] not null default '{}',
  benefits       text[] not null default '{}',
  skills         text[] not null default '{}',
  salary_min     numeric,
  salary_max     numeric,
  currency       text not null default '',
  experience     text not null default '',
  education      text not null default '',
  location       text not null default '',
  country        text not null default '',
  work_mode      text not null default '',    -- remote | hybrid | onsite | ''
  employment_type text not null default '',
  visa_sponsorship text not null default '',  -- yes | no | unknown
  apply_url      text not null default '',
  posted_at      timestamptz,
  closes_at      timestamptz,
  is_saved       boolean not null default false,
  sha256         text not null default '',
  raw            jsonb,                        -- provider payload as received
  analysis       jsonb,                        -- validated AI job intelligence
  keywords       jsonb,                        -- validated ATS keyword tiers
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists jobs_user_idx on public.jobs (user_id, created_at desc);
create index if not exists jobs_user_sha_idx on public.jobs (user_id, sha256);
create index if not exists jobs_user_saved_idx on public.jobs (user_id, is_saved) where is_saved;

-- ───────────────────────── job_descriptions ─────────────────────────
-- Pasted/uploaded job descriptions analysed outside of a fetched listing.
create table if not exists public.job_descriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null default '',
  company    text not null default '',
  raw_text   text not null default '',
  sha256     text not null default '',
  analysis   jsonb,
  keywords   jsonb,
  job_id     uuid references public.jobs (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists job_descriptions_user_idx on public.job_descriptions (user_id, created_at desc);
create index if not exists job_descriptions_sha_idx on public.job_descriptions (user_id, sha256);

-- ───────────────────────── job_skills / job_keywords ─────────────────────────
-- Normalized rows extracted from AI job analysis (search + gap queries).
create table if not exists public.job_skills (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  job_id     uuid references public.jobs (id) on delete cascade,
  description_id uuid references public.job_descriptions (id) on delete cascade,
  name       text not null,
  category   text not null default 'technical',
  required   boolean not null default true,
  weight     int not null default 50,
  created_at timestamptz not null default now()
);
create index if not exists job_skills_job_idx on public.job_skills (job_id);
create index if not exists job_skills_user_idx on public.job_skills (user_id, name);

create table if not exists public.job_keywords (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  job_id     uuid references public.jobs (id) on delete cascade,
  description_id uuid references public.job_descriptions (id) on delete cascade,
  keyword    text not null,
  tier       text not null default 'primary', -- primary|secondary|hidden|industry|recruiter|role
  weight     int not null default 50,
  frequency  int not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists job_keywords_job_idx on public.job_keywords (job_id);

-- ───────────────────────── job_matches ─────────────────────────
-- Resume ↔ job match reports. input_sha256 keys the cache: same resume text
-- + same job content = same report, never recomputed.
create table if not exists public.job_matches (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  job_id            uuid references public.jobs (id) on delete cascade,
  description_id    uuid references public.job_descriptions (id) on delete cascade,
  resume_version_id uuid references public.resume_versions (id) on delete cascade,
  overall           int not null default 0,
  scores            jsonb not null default '{}'::jsonb,   -- per-category 0–100
  insights          jsonb not null default '{}'::jsonb,   -- strengths/gaps/recommendations
  input_sha256      text not null default '',
  created_at        timestamptz not null default now()
);
create index if not exists job_matches_user_idx on public.job_matches (user_id, created_at desc);
create index if not exists job_matches_cache_idx on public.job_matches (user_id, input_sha256);
create index if not exists job_matches_job_idx on public.job_matches (job_id);

-- ───────────────────────── companies ─────────────────────────
create table if not exists public.companies (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  industry      text not null default '',
  headquarters  text not null default '',
  locations     text[] not null default '{}',
  company_size  text not null default '',
  founded_year  int,
  website       text not null default '',
  linkedin_url  text not null default '',
  glassdoor_rating numeric,
  ambitionbox_rating numeric,
  funding_stage text not null default '',
  revenue_range text not null default '',
  visa_history  text not null default '',
  graduate_hiring boolean,
  internship_hiring boolean,
  preferred_skills text[] not null default '{}',
  notes         text not null default '',
  ai_summary    jsonb,                        -- validated AI company insights
  sha256        text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists companies_user_idx on public.companies (user_id, name);
create index if not exists companies_industry_idx on public.companies (user_id, industry);

create table if not exists public.company_reviews (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  rating     int not null default 3,          -- 1–5, the user's own assessment
  culture    text not null default '',
  interview_difficulty text not null default '',
  work_life_balance text not null default '',
  body       text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists company_reviews_company_idx on public.company_reviews (company_id);

create table if not exists public.company_contacts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  company_id   uuid references public.companies (id) on delete set null,
  name         text not null,
  email        text not null default '',
  linkedin_url text not null default '',
  position     text not null default '',
  notes        text not null default '',
  follow_up_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists company_contacts_user_idx on public.company_contacts (user_id, name);

-- ───────────────────────── applications ─────────────────────────
-- The career CRM row. Stage transitions are appended to application_history.
create table if not exists public.applications (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  job_id            uuid references public.jobs (id) on delete set null,
  company_id        uuid references public.companies (id) on delete set null,
  contact_id        uuid references public.company_contacts (id) on delete set null,
  resume_version_id uuid references public.resume_versions (id) on delete set null,
  cover_letter_id   uuid,                     -- FK added after cover_letters exists
  company_name      text not null default '',
  job_title         text not null default '',
  department        text not null default '',
  salary_text       text not null default '',
  employment_type   text not null default '',
  location          text not null default '',
  work_mode         text not null default '',
  visa_sponsorship  text not null default '',
  source            text not null default '',
  job_url           text not null default '',
  stage             text not null default 'saved',
  priority          text not null default 'medium',  -- low | medium | high
  tags              text[] not null default '{}',
  notes             text not null default '',
  match_score       int,
  ats_score         int,
  applied_at        timestamptz,
  closes_at         timestamptz,
  interview_at      timestamptz,
  offer_expires_at  timestamptz,
  next_action_at    timestamptz,
  archived          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists applications_user_idx on public.applications (user_id, updated_at desc);
create index if not exists applications_stage_idx on public.applications (user_id, stage);

-- ───────────────────────── application_history ─────────────────────────
-- Immutable timeline. RLS below grants SELECT and INSERT only — no UPDATE
-- or DELETE policy exists, so history can never be rewritten by the client.
create table if not exists public.application_history (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  event          text not null,               -- created | stage_change | note | reminder | …
  from_stage     text not null default '',
  to_stage       text not null default '',
  body           text not null default '',
  meta           jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists application_history_app_idx on public.application_history (application_id, created_at);

-- ───────────────────────── cover_letters ─────────────────────────
create table if not exists public.cover_letters (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  application_id    uuid references public.applications (id) on delete set null,
  job_id            uuid references public.jobs (id) on delete set null,
  resume_version_id uuid references public.resume_versions (id) on delete set null,
  name              text not null default 'Cover letter',
  company           text not null default '',
  job_title         text not null default '',
  tone              text not null default 'professional',
  sections          jsonb not null default '{}'::jsonb,  -- opening/body/closing…
  content_text      text not null default '',            -- flattened, user-edited
  match_score       int,
  archived          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists cover_letters_user_idx on public.cover_letters (user_id, updated_at desc);

-- Late FK: applications.cover_letter_id → cover_letters.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'applications_cover_letter_fk'
  ) then
    alter table public.applications
      add constraint applications_cover_letter_fk
      foreign key (cover_letter_id) references public.cover_letters (id) on delete set null;
  end if;
end $$;

-- ───────────────────────── interview_sessions ─────────────────────────
create table if not exists public.interview_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  application_id uuid references public.applications (id) on delete set null,
  job_id         uuid references public.jobs (id) on delete set null,
  kind           text not null default 'prep',   -- prep | mock
  role_title     text not null default '',
  difficulty     text not null default 'medium',
  questions      jsonb not null default '[]'::jsonb,
  answers        jsonb not null default '[]'::jsonb,   -- user answers + STAR drafts
  feedback       jsonb,                                 -- validated AI feedback
  score          int,
  started_at     timestamptz not null default now(),
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists interview_sessions_user_idx on public.interview_sessions (user_id, created_at desc);

-- ───────────────────────── career coach ─────────────────────────
create table if not exists public.career_recommendations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null,                   -- roadmap | learning | certification | insight
  title      text not null default '',
  content    jsonb not null default '{}'::jsonb,
  priority   text not null default 'medium',
  status     text not null default 'active',  -- active | done | dismissed
  input_sha256 text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists career_recommendations_user_idx on public.career_recommendations (user_id, kind, status);

create table if not exists public.learning_paths (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null,
  target_role text not null default '',
  items       jsonb not null default '[]'::jsonb,  -- [{name, kind, difficulty, hours, priority, done}]
  progress    int not null default 0,              -- 0–100, derived from items
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists learning_paths_user_idx on public.learning_paths (user_id, updated_at desc);

-- ───────────────────────── search, notifications, alerts ─────────────────────────
create table if not exists public.saved_searches (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  params        jsonb not null default '{}'::jsonb,
  alert_enabled boolean not null default false,
  last_run_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists saved_searches_user_idx on public.saved_searches (user_id, created_at desc);

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null default 'info',    -- job_match | deadline | interview | offer | coach | info
  title      text not null,
  body       text not null default '',
  link       text not null default '',
  dedupe_key text not null default '',        -- prevents re-notifying the same event
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, read, created_at desc);
create unique index if not exists notifications_dedupe_idx
  on public.notifications (user_id, dedupe_key) where dedupe_key <> '';

create table if not exists public.alerts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null,                   -- new_jobs | deadline | interview | offer_expiry | coach
  enabled    boolean not null default true,
  config     jsonb not null default '{}'::jsonb,  -- thresholds, lead times, channels
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists alerts_user_idx on public.alerts (user_id, kind);

-- ───────────────────────── feature flags ─────────────────────────
-- Premium/entitlement architecture: global flags, readable by everyone,
-- writable only by the operator. Everything ships unlocked.
create table if not exists public.careers_feature_flags (
  flag       text primary key,
  enabled    boolean not null default true,
  free_limit int,                             -- null = unlimited on the free plan
  notes      text not null default ''
);
insert into public.careers_feature_flags (flag, enabled, free_limit, notes) values
  ('resume_versions',     true, null, 'Future: cap per plan'),
  ('ai_analyses',         true, null, 'Future: cap per plan'),
  ('cover_letters',       true, null, 'Future: cap per plan'),
  ('interview_sessions',  true, null, 'Future: cap per plan'),
  ('job_searches',        true, null, 'Future: cap per plan'),
  ('job_tracking',        true, null, 'Future: cap per plan'),
  ('company_intelligence',true, null, 'Future: cap per plan'),
  ('ai_coaching',         true, null, 'Future: cap per plan')
on conflict (flag) do nothing;

-- ═════════════════════════ Row Level Security ═════════════════════════
alter table public.job_sources            enable row level security;
alter table public.jobs                   enable row level security;
alter table public.job_descriptions       enable row level security;
alter table public.job_skills             enable row level security;
alter table public.job_keywords           enable row level security;
alter table public.job_matches            enable row level security;
alter table public.companies              enable row level security;
alter table public.company_reviews        enable row level security;
alter table public.company_contacts       enable row level security;
alter table public.applications           enable row level security;
alter table public.application_history    enable row level security;
alter table public.cover_letters          enable row level security;
alter table public.interview_sessions     enable row level security;
alter table public.career_recommendations enable row level security;
alter table public.learning_paths         enable row level security;
alter table public.saved_searches         enable row level security;
alter table public.notifications          enable row level security;
alter table public.alerts                 enable row level security;
alter table public.careers_feature_flags  enable row level security;

-- Owner-only CRUD for the user-owned Phase 2 tables.
do $$
declare
  t text;
begin
  foreach t in array array[
    'jobs','job_descriptions','job_skills','job_keywords','job_matches',
    'companies','company_reviews','company_contacts','applications',
    'cover_letters','interview_sessions','career_recommendations',
    'learning_paths','saved_searches','notifications','alerts'
  ]
  loop
    execute format('drop policy if exists "%s_select_own" on public.%I', t, t);
    execute format(
      'create policy "%s_select_own" on public.%I for select using (auth.uid() = user_id)', t, t);
    execute format('drop policy if exists "%s_insert_own" on public.%I', t, t);
    execute format(
      'create policy "%s_insert_own" on public.%I for insert with check (auth.uid() = user_id)', t, t);
    execute format('drop policy if exists "%s_update_own" on public.%I', t, t);
    execute format(
      'create policy "%s_update_own" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
    execute format('drop policy if exists "%s_delete_own" on public.%I', t, t);
    execute format(
      'create policy "%s_delete_own" on public.%I for delete using (auth.uid() = user_id)', t, t);
  end loop;
end $$;

-- application_history is immutable: select + insert only, never update/delete.
drop policy if exists "application_history_select_own" on public.application_history;
create policy "application_history_select_own"
  on public.application_history for select using (auth.uid() = user_id);
drop policy if exists "application_history_insert_own" on public.application_history;
create policy "application_history_insert_own"
  on public.application_history for insert with check (auth.uid() = user_id);

-- Reference tables: read-only for signed-in users.
drop policy if exists "job_sources_select" on public.job_sources;
create policy "job_sources_select"
  on public.job_sources for select to authenticated using (true);
drop policy if exists "careers_feature_flags_select" on public.careers_feature_flags;
create policy "careers_feature_flags_select"
  on public.careers_feature_flags for select to authenticated using (true);

-- ═════════════════════════ housekeeping triggers ═════════════════════════
-- Reuses careers_touch_updated_at() from careers_schema.sql.
do $$
declare
  t text;
begin
  foreach t in array array[
    'jobs','companies','company_contacts','applications','cover_letters',
    'interview_sessions','career_recommendations','learning_paths','alerts'
  ]
  loop
    execute format('drop trigger if exists %s_touch on public.%I', t, t);
    execute format(
      'create trigger %s_touch before update on public.%I for each row execute function public.careers_touch_updated_at()', t, t);
  end loop;
end $$;
