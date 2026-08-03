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

/**
 * Round to the precision the UI actually displays.
 *
 * Every amount in the product is shown in whole currency units — `cfmt` rounds
 * before formatting — while a section limit is `income × pct ÷ 100` and lands
 * on fractions constantly (a 30% share of 4,039.99 is 1,211.997, shown as
 * "1,212"). Classifying on the raw value against a rounded display produced two
 * incoherent results: typing the limit you were shown read as `over`, reported
 * as "Over by 0"; and `complete` — "Fully used" — was unreachable on any
 * fractional limit, because it needs the exact float and no one can type it.
 *
 * So the comparison is made on the same figures the user is reading. If an
 * overage rounds away to nothing on screen, it is not an overage. The cost is
 * that a sub-unit overspend (1,000.01 of 1,000) now reads as "Fully used"
 * rather than "Over by 0" — which is what it already displayed as either way.
 *
 * This is a classification threshold, not a financial formula: no budget, spend
 * or remaining figure is altered by it, and every surface (bar, pill, dashboard
 * warnings, exported reports) shares the change so they cannot disagree.
 */
const atDisplayPrecision = (n: number): number => Math.round(n);

/** Percentage of budget consumed. 0 when there is no budget to consume. */
export function budgetPct(budget: number, spent: number): number {
  return budget > 0 ? (spent / budget) * 100 : 0;
}

/** Bar width — the same percentage, clamped so an overspend never overflows. */
export function budgetFillPct(budget: number, spent: number): number {
  if (!(budget > 0)) return 0;
  // Rounded, so a bar that the pill calls "Fully used" is also visually full.
  return Math.max(0, Math.min(100, budgetPct(atDisplayPrecision(budget), atDisplayPrecision(spent))));
}

export function budgetTone(budget: number, spent: number): BudgetTone {
  if (!(budget > 0)) return 'none';
  const b = atDisplayPrecision(budget);
  const s = atDisplayPrecision(spent);
  // A budget under half a unit rounds to zero and can no longer be divided by;
  // any spend against it is over, and zero spend is simply untouched.
  if (!(b > 0)) return s > 0 ? 'over' : 'safe';
  if (s > b) return 'over';
  const pct = budgetPct(b, s);
  if (pct >= 100) return 'complete';
  if (pct >= 80) return 'warn';
  return 'safe';
}

/**
 * CSS custom properties, so both themes resolve correctly with no JS branch.
 *
 * TONE_COLOR is the TEXT value (pill labels, KPI figures) and clears WCAG AA;
 * TONE_FILL is the same tone as a filled bar and stays vivid, needing only the
 * 3:1 that WCAG 1.4.11 asks of a graphic. One token cannot do both jobs — the
 * light theme's AA deepening is exactly what was draining the progress bars.
 * See styles/tokens.css.
 */
export const TONE_COLOR: Record<BudgetTone, string> = {
  none: 'var(--bar-none)',
  safe: 'var(--green)',
  warn: 'var(--orange)',
  complete: 'var(--blue)',
  over: 'var(--red)',
};

export const TONE_FILL: Record<BudgetTone, string> = {
  none: 'var(--bar-none)',
  safe: 'var(--green-fill)',
  warn: 'var(--orange-fill)',
  complete: 'var(--blue-fill)',
  over: 'var(--red-fill)',
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
