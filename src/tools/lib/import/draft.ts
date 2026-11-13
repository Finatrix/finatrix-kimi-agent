/**
 * Drafts: the editable layer between a parsed statement and the ledger.
 *
 * A draft is not a transaction and is never stored as one. It lives under its
 * own key, no calculation in FinatriX reads it, and it becomes an `ExpenseItem`
 * at exactly one place — `toExpense` — for exactly the rows the user ticked.
 * That separation is what makes "nothing is imported until you confirm" a
 * property of the code rather than a claim in a description: there is no state
 * in which a draft is contributing to a month's total.
 *
 * WHY THE STAGED COPY IS LOCAL-ONLY
 * ---------------------------------
 * Reviewing 150 rows takes a few minutes, and losing that work to a closed tab
 * would be miserable, so the sheet is resumable. But a draft holds raw statement
 * descriptions, and those are the most sensitive strings this product handles.
 * The staging key is therefore deliberately **not** in `SYNC_KEYS`: it stays in
 * this browser and is cleared the moment the import is confirmed or cancelled.
 * The learned merchant map — which holds no amounts, dates or references —
 * is the part that syncs.
 */

import { ymdLocal } from '../../../lib/date';
import { getJSON, setJSON, store } from '../storage';
import { genExpenseId, type ExpenseItem } from '../expense';
import { evaluateFormula, roundAmount, type FormulaResult } from '../formula';
import { resolveLocally } from './categorize';
import { markDuplicates } from './dedupe';
import type { LearnedMap } from './learned';
import { becameImportable, isImportable } from './status';
import type { DraftRow, RowIssue, StatementDoc } from './types';

/** Local-only staging key. Never added to SYNC_KEYS — see the note above. */
export const STAGING_KEY = 'fx_import_staged';

/** Tag applied to every imported transaction, so they stay filterable later. */
export const IMPORT_TAG = 'imported';

/** A description shorter than this cannot be categorised from. */
const MIN_DESCRIPTION_CHARS = 3;

/**
 * Payment method from the rail the bank named.
 *
 * Only the unambiguous ones. "POS" means a card was present and says nothing
 * about whether it was credit or debit, so it is left blank rather than guessed
 * — the same rule `quickAdd` follows for the same reason.
 */
function inferPaymentMethod(description: string): string | undefined {
  const upper = description.toUpperCase();
  if (/\bUPI\b/.test(upper)) return 'UPI';
  if (/\b(?:NEFT|IMPS|RTGS|ACH|NACH|BPAY|BANK\s*TRANSFER)\b/.test(upper)) return 'Bank transfer';
  if (/\b(?:ATM|ATW|NWD|CASH\s*WDL)\b/.test(upper)) return 'Cash';
  if (/\bCHQ|CHEQUE\b/.test(upper)) return 'Cheque';
  return undefined;
}

/**
 * Turn a parsed statement into reviewable drafts.
 *
 * The ledger's sign convention is applied here and only here: a debit is
 * positive spending, a credit is negative. Credits arrive unticked — the tracker
 * records spending, and income belongs to Budget Builder — but they are shown
 * rather than dropped, so a statement the user can see reconciling on paper
 * reconciles on screen too.
 */
export function buildDrafts(
  doc: StatementDoc,
  learned: LearnedMap,
  validKeys: ReadonlySet<string>,
): DraftRow[] {
  return doc.rows.map((row, index) => {
    const issues: RowIssue[] = [];

    if (!row.date) issues.push('no-date');
    if (row.amount === null) issues.push('no-amount');
    if (row.direction === 'credit') issues.push('credit');
    if (row.currency && doc.currency && row.currency !== doc.currency) issues.push('foreign-currency');
    if (row.description.trim().length < MIN_DESCRIPTION_CHARS) issues.push('sparse-description');
    // A reading, not a file. See the note on the issue itself for why every one
    // of these is held back regardless of how clean it looks.
    if (doc.source === 'ocr') issues.push('recognised-text');

    const magnitude = row.amount ?? 0;
    const amount = row.direction === 'credit' ? -magnitude : magnitude;

    const resolved = resolveLocally(row.description, learned, validKeys);

    const draft: DraftRow = {
      id: `d${index}_${row.line}`,
      source: row,
      include: false,
      date: row.date ?? '',
      amount,
      merchant: resolved.merchant,
      note: row.description,
      category: resolved.category,
      origin: resolved.origin,
      confidence: resolved.confidence,
      issues,
      duplicateOf: null,
      duplicateInBatch: null,
    };

    draft.include = startsTicked(draft);
    return draft;
  });
}

/**
 * How a row starts out.
 *
 * Ticked only when it is genuinely ready to become a transaction: a real date,
 * a real amount, a category, money going out, and read from a file rather than
 * off a picture. Everything else starts unticked and the user opts it in, which
 * is the safe direction to be wrong in.
 */
function startsTicked(draft: DraftRow): boolean {
  return (
    !draft.issues.includes('credit') &&
    !draft.issues.includes('recognised-text') &&
    isImportable(draft)
  );
}

/**
 * Convert one confirmed draft into a ledger transaction.
 *
 * The original description survives as the note: the row the bank printed is the
 * evidence behind the row in the ledger, and dropping it in favour of a cleaned
 * merchant name would leave the user unable to check their own data later.
 */
export function toExpense(draft: DraftRow, now: Date = new Date()): ExpenseItem {
  const stamp = now.toISOString();
  const method = inferPaymentMethod(draft.source.description);

  return {
    id: genExpenseId(),
    amount: draft.amount,
    category: draft.category,
    date: draft.date || ymdLocal(now),
    note: draft.note || draft.merchant,
    merchant: draft.merchant || undefined,
    paymentMethod: method,
    tags: [IMPORT_TAG],
    notes: draft.source.reference ? `Ref: ${draft.source.reference}` : undefined,
    createdAt: stamp,
    updatedAt: stamp,
    editCount: 0,
  };
}

/**
 * Read one draft the other way round: money out becomes money in, and back.
 *
 * Used when a file gave no evidence of direction and the reading of its signs
 * turned out to be the wrong one. The same rule `buildDrafts` applies decides
 * what starts ticked afterwards — money going out, fully readable, and not read
 * by a camera — so a swapped statement looks exactly as it would have if it had
 * been read that way to begin with.
 */
export function flipDirection(draft: DraftRow): DraftRow {
  const wasCredit = draft.issues.includes('credit');
  const issues: RowIssue[] = wasCredit
    ? draft.issues.filter((issue) => issue !== 'credit')
    : [...draft.issues, 'credit'];
  const next: DraftRow = {
    ...draft,
    amount: draft.amount === 0 ? 0 : -draft.amount,
    issues,
    source: { ...draft.source, direction: wasCredit ? 'debit' : 'credit' },
  };
  next.include = startsTicked(next);
  return next;
}

/* ── Correcting an amount ────────────────────────────────────────────── */

/** What is being typed into one row's amount, until it is settled. */
export interface AmountEdit {
  /** The draft whose amount is being typed. */
  id: string;
  /** The field's text exactly as typed. */
  text: string;
}

const AMOUNT_NEEDED = 'Enter an amount above zero.';

/**
 * Read what was typed into a row's amount field.
 *
 * The field takes the SIZE of the transaction: a number, or arithmetic such as
 * `1200/2` for a bill that was split. Which way the money moved belongs to the
 * row, not to this field, so a minus sign is not a way to say "refund" here as
 * it is in the manual editor. Zero and anything below it are refused, along
 * with nothing at all and anything the formula grammar cannot read, each with
 * a sentence the sheet can show. A reading that is accepted is already rounded
 * to the cent, which is the precision duplicates are matched at.
 */
export function readAmountEdit(input: string): FormulaResult {
  const typed = input.trim();
  if (!typed) return { ok: false, error: AMOUNT_NEEDED };
  const parsed = evaluateFormula(typed);
  if (parsed.ok && parsed.value <= 0) return { ok: false, error: AMOUNT_NEEDED };
  return parsed;
}

/**
 * Correct one row's amount by hand, then check the batch for duplicates again.
 *
 * `magnitude` is the size of the transaction. The direction stays whatever the
 * row already says, so money in stays money in at its new size, under the same
 * sign convention `buildDrafts` applies.
 *
 * Two things are deliberately left alone:
 *  - `source`. What the statement printed stays beside what the user made of
 *    it, so the sheet can go on showing both.
 *  - `origin` and `confidence`. They describe the *category*, and an amount
 *    says nothing about which merchant belongs where, so nothing is learned
 *    from this edit.
 *
 * Duplicates are re-checked because the amount is half of what a duplicate is,
 * and a tick changes only where that check, or the correction itself, gives a
 * reason:
 *  - Newly flagged rows are unticked, like any suspected duplicate. That is
 *    the corrected row if it now matches the ledger or an earlier row of this
 *    file, and a later row that has just started repeating it.
 *  - Rows the correction releases — flagged before, not flagged now, and never
 *    ticked back on — return to how such a row starts (`startsTicked`). They
 *    were held back only by a match that no longer exists, and leaving them
 *    unticked would drop a real transaction without a word.
 *  - A blocked row whose missing amount has just been supplied is ticked, by
 *    the same rule as any other edit that unblocks a row.
 *  - Every other row keeps the tick it had. That includes a flagged row the
 *    user ticked back on, which `markDuplicates` alone would quietly untick
 *    again because an amount changed somewhere else in the file.
 *
 * Returns the same array, untouched, when there is nothing to do: an unknown
 * row, a size that is not above zero, or the amount the row already has.
 */
export function amendAmount(
  drafts: DraftRow[],
  id: string,
  magnitude: number,
  existing: readonly ExpenseItem[],
): DraftRow[] {
  const index = drafts.findIndex((draft) => draft.id === id);
  const size = roundAmount(magnitude);
  if (index < 0 || !Number.isFinite(size) || size <= 0) return drafts;

  const before = drafts[index];
  const amount = before.issues.includes('credit') ? -size : size;
  if (amount === before.amount) return drafts;

  const amended: DraftRow = {
    ...before,
    amount,
    // The row has an amount now. That the statement gave none stays on `source`.
    issues: before.issues.filter((issue) => issue !== 'no-amount'),
  };

  const marked = markDuplicates(drafts.map((draft, i) => (i === index ? amended : draft)), existing);
  return marked.map((draft, i) => {
    const was = drafts[i];
    const wasFlagged = Boolean(was.duplicateOf || was.duplicateInBatch);
    const tick = (on: boolean) => (on && !draft.include ? { ...draft, include: true } : draft);

    if (draft.duplicateOf || draft.duplicateInBatch) {
      // `markDuplicates` has unticked it. That stands for the corrected row and
      // for a row that only now repeats it; an older flag the user overrode does not.
      const startedRepeating = Boolean(draft.duplicateInBatch) && !was.duplicateInBatch;
      return tick(i !== index && wasFlagged && was.include && !startedRepeating);
    }
    if (wasFlagged && !was.include) return tick(startsTicked(draft));
    return tick(i === index && becameImportable(was, draft));
  });
}

/**
 * Settle an amount that was being typed.
 *
 * Taken, it gives the drafts with the correction applied (see `amendAmount`).
 * Turned away, it gives the drafts exactly as they were and the reason, so the
 * row keeps the amount it had. With nothing being typed there is nothing to
 * settle, and the drafts come back unchanged.
 */
export function settleAmountEdit(
  drafts: DraftRow[],
  edit: AmountEdit | null,
  existing: readonly ExpenseItem[],
): { drafts: DraftRow[]; refusal: string } {
  if (!edit) return { drafts, refusal: '' };
  const reading = readAmountEdit(edit.text);
  return reading.ok
    ? { drafts: amendAmount(drafts, edit.id, reading.value, existing), refusal: '' }
    : { drafts, refusal: reading.error };
}

/* ── Staging ─────────────────────────────────────────────────────────── */

export interface StagedImport {
  /** File the drafts came from, so a resumed sheet can say what it is showing. */
  fileName: string;
  savedAt: string;
  drafts: DraftRow[];
}

export function saveStaged(fileName: string, drafts: readonly DraftRow[], now: Date = new Date()): void {
  const staged: StagedImport = { fileName, savedAt: now.toISOString(), drafts: [...drafts] };
  setJSON(STAGING_KEY, staged);
}

export function loadStaged(): StagedImport | null {
  const staged = getJSON<Partial<StagedImport> | null>(STAGING_KEY, null);
  if (!staged || !Array.isArray(staged.drafts) || !staged.drafts.length) return null;
  return {
    fileName: typeof staged.fileName === 'string' ? staged.fileName : 'statement',
    savedAt: typeof staged.savedAt === 'string' ? staged.savedAt : '',
    drafts: staged.drafts as DraftRow[],
  };
}

export function clearStaged(): void {
  store.remove(STAGING_KEY);
}
