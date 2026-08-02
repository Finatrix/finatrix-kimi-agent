/**
 * Build-time switches for finished features that are deliberately not on show.
 *
 * A flag here is a product decision, never a parking space for unfinished work:
 * the code behind it stays complete, tested and reviewed, so flipping the
 * constant is the whole of the change. Anything that is off should say why, and
 * what would make it right to turn back on.
 *
 * The types are widened to `boolean` on purpose. Left as literals, TypeScript
 * would narrow every guarded branch to dead code and stop type-checking the
 * disabled path — the one place where a regression could hide unnoticed.
 */

/**
 * Suggested Spending in Budget Builder ("Suggested from your spending").
 *
 * Temporarily disabled as a product decision. The card, its recommendation
 * engine (`lib/budgetSuggest`) and its tests are all intact and unchanged;
 * while this is `false` the card does not render, no suggestion is computed,
 * and Budget Builder does not read or subscribe to Expense Tracker data at all.
 *
 * To restore the section: set this to `true`. Nothing else needs to change —
 * the suite in `src/test/budgetSuggestions.test.tsx` re-arms itself off this
 * same flag.
 */
export const BUDGET_SUGGESTIONS_ENABLED: boolean = false;
