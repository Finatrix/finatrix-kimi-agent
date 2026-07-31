/**
 * One category identity, everywhere.
 *
 * `computeDashboard` resolves a stored category key through `migrateCategory`,
 * so a pre-V4.1 `food` row is totalled under **Eating Out**. Several surfaces
 * compared the RAW key instead, and the disagreement was visible in exactly the
 * places a user checks a total: a budget warning drilled through to an empty
 * transaction list, the category's filter chip never appeared, one export
 * document printed both spellings, and the AI focus block contradicted itself.
 *
 * These tests pin the contract: any surface that reports on a category must
 * agree with the dashboard about which transactions are in it.
 */
import { describe, it, expect } from 'vitest';
import { filterTransactions, sortTransactions, emptyFilters, type CatLabels } from '../tools/lib/txfilter';
import { computeDashboard, type ExpenseItem } from '../tools/lib/expense';
import { mergedCats } from '../tools/lib/budget';

const cats = mergedCats({ needs: [], wants: [], save: [] });
const labels: CatLabels = { rent: 'Rent', groceries: 'Groceries', eating_out: 'Eating Out' };

/** A legacy `food` row and a current `eating_out` row are the same category. */
const items: ExpenseItem[] = [
  { id: 'legacy', amount: 1000, category: 'food', date: '2026-07-11', merchant: 'Dosa Plaza' },
  { id: 'current', amount: 3000, category: 'eating_out', date: '2026-07-08', merchant: 'Blue Tokai' },
  { id: 'rent', amount: 20000, category: 'rent', date: '2026-07-01' },
];

describe('category identity is shared between the dashboard and the transaction list', () => {
  it('filters a migrated key onto the rows the dashboard counted', () => {
    // What the dashboard reports for this category…
    const dash = computeDashboard('2026-07', items, cats, { eating_out: 3500 }, new Date('2026-07-15T10:00:00'));
    const eating = dash.categories.find((c) => c.k === 'eating_out')!;
    expect(eating.spent).toBe(4000);

    // …must be exactly what drilling into it shows. This is the path a budget
    // warning takes: focusCategory('eating_out').
    const rows = filterTransactions(items, { ...emptyFilters(), categories: ['eating_out'] }, labels);
    expect(rows.map((r) => r.id).sort()).toEqual(['current', 'legacy']);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(eating.spent);
  });

  it('finds a legacy row by the category name the app displays for it', () => {
    const rows = filterTransactions(items, { ...emptyFilters(), query: 'eating out' }, labels);
    expect(rows.map((r) => r.id).sort()).toEqual(['current', 'legacy']);
  });

  it('sorts a legacy row under its display label, not its raw key', () => {
    // Both Eating Out rows now compare equal on category, so the documented
    // tiebreak (newest first) decides between them: 11 Jul before 8 Jul. Under
    // the raw keys they compared as "food" vs "eating_out" — two different
    // headings for one category, with Rent's "rent" sorting between them.
    const sorted = sortTransactions(items, 'category', labels);
    expect(sorted.map((r) => r.id)).toEqual(['legacy', 'current', 'rent']);
  });

  it('leaves an unmapped key alone rather than inventing a home for it', () => {
    const odd: ExpenseItem[] = [{ id: 'x', amount: 5, category: 'not_a_category', date: '2026-07-01' }];
    expect(filterTransactions(odd, { ...emptyFilters(), categories: ['not_a_category'] }, labels)).toHaveLength(1);
    expect(filterTransactions(odd, { ...emptyFilters(), categories: ['eating_out'] }, labels)).toHaveLength(0);
  });
});
