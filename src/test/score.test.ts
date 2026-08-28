import { describe, it, expect } from 'vitest';
import {
  computeExecutionScore, computePlanScore, fidelityScore, gradeFor,
  momentumScore, savingsRateScore, wantsShareScore,
} from '../tools/lib/score';
import { computeBudget, mergedCats } from '../tools/lib/budget';
import type { ExpenseItem } from '../tools/lib/expense';

/**
 * The two scores.
 *
 * The property that matters more than any individual number: **no component
 * reads an amount**. Every input is a ratio, so the same scale is honest for
 * somebody budgeting 800 a month and somebody budgeting eighty million, in any
 * currency. The scale-invariance suite at the bottom is the guard on that, and
 * it is the one that must never be relaxed.
 */

const CATS = mergedCats({ needs: [], wants: [], save: [] });
const NOW = new Date(2026, 4, 31); // 31 May 2026 — a completed month
const MONTH = '2026-05';

let seq = 0;
const tx = (date: string, category: string, amount: number): ExpenseItem =>
  ({ id: `t${++seq}`, date, category, amount });

/** A month that lands almost exactly on a plan, with a healthy savings rate. */
function goodMonth(scale = 1) {
  return {
    month: MONTH,
    now: NOW,
    cats: CATS,
    income: 100_000 * scale,
    budgetVals: {
      rent: 30_000 * scale, groceries: 12_000 * scale,
      eating_out: 6_000 * scale, shopping: 4_000 * scale,
      emergency: 20_000 * scale, stocks: 18_000 * scale,
    },
    items: [
      tx('2026-05-02', 'rent', 30_000 * scale),
      tx('2026-05-05', 'groceries', 11_800 * scale),
      tx('2026-05-09', 'eating_out', 5_900 * scale),
      tx('2026-05-14', 'shopping', 3_900 * scale),
      tx('2026-05-03', 'emergency', 20_000 * scale),
      tx('2026-05-03', 'stocks', 18_000 * scale),
    ],
  };
}

describe('the curves', () => {
  it('rewards the first percentage points of saving most', () => {
    expect(Math.round(savingsRateScore(0.10))).toBe(50);
    expect(Math.round(savingsRateScore(0.20))).toBe(75);
    // Never saturates: one more point of saving always moves the number, so
    // there is no threshold to game and no dead zone at the top.
    expect(savingsRateScore(0.45)).toBeGreaterThan(savingsRateScore(0.40));
    expect(savingsRateScore(0.40)).toBeLessThan(100);
    expect(savingsRateScore(0)).toBe(0);
  });

  it('scores restraint on wants, flat at both ends', () => {
    expect(wantsShareScore(0.05)).toBe(100);
    expect(wantsShareScore(0.10)).toBe(100);
    expect(wantsShareScore(0.45)).toBe(0);
    expect(wantsShareScore(0.25)).toBeGreaterThan(0);
    expect(wantsShareScore(0.25)).toBeLessThan(100);
  });

  it('punishes overspend hard and underspend gently', () => {
    expect(fidelityScore(1000, 1000)).toBe(100);
    // 10% over costs real points; 10% under costs almost none.
    expect(fidelityScore(1000, 1100)).toBeLessThan(80);
    expect(fidelityScore(1000, 900)).toBeGreaterThan(95);
    // Spending nothing at all is a plan that is not describing reality, but it
    // is not a failure — the slope says so without scolding.
    expect(fidelityScore(1000, 0)).toBe(60);
    expect(fidelityScore(1000, 2000)).toBeLessThan(15);
  });

  it('centres momentum on holding steady, not on zero', () => {
    // Scoring a flat month near zero would make the only way to score well a
    // permanent decline in spending, which is neither possible nor desirable.
    expect(momentumScore(0, 0)).toBe(60);
    expect(momentumScore(null, null)).toBe(60);
    expect(momentumScore(-0.2, null)).toBe(100); // spending down 20%
    expect(momentumScore(0.2, null)).toBe(20);   // spending up 20%
    expect(momentumScore(null, 0.25)).toBe(100); // saving up 25%
  });
});

describe('the execution score', () => {
  it('rates a month that followed the plan with real saving highly', () => {
    const r = computeExecutionScore(goodMonth());
    expect(r.score).toBeGreaterThanOrEqual(82);
    expect(r.insufficient).toBe(false);
    expect(r.components.map((c) => c.key).sort())
      .toEqual(['fidelity', 'restraint', 'savings']);
  });

  it('marks a month down for blowing the plan', () => {
    const base = goodMonth();
    const blown = computeExecutionScore({
      ...base,
      items: [...base.items, tx('2026-05-20', 'shopping', 20_000)],
    });
    expect(blown.score).toBeLessThan(computeExecutionScore(base).score);
    expect(blown.components.find((c) => c.key === 'fidelity')!.detail).toMatch(/over plan/);
  });

  it('never marks a month down for exceeding a SAVINGS allocation', () => {
    const base = goodMonth();
    const saver = computeExecutionScore({
      ...base,
      items: [...base.items, tx('2026-05-25', 'stocks', 10_000)],
    });
    // Saving more than planned is the best thing in the ledger. It must not
    // read as "over budget" the way an extra 10,000 of shopping would.
    expect(saver.score).toBeGreaterThanOrEqual(computeExecutionScore(base).score);
  });

  it('drops a component it cannot measure instead of scoring it zero', () => {
    const r = computeExecutionScore({ ...goodMonth(), income: 0 });
    // No income recorded → no savings rate and no restraint figure. Scoring
    // them zero would make the product's answer to "I have not told you my
    // income" be "you are failing".
    expect(r.components.map((c) => c.key)).toEqual(['fidelity']);
    expect(r.components[0].weight).toBe(1);
    expect(r.unmeasured.map((u) => u.label).sort())
      .toEqual(['Discretionary restraint', 'Momentum', 'Savings rate']);
    expect(r.score).toBeGreaterThan(80);
  });

  it('says so plainly when there is nothing to score', () => {
    const r = computeExecutionScore({ ...goodMonth(), items: [] });
    expect(r.insufficient).toBe(true);
    expect(r.gradeLabel).toBe('Not scored');
    expect(r.nextStep).toBeTruthy();
  });

  it('pro-rates the plan for a month still running', () => {
    // Halfway through May, half the budget spent is ON plan — not 50% under.
    const midMonth = new Date(2026, 4, 15);
    const base = goodMonth();
    const half = computeExecutionScore({
      ...base,
      now: midMonth,
      items: base.items.map((e) => ({ ...e, amount: e.amount / 2 })),
    });
    expect(half.components.find((c) => c.key === 'fidelity')!.score).toBeGreaterThan(90);
  });

  it('always explains itself', () => {
    const r = computeExecutionScore(goodMonth());
    for (const c of r.components) {
      expect(c.detail.length).toBeGreaterThan(20);
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(100);
    }
    // The weights always add to one, whatever was dropped.
    const total = r.components.reduce((s, c) => s + c.weight, 0);
    expect(total).toBeCloseTo(1, 6);
  });
});

describe('the plan score', () => {
  const planOf = (vals: Record<string, number>, income = '100000', split = ['50', '30', '20']) => {
    const budget = computeBudget(
      { incomeRaw: income, needsRaw: split[0], wantsRaw: split[1], saveRaw: split[2], vals },
      CATS,
    );
    return { budget, cats: CATS, vals, month: MONTH, items: [] as ExpenseItem[] };
  };

  it('rates a coherent, fully allocated, savings-heavy plan highly', () => {
    const r = computePlanScore(planOf({
      rent: 30_000, groceries: 12_000, utilities: 8_000,
      eating_out: 6_000, shopping: 4_000,
      emergency: 20_000, stocks: 20_000,
    }));
    expect(r.score).toBeGreaterThanOrEqual(82);
  });

  it('marks down a plan whose percentages do not add up', () => {
    const r = computePlanScore(planOf(
      { rent: 30_000, emergency: 20_000 }, '100000', ['50', '30', '30'],
    ));
    expect(r.headline).toMatch(/100%/);
    expect(r.components.find((c) => c.key === 'coverage')!.score).toBeLessThan(70);
  });

  it('marks down a plan that spends more than it earns', () => {
    const r = computePlanScore(planOf({ rent: 90_000, groceries: 40_000 }));
    expect(r.headline).toMatch(/more than it earns/);
  });

  it('rewards a larger savings allocation', () => {
    const low = computePlanScore(planOf({ rent: 70_000, emergency: 10_000, shopping: 20_000 }));
    const high = computePlanScore(planOf({ rent: 50_000, emergency: 30_000, shopping: 20_000 }));
    expect(high.score).toBeGreaterThan(low.score);
  });

  it('drops realism entirely when there is no history to test against', () => {
    const r = computePlanScore(planOf({ rent: 50_000, emergency: 30_000 }));
    expect(r.components.map((c) => c.key)).not.toContain('realism');
    expect(r.unmeasured.map((u) => u.label)).toContain('Realism');
  });

  it('marks down a plan that ignores what the user actually spends', () => {
    const items = [
      tx('2026-04-05', 'groceries', 12_000),
      tx('2026-03-05', 'groceries', 12_500),
      tx('2026-02-05', 'groceries', 11_500),
    ];
    const optimistic = computePlanScore({ ...planOf({ groceries: 3_000, emergency: 30_000 }), items });
    const honest = computePlanScore({ ...planOf({ groceries: 12_000, emergency: 30_000 }), items });
    expect(honest.score).toBeGreaterThan(optimistic.score);
    expect(optimistic.components.find((c) => c.key === 'realism')!.detail).toMatch(/below what you actually spend/);
  });

  it('refuses to score at all without an income', () => {
    const r = computePlanScore(planOf({ rent: 30_000 }, '0'));
    expect(r.insufficient).toBe(true);
    expect(r.nextStep).toMatch(/take home/i);
  });
});

describe('scale invariance — the property the whole design rests on', () => {
  /**
   * The same financial behaviour must score the same whether the household
   * moves eight hundred a month or eight hundred million. A rule that reads an
   * amount is a rule that is wrong for most of the world, and this is the guard
   * that keeps one from creeping in.
   */
  it('scores identical behaviour identically at every scale', () => {
    const scales = [0.008, 1, 1_000, 1_000_000];
    const scores = scales.map((s) => computeExecutionScore(goodMonth(s)).score);
    expect(new Set(scores).size).toBe(1);
  });

  it('scores an identical plan identically at every scale', () => {
    const planAt = (s: number) => {
      const vals = {
        rent: 30_000 * s, groceries: 12_000 * s, utilities: 8_000 * s,
        eating_out: 6_000 * s, shopping: 4_000 * s,
        emergency: 20_000 * s, stocks: 20_000 * s,
      };
      const budget = computeBudget(
        { incomeRaw: 100_000 * s, needsRaw: '50', wantsRaw: '30', saveRaw: '20', vals },
        CATS,
      );
      return computePlanScore({ budget, cats: CATS, vals, month: MONTH, items: [] }).score;
    };
    const scores = [0.008, 1, 1_000, 1_000_000].map(planAt);
    expect(new Set(scores).size).toBe(1);
  });
});

describe('grades', () => {
  it('bands the whole 0–100 range with no gaps', () => {
    for (let n = 0; n <= 100; n += 1) {
      const g = gradeFor(n);
      expect(g.label.length).toBeGreaterThan(0);
    }
    expect(gradeFor(100).grade).toBe('exceptional');
    expect(gradeFor(0).grade).toBe('attention');
  });
});
