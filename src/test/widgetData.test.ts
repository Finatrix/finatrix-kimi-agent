import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_CATS, type BudgetStore } from '../tools/lib/budget';
import { computeDashboard, type ExpenseItem } from '../tools/lib/expense';
import { loadCatViewFor } from '../tools/lib/budgetCatsMonth';
import { cfmt } from '../tools/lib/format';
import { resetAmountsHiddenCache, setAmountsHidden } from '../tools/lib/hideAmounts';
import {
  WIDGET_DAYS_AHEAD, WIDGET_LOCK_AMOUNTS_KEY, affectsWidget, buildWidgetPayload, currentWidgetPayload,
  lockScreenAmountsOn, setLockScreenAmounts, type WidgetInputs,
} from '../tools/lib/widgetData';

/**
 * The widgets print this document and do no maths of their own, so these
 * tests pin the three things they depend on: the amount is the Expense
 * Tracker's own figure, Hide amounts keeps it out of the document entirely,
 * and the lock screen shows it only once the user has said so.
 */

let seq = 0;
function tx(date: string, category: string, amount: number): ExpenseItem {
  return { id: `w${++seq}`, date, category, amount };
}

const NOW = new Date(2026, 2, 15, 14, 30); // 15 March 2026, mid-afternoon
const budgetStore: BudgetStore = {
  '2026-03': { vals: { groceries: 600, eating_out: 300, emergency: 1000 }, income: '5000', n: '50', w: '30', s: '20' },
};
const items = [
  tx('2026-03-02', 'groceries', 300),
  tx('2026-03-09', 'groceries', 250),
  tx('2026-03-11', 'eating_out', 120),
  tx('2026-03-12', 'emergency', 1000),
];

function input(over: Partial<WidgetInputs> = {}): WidgetInputs {
  return {
    items, cats: BUILTIN_CATS, budgetStore, currency: 'INR', hidden: false, lockScreenAmounts: false, now: NOW, ...over,
  };
}

/** What the Expenses page shows on `day` for the same records (ExpensePage passes local midnight). */
function pageFigure(day: Date): number | null {
  const midnight = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  return computeDashboard('2026-03', items, BUILTIN_CATS, budgetStore['2026-03'].vals, midnight, 5000).dailySafeSpend;
}

describe('widget payload — the amount', () => {
  it("is today's daily safe-spend, exactly as the Expenses page computes and prints it", () => {
    const p = buildWidgetPayload(input());
    const expected = pageFigure(NOW)!;
    // 230 left of the 900 spendable, over 17 days (today included).
    expect(expected).toBeCloseTo(230 / 17, 10);
    expect(p.days[0]).toEqual({ date: '2026-03-15', amount: expected, text: cfmt(expected, 'INR') });
    expect(p.days[0].text).toBe('₹14');
  });

  it("lists the following days as the page would show them if nothing else is logged", () => {
    const p = buildWidgetPayload(input());
    expect(p.days).toHaveLength(WIDGET_DAYS_AHEAD);
    p.days.forEach((d, i) => {
      expect(d.date).toBe(`2026-03-${String(15 + i).padStart(2, '0')}`);
      expect(d.amount).toBe(pageFigure(new Date(2026, 2, 15 + i)));
    });
  });

  it('stops at the end of the month rather than guess at next month', () => {
    const p = buildWidgetPayload(input({ now: new Date(2026, 2, 29) }));
    expect(p.days.map((d) => d.date)).toEqual(['2026-03-29', '2026-03-30', '2026-03-31']);
    // Last day: everything left is today's.
    expect(p.days[2].amount).toBeCloseTo(230, 10);
  });

  it('formats in the chosen currency', () => {
    const p = buildWidgetPayload(input({ currency: 'USD' }));
    expect(p.currency).toBe('USD');
    expect(p.days[0].text).toBe(cfmt(p.days[0].amount, 'USD'));
    expect(p.mask).toBe('$ ••••');
  });

  it('says there is no budget, with no amounts, when nothing outside savings is planned', () => {
    const savingsOnly: BudgetStore = { '2026-03': { vals: { emergency: 1000 }, income: '5000', n: '50', w: '30', s: '20' } };
    const p = buildWidgetPayload(input({ budgetStore: savingsOnly }));
    expect(p.noBudget).toBe(true);
    expect(p.days).toEqual([]);
    expect(buildWidgetPayload(input({ budgetStore: {} })).noBudget).toBe(true);
  });

  it('shows zero, not a negative, once the month is overspent — the page clamps it the same way', () => {
    const over = [...items, tx('2026-03-14', 'eating_out', 5000)];
    const p = buildWidgetPayload(input({ items: over }));
    expect(p.days[0].amount).toBe(0);
    expect(p.days[0].text).toBe('₹0');
  });
});

describe('widget payload — Hide amounts', () => {
  it('writes no amount at all while amounts are hidden', () => {
    const p = buildWidgetPayload(input({ hidden: true }));
    expect(p.hidden).toBe(true);
    expect(p.days).toEqual([]);
    expect(p.mask).toBe('₹ ••••');
    const json = JSON.stringify(p);
    expect(json).not.toContain('₹14');
    expect(json).not.toContain(String(pageFigure(NOW)));
  });

  it('still says when there is no budget, so the widget can ask for one', () => {
    const p = buildWidgetPayload(input({ hidden: true, budgetStore: {} }));
    expect(p).toMatchObject({ hidden: true, noBudget: true, days: [] });
  });
});

describe('widget payload — the lock-screen setting', () => {
  it('carries the setting through unchanged', () => {
    expect(buildWidgetPayload(input()).lockScreenAmounts).toBe(false);
    expect(buildWidgetPayload(input({ lockScreenAmounts: true })).lockScreenAmounts).toBe(true);
  });

  it('has a versioned, stable shape', () => {
    expect(Object.keys(buildWidgetPayload(input())).sort()).toEqual(
      ['currency', 'days', 'hidden', 'lockScreenAmounts', 'mask', 'noBudget', 'updatedAt', 'v'],
    );
    expect(buildWidgetPayload(input()).v).toBe(1);
    expect(buildWidgetPayload(input()).updatedAt).toBe(NOW.toISOString());
  });
});

describe('widget payload — read from this device', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAmountsHiddenCache();
  });
  afterEach(() => {
    localStorage.clear();
    resetAmountsHiddenCache();
  });

  it('is off for the lock screen until the user turns it on', () => {
    expect(lockScreenAmountsOn()).toBe(false);
    expect(currentWidgetPayload(NOW).lockScreenAmounts).toBe(false);
    setLockScreenAmounts(true);
    expect(localStorage.getItem(WIDGET_LOCK_AMOUNTS_KEY)).toBe('1');
    expect(currentWidgetPayload(NOW).lockScreenAmounts).toBe(true);
    setLockScreenAmounts(false);
    expect(currentWidgetPayload(NOW).lockScreenAmounts).toBe(false);
  });

  it('reads the saved expenses, budget, currency and Hide amounts', () => {
    localStorage.setItem('fx_expenses', JSON.stringify(items));
    localStorage.setItem('fx_bb_data', JSON.stringify(budgetStore));
    localStorage.setItem('fx_currency', 'INR');
    const cats = loadCatViewFor('2026-03').active;
    const expected = computeDashboard('2026-03', items, cats, budgetStore['2026-03'].vals, new Date(2026, 2, 15), 5000).dailySafeSpend;

    const shown = currentWidgetPayload(NOW);
    expect(shown.hidden).toBe(false);
    expect(shown.days[0].amount).toBe(expected);

    setAmountsHidden(true);
    const hidden = currentWidgetPayload(NOW);
    expect(hidden.hidden).toBe(true);
    expect(hidden.days).toEqual([]);
  });

  it('falls back to rupees for an unknown saved currency', () => {
    localStorage.setItem('fx_currency', 'XYZ');
    expect(currentWidgetPayload(NOW).currency).toBe('INR');
  });

  it('re-publishes for the records that can change it, and not for others', () => {
    for (const k of ['fx_expenses', 'fx_currency', 'fx_hide_amounts', WIDGET_LOCK_AMOUNTS_KEY, 'fx_bb_data', 'fx_bb_cats_by_month']) {
      expect(affectsWidget(k)).toBe(true);
    }
    for (const k of ['fx_goal', 'fx_theme', 'fx_ai_consent']) expect(affectsWidget(k)).toBe(false);
  });
});
