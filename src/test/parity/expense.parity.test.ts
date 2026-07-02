import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import toolsHtml from './__fixtures__/original-tools-app.html?raw';
import { extractFnSource, extractConstSource, evalOriginalConst } from './harness';
import {
  ET_CATS, computeExpense, type ExpenseItem,
} from '../../tools/lib/expense';
import { monthLabel } from '../../tools/lib/month';
import { fmt } from '../../tools/lib/format';

// Freeze "now" so the current-month path (which reads the real clock in both the
// original and the port) is deterministic.
const FIXED = new Date('2026-07-15T10:30:00Z');
beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED); });
afterAll(() => { vi.useRealTimers(); });

describe('expense parity — ET_CATS table', () => {
  it('matches the original ET_CATS exactly', () => {
    expect(ET_CATS).toEqual(evalOriginalConst(toolsHtml, 'ET_CATS'));
  });
});

const TEMPLATE = `
  <div id="et-stats"></div><div id="et-budget-edit"></div><div id="et-budget-content"></div>
  <div id="et-breakdown"></div><div id="et-history"></div>
`;

const runner = new Function(
  'P',
  `
  ${extractConstSource(toolsHtml, 'CURRENCIES')}
  let FXC='INR';
  ${extractFnSource(toolsHtml, 'fmt')}
  ${extractFnSource(toolsHtml, 'cfmt')}
  ${extractFnSource(toolsHtml, 'esc')}
  ${extractConstSource(toolsHtml, 'ET_CATS')}
  ${extractFnSource(toolsHtml, 'etCurrentMonth')}
  ${extractFnSource(toolsHtml, 'etToday')}
  ${extractFnSource(toolsHtml, 'etMonthLabel')}
  let etItems = P.items;
  let etSelMonth = P.month;
  let etBudget = P.budget;
  ${extractFnSource(toolsHtml, 'etRender')}
  etRender();
  const g = (id) => document.getElementById(id);
  return {
    stats: g('et-stats').textContent,
    budgetContent: g('et-budget-content').textContent,
    breakdown: g('et-breakdown').textContent,
  };
`
) as (p: { items: ExpenseItem[]; month: string; budget: number }) => { stats: string; budgetContent: string; breakdown: string };

function runOriginal(month: string, items: ExpenseItem[], budget: number) {
  document.body.innerHTML = TEMPLATE;
  return runner({ items, month, budget });
}

const squish = (s: string) => (s || '').replace(/\s+/g, '');

function expectedStats(r: ReturnType<typeof computeExpense>): string {
  return r.isCurrentMonth
    ? `${fmt(r.tToday)}Today${fmt(r.tMonth)}This month${fmt(r.avgDay)}Daily avg`
    : `${fmt(r.tMonth)}Total spent${fmt(r.avgDay)}Daily avg${r.txCount}Transactions`;
}

function expectedBudget(r: ReturnType<typeof computeExpense>, month: string): string {
  const b = r.budget;
  if (!b) return `No budget set for ${monthLabel(month)}. Tap "Set budget" to add one.`;
  let note: string;
  if (b.over) note = `Over budget by ${fmt(b.overBy)}`;
  else if (r.isCurrentMonth)
    note = `${fmt(b.left)} left` + (b.daysLeft > 0 ? ` · that's ${fmt(b.perDay)}/day for ${b.daysLeft} more days` : ' · last day of the month');
  else note = `${fmt(b.left)} unspent this month`;
  return `${fmt(r.tMonth)} spentof ${fmt(b.budget)}${note}`;
}

function expectedBreakdown(r: ReturnType<typeof computeExpense>, month: string): string {
  if (!r.breakdown.length)
    return `No expenses logged for ${monthLabel(month)}.` + (r.isCurrentMonth ? 'Add your first one above.' : '');
  return (
    `${monthLabel(month)} by category` +
    r.breakdown.map((row) => `${(ET_CATS[row.k] || ET_CATS.other).l}${row.pct}%${fmt(row.total)}`).join('')
  );
}

const ITEMS: ExpenseItem[] = [
  { id: 1, amount: 500, category: 'food', date: '2026-07-15', note: 'lunch' },
  { id: 2, amount: 1200.5, category: 'grocery', date: '2026-07-15', note: '' },
  { id: 3, amount: 3000, category: 'rent', date: '2026-07-02', note: 'July rent' },
  { id: 4, amount: 250, category: 'transport', date: '2026-07-10', note: '' },
  { id: 5, amount: 800, category: 'food', date: '2026-05-20', note: 'May dinner' },
  { id: 6, amount: 4000, category: 'shopping', date: '2026-05-05', note: '' },
  { id: 7, amount: 99.99, category: 'unknownCat', date: '2026-07-11', note: 'weird' },
];

const CASES: Array<{ name: string; month: string; items: ExpenseItem[]; budget: number }> = [
  { name: 'current month, no budget', month: '2026-07', items: ITEMS, budget: 0 },
  { name: 'current month, budget under', month: '2026-07', items: ITEMS, budget: 20000 },
  { name: 'current month, budget over', month: '2026-07', items: ITEMS, budget: 3000 },
  { name: 'past month, budget set', month: '2026-05', items: ITEMS, budget: 6000 },
  { name: 'past month, no budget', month: '2026-05', items: ITEMS, budget: 0 },
  { name: 'empty current month', month: '2026-07', items: [], budget: 0 },
  { name: 'empty past month', month: '2026-03', items: ITEMS, budget: 0 },
];

describe('expense parity — etRender rendered figures', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const r = computeExpense(c.month, c.items, c.budget, new Date());
      const dom = runOriginal(c.month, c.items, c.budget);
      expect(squish(dom.stats)).toBe(squish(expectedStats(r)));
      expect(squish(dom.budgetContent)).toBe(squish(expectedBudget(r, c.month)));
      expect(squish(dom.breakdown)).toBe(squish(expectedBreakdown(r, c.month)));
    });
  }
});
