import { describe, it, expect } from 'vitest';
import {
  computeStreaks,
  detectRecurring,
  generateInsights,
  type CatMeta,
} from '../tools/lib/expenseAnalytics';
import type { ExpenseItem } from '../tools/lib/expense';

/**
 * The derived-analytics layer, at the level where its mistakes are visible to a
 * user: a streak badge that is not current, a pacing insight about a month that
 * has already ended, and a "recurring bill" that is not a bill.
 */

const CATS = new Map<string, CatMeta>(
  ([
    { k: 'rent', l: 'Rent', ic: 'rent', section: 'needs' },
    { k: 'groceries', l: 'Groceries', ic: 'grocery', section: 'needs' },
    { k: 'subs', l: 'Subscriptions', ic: 'subs', section: 'wants' },
  ] satisfies CatMeta[]).map((c) => [c.k, c]),
);

let seq = 0;
function tx(date: string, amount: number, over: Partial<ExpenseItem> = {}): ExpenseItem {
  return { id: `t${++seq}`, category: 'groceries', amount, date, ...over };
}

/** `d` days before `from`, as a YYYY-MM-DD key in local time. */
function daysBefore(from: Date, d: number): string {
  const x = new Date(from);
  x.setDate(x.getDate() - d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

describe('computeStreaks', () => {
  const NOW = new Date(2026, 6, 20, 9); // 20 July 2026

  it('counts a run of logged days that reaches today', () => {
    const items = [0, 1, 2].map((d) => tx(daysBefore(NOW, d), 100));
    const logging = computeStreaks(items, NOW).find((s) => s.type === 'logging')!;
    expect(logging.current).toBe(3);
    expect(logging.label).toBe('3 days logging');
  });

  it('still counts a run that ends yesterday — today is simply not logged yet', () => {
    const items = [1, 2].map((d) => tx(daysBefore(NOW, d), 100));
    const logging = computeStreaks(items, NOW).find((s) => s.type === 'logging')!;
    expect(logging.current).toBe(2);
  });

  /**
   * The regression. A run that ended months ago is history, not a habit, and
   * the previous implementation walked backwards until it found *any* run and
   * reported it as the current one — awarding a badge for a streak the user
   * had already broken.
   */
  it('does not present an old, broken run as the current streak', () => {
    const items = [200, 201, 202, 203, 204].map((d) => tx(daysBefore(NOW, d), 100));
    const logging = computeStreaks(items, NOW).find((s) => s.type === 'logging')!;
    expect(logging.current).toBe(0);
    expect(logging.label).toBe('Start logging daily');
  });

  it('reports consecutive no-spend days ending today', () => {
    const items = [tx(daysBefore(NOW, 4), 100)];
    const noSpend = computeStreaks(items, NOW).find((s) => s.type === 'no_spend');
    expect(noSpend?.current).toBe(4);
  });

  it('reports no no-spend streak on a day that has spending', () => {
    const items = [tx(daysBefore(NOW, 0), 100)];
    expect(computeStreaks(items, NOW).some((s) => s.type === 'no_spend')).toBe(false);
  });
});

describe('detectRecurring', () => {
  const bill = (month: string, amount: number, merchant?: string) =>
    tx(`${month}-05`, amount, { category: 'subs', ...(merchant ? { merchant } : {}) });

  it('finds a steady monthly charge', () => {
    const items = [bill('2026-05', 499), bill('2026-06', 499), bill('2026-07', 499)];
    const [pattern] = detectRecurring(items, CATS);
    expect(pattern.category).toBe('subs');
    expect(pattern.estimatedMonthly).toBe(499);
    expect(pattern.monthsDetected).toBe(3);
  });

  /**
   * A merchant name is user-typed and may contain anything. The group's
   * identity used to be re-parsed out of a `cat::merchant` string with
   * `split('::')`, which silently truncated any name containing the separator.
   */
  it('keeps a merchant name that contains the group separator intact', () => {
    const name = 'ACME::Cloud';
    const items = [bill('2026-05', 499, name), bill('2026-06', 499, name), bill('2026-07', 499, name)];
    const [pattern] = detectRecurring(items, CATS);
    expect(pattern.merchant).toBe(name.toLowerCase());
  });

  /**
   * `computeCommitments` SUBTRACTS a pattern's estimate from the money it
   * reports as free to spend, so a non-positive "bill" is not merely noise. A
   * pair of transactions never reaches the coefficient-of-variation check (it
   * needs three), so a charge and a larger refund in two different months used
   * to form a pattern with a negative estimate — which then *added* to the
   * user's free cash.
   */
  it('ignores a two-month group whose refund exceeds its charge', () => {
    const items = [
      tx('2026-06-05', 100, { category: 'subs' }),
      tx('2026-07-05', -500, { category: 'subs' }),
    ];
    expect(detectRecurring(items, CATS)).toEqual([]);
  });

  it('ignores a group that nets to exactly zero', () => {
    const items = [
      tx('2026-06-05', 500, { category: 'subs' }),
      tx('2026-07-05', -500, { category: 'subs' }),
    ];
    expect(detectRecurring(items, CATS)).toEqual([]);
  });
});

describe('generateInsights', () => {
  const NOW = new Date(2026, 6, 20, 9); // 20 July 2026 — 20 of 31 days gone

  it('warns when the running month is spending ahead of pace', () => {
    const items = [tx('2026-07-02', 9500, { category: 'rent' })];
    const ids = generateInsights(items, '2026-07', 10000, CATS, NOW).map((i) => i.id);
    expect(ids).toContain('pace_fast');
  });

  /**
   * The regression. The caller passes the month the user is LOOKING at, which
   * is routinely a past one, and the pace insight measured it against today's
   * day-of-month regardless — telling someone that a month which ended weeks
   * ago was "ahead of pace" with "only 65% of the month" gone.
   */
  it('says nothing about the pace of a month that has already ended', () => {
    const items = [tx('2026-05-02', 9500, { category: 'rent' })];
    const ids = generateInsights(items, '2026-05', 10000, CATS, NOW).map((i) => i.id);
    expect(ids).not.toContain('pace_fast');
    expect(ids).not.toContain('pace_good');
  });

  it('still reports pace-independent insights for a past month', () => {
    // One transaction is the whole month's spend, so "big ticket" holds
    // whenever the month is examined.
    const items = [tx('2026-05-02', 9500, { category: 'rent' })];
    const ids = generateInsights(items, '2026-05', 10000, CATS, NOW).map((i) => i.id);
    expect(ids).toContain('large_tx');
  });
});
