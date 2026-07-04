-- FinatriX Careers — Phase 3: AI Application Intelligence Engine.
--
-- Run AFTER careers_schema.sql and careers_phase2_schema.sql. Adds the
-- storage Phase 3 modules need that Phase 1/2 didn't already cover.
-- Reused as-is from Phase 2: applications, application_history,
-- cover_letters, interview_sessions, notifications, companies,
-- company_contacts, career_recommendations.

-- ───────────────────────── tasks (Module 14) ─────────────────────────
create table if not exists public.tasks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  application_id uuid references public.applications (id) on delete cascade,
  title          text not null default '',
  detail         text not null default '',
  kind           text not null default 'general',  -- apply | email | interview_prep | research | star_practice | assessment | follow_up | general
  status         text not null default 'open',     -- open | done | dismissed
  priority       text not null default 'medium',   -- low | medium | high
  due_at         timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists tasks_user_idx on public.tasks (user_id, status, due_at);
create index if not exists tasks_app_idx on public.tasks (application_id);

-- ───────────────────────── resume tailored versions (Module 3) ─────────────────────────
-- Never overwrites resume_versions — a tailoring run produces a proposal the
-- user accepts section-by-section; nothing here mutates the original resume.
create table if not exists public.resume_tailored_versions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  resume_version_id uuid not null references public.resume_versions (id) on delete cascade,
  application_id    uuid references public.applications (id) on delete set null,
  job_id            uuid references public.jobs (id) on delete set null,
  job_text_sha256   text not null default '',
  report            jsonb not null default '{}'::jsonb,  -- TailoringReport (sections, diffs, reasons)
  accepted_sections text[] not null default '{}',        -- section names the user accepted
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists resume_tailored_versions_user_idx on public.resume_tailored_versions (user_id, created_at desc);

-- ───────────────────────── generated emails (Module 5) ─────────────────────────
create table if not exists public.generated_emails (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  application_id uuid references public.applications (id) on delete set null,
  recruiter_id   uuid,  -- FK added after recruiters exists
  kind           text not null,   -- application | follow_up | interview_confirm | thank_you | offer_negotiation |
                                    -- salary_negotiation | withdrawal | referral_request | networking | linkedin_connect | cold_outreach
  subject        text not null default '',
  body           text not null default '',
  tone           text not null default 'professional',
  sent           boolean not null default false,
  sent_at        timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists generated_emails_user_idx on public.generated_emails (user_id, created_at desc);

-- ───────────────────────── recruiter CRM (Module 6) ─────────────────────────
create table if not exists public.recruiters (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  company_id          uuid references public.companies (id) on delete set null,
  name                text not null default '',
  role                text not null default '',
  company_name        text not null default '',
  email               text not null default '',
  phone               text not null default '',
  linkedin_url        text not null default '',
  notes               text not null default '',
  relationship_score  int not null default 50,  -- 0-100, derived + user-adjustable
  last_contact_at     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists recruiters_user_idx on public.recruiters (user_id, name);

-- Late FK: generated_emails.recruiter_id → recruiters.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'generated_emails_recruiter_fk'
  ) then
    alter table public.generated_emails
      add constraint generated_emails_recruiter_fk
      foreign key (recruiter_id) references public.recruiters (id) on delete set null;
  end if;
end $$;

create table if not exists public.recruiter_interactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  recruiter_id uuid not null references public.recruiters (id) on delete cascade,
  kind         text not null default 'note',  -- note | email | call | meeting | message
  body         text not null default '',
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index if not exists recruiter_interactions_recruiter_idx on public.recruiter_interactions (recruiter_id, occurred_at desc);

-- ───────────────────────── networking CRM (Module 7) ─────────────────────────
create table if not exists public.network_contacts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  name             text not null default '',
  relationship     text not null default 'connection',  -- connection | mentor | hiring_manager | employee | referral | alumni | event_contact
  company_name     text not null default '',
  university       text not null default '',
  event_name       text not null default '',
  email            text not null default '',
  linkedin_url     text not null default '',
  notes            text not null default '',
  follow_up_at     timestamptz,
  last_contact_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists network_contacts_user_idx on public.network_contacts (user_id, name);

create table if not exists public.network_interactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  contact_id uuid not null references public.network_contacts (id) on delete cascade,
  body       text not null default '',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists network_interactions_contact_idx on public.network_interactions (contact_id, occurred_at desc);

-- ───────────────────────── interview workspace extensions (Module 8) ─────────────────────────
alter table public.interview_sessions
  add column if not exists round            text not null default '',
  add column if not exists interview_type    text not null default '',  -- phone | video | onsite | technical | panel | final
  add column if not exists scheduled_at      timestamptz,
  add column if not exists location         text not null default '',
  add column if not exists meeting_link     text not null default '',
  add column if not exists interviewers     jsonb not null default '[]'::jsonb,  -- [{name, role}]
  add column if not exists recording_links  text[] not null default '{}',
  add column if not exists outcome          text not null default '';  -- pending | passed | failed | no_show | cancelled

-- ───────────────────────── assessment center (Module 11) ─────────────────────────
create table if not exists public.assessments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  application_id uuid references public.applications (id) on delete set null,
  kind           text not null default 'online',  -- online | case_study | psychometric | numerical | logical | coding | video_interview
  title          text not null default '',
  provider       text not null default '',
  link           text not null default '',
  due_at         timestamptz,
  completed_at   timestamptz,
  score          int,
  result         text not null default '',   -- pass | fail | pending | ''
  notes          text not null default '',
  resources      jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists assessments_user_idx on public.assessments (user_id, due_at);

-- ───────────────────────── offer management (Module 12/13) ─────────────────────────
create table if not exists public.offers (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  application_id    uuid references public.applications (id) on delete set null,
  company_name      text not null default '',
  job_title         text not null default '',
  base_salary       numeric,
  bonus             numeric,
  equity            text not null default '',
  currency          text not null default 'INR',
  visa_sponsorship  text not null default '',
  relocation        text not null default '',
  benefits          text[] not null default '{}',
  leave_days        int,
  insurance         text not null default '',
  work_mode         text not null default '',
  work_hours        text not null default '',
  probation_months  int,
  notice_period     text not null default '',
  status            text not null default 'received',  -- received | negotiating | accepted | declined | expired
  received_at       timestamptz not null default now(),
  expires_at        timestamptz,
  decided_at        timestamptz,
  ai_analysis       jsonb,   -- OfferAnalysis
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists offers_user_idx on public.offers (user_id, status);

-- ───────────────────────── AI knowledge base (Module 19) ─────────────────────────
create table if not exists public.knowledge_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null default 'star_story',  -- star_story | note | achievement | leadership | failure | success | project
  title      text not null default '',
  body       text not null default '',
  tags       text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists knowledge_items_user_idx on public.knowledge_items (user_id, kind);

-- ═════════════════════════ Row Level Security ═════════════════════════
alter table public.tasks                     enable row level security;
alter table public.resume_tailored_versions  enable row level security;
alter table public.generated_emails          enable row level security;
alter table public.recruiters                enable row level security;
alter table public.recruiter_interactions    enable row level security;
alter table public.network_contacts          enable row level security;
alter table public.network_interactions      enable row level security;
alter table public.assessments               enable row level security;
alter table public.offers                    enable row level security;
alter table public.knowledge_items           enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'tasks','resume_tailored_versions','generated_emails','recruiters',
    'recruiter_interactions','network_contacts','network_interactions',
    'assessments','offers','knowledge_items'
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

-- ═════════════════════════ housekeeping triggers ═════════════════════════
-- Reuses careers_touch_updated_at() from careers_schema.sql.
do $$
declare
  t text;
begin
  foreach t in array array[
    'tasks','resume_tailored_versions','generated_emails','recruiters',
    'network_contacts','assessments','offers','knowledge_items'
  ]
  loop
    execute format('drop trigger if exists %s_touch on public.%I', t, t);
    execute format(
      'create trigger %s_touch before update on public.%I for each row execute function public.careers_touch_updated_at()', t, t);
  end loop;
end $$;
