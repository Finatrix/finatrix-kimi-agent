import { beforeEach, describe, expect, it } from 'vitest';
import {
  addTrial, computeRadar, computeRadarEvents, dropMutedBills, loadRadarPrefs, logSubscriptionPayment,
  removeTrial, saveRadarPrefs, subscriptionKey, toggleMuted, type RadarPrefs,
} from '../tools/lib/subscriptions';
import { loadExpenses, type ExpenseItem } from '../tools/lib/expense';
import type { CatMeta } from '../tools/lib/expenseAnalytics';

const CATS = new Map<string, CatMeta>(
  ([
    { k: 'subscriptions', l: 'Subscriptions', ic: 'subs', section: 'wants' },
    { k: 'utilities', l: 'Utilities', ic: 'bills', section: 'needs' },
    { k: 'rent', l: 'Rent', ic: 'rent', section: 'needs' },
    { k: 'stocks', l: 'Stocks / Equity', ic: 'trending', section: 'save' },
  ] satisfies CatMeta[]).map((c) => [c.k, c]),
);
const NONE: RadarPrefs = { muted: [], trials: [] };
/** 10 August 2026, noon: mid-month, so "ahead" and "passed" are stable. */
const NOW = new Date(2026, 7, 10, 12);

function tx(over: Partial<ExpenseItem> & { date: string; amount: number; category: string }): ExpenseItem {
  return { id: Math.random().toString(36), ...over } as ExpenseItem;
}
function monthly(category: string, amount: number, day: number, merchant?: string, extra: Partial<ExpenseItem> = {}): ExpenseItem[] {
  return ['2026-05', '2026-06', '2026-07'].map((m) =>
    tx({ date: `${m}-${String(day).padStart(2, '0')}`, amount, category, ...(merchant ? { merchant } : {}), ...extra }));
}

describe('computeRadar', () => {
  it('lists Subscriptions-category patterns with the yearly cost as monthly × 12', () => {
    const r = computeRadar([...monthly('subscriptions', 649, 18, 'Netflix'), ...monthly('subscriptions', 119, 3, 'Spotify')], CATS, NONE, NOW);
    expect(r.subscriptions.map((s) => s.name)).toEqual(['Netflix', 'Spotify']);
    expect(r.subscriptions[0]).toMatchObject({ monthly: 649, yearly: 7788, day: 18 });
    expect(r.yearlyTotal).toBe((649 + 119) * 12);
  });

  it('leaves out ordinary bills, but takes any spending the person marked recurring', () => {
    const items = [...monthly('utilities', 1800, 5, 'Power'), ...monthly('rent', 20000, 1, 'Landlord', { recurring: true })];
    const r = computeRadar(items, CATS, NONE, NOW);
    expect(r.subscriptions.map((s) => s.name)).toEqual(['Landlord']);
    expect(r.subscriptions[0].flagged).toBe(true);
  });

  it('never counts savings or transfers, even when marked recurring', () => {
    const r = computeRadar(monthly('stocks', 5000, 2, 'SIP', { recurring: true }), CATS, NONE, NOW);
    expect(r.subscriptions).toEqual([]);
  });

  it('ignores a subscription seen only once', () => {
    expect(computeRadar([tx({ date: '2026-07-18', amount: 649, category: 'subscriptions', merchant: 'Netflix' })], CATS, NONE, NOW).subscriptions).toEqual([]);
  });

  it('resolves the retired `subs` key the way the tracker does', () => {
    const r = computeRadar(monthly('subs', 649, 18, 'Netflix'), CATS, NONE, NOW);
    expect(r.subscriptions).toHaveLength(1);
  });

  it('points at this month when the usual day is ahead and unpaid, otherwise next month', () => {
    const ahead = computeRadar(monthly('subscriptions', 649, 18, 'Netflix'), CATS, NONE, NOW).subscriptions[0];
    expect(ahead).toMatchObject({ nextDate: '2026-08-18', dueToLog: false });
    const paid = computeRadar([...monthly('subscriptions', 649, 18, 'Netflix'), tx({ date: '2026-08-04', amount: 649, category: 'subscriptions', merchant: 'Netflix' })], CATS, NONE, NOW).subscriptions[0];
    // The usual day follows the last logged payment (the Calendar's rule), here the 4th.
    expect(paid).toMatchObject({ nextDate: '2026-09-04', dueToLog: false });
  });

  it('asks "paid it?" only when the day passed and nothing is logged this month', () => {
    const row = computeRadar(monthly('subscriptions', 119, 3, 'Spotify'), CATS, NONE, NOW).subscriptions[0];
    expect(row).toMatchObject({ dueToLog: true, nextDate: '2026-09-03' });
  });

  it('clamps day 31 to the end of a short month', () => {
    const row = computeRadar(monthly('subscriptions', 100, 31, 'Gym'), CATS, NONE, new Date(2026, 1, 2)).subscriptions[0];
    expect(row.nextDate).toBe('2026-02-28');
  });

  it('keeps a muted subscription listed, flagged as muted', () => {
    const key = subscriptionKey('subscriptions', 'netflix');
    const row = computeRadar(monthly('subscriptions', 649, 18, 'Netflix'), CATS, { muted: [key], trials: [] }, NOW).subscriptions[0];
    expect(row.muted).toBe(true);
  });

  it('lists trials soonest first and drops those over for more than a day', () => {
    const prefs: RadarPrefs = { muted: [], trials: [
      { id: 'a', name: 'Old', end: '2026-08-01' }, { id: 'b', name: 'Late', end: '2026-08-20' }, { id: 'c', name: 'Soon', end: '2026-08-12' },
    ] };
    expect(computeRadar([], CATS, prefs, NOW).trials.map((t) => [t.name, t.daysLeft])).toEqual([['Soon', 2], ['Late', 10]]);
  });
});

describe('computeRadarEvents', () => {
  it('emits a renewal per unpaid month and none for a month that is already paid', () => {
    const items = [...monthly('subscriptions', 649, 18, 'Netflix'), tx({ date: '2026-08-04', amount: 649, category: 'subscriptions', merchant: 'Netflix' })];
    const dates = computeRadarEvents(items, CATS, NONE, NOW).map((e) => e.date);
    expect(dates.filter((d) => d.startsWith('2026-08'))).toEqual([]);
    expect(dates).toContain('2026-09-04');
  });

  it('emits nothing for a muted subscription, and a trial regardless of the list', () => {
    const key = subscriptionKey('subscriptions', 'netflix');
    const events = computeRadarEvents(monthly('subscriptions', 649, 18, 'Netflix'), CATS, { muted: [key], trials: [{ id: 't', name: 'Spotify', end: '2026-08-14' }] }, NOW);
    expect(events).toEqual([{ date: '2026-08-14', title: 'Spotify', kind: 'trial' }]);
  });
});

describe('prefs', () => {
  beforeEach(() => localStorage.clear());

  it('rejects a trial with no name or an impossible date, and caps the name', () => {
    expect(addTrial(NONE, '  ', '2026-08-14')).toBeNull();
    expect(addTrial(NONE, 'Spotify', '2026-02-31')).toBeNull();
    expect(addTrial(NONE, 'x'.repeat(200), '2026-08-14')?.trials[0].name).toHaveLength(60);
  });

  it('adds, removes and toggles, and survives a round trip through storage', () => {
    const added = addTrial(NONE, 'Spotify', '2026-08-14')!;
    const muted = toggleMuted(added, 'k');
    expect(saveRadarPrefs(muted)).toBe(true);
    expect(loadRadarPrefs()).toEqual(muted);
    expect(toggleMuted(muted, 'k').muted).toEqual([]);
    expect(removeTrial(muted, added.trials[0].id).trials).toEqual([]);
  });

  it('ignores a corrupted store', () => {
    localStorage.setItem('fx_sub_radar', JSON.stringify({ muted: [1, 'ok'], trials: [{ id: 1 }, { id: 'a', name: 'n', end: 'nope' }] }));
    expect(loadRadarPrefs()).toEqual({ muted: ['ok'], trials: [] });
  });

  it('drops the calendar bill of a muted subscription by id', () => {
    const key = subscriptionKey('subscriptions', 'netflix');
    const events = [
      { id: `bill-${encodeURIComponent(key)}-2026-08` }, { id: `bill-${encodeURIComponent(subscriptionKey('rent', null))}-2026-08` },
    ];
    expect(dropMutedBills(events, [key])).toEqual([events[1]]);
  });
});

describe('logSubscriptionPayment', () => {
  beforeEach(() => localStorage.clear());

  it('logs today at the usual amount, with the merchant, and leaves the rest of the ledger alone', () => {
    const prior = monthly('subscriptions', 119, 3, 'Spotify');
    localStorage.setItem('fx_expenses', JSON.stringify(prior));
    const row = computeRadar(prior, CATS, NONE, NOW).subscriptions[0];
    const item = logSubscriptionPayment(row, NOW)!;
    expect(item).toMatchObject({ amount: 119, category: 'subscriptions', merchant: 'Spotify', date: '2026-08-10' });
    expect(loadExpenses()).toHaveLength(4);
  });
});
