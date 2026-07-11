import { describe, it, expect, beforeEach } from 'vitest';
import {
  genExpenseId, normalizeExpense, loadExpenses, saveExpenses, PAYMENT_METHODS,
  type ExpenseItem,
} from '../tools/lib/expense';

describe('expense — persistent transaction identity', () => {
  beforeEach(() => localStorage.clear());

  it('generates unique ids even within the same millisecond', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 2000; i++) ids.add(genExpenseId());
    expect(ids.size).toBe(2000);
  });

  it('ids are non-empty strings', () => {
    const id = genExpenseId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(3);
  });

  it('migrates legacy numeric ids to a stable string, preserving identity', () => {
    // Simulate a record persisted by an older build (numeric id).
    saveExpenses([{ id: 1720000000000, amount: 500, category: 'rent', date: '2026-07-01' } as unknown as ExpenseItem]);
    const loaded = loadExpenses();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('1720000000000'); // deterministic string form, not regenerated
    // Reloading yields the same identity (idempotent migration).
    saveExpenses(loaded);
    expect(loadExpenses()[0].id).toBe('1720000000000');
  });

  it('mints an id only when one is truly absent', () => {
    const a = normalizeExpense({ amount: 10, category: 'rent', date: '2026-07-01' });
    expect(a.id).toMatch(/^tx_/);
    const b = normalizeExpense({ amount: 10, category: 'rent', date: '2026-07-01' });
    expect(a.id).not.toBe(b.id);
  });

  it('normalises the extended metadata fields', () => {
    const it = normalizeExpense({
      id: 'x1', amount: 42, category: 'groceries', date: '2026-07-02',
      merchant: 'Corner Store', paymentMethod: 'UPI', tags: ['weekly', '', '  ', 'food'],
      recurring: true, notes: 'stocked up', note: 'shop',
    });
    expect(it).toMatchObject({
      id: 'x1', amount: 42, merchant: 'Corner Store', paymentMethod: 'UPI',
      recurring: true, notes: 'stocked up', note: 'shop',
    });
    expect(it.tags).toEqual(['weekly', 'food']); // blanks filtered out
  });

  it('drops empty optional fields so the stored shape stays lean', () => {
    const it = normalizeExpense({ id: 'x2', amount: 5, category: 'rent', date: '2026-07-01', merchant: '', tags: [] });
    expect(it.merchant).toBeUndefined();
    expect(it.tags).toBeUndefined();
    expect(it.recurring).toBeUndefined();
  });

  it('exposes a sensible set of payment methods', () => {
    expect(PAYMENT_METHODS).toContain('UPI');
    expect(PAYMENT_METHODS).toContain('Cash');
    expect(new Set(PAYMENT_METHODS).size).toBe(PAYMENT_METHODS.length);
  });
});
