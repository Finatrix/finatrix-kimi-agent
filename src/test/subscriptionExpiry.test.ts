/**
 * The client's idea of "this plan lapsed" must match what the database actually
 * does when it lapses one.
 *
 * BillingPage reported churn by testing `subscription.status === 'expired'`.
 * Nothing has ever written that status: `expire_subscriptions()` demotes the
 * row to `plan_id = 'free'` and leaves `status = 'active'`, and
 * `getMySubscription` filters to active statuses anyway, so an 'expired' row
 * could not have been read there even if one existed. The branch was
 * unreachable and `subscription_expired` read as a flat zero — which on a
 * dashboard is indistinguishable from "nobody churned".
 *
 * Types could not catch it ('expired' is a legal `SubscriptionStatus`) and
 * neither could the taxonomy test, which proves an event is EMITTED somewhere
 * in the source, not that its condition can ever be true. So the guard is the
 * migration itself: these tests read the SQL, derive the row it produces, and
 * assert the predicate matches. If someone later changes the demotion to write
 * a different shape, this fails instead of silently zeroing the metric again.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasLapsedFromPaid } from '../careers/services/subscriptions';
import type { SubscriptionRow } from '../careers/types/phase4';

const SQL = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '20260728000100_subscription_expiry.sql'),
  'utf8',
);

/** The columns `expire_subscriptions()` assigns, as `col = value` pairs. */
function demotionAssignments(): Record<string, string> {
  const body = SQL.slice(SQL.indexOf('update public.subscriptions'), SQL.indexOf('get diagnostics'));
  const set = body.slice(body.indexOf('set '), body.indexOf('where '));
  const out: Record<string, string> = {};
  for (const m of set.matchAll(/(\w+)\s*=\s*([^,\n]+)/g)) out[m[1]] = m[2].trim();
  return out;
}

describe('expire_subscriptions() — what a lapse actually looks like', () => {
  const assigned = demotionAssignments();

  it('demotes to the free plan rather than writing a status of "expired"', () => {
    expect(assigned.plan_id).toBe("'free'");
    expect(assigned.status).toBe("'active'");
    // The precise claim the old client code got wrong.
    expect(Object.values(assigned)).not.toContain("'expired'");
  });

  it('leaves `provider` untouched, which is the only trace that they had paid', () => {
    // If a future migration also reset provider to 'manual', the demoted row
    // would be indistinguishable from a never-paid one and churn would go dark.
    expect(assigned).not.toHaveProperty('provider');
  });

  it('stamps updated_at, so a lapse can be reported once instead of forever', () => {
    expect(assigned.updated_at).toBe('now()');
  });
});

/** A subscription row in the shape PostgREST returns. */
function row(over: Partial<SubscriptionRow>): SubscriptionRow {
  return {
    id: 'sub_1', user_id: 'user_1', org_id: null, plan_id: 'free', status: 'active',
    trial_ends_at: null, current_period_start: '2026-08-01T00:00:00Z', current_period_end: null,
    cancel_at_period_end: false, coupon_code: null, provider: 'manual',
    provider_customer_id: '', provider_subscription_id: '',
    created_at: '2026-07-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
    ...over,
  } as SubscriptionRow;
}

describe('hasLapsedFromPaid', () => {
  it('matches the row the migration produces', () => {
    const assigned = demotionAssignments();
    const demoted = row({
      plan_id: assigned.plan_id.replace(/'/g, '') as string,
      status: assigned.status.replace(/'/g, '') as SubscriptionRow['status'],
      provider: 'stripe',              // untouched by the demotion
      current_period_end: null,
      provider_subscription_id: 'cs_test_123',
    });
    expect(hasLapsedFromPaid(demoted)).toBe(true);
  });

  it('does not fire for a user who never paid', () => {
    expect(hasLapsedFromPaid(row({ plan_id: 'free', provider: 'manual' }))).toBe(false);
  });

  it('does not fire while a paid plan is still current', () => {
    expect(hasLapsedFromPaid(row({
      plan_id: 'professional', provider: 'stripe', current_period_end: '2099-01-01T00:00:00Z',
    }))).toBe(false);
  });

  it('does not fire on a missing subscription', () => {
    expect(hasLapsedFromPaid(null)).toBe(false);
  });

  it('would have rejected the old, unreachable predicate', () => {
    // The row the old code waited for cannot be produced by the migration and
    // cannot be read by getMySubscription. Pinned so the mistake is not retried.
    const impossible = row({ status: 'expired' as SubscriptionRow['status'], plan_id: 'professional' });
    expect(impossible.status).toBe('expired');
    expect(hasLapsedFromPaid(impossible)).toBe(false);
  });
});
