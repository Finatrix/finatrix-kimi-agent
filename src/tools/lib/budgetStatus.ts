/**
 * Budget progress semantics — the single source of truth for "how is this
 * category doing against its budget", shared by Budget Builder, the Expense
 * dashboard and the exported reports so a bar, a pill and a PDF row can never
 * disagree.
 *
 * This is presentation logic only: it reads already-computed budget/spent pairs
 * and returns a tone. No financial formula lives here.
 *
 * Tone scale (never black — an unfunded category reads as grey, not as "zero
 * spend of an unknown limit"):
 *   none      no budget set            grey  (theme-aware via --bar-none)
 *   safe      0–79% of budget used     green
 *   warn      80–99% used              orange
 *   complete  exactly at 100%          blue   (a distinct success, not a failure)
 *   over      spent beyond the budget  red
 */

export type BudgetTone = 'none' | 'safe' | 'warn' | 'complete' | 'over';

/** Percentage of budget consumed. 0 when there is no budget to consume. */
export function budgetPct(budget: number, spent: number): number {
  return budget > 0 ? (spent / budget) * 100 : 0;
}

/** Bar width — the same percentage, clamped so an overspend never overflows. */
export function budgetFillPct(budget: number, spent: number): number {
  if (!(budget > 0)) return 0;
  return Math.max(0, Math.min(100, budgetPct(budget, spent)));
}

export function budgetTone(budget: number, spent: number): BudgetTone {
  if (!(budget > 0)) return 'none';
  if (spent > budget) return 'over';
  const pct = budgetPct(budget, spent);
  if (pct >= 100) return 'complete';
  if (pct >= 80) return 'warn';
  return 'safe';
}

/** CSS custom properties, so both themes resolve correctly with no JS branch. */
export const TONE_COLOR: Record<BudgetTone, string> = {
  none: 'var(--bar-none)',
  safe: 'var(--green)',
  warn: 'var(--orange)',
  complete: 'var(--blue)',
  over: 'var(--red)',
};

/** Short status used in pills, table cells and screen-reader text. */
export const TONE_LABEL: Record<BudgetTone, string> = {
  none: 'No budget',
  safe: 'On track',
  warn: 'Near limit',
  complete: 'Fully used',
  over: 'Over budget',
};

/** Plain-text status for exports (CSV / Excel / PDF share this wording). */
export const TONE_EXPORT_LABEL: Record<BudgetTone, string> = {
  none: 'No budget',
  safe: 'On track',
  warn: 'Near limit',
  complete: 'Fully used',
  over: 'Over budget',
};

/** True when a category deserves the user's attention on the dashboard. */
export function isWarningTone(tone: BudgetTone): boolean {
  return tone === 'warn' || tone === 'over';
}
