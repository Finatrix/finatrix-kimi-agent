-- Paid access was writable by the person it was meant to charge.
--
-- `subscriptions_insert` and `subscriptions_update` let any signed-in user write
-- every column of their own row, so one PostgREST PATCH set plan_id, status and
-- current_period_end with no payment. `usage_counters` could be reset the same
-- way, and any user could write audit_log entries naming any action.
--
-- Only the Stripe webhook (service role, bypasses RLS) and platform admins may
-- now change a subscription. The one client write left is the row BillingPage
-- creates for a new user, which is pinned to exactly the free plan's values.
-- The client's changePlan, cancelSubscription, applyCoupon and incrementUsage
-- had no callers and are removed alongside this.

drop policy if exists "subscriptions_insert" on public.subscriptions;
create policy "subscriptions_insert" on public.subscriptions for insert
  with check (
    public.is_platform_admin(auth.uid())
    or (
      auth.uid() = user_id
      and plan_id = 'free'
      and status = 'active'
      and provider = 'manual'
      and provider_customer_id = ''
      and provider_subscription_id = ''
      and org_id is null
      and trial_ends_at is null
      and current_period_end is null
      and cancel_at_period_end = false
      and coupon_code is null
    )
  );

drop policy if exists "subscriptions_update" on public.subscriptions;
create policy "subscriptions_update" on public.subscriptions for update
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

drop policy if exists "usage_counters_upsert" on public.usage_counters;
drop policy if exists "usage_counters_update" on public.usage_counters;

-- Every remaining logAudit caller is an admin action. The size cap stops the
-- table being used as free storage by a compromised admin session or a bug.
drop policy if exists "audit_log_insert" on public.audit_log;
create policy "audit_log_insert" on public.audit_log for insert
  with check (
    auth.uid() = actor_user_id
    and public.is_platform_admin(auth.uid())
    and length(action) <= 100
    and pg_column_size(meta) <= 8192
  );
