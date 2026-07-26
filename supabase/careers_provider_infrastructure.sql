-- FinatriX Careers — multi-provider job-search infrastructure.
--
-- Additive only: creates new tables + one RPC used by the careers-jobs edge
-- function's ProviderManager (cache, health, metrics, search history, quotas).
-- No existing table is altered. RLS mirrors the analytics pattern: these tables
-- are written by the edge function with the service role and are NOT client-
-- writable; admins may read the operational ones for the internal dashboards.
--
-- Apply after the existing schema files, e.g.:
--   psql "$SUPABASE_DB_URL" -f supabase/careers_provider_infrastructure.sql

-- ─────────────────────────── provider_cache ───────────────────────────
-- Redis-style key/value + TTL over Postgres. `expires_at` drives both read
-- validity and pruning. Values are opaque JSONB (a deduped FinatriXJob[]).
create table if not exists public.provider_cache (
  key         text primary key,
  value       jsonb not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists provider_cache_expires_idx on public.provider_cache (expires_at);
alter table public.provider_cache enable row level security;
-- No policy → PostgREST denies all client access. Service role bypasses RLS.

-- Periodic cleanup of expired entries (call from a scheduled job / cron).
-- Maintenance only: revoked from clients so it is never callable over PostgREST
-- (it would delete nothing under RLS, but an unauthenticated-reachable RPC is
-- still needless attack surface and a free way to make the DB do work).
create or replace function public.prune_provider_cache() returns void
  language sql set search_path = '' as $$
  delete from public.provider_cache where expires_at < now();
$$;
revoke execute on function public.prune_provider_cache() from public, anon, authenticated;
grant execute on function public.prune_provider_cache() to service_role;

-- ──────────────────────── provider_health_events ────────────────────────
create table if not exists public.provider_health_events (
  id              bigserial primary key,
  provider        text not null,
  ok              boolean not null,
  ms              integer not null default 0,
  error_kind      text,
  quota_remaining integer,
  -- Vendor "job credit" budget. The Fantastic-Jobs family bills a job credit per
  -- returned record on top of a request credit, against a SMALLER budget — so
  -- request quota alone reads healthy right up to exhaustion.
  jobs_remaining  integer,
  at              timestamptz not null default now()
);
-- Additive for projects created before jobs_remaining existed.
alter table public.provider_health_events add column if not exists jobs_remaining integer;
create index if not exists provider_health_provider_at_idx
  on public.provider_health_events (provider, at desc);
alter table public.provider_health_events enable row level security;
drop policy if exists "provider_health_admin_select" on public.provider_health_events;
create policy "provider_health_admin_select"
  on public.provider_health_events for select to authenticated
  using (public.is_platform_admin(auth.uid()));

-- ──────────────────────── provider_metric_events ────────────────────────
create table if not exists public.provider_metric_events (
  id             bigserial primary key,
  provider       text not null,
  kind           text not null,          -- search | get | company | health
  ok             boolean not null,
  ms             integer not null default 0,
  jobs           integer not null default 0,
  cost_micro_usd bigint  not null default 0,
  at             timestamptz not null default now()
);
create index if not exists provider_metric_at_idx on public.provider_metric_events (at desc);
create index if not exists provider_metric_provider_idx on public.provider_metric_events (provider);
alter table public.provider_metric_events enable row level security;
drop policy if exists "provider_metric_admin_select" on public.provider_metric_events;
create policy "provider_metric_admin_select"
  on public.provider_metric_events for select to authenticated
  using (public.is_platform_admin(auth.uid()));

-- ───────────────────────── job_search_history ─────────────────────────
-- One row per search: powers "search volume" and "top search terms" for the
-- admin dashboards, and a user's own recent-search list. Query text only —
-- never results or PII beyond the (already user-scoped) query string.
create table if not exists public.job_search_history (
  id       bigserial primary key,
  user_id  uuid not null references auth.users(id) on delete cascade,
  query    text not null,
  country  text not null default 'in',
  results  integer not null default 0,
  at       timestamptz not null default now()
);
create index if not exists job_search_history_at_idx on public.job_search_history (at desc);
create index if not exists job_search_history_user_idx on public.job_search_history (user_id, at desc);
alter table public.job_search_history enable row level security;
drop policy if exists "job_search_history_select_own" on public.job_search_history;
create policy "job_search_history_select_own"
  on public.job_search_history for select to authenticated
  using (auth.uid() = user_id or public.is_platform_admin(auth.uid()));
-- Inserts happen via the service role in the edge function; no client insert policy.

-- ─────────────────────────── provider_quota ───────────────────────────
-- Atomic fixed-window counters for the multi-dimension rate limiter
-- (per-user minute/hour/day, per-IP minute, per-provider hour/day). The window
-- is bucketed by floor(epoch / window_seconds); old buckets are ignored and can
-- be pruned. Service-role only.
create table if not exists public.provider_quota (
  scope        text   not null,
  key          text   not null,
  window_start bigint not null,
  count        integer not null default 0,
  primary key (scope, key, window_start)
);
create index if not exists provider_quota_window_idx on public.provider_quota (window_start);
alter table public.provider_quota enable row level security;
-- No policy → client-inaccessible; only the RPC (service role) touches it.

create or replace function public.increment_provider_quota(
  p_scope          text,
  p_key            text,
  p_limit          int,
  p_window_seconds int
) returns int language plpgsql
set search_path = ''
as $$
declare
  v_window bigint := floor(extract(epoch from now()) / p_window_seconds)::bigint;
  v_count  int;
begin
  insert into public.provider_quota (scope, key, window_start, count)
  values (p_scope, p_key, v_window, 1)
  on conflict (scope, key, window_start) do update
    set count = provider_quota.count + 1
  where provider_quota.count < p_limit
  returning count into v_count;

  -- No row updated ⇒ at/over the limit for this window.
  if v_count is null then
    select count into v_count from public.provider_quota
    where scope = p_scope and key = p_key and window_start = v_window;
    if v_count >= p_limit then
      return -1;
    end if;
  end if;
  return coalesce(v_count, 1);
end $$;

-- Lock the RPC to the edge function (service role) — never client-callable.
revoke execute on function public.increment_provider_quota(text, text, int, int)
  from public, anon, authenticated;
grant execute on function public.increment_provider_quota(text, text, int, int) to service_role;

create or replace function public.prune_provider_quota() returns void
  language sql set search_path = '' as $$
  delete from public.provider_quota
  where window_start < floor(extract(epoch from now()) / 86400)::bigint - 2;
$$;
revoke execute on function public.prune_provider_quota() from public, anon, authenticated;
grant execute on function public.prune_provider_quota() to service_role;

-- ─────────────────────── admin dashboard views ───────────────────────
-- These power the internal Provider Operations dashboard: health, latency,
-- success rate, volume, cost, quota usage, top terms, most-successful provider.
--
-- ⚠️ `security_invoker = true` is REQUIRED and is NOT the default. Postgres
-- defaults it to false, which applies the *view owner's* RLS policies to the
-- base tables — and because the owner also owns those tables, RLS is bypassed
-- entirely. Without this option any signed-in user could read every provider's
-- cost data and every user's search terms through these views, regardless of
-- the admin-only policies above. With it, the querying user's own policies
-- apply, so only platform admins see rows. (Requires PostgreSQL 15+.)
-- Belt-and-braces: anon is revoked explicitly below.

-- Rolling 24h per-provider health + latency + success rate + cost.
create or replace view public.provider_ops_health
  with (security_invoker = true) as
select
  m.provider,
  count(*)                                             as calls,
  round(avg(case when m.ok then 1 else 0 end)::numeric, 3) as success_rate,
  round(avg(m.ms)::numeric, 0)                          as avg_latency_ms,
  sum(m.jobs)                                           as jobs_returned,
  round(sum(m.cost_micro_usd) / 1000000.0, 4)          as est_cost_usd,
  max(m.at)                                             as last_call
from public.provider_metric_events m
where m.at > now() - interval '24 hours'
group by m.provider
order by jobs_returned desc;

-- Rolling 24h search volume + the most-searched terms.
create or replace view public.provider_ops_top_terms
  with (security_invoker = true) as
select lower(trim(query)) as term, count(*) as searches, max(at) as last_searched
from public.job_search_history
where at > now() - interval '24 hours' and length(trim(query)) > 0
group by lower(trim(query))
order by searches desc
limit 25;

-- Live per-provider status: availability, recent error rate, the dominant
-- failure mode, and BOTH remaining quota budgets. `quota_remaining` and
-- `jobs_remaining` use the newest row that actually observed a value — a failed
-- call reports null, and a null must not blank the gauge at exactly the moment
-- an operator needs it.
create or replace view public.provider_ops_status
  with (security_invoker = true) as
with recent as (
  select * from public.provider_health_events where at > now() - interval '24 hours'
)
select
  r.provider,
  count(*)                                                      as events,
  round(avg(case when r.ok then 0 else 1 end)::numeric, 3)      as error_rate,
  max(r.at)                                                     as last_seen,
  max(r.at) filter (where r.ok)                                 as last_success,
  max(r.at) filter (where not r.ok)                             as last_failure,
  (array_remove(array_agg(r.error_kind order by r.at desc), null))[1] as last_error_kind,
  (array_remove(array_agg(r.quota_remaining order by r.at desc), null))[1] as quota_remaining,
  (array_remove(array_agg(r.jobs_remaining  order by r.at desc), null))[1] as jobs_remaining
from recent r
group by r.provider
order by error_rate desc, events desc;

-- True rolling-24h search volume. `provider_ops_top_terms` is capped at 25 rows,
-- so summing its `searches` column under-reports total volume whenever more than
-- 25 distinct terms were searched. This view is the honest total and is what the
-- dashboard's headline "Searches (24h)" reads.
create or replace view public.provider_ops_search_volume
  with (security_invoker = true) as
select
  count(*)                       as searches,
  count(distinct user_id)        as searchers,
  coalesce(sum(results), 0)      as results_returned
from public.job_search_history
where at > now() - interval '24 hours';

-- No view is ever anon-readable. (Under security_invoker the underlying RLS
-- already denies anon; this makes the intent explicit and survives a future
-- policy edit.)
revoke all on public.provider_ops_health from anon;
revoke all on public.provider_ops_top_terms from anon;
revoke all on public.provider_ops_search_volume from anon;
revoke all on public.provider_ops_status from anon;
