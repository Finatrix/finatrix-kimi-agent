import { describe, it, expect } from 'vitest';
import { computeCommitments } from '../tools/lib/commitments';
import type { CatMeta } from '../tools/lib/expenseAnalytics';
import type { ExpenseItem } from '../tools/lib/expense';

const CATS = new Map<string, CatMeta>(
  ([
    { k: 'rent', l: 'Rent', ic: 'rent', section: 'needs' },
    { k: 'subs', l: 'Subscriptions', ic: 'subs', section: 'wants' },
    { k: 'eating_out', l: 'Eating Out', ic: 'dining', section: 'wants' },
    { k: 'stocks', l: 'Stocks / Equity', ic: 'trending', section: 'save' },
  ] satisfies CatMeta[]).map((c) => [c.k, c]),
);

/** `now` is fixed mid-month so "still ahead" and "already passed" are stable. */
const NOW = new Date(2026, 7, 10, 12); // 10 August 2026
const MONTH = '2026-08';

function tx(over: Partial<ExpenseItem> & { date: string; amount: number; category: string }): ExpenseItem {
  return { id: Math.random().toString(36), ...over } as ExpenseItem;
}

/** Three months of the same bill on the 20th — enough for detection. */
function monthlyBill(category: string, amount: number, day: number, merchant?: string): ExpenseItem[] {
  return ['2026-05', '2026-06', '2026-07'].map((m) =>
    tx({ date: `${m}-${String(day).padStart(2, '0')}`, amount, category, ...(merchant ? { merchant } : {}) }),
  );
}

describe('computeCommitments', () => {
  it('says nothing about a month that is already over', () => {
    const out = computeCommitments(monthlyBill('rent', 24000, 20), CATS, '2026-07', NOW, 10000);
    expect(out.applicable).toBe(false);
    expect(out.bills).toEqual([]);
    expect(out.free).toBeNull();
  });

  it('counts a bill whose usual day is still ahead', () => {
    const out = computeCommitments(monthlyBill('rent', 24000, 20), CATS, MONTH, NOW, 40000);
    expect(out.bills.map((b) => b.label)).toEqual(['Rent']);
    expect(out.committed).toBe(24000);
    expect(out.free).toBe(16000);
  });

  it('does not count a bill already logged this month', () => {
    const items = [...monthlyBill('rent', 24000, 20), tx({ date: '2026-08-05', amount: 24000, category: 'rent' })];
    const out = computeCommitments(items, CATS, MONTH, NOW, 40000);
    expect(out.bills).toEqual([]);
    expect(out.committed).toBe(0);
    expect(out.free).toBe(40000);
  });

  it('does not guess about a bill whose day has already passed unlogged', () => {
    const out = computeCommitments(monthlyBill('rent', 24000, 3), CATS, MONTH, NOW, 40000);
    expect(out.bills).toEqual([]);
  });

  it('tells two merchants in one category apart', () => {
    const items = [
      ...monthlyBill('subs', 500, 18, 'Netflix'),
      ...monthlyBill('subs', 200, 22, 'Spotify'),
      tx({ date: '2026-08-02', amount: 500, category: 'subs', merchant: 'Netflix' }), // paid
    ];
    const out = computeCommitments(items, CATS, MONTH, NOW, 5000);
    // Lower-cased because that is how `detectRecurring` keys a merchant; the
    // Recurring tab already renders them the same way.
    expect(out.bills.map((b) => b.merchant)).toEqual(['spotify']);
    expect(out.committed).toBe(200);
  });

  it('orders bills by the day they land', () => {
    const items = [...monthlyBill('rent', 24000, 25), ...monthlyBill('subs', 500, 15, 'Netflix')];
    const out = computeCommitments(items, CATS, MONTH, NOW, 40000);
    expect(out.bills.map((b) => b.day)).toEqual([15, 25]);
    expect(out.bills[0].date).toBe('2026-08-15');
  });

  it('spreads what is free over the days left, today included', () => {
    const out = computeCommitments(monthlyBill('rent', 20000, 20), CATS, MONTH, NOW, 42000);
    expect(out.daysLeft).toBe(22);           // 10th to 31st inclusive
    expect(out.freePerDay).toBeCloseTo(22000 / 22, 6);
  });

  it('reports the bills but no figure when no budget is set', () => {
    const out = computeCommitments(monthlyBill('rent', 24000, 20), CATS, MONTH, NOW, null);
    expect(out.committed).toBe(24000);
    expect(out.free).toBeNull();
    expect(out.freePerDay).toBeNull();
  });

  it('reports a negative free figure rather than hiding an overcommitment', () => {
    const out = computeCommitments(monthlyBill('rent', 24000, 20), CATS, MONTH, NOW, 10000);
    expect(out.free).toBe(-14000);
    expect(out.freePerDay).toBeLessThan(0);
  });

  it('is quiet when nothing recurring has been detected', () => {
    const items = [tx({ date: '2026-08-01', amount: 300, category: 'eating_out' })];
    const out = computeCommitments(items, CATS, MONTH, NOW, 40000);
    expect(out.applicable).toBe(true);
    expect(out.bills).toEqual([]);
    expect(out.free).toBe(40000);
  });

  it('does not treat a monthly SIP as a bill against the spendable budget', () => {
    // The SIP looks exactly like a recurring bill to the detector, but its
    // budget is already outside `remainingBudget` — counting it here would
    // subtract the same money twice.
    const items = [...monthlyBill('stocks', 15000, 20), ...monthlyBill('rent', 24000, 20)];
    const out = computeCommitments(items, CATS, MONTH, NOW, 40000);

    expect(out.bills.map((b) => b.label)).toEqual(['Rent']);
    expect(out.committed).toBe(24000);
    expect(out.free).toBe(16000);
  });

  it('clamps a bill dated the 31st into a shorter month', () => {
    const feb = new Date(2027, 1, 5, 12); // 5 February 2027 (28 days)
    const items = ['2026-10', '2026-12', '2027-01'].map((m) =>
      tx({ date: `${m}-31`, amount: 1000, category: 'rent' }),
    );
    const out = computeCommitments(items, CATS, '2027-02', feb, 5000);
    expect(out.bills[0]?.date).toBe('2027-02-28');
  });
});
