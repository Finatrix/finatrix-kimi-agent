import { describe, it, expect } from 'vitest';
import { computeDashboard, migrateCategory, type ExpenseItem } from '../tools/lib/expense';
import { mergedCats } from '../tools/lib/budget';

const cats = mergedCats({ needs: [], wants: [], save: [] }); // built-in categories only
const NOW = new Date('2026-07-15T10:00:00');

function items(): ExpenseItem[] {
  return [
    { id: '1', amount: 20000, category: 'rent', date: '2026-07-02', note: 'July rent' },
    { id: '2', amount: 5000, category: 'groceries', date: '2026-07-05' },
    { id: '3', amount: 3000, category: 'eating_out', date: '2026-07-08' },
    { id: '4', amount: 2000, category: 'stocks', date: '2026-07-10' },
    { id: '5', amount: 1000, category: 'food', date: '2026-07-11' }, // legacy key → eating_out
    { id: '6', amount: 9999, category: 'rent', date: '2026-06-20' }, // previous month
  ];
}

describe('computeDashboard', () => {
  it('rolls up monthly spend and remaining against Budget allocations', () => {
    const budgetVals = { rent: 25000, groceries: 8000, eating_out: 3500, stocks: 5000 };
    const r = computeDashboard('2026-07', items(), cats, budgetVals, NOW);

    expect(r.monthlySpent).toBe(31000); // 20000+5000+3000+2000+1000 (June excluded)
    expect(r.monthlyBudget).toBe(41500); // sum of allocations
    expect(r.remaining).toBe(10500);
    expect(r.txCount).toBe(5);
    expect(r.isCurrentMonth).toBe(true); // NOW (2026-07) matches selected month
  });

  it('migrates legacy category keys onto Budget keys', () => {
    const valid = new Set(['eating_out', 'rent']);
    expect(migrateCategory('food', valid)).toBe('eating_out');
    expect(migrateCategory('rent', valid)).toBe('rent');
    expect(migrateCategory('unknown_x', valid)).toBe('unknown_x');

    const r = computeDashboard('2026-07', items(), cats, {}, NOW);
    const eating = r.categories.find((c) => c.k === 'eating_out')!;
    expect(eating.spent).toBe(4000); // 3000 + migrated 1000 from "food"
  });

  it('classifies per-category budget health', () => {
    const budgetVals = { rent: 20000, groceries: 4000 }; // rent exactly at limit, groceries over
    const r = computeDashboard('2026-07', items(), cats, budgetVals, NOW);
    const rent = r.categories.find((c) => c.k === 'rent')!;
    const groceries = r.categories.find((c) => c.k === 'groceries')!;
    const stocks = r.categories.find((c) => c.k === 'stocks')!;
    expect(rent.health).toBe('near');   // 100% → within/near boundary (>=80, not >100)
    expect(groceries.health).toBe('over'); // 5000 / 4000
    expect(stocks.health).toBe('none');  // no budget set
  });

  it('summarises Needs / Wants / Savings sections', () => {
    const r = computeDashboard('2026-07', items(), cats, {}, NOW);
    const needs = r.sections.find((s) => s.section === 'needs')!;
    const wants = r.sections.find((s) => s.section === 'wants')!;
    const save = r.sections.find((s) => s.section === 'save')!;
    expect(needs.spent).toBe(25000);  // rent 20000 + groceries 5000
    expect(wants.spent).toBe(4000);   // eating_out 3000 + migrated food 1000
    expect(save.spent).toBe(2000);    // stocks
  });

  it('builds a 6-month trend ending at the selected month', () => {
    const r = computeDashboard('2026-07', items(), cats, {}, NOW);
    expect(r.trend).toHaveLength(6);
    expect(r.trend[5].month).toBe('2026-07');
    expect(r.trend[5].spent).toBe(31000);
    expect(r.trend[4].month).toBe('2026-06');
    expect(r.trend[4].spent).toBe(9999);
  });
});
