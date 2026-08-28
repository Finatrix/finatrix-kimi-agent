import { describe, it, expect } from 'vitest';
import { computeWallet, walletSummary } from '../tools/lib/wallet';
import { mergedCats, type BudgetStore } from '../tools/lib/budget';
import type { ExpenseItem } from '../tools/lib/expense';

/**
 * The Wallet carries every category's unspent budget across the financial year.
 *
 * The three things worth failing a build over:
 *   1. the sign convention — positive is always the good direction, which means
 *      savings is measured the other way up from spending;
 *   2. which months count — a month with no budget must contribute NOTHING, or
 *      a new user opens the panel already thousands overdrawn;
 *   3. the year boundary — the balance must reset when the financial year does.
 */

const CATS = mergedCats({ needs: [], wants: [], save: [] });

let seq = 0;
const tx = (date: string, category: string, amount: number): ExpenseItem =>
  ({ id: `t${++seq}`, date, category, amount });

const plan = (vals: Record<string, number>) =>
  ({ vals, income: '50000', n: '50', w: '30', s: '20' });

const cfmt = (n: number) => `₹${Math.round(n)}`;

describe('the spending balance', () => {
  it('banks the budget a category did not use', () => {
    const store: BudgetStore = { '2026-04': plan({ eating_out: 5000 }) };
    const w = computeWallet({
      month: '2026-04', fyStart: 4, cats: CATS, budgetStore: store,
      items: [tx('2026-04-10', 'eating_out', 4700)],
    });
    expect(w.spendingBalance).toBe(300);
    expect(w.banked).toBe(300);
    expect(w.overdrawn).toBe(0);
  });

  it('goes negative when a category overspends', () => {
    const store: BudgetStore = { '2026-04': plan({ eating_out: 5000 }) };
    const w = computeWallet({
      month: '2026-04', fyStart: 4, cats: CATS, budgetStore: store,
      items: [tx('2026-04-10', 'eating_out', 5030)],
    });
    expect(w.spendingBalance).toBe(-30);
    expect(w.overdrawn).toBe(30);
    expect(w.overdrawnRows.map((r) => r.k)).toEqual(['eating_out']);
  });

  it('accumulates month by month across the year', () => {
    const store: BudgetStore = {
      '2026-04': plan({ eating_out: 5000 }),
      '2026-05': plan({ eating_out: 5000 }),
      '2026-06': plan({ eating_out: 5000 }),
    };
    const w = computeWallet({
      month: '2026-06', fyStart: 4, cats: CATS, budgetStore: store,
      items: [
        tx('2026-04-10', 'eating_out', 4000), // +1000
        tx('2026-05-10', 'eating_out', 6000), // −1000
        tx('2026-06-10', 'eating_out', 4500), // +500
      ],
    });
    expect(w.spendingBalance).toBe(500);
    expect(w.monthsCounted).toEqual(['2026-04', '2026-05', '2026-06']);
  });

  it('reports the two halves separately as well as netted', () => {
    const store: BudgetStore = { '2026-04': plan({ eating_out: 5000, groceries: 8000 }) };
    const w = computeWallet({
      month: '2026-04', fyStart: 4, cats: CATS, budgetStore: store,
      items: [
        tx('2026-04-10', 'eating_out', 6000), // −1000
        tx('2026-04-11', 'groceries', 7000),  // +1000
      ],
    });
    expect(w.spendingBalance).toBe(0);
    // Netting to zero would hide that one category is a thousand over, so the
    // panel shows both halves rather than only the difference.
    expect(w.banked).toBe(1000);
    expect(w.overdrawn).toBe(1000);
  });
});

describe('saving is not spending', () => {
  it('counts saving MORE than planned as a positive balance', () => {
    const store: BudgetStore = { '2026-04': plan({ emergency: 10000 }) };
    const w = computeWallet({
      month: '2026-04', fyStart: 4, cats: CATS, budgetStore: store,
      items: [tx('2026-04-10', 'emergency', 12000)],
    });
    // Measured the other way up: setting aside 2,000 more than planned is the
    // best outcome in the ledger, and reporting it as "−2,000 overdrawn" would
    // be the single most damaging number on the panel.
    expect(w.savingsBalance).toBe(2000);
    // …and it never leaks into the spending headline.
    expect(w.spendingBalance).toBe(0);
  });

  it('counts saving less than planned as behind, not as banked budget', () => {
    const store: BudgetStore = { '2026-04': plan({ emergency: 10000 }) };
    const w = computeWallet({
      month: '2026-04', fyStart: 4, cats: CATS, budgetStore: store,
      items: [tx('2026-04-10', 'emergency', 4000)],
    });
    expect(w.savingsBalance).toBe(-6000);
    expect(w.banked).toBe(0);
  });
});

describe('which months count', () => {
  it('skips a month with no budget rather than counting its spend as overdraft', () => {
    // The month before the user started budgeting. Counting it would open the
    // wallet at minus a month of groceries.
    const store: BudgetStore = { '2026-05': plan({ groceries: 8000 }) };
    const w = computeWallet({
      month: '2026-05', fyStart: 4, cats: CATS, budgetStore: store,
      items: [
        tx('2026-04-10', 'groceries', 9000), // no plan for April
        tx('2026-05-10', 'groceries', 7500),
      ],
    });
    expect(w.monthsCounted).toEqual(['2026-05']);
    expect(w.spendingBalance).toBe(500);
  });

  it('treats a saved month with nothing allocated as unplanned', () => {
    const store: BudgetStore = { '2026-04': plan({}), '2026-05': plan({ groceries: 8000 }) };
    const w = computeWallet({
      month: '2026-05', fyStart: 4, cats: CATS, budgetStore: store,
      items: [tx('2026-04-10', 'groceries', 9000)],
    });
    expect(w.monthsCounted).toEqual(['2026-05']);
  });

  it('never counts a month past the one being viewed', () => {
    const store: BudgetStore = {
      '2026-04': plan({ groceries: 8000 }),
      '2026-05': plan({ groceries: 8000 }),
    };
    const w = computeWallet({
      month: '2026-04', fyStart: 4, cats: CATS, budgetStore: store, items: [],
    });
    expect(w.monthsCounted).toEqual(['2026-04']);
    expect(w.spendingBalance).toBe(8000);
  });

  it('resets at the financial year boundary', () => {
    const store: BudgetStore = {
      '2026-03': plan({ groceries: 8000 }), // last year (April start)
      '2026-04': plan({ groceries: 8000 }), // this year
    };
    const w = computeWallet({
      month: '2026-04', fyStart: 4, cats: CATS, budgetStore: store, items: [],
    });
    expect(w.monthsCounted).toEqual(['2026-04']);
    expect(w.spendingBalance).toBe(8000);
  });

  it('reports empty, not zero, when nothing in the year is budgeted', () => {
    const w = computeWallet({
      month: '2026-04', fyStart: 4, cats: CATS, budgetStore: {},
      items: [tx('2026-04-10', 'groceries', 900)],
    });
    expect(w.empty).toBe(true);
    expect(w.rows).toEqual([]);
    expect(walletSummary(w, cfmt)).toMatch(/No budget yet/);
  });
});

describe('what the summary says', () => {
  it('names the direction in words, never only by sign', () => {
    const store: BudgetStore = { '2026-04': plan({ eating_out: 5000 }) };
    const over = computeWallet({
      month: '2026-04', fyStart: 4, cats: CATS, budgetStore: store,
      items: [tx('2026-04-10', 'eating_out', 5030)],
    });
    expect(walletSummary(over, cfmt)).toMatch(/overdrawn/i);

    const under = computeWallet({
      month: '2026-04', fyStart: 4, cats: CATS, budgetStore: store,
      items: [tx('2026-04-10', 'eating_out', 4970)],
    });
    expect(walletSummary(under, cfmt)).toMatch(/banked/i);
  });
});

describe('orphaned data', () => {
  it('ignores spend against a category that no longer exists', () => {
    const store: BudgetStore = { '2026-04': plan({ groceries: 8000 }) };
    const w = computeWallet({
      month: '2026-04', fyStart: 4, cats: CATS, budgetStore: store,
      items: [tx('2026-04-10', 'a_deleted_category', 4000)],
    });
    // It has no budget to carry over and no row to appear in. Its spend still
    // counts in the monthly figures, which is where an orphan belongs.
    expect(w.rows.map((r) => r.k)).toEqual(['groceries']);
    expect(w.spendingBalance).toBe(8000);
  });
});
