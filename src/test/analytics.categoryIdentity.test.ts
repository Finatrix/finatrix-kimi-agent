/**
 * Analytics must file a transaction under the same category the dashboard does.
 *
 * `computeDashboard` resolves stored keys through `migrateCategory`, so a
 * pre-V4.1 `food` row is Eating Out. expenseAnalytics grouped on the RAW key,
 * which split one category into two buckets for anyone with data from before the
 * merge: each bucket held part of the total, and the legacy one carried its raw
 * storage key as its label because `catMeta` has no entry for it.
 *
 * The consequences are figures, not cosmetics — "your biggest category", the
 * month-over-month comparison, the recurring-subscription detector and the
 * generated insights all read these buckets.
 */
import { describe, it, expect } from 'vitest';
import {
  frequentCategoryKeys, computeMonthlyTrend, computeCategoryComparison, detectRecurring,
  type CatMeta,
} from '../tools/lib/expenseAnalytics';
import { allCategories, mergedCats } from '../tools/lib/budget';
import type { ExpenseItem } from '../tools/lib/expense';

const cats = mergedCats({ needs: [], wants: [], save: [] });
const catMeta = new Map<string, CatMeta>(allCategories(cats).map((c) => [c.k, c]));
const validKeys = new Set(catMeta.keys());

/**
 * A user who has been on FinatriX since before the merge: the same real-world
 * category, logged under both spellings.
 */
const items: ExpenseItem[] = [
  { id: 'a', amount: 4000, category: 'food', date: '2026-07-03', merchant: 'Third Wave' },
  { id: 'b', amount: 3000, category: 'eating_out', date: '2026-07-14', merchant: 'Third Wave' },
  { id: 'c', amount: 2500, category: 'food', date: '2026-06-03', merchant: 'Third Wave' },
  { id: 'd', amount: 1000, category: 'groceries', date: '2026-07-06' },
];

describe('expenseAnalytics resolves legacy category keys', () => {
  it('reports one top category, not two half-sized ones', () => {
    const trend = computeMonthlyTrend(items, '2026-07', 1, catMeta);
    const july = trend[trend.length - 1];
    // 4000 + 3000 as ONE Eating Out bucket. Grouped raw, the winner was the
    // 4000 "food" bucket — under-reported, and labelled with the storage key.
    expect(july.topCategory).toBe('Eating Out');
    expect(july.topCategorySpent).toBe(7000);
  });

  it('compares a category against its own previous month across the merge', () => {
    const cmp = computeCategoryComparison(items, '2026-07', catMeta);
    const eating = cmp.find((c) => c.category === 'eating_out')!;
    expect(eating.label).toBe('Eating Out');
    expect(eating.currentMonth).toBe(7000);
    expect(eating.previousMonth).toBe(2500); // the legacy June row still counts
    expect(eating.direction).toBe('up');
    // Never both spellings as separate rows.
    expect(cmp.filter((c) => c.category === 'food')).toHaveLength(0);
  });

  it('detects one recurring pattern rather than two unconfident ones', () => {
    // Same merchant and same real category on both sides of the merge. Keyed
    // raw, "food::third wave" and "eating_out::third wave" were two groups —
    // and a group needs 2+ distinct months to count as recurring, so splitting
    // them is what stopped the pattern being detected at all.
    const found = detectRecurring(items, catMeta);
    const thirdWave = found.filter((p) => p.merchant === 'third wave');
    expect(thirdWave).toHaveLength(1);
    expect(thirdWave[0].label).toBe('Eating Out');
    expect(thirdWave[0].monthsDetected).toBe(2);
  });

  it('offers a category that exists ONLY under its legacy key', () => {
    // Deliberately no `eating_out` row: everything is stored the old way, which
    // is the state of a user who has not logged anything since the merge. The
    // raw membership check dropped every one of these, so their most-used
    // category could never reach the "Recent" quick-pick — and the ranking below
    // it was computed from whatever was left.
    const legacyOnly: ExpenseItem[] = [
      { id: 'a', amount: 400, category: 'food', date: '2026-07-03' },
      { id: 'b', amount: 300, category: 'food', date: '2026-07-05' },
      { id: 'c', amount: 900, category: 'grocery', date: '2026-07-04' },
    ];
    const keys = frequentCategoryKeys(legacyOnly, validKeys, 5);
    // Migrated to live keys, and ranked by use: two Eating Out, one Groceries.
    expect(keys).toEqual(['eating_out', 'groceries']);
  });

  it('still drops a key that resolves nowhere', () => {
    const junk: ExpenseItem[] = [{ id: 'z', amount: 1, category: 'not_a_category', date: '2026-07-01' }];
    expect(frequentCategoryKeys(junk, validKeys, 5)).toEqual([]);
  });
});
