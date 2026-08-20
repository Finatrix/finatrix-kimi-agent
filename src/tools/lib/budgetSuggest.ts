/**
 * Smart budget suggestions — what a category's budget *could* be, argued from
 * the user's own spending history.
 *
 * This module derives a recommendation; it never applies one. Nothing here
 * writes to storage and nothing here changes an existing budget: the UI accepts,
 * edits or ignores each suggestion explicitly. That separation is deliberate —
 * a budget is a commitment the user makes, not one the app makes for them.
 *
 * The maths is intentionally boring and fully explainable, because a number the
 * user cannot reconstruct is a number they cannot trust:
 *
 *   average   = mean spend in that category across the lookback months that
 *               have any logged activity
 *   suggested = that average rounded UP to a readable step (see NICE_STEPS)
 *
 * No existing financial formula is touched — `computeBudget` and
 * `computeDashboard` are untouched and this file only reads their inputs.
 */

import type { IconName } from '../ui/Icon';
import { ymLocal } from '../../lib/date';
import { allCategories, type SectionedCats, type CatKey } from './budget';
import { migrateCategory, type ExpenseItem } from './expense';

/** How many months of history to average over. */
export type Lookback = 3 | 6 | 12;
export const LOOKBACKS: readonly Lookback[] = [3, 6, 12];

/** How much the history justifies the recommendation. */
export type Confidence = 'high' | 'medium' | 'low';

export interface BudgetSuggestion {
  k: string;
  label: string;
  ic: IconName;
  section: CatKey;
  /** Months (YYYY-MM) that fed the average, oldest first. */
  monthsUsed: string[];
  /** Spend in each of `monthsUsed`, same order — the evidence behind the number. */
  history: number[];
  /** Mean spend across `monthsUsed`. */
  average: number;
  /** The recommendation: `average` rounded up to a readable step. */
  suggested: number;
  /** What this category is budgeted at right now for the target month. */
  current: number;
  /** suggested − current. Positive means the plan is under-funded. */
  difference: number;
  /** Change as a share of the current budget; null when there is no budget yet. */
  differencePct: number | null;
  confidence: Confidence;
  /** Plain-language reason for the confidence level — no currency, so any locale can render it. */
  confidenceReason: string;
}

export interface SuggestionSet {
  lookback: Lookback;
  /** Months in the window that had any logged activity, oldest first. */
  monthsAvailable: string[];
  /** True when history is shorter than the requested lookback. */
  partial: boolean;
  /** Suggestions, largest gap vs the current budget first. */
  suggestions: BudgetSuggestion[];
}

/**
 * Rounding steps by magnitude. A recommendation of "550" reads as a decision;
 * "541.67" reads as a spreadsheet cell, and invites false precision about a
 * number that is an average of a handful of months.
 */
const NICE_STEPS: ReadonlyArray<readonly [max: number, step: number]> = [
  [100, 5],
  [1_000, 10],
  [10_000, 50],
  [100_000, 100],
];
const LARGEST_STEP = 500;

/**
 * Round up to the nearest readable step. Rounding *up* rather than to-nearest is
 * the safer direction for a budget: a limit slightly above the historical
 * average is achievable, one slightly below is a plan that starts in deficit.
 */
export function roundToNiceBudget(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const step = NICE_STEPS.find(([max]) => n < max)?.[1] ?? LARGEST_STEP;
  return Math.ceil(n / step) * step;
}

/** The `count` months immediately before `month`, oldest first. */
export function monthsBefore(month: string, count: number): string[] {
  const [y, m] = month.split('-').map(Number);
  const out: string[] = [];
  for (let i = count; i >= 1; i--) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(ymLocal(d));
  }
  return out;
}

/** Population coefficient of variation. 0 for a flat series, ∞ guarded to 0. */
function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean <= 0) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function gradeConfidence(history: number[]): { confidence: Confidence; confidenceReason: string } {
  const n = history.length;
  const cv = coefficientOfVariation(history);
  const months = `${n} month${n === 1 ? '' : 's'}`;

  if (n >= 3 && cv <= 0.25) {
    return { confidence: 'high', confidenceReason: `Steady spending across ${months}.` };
  }
  if ((n >= 3 && cv <= 0.6) || (n === 2 && cv <= 0.25)) {
    return { confidence: 'medium', confidenceReason: `Some variation across ${months}.` };
  }
  if (n < 3) {
    return { confidence: 'low', confidenceReason: `Only ${months} of history to go on.` };
  }
  return { confidence: 'low', confidenceReason: `Spending swings a lot month to month.` };
}

/**
 * Build budget recommendations for `targetMonth`.
 *
 * `budgetVals` is that month's current plan, used only to report the difference —
 * it is never modified. Categories with no spending in the window are skipped:
 * recommending a budget of zero for something the user has never bought is
 * noise, not advice.
 *
 * The denominator is *months with any logged activity*, not months in which this
 * category happened to have a transaction. A month where the user logged
 * groceries but no travel is a genuine zero for travel, and averaging it in is
 * what stops a single holiday from becoming a permanent monthly allowance.
 */
export function suggestBudgets(
  items: ExpenseItem[],
  cats: SectionedCats,
  budgetVals: Record<string, number>,
  targetMonth: string,
  lookback: Lookback,
): SuggestionSet {
  const flat = allCategories(cats);
  const validKeys = new Set(flat.map((c) => c.k));

  const window = monthsBefore(targetMonth, lookback);
  const windowSet = new Set(window);

  // Spend per (month, migrated category) across the window only.
  const byMonth = new Map<string, Map<string, number>>();
  for (const e of items) {
    const m = (e.date || '').slice(0, 7);
    if (!windowSet.has(m)) continue;
    const k = migrateCategory(e.category, validKeys);
    let row = byMonth.get(m);
    if (!row) { row = new Map(); byMonth.set(m, row); }
    row.set(k, (row.get(k) ?? 0) + e.amount);
  }

  // Only months the user actually used the tracker in count as evidence.
  const monthsAvailable = window.filter((m) => byMonth.has(m));

  const suggestions: BudgetSuggestion[] = [];
  if (monthsAvailable.length > 0) {
    for (const cat of flat) {
      const history = monthsAvailable.map((m) => byMonth.get(m)?.get(cat.k) ?? 0);
      const total = history.reduce((s, v) => s + v, 0);
      if (total <= 0) continue; // never spent here — nothing to recommend

      const average = total / history.length;
      const suggested = roundToNiceBudget(average);
      const current = Math.max(0, Number(budgetVals[cat.k]) || 0);
      const difference = suggested - current;

      suggestions.push({
        k: cat.k,
        label: cat.l,
        ic: cat.ic,
        section: cat.section,
        monthsUsed: monthsAvailable,
        history,
        average,
        suggested,
        current,
        difference,
        differencePct: current > 0 ? (difference / current) * 100 : null,
        ...gradeConfidence(history),
      });
    }
  }

  // Biggest correction first: the rows most worth a decision lead.
  suggestions.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference) || b.suggested - a.suggested);

  return {
    lookback,
    monthsAvailable,
    partial: monthsAvailable.length < lookback,
    suggestions,
  };
}
