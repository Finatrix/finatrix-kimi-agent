import { describe, it, expect, beforeEach } from 'vitest';
import { readDashboard } from '../tools/lib/dashboard';
import { currentMonth } from '../tools/lib/month';

/** First day of the calendar month `back` months before the current month. */
function monthKey(back: number): string {
  const [y, m] = currentMonth().split('-').map(Number);
  const d = new Date(y, (m - 1) - back, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

describe('Personal Finance Intelligence — spend trend insight', () => {
  beforeEach(() => localStorage.clear());

  it('flags a meaningful month-over-month spending increase (derived, not fabricated)', () => {
    const thisMonth = `${monthKey(0)}-05`;
    const lastMonth = `${monthKey(1)}-05`;
    localStorage.setItem('fx_expenses', JSON.stringify([
      { id: 'a', amount: 10000, category: 'rent', date: lastMonth },
      { id: 'b', amount: 15000, category: 'rent', date: thisMonth }, // +50%
    ]));
    const snap = readDashboard();
    expect(snap.insights.some((i) => i.tone === 'warn' && /up 50% vs last month/i.test(i.text))).toBe(true);
  });

  it('celebrates a meaningful decrease', () => {
    const thisMonth = `${monthKey(0)}-05`;
    const lastMonth = `${monthKey(1)}-05`;
    localStorage.setItem('fx_expenses', JSON.stringify([
      { id: 'a', amount: 20000, category: 'rent', date: lastMonth },
      { id: 'b', amount: 10000, category: 'rent', date: thisMonth }, // -50%
    ]));
    const snap = readDashboard();
    expect(snap.insights.some((i) => i.tone === 'ok' && /down 50% vs last month/i.test(i.text))).toBe(true);
  });

  it('stays silent when there is no prior-month data (never invents a trend)', () => {
    const thisMonth = `${monthKey(0)}-05`;
    localStorage.setItem('fx_expenses', JSON.stringify([
      { id: 'b', amount: 15000, category: 'rent', date: thisMonth },
    ]));
    const snap = readDashboard();
    expect(snap.insights.every((i) => !/vs last month/i.test(i.text))).toBe(true);
  });
});

/**
 * The dashboard's net worth block.
 *
 * It exists to prove two properties rather than the arithmetic (which is
 * covered in netWorth.test.ts): that the dashboard reads the tool's own model
 * instead of re-deriving the figure, and that adding it left the journey and
 * the health score — which describe how much has been SET UP — untouched.
 */
describe('dashboard — net worth', () => {
  beforeEach(() => localStorage.clear());

  const seedAccounts = () =>
    localStorage.setItem('fx_networth', JSON.stringify([
      { id: 'a', name: 'Savings', kind: 'asset', category: 'cash', balances: { [monthKey(1)]: 100000, [monthKey(0)]: 140000 } },
      { id: 'l', name: 'Card', kind: 'liability', category: 'credit_card', balances: { [monthKey(0)]: 40000 } },
    ]));

  it('reports nothing at all when no account has been recorded', () => {
    expect(readDashboard().netWorth).toBeNull();
  });

  it('reports the current balance sheet and the month-over-month change', () => {
    seedAccounts();
    const nw = readDashboard().netWorth!;
    expect(nw).toMatchObject({ month: currentMonth(), assets: 140000, liabilities: 40000, net: 100000 });
    expect(nw.change).toEqual({ abs: 0, pct: 0 }); // 100,000 last month → 100,000 now
  });

  it('does not become a journey step or move the health score', () => {
    const before = readDashboard();
    seedAccounts();
    const after = readDashboard();
    expect(after.totalPillars).toBe(before.totalPillars);
    expect(after.pillars.map((p) => p.id)).toEqual(before.pillars.map((p) => p.id));
    expect(after.healthScore).toBe(before.healthScore);
  });

  it('survives corrupt net worth storage without taking the dashboard down', () => {
    localStorage.setItem('fx_networth', '{"not":"an array"}');
    expect(() => readDashboard()).not.toThrow();
    expect(readDashboard().netWorth).toBeNull();
  });
});
