/**
 * The financial snapshot FinatriX AI is allowed to see.
 *
 * Three rules shape this file, in order of importance:
 *
 * 1. **It is the user's own data, and only that.** Everything here is read from
 *    the same local store the tools render from, which cloudSync seeds from the
 *    signed-in user's RLS-protected row. There is no query, no user id, and no
 *    path by which another account's data could reach it.
 *
 * 2. **The model never does the arithmetic.** Every figure is produced by the
 *    same pure functions the dashboard renders — `computeDashboard`,
 *    `computeMonthlyTrend`, `detectRecurring`. The assistant reports numbers; it
 *    does not derive them. That is what makes "never fabricate figures"
 *    enforceable rather than aspirational.
 *
 * 3. **Only what a question could need.** No name, no email, no user id, no
 *    account identifiers. Free-text the user typed (merchant names, notes) is
 *    sanitized before it leaves the device, because it is both personal and a
 *    prompt-injection vector.
 *
 * Everything here is pure; `now` is passed in.
 */

import { ymdLocal } from '../../lib/date';
import { sanitizeField } from '../../lib/sanitize';
import { allCategories, type BudgetStore, type SectionedCats } from '../lib/budget';
import {
  computeDashboard, isSpendingCategory, migrateCategory, type ExpenseItem,
  splitOutflow,
} from '../lib/expense';
import {
  computeMonthlyTrend, detectRecurring, computeMonthForecast,
  type CatMeta,
} from '../lib/expenseAnalytics';
import { monthLabel, prevMonth } from '../lib/month';

/* ── Bounds. The edge function caps the prompt at 80k characters; these keep us
      an order of magnitude inside it, and keep the model's attention on the
      figures that answer real questions. ── */
const MAX_TREND_MONTHS = 12;
const MAX_CATEGORIES = 40;
const MAX_TOP_TX = 12;
const MAX_RECURRING = 10;
const MAX_TEXT = 60;

export interface MonthPoint {
  month: string;
  label: string;
  spent: number;
  txCount: number;
}

export interface CategoryPoint {
  name: string;
  group: 'Needs' | 'Wants' | 'Savings' | 'Uncategorised';
  budget: number;
  spent: number;
  remaining: number;
  percentOfBudget: number | null;
  status: string;
  /** False for savings, investments and transfers — money moved, not consumed. */
  isSpending: boolean;
}

export interface TransactionPoint {
  date: string;
  category: string;
  amount: number;
  description: string;
}

export interface RecurringPoint {
  name: string;
  category: string;
  estimatedMonthly: number;
  monthsSeen: number;
}

export interface FinanceSnapshot {
  currency: string;
  today: string;
  /** The month the user is currently looking at. */
  month: string;
  monthName: string;
  isCurrentMonth: boolean;
  daysInMonth: number;
  daysElapsed: number;
  /** Days left in the month, today included — what `dailySafeSpend` divides by. */
  daysRemaining: number;

  income: number | null;
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  /** The budget excluding Savings and transfers — what `dailySafeSpend` paces. */
  spendableBudget: number;
  spendableRemaining: number;
  percentOfBudgetUsed: number | null;
  budgetStatus: string;
  savings: number;
  netCashFlow: number | null;
  dailyAverage: number;
  dailySafeSpend: number | null;
  projectedMonthEnd: number | null;

  /**
   * Needs + wants only — what the word "spending" means. `totalSpent` above is
   * the whole outflow and INCLUDES money moved into savings, so it is the
   * wrong figure to answer "am I spending more?" with.
   */
  spentOnNeedsAndWants: number;
  /** Money moved into savings, investments or transfers this month. */
  setAsideThisMonth: number;
  previousMonth: {
    month: string;
    label: string;
    /** Whole outflow, for continuity with `totalSpent`. */
    spent: number;
    spentOnNeedsAndWants: number;
    setAside: number;
  } | null;
  /** Change in CONSUMPTION vs last month. Savings movements do not affect it. */
  changeVsPreviousMonthPct: number | null;
  /** Change in money SET ASIDE vs last month. A rise here is good news. */
  savingsChangeVsPreviousMonthPct: number | null;

  categories: CategoryPoint[];
  largestTransactions: TransactionPoint[];
  recurring: RecurringPoint[];
  monthlyHistory: MonthPoint[];

  /** What simply is not in the data, so the assistant can say so precisely. */
  gaps: string[];
}

const GROUP_NAME = {
  needs: 'Needs', wants: 'Wants', save: 'Savings',
} as const;

/** Two decimals is the most precision any of these figures actually carries. */
export function money(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface SnapshotInput {
  items: ExpenseItem[];
  cats: SectionedCats;
  budgetStore: BudgetStore;
  /** The month in focus — normally whatever the user has selected on screen. */
  month: string;
  /** ISO currency code, for the model to format amounts consistently. */
  currency: string;
  now: Date;
}

export function buildSnapshot({
  items, cats, budgetStore, month, currency, now,
}: SnapshotInput): FinanceSnapshot {
  const flat = allCategories(cats);
  const catMeta = new Map<string, CatMeta>(flat.map((c) => [c.k, c]));
  const validKeys = new Set(flat.map((c) => c.k));

  const monthData = budgetStore[month];
  const income = Math.max(0, Number(monthData?.income) || 0);
  const budgetVals = monthData?.vals ?? {};

  // The dashboard's own numbers, not a second implementation of them.
  const dash = computeDashboard(month, items, cats, budgetVals, now, income);
  const forecast = computeMonthForecast(items, month, now, dash.spendableBudget, catMeta);

  const prev = prevMonth(month);
  const prevItems = items.filter((e) => (e.date || '').slice(0, 7) === prev);
  const prevHasData = prevItems.length > 0;

  /**
   * This month and last, each split into money consumed and money set aside.
   *
   * The snapshot used to offer only `totalSpent` (the whole outflow) and a
   * month-over-month delta computed from it, while the system prompt told the
   * model never to describe savings as spending. Those two instructions cannot
   * both be followed: a user who doubled their SIP was handed a "+43%" and the
   * word "spending" attached to it. The model now gets the split, so the
   * honest answer — "your spending held steady, your saving went up" — is
   * available in the data rather than needing to be inferred from it.
   */
  const thisSplit = splitOutflow(
    items.filter((e) => (e.date || '').slice(0, 7) === month), validKeys, catMeta,
  );
  const prevSplit = splitOutflow(prevItems, validKeys, catMeta);

  const categories: CategoryPoint[] = dash.categories
    .filter((c) => c.budget > 0 || c.spent > 0)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, MAX_CATEGORIES)
    .map((c) => ({
      name: sanitizeField(c.l, MAX_TEXT),
      group: c.section ? GROUP_NAME[c.section] : 'Uncategorised',
      budget: money(c.budget),
      spent: money(c.spent),
      remaining: money(c.remaining),
      percentOfBudget: c.budget > 0 ? Math.round(c.pct) : null,
      status: TONE_TEXT[c.tone],
      isSpending: isSpendingCategory(c),
    }));

  const monthItems = items.filter((e) => (e.date || '').slice(0, 7) === month);
  const largestTransactions: TransactionPoint[] = [...monthItems]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, MAX_TOP_TX)
    .map((e) => ({
      date: e.date,
      // Resolved like every other category figure in this snapshot, so the
      // model is never shown a raw storage key ("food") for a transaction whose
      // money it can also see totalled under the readable name ("Eating Out").
      category: sanitizeField(catMeta.get(migrateCategory(e.category, validKeys))?.l ?? e.category, MAX_TEXT),
      amount: money(e.amount),
      // User-authored free text. Sanitized because it is about to be embedded
      // in a prompt, where a crafted merchant name is an injection attempt.
      description: sanitizeField(e.merchant || e.note || e.notes || '', MAX_TEXT),
    }));

  const recurring: RecurringPoint[] = detectRecurring(items, catMeta)
    .slice(0, MAX_RECURRING)
    .map((p) => ({
      name: sanitizeField(p.merchant || p.label, MAX_TEXT),
      category: sanitizeField(p.label, MAX_TEXT),
      estimatedMonthly: money(p.estimatedMonthly),
      monthsSeen: p.monthsDetected,
    }));

  const monthlyHistory: MonthPoint[] = computeMonthlyTrend(items, month, MAX_TREND_MONTHS, catMeta)
    .map((t) => ({ month: t.month, label: t.fullLabel, spent: money(t.spent), txCount: t.txCount }));

  const gaps: string[] = [];
  if (income <= 0) gaps.push('No income is recorded for this month, so savings rate and net cash flow cannot be calculated.');
  if (dash.monthlyBudget <= 0) gaps.push('No budget is set for this month, so budget adherence cannot be assessed.');
  if (monthItems.length === 0) gaps.push(`No transactions are logged for ${monthLabel(month)}.`);
  if (!prevHasData) gaps.push(`No transactions are logged for ${monthLabel(prev)}, so month-over-month comparison is not possible.`);
  if (monthlyHistory.filter((m) => m.txCount > 0).length < 2) gaps.push('There is less than two months of history, so trends are not meaningful yet.');

  return {
    currency,
    today: ymd(now),
    month,
    monthName: monthLabel(month),
    isCurrentMonth: dash.isCurrentMonth,
    daysInMonth: dash.daysInMonth,
    daysElapsed: dash.daysElapsed,
    daysRemaining: dash.daysRemaining,

    income: income > 0 ? money(income) : null,
    totalBudget: money(dash.monthlyBudget),
    totalSpent: money(dash.monthlySpent),
    remaining: money(dash.remaining),
    spendableBudget: money(dash.spendableBudget),
    spendableRemaining: money(dash.spendableRemaining),
    percentOfBudgetUsed: dash.monthlyBudget > 0 ? Math.round(dash.budgetUsedPct) : null,
    budgetStatus: TONE_TEXT[dash.tone],
    savings: money(dash.monthlySavings),
    netCashFlow: dash.netCashFlow == null ? null : money(dash.netCashFlow),
    dailyAverage: money(dash.dailyAvg),
    dailySafeSpend: dash.dailySafeSpend == null ? null : money(dash.dailySafeSpend),
    projectedMonthEnd: forecast.isCurrentMonth ? money(forecast.projected) : null,

    spentOnNeedsAndWants: money(thisSplit.consumedTotal),
    setAsideThisMonth: money(thisSplit.setAsideTotal),
    previousMonth: prevHasData
      ? {
          month: prev,
          label: monthLabel(prev),
          spent: money(prevSplit.consumedTotal + prevSplit.setAsideTotal),
          spentOnNeedsAndWants: money(prevSplit.consumedTotal),
          setAside: money(prevSplit.setAsideTotal),
        }
      : null,
    changeVsPreviousMonthPct: prevSplit.consumedTotal > 0
      ? Math.round(((thisSplit.consumedTotal - prevSplit.consumedTotal) / prevSplit.consumedTotal) * 100)
      : null,
    savingsChangeVsPreviousMonthPct: prevSplit.setAsideTotal > 0
      ? Math.round(((thisSplit.setAsideTotal - prevSplit.setAsideTotal) / prevSplit.setAsideTotal) * 100)
      : null,

    categories,
    largestTransactions,
    recurring,
    monthlyHistory,
    gaps,
  };
}

/** Plain wording for each budget tone — the model should not invent its own. */
const TONE_TEXT = {
  none: 'no budget set',
  safe: 'on track',
  warn: 'near the limit',
  complete: 'fully used',
  over: 'over budget',
} as const;

const ymd = ymdLocal;
