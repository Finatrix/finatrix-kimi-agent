/**
 * The AI entitlement decision, and the guards that make it enforceable.
 *
 * What this suite exists for: `careers-ai` authenticated the caller and then
 * applied one flat daily ceiling from an env var, identical for every account.
 * It never read `subscriptions`. So a Free user could call it directly and
 * spend paid inference, and the per-plan quotas sold on /pricing were enforced
 * in neither direction.
 *
 * The decision is a pure function precisely so it can be tested here rather
 * than only in production, and the SQL guards below are asserted by reading the
 * migration, because a policy nobody checks is how the original hole survived.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FREE_PLAN_FALLBACK_QUOTA,
  FREE_TIER_TASKS,
  PAID_PLAN_IDS,
  decideEntitlement,
  effectivePlanId,
  isFreeTierTask,
  isPaidPlan,
  type PlanSnapshot,
} from '../../supabase/functions/careers-ai/entitlement';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const MIGRATION = 'supabase/migrations/20260825000100_paywall_enforcement.sql';
const SCHEMA = 'supabase/careers_phase4_schema.sql';

const plan = (planId: string, aiQuotaMonthly: number | null): PlanSnapshot => ({ planId, aiQuotaMonthly });

/** A Careers task — deliberately one that `tasks-jobs.ts` passes dynamically. */
const CAREERS_TASK = 'score';

describe('the free money tools keep working on every plan', () => {
  /**
   * The trap this avoids: `careers-ai` is the whole app's AI transport, not
   * just Careers'. A blanket "paid plans only" check would have silently broken
   * the calculators' assistant and the Expense Tracker's statement categoriser.
   */
  it('allows every free-tier task with no subscription at all', () => {
    for (const task of FREE_TIER_TASKS) {
      const d = decideEntitlement(task, null);
      expect(d.allowed, task).toBe(true);
    }
  });

  it('allows free-tier tasks on the free plan', () => {
    for (const task of FREE_TIER_TASKS) {
      expect(decideEntitlement(task, plan('free', 20)).allowed, task).toBe(true);
    }
  });

  it('covers exactly the tasks the money tools actually send', () => {
    const sources = ['src/tools/ai/assistant.ts', 'src/tools/ai/statementCategorize.ts']
      .map(read)
      .join('\n');
    const sent = [...sources.matchAll(/task:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]);
    expect(sent.length, 'expected the money tools to send at least one task').toBeGreaterThan(0);
    for (const task of sent) {
      expect(isFreeTierTask(task), `${task} is sent by a free money tool but is not allowlisted`).toBe(true);
    }
    // And nothing is allowlisted that the money tools never send.
    for (const task of FREE_TIER_TASKS) {
      expect(sent, `${task} is allowlisted but no money tool sends it`).toContain(task);
    }
  });
});

describe('Careers tasks require a paid plan', () => {
  it('refuses a Careers task with no subscription', () => {
    const d = decideEntitlement(CAREERS_TASK, null);
    expect(d.allowed).toBe(false);
    if (!d.allowed) {
      expect(d.status).toBe(402);
      expect(d.planId).toBe('free');
      expect(d.reason).toMatch(/paid plan/i);
    }
  });

  it('refuses a Careers task on the free plan', () => {
    expect(decideEntitlement(CAREERS_TASK, plan('free', 20)).allowed).toBe(false);
  });

  it('allows a Careers task on every paid plan', () => {
    for (const id of PAID_PLAN_IDS) {
      expect(decideEntitlement(CAREERS_TASK, plan(id, 100)).allowed, id).toBe(true);
    }
  });

  /**
   * The safe default. `tasks-jobs.ts` and `tasks-phase3.ts` pass dynamic task
   * labels, so an unrecognised task must require payment rather than fall
   * through to free.
   */
  it('treats an unrecognised task as a Careers task', () => {
    for (const task of ['brand-new-careers-thing', '', 'MONEY-CHAT', 'money_chat']) {
      expect(decideEntitlement(task, plan('free', 20)).allowed, task).toBe(false);
    }
  });

  it('agrees with the paywall gate on which plans are paid', () => {
    const gate = read('src/careers/components/CareersPaywallGate.tsx');
    for (const id of PAID_PLAN_IDS) {
      expect(gate, `${id} is paid here but not in CareersPaywallGate`).toContain(`'${id}'`);
    }
    expect(isPaidPlan('free')).toBe(false);
  });
});

describe('the quota comes from the plan, not from an env var', () => {
  it('uses the plan’s monthly quota', () => {
    const d = decideEntitlement(CAREERS_TASK, plan('student', 100));
    expect(d.allowed && d.monthlyCallLimit).toBe(100);
    const p = decideEntitlement(CAREERS_TASK, plan('premium', 2000));
    expect(p.allowed && p.monthlyCallLimit).toBe(2000);
  });

  it('treats a null quota as unlimited (Enterprise)', () => {
    const d = decideEntitlement(CAREERS_TASK, plan('enterprise', null));
    expect(d.allowed && d.monthlyCallLimit).toBeNull();
  });

  /** A lookup that returns nothing must not become a blank cheque. */
  it('falls back to the smallest allowance when there is no subscription', () => {
    const d = decideEntitlement('money-chat', null);
    expect(d.allowed && d.monthlyCallLimit).toBe(FREE_PLAN_FALLBACK_QUOTA);
  });

  it('matches the free quota seeded in subscription_plans', () => {
    const schema = read(SCHEMA);
    const row = /\('free',\s*'Free',\s*0,\s*0,\s*(\d+),/.exec(schema);
    expect(row, 'could not find the seeded free plan row').not.toBeNull();
    expect(Number(row![1])).toBe(FREE_PLAN_FALLBACK_QUOTA);
  });

  it('reports the effective plan for a row with no plan_id', () => {
    expect(effectivePlanId(null)).toBe('free');
    expect(effectivePlanId({ planId: null, aiQuotaMonthly: null })).toBe('free');
    expect(effectivePlanId({ planId: 'premium', aiQuotaMonthly: 2000 })).toBe('premium');
  });
});

/**
 * The SQL side. These read the migration rather than a live database — the
 * repository has no test Postgres — so they check that the guards are written
 * and wired, which is exactly what was missing before.
 */
describe('the database refuses a self-granted plan', () => {
  const sql = () => read(MIGRATION);

  it('guards plan_id on UPDATE with a trigger, not just a policy', () => {
    const s = sql();
    expect(s).toMatch(/create trigger guard_subscription_entitlements/);
    expect(s).toMatch(/before update on public\.subscriptions/);
    expect(s).toMatch(/new\.plan_id is distinct from old\.plan_id/);
    expect(s).toMatch(/plan_id is not client-writable/);
  });

  it('guards plan_id on INSERT too, so a new row cannot start premium', () => {
    const s = sql();
    expect(s).toMatch(/create trigger guard_subscription_insert/);
    expect(s).toMatch(/before insert on public\.subscriptions/);
    expect(s).toMatch(/new\.plan_id <> 'free'/);
  });

  it('constrains only the browser roles, so the billing webhook still works', () => {
    const s = sql();
    // Both guards must exempt anything that is not a PostgREST client role.
    const exemptions = s.match(/current_user not in \('authenticated', 'anon'\)/g) ?? [];
    expect(exemptions.length).toBeGreaterThanOrEqual(3);
  });

  it('still lets a user cancel their own subscription', () => {
    const s = sql();
    expect(s).toMatch(/new\.status <> 'canceled'/);
    // cancel_at_period_end is absent from the locked-column list on purpose.
    const lockedBlock = /new\.user_id\s+is distinct from old\.user_id[\s\S]*?then/.exec(s)?.[0] ?? '';
    expect(lockedBlock).not.toContain('cancel_at_period_end');
  });

  it('stops a client forgiving its own usage counters', () => {
    const s = sql();
    expect(s).toMatch(/create trigger guard_usage_counter_decrease/);
    expect(s).toMatch(/usage counters may not be decreased by a client/);
  });

  it('meters the monthly quota atomically, in the same call as the daily one', () => {
    const s = sql();
    expect(s).toMatch(/create or replace function public\.begin_ai_call_v2/);
    expect(s).toMatch(/p_month_limit\s+int/);
    expect(s).toMatch(/date_trunc\('month', p_day\)/);
    expect(s).toMatch(/return -4;/);
    // Only the service role may meter.
    expect(s).toMatch(/revoke execute on function public\.begin_ai_call_v2[\s\S]*?from public, anon, authenticated;/);
    expect(s).toMatch(/grant\s+execute on function public\.begin_ai_call_v2[\s\S]*?to service_role;/);
  });
});

describe('the client no longer ships a self-upgrade path', () => {
  it('has removed changePlan', () => {
    const src = read('src/careers/services/subscriptions.ts');
    expect(src).not.toMatch(/export async function changePlan/);
    expect(src).toMatch(/careers-billing-webhook/);
  });

  it('keeps cancelSubscription, which the guard still permits', () => {
    const src = read('src/careers/services/subscriptions.ts');
    expect(src).toMatch(/export async function cancelSubscription/);
  });

  it('maps a 402 to an entitlement failure rather than a generic error', () => {
    const transport = read('src/lib/ai/transport.ts');
    expect(transport).toMatch(/ctx\.status === 402/);
    expect(transport).toMatch(/'entitlement'/);
  });
});
