/**
 * What a draft's state means — the three questions the whole sheet is built on.
 *
 *   - Can this row be imported at all?          (`isImportable`)
 *   - Should the user look at it first?         (`needsReview`)
 *   - What do the counters at the top say?      (`summarize`)
 *
 * These live apart from `draft.ts` because both the builder and the AI merge
 * step need to ask them, and a predicate that two modules answer differently is
 * how a button ends up promising to import four rows and importing three. One
 * definition, imported by everything, means the count on the primary action is
 * the count that lands in the ledger — by construction rather than by care.
 */

import { CONFIDENT_AT, type DraftRow, type ImportSummary } from './types';

/**
 * True when this row could be written to the ledger as it stands.
 *
 * A category is part of the requirement, not an optional extra: an uncategorised
 * transaction is invisible in every breakdown, budget and report the tracker
 * produces, so importing one is worse than leaving it for the user to decide.
 * Zero is excluded for the reason the manual editor excludes it — it says
 * nothing and still occupies the ledger.
 */
export function isImportable(draft: DraftRow): boolean {
  return (
    Boolean(draft.date) &&
    Number.isFinite(draft.amount) &&
    draft.amount !== 0 &&
    Boolean(draft.category)
  );
}

/**
 * True when the user should look at this row before confirming.
 *
 * Note what is deliberately excluded. A credit is not a problem — the tracker
 * records spending, and the row is doing exactly what it should by sitting
 * unticked. A duplicate is not a problem either; it has its own filter and its
 * own badge, and counting it twice would make the review queue look worse than
 * it is. Nor is an ambiguous date order, which is a fact about the *file* and is
 * raised once, at the top, with a control that fixes every row at once — flagging
 * it per row put a badge on all eight rows of an eight-row statement and buried
 * the two that genuinely needed attention.
 *
 * What is left is the honest list: rows with no category, rows we are not
 * confident about, and rows whose date or amount did not parse cleanly.
 */
export function needsReview(draft: DraftRow): boolean {
  if (draft.issues.includes('credit')) return false;
  if (draft.duplicateOf || draft.duplicateInBatch) return false;
  if (!draft.category) return true;
  if (draft.confidence < CONFIDENT_AT) return true;
  return draft.issues.some((i) => i === 'no-date' || i === 'no-amount' || i === 'foreign-currency');
}

/**
 * The counters above the table.
 *
 * `selected` counts rows that are both ticked *and* importable, so the number on
 * the Import button is exactly the number of transactions that will appear in
 * the ledger. Anything else would be the product lying about what it is about to
 * do, in the one place it cannot afford to.
 */
export function summarize(drafts: readonly DraftRow[]): ImportSummary {
  let selected = 0;
  let confident = 0;
  let review = 0;
  let duplicates = 0;
  let credits = 0;
  let total = 0;

  for (const draft of drafts) {
    if (draft.duplicateOf || draft.duplicateInBatch) duplicates++;
    if (draft.issues.includes('credit')) credits++;
    if (needsReview(draft)) review++;

    if (draft.include && isImportable(draft)) {
      selected++;
      total += draft.amount;
      if (!needsReview(draft)) confident++;
    }
  }

  return { found: drafts.length, selected, confident, needsReview: review, duplicates, credits, total };
}
