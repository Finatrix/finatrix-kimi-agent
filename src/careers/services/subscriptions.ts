/**
 * Subscription Platform (Phase 4, Module 1). Plans, the user's current
 * subscription, usage counters (for quota gating) and billing history.
 * Manual provider only — Stripe/Razorpay checkout is Module 2 (deferred);
 * `changePlan` and `cancelSubscription` mutate the subscription row directly,
 * which is exactly what a payment webhook will do once wired up.
 */

import { supabase } from '../../lib/supabase';
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

/** Change plan (upgrade or downgrade) — takes effect immediately, no proration logic yet. */
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
  const { data: coupon, error: cErr } = await supabase
    .from('coupons')
    .select('*')
    .eq('code', code.trim().toUpperCase())
    .eq('active', true)
    .maybeSingle();
  if (cErr || !coupon) throw mapSupabaseError(cErr ?? new Error('not found'), 'That coupon code is invalid or expired.');
  if (coupon.valid_until && new Date(coupon.valid_until).getTime() < Date.now()) {
    throw mapSupabaseError(new Error('expired'), 'That coupon has expired.');
  }
  if (coupon.max_redemptions != null && coupon.times_redeemed >= coupon.max_redemptions) {
    throw mapSupabaseError(new Error('exhausted'), 'That coupon has reached its redemption limit.');
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

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
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

/** Atomically bump one usage counter for the current period (upsert + increment). */
export async function incrementUsage(userId: string, kind: QuotaKind, by = 1): Promise<void> {
  const current = await getUsageCounter(userId);
  const patch = { ...current, [kind]: (current[kind] as number) + by };
  const { error } = await supabase.from('usage_counters').upsert(patch, { onConflict: 'user_id,period' });
  if (error) throw mapSupabaseError(error, 'Recording usage');
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
