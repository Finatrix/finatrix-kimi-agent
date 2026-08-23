/**
 * Subscription Platform (Phase 4, Module 1). Plans, the user's current
 * subscription, usage counters (for quota gating) and billing history.
 * Manual provider only — Stripe/Razorpay checkout is Module 2 (deferred);
 * `changePlan` and `cancelSubscription` mutate the subscription row directly,
 * which is exactly what a payment webhook will do once wired up.
 */

import { supabase } from '../../lib/supabase';
import { ymLocal } from '../../lib/date';
import { invokeAuthed } from '../../lib/functions';
import { track } from '../../lib/analytics';
import { logAudit } from './audit';
import { mapSupabaseError } from '../utils/errors';
import type {
  BillingHistoryRow,
  PlanId,
  QuotaCheck,
  QuotaKind,
  SubscriptionPlanRow,
  SubscriptionRow,
  SubscriptionStatus,
  UsageCounterRow,
} from '../types/phase4';

export async function listPlans(): Promise<SubscriptionPlanRow[]> {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw mapSupabaseError(error, 'Loading plans');
  return (data ?? []) as SubscriptionPlanRow[];
}

export async function getMySubscription(userId: string): Promise<SubscriptionRow | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['trialing', 'active', 'past_due'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw mapSupabaseError(error, 'Loading your subscription');
  return (data as SubscriptionRow | null) ?? null;
}

/** Every signed-up user should have a Free subscription row; create one if missing. */
export async function ensureFreeSubscription(userId: string): Promise<SubscriptionRow> {
  const existing = await getMySubscription(userId);
  if (existing) return existing;
  const { data, error } = await supabase
    .from('subscriptions')
    .insert({ user_id: userId, plan_id: 'free', status: 'active' })
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Starting your subscription');
  return data as SubscriptionRow;
}

/**
 * Change plan (upgrade or downgrade) — takes effect immediately, no proration.
 *
 * Currently UNCALLED in production, and deliberately left that way: it writes
 * `plan_id` to the subscriptions row straight from the browser, and the RLS
 * policy permits that, so it is a working self-upgrade path. It stays exported
 * because a payment webhook running as the service role will need exactly this
 * mutation — but the policy has to constrain `plan_id` first. See
 * docs/SECURITY-TODO.md.
 */
export async function changePlan(userId: string, subscriptionId: string, planId: PlanId | string, trialDays = 0): Promise<SubscriptionRow> {
  const patch: Partial<SubscriptionRow> = {
    plan_id: planId,
    status: trialDays > 0 ? 'trialing' : 'active',
    trial_ends_at: trialDays > 0 ? new Date(Date.now() + trialDays * 86_400_000).toISOString() : null,
    cancel_at_period_end: false,
  };
  const { data, error } = await supabase
    .from('subscriptions')
    .update(patch)
    .eq('user_id', userId)
    .eq('id', subscriptionId)
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Changing your plan');
  logAudit(userId, 'subscription.plan_changed', { type: 'subscription', id: subscriptionId }, { planId });
  return data as SubscriptionRow;
}

export async function cancelSubscription(userId: string, subscriptionId: string, immediately = false): Promise<SubscriptionRow> {
  const patch: Partial<SubscriptionRow> = immediately
    ? { status: 'canceled' as SubscriptionStatus, cancel_at_period_end: true }
    : { cancel_at_period_end: true };
  const { data, error } = await supabase
    .from('subscriptions')
    .update(patch)
    .eq('user_id', userId)
    .eq('id', subscriptionId)
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Cancelling your subscription');
  logAudit(userId, 'subscription.canceled', { type: 'subscription', id: subscriptionId }, { immediately });
  return data as SubscriptionRow;
}

export async function applyCoupon(userId: string, subscriptionId: string, code: string): Promise<SubscriptionRow> {
  // Validate via the SECURITY DEFINER RPC. The coupons table is not client-
  // readable (a broad select policy would let anyone enumerate all codes); the
  // RPC checks active/expiry/redemption-limit server-side and returns only the
  // single submitted code when it is redeemable, or nothing when it is not.
  const { data: rows, error: cErr } = await supabase.rpc('validate_coupon', {
    p_code: code.trim().toUpperCase(),
  });
  const coupon = Array.isArray(rows) ? rows[0] : rows;
  if (cErr || !coupon) {
    throw mapSupabaseError(cErr ?? new Error('not found'), 'That coupon code is invalid or expired.');
  }
  const { data, error } = await supabase
    .from('subscriptions')
    .update({ coupon_code: coupon.code })
    .eq('user_id', userId)
    .eq('id', subscriptionId)
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Applying the coupon');
  return data as SubscriptionRow;
}

/**
 * Has this row just been demoted from a paid plan by `expire_subscriptions()`?
 *
 * There is no `status = 'expired'` to look for. That SQL function (see
 * supabase/migrations/20260728000100_subscription_expiry.sql) sets
 * `plan_id = 'free'` and leaves `status = 'active'`, so a lapse is legible only
 * from what it leaves behind: the free plan on a row that Stripe provisioned.
 * `provider` is not reset by the demotion, and a user who never paid keeps the
 * schema default of 'manual', which is what makes the pair unambiguous.
 *
 * Exported so `subscriptionExpiry.test.ts` can assert this against the row the
 * migration actually produces — the previous check tested a status nothing ever
 * writes, and no type or test could see that the branch was unreachable.
 */
export function hasLapsedFromPaid(sub: Pick<SubscriptionRow, 'plan_id' | 'provider'> | null): boolean {
  return sub?.plan_id === 'free' && sub.provider === 'stripe';
}

export type BillingPeriod = 'monthly' | 'yearly';

/**
 * Start a one-time-per-period Stripe Checkout for a paid plan. Not an
 * auto-renewing subscription — see careers-billing-checkout's header comment
 * for why (RBI e-mandate rules make plain recurring charges unreliable for
 * Indian cards). Returns the Checkout Session URL to redirect the browser to,
 * or an error message safe to show the user directly.
 */
export async function startCheckout(planId: string, period: BillingPeriod): Promise<{ url: string } | { error: string }> {
  // Instrumented HERE rather than at each button, because there are two entry
  // points (BillingPage and CareersProPaywall) and a funnel that counts one of
  // them is worse than one that counts neither — it looks complete and is
  // wrong. Every checkout attempt in the product goes through this function.
  track('checkout_started', { plan: planId, period });

  const { data, error, reason } = await invokeAuthed<{ url?: string; error?: string }>('careers-billing-checkout', { planId, period });

  // `where` names the stage that failed, so a spike is attributable without
  // anyone having to reproduce it: an auth problem, an unconfigured Stripe key
  // and a rejected session are three very different incidents.
  const fail = (where: string, message: string) => {
    track('checkout_failed', { plan: planId, period, where });
    return { error: message };
  };
  if (reason === 'no-session') return fail('auth', 'Sign in to subscribe.');
  if (reason === 'not-configured') return fail('not-configured', 'Payments are not available right now.');
  if (error || !data?.url) return fail('session', data?.error || 'Could not start checkout. Please try again.');

  return { url: data.url };
}

export async function listBillingHistory(userId: string): Promise<BillingHistoryRow[]> {
  const { data, error } = await supabase
    .from('billing_history')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw mapSupabaseError(error, 'Loading billing history');
  return (data ?? []) as BillingHistoryRow[];
}

// ─────────────────────────── usage counters + quota gating ───────────────────────────

/**
 * The billing month a usage counter belongs to, read in the user's own timezone.
 *
 * `toISOString().slice(0, 7)` was wrong here for the same reason it is wrong
 * everywhere east of UTC (see src/lib/date.ts): for the first 5h30m of every
 * month in IST — FinatriX's primary market — the UTC month is still the
 * previous one. Usage in that window was billed against the month that had
 * just ended, so a user who had exhausted their quota stayed locked out past
 * their own reset, and the consumption never counted toward the new month.
 * `usage_counters` is written only from here (RLS gives the client insert and
 * update on its own row), so this function is the sole authority on the key
 * and switching it is safe.
 */
function currentPeriod(): string {
  return ymLocal(new Date()); // YYYY-MM, local
}

export async function getUsageCounter(userId: string): Promise<UsageCounterRow> {
  const period = currentPeriod();
  const { data, error } = await supabase
    .from('usage_counters')
    .select('*')
    .eq('user_id', userId)
    .eq('period', period)
    .maybeSingle();
  if (error) throw mapSupabaseError(error, 'Loading usage');
  if (data) return data as UsageCounterRow;
  return { user_id: userId, period, ai_calls: 0, storage_bytes: 0, resumes_count: 0, applications_count: 0, updated_at: new Date().toISOString() };
}

/**
 * Bump one usage counter for the current period.
 *
 * NOT atomic, despite what this comment used to claim: it is a read followed by
 * an upsert, so two features metering concurrently both read N and both write
 * N+1, and one unit of usage goes unrecorded. The under-count is bounded by how
 * many requests a single user can genuinely overlap, and it only ever errs
 * toward the user. It is recorded here rather than quietly relied upon —
 * closing it properly means a Postgres RPC of the `increment_ai_usage` shape
 * (see the careers-ai edge function, which already meters atomically for the
 * quota that actually costs money).
 */
export async function incrementUsage(userId: string, kind: QuotaKind, by = 1): Promise<void> {
  const current = await getUsageCounter(userId);
  const patch = { ...current, [kind]: (current[kind] as number) + by };
  const { error } = await supabase.from('usage_counters').upsert(patch, { onConflict: 'user_id,period' });
  if (error) throw mapSupabaseError(error, 'Recording usage');
}

/**
 * Deterministic quota check: how much of a plan's allowance is used.
 *
 * The docstring here used to say "used to gate features before they run". It
 * is not, and cannot be — it runs in the browser, and its only production
 * caller is `BillingPage`, which uses it to draw a usage bar. Nothing calls it
 * before doing the work. Server-side enforcement of the per-plan quotas
 * advertised on /pricing does not exist yet (see docs/SECURITY-TODO.md); until
 * it does, this is a display helper and the name of what it returns should not
 * suggest otherwise.
 */
export function checkQuota(kind: QuotaKind, plan: SubscriptionPlanRow, usage: UsageCounterRow): QuotaCheck {
  const limitMap: Record<QuotaKind, number | null> = {
    ai_calls: plan.ai_quota_monthly,
    storage_bytes: plan.storage_mb != null ? plan.storage_mb * 1024 * 1024 : null,
    resumes_count: plan.resume_limit,
    applications_count: plan.application_limit,
  };
  const limit = limitMap[kind];
  const used = usage[kind] as number;
  const remaining = limit == null ? null : Math.max(0, limit - used);
  return { kind, used, limit, remaining, exceeded: limit != null && used >= limit };
}
