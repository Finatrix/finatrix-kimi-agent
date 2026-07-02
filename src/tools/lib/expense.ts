/**
 * Expense Tracker — data + math, ported verbatim from ET_CATS and the
 * etRender()/etGetBudgetForMonth() logic in tools-app.html. `computeExpense`
 * is pure (takes `now` explicitly) so it can be parity-checked against the
 * original render run in jsdom.
 */
import { store, getJSON, setJSON } from './storage';
import type { IconName } from '../ui/Icon';

export interface ExpenseCat {
  ic: IconName;
  l: string;
  c: string;
}

export const ET_CATS: Record<string, ExpenseCat> = {
  food: { ic: 'food', l: 'Dining', c: '#c2410c' },
  grocery: { ic: 'grocery', l: 'Groceries', c: '#1d7d46' },
  transport: { ic: 'transport', l: 'Transport', c: '#0071e3' },
  rent: { ic: 'rent', l: 'Rent', c: '#FF5A52' },
  bills: { ic: 'bills', l: 'Bills', c: '#b08a36' },
  health: { ic: 'health', l: 'Health', c: '#0c8079' },
  education: { ic: 'education', l: 'Education', c: '#3a5fc8' },
  shopping: { ic: 'shopping', l: 'Shopping', c: '#b3387a' },
  subs: { ic: 'subs', l: 'Subscriptions', c: '#8856d8' },
  travel: { ic: 'travel', l: 'Travel', c: '#2563eb' },
  fuel: { ic: 'fuel', l: 'Fuel', c: '#92400e' },
  emi: { ic: 'emi', l: 'EMI / Loans', c: '#be185d' },
  invest_et: { ic: 'invest-cat', l: 'Investments', c: '#047857' },
  fun: { ic: 'fun', l: 'Entertainment', c: '#6e3bd4' },
  care: { ic: 'care', l: 'Self-care', c: '#d4527e' },
  pet: { ic: 'pet', l: 'Pets', c: '#7c3aed' },
  charity: { ic: 'charity', l: 'Donations', c: '#0891b2' },
  other: { ic: 'other', l: 'Other', c: '#9A9A94' },
};

export interface ExpenseItem {
  id: number;
  amount: number;
  category: string;
  date: string;
  note?: string;
}

export function loadExpenses(): ExpenseItem[] {
  const arr = getJSON<ExpenseItem[]>('fx_expenses', []);
  return Array.isArray(arr) ? arr : [];
}
export function saveExpenses(items: ExpenseItem[]): void {
  setJSON('fx_expenses', items);
}

/** Local YYYY-MM-DD (V4: local time, not UTC). */
export function ymdLocal(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function etToday(): string {
  return ymdLocal(new Date());
}

/* ── Per-month budgets (fx_budgets), with legacy fx_budget migration ── */
export function etGetBudgets(): Record<string, number> {
  return getJSON<Record<string, number>>('fx_budgets', {});
}
export function etGetBudgetForMonth(month: string, curMonth: string): number {
  const budgets = etGetBudgets();
  if (month in budgets) return Math.max(0, Number(budgets[month]) || 0);
  // Migrate legacy single fx_budget into the current month on first use.
  if (month === curMonth) {
    const legacy = Math.max(0, Number(store.get('fx_budget', '0')) || 0);
    if (legacy > 0) {
      const b = etGetBudgets();
      b[month] = legacy;
      setJSON('fx_budgets', b);
      store.set('fx_budget', '0');
      return legacy;
    }
  }
  return 0;
}
export function etSetBudgetForMonth(month: string, amount: number): void {
  const budgets = etGetBudgets();
  if (amount > 0) budgets[month] = amount;
  else delete budgets[month];
  setJSON('fx_budgets', budgets);
}

export function etMonthsWithData(items: ExpenseItem[], curMonth: string): string[] {
  const months: Record<string, true> = {};
  items.forEach((e) => {
    if (e.date) months[e.date.slice(0, 7)] = true;
  });
  months[curMonth] = true;
  return Object.keys(months).sort();
}

/* ── Compute (pure port of etRender's numeric core) ── */
export interface BreakdownRow {
  k: string;
  total: number;
  pct: number;
  barPct: number;
}
export interface BudgetProgress {
  budget: number;
  usedPct: number;
  over: boolean;
  overBy: number;
  left: number;
  daysLeft: number;
  perDay: number;
}
export interface ExpenseResult {
  isCurrentMonth: boolean;
  tToday: number;
  tMonth: number;
  daysInMonth: number;
  daysElapsed: number;
  avgDay: number;
  txCount: number;
  budget: BudgetProgress | null;
  breakdown: BreakdownRow[];
  history: ExpenseItem[];
  totalCount: number;
}

export function curMonthOf(now: Date): string {
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

export function computeExpense(
  month: string,
  items: ExpenseItem[],
  budget: number,
  now: Date
): ExpenseResult {
  const curMonth = curMonthOf(now);
  const today = ymdLocal(now); // local date, not UTC
  const isCurrentMonth = month === curMonth;

  const tToday = isCurrentMonth
    ? items.filter((e) => e.date === today).reduce((s, e) => s + e.amount, 0)
    : 0;
  const monthItems = items.filter((e) => (e.date || '').slice(0, 7) === month);
  const tMonth = monthItems.reduce((s, e) => s + e.amount, 0);

  const [sy, sm] = month.split('-').map(Number);
  const daysInMonth = new Date(sy, sm, 0).getDate();
  const daysElapsed = isCurrentMonth ? now.getDate() : daysInMonth;
  const avgDay = daysElapsed > 0 ? tMonth / daysElapsed : 0;

  let budgetProgress: BudgetProgress | null = null;
  if (budget > 0) {
    const usedPct = Math.min((tMonth / budget) * 100, 100);
    const over = tMonth > budget;
    const daysLeft = isCurrentMonth ? daysInMonth - now.getDate() : 0;
    const left = budget - tMonth;
    const perDay = left / Math.max(daysLeft, 1);
    budgetProgress = { budget, usedPct, over, overBy: tMonth - budget, left, daysLeft, perDay };
  }

  const byCat: Record<string, number> = {};
  monthItems.forEach((e) => {
    byCat[e.category] = (byCat[e.category] || 0) + e.amount;
  });
  const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const max = sorted.length ? sorted[0][1] : 0;
  const breakdown: BreakdownRow[] = sorted.map(([k, v]) => ({
    k,
    total: v,
    pct: tMonth > 0 ? Math.round((v / tMonth) * 100) : 0,
    barPct: max > 0 ? (v / max) * 100 : 0,
  }));

  return {
    isCurrentMonth,
    tToday,
    tMonth,
    daysInMonth,
    daysElapsed,
    avgDay,
    txCount: monthItems.length,
    budget: budgetProgress,
    breakdown,
    history: monthItems.slice(0, 200),
    totalCount: items.length,
  };
}
