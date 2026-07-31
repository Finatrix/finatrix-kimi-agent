/**
 * The colour of a budget section (Needs / Wants / Savings) — one definition,
 * shared by Budget Builder, the Expense dashboard, the transaction list, the
 * edit sheet and the suggestions card.
 *
 * This map had been copy-pasted into five components, and the copies had
 * drifted: TransactionList and TransactionModal painted Wants with the brand
 * gold while Budget Builder, the Expense dashboard and BudgetSuggestions used
 * the amber `--wants`. The same category therefore changed colour depending on
 * which surface you were looking at. Amber is the intended value — the token is
 * deliberately distinct from the brand gold so the three bands are never told
 * apart by brightness alone, and so gold stays scarce enough to keep meaning
 * "FinatriX", not "one third of your budget".
 *
 * Two maps, not one, because these colours do two different jobs and WCAG asks
 * different things of each: a label must clear 4.5:1 as text, a bar segment
 * only 3:1 as a graphic. Using one value for both is what forced the light
 * theme to choose between readable labels and vivid charts. See
 * styles/tokens.css.
 *
 * Presentation only — no financial logic lives here.
 */

import type { CatKey } from './budget';

/** Labels, icons, KPI figures — anything rendered as text. AA-guarded. */
export const SECTION_COLOR: Record<CatKey, string> = {
  needs: 'var(--blue)',
  wants: 'var(--wants)',
  save: 'var(--green)',
};

/** Bars, segments and swatches — anything rendered as a filled shape. */
export const SECTION_FILL: Record<CatKey, string> = {
  needs: 'var(--blue-fill)',
  wants: 'var(--wants-fill)',
  save: 'var(--green-fill)',
};
