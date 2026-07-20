import { describe, it, expect } from 'vitest';
import { frequentCategoryKeys } from '../tools/lib/expenseAnalytics';
import type { ExpenseItem } from '../tools/lib/expense';

const tx = (category: string, date: string): ExpenseItem =>
  ({ id: `${category}-${date}`, amount: 1, category, date });

const valid = new Set(['rent', 'groceries', 'eating_out', 'shopping']);

describe('frequentCategoryKeys', () => {
  it('ranks by usage frequency, most-used first', () => {
    const items = [
      tx('groceries', '2026-07-01'), tx('groceries', '2026-07-02'), tx('groceries', '2026-07-03'),
      tx('rent', '2026-07-01'),
      tx('eating_out', '2026-07-01'), tx('eating_out', '2026-07-02'),
    ];
    expect(frequentCategoryKeys(items, valid)).toEqual(['groceries', 'eating_out', 'rent']);
  });

  it('breaks frequency ties by most-recent use', () => {
    const items = [
      tx('rent', '2026-07-01'),        // count 1, last 07-01
      tx('shopping', '2026-07-20'),    // count 1, last 07-20 (more recent → first)
    ];
    expect(frequentCategoryKeys(items, valid)).toEqual(['shopping', 'rent']);
  });

  it('ignores categories not in the valid set (migrated / removed)', () => {
    const items = [tx('groceries', '2026-07-01'), tx('legacy_cat', '2026-07-02')];
    expect(frequentCategoryKeys(items, valid)).toEqual(['groceries']);
  });

  it('honours the limit and returns [] for empty history', () => {
    const items = [tx('rent', '1'), tx('groceries', '2'), tx('eating_out', '3'), tx('shopping', '4')];
    expect(frequentCategoryKeys(items, valid, 2)).toHaveLength(2);
    expect(frequentCategoryKeys([], valid)).toEqual([]);
  });
});
