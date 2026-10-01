import { describe, it, expect, beforeEach } from 'vitest';
import { getMonthEvents, getUpcomingEvents, hasCalendarData } from '../tools/lib/calendar';
import { currentMonth } from '../tools/lib/month';

const CM = currentMonth();
function monthKey(back: number): string {
  const [y, m] = CM.split('-').map(Number);
  const d = new Date(y, (m - 1) - back, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

describe('financial calendar', () => {
  beforeEach(() => localStorage.clear());

  it('is empty when no data supports any event (never invents)', () => {
    expect(getMonthEvents(CM)).toHaveLength(0);
    expect(hasCalendarData(CM)).toBe(false);
  });

  it('projects a recurring bill from real repeated expenses onto the month', () => {
    // Same merchant+category two months running → detected as recurring.
    localStorage.setItem('fx_expenses', JSON.stringify([
      { id: '1', amount: 999, category: 'bills', date: `${monthKey(1)}-14`, merchant: 'Fibernet' },
      { id: '2', amount: 999, category: 'bills', date: `${monthKey(0)}-14`, merchant: 'Fibernet' },
    ]));
    const events = getMonthEvents(CM);
    const bill = events.find((e) => e.type === 'bill');
    expect(bill).toBeTruthy();
    expect(bill!.date).toBe(`${CM}-14`); // day-of-month taken from the real occurrence
    expect(bill!.amount).toBe(999);
    expect(hasCalendarData(CM)).toBe(true);
  });

  it('surfaces the investing SIP as a monthly event when an invest plan exists', () => {
    localStorage.setItem('fx_investmatch', JSON.stringify({ a: { age: 30, income: 80000, monthly: 10000, risk: 'moderate', horizon: '5-10', goal: 'wealth' } }));
    const events = getMonthEvents(CM);
    const sip = events.find((e) => e.type === 'invest');
    expect(sip).toBeTruthy();
    expect(sip!.date).toBe(`${CM}-01`);
    expect(sip!.detail).toContain('confirm its currency and market');
  });

  it('preserves recurring-event IDs when another bill changes the ranking', () => {
    const bills = [1, 0].flatMap((back) => [
      { id: `net-${back}`, amount: 999, category: 'bills', date: `${monthKey(back)}-14`, merchant: 'Fibernet' },
      { id: `gym-${back}`, amount: 500, category: 'bills', date: `${monthKey(back)}-10`, merchant: 'Gym' },
    ]);
    localStorage.setItem('fx_expenses', JSON.stringify(bills));
    const original = getMonthEvents(CM).find(e => e.title === 'fibernet')!.id;
    localStorage.setItem('fx_expenses', JSON.stringify(bills.map(bill => bill.merchant === 'Gym' ? { ...bill, amount: 2000 } : bill)));
    expect(getMonthEvents(CM).find(e => e.title === 'fibernet')!.id).toBe(original);
  });

  it('getUpcomingEvents stays within the requested window', () => {
    localStorage.setItem('fx_expenses', JSON.stringify([
      { id: '1', amount: 500, category: 'bills', date: `${monthKey(1)}-10`, merchant: 'Gym' },
      { id: '2', amount: 500, category: 'bills', date: `${monthKey(0)}-10`, merchant: 'Gym' },
    ]));
    const up = getUpcomingEvents(new Date(`${CM}-01T00:00:00`), 30);
    expect(up.every((e) => e.date >= `${CM}-01`)).toBe(true);
  });
});
