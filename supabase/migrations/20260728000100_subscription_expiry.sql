-- Billing (Phase 4, Module 2) is one-time-renewal, not auto-charging
-- subscriptions: a Stripe Checkout payment sets current_period_end and never
-- charges again on its own. Without this, a user who doesn't renew stays on
-- their paid plan (and its quota) forever — this function is what actually
-- enforces the period boundary. Mirrors prune_analytics_events: SECURITY
-- DEFINER, search_path pinned, service-role-only execute, scheduled via
-- pg_cron (see docs/OBSERVABILITY.md).
create or replace function public.expire_subscriptions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired integer;
begin
  update public.subscriptions
    set plan_id = 'free',
        status = 'active',
        current_period_start = now(),
        current_period_end = null,
        cancel_at_period_end = false,
        updated_at = now()
    where plan_id <> 'free'
      and status in ('active', 'past_due')
      and current_period_end is not null
      and current_period_end < now();
  get diagnostics v_expired = row_count;
  return v_expired;
end $$;
revoke execute on function public.expire_subscriptions() from public, anon, authenticated;
grant execute on function public.expire_subscriptions() to service_role;
