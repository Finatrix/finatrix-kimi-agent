import { describe, it, expect } from 'vitest';
import {
  filterTransactions, sortTransactions, groupByTimeline, emptyFilters,
  hasActiveFilters, countActiveFilters, type CatLabels,
} from '../tools/lib/txfilter';
import type { ExpenseItem } from '../tools/lib/expense';

const labels: CatLabels = { rent: 'Rent', groceries: 'Groceries', eating_out: 'Eating Out' };

const items: ExpenseItem[] = [
  { id: 'a', amount: 20000, category: 'rent', date: '2026-07-01', merchant: 'Landlord', recurring: true, paymentMethod: 'Bank transfer' },
  { id: 'b', amount: 1200, category: 'groceries', date: '2026-07-05', merchant: 'BigBasket', tags: ['weekly'], paymentMethod: 'UPI' },
  { id: 'c', amount: 300, category: 'eating_out', date: '2026-07-05', note: 'Coffee with Sam', paymentMethod: 'Cash' },
  { id: 'd', amount: 5000, category: 'groceries', date: '2026-06-20', merchant: 'Costco', paymentMethod: 'Credit card' },
];

describe('filterTransactions', () => {
  it('matches query across merchant, description, category and tags', () => {
    expect(filterTransactions(items, { ...emptyFilters(), query: 'bigbasket' }, labels).map((e) => e.id)).toEqual(['b']);
    expect(filterTransactions(items, { ...emptyFilters(), query: 'coffee' }, labels).map((e) => e.id)).toEqual(['c']);
    expect(filterTransactions(items, { ...emptyFilters(), query: 'weekly' }, labels).map((e) => e.id)).toEqual(['b']);
    expect(filterTransactions(items, { ...emptyFilters(), query: 'rent' }, labels).map((e) => e.id)).toEqual(['a']);
  });

  it('filters by date range', () => {
    const r = filterTransactions(items, { ...emptyFilters(), dateFrom: '2026-07-01', dateTo: '2026-07-04' }, labels);
    expect(r.map((e) => e.id)).toEqual(['a']);
  });

  it('filters by category and payment method', () => {
    expect(filterTransactions(items, { ...emptyFilters(), categories: ['groceries'] }, labels).map((e) => e.id)).toEqual(['b', 'd']);
    expect(filterTransactions(items, { ...emptyFilters(), paymentMethods: ['UPI'] }, labels).map((e) => e.id)).toEqual(['b']);
  });

  it('filters by recurring state', () => {
    expect(filterTransactions(items, { ...emptyFilters(), recurring: 'recurring' }, labels).map((e) => e.id)).toEqual(['a']);
    expect(filterTransactions(items, { ...emptyFilters(), recurring: 'one_off' }, labels).map((e) => e.id)).toEqual(['b', 'c', 'd']);
  });

  it('filters by amount range', () => {
    const r = filterTransactions(items, { ...emptyFilters(), amountMin: 1000, amountMax: 6000 }, labels);
    expect(r.map((e) => e.id).sort()).toEqual(['b', 'd']);
  });

  it('combines constraints', () => {
    const r = filterTransactions(items, { ...emptyFilters(), categories: ['groceries'], amountMin: 2000 }, labels);
    expect(r.map((e) => e.id)).toEqual(['d']);
  });
});

describe('sortTransactions', () => {
  it('sorts by newest, oldest and amount', () => {
    expect(sortTransactions(items, 'newest', labels).map((e) => e.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(sortTransactions(items, 'oldest', labels).map((e) => e.id)).toEqual(['d', 'a', 'b', 'c']);
    expect(sortTransactions(items, 'amount_desc', labels).map((e) => e.id)).toEqual(['a', 'd', 'b', 'c']);
    expect(sortTransactions(items, 'amount_asc', labels).map((e) => e.id)).toEqual(['c', 'b', 'd', 'a']);
  });

  it('sorts by category label and merchant', () => {
    expect(sortTransactions(items, 'category', labels).map((e) => e.id)).toEqual(['c', 'b', 'd', 'a']);
    expect(sortTransactions(items, 'merchant', labels).map((e) => e.id)[0]).toBe('b'); // BigBasket first
  });

  it('does not mutate the input', () => {
    const before = items.map((e) => e.id);
    sortTransactions(items, 'amount_desc', labels);
    expect(items.map((e) => e.id)).toEqual(before);
  });
});

describe('groupByTimeline', () => {
  const now = new Date('2026-07-15T12:00:00');
  it('buckets into Today / Yesterday / week / month bands', () => {
    const tl: ExpenseItem[] = [
      { id: '1', amount: 1, category: 'rent', date: '2026-07-15' }, // today
      { id: '2', amount: 1, category: 'rent', date: '2026-07-14' }, // yesterday
      { id: '3', amount: 1, category: 'rent', date: '2026-07-13' }, // this week (Mon 13th)
      { id: '4', amount: 1, category: 'rent', date: '2026-07-02' }, // earlier this month
      { id: '5', amount: 1, category: 'rent', date: '2026-06-10' }, // June
    ];
    const groups = groupByTimeline(tl, now);
    const map = Object.fromEntries(groups.map((g) => [g.label, g.items.map((i) => i.id)]));
    expect(map['Today']).toEqual(['1']);
    expect(map['Yesterday']).toEqual(['2']);
    expect(map['Earlier this week']).toEqual(['3']);
    expect(map['Earlier this month']).toEqual(['4']);
    expect(map['June']).toEqual(['5']);
  });

  it('preserves incoming order within a band', () => {
    const tl: ExpenseItem[] = [
      { id: 'x', amount: 9, category: 'rent', date: '2026-07-15' },
      { id: 'y', amount: 3, category: 'rent', date: '2026-07-15' },
    ];
    const groups = groupByTimeline(tl, now);
    expect(groups[0].items.map((i) => i.id)).toEqual(['x', 'y']);
  });

  /**
   * Month labels must be decided against the reference date the caller passed,
   * not the wall clock. Before this, the bare-vs-year-qualified choice read
   * `new Date()`, so these same inputs produced "June" or "June 2026"
   * depending on what day the suite happened to run — a test that only failed
   * on 1 January, and a label that was wrong for any caller supplying its own
   * clock.
   */
  it('qualifies the year against the caller’s reference date, not the wall clock', () => {
    const tl: ExpenseItem[] = [{ id: '1', amount: 1, category: 'rent', date: '2026-06-10' }];
    const sameYear = groupByTimeline(tl, new Date('2026-07-15T12:00:00'));
    const nextYear = groupByTimeline(tl, new Date('2027-01-01T12:00:00'));

    expect(sameYear[0].label).toBe('June');
    expect(nextYear[0].label).toBe('June 2026');
  });
});

describe('filter meta helpers', () => {
  it('detects and counts active filters', () => {
    expect(hasActiveFilters(emptyFilters())).toBe(false);
    const f = { ...emptyFilters(), categories: ['rent'], amountMin: 10 };
    expect(hasActiveFilters(f)).toBe(true);
    expect(countActiveFilters(f)).toBe(2);
    // A bare query is not counted as a structured filter.
    expect(countActiveFilters({ ...emptyFilters(), query: 'abc' })).toBe(0);
  });
});
