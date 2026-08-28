import { describe, it, expect } from 'vitest';
import { buildAutoBudget } from '../tools/lib/budgetAuto';
import { mergedCats, type CatKey } from '../tools/lib/budget';
import type { ExpenseItem } from '../tools/lib/expense';

/**
 * The automatic budget divides envelopes the USER set across categories, from
 * the user's own history. Two invariants matter above everything else:
 *
 *   • each section's allocations sum to exactly the envelope — a column of
 *     figures that does not add up to its own total is worse than an untidy one;
 *   • nothing is ever written. This module returns a proposal.
 */

const CATS = mergedCats({ needs: [], wants: [], save: [] });
const MONTH = '2026-06';

let seq = 0;
const tx = (date: string, category: string, amount: number): ExpenseItem =>
  ({ id: `t${++seq}`, date, category, amount });

const envelopes = (needs: number, wants: number, save: number): Record<CatKey, number> =>
  ({ needs, wants, save });

/** Three months of steady spending in the window before June. */
const STEADY = [
  tx('2026-03-05', 'groceries', 10_000), tx('2026-03-06', 'eating_out', 4_000),
  tx('2026-04-05', 'groceries', 10_000), tx('2026-04-06', 'eating_out', 4_000),
  tx('2026-05-05', 'groceries', 10_000), tx('2026-05-06', 'eating_out', 4_000),
];

const sumOf = (rows: Array<{ amount: number }>) => rows.reduce((s, r) => s + r.amount, 0);

describe('fitting the envelopes', () => {
  it('never allocates more than the user gave a section', () => {
    for (const env of [envelopes(20_000, 8_000, 12_000), envelopes(19_337, 7_111, 3)]) {
      const r = buildAutoBudget({
        items: STEADY, cats: CATS, month: MONTH,
        envelopes: env, currentVals: {}, lookback: 3,
      });
      for (const sec of r.sections) {
        expect(sumOf(sec.rows)).toBeLessThanOrEqual(sec.envelope + 1e-6);
        expect(sec.unallocated).toBeCloseTo(sec.envelope - sumOf(sec.rows), 6);
      }
    }
  });

  it('scales DOWN to fit, exactly, when history exceeds the envelope', () => {
    const r = buildAutoBudget({
      items: STEADY, cats: CATS, month: MONTH,
      envelopes: envelopes(5_000, 2_000, 0), // history wants 10,000 / 4,000
      currentVals: {}, lookback: 3,
    });
    for (const sec of r.sections.filter((s) => s.envelope > 0)) {
      expect(sumOf(sec.rows)).toBeCloseTo(sec.envelope, 6);
      expect(sec.unallocated).toBe(0);
    }
  });

  it('never scales UP to absorb spare room', () => {
    // The bug this rule exists to prevent: a 50,000 Needs envelope against
    // 42,000 of history handed Rent 35,700 — nineteen per cent more than the
    // rent. Inflating every line to make the column add up makes the plan less
    // true, and quietly funds categories the user has never spent in.
    const r = buildAutoBudget({
      items: STEADY, cats: CATS, month: MONTH,
      envelopes: envelopes(50_000, 20_000, 0),
      currentVals: {}, lookback: 3,
    });
    const groceries = r.rows.find((x) => x.k === 'groceries')!;
    const eatingOut = r.rows.find((x) => x.k === 'eating_out')!;
    expect(groceries.amount).toBe(10_000);
    expect(eatingOut.amount).toBe(4_000);
    // A category with no history and no budget stays at zero rather than being
    // handed a share of the surplus.
    expect(r.rows.find((x) => x.k === 'travel')?.amount ?? 0).toBe(0);
    // The surplus is reported instead.
    expect(r.sections.find((s) => s.section === 'needs')!.unallocated).toBe(40_000);
  });

  it('reports whether the envelope is tighter than history, as a fact', () => {
    const tight = buildAutoBudget({
      items: STEADY, cats: CATS, month: MONTH,
      envelopes: envelopes(5_000, 8_000, 0), // history says Needs wants 10,000
      currentVals: {}, lookback: 3,
    });
    const needs = tight.sections.find((s) => s.section === 'needs')!;
    expect(needs.ratio).toBeCloseTo(0.5, 2);
    expect(needs.verdict).toMatch(/needs \d+% more/);
    expect(sumOf(needs.rows)).toBeCloseTo(5_000, 6);
  });

  it('names a surplus as a surplus rather than spending it', () => {
    const roomy = buildAutoBudget({
      items: STEADY, cats: CATS, month: MONTH,
      envelopes: envelopes(20_000, 30_000, 0),
      currentVals: {}, lookback: 3,
    });
    const wants = roomy.sections.find((s) => s.section === 'wants')!;
    expect(wants.verdict).toMatch(/room to move into savings/);
    expect(wants.unallocated).toBeGreaterThan(0);
  });

  it('cuts what is discretionary before it cuts a committed bill', () => {
    const withRent = [
      // Rent: identical every month, so it is a fixed cost.
      tx('2026-03-01', 'rent', 30_000),
      tx('2026-04-01', 'rent', 30_000),
      tx('2026-05-01', 'rent', 30_000),
      // Groceries: recurring, but the amount moves — not a fixed cost, and the
      // largest discretionary line in most households.
      tx('2026-03-05', 'groceries', 9_000),
      tx('2026-04-05', 'groceries', 11_000),
      tx('2026-05-05', 'groceries', 10_000),
    ];
    const r = buildAutoBudget({
      items: withRent, cats: CATS, month: MONTH,
      envelopes: envelopes(35_000, 0, 0), // history wants roughly 40,000
      currentVals: {}, lookback: 3,
    });
    const rent = r.rows.find((x) => x.k === 'rent')!;
    const groceries = r.rows.find((x) => x.k === 'groceries')!;
    expect(rent.committed).toBe(true);
    expect(groceries.committed).toBe(false);
    // Rent survives intact; groceries absorbs the whole shortfall.
    expect(rent.amount).toBe(30_000);
    expect(groceries.amount).toBe(5_000);
    expect(sumOf(r.sections.find((s) => s.section === 'needs')!.rows)).toBeCloseTo(35_000, 6);
  });

  it('frames a savings envelope the other way up', () => {
    const r = buildAutoBudget({
      items: [...STEADY, tx('2026-05-03', 'emergency', 5_000)],
      cats: CATS, month: MONTH,
      envelopes: envelopes(20_000, 8_000, 12_000),
      currentVals: {}, lookback: 3,
    });
    // Committing more to savings than history managed is the point, not a gap.
    expect(r.sections.find((s) => s.section === 'save')!.verdict)
      .toMatch(/direction that matters/);
  });
});

describe('what the forecast reads', () => {
  it('weighs recent months more heavily than older ones', () => {
    const rising = [
      tx('2026-03-05', 'groceries', 6_000),
      tx('2026-04-05', 'groceries', 10_000),
      tx('2026-05-05', 'groceries', 14_000),
    ];
    const r = buildAutoBudget({
      items: rising, cats: CATS, month: MONTH,
      envelopes: envelopes(100_000, 0, 0), // huge, so nothing is scaled down
      currentVals: {}, lookback: 3,
    });
    const groceries = r.rows.find((x) => x.k === 'groceries')!;
    // A flat mean would be 10,000. Recency weighting plus a damped trend lands
    // above it, because next month is what the budget is a prediction about.
    expect(groceries.forecast).toBeGreaterThan(11_000);
    expect(groceries.reason).toMatch(/Rising/);
  });

  it('never forecasts a committed bill below the bill', () => {
    // Rent has been the same for months; a forecast that averaged it with a
    // month before the tenancy started would under-fund it.
    const rent = [
      tx('2026-03-01', 'rent', 30_000),
      tx('2026-04-01', 'rent', 30_000),
      tx('2026-05-01', 'rent', 30_000),
    ];
    const r = buildAutoBudget({
      items: rent, cats: CATS, month: MONTH,
      envelopes: envelopes(100_000, 0, 0),
      currentVals: {}, lookback: 3,
    });
    const row = r.rows.find((x) => x.k === 'rent')!;
    expect(row.forecast).toBeGreaterThanOrEqual(30_000);
    expect(row.confidence).toBe('high');
  });

  it('counts a month with no spend in a category as a genuine zero', () => {
    // One holiday must not become a permanent monthly travel allowance.
    const items = [
      tx('2026-03-05', 'groceries', 10_000),
      tx('2026-04-05', 'groceries', 10_000),
      tx('2026-04-20', 'travel', 30_000),
      tx('2026-05-05', 'groceries', 10_000),
    ];
    const r = buildAutoBudget({
      items, cats: CATS, month: MONTH,
      envelopes: envelopes(100_000, 100_000, 0),
      currentVals: {}, lookback: 3,
    });
    const travel = r.rows.find((x) => x.k === 'travel')!;
    expect(travel.forecast).toBeLessThan(30_000);
    expect(travel.monthsSeen).toBe(1);
    expect(travel.confidence).toBe('low');
  });

  it('reports the difference against the current plan without changing it', () => {
    const r = buildAutoBudget({
      items: STEADY, cats: CATS, month: MONTH,
      envelopes: envelopes(20_000, 8_000, 0),
      currentVals: { groceries: 15_000 }, lookback: 3,
    });
    const groceries = r.rows.find((x) => x.k === 'groceries')!;
    expect(groceries.current).toBe(15_000);
    expect(groceries.difference).toBe(groceries.amount - 15_000);
  });
});

describe('no history', () => {
  it('says so rather than proposing figures from nothing', () => {
    const r = buildAutoBudget({
      items: [], cats: CATS, month: MONTH,
      envelopes: envelopes(20_000, 8_000, 12_000),
      currentVals: {}, lookback: 3,
    });
    expect(r.empty).toBe(true);
    expect(r.sections).toEqual([]);
  });

  it('splits a section evenly when only that section has no history at all', () => {
    const r = buildAutoBudget({
      items: STEADY, cats: CATS, month: MONTH,
      envelopes: envelopes(20_000, 8_000, 14_000), // nothing saved in the window
      currentVals: {}, lookback: 3,
    });
    const save = r.sections.find((s) => s.section === 'save')!;
    expect(sumOf(save.rows)).toBeCloseTo(14_000, 6);
    expect(save.verdict).toMatch(/split evenly as a starting point/);
  });

  it('keeps a budgeted category the window cannot see rather than defunding it', () => {
    // A quarterly bill that has not fallen due in the window. Zero spending is
    // not evidence that it should be zero.
    const r = buildAutoBudget({
      items: STEADY, cats: CATS, month: MONTH,
      envelopes: envelopes(20_000, 8_000, 0),
      currentVals: { insurance: 4_000 }, lookback: 3,
    });
    const insurance = r.rows.find((x) => x.k === 'insurance')!;
    expect(insurance.amount).toBe(4_000);
    expect(insurance.reason).toMatch(/your own budget is kept/);
  });

  it('flags a short window rather than pretending it is complete', () => {
    const r = buildAutoBudget({
      items: [tx('2026-05-05', 'groceries', 10_000)],
      cats: CATS, month: MONTH,
      envelopes: envelopes(20_000, 0, 0),
      currentVals: {}, lookback: 6,
    });
    expect(r.partial).toBe(true);
    expect(r.monthsUsed).toEqual(['2026-05']);
  });
});
