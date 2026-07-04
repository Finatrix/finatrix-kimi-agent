/**
 * Phase 4 — Enterprise Platform regression tests. Covers the pure,
 * deterministic logic: quota checks (Module 1), feature flag resolution
 * (Module 3), AI usage aggregation (Module 5), and client-side rate
 * limiting (Module 13).
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { checkQuota } from '../careers/services/subscriptions';
import { resolveFlag } from '../careers/services/featureFlags2';
import { summarizeUsage } from '../careers/services/aiUsage';
import { allowAction, resetRateLimit, retryAfterMs } from '../careers/utils/rateLimit';
import type { SubscriptionPlanRow, UsageCounterRow } from '../careers/types/phase4';
import type { AiUsageLogRow } from '../careers/types/phase4';
import type { FeatureFlagOverrideRow } from '../careers/types/phase4';
import type { FeatureFlagRow } from '../careers/types/jobs';

function plan(over: Partial<SubscriptionPlanRow> = {}): SubscriptionPlanRow {
  return {
    id: 'free', name: 'Free', price_monthly: 0, price_yearly: 0, currency: 'INR',
    ai_quota_monthly: 20, storage_mb: 200, resume_limit: 2, application_limit: 10,
    features: [], trial_days: 0, is_active: true, sort_order: 0,
    ...over,
  };
}

function usage(over: Partial<UsageCounterRow> = {}): UsageCounterRow {
  return { user_id: 'u1', period: '2026-07', ai_calls: 0, storage_bytes: 0, resumes_count: 0, applications_count: 0, updated_at: '', ...over };
}

describe('quota checks (Module 1)', () => {
  it('flags exceeded when usage meets the limit', () => {
    const q = checkQuota('ai_calls', plan(), usage({ ai_calls: 20 }));
    expect(q.exceeded).toBe(true);
    expect(q.remaining).toBe(0);
  });

  it('is never exceeded under the limit', () => {
    const q = checkQuota('resumes_count', plan(), usage({ resumes_count: 1 }));
    expect(q.exceeded).toBe(false);
    expect(q.remaining).toBe(1);
  });

  it('treats a null plan limit as unlimited', () => {
    const q = checkQuota('ai_calls', plan({ ai_quota_monthly: null }), usage({ ai_calls: 10_000 }));
    expect(q.exceeded).toBe(false);
    expect(q.limit).toBeNull();
    expect(q.remaining).toBeNull();
  });

  it('converts storage_mb to bytes for the storage_bytes quota', () => {
    const q = checkQuota('storage_bytes', plan({ storage_mb: 1 }), usage({ storage_bytes: 1024 * 1024 }));
    expect(q.limit).toBe(1024 * 1024);
    expect(q.exceeded).toBe(true);
  });
});

describe('feature flag resolution (Module 3)', () => {
  const globals: FeatureFlagRow[] = [{ flag: 'new_ui', enabled: true, free_limit: null, notes: '' }];

  it('falls back to the global flag when no override exists', () => {
    expect(resolveFlag('new_ui', globals, [], { userId: 'u1' })).toBe(true);
  });

  it('defaults unknown flags to on, consistent with Phase 2 careers_feature_flags', () => {
    expect(resolveFlag('unknown_flag', globals, [], { userId: 'u1' })).toBe(true);
  });

  it('a user override beats the global flag', () => {
    const overrides: FeatureFlagOverrideRow[] = [
      { id: '1', flag: 'new_ui', scope: 'user', scope_id: 'u1', enabled: false, rollout_percent: 100, is_beta: false, is_kill_switch: false, updated_at: '' },
    ];
    expect(resolveFlag('new_ui', globals, overrides, { userId: 'u1' })).toBe(false);
    // A different user is unaffected by another user's override.
    expect(resolveFlag('new_ui', globals, overrides, { userId: 'u2' })).toBe(true);
  });

  it('a kill switch overrides everything regardless of scope', () => {
    const overrides: FeatureFlagOverrideRow[] = [
      { id: '1', flag: 'risky', scope: 'plan', scope_id: 'enterprise', enabled: true, rollout_percent: 100, is_beta: false, is_kill_switch: true, updated_at: '' },
    ];
    expect(resolveFlag('risky', [], overrides, { userId: 'anyone', planId: 'free' })).toBe(true);
  });

  it('org override applies to org members and does not leak to others', () => {
    const betaOffGlobally: FeatureFlagRow[] = [{ flag: 'beta_x', enabled: false, free_limit: null, notes: '' }];
    const overrides: FeatureFlagOverrideRow[] = [
      { id: '1', flag: 'beta_x', scope: 'org', scope_id: 'org-1', enabled: true, rollout_percent: 100, is_beta: true, is_kill_switch: false, updated_at: '' },
    ];
    expect(resolveFlag('beta_x', betaOffGlobally, overrides, { userId: 'u1', orgId: 'org-1' })).toBe(true);
    // org-2 has no override, so it falls back to the global flag (off).
    expect(resolveFlag('beta_x', betaOffGlobally, overrides, { userId: 'u1', orgId: 'org-2' })).toBe(false);
  });

  it('0% rollout is always off, 100% is always on', () => {
    const off: FeatureFlagOverrideRow = { id: '1', flag: 'f', scope: 'user', scope_id: 'u1', enabled: true, rollout_percent: 0, is_beta: false, is_kill_switch: false, updated_at: '' };
    const on: FeatureFlagOverrideRow = { ...off, id: '2', rollout_percent: 100 };
    expect(resolveFlag('f', [], [off], { userId: 'u1' })).toBe(false);
    expect(resolveFlag('f', [], [on], { userId: 'u1' })).toBe(true);
  });
});

describe('AI usage summarization (Module 5)', () => {
  function row(over: Partial<AiUsageLogRow>): AiUsageLogRow {
    return {
      id: '1', user_id: 'u1', org_id: null, task: 'job-analysis', model: 'm1',
      prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, latency_ms: 1000,
      cache_hit: false, success: true, error: '', cost_estimate: 0.001, created_at: '2026-07-01T00:00:00Z',
      ...over,
    };
  }

  it('computes totals, cache hit rate and failure rate', () => {
    const summary = summarizeUsage([
      row({}),
      row({ cache_hit: true }),
      row({ success: false, error: 'timeout' }),
    ]);
    expect(summary.totalCalls).toBe(3);
    expect(summary.totalTokens).toBe(450);
    expect(summary.cacheHitRate).toBe(33);
    expect(summary.failureRate).toBe(33);
  });

  it('groups by model and task, ranked by call count', () => {
    const summary = summarizeUsage([
      row({ model: 'a', task: 'coach' }),
      row({ model: 'a', task: 'coach' }),
      row({ model: 'b', task: 'email' }),
    ]);
    expect(summary.byModel[0]).toMatchObject({ model: 'a', calls: 2 });
    expect(summary.byTask[0]).toMatchObject({ task: 'coach', calls: 2 });
  });

  it('returns zeroed summary for no rows', () => {
    const summary = summarizeUsage([]);
    expect(summary.totalCalls).toBe(0);
    expect(summary.avgLatencyMs).toBe(0);
    expect(summary.cacheHitRate).toBe(0);
  });
});

describe('client-side rate limiting (Module 13)', () => {
  beforeEach(() => resetRateLimit('test-key'));

  it('allows up to capacity actions then blocks', () => {
    for (let i = 0; i < 3; i++) expect(allowAction('test-key', 3, 60_000)).toBe(true);
    expect(allowAction('test-key', 3, 60_000)).toBe(false);
  });

  it('reports a positive retry-after once exhausted', () => {
    for (let i = 0; i < 2; i++) allowAction('test-key', 2, 60_000);
    expect(allowAction('test-key', 2, 60_000)).toBe(false);
    expect(retryAfterMs('test-key', 60_000)).toBeGreaterThan(0);
  });

  it('is scoped per key — a different key has its own bucket', () => {
    for (let i = 0; i < 2; i++) allowAction('key-a', 2, 60_000);
    expect(allowAction('key-a', 2, 60_000)).toBe(false);
    expect(allowAction('key-b', 2, 60_000)).toBe(true);
  });
});
