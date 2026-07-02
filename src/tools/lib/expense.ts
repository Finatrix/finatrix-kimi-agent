/**
 * Expense Tracker — data + math, ported verbatim from ET_CATS and the
 * etRender()/etGetBudgetForMonth() logic in tools-app.html. `computeExpense`
 * is pure (takes `now` explicitly) so it can be parity-checked against the
 * original render run in jsdom.
 */
import { getJSON, setJSON } from './storage';
import type { IconName } from '../ui/Icon';
import { allCategories, type SectionedCats, type CatKey } from './budget';
import { monthLabel } from './month';

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

/* ══════════════════════════════════════════════════════════════════════════
   V4.1 — Expense Tracker ↔ Budget Builder integration.
   Categories and per-category budgets come from Budget Builder; expenses are
   tagged Needs/Wants/Savings; the tracker renders as a live dashboard.
   ══════════════════════════════════════════════════════════════════════════ */

/** Map legacy expense category keys onto the new Budget category keys. */
export const EXPENSE_CAT_MIGRATION: Record<string, string> = {
  food: 'eating_out', grocery: 'groceries', transport: 'transport', rent: 'rent',
  bills: 'utilities', health: 'medical', education: 'self_invest', shopping: 'shopping',
  subs: 'subscriptions', travel: 'travel', fuel: 'transport', emi: 'loan_invest',
  invest_et: 'stocks', fun: 'entertainment', care: 'personal_care', charity: 'gifts',
};

export function migrateCategory(k: string, validKeys: Set<string>): string {
  if (validKeys.has(k)) return k;
  const mapped = EXPENSE_CAT_MIGRATION[k];
  return mapped && validKeys.has(mapped) ? mapped : k;
}

export type CatHealth = 'none' | 'within' | 'near' | 'over';

export interface DashCategory {
  k: string;
  l: string;
  ic: IconName;
  section: CatKey | null;
  budget: number;
  spent: number;
  remaining: number;
  pct: number; // spent / budget * 100 (0 when no budget)
  health: CatHealth;
}
export interface SectionSummary {
  section: CatKey;
  label: string;
  budget: number;
  spent: number;
}
export interface TrendPoint {
  month: string;
  label: string;
  spent: number;
}
export interface DashResult {
  isCurrentMonth: boolean;
  monthlyBudget: number;
  monthlySpent: number;
  remaining: number;
  healthPct: number;
  health: CatHealth;
  dailyAvg: number;
  txCount: number;
  sections: SectionSummary[];
  categories: DashCategory[];
  topCategories: DashCategory[];
  recent: ExpenseItem[];
  trend: TrendPoint[];
}

function healthOf(budget: number, spent: number): CatHealth {
  if (budget <= 0) return 'none';
  const p = (spent / budget) * 100;
  if (p > 100) return 'over';
  if (p >= 80) return 'near';
  return 'within';
}

const SECTION_LABELS: Record<CatKey, string> = { needs: 'Needs', wants: 'Wants', save: 'Savings' };

/**
 * Integrated dashboard compute. `cats` = Budget Builder's sectioned categories
 * (built-in + custom); `budgetVals` = that month's Budget allocations per
 * category. Pure and unit-tested. The underlying sum arithmetic is unchanged.
 */
export function computeDashboard(
  month: string,
  items: ExpenseItem[],
  cats: SectionedCats,
  budgetVals: Record<string, number>,
  now: Date
): DashResult {
  const curMonth = curMonthOf(now);
  const isCurrentMonth = month === curMonth;
  const flat = allCategories(cats);
  const validKeys = new Set(flat.map((c) => c.k));
  const meta = new Map(flat.map((c) => [c.k, c]));

  const monthItems = items.filter((e) => (e.date || '').slice(0, 7) === month);
  const monthlySpent = monthItems.reduce((s, e) => s + e.amount, 0);

  // Spend per (migrated) category.
  const spentByCat: Record<string, number> = {};
  monthItems.forEach((e) => {
    const k = migrateCategory(e.category, validKeys);
    spentByCat[k] = (spentByCat[k] || 0) + e.amount;
  });

  // Every budget category + any spent-only (uncategorised) category.
  const keys = new Set<string>([...validKeys, ...Object.keys(spentByCat)]);
  const categories: DashCategory[] = [...keys].map((k) => {
    const m = meta.get(k);
    const budget = Math.max(0, Number(budgetVals[k]) || 0);
    const spent = spentByCat[k] || 0;
    return {
      k,
      l: m?.l ?? 'Uncategorised',
      ic: (m?.ic ?? 'other') as IconName,
      section: m?.section ?? null,
      budget,
      spent,
      remaining: budget - spent,
      pct: budget > 0 ? (spent / budget) * 100 : 0,
      health: healthOf(budget, spent),
    };
  });

  const sections: SectionSummary[] = (['needs', 'wants', 'save'] as CatKey[]).map((section) => {
    const inSection = categories.filter((c) => c.section === section);
    return {
      section,
      label: SECTION_LABELS[section],
      budget: inSection.reduce((s, c) => s + c.budget, 0),
      spent: inSection.reduce((s, c) => s + c.spent, 0),
    };
  });

  const monthlyBudget = categories.reduce((s, c) => s + c.budget, 0);
  const remaining = monthlyBudget - monthlySpent;
  const healthPct = monthlyBudget > 0 ? (monthlySpent / monthlyBudget) * 100 : 0;

  const [sy, sm] = month.split('-').map(Number);
  const daysInMonth = new Date(sy, sm, 0).getDate();
  const daysElapsed = isCurrentMonth ? now.getDate() : daysInMonth;
  const dailyAvg = daysElapsed > 0 ? monthlySpent / daysElapsed : 0;

  const topCategories = categories.filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent).slice(0, 5);
  const recent = monthItems.slice(0, 8);

  // 6-month trend ending at `month`.
  const trend: TrendPoint[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(sy, sm - 1 - i, 1);
    const mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const spent = items.filter((e) => (e.date || '').slice(0, 7) === mk).reduce((s, e) => s + e.amount, 0);
    trend.push({ month: mk, label: monthLabel(mk).split(' ')[0].slice(0, 3), spent });
  }

  return {
    isCurrentMonth,
    monthlyBudget,
    monthlySpent,
    remaining,
    healthPct,
    health: healthOf(monthlyBudget, monthlySpent),
    dailyAvg,
    txCount: monthItems.length,
    sections,
    categories,
    topCategories,
    recent,
    trend,
  };
}
