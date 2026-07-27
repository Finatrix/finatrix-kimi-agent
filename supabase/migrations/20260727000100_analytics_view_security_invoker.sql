-- FinatriX — privacy-first analytics store.
-- Run in Supabase SQL Editor after schema.sql (idempotent; safe to re-run).
--
-- Privacy by design:
--   • No IP address, no user-agent, no user_id, no cross-session identifier.
--   • `session_id` is the client's ephemeral in-memory UUID (per page load); it
--     cannot re-identify a person and is discarded when the tab closes.
--   • `props` is a constrained JSONB of non-PII enums/numbers only (the edge
--     function validates against an allowlist before insert).
--   • Clients CANNOT write here directly: there is no insert policy, so PostgREST
--     denies inserts. Only the `analytics-collect` edge function (service role,
--     rate-limited) writes rows. Reads are platform-admin only.

create table if not exists public.analytics_events (
  id          bigint generated always as identity primary key,
  session_id  text not null,
  event       text not null,
  props       jsonb not null default '{}'::jsonb,
  client_t    integer,                 -- ms since the client's session start (relative)
  created_at  timestamptz not null default now(),
  constraint analytics_props_size check (pg_column_size(props) <= 4096),
  constraint analytics_event_len  check (char_length(event) <= 64),
  constraint analytics_session_len check (char_length(session_id) <= 64)
);

-- Read paths: recent events by type, and time-range scans for retention/rollups.
create index if not exists analytics_events_event_time_idx
  on public.analytics_events (event, created_at desc);
create index if not exists analytics_events_created_idx
  on public.analytics_events (created_at);

alter table public.analytics_events enable row level security;

-- No insert/update/delete policy for clients → PostgREST denies all writes.
-- The edge function uses the service role, which bypasses RLS.
-- Reads: platform admins only (aggregate stream is not user data, but we still
-- keep it out of ordinary users' reach).
drop policy if exists "analytics_events_admin_select" on public.analytics_events;
create policy "analytics_events_admin_select"
  on public.analytics_events for select
  using (public.is_platform_admin(auth.uid()));

-- ── Retention ─────────────────────────────────────────────────────────────
-- Delete raw events older than `p_days` (default 90). Schedule daily via
-- Supabase's pg_cron (see docs/OBSERVABILITY.md) or an external cron hitting an
-- RPC. SECURITY DEFINER so the scheduler role can prune; search_path pinned.
create or replace function public.prune_analytics_events(p_days int default 90)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.analytics_events
    where created_at < now() - make_interval(days => greatest(p_days, 1));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;
revoke execute on function public.prune_analytics_events(int) from public, anon, authenticated;
grant execute on function public.prune_analytics_events(int) to service_role;

-- ── Convenience rollup (admin dashboards) ─────────────────────────────────
-- Daily event counts + distinct sessions.
--
-- ⚠️ `security_invoker = true` is REQUIRED and is NOT the Postgres default.
-- Without it a view runs with the *owner's* rights, and because the owner also
-- owns `analytics_events`, RLS is bypassed entirely — every signed-in user (and
-- `anon`, which Supabase grants SELECT on new public objects by default) could
-- read the whole analytics stream despite the admin-only policy above. With it,
-- the querying user's own policies apply. (Requires PostgreSQL 15+.)
-- Belt-and-braces: anon is revoked explicitly below.
create or replace view public.analytics_event_counts_daily
  with (security_invoker = true) as
  select
    date_trunc('day', created_at)::date as day,
    event,
    count(*)                       as events,
    count(distinct session_id)     as sessions
  from public.analytics_events
  group by 1, 2;

revoke all on public.analytics_event_counts_daily from anon;
