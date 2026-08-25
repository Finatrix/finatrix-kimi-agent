-- ═══════════════════════════════════════════════════════════════════════════
-- Make the Careers paywall real.
--
-- WHY
-- ---
-- The paywall was enforced only in React. Three things made that a revenue
-- hole rather than a cosmetic one:
--
--   1. `subscriptions_update` was `using (auth.uid() = user_id or is_admin)`
--      with NO `with check` and no column guard, so any authenticated user
--      could write any column of their own row — including `plan_id`. One
--      PostgREST call turned a free signup into a permanent Premium account,
--      and `CareersPaywallGate` reads exactly that column to decide access.
--      The app even shipped the call: `subscriptions.changePlan()`.
--
--   2. `usage_counters_update` was `using (auth.uid() = user_id)`, so a user
--      could reset their own consumption to zero.
--
--   3. `begin_ai_call` took its limit as a parameter, which the edge function
--      read from one env var shared by every account. The per-plan quotas sold
--      on /pricing were enforced nowhere.
--
-- This migration fixes (1) and (2) with column guards, and gives (3) a
-- quota-aware metering function. The edge function change lands alongside it.
--
-- Idempotent and safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────── 1. subscriptions: lock the entitlement ───────────────────
--
-- A `with check` cannot express this: it sees only the NEW row and so cannot
-- say "unchanged from OLD". A BEFORE UPDATE trigger can, and it also keeps the
-- policy readable.
--
-- The guard applies ONLY to the two PostgREST client roles. `service_role`,
-- `postgres` and any migration path set a different `current_user` and pass
-- straight through — which is what leaves room for the billing webhook to do
-- its job. Platform admins are exempt too, matching the existing policies.
--
-- What a client MAY still change, because both are legitimately user-initiated:
--   • `cancel_at_period_end` — "cancel at the end of the period";
--   • `status`, but only to 'canceled' — "cancel now". Any other transition
--     (back to active, to trialing, past_due) is an entitlement change.
create or replace function public.guard_subscription_entitlements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only the browser-facing roles are constrained.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if public.is_platform_admin(auth.uid()) then
    return new;
  end if;

  if new.plan_id is distinct from old.plan_id then
    raise exception 'plan_id is not client-writable; plan changes belong to the billing webhook'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status and new.status <> 'canceled' then
    raise exception 'status may only be set to canceled from a client'
      using errcode = '42501';
  end if;

  if new.user_id             is distinct from old.user_id
     or new.org_id           is distinct from old.org_id
     or new.trial_ends_at    is distinct from old.trial_ends_at
     or new.current_period_start is distinct from old.current_period_start
     or new.current_period_end   is distinct from old.current_period_end
     or new.coupon_code      is distinct from old.coupon_code
     or new.provider         is distinct from old.provider
     or new.provider_customer_id     is distinct from old.provider_customer_id
     or new.provider_subscription_id is distinct from old.provider_subscription_id then
    raise exception 'subscription entitlement columns are not client-writable'
      using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists guard_subscription_entitlements on public.subscriptions;
create trigger guard_subscription_entitlements
  before update on public.subscriptions
  for each row execute function public.guard_subscription_entitlements();

-- The INSERT side matters too: without this, "free signup" could simply insert
-- a premium row instead of updating one. `ensureFreeSubscription` only ever
-- creates 'free', so constraining the client to that costs nothing.
create or replace function public.guard_subscription_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if public.is_platform_admin(auth.uid()) then
    return new;
  end if;
  if new.plan_id <> 'free' then
    raise exception 'a client may only open a free subscription'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists guard_subscription_insert on public.subscriptions;
create trigger guard_subscription_insert
  before insert on public.subscriptions
  for each row execute function public.guard_subscription_insert();

-- ─────────────────── 2. usage_counters: no self-forgiveness ───────────────────
-- A client may report consumption upward; it may not lower it. The AI meter
-- (`careers_ai_usage`) is already service-role-only and unaffected.
create or replace function public.guard_usage_counter_decrease()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if public.is_platform_admin(auth.uid()) then
    return new;
  end if;

  if new.ai_calls           < old.ai_calls
     or new.storage_bytes      < old.storage_bytes
     or new.resumes_count      < old.resumes_count
     or new.applications_count < old.applications_count then
    raise exception 'usage counters may not be decreased by a client'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists guard_usage_counter_decrease on public.usage_counters;
create trigger guard_usage_counter_decrease
  before update on public.usage_counters
  for each row execute function public.guard_usage_counter_decrease();

-- ─────────────────── 3. metering against the plan's real quota ───────────────
--
-- `begin_ai_call` enforces a DAILY call limit. The quotas actually sold are
-- MONTHLY (`subscription_plans.ai_quota_monthly`), so passing one as the other
-- would have given Student 100 calls a day instead of 100 a month.
--
-- `begin_ai_call_v2` keeps the daily burst limit and the token/global ceilings
-- unchanged, and adds the monthly check in the same atomic call. Returns:
--   -1  per-user daily CALL limit reached
--   -2  per-user daily TOKEN budget reached
--   -3  GLOBAL daily token ceiling reached
--   -4  per-user MONTHLY call quota reached   ← new
--   >=1 the post-increment daily call count
--
-- The original is left in place: an un-migrated deployment keeps working, and
-- overloading by name would make the PostgREST call ambiguous.
create or replace function public.begin_ai_call_v2(
  p_user_id      uuid,
  p_day          date,
  p_call_limit   int,
  p_month_limit  int,      -- <= 0 means unlimited
  p_token_limit  bigint,
  p_global_limit bigint
) returns int language plpgsql
set search_path = ''
as $$
declare
  v_calls         int;
  v_month_calls   bigint;
  v_user_tokens   bigint;
  v_global_tokens bigint;
begin
  if p_global_limit > 0 then
    select tokens into v_global_tokens
      from public.ai_usage_global where day = p_day;
    if coalesce(v_global_tokens, 0) >= p_global_limit then
      return -3;
    end if;
  end if;

  if p_token_limit > 0 then
    select prompt_tokens + completion_tokens into v_user_tokens
      from public.careers_ai_usage
     where user_id = p_user_id and day = p_day;
    if coalesce(v_user_tokens, 0) >= p_token_limit then
      return -2;
    end if;
  end if;

  -- Monthly quota, summed over the calendar month `p_day` falls in. Checked
  -- before the increment for the same reason the token budget is: admit while
  -- under, rather than reserving and refunding.
  if p_month_limit > 0 then
    select coalesce(sum(calls), 0) into v_month_calls
      from public.careers_ai_usage
     where user_id = p_user_id
       and day >= date_trunc('month', p_day)::date
       and day <  (date_trunc('month', p_day) + interval '1 month')::date;
    if v_month_calls >= p_month_limit then
      return -4;
    end if;
  end if;

  insert into public.careers_ai_usage (user_id, day, calls)
  values (p_user_id, p_day, 1)
  on conflict (user_id, day) do update
    set calls = public.careers_ai_usage.calls + 1
  where public.careers_ai_usage.calls < p_call_limit
  returning calls into v_calls;

  if v_calls is null then
    select calls into v_calls from public.careers_ai_usage
     where user_id = p_user_id and day = p_day;
    if coalesce(v_calls, 0) >= p_call_limit then
      return -1;
    end if;
  end if;

  insert into public.ai_usage_global (day, calls)
  values (p_day, 1)
  on conflict (day) do update set calls = public.ai_usage_global.calls + 1;

  return coalesce(v_calls, 1);
end $$;

revoke execute on function public.begin_ai_call_v2(uuid, date, int, int, bigint, bigint)
  from public, anon, authenticated;
grant  execute on function public.begin_ai_call_v2(uuid, date, int, int, bigint, bigint)
  to service_role;
