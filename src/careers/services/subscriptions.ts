/**
 * Subscription Platform (Phase 4, Module 1). Plans, the user's current
 * subscription, usage counters (for quota gating) and billing history.
 * Read-only apart from creating a new user's free row: RLS leaves every other
 * subscription write to the Stripe webhook and to admins.
 */

import { supabase } from '../../lib/supabase';
import { ymLocal } from '../../lib/date';
import { invokeAuthed } from '../../lib/functions';
import { track } from '../../lib/analytics';
import { mapSupabaseError } from '../utils/errors';
import type {
  BillingHistoryRow,
  QuotaCheck,
  QuotaKind,
  SubscriptionPlanRow,
  SubscriptionRow,
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

/** Deterministic quota check — no AI, used to gate features before they run. */
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
