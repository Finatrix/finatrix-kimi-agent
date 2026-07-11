import { describe, it, expect } from 'vitest';
import { computeMonthForecast } from '../tools/lib/expenseAnalytics';
import type { ExpenseItem } from '../tools/lib/expense';

const CM = '2026-07';
const items: ExpenseItem[] = [
  { id: '1', amount: 5000, category: 'rent', date: '2026-07-05' },
  { id: '2', amount: 5000, category: 'groceries', date: '2026-07-10' },
];

describe('month-end spend forecast', () => {
  it('projects month-end total from the run-rate so far', () => {
    // 10 days elapsed of 31, ₹10,000 spent → run-rate 1000/day → ~₹31,000.
    const now = new Date('2026-07-10T12:00:00');
    const f = computeMonthForecast(items, CM, now, 40000);
    expect(f.isCurrentMonth).toBe(true);
    expect(f.spentSoFar).toBe(10000);
    expect(f.daysElapsed).toBe(10);
    expect(f.daysInMonth).toBe(31);
    expect(f.projected).toBe(31000);
    expect(f.overBudget).toBe(false);
    expect(f.vsBudgetPct).toBe(78); // 31000/40000
  });

  it('flags an over-budget trajectory', () => {
    const now = new Date('2026-07-10T12:00:00');
    const f = computeMonthForecast(items, CM, now, 20000);
    expect(f.overBudget).toBe(true);
    expect(f.projected).toBeGreaterThan(20000);
  });

  it('treats a past month as complete (no projection inflation)', () => {
    const now = new Date('2026-08-15T12:00:00');
    const f = computeMonthForecast(items, CM, now, 40000);
    expect(f.isCurrentMonth).toBe(false);
    expect(f.projected).toBe(10000); // equals actual spend, not extrapolated
  });
});
