import { describe, expect, it } from 'vitest';
import { BUILTIN_CATS, type BudgetStore } from '../tools/lib/budget';
import type { ExpenseItem } from '../tools/lib/expense';
import { buildWatchContext, WATCH_CATEGORY_LIMIT } from '../tools/lib/watchData';
import { buildWidgetPayload } from '../tools/lib/widgetData';

/**
 * The watch prints the widget document and a short category list. The figure
 * is the widget's (so the Expenses page's), never recomputed for the watch.
 */
let seq = 0;
const tx = (date: string, category: string, amount: number): ExpenseItem => ({ id: `t${++seq}`, date, category, amount });
const NOW = new Date(2026, 2, 15, 14, 30);
const budgetStore: BudgetStore = {
  '2026-03': { vals: { groceries: 600, eating_out: 300, emergency: 1000 }, income: '5000', n: '50', w: '30', s: '20' },
};
const items = [
  tx('2026-03-02', 'groceries', 300), tx('2026-03-03', 'groceries', 100), tx('2026-03-09', 'groceries', 250),
  tx('2026-03-11', 'eating_out', 120), tx('2026-03-12', 'eating_out', 80),
  tx('2026-03-12', 'emergency', 1000), tx('2026-03-13', 'transfers', 500),
];
const widget = buildWidgetPayload({
  items, cats: BUILTIN_CATS, budgetStore, currency: 'INR', hidden: false, lockScreenAmounts: false, now: NOW,
});
const ctx = (over = {}) => buildWatchContext({ widget, items, cats: BUILTIN_CATS, currency: 'INR', now: NOW, ...over });

describe('watch context', () => {
  it('wraps the widget document untouched, so the figure cannot differ from the widget', () => {
    expect(ctx().widget).toBe(widget);
    expect(ctx().widget.days[0].text).toBe(widget.days[0].text);
  });

  it('keeps Hide amounts: a hidden widget has no amounts, so neither has the watch', () => {
    const hidden = buildWidgetPayload({
      items, cats: BUILTIN_CATS, budgetStore, currency: 'INR', hidden: true, lockScreenAmounts: false, now: NOW,
    });
    const c = ctx({ widget: hidden });
    expect(c.widget.days).toEqual([]);
    expect(JSON.stringify(c)).not.toMatch(/₹\s?\d/);
    expect(c.widget.mask).toContain('•');
  });

  it('lists the most-used spending categories first, then the rest, capped', () => {
    const keys = ctx().categories.map((c) => c.k);
    expect(keys.slice(0, 2)).toEqual(['groceries', 'eating_out']);
    expect(keys).toHaveLength(WATCH_CATEGORY_LIMIT);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never offers savings or transfers for a quick spend', () => {
    const keys = ctx().categories.map((c) => c.k);
    expect(keys).not.toContain('emergency');
    expect(keys).not.toContain('transfers');
    expect(keys).not.toContain('stocks');
  });

  it('labels each category the way the app prints it', () => {
    const g = ctx().categories.find((c) => c.k === 'groceries');
    expect(g?.l).toBe('Groceries');
  });

  it('falls back to the first spending categories for an empty ledger', () => {
    const keys = ctx({ items: [] }).categories.map((c) => c.k);
    expect(keys[0]).toBe('rent');
    expect(keys).toHaveLength(WATCH_CATEGORY_LIMIT);
  });

  it('gives the keypad the currency symbol, and carries the version and time', () => {
    const c = ctx();
    expect(c.symbol).toBe('₹');
    expect(c.v).toBe(1);
    expect(c.updatedAt).toBe(NOW.toISOString());
    expect(ctx({ currency: 'AED' }).symbol).toBe('AED');
  });
});
