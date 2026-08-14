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
import { resolveLocally } from './categorize';
import type { LearnedMap } from './learned';
import { isImportable } from './status';
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

    // Ticked only when the row is genuinely ready to become a transaction — a
    // real date, a real amount, a category, and money going out. Everything else
    // starts off and the user opts it in, which is the safe direction to be
    // wrong in.
    draft.include = row.direction !== 'credit' && isImportable(draft);
    return draft;
  });
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
