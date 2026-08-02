/**
 * The public pricing page renders from a TypeScript constant while checkout
 * prices the plan from the database. That duplication is deliberate — see the
 * header of `src/shared/plans.ts` — and it is only safe because this test fails
 * the moment the two disagree.
 *
 * The failure mode it prevents is the expensive kind: a price raised in the
 * seed SQL and not on the marketing page means we advertise ₹199 and charge
 * ₹249, which is a refund, a chargeback and a trust problem in that order.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CAREERS_PLANS, CAREERS_FROM_PRICE, formatInr, yearlySavingPct } from '../shared/plans';

const SEED = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'careers_phase4_schema.sql'),
  'utf8',
);

/**
 * The seeded plan rows, parsed out of the `insert into subscription_plans`
 * values. Each row starts `('id', 'Name', monthly, yearly, ...`.
 */
function seededPlans(): Map<string, { name: string; monthly: number; yearly: number }> {
  const out = new Map<string, { name: string; monthly: number; yearly: number }>();
  const rowRe = /\(\s*'([a-z]+)',\s*'([^']+)',\s*(\d+),\s*(\d+),/g;
  for (const m of SEED.matchAll(rowRe)) {
    out.set(m[1], { name: m[2], monthly: Number(m[3]), yearly: Number(m[4]) });
  }
  return out;
}

describe('careers plan copy', () => {
  const seeded = seededPlans();

  it('parses the seed at all', () => {
    // A regex that silently matches nothing would make every assertion below
    // vacuously pass, which is worse than no test.
    expect(seeded.size).toBeGreaterThanOrEqual(5);
    expect(seeded.get('free')).toBeTruthy();
  });

  it('matches the database seed on id, name and both prices', () => {
    for (const plan of CAREERS_PLANS) {
      const row = seeded.get(plan.id);
      expect(row, `plan "${plan.id}" is advertised but not seeded`).toBeTruthy();
      expect(row!.name, `${plan.id} name`).toBe(plan.name);
      expect(row!.monthly, `${plan.id} monthly price`).toBe(plan.priceMonthly);
      expect(row!.yearly, `${plan.id} yearly price`).toBe(plan.priceYearly);
    }
  });

  it('advertises every seeded paid plan', () => {
    const advertised = new Set(CAREERS_PLANS.map((p) => p.id));
    for (const [id] of seeded) {
      // `free` grants no Careers access (CareersPaywallGate), so it is
      // deliberately not listed as a Careers plan.
      if (id === 'free') continue;
      expect(advertised.has(id), `seeded plan "${id}" is not on the pricing page`).toBe(true);
    }
  });

  it('marks exactly one plan as the default recommendation', () => {
    expect(CAREERS_PLANS.filter((p) => p.featured).length).toBe(1);
  });

  it('gives every plan a "best for" line and real features', () => {
    for (const plan of CAREERS_PLANS) {
      expect(plan.bestFor.length, plan.id).toBeGreaterThan(20);
      expect(plan.features.length, plan.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('derives the "from" price from the cheapest self-serve plan', () => {
    expect(CAREERS_FROM_PRICE).toBe(199);
    expect(CAREERS_FROM_PRICE).toBe(
      Math.min(...CAREERS_PLANS.filter((p) => p.priceMonthly > 0).map((p) => p.priceMonthly)),
    );
  });

  it('computes the yearly saving rather than asserting one', () => {
    const professional = CAREERS_PLANS.find((p) => p.id === 'professional')!;
    // 999 × 12 = 11,988 vs 9,999 → 17%.
    expect(yearlySavingPct(professional)).toBe(17);
    // A "contact us" plan has no saving to quote.
    expect(yearlySavingPct(CAREERS_PLANS.find((p) => p.id === 'enterprise')!)).toBe(0);
  });

  it('formats rupees with Indian digit grouping', () => {
    expect(formatInr(199)).toBe('₹199');
    expect(formatInr(24999)).toBe('₹24,999');
    expect(formatInr(1000000)).toBe('₹10,00,000');
  });
});
