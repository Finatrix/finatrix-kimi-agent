import { allCategories, numify, type BudgetMonthData, type SectionedCats } from './budget';
import { splitOutflow, type ExpenseItem } from './expense';
import { detectRecurring, type CatMeta, type RecurringPattern } from './expenseAnalytics';
import { prevMonth } from './month';
import { getJSON, setJSON } from './storage';

export const PLANNING_KEY = 'fx_planning';
export interface EmergencyInputs { essentials: number; months: number; saved: number; contribution: number }
export interface PlanningState {
  emergency: EmergencyInputs;
  recurring: Record<string, 'confirmed' | 'dismissed'>;
  reviews: Record<string, { note: string; reviewedAt: string | null }>;
}
const blank = (): PlanningState => ({ emergency: { essentials: 0, months: 3, saved: 0, contribution: 0 }, recurring: {}, reviews: {} });
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};

/** Currency scopes keep a saved amount from being relabelled after a currency switch. */
export function loadPlanning(currency: string): PlanningState {
  const raw = object(object(getJSON<unknown>(PLANNING_KEY, {}))[currency]);
  const state = blank();
  const emergency = object(raw.emergency);
  state.emergency = {
    essentials: numify(emergency.essentials), saved: numify(emergency.saved), contribution: numify(emergency.contribution),
    months: Math.min(24, Math.max(1, Math.round(numify(emergency.months) || 3))),
  };
  for (const [key, value] of Object.entries(object(raw.recurring))) {
    if (value === 'confirmed' || value === 'dismissed') state.recurring[key] = value;
  }
  for (const [month, value] of Object.entries(object(raw.reviews))) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) continue;
    const review = object(value);
    state.reviews[month] = { note: typeof review.note === 'string' ? review.note.slice(0, 2000) : '', reviewedAt: typeof review.reviewedAt === 'string' && Number.isFinite(Date.parse(review.reviewedAt)) ? review.reviewedAt : null };
  }
  return state;
}

export function savePlanning(currency: string, state: PlanningState): void {
  setJSON(PLANNING_KEY, { ...object(getJSON<unknown>(PLANNING_KEY, {})), [currency]: state });
}

/** New cash-reserve planner: no growth, tax, inflation or assumed investment returns. */
export function emergencyPlan(input: EmergencyInputs) {
  const essentials = numify(input.essentials);
  const months = Math.min(24, Math.max(1, Math.round(numify(input.months) || 1)));
  const saved = numify(input.saved);
  const contribution = numify(input.contribution);
  const target = essentials * months;
  const gap = Math.max(0, target - saved);
  return {
    target, gap, coveredMonths: essentials > 0 ? saved / essentials : null,
    progress: target > 0 ? Math.min(100, saved / target * 100) : 0,
    monthsToTarget: target === 0 ? null : gap === 0 ? 0 : contribution > 0 ? Math.ceil(gap / contribution) : null,
  };
}

export function recurringKey(pattern: RecurringPattern): string {
  return JSON.stringify([pattern.category, pattern.merchant ?? '']);
}

export function recurringPayments(items: ExpenseItem[], cats: SectionedCats, today: string) {
  const metadata = new Map<string, CatMeta>(allCategories(cats).map(c => [c.k, c]));
  const spending = splitOutflow(items.filter(e => e.date <= today), new Set(metadata.keys()), metadata).consumed;
  return detectRecurring(spending, metadata)
    .filter(p => p.lastDate.slice(0, 7) >= prevMonth(prevMonth(today.slice(0, 7))))
    .map(p => ({ ...p, displayName: spending.find(e => e.date === p.lastDate && e.merchant?.toLowerCase() === p.merchant)?.merchant || p.label }));
}

/** Ledger totals reuse the expense engine, including refunds and transfers. */
export function monthlyReview(items: ExpenseItem[], month: string, cats: SectionedCats, previousCats: SectionedCats, budget?: BudgetMonthData) {
  const summarize = (ym: string, categories: SectionedCats) => {
    const rows = items.filter(e => e.date.slice(0, 7) === ym);
    const meta = new Map(allCategories(categories).map(c => [c.k, c]));
    return { count: rows.length, ...splitOutflow(rows, new Set(meta.keys()), meta) };
  };
  const current = summarize(month, cats);
  const previous = summarize(prevMonth(month), previousCats);
  return {
    ...current,
    plannedIncome: budget?.income && Number.isFinite(Number(budget.income)) ? numify(budget.income) : null,
    difference: current.count && previous.count ? current.consumedTotal - previous.consumedTotal : null,
    previousCount: previous.count,
  };
}
