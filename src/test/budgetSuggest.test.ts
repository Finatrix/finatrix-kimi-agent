import { describe, it, expect } from 'vitest';
import {
  suggestBudgets, roundToNiceBudget, monthsBefore, LOOKBACKS, type Lookback,
} from '../tools/lib/budgetSuggest';
import { BUILTIN_CATS, type SectionedCats } from '../tools/lib/budget';
import type { ExpenseItem } from '../tools/lib/expense';

/**
 * A suggestion is advice the user has to be able to check by hand. These tests
 * pin the arithmetic and — just as importantly — pin the promise that nothing
 * here ever writes a budget.
 */

let seq = 0;
function tx(date: string, category: string, amount: number): ExpenseItem {
  return { id: `t${++seq}`, date, category, amount };
}

const CATS: SectionedCats = BUILTIN_CATS;

describe('roundToNiceBudget', () => {
  it('rounds up to a readable step, never down', () => {
    // The worked example from the product spec: a 542 average recommends 550.
    expect(roundToNiceBudget(542)).toBe(550);
    expect(roundToNiceBudget(541.67)).toBe(550);
    expect(roundToNiceBudget(550)).toBe(550);
  });

  it('scales the step with the magnitude', () => {
    expect(roundToNiceBudget(42)).toBe(45);        // <100 → step 5
    expect(roundToNiceBudget(542)).toBe(550);      // <1k → step 10
    expect(roundToNiceBudget(5_210)).toBe(5_250);  // <10k → step 50
    expect(roundToNiceBudget(52_010)).toBe(52_100); // <100k → step 100
    expect(roundToNiceBudget(520_010)).toBe(520_500); // ≥100k → step 500
  });

  it('never invents a budget out of nothing', () => {
    expect(roundToNiceBudget(0)).toBe(0);
    expect(roundToNiceBudget(-50)).toBe(0);
    expect(roundToNiceBudget(NaN)).toBe(0);
  });
});

describe('monthsBefore', () => {
  it('returns the preceding months, oldest first, excluding the target', () => {
    expect(monthsBefore('2026-03', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
  });

  it('crosses the year boundary correctly', () => {
    expect(monthsBefore('2026-01', 2)).toEqual(['2025-11', '2025-12']);
  });
});

describe('suggestBudgets', () => {
  it('averages the category over months with logged activity and rounds up', () => {
    const items = [
      tx('2026-01-04', 'groceries', 500),
      tx('2026-02-06', 'groceries', 560),
      tx('2026-03-06', 'groceries', 566),
    ];
    const set = suggestBudgets(items, CATS, {}, '2026-04', 3);
    const groceries = set.suggestions.find((s) => s.k === 'groceries')!;

    expect(groceries.monthsUsed).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(groceries.history).toEqual([500, 560, 566]);
    expect(groceries.average).toBeCloseTo(542, 5);
    expect(groceries.suggested).toBe(550);
  });

  it('counts a month with activity but no spend in this category as a real zero', () => {
    // Travel happened once; the other two months were tracked but had no travel.
    const items = [
      tx('2026-01-04', 'groceries', 300),
      tx('2026-02-06', 'groceries', 300),
      tx('2026-03-06', 'travel', 900),
    ];
    const set = suggestBudgets(items, CATS, {}, '2026-04', 3);
    const travel = set.suggestions.find((s) => s.k === 'travel')!;

    // 900 over three tracked months, not 900 over the one month it appeared in.
    expect(travel.history).toEqual([0, 0, 900]);
    expect(travel.average).toBe(300);
  });

  it('uses only the months that exist when history is short', () => {
    const items = [tx('2026-03-06', 'groceries', 400)];
    const set = suggestBudgets(items, CATS, {}, '2026-04', 12);

    expect(set.monthsAvailable).toEqual(['2026-03']);
    expect(set.partial).toBe(true);
    expect(set.suggestions[0].average).toBe(400);
  });

  it('ignores months outside the lookback window', () => {
    const items = [
      tx('2025-01-04', 'groceries', 10_000), // long before the window
      tx('2026-02-06', 'groceries', 200),
      tx('2026-03-06', 'groceries', 200),
    ];
    const set = suggestBudgets(items, CATS, {}, '2026-04', 3);

    expect(set.suggestions[0].history).toEqual([200, 200]);
    expect(set.suggestions[0].average).toBe(200);
  });

  it('reports the gap against the current budget without changing it', () => {
    const items = [tx('2026-03-06', 'groceries', 600), tx('2026-02-06', 'groceries', 600)];
    const vals = { groceries: 400 };
    const set = suggestBudgets(items, CATS, vals, '2026-04', 3);
    const groceries = set.suggestions.find((s) => s.k === 'groceries')!;

    expect(groceries.current).toBe(400);
    expect(groceries.suggested).toBe(600);
    expect(groceries.difference).toBe(200);
    expect(groceries.differencePct).toBeCloseTo(50, 5);
    expect(vals).toEqual({ groceries: 400 }); // the caller's plan is untouched
  });

  it('has no percentage to report when there is no budget yet', () => {
    const items = [tx('2026-03-06', 'groceries', 600)];
    const set = suggestBudgets(items, CATS, {}, '2026-04', 3);
    expect(set.suggestions[0].differencePct).toBeNull();
  });

  it('skips categories the user has never spent in', () => {
    const items = [tx('2026-03-06', 'groceries', 600)];
    const set = suggestBudgets(items, CATS, {}, '2026-04', 3);
    expect(set.suggestions.map((s) => s.k)).toEqual(['groceries']);
  });

  it('returns nothing at all when there is no history', () => {
    const set = suggestBudgets([], CATS, {}, '2026-04', 6);
    expect(set.suggestions).toEqual([]);
    expect(set.monthsAvailable).toEqual([]);
    expect(set.partial).toBe(true);
  });

  it('grades steady multi-month spending as high confidence', () => {
    const items = [
      tx('2026-01-04', 'rent', 1000),
      tx('2026-02-04', 'rent', 1000),
      tx('2026-03-04', 'rent', 1020),
    ];
    const set = suggestBudgets(items, CATS, {}, '2026-04', 3);
    expect(set.suggestions[0].confidence).toBe('high');
    expect(set.suggestions[0].confidenceReason).toMatch(/3 months/);
  });

  it('grades a single month as low confidence and says why', () => {
    const items = [tx('2026-03-04', 'rent', 1000)];
    const set = suggestBudgets(items, CATS, {}, '2026-04', 3);
    expect(set.suggestions[0].confidence).toBe('low');
    expect(set.suggestions[0].confidenceReason).toMatch(/Only 1 month/);
  });

  it('grades wildly varying spend as low confidence even with enough months', () => {
    const items = [
      tx('2026-01-04', 'shopping', 50),
      tx('2026-02-04', 'shopping', 4000),
      tx('2026-03-04', 'shopping', 120),
    ];
    const set = suggestBudgets(items, CATS, {}, '2026-04', 3);
    const shopping = set.suggestions.find((s) => s.k === 'shopping')!;
    expect(shopping.confidence).toBe('low');
    expect(shopping.confidenceReason).toMatch(/swings/);
  });

  it('orders by the size of the correction so the biggest decisions lead', () => {
    const items = [
      tx('2026-03-04', 'rent', 2000),
      tx('2026-03-05', 'groceries', 100),
    ];
    const set = suggestBudgets(items, CATS, { rent: 0, groceries: 0 }, '2026-04', 3);
    expect(set.suggestions.map((s) => s.k)).toEqual(['rent', 'groceries']);
  });

  it('migrates legacy category keys onto their current equivalents', () => {
    // `food` is the pre-V4 key for what is now `eating_out`.
    const items = [tx('2026-03-04', 'food', 300), tx('2026-02-04', 'food', 300)];
    const set = suggestBudgets(items, CATS, {}, '2026-04', 3);
    expect(set.suggestions.map((s) => s.k)).toEqual(['eating_out']);
  });

  it('works for every offered lookback', () => {
    const items = [tx('2026-03-04', 'groceries', 300)];
    for (const lb of LOOKBACKS) {
      const set = suggestBudgets(items, CATS, {}, '2026-04', lb as Lookback);
      expect(set.lookback).toBe(lb);
      expect(set.suggestions).toHaveLength(1);
    }
  });
});
