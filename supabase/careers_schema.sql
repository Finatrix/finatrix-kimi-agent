-- ============================================================================
-- FinatriX Careers — Phase 1 backend schema
-- Run once in your Supabase project: SQL Editor → New query → paste → Run.
-- Safe to re-run: every statement is idempotent.
--
-- Adds the Careers module tables (career profile, resumes + versions,
-- normalized resume entities, AI analysis cache, anonymous analytics and
-- AI usage metering) plus the private "resumes" Storage bucket. Every
-- user-owned table is protected by Row Level Security keyed to auth.uid(),
-- reusing the same auth model as tool_data in schema.sql.
--
-- Note: column names deliberately avoid PostgreSQL reserved words
-- (e.g. the user's current role is stored as "job_title", because
-- CURRENT_ROLE is a reserved SQL keyword).
-- ============================================================================

-- ───────────────────────── career_profiles ─────────────────────────
-- One permanent professional identity per user. Manual edits win over
-- AI suggestions: the AI only ever writes into "suggestions"; the app copies
-- a suggestion into a real column only when the user accepts it.
create table if not exists public.career_profiles (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  job_title           text not null default '',
  preferred_role      text not null default '',
  preferred_industry  text not null default '',
  years_experience    numeric,
  highest_qualification text not null default '',
  primary_skills      text[] not null default '{}',
  secondary_skills    text[] not null default '{}',
  location_preference text not null default '',
  employment_type     text not null default '',
  salary_expectation  text not null default '',
  notice_period       text not null default '',
  visa_status         text not null default '',
  work_rights         text not null default '',
  languages           text[] not null default '{}',
  -- Latest AI-generated Career DNA (traits, strengths, recommended roles…).
  career_dna          jsonb,
  -- AI-proposed profile field values awaiting user acceptance.
  suggestions         jsonb not null default '{}'::jsonb,
  -- Module settings (preferred AI model, OCR opt-in, analytics opt-out…).
  settings            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ───────────────────────── resumes ─────────────────────────
-- A "resume" is a named family (e.g. "Finance Resume"); its uploads live in
-- resume_versions. current_version_id points at the newest processed version.
create table if not exists public.resumes (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  name               text not null,
  industry           text not null default '',
  notes              text not null default '',
  is_favorite        boolean not null default false,
  is_archived        boolean not null default false,
  current_version_id uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists resumes_user_idx on public.resumes (user_id, updated_at desc);

-- ───────────────────────── resume_versions ─────────────────────────
-- One row per uploaded file. Original files are never overwritten: each
-- version stores its own unique storage path. "stage"/"status" make the
-- processing pipeline resumable — a failed version keeps its uploaded file
-- and restarts from the last completed stage.
create table if not exists public.resume_versions (
  id             uuid primary key default gen_random_uuid(),
  resume_id      uuid not null references public.resumes (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  version_number int not null default 1,
  file_name      text not null,
  file_path      text not null,
  file_size      bigint not null default 0,
  file_type      text not null default '',
  sha256         text not null default '',
  -- Pipeline state: uploaded → extracted → parsed → dna → scored → ats → complete | failed
  stage          text not null default 'uploaded',
  status         text not null default 'processing',
  error          text not null default '',
  extraction_method text not null default '',
  raw_text       text not null default '',
  parsed         jsonb,
  resume_score   int,
  score_breakdown jsonb,
  ats_score      int,
  ats_report     jsonb,
  career_dna     jsonb,
  parse_ms       int,
  ai_ms          int,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists resume_versions_resume_idx on public.resume_versions (resume_id, version_number desc);
create index if not exists resume_versions_user_idx on public.resume_versions (user_id, created_at desc);
create index if not exists resume_versions_sha_idx on public.resume_versions (user_id, sha256);

-- ───────────────── normalized resume entities ─────────────────
-- Structured rows extracted from the parsed resume, one set per version.
-- These power search/filtering and later phases (job matching) without
-- unpacking JSON client-side.
create table if not exists public.resume_skills (
  id         uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.resume_versions (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  category   text not null default 'technical',  -- technical|soft|tool|framework|language|business|leadership
  created_at timestamptz not null default now()
);
create index if not exists resume_skills_version_idx on public.resume_skills (version_id);
create index if not exists resume_skills_user_idx on public.resume_skills (user_id, name);

create table if not exists public.resume_experience (
  id          uuid primary key default gen_random_uuid(),
  version_id  uuid not null references public.resume_versions (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  company     text not null default '',
  title       text not null default '',
  location    text not null default '',
  start_date  text not null default '',
  end_date    text not null default '',
  is_current  boolean not null default false,
  summary     text not null default '',
  highlights  text[] not null default '{}',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists resume_experience_version_idx on public.resume_experience (version_id, sort_order);

create table if not exists public.resume_education (
  id          uuid primary key default gen_random_uuid(),
  version_id  uuid not null references public.resume_versions (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  institution text not null default '',
  degree      text not null default '',
  field       text not null default '',
  start_date  text not null default '',
  end_date    text not null default '',
  grade       text not null default '',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists resume_education_version_idx on public.resume_education (version_id, sort_order);

create table if not exists public.resume_projects (
  id          uuid primary key default gen_random_uuid(),
  version_id  uuid not null references public.resume_versions (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null default '',
  description text not null default '',
  technologies text[] not null default '{}',
  url         text not null default '',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists resume_projects_version_idx on public.resume_projects (version_id, sort_order);

create table if not exists public.resume_certifications (
  id          uuid primary key default gen_random_uuid(),
  version_id  uuid not null references public.resume_versions (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null default '',
  issuer      text not null default '',
  issue_date  text not null default '',
  expiry_date text not null default '',
  credential_id text not null default '',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists resume_certifications_version_idx on public.resume_certifications (version_id, sort_order);

-- ───────────────────────── resume_analysis ─────────────────────────
-- AI analysis cache + audit log. Keyed by (user, input hash, kind) so the
-- same file is never analysed twice — re-uploads reuse the cached result.
create table if not exists public.resume_analysis (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  version_id   uuid references public.resume_versions (id) on delete cascade,
  kind         text not null,                 -- parse | dna | score | ats
  input_sha256 text not null,
  model        text not null default '',
  result       jsonb not null,
  duration_ms  int,
  created_at   timestamptz not null default now()
);
create index if not exists resume_analysis_cache_idx on public.resume_analysis (user_id, input_sha256, kind, created_at desc);
create index if not exists resume_analysis_version_idx on public.resume_analysis (version_id);

-- ───────────────────────── careers_analytics ─────────────────────────
-- Anonymous product analytics. No user id, no resume content — only event
-- names and numeric measurements (upload counts, parse/AI durations, scores).
create table if not exists public.careers_analytics (
  id         uuid primary key default gen_random_uuid(),
  event      text not null,
  value      numeric,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ───────────────────────── careers_ai_usage ─────────────────────────
-- Per-user daily AI call metering, written by the careers-ai edge function
-- (service role). Keeps operating costs bounded.
create table if not exists public.careers_ai_usage (
  user_id  uuid not null references auth.users (id) on delete cascade,
  day      date not null default current_date,
  calls    int not null default 0,
  primary key (user_id, day)
);

-- ═════════════════════════ Row Level Security ═════════════════════════
alter table public.career_profiles      enable row level security;
alter table public.resumes              enable row level security;
alter table public.resume_versions      enable row level security;
alter table public.resume_skills        enable row level security;
alter table public.resume_experience    enable row level security;
alter table public.resume_education     enable row level security;
alter table public.resume_projects      enable row level security;
alter table public.resume_certifications enable row level security;
alter table public.resume_analysis      enable row level security;
alter table public.careers_analytics    enable row level security;
alter table public.careers_ai_usage     enable row level security;

-- Owner-only CRUD for every user-owned careers table.
do $$
declare
  t text;
begin
  foreach t in array array[
    'career_profiles','resumes','resume_versions','resume_skills',
    'resume_experience','resume_education','resume_projects',
    'resume_certifications','resume_analysis'
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

-- Analytics: signed-in users may record anonymous events (insert-only).
-- Reads are restricted to platform admins — the aggregate event stream is not
-- user-specific data, but restricting reads prevents non-admin users from
-- querying the full event history via the Supabase client.
drop policy if exists "careers_analytics_insert" on public.careers_analytics;
create policy "careers_analytics_insert"
  on public.careers_analytics for insert
  to authenticated
  with check (true);
drop policy if exists "careers_analytics_select" on public.careers_analytics;
create policy "careers_analytics_select"
  on public.careers_analytics for select
  to authenticated
  using (public.is_platform_admin(auth.uid()));

-- Add performance index for admin analytics queries.
create index if not exists careers_analytics_event_idx
  on public.careers_analytics (event, created_at desc);

-- AI usage: users can see their own meter; only the edge function
-- (service role, bypasses RLS) writes it.
drop policy if exists "careers_ai_usage_select_own" on public.careers_ai_usage;
create policy "careers_ai_usage_select_own"
  on public.careers_ai_usage for select
  using (auth.uid() = user_id);

-- ═════════════════════════ Storage: resumes bucket ═════════════════════════
-- Private bucket; files live under <user_id>/<uuid>.<ext> so the folder name
-- itself enforces ownership. 10 MB cap and resume MIME types only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes', 'resumes', false, 10485760,
  array['application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "resumes_storage_select_own" on storage.objects;
create policy "resumes_storage_select_own"
  on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "resumes_storage_insert_own" on storage.objects;
create policy "resumes_storage_insert_own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "resumes_storage_delete_own" on storage.objects;
create policy "resumes_storage_delete_own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

-- ═════════════════════════ housekeeping trigger ═════════════════════════
-- Keep updated_at fresh on the tables the app edits in place.
create or replace function public.careers_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists career_profiles_touch on public.career_profiles;
create trigger career_profiles_touch before update on public.career_profiles
  for each row execute function public.careers_touch_updated_at();

drop trigger if exists resumes_touch on public.resumes;
create trigger resumes_touch before update on public.resumes
  for each row execute function public.careers_touch_updated_at();

drop trigger if exists resume_versions_touch on public.resume_versions;
create trigger resume_versions_touch before update on public.resume_versions
  for each row execute function public.careers_touch_updated_at();
