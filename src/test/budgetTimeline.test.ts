import { describe, it, expect } from 'vitest';
import {
  computeTimeline, GRANULARITIES, type Granularity, type TimelineShape,
} from '../tools/lib/budgetTimeline';
import { computeMonthForecast, type CatMeta } from '../tools/lib/expenseAnalytics';
import { allCategories, mergedCats } from '../tools/lib/budget';
import type { ExpenseItem } from '../tools/lib/expense';

/**
 * The timeline is the chart a user reads to decide whether to slow down. Its
 * three lines have to mean the same thing at every granularity, and the
 * projection must never quietly become a second, different actual.
 */

let seq = 0;
function tx(date: string, amount: number, category = 'groceries'): ExpenseItem {
  return { id: `t${++seq}`, date, category, amount };
}

/** March 2026 has 31 days. A flat 3,100 budget makes the pace 100/day. */
const budget3100 = () => 3100;
const noBudget = () => 0;

describe('computeTimeline — daily', () => {
  it('emits one point per day of the month', () => {
    const t = computeTimeline([], '2026-03', 'daily', noBudget, new Date(2026, 2, 15));
    expect(t.points).toHaveLength(31);
    expect(t.points[0].label).toBe('1');
    expect(t.points[30].label).toBe('31');
    expect(t.points[30].end).toBe('2026-03-31');
  });

  it('accumulates spend forward and never resets', () => {
    const items = [tx('2026-03-01', 100), tx('2026-03-02', 50), tx('2026-03-05', 25)];
    const t = computeTimeline(items, '2026-03', 'daily', noBudget, new Date(2026, 2, 10));
    expect(t.points[0].cumulative).toBe(100);
    expect(t.points[1].cumulative).toBe(150);
    expect(t.points[2].cumulative).toBe(150); // no spend on the 3rd
    expect(t.points[4].cumulative).toBe(175);
    expect(t.totalSpent).toBe(175);
  });

  it('paces the budget line evenly across the month', () => {
    const t = computeTimeline([], '2026-03', 'daily', budget3100, new Date(2026, 2, 15));
    expect(t.points[0].budgetLine).toBeCloseTo(100, 5);   // day 1 of 31
    expect(t.points[14].budgetLine).toBeCloseTo(1500, 5); // day 15
    expect(t.points[30].budgetLine).toBeCloseTo(3100, 5); // the whole budget by day 31
  });

  it('reports cumulative spend as a share of the whole budget', () => {
    const items = [tx('2026-03-01', 1550)];
    const t = computeTimeline(items, '2026-03', 'daily', budget3100, new Date(2026, 2, 10));
    expect(t.points[0].cumulativePct).toBeCloseTo(50, 5);
  });

  it('has no budget line and no percentage when nothing is budgeted', () => {
    const t = computeTimeline([tx('2026-03-01', 100)], '2026-03', 'daily', noBudget, new Date(2026, 2, 10));
    expect(t.points[0].budgetLine).toBeNull();
    expect(t.points[0].cumulativePct).toBeNull();
    expect(t.totalBudget).toBe(0);
  });
});

describe('computeTimeline — weekly', () => {
  it('splits the month into four weeks, the last absorbing the remainder', () => {
    const t = computeTimeline([], '2026-03', 'weekly', noBudget, new Date(2026, 2, 15));
    expect(t.points.map((p) => p.label)).toEqual(['Week 1', 'Week 2', 'Week 3', 'Week 4']);
    expect(t.points[0].start).toBe('2026-03-01');
    expect(t.points[0].end).toBe('2026-03-07');
    expect(t.points[3].start).toBe('2026-03-22');
    expect(t.points[3].end).toBe('2026-03-31'); // ten days, not seven
  });

  it('files every day of the month into exactly one week', () => {
    const items = [
      tx('2026-03-07', 10), // last day of week 1
      tx('2026-03-08', 20), // first day of week 2
      tx('2026-03-21', 30), // last day of week 3
      tx('2026-03-22', 40), // first day of week 4
      tx('2026-03-31', 50), // last day of the month
    ];
    const t = computeTimeline(items, '2026-03', 'weekly', noBudget, new Date(2026, 3, 5));
    expect(t.points.map((p) => p.spent)).toEqual([10, 20, 30, 90]);
    expect(t.totalSpent).toBe(150);
  });

  it('reproduces the worked example: cumulative percentages of the month budget', () => {
    // 18% / 42% / 67% / 94% of a 1,000 budget.
    const items = [
      tx('2026-03-03', 180),
      tx('2026-03-10', 240),
      tx('2026-03-17', 250),
      tx('2026-03-24', 270),
    ];
    const t = computeTimeline(items, '2026-03', 'weekly', () => 1000, new Date(2026, 3, 5));
    expect(t.points.map((p) => Math.round(p.cumulativePct!))).toEqual([18, 42, 67, 94]);
  });

  it('paces the longer final week by real days, not by week count', () => {
    const t = computeTimeline([], '2026-03', 'weekly', budget3100, new Date(2026, 2, 15));
    expect(t.points[0].budgetLine).toBeCloseTo(700, 5);  // 7 days
    expect(t.points[2].budgetLine).toBeCloseTo(2100, 5); // 21 days
    expect(t.points[3].budgetLine).toBeCloseTo(3100, 5); // 31 days
  });
});

describe('computeTimeline — monthly', () => {
  it('covers the trailing twelve months ending at the selected one', () => {
    const t = computeTimeline([], '2026-03', 'monthly', noBudget, new Date(2026, 2, 15));
    expect(t.points).toHaveLength(12);
    expect(t.points[0].key).toBe('2025-04');
    expect(t.points[11].key).toBe('2026-03');
  });

  it('paces against each month’s own budget, not a repeated one', () => {
    const perMonth: Record<string, number> = { '2026-03': 3000 };
    const t = computeTimeline([], '2026-03', 'monthly', (m) => perMonth[m] ?? 1000, new Date(2026, 2, 15));
    // Eleven months at 1,000 plus one at 3,000.
    expect(t.totalBudget).toBe(14_000);
  });

  it('accumulates across months', () => {
    const items = [tx('2025-12-05', 100), tx('2026-01-05', 200), tx('2026-03-05', 300)];
    const t = computeTimeline(items, '2026-03', 'monthly', noBudget, new Date(2026, 3, 5));
    expect(t.points.at(-1)!.cumulative).toBe(600);
    expect(t.totalSpent).toBe(600);
  });
});

describe('projection', () => {
  it('continues the actual line at the current run-rate', () => {
    // 1,000 spent over the first 10 days of a 31-day month → 100/day.
    const items = [tx('2026-03-01', 1000)];
    const t = computeTimeline(items, '2026-03', 'daily', noBudget, new Date(2026, 2, 10));

    expect(t.points[9].isFuture).toBe(false);
    expect(t.points[9].projected).toBe(1000);    // up to today, projection IS actual
    expect(t.points[10].isFuture).toBe(true);
    expect(t.points[10].projected).toBeCloseTo(1100, 5);
    expect(t.projectedTotal).toBeCloseTo(3100, 5); // 100/day × 31 days
  });

  it('does not project a month that is already over', () => {
    const items = [tx('2026-03-01', 1000)];
    const t = computeTimeline(items, '2026-03', 'daily', noBudget, new Date(2026, 5, 1));
    expect(t.inProgress).toBe(false);
    expect(t.projectedTotal).toBeNull();
    expect(t.points.every((p) => p.projected === null)).toBe(true);
  });

  it('does not project a month that has not started', () => {
    const t = computeTimeline([], '2026-03', 'daily', noBudget, new Date(2026, 0, 15));
    expect(t.inProgress).toBe(false);
    expect(t.points.every((p) => p.isFuture)).toBe(true);
    expect(t.projectedTotal).toBeNull();
  });
});

describe('anomaly highlighting', () => {
  it('flags a period well above the mean of the periods that happened', () => {
    const items = [
      tx('2026-03-01', 100), tx('2026-03-02', 110), tx('2026-03-03', 90),
      tx('2026-03-04', 105), tx('2026-03-05', 2000), // the spike
    ];
    const t = computeTimeline(items, '2026-03', 'daily', noBudget, new Date(2026, 2, 10));
    const flagged = t.points.filter((p) => p.isAnomaly).map((p) => p.label);
    expect(flagged).toEqual(['5']);
  });

  it('flags nothing when spending is even', () => {
    const items = [
      tx('2026-03-01', 100), tx('2026-03-02', 100),
      tx('2026-03-03', 100), tx('2026-03-04', 100),
    ];
    const t = computeTimeline(items, '2026-03', 'daily', noBudget, new Date(2026, 2, 10));
    expect(t.points.some((p) => p.isAnomaly)).toBe(false);
  });

  it('refuses to call anything unusual with fewer than three active periods', () => {
    const items = [tx('2026-03-01', 100), tx('2026-03-02', 9000)];
    const t = computeTimeline(items, '2026-03', 'daily', noBudget, new Date(2026, 2, 10));
    expect(t.anomalyThreshold).toBeNull();
    expect(t.points.some((p) => p.isAnomaly)).toBe(false);
  });
});

describe('shared guarantees across granularities', () => {
  it('always ends at the same total spend', () => {
    const items = [tx('2026-03-02', 100), tx('2026-03-15', 250), tx('2026-03-28', 50)];
    for (const g of GRANULARITIES) {
      const t = computeTimeline(items, '2026-03', g as Granularity, budget3100, new Date(2026, 3, 5));
      expect(t.totalSpent).toBe(400);
      expect(t.points.at(-1)!.cumulative).toBe(400);
    }
  });

  it('never lets cumulative spend go backwards', () => {
    const items = [tx('2026-03-02', 100), tx('2026-03-15', 250)];
    for (const g of GRANULARITIES) {
      const t = computeTimeline(items, '2026-03', g as Granularity, noBudget, new Date(2026, 3, 5));
      const cums = t.points.map((p) => p.cumulative);
      expect(cums).toEqual([...cums].sort((a, b) => a - b));
    }
  });

  it('ignores transactions outside the timeline entirely', () => {
    const items = [tx('2026-03-02', 100), tx('2020-01-01', 99_999), tx('2030-01-01', 99_999)];
    const t = computeTimeline(items, '2026-03', 'daily', noBudget, new Date(2026, 3, 5));
    expect(t.totalSpent).toBe(100);
  });
});

/* ────────────────────────────────────────────────────────────────────────── *
 * With a shape: the timeline and the forecast card are one story.
 * ────────────────────────────────────────────────────────────────────────── */

describe('computeTimeline — spending against the spending plan', () => {
  const CAT_META = new Map<string, CatMeta>(
    allCategories(mergedCats({ needs: [], wants: [], save: [] })).map((c) => [c.k, c as CatMeta]),
  );
  /** A 50,000 plan: 20,000 rent, 10,000 groceries, 5,000 dining — and 15,000 into stocks. */
  const PLAN = { rent: 20000, groceries: 10000, eating_out: 5000, stocks: 15000 };
  const budgetValsOf = () => PLAN;
  const planTotal = () => 50000;

  /** Rent on the 1st and the SIP on the 2nd, both on time, then ordinary days. */
  const ontime = [
    tx('2026-03-01', 20000, 'rent'),
    tx('2026-03-02', 15000, 'stocks'),
    tx('2026-03-02', 400, 'groceries'),
    tx('2026-03-03', 300, 'eating_out'),
    tx('2026-03-04', 350, 'groceries'),
  ];
  const now = new Date(2026, 2, 4, 12);

  function shapeFor(items: ExpenseItem[]): TimelineShape {
    const forecast = computeMonthForecast({ items, month: '2026-03', now, catMeta: CAT_META, budgetVals: PLAN });
    return { catMeta: CAT_META, budgetValsOf, forecast };
  }

  it('reproduces the contradiction without a shape', () => {
    // 35,750 over four days, ×31: the chart said ~277,000 — against a card that
    // correctly said the month was on track.
    const t = computeTimeline(ontime, '2026-03', 'daily', planTotal, now);
    expect(t.projectedTotal!).toBeGreaterThan(250_000);
  });

  it('leaves savings out of both sides', () => {
    const t = computeTimeline(ontime, '2026-03', 'daily', planTotal, now, shapeFor(ontime));
    expect(t.spendingOnly).toBe(true);
    expect(t.totalSpent).toBe(21050);
    expect(t.totalBudget).toBe(35000);
  });

  it('projects exactly what the forecast card says', () => {
    const shape = shapeFor(ontime);
    const t = computeTimeline(ontime, '2026-03', 'daily', planTotal, now, shape);
    expect(t.projectedTotal).toBe(shape.forecast!.projected);
    // …and the drawn line ends on it, give or take the card's rounding.
    expect(Math.abs(t.points.at(-1)!.projected! - shape.forecast!.projected)).toBeLessThanOrEqual(0.5);
    // On time, on plan: nowhere near the six-figure overshoot above.
    expect(t.projectedTotal!).toBeLessThan(40_000);
  });

  it('steps the plan up on the day rent falls due, instead of spreading it', () => {
    const t = computeTimeline(ontime, '2026-03', 'daily', planTotal, now, shapeFor(ontime));
    // Day 1: all of the rent, plus one day of the 15,000 day-to-day plan.
    expect(t.points[0].budgetLine).toBeCloseTo(20000 + 15000 / 31, 5);
    expect(t.points[30].budgetLine).toBeCloseTo(35000, 5);
  });

  it('does not call rent day unusually high', () => {
    const items = [
      ...ontime,
      tx('2026-03-05', 500, 'groceries'), tx('2026-03-06', 420, 'eating_out'), tx('2026-03-07', 380, 'groceries'),
    ];
    const t = computeTimeline(items, '2026-03', 'daily', planTotal, new Date(2026, 2, 7, 12), shapeFor(items));
    expect(t.points[0].isAnomaly).toBe(false);
  });

  it('places a bill still to come on its due day in the projection', () => {
    // Nothing paid yet on the 1st; rent is budgeted and, with no history, has
    // no known day — so it is spread across the days left rather than guessed.
    const items = [tx('2026-03-01', 300, 'groceries')];
    const first = new Date(2026, 2, 1, 12);
    const forecast = computeMonthForecast({ items, month: '2026-03', now: first, catMeta: CAT_META, budgetVals: PLAN });
    const t = computeTimeline(items, '2026-03', 'daily', planTotal, first, { catMeta: CAT_META, budgetValsOf, forecast });
    expect(forecast.stillDue.map((b) => b.label)).toContain('Rent');
    const projected = t.points.map((p) => p.projected!);
    // Monotonic, and it reaches the forecast's headline by the last day.
    expect(projected).toEqual([...projected].sort((a, b) => a - b));
    expect(Math.abs(projected.at(-1)! - forecast.projected)).toBeLessThanOrEqual(0.5);
  });
});
