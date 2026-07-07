-- FinatriX Careers — Phase 4: Enterprise Platform foundations.
--
-- Run AFTER careers_schema.sql, careers_phase2_schema.sql and
-- careers_phase3_schema.sql. Covers: RBAC roles, organizations, subscription
-- plans/billing/usage, coupons, scoped feature flag overrides, AI usage
-- telemetry, audit log, support tickets and announcements.
--
-- No payment gateway is wired yet (Stripe/Razorpay = Phase 4 Module 2,
-- deferred). billing_history rows are inserted manually or by a future
-- webhook handler; subscriptions can be created/updated directly for now.

-- ───────────────────────── RBAC: platform roles ─────────────────────────
-- Deliberately NO client insert/update/delete policy: a role can only be
-- granted via the Supabase dashboard or a service-role script, never by the
-- authenticated user themselves (a client-writable admin flag would be a
-- privilege-escalation bug, not a feature).
create table if not exists public.platform_roles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null default 'user',  -- user | support | admin | super_admin
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.is_platform_admin(uid uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.platform_roles
    where user_id = uid and role in ('admin', 'super_admin')
  );
$$;

-- ───────────────────────── organizations (Module 12 foundation) ─────────────────────────
create table if not exists public.organizations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null default '',
  kind         text not null default 'company',  -- company | university | coaching | enterprise
  owner_user_id uuid references auth.users (id) on delete set null,
  plan_id      text not null default 'free',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.organization_members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'member',  -- owner | admin | member
  invited_by uuid references auth.users (id) on delete set null,
  joined_at  timestamptz not null default now(),
  unique (org_id, user_id)
);

-- ───────────────────────── subscription platform (Module 1) ─────────────────────────
create table if not exists public.subscription_plans (
  id                text primary key,   -- free | student | professional | premium | enterprise
  name              text not null,
  price_monthly     numeric not null default 0,
  price_yearly      numeric not null default 0,
  currency          text not null default 'INR',
  ai_quota_monthly  int,                -- null = unlimited
  storage_mb        int,
  resume_limit      int,
  application_limit int,
  features          jsonb not null default '[]'::jsonb,
  trial_days        int not null default 0,
  is_active         boolean not null default true,
  sort_order        int not null default 0
);

insert into public.subscription_plans (id, name, price_monthly, price_yearly, ai_quota_monthly, storage_mb, resume_limit, application_limit, features, trial_days, sort_order) values
  ('free',         'Free',         0,     0,      20,   200,  2,  10,  '["Resume Score","ATS Score","Basic Job Search"]'::jsonb, 0,  0),
  ('student',      'Student',      199,   1999,   100,  1024, 5,  50,  '["Everything in Free","Career DNA","Interview Prep"]'::jsonb, 14, 1),
  ('professional', 'Professional', 999,   9999,   500,  5120, 15, 200, '["Everything in Student","Resume Tailoring","AI Email Generator","Offer Analysis"]'::jsonb, 14, 2),
  ('premium',      'Premium',      2499,  24999,  2000, 20480, 50, 1000,'["Everything in Professional","Priority AI","Unlimited Cover Letters"]'::jsonb, 14, 3),
  ('enterprise',   'Enterprise',   0,     0,      null, null, null, null,'["Everything in Premium","Organization Management","Recruiter/University Portal","Priority Support"]'::jsonb, 0, 4)
on conflict (id) do nothing;

create table if not exists public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  org_id                uuid references public.organizations (id) on delete set null,
  plan_id               text not null references public.subscription_plans (id),
  status                text not null default 'trialing',  -- trialing | active | past_due | canceled | expired
  trial_ends_at         timestamptz,
  current_period_start  timestamptz not null default now(),
  current_period_end    timestamptz,
  cancel_at_period_end  boolean not null default false,
  coupon_code           text,
  provider              text not null default 'manual',    -- manual | stripe | razorpay
  provider_customer_id  text not null default '',
  provider_subscription_id text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on public.subscriptions (user_id, status);
-- At most one non-canceled subscription per user (a plan change updates the row, it never duplicates).
create unique index if not exists subscriptions_one_active_per_user
  on public.subscriptions (user_id) where status in ('trialing', 'active', 'past_due');

create table if not exists public.coupons (
  code             text primary key,
  percent_off      int,
  amount_off       numeric,
  currency         text not null default 'INR',
  max_redemptions  int,
  times_redeemed   int not null default 0,
  valid_until      timestamptz,
  active           boolean not null default true
);

create table if not exists public.billing_history (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  amount          numeric not null default 0,
  currency        text not null default 'INR',
  status          text not null default 'pending',  -- paid | failed | refunded | pending
  provider        text not null default 'manual',    -- manual | stripe | razorpay
  provider_ref    text not null default '',
  invoice_url     text not null default '',
  created_at      timestamptz not null default now()
);
create index if not exists billing_history_user_idx on public.billing_history (user_id, created_at desc);

-- Monthly per-user counters — the enforcement point for AI/storage/resume/application quotas.
create table if not exists public.usage_counters (
  user_id           uuid not null references auth.users (id) on delete cascade,
  period            text not null,  -- 'YYYY-MM'
  ai_calls          int not null default 0,
  storage_bytes     bigint not null default 0,
  resumes_count     int not null default 0,
  applications_count int not null default 0,
  updated_at        timestamptz not null default now(),
  primary key (user_id, period)
);

-- ───────────────────────── feature flags (Module 3) ─────────────────────────
-- Global flags already live in careers_feature_flags (Phase 2). Scoped
-- overrides (user / org / plan / beta / kill-switch) layer on top here;
-- resolution order in the client is: kill-switch > user > org > plan > global.
create table if not exists public.feature_flag_overrides (
  id         uuid primary key default gen_random_uuid(),
  flag       text not null,
  scope      text not null,       -- user | org | plan
  scope_id   text not null,       -- user_id / org_id / plan_id
  enabled    boolean not null default true,
  rollout_percent int not null default 100,
  is_beta    boolean not null default false,
  is_kill_switch boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (flag, scope, scope_id)
);

-- ───────────────────────── AI usage intelligence (Module 5) ─────────────────────────
create table if not exists public.ai_usage_log (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  org_id            uuid references public.organizations (id) on delete set null,
  task              text not null default '',   -- 'job-analysis' | 'coach' | 'email' | …
  model             text not null default '',
  prompt_tokens     int not null default 0,
  completion_tokens int not null default 0,
  total_tokens      int not null default 0,
  latency_ms        int not null default 0,
  cache_hit         boolean not null default false,
  success           boolean not null default true,
  error             text not null default '',
  cost_estimate     numeric not null default 0,
  created_at        timestamptz not null default now()
);
create index if not exists ai_usage_log_user_idx on public.ai_usage_log (user_id, created_at desc);
create index if not exists ai_usage_log_model_idx on public.ai_usage_log (model, created_at desc);

-- ───────────────────────── audit log (Module 13) ─────────────────────────
-- Insert-only from the client (its own actions); select is admin-only.
create table if not exists public.audit_log (
  id             uuid primary key default gen_random_uuid(),
  actor_user_id  uuid references auth.users (id) on delete set null,
  action         text not null,
  target_type    text not null default '',
  target_id      text not null default '',
  meta           jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists audit_log_actor_idx on public.audit_log (actor_user_id, created_at desc);
-- Additional index for admin filtering by action/table — avoids full scans on the audit log.
create index if not exists audit_log_action_idx
on public.audit_log(target_type, action, created_at desc);

-- ───────────────────────── support tickets (Module 4) ─────────────────────────
create table if not exists public.support_tickets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  subject    text not null default '',
  body       text not null default '',
  status     text not null default 'open',    -- open | pending | resolved | closed
  priority   text not null default 'medium',  -- low | medium | high | urgent
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.support_ticket_messages (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.support_tickets (id) on delete cascade,
  author_id  uuid references auth.users (id) on delete set null,
  is_staff   boolean not null default false,
  body       text not null default '',
  created_at timestamptz not null default now()
);

-- ───────────────────────── announcements (Module 4) ─────────────────────────
create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null default '',
  body       text not null default '',
  audience   text not null default 'all',  -- all | plan:<id> | org:<id>
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  active     boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ═════════════════════════ Row Level Security ═════════════════════════
alter table public.platform_roles           enable row level security;
alter table public.organizations            enable row level security;
alter table public.organization_members     enable row level security;
alter table public.subscription_plans       enable row level security;
alter table public.subscriptions            enable row level security;
alter table public.coupons                  enable row level security;
alter table public.billing_history          enable row level security;
alter table public.usage_counters           enable row level security;
alter table public.feature_flag_overrides   enable row level security;
alter table public.ai_usage_log             enable row level security;
alter table public.audit_log                enable row level security;
alter table public.support_tickets          enable row level security;
alter table public.support_ticket_messages  enable row level security;
alter table public.announcements            enable row level security;

-- platform_roles: read own row, or any row if you're an admin. No client writes.
drop policy if exists "platform_roles_select" on public.platform_roles;
create policy "platform_roles_select" on public.platform_roles for select
  using (auth.uid() = user_id or public.is_platform_admin(auth.uid()));

-- organizations: members can read their org; owners can update it. Admins see all.
drop policy if exists "organizations_select" on public.organizations;
create policy "organizations_select" on public.organizations for select
  using (
    auth.uid() = owner_user_id
    or exists (select 1 from public.organization_members m where m.org_id = id and m.user_id = auth.uid())
    or public.is_platform_admin(auth.uid())
  );
drop policy if exists "organizations_insert" on public.organizations;
create policy "organizations_insert" on public.organizations for insert
  with check (auth.uid() = owner_user_id);
drop policy if exists "organizations_update" on public.organizations;
create policy "organizations_update" on public.organizations for update
  using (auth.uid() = owner_user_id or public.is_platform_admin(auth.uid()));

drop policy if exists "organization_members_select" on public.organization_members;
create policy "organization_members_select" on public.organization_members for select
  using (
    auth.uid() = user_id
    or exists (select 1 from public.organizations o where o.id = org_id and o.owner_user_id = auth.uid())
    or public.is_platform_admin(auth.uid())
  );
drop policy if exists "organization_members_insert" on public.organization_members;
create policy "organization_members_insert" on public.organization_members for insert
  with check (
    exists (select 1 from public.organizations o where o.id = org_id and o.owner_user_id = auth.uid())
    or public.is_platform_admin(auth.uid())
  );
drop policy if exists "organization_members_delete" on public.organization_members;
create policy "organization_members_delete" on public.organization_members for delete
  using (
    auth.uid() = user_id
    or exists (select 1 from public.organizations o where o.id = org_id and o.owner_user_id = auth.uid())
    or public.is_platform_admin(auth.uid())
  );

-- subscription_plans / coupons: readable by everyone signed in, writable only by admins.
drop policy if exists "subscription_plans_select" on public.subscription_plans;
create policy "subscription_plans_select" on public.subscription_plans for select to authenticated using (true);
drop policy if exists "subscription_plans_admin_write" on public.subscription_plans;
create policy "subscription_plans_admin_write" on public.subscription_plans for all
  using (public.is_platform_admin(auth.uid())) with check (public.is_platform_admin(auth.uid()));

drop policy if exists "coupons_select" on public.coupons;
create policy "coupons_select" on public.coupons for select to authenticated using (active = true);
drop policy if exists "coupons_admin_write" on public.coupons;
create policy "coupons_admin_write" on public.coupons for all
  using (public.is_platform_admin(auth.uid())) with check (public.is_platform_admin(auth.uid()));

-- subscriptions: own row select/insert/update; admins see/manage all.
drop policy if exists "subscriptions_select" on public.subscriptions;
create policy "subscriptions_select" on public.subscriptions for select
  using (auth.uid() = user_id or public.is_platform_admin(auth.uid()));
drop policy if exists "subscriptions_insert" on public.subscriptions;
create policy "subscriptions_insert" on public.subscriptions for insert
  with check (auth.uid() = user_id or public.is_platform_admin(auth.uid()));
drop policy if exists "subscriptions_update" on public.subscriptions;
create policy "subscriptions_update" on public.subscriptions for update
  using (auth.uid() = user_id or public.is_platform_admin(auth.uid()));

-- billing_history: read-only for the owner; only admins (future: webhook via service role) insert.
drop policy if exists "billing_history_select" on public.billing_history;
create policy "billing_history_select" on public.billing_history for select
  using (auth.uid() = user_id or public.is_platform_admin(auth.uid()));
drop policy if exists "billing_history_admin_write" on public.billing_history;
create policy "billing_history_admin_write" on public.billing_history for insert
  with check (public.is_platform_admin(auth.uid()));

-- usage_counters: own row select; the client increments its own counters transactionally.
drop policy if exists "usage_counters_select" on public.usage_counters;
create policy "usage_counters_select" on public.usage_counters for select
  using (auth.uid() = user_id or public.is_platform_admin(auth.uid()));
drop policy if exists "usage_counters_upsert" on public.usage_counters;
create policy "usage_counters_upsert" on public.usage_counters for insert with check (auth.uid() = user_id);
drop policy if exists "usage_counters_update" on public.usage_counters;
create policy "usage_counters_update" on public.usage_counters for update using (auth.uid() = user_id);

-- feature_flag_overrides: readable by everyone signed in (client resolves scope match itself);
-- writable only by admins.
drop policy if exists "feature_flag_overrides_select" on public.feature_flag_overrides;
create policy "feature_flag_overrides_select" on public.feature_flag_overrides for select to authenticated using (true);
drop policy if exists "feature_flag_overrides_admin_write" on public.feature_flag_overrides;
create policy "feature_flag_overrides_admin_write" on public.feature_flag_overrides for all
  using (public.is_platform_admin(auth.uid())) with check (public.is_platform_admin(auth.uid()));

-- ai_usage_log: the edge function inserts its own row (forwarded user JWT); user reads own; admins read all.
drop policy if exists "ai_usage_log_select" on public.ai_usage_log;
create policy "ai_usage_log_select" on public.ai_usage_log for select
  using (auth.uid() = user_id or public.is_platform_admin(auth.uid()));
drop policy if exists "ai_usage_log_insert" on public.ai_usage_log;
create policy "ai_usage_log_insert" on public.ai_usage_log for insert with check (auth.uid() = user_id);

-- audit_log: any signed-in user can log their own action; only admins can read.
drop policy if exists "audit_log_insert" on public.audit_log;
create policy "audit_log_insert" on public.audit_log for insert with check (auth.uid() = actor_user_id);
drop policy if exists "audit_log_select" on public.audit_log;
create policy "audit_log_select" on public.audit_log for select using (public.is_platform_admin(auth.uid()));

-- support tickets: owner + admin/support.
drop policy if exists "support_tickets_select" on public.support_tickets;
create policy "support_tickets_select" on public.support_tickets for select
  using (auth.uid() = user_id or public.is_platform_admin(auth.uid()));
drop policy if exists "support_tickets_insert" on public.support_tickets;
create policy "support_tickets_insert" on public.support_tickets for insert with check (auth.uid() = user_id);
drop policy if exists "support_tickets_update" on public.support_tickets;
create policy "support_tickets_update" on public.support_tickets for update
  using (auth.uid() = user_id or public.is_platform_admin(auth.uid()));

drop policy if exists "support_ticket_messages_select" on public.support_ticket_messages;
create policy "support_ticket_messages_select" on public.support_ticket_messages for select
  using (
    exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
    or public.is_platform_admin(auth.uid())
  );
drop policy if exists "support_ticket_messages_insert" on public.support_ticket_messages;
create policy "support_ticket_messages_insert" on public.support_ticket_messages for insert
  with check (
    exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
    or public.is_platform_admin(auth.uid())
  );

-- announcements: readable by everyone signed in; writable only by admins.
drop policy if exists "announcements_select" on public.announcements;
create policy "announcements_select" on public.announcements for select to authenticated using (true);
drop policy if exists "announcements_admin_write" on public.announcements;
create policy "announcements_admin_write" on public.announcements for all
  using (public.is_platform_admin(auth.uid())) with check (public.is_platform_admin(auth.uid()));

-- ═════════════════════════ atomic AI usage metering ═════════════════════════
-- Replaces the non-atomic read-then-write pattern in careers-ai edge function.
-- Returns the new call count for the day, or -1 if the limit is already reached.
-- Called by the edge function with service-role credentials (bypasses RLS).
create or replace function public.increment_ai_usage(
  p_user_id uuid,
  p_day     date,
  p_limit   int
) returns int language plpgsql as $$
declare
  v_calls int;
begin
  insert into public.careers_ai_usage (user_id, day, calls)
  values (p_user_id, p_day, 1)
  on conflict (user_id, day) do update
    set calls = careers_ai_usage.calls + 1
  where careers_ai_usage.calls < p_limit
  returning calls into v_calls;

  -- If no row was updated (calls >= limit), return sentinel -1.
  if v_calls is null then
    select calls into v_calls from public.careers_ai_usage
    where user_id = p_user_id and day = p_day;
    if v_calls >= p_limit then
      return -1;
    end if;
  end if;
  return coalesce(v_calls, 1);
end $$;

-- Only the edge function (service role) may call the metering RPC. Without
-- this, Postgres's default EXECUTE-to-public grant would let any signed-in
-- user invoke it directly through PostgREST (RLS blocks writes to other
-- users' meters, but the function should not be client-callable at all).
revoke execute on function public.increment_ai_usage(uuid, date, int) from public, anon, authenticated;
grant execute on function public.increment_ai_usage(uuid, date, int) to service_role;

-- ═════════════════════════ housekeeping triggers ═════════════════════════
do $$
declare
  t text;
begin
  foreach t in array array['organizations', 'subscriptions', 'support_tickets']
  loop
    execute format('drop trigger if exists %s_touch on public.%I', t, t);
    execute format(
      'create trigger %s_touch before update on public.%I for each row execute function public.careers_touch_updated_at()', t, t);
  end loop;
end $$;
