import { describe, it, expect } from 'vitest';
import {
  buildMoneyStory,
  buildStoryCards,
  latestCompletedMonth,
} from '../tools/lib/moneyStory';
import type { CatMeta } from '../tools/lib/expenseAnalytics';
import type { ExpenseItem } from '../tools/lib/expense';

const CATS = new Map<string, CatMeta>(
  ([
    { k: 'rent', l: 'Rent', ic: 'rent', section: 'needs' },
    { k: 'groceries', l: 'Groceries', ic: 'grocery', section: 'needs' },
    { k: 'eating_out', l: 'Eating out', ic: 'dining', section: 'wants' },
    { k: 'sip', l: 'SIP', ic: 'invest', section: 'save' },
  ] satisfies CatMeta[]).map((c) => [c.k, c]),
);

let seq = 0;
function tx(date: string, category: string, amount: number): ExpenseItem {
  return { id: `t${++seq}`, category, amount, date };
}

describe('latestCompletedMonth', () => {
  const items = [tx('2026-10-05', 'rent', 100), tx('2026-11-03', 'rent', 100), tx('2026-12-02', 'rent', 100)];

  it('never returns the month still running', () => {
    // 10 December: November is the newest finished month, not "December so far".
    expect(latestCompletedMonth(items, new Date(2026, 11, 10))).toBe('2026-11');
  });

  it('skips a finished month with no data', () => {
    expect(latestCompletedMonth(items, new Date(2027, 2, 1))).toBe('2026-12');
    expect(latestCompletedMonth([tx('2026-10-05', 'rent', 1)], new Date(2026, 11, 10))).toBe('2026-10');
  });

  it('is null when only the running month has data', () => {
    expect(latestCompletedMonth([tx('2026-12-02', 'rent', 1)], new Date(2026, 11, 10))).toBeNull();
    expect(latestCompletedMonth([], new Date(2026, 11, 10))).toBeNull();
  });
});

describe('buildMoneyStory', () => {
  const items = [
    // October
    tx('2026-10-01', 'rent', 10000),
    tx('2026-10-10', 'groceries', 3000),
    tx('2026-10-12', 'eating_out', 2000),
    tx('2026-10-15', 'sip', 1000),
    // November
    tx('2026-11-01', 'rent', 10000),
    tx('2026-11-10', 'groceries', 3300),
    tx('2026-11-12', 'eating_out', 800),
    tx('2026-11-15', 'sip', 1500),
  ];
  const story = buildMoneyStory(items, '2026-11', CATS);

  it('totals needs and wants only; savings are set aside, not spent', () => {
    expect(story.consumedTotal).toBe(14100);
    expect(story.saved.amount).toBe(1500);
    expect(story.saved.previous).toBe(1000);
  });

  it('compares with the previous month in whole percent', () => {
    // October consumed 15000 -> 14100 is -6%.
    expect(story.overallPct).toBe(-6);
    expect(story.hasComparison).toBe(true);
    expect(story.saved.pct).toBe(50);
  });

  it('picks the top category as a share of spending, never savings', () => {
    expect(story.topCategory).toMatchObject({ key: 'rent', amount: 10000, sharePct: 71 });
  });

  it('picks the biggest absolute change', () => {
    // Eating out -1200 beats groceries +300.
    expect(story.biggestChange).toMatchObject({
      key: 'eating_out', direction: 'down', change: -1200, pct: 60, current: 800, previous: 2000,
    });
  });

  it('ignores changes under 2% of last month\'s spending', () => {
    // 2% of 15000 = 300; a +299 change is noise, +300 qualifies.
    const small = buildMoneyStory([
      tx('2026-10-01', 'rent', 10000), tx('2026-10-02', 'groceries', 5000),
      tx('2026-11-01', 'rent', 10000), tx('2026-11-02', 'groceries', 5299),
    ], '2026-11', CATS);
    expect(small.biggestChange).toBeNull();
    const edge = buildMoneyStory([
      tx('2026-10-01', 'rent', 10000), tx('2026-10-02', 'groceries', 5000),
      tx('2026-11-01', 'rent', 10000), tx('2026-11-02', 'groceries', 5300),
    ], '2026-11', CATS);
    expect(edge.biggestChange).toMatchObject({ key: 'groceries', direction: 'up', pct: 6 });
  });

  it('marks a category with nothing last month as new, with no percentage', () => {
    const s = buildMoneyStory([
      tx('2026-10-01', 'rent', 10000),
      tx('2026-11-01', 'rent', 10000), tx('2026-11-05', 'eating_out', 2000),
    ], '2026-11', CATS);
    expect(s.biggestChange).toMatchObject({ key: 'eating_out', direction: 'new', pct: null });
  });

  it('leaves out every comparison when last month has no spending', () => {
    const s = buildMoneyStory([tx('2026-11-01', 'rent', 10000), tx('2026-11-02', 'sip', 500)], '2026-11', CATS);
    expect(s.hasComparison).toBe(false);
    expect(s.overallPct).toBeNull();
    expect(s.biggestChange).toBeNull();
    expect(s.saved.pct).toBeNull();
    expect(s.topCategory?.sharePct).toBe(100);
    const change = buildStoryCards(s, null).find((c) => c.id === 'change');
    expect(change?.headline).toBe('Come back next month');
  });

  it('shows the saved % only when last month set something aside', () => {
    const s = buildMoneyStory([
      tx('2026-10-01', 'rent', 100), tx('2026-11-01', 'rent', 100), tx('2026-11-02', 'sip', 500),
    ], '2026-11', CATS);
    expect(s.saved).toMatchObject({ amount: 500, previous: 0, pct: null });
  });

  it('resolves a legacy category key into the live one', () => {
    // `food` is a pre-V4.1 key that migrates to eating_out.
    const s = buildMoneyStory([
      tx('2026-10-01', 'food', 1000), tx('2026-11-01', 'eating_out', 2000), tx('2026-11-02', 'rent', 500),
    ], '2026-11', CATS);
    expect(s.biggestChange).toMatchObject({ key: 'eating_out', previous: 1000, current: 2000 });
  });

  it('rounds across a January boundary', () => {
    const s = buildMoneyStory([
      tx('2026-12-10', 'rent', 1000), tx('2027-01-10', 'rent', 1500),
    ], '2027-01', CATS);
    expect(s.prevMonth).toBe('2026-12');
    expect(s.overallPct).toBe(50);
  });
});

describe('buildStoryCards', () => {
  const s = buildMoneyStory([
    tx('2026-10-01', 'rent', 10000), tx('2026-10-12', 'eating_out', 2000),
    tx('2026-11-01', 'rent', 10000), tx('2026-11-12', 'eating_out', 800), tx('2026-11-15', 'sip', 1500),
  ], '2026-11', CATS);

  it('always makes five cards in order', () => {
    expect(buildStoryCards(s, null).map((c) => c.id)).toEqual(['overview', 'top', 'change', 'saved', 'close']);
  });

  it('carries no amount when amounts are hidden', () => {
    const text = JSON.stringify(buildStoryCards(s, null));
    expect(text.replace(/2026/g, '')).not.toMatch(/\d{3,}/);
    expect(text).not.toMatch(/₹/);
  });

  it('carries amounts when asked', () => {
    const cards = buildStoryCards(s, (n) => `₹${n}`);
    expect(cards[0].headline).toBe('You spent ₹10800');
    expect(cards.find((c) => c.id === 'saved')?.headline).toBe('You set aside ₹1500');
  });

  it('handles a month with no spending at all', () => {
    const empty = buildMoneyStory([tx('2026-11-02', 'sip', 500)], '2026-11', CATS);
    const cards = buildStoryCards(empty, null);
    expect(cards).toHaveLength(5);
    expect(cards[0].headline).toBe('A quiet month for spending');
    expect(cards[1].headline).toBe('No spending to rank');
  });
});
