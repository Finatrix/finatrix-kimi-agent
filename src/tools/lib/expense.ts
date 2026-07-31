/**
 * Expense Tracker — data + math, ported verbatim from ET_CATS and the
 * etRender()/etGetBudgetForMonth() logic in tools-app.html. `computeExpense`
 * is pure (takes `now` explicitly) so it can be parity-checked against the
 * original render run in jsdom.
 */
import { ymdLocal, ymLocal } from '../../lib/date';
import { getJSON, setJSON } from './storage';
import type { IconName } from '../ui/Icon';
import { allCategories, type SectionedCats, type CatKey } from './budget';
import { budgetTone, isWarningTone, type BudgetTone } from './budgetStatus';
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

/**
 * A single logged expense.
 *
 * `id` is a **stable, persistent identifier** — never a positional index. Every
 * mutation (edit, delete, duplicate) and every future feature (attachments,
 * recurring instances, AI insights, audit history, cross-device sync) references
 * this id so a transaction keeps its identity regardless of ordering or which
 * device wrote it. Legacy records that stored a numeric id are migrated to their
 * string form on load (see `normalizeExpense`), preserving that identity.
 *
 * Only `amount`, `category` and `date` feed the calculation engine; the
 * remaining fields are descriptive metadata and never alter any total.
 */
export interface ExpenseItem {
  id: string;
  amount: number;
  category: string;
  date: string;
  /** Short description / label for the spend (legacy field, still primary). */
  note?: string;
  /** Who it was paid to, e.g. "Blue Bottle Coffee". */
  merchant?: string;
  /** How it was paid, one of PAYMENT_METHODS (free-form tolerated). */
  paymentMethod?: string;
  /** Free-form user tags for filtering/search. */
  tags?: string[];
  /** Marks a recurring commitment (rent, subscriptions, EMIs…). */
  recurring?: boolean;
  /** Longer free-form notes, distinct from the short `note` label. */
  notes?: string;
  /* ── Audit history (ISO timestamps) — descriptive only, never affects totals ── */
  /** When the transaction was first created. */
  createdAt?: string;
  /** When the transaction was last modified (== createdAt until first edit). */
  updatedAt?: string;
  /** Number of times the transaction has been edited. */
  editCount?: number;
}

/** Selectable payment methods surfaced in the editor. */
export const PAYMENT_METHODS = [
  'Cash', 'Credit card', 'Debit card', 'UPI', 'Bank transfer', 'Wallet', 'Cheque', 'Other',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Generate a collision-resistant, persistent transaction id. Prefers the
 * platform UUID; falls back to a time+random token when `crypto.randomUUID`
 * is unavailable (older embedded webviews). Unlike `Date.now()` this never
 * collides when two transactions are created in the same millisecond
 * (e.g. rapid "Duplicate").
 */
export function genExpenseId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return 'tx_' + crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return 'tx_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

/**
 * Coerce a raw stored record into a well-formed ExpenseItem. Guarantees a
 * stable string `id` (migrating legacy numeric ids, minting one only when truly
 * absent) and normalises optional fields so the rest of the app can rely on the
 * shape. Never touches numeric amount/category/date semantics.
 */
export function normalizeExpense(raw: Partial<ExpenseItem> & { id?: string | number }): ExpenseItem {
  const id =
    raw.id === undefined || raw.id === null || raw.id === ''
      ? genExpenseId()
      : String(raw.id);
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string' && t.trim() !== '') : undefined;
  return {
    id,
    amount: Number(raw.amount) || 0,
    category: String(raw.category ?? ''),
    date: String(raw.date ?? ''),
    ...(raw.note ? { note: String(raw.note) } : {}),
    ...(raw.merchant ? { merchant: String(raw.merchant) } : {}),
    ...(raw.paymentMethod ? { paymentMethod: String(raw.paymentMethod) } : {}),
    ...(tags && tags.length ? { tags } : {}),
    ...(raw.recurring ? { recurring: true } : {}),
    ...(raw.notes ? { notes: String(raw.notes) } : {}),
    ...(raw.createdAt ? { createdAt: String(raw.createdAt) } : {}),
    ...(raw.updatedAt ? { updatedAt: String(raw.updatedAt) } : {}),
    ...(typeof raw.editCount === 'number' && raw.editCount > 0 ? { editCount: raw.editCount } : {}),
  };
}

export function loadExpenses(): ExpenseItem[] {
  const arr = getJSON<Array<Partial<ExpenseItem> & { id?: string | number }>>('fx_expenses', []);
  return Array.isArray(arr) ? arr.map(normalizeExpense) : [];
}
export function saveExpenses(items: ExpenseItem[]): void {
  setJSON('fx_expenses', items);
}

/** Local YYYY-MM-DD (V4: local time, not UTC). Re-exported from lib/date. */
export { ymdLocal };
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
  return ymLocal(now);
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

// `ReadonlySet` because this only ever reads: callers should not have to hand
// over a mutable set (or copy one) to ask what a key resolves to.
export function migrateCategory(k: string, validKeys: ReadonlySet<string>): string {
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
  /** Presentation tone (grey / green / orange / blue / red) — see budgetStatus.ts. */
  tone: BudgetTone;
}

/**
 * Category keys that represent moving money rather than spending it. Savings
 * categories are already excluded by section; these cover legacy and
 * uncategorised keys that never had a section, so "Top spending categories"
 * only ever ranks real consumption.
 */
const INTERNAL_MOVEMENT_KEYS = new Set([
  'transfers', 'transfer', 'internal', 'internal_transfer', 'savings', 'saving',
  'income', 'salary', 'invest_et', 'investment', 'investments',
]);

/** True when a category is real spending (not savings, income or a transfer). */
export function isSpendingCategory(c: { k: string; section: CatKey | null }): boolean {
  if (c.section === 'save') return false;
  return !INTERNAL_MOVEMENT_KEYS.has(c.k);
}

/** A category that needs attention this month — powers the dashboard warnings. */
export interface BudgetWarning {
  k: string;
  label: string;
  ic: IconName;
  section: CatKey | null;
  budget: number;
  spent: number;
  pct: number;
  tone: BudgetTone;
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
  /* ── Month pacing & cash-flow summary (V5 dashboard cards) ── */
  /** Presentation tone for the whole month's budget. */
  tone: BudgetTone;
  daysInMonth: number;
  daysElapsed: number;
  /** Days left in the month; 0 for a month that has already ended. */
  daysRemaining: number;
  /** Share of the monthly budget consumed (0 when no budget is set). */
  budgetUsedPct: number;
  /**
   * What's left to spend per remaining day to finish inside the budget. Null
   * when there is no budget, or when the month is over and pacing is moot.
   */
  dailySafeSpend: number | null;
  /** Take-home income for the month, from Budget Builder (0 when unknown). */
  income: number;
  /** Money routed into the Savings section this month. */
  monthlySavings: number;
  /** Income − everything logged. Null when income is unknown. */
  netCashFlow: number | null;
  /** Categories at or past 80% of their budget, most urgent first. */
  warnings: BudgetWarning[];
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
  now: Date,
  /** Take-home income for the month (Budget Builder). Optional — 0 means "unknown". */
  income = 0,
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
      tone: budgetTone(budget, spent),
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

  // Top spending excludes savings, income and internal movements: moving money
  // into an emergency fund is not "where your money went".
  const topCategories = categories
    .filter((c) => c.spent > 0 && isSpendingCategory(c))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 5);
  const recent = monthItems.slice(0, 8);

  const daysRemaining = isCurrentMonth ? Math.max(0, daysInMonth - now.getDate()) : 0;
  const budgetUsedPct = monthlyBudget > 0 ? (monthlySpent / monthlyBudget) * 100 : 0;
  // Pacing only means something while the month is still running.
  const dailySafeSpend =
    monthlyBudget > 0 && isCurrentMonth ? Math.max(0, remaining) / Math.max(1, daysRemaining) : null;
  const monthlySavings = sections.find((s) => s.section === 'save')?.spent ?? 0;

  const warnings: BudgetWarning[] = categories
    .filter((c) => c.budget > 0 && isWarningTone(c.tone))
    .sort((a, b) => b.pct - a.pct)
    .map((c) => ({
      k: c.k, label: c.l, ic: c.ic, section: c.section,
      budget: c.budget, spent: c.spent, pct: c.pct, tone: c.tone,
    }));

  // 6-month trend ending at `month`.
  const trend: TrendPoint[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(sy, sm - 1 - i, 1);
    const mk = ymLocal(d);
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
    tone: budgetTone(monthlyBudget, monthlySpent),
    daysInMonth,
    daysElapsed,
    daysRemaining,
    budgetUsedPct,
    dailySafeSpend,
    income,
    monthlySavings,
    netCashFlow: income > 0 ? income - monthlySpent : null,
    warnings,
  };
}
