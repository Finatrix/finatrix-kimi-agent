import { describe, expect, it } from 'vitest';
import { BUILTIN_CATS } from '../tools/lib/budget';
import { previewBudgetRemainder, reviewBudgetActuals, undoBudgetPatch } from '../tools/lib/budgetSmartReview';

describe('smart budget review preserves calculator semantics', () => {
  it('uses migrated categories, refunds and only the selected month', () => {
    const review = reviewBudgetActuals('2026-09', [
      { id: '1', category: 'food', amount: 70.25, date: '2026-09-01' },
      { id: '2', category: 'eating_out', amount: -10.25, date: '2026-09-02' },
      { id: '3', category: 'rent', amount: 999, date: '2026-08-01' },
    ], BUILTIN_CATS, { eating_out: 50, rent: 100 });
    expect(review.gaps.map((row) => [row.k, row.spent])).toEqual([['eating_out', 60]]);
    expect(review.next).toEqual({ eating_out: 60, rent: 100 });
    expect(review.transactionCount).toBe(2);
  });
  it('retains unrecognised transactions for review without inventing a category allocation', () => {
    const review = reviewBudgetActuals('2026-09', [{ id: '1', category: 'deleted', amount: 40, date: '2026-09-01' }], BUILTIN_CATS, {});
    expect(review.unmatched).toHaveLength(1);
    expect(review.next).toEqual({});
  });
  it('allocates only a positive remainder to an active user-selected savings category', () => {
    const input = { incomeRaw: 100.25, needsRaw: 50, wantsRaw: 30, saveRaw: 20, vals: { rent: 20, emergency: 10 } };
    const preview = previewBudgetRemainder(input, BUILTIN_CATS, 'emergency')!;
    expect(preview.vals).toEqual({ rent: 20, emergency: 80.25 });
    expect(preview.after.free).toBe(0);
    expect(input.vals.emergency).toBe(10);
    expect(previewBudgetRemainder(input, BUILTIN_CATS, 'rent')).toBeNull();
    expect(previewBudgetRemainder({ ...input, incomeRaw: 0 }, BUILTIN_CATS, 'emergency')).toBeNull();
  });
  it('undo preserves later manual edits and unrelated new allocations', () => {
    expect(undoBudgetPatch({ rent: 30, emergency: 80, groceries: 5 }, { rent: 20 }, { rent: 30, emergency: 70 }))
      .toEqual({ rent: 20, emergency: 80, groceries: 5 });
    expect(undoBudgetPatch({ emergency: 70 }, {}, { emergency: 70 })).toEqual({});
  });
});
