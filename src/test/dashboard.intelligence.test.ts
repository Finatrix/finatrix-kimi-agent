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
