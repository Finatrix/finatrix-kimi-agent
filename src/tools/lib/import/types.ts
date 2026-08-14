/**
 * Statement import — the shapes that travel between the parser, the
 * categoriser and the review sheet.
 *
 * THE ONE INVARIANT
 * -----------------
 * `StatementRow` is what deterministic code read out of the file. Every figure
 * on it — amount, balance, date — was parsed from bytes the user supplied and
 * is never authored, rewritten or "corrected" by a language model. The AI layer
 * receives descriptions only (see `ai/statementCategorize.ts`) and can write
 * back exactly two fields on a draft: `merchant` and `category`.
 *
 * That boundary is structural rather than a promise in a prompt. A model that
 * hallucinates, is confused by a hostile merchant name, or returns garbage can
 * change what a row is *called* and which bucket it lands in — both visible and
 * correctable in the review sheet — and cannot change what it *cost*.
 *
 * DRAFTS ARE NOT TRANSACTIONS
 * ---------------------------
 * `DraftRow` deliberately does not extend `ExpenseItem`, and drafts are stored
 * under their own key (see `draft.ts`). Nothing in the calculation engine reads
 * them. A draft becomes an `ExpenseItem` at exactly one place — `toExpense` —
 * and only for rows the user ticked.
 */

/** How the rows were recovered from the file. */
export type SourceKind = 'csv' | 'pdf-text';

/** Which way the money moved, as the statement reported it. */
export type Direction = 'debit' | 'credit';

/**
 * Something about a row the user should look at before importing it.
 *
 * These are facts about the *parse*, produced by code that can measure them —
 * not a model's opinion of its own work. Every one of them either blocks the
 * row from being ticked or visibly flags it.
 */
export type RowIssue =
  /** No date could be read; the row cannot be imported as-is. */
  | 'no-date'
  /** No amount could be read; the row cannot be imported as-is. */
  | 'no-amount'
  /** The row names a currency that is not the statement's own. */
  | 'foreign-currency'
  /** Money came in rather than out. */
  | 'credit'
  /** The description is too sparse to categorise from. */
  | 'sparse-description';

/** Where a draft's category came from. Drives the badge and the learning step. */
export type CategoryOrigin =
  /** The user has categorised this merchant before. */
  | 'learned'
  /** Matched the built-in merchant/keyword table. */
  | 'rule'
  /** The model chose it. */
  | 'ai'
  /** The user set it by hand in the review sheet. */
  | 'user'
  /** Nothing decided it — needs review. */
  | 'none';

/**
 * One row exactly as the statement printed it.
 *
 * `amount` is an unsigned magnitude and `direction` carries the sense, so no
 * layer has to remember whose sign convention it is holding. The ledger's own
 * convention (positive = spend) is applied once, in `draft.ts`.
 */
export interface StatementRow {
  /** 1-based source line, so "row 42 didn't parse" points somewhere real. */
  line: number;
  /** Transaction date as local `YYYY-MM-DD`. Null when unreadable. */
  date: string | null;
  /** Posting/value date when the statement prints both. Null otherwise. */
  postedDate: string | null;
  /** The description as printed — sanitized, never cleaned up or shortened. */
  description: string;
  /** Unsigned amount. Null when unreadable. */
  amount: number | null;
  /** Which way the money moved. Null when the file did not say. */
  direction: Direction | null;
  /** Running balance after this row, when the statement prints one. */
  balance: number | null;
  /** Cheque / UTR / reference number when present. */
  reference: string | null;
  /** Currency named on this row, when it differs from the statement default. */
  currency: string | null;
}

/** Everything one uploaded file yielded. */
export interface StatementDoc {
  source: SourceKind;
  rows: StatementRow[];
  /** ISO code inferred from symbols or headers in the file. Null when unclear. */
  currency: string | null;
  /** Balance before the first row, when the statement states it. */
  openingBalance: number | null;
  /** Balance after the last row, when the statement states it. */
  closingBalance: number | null;
  /** Lines that looked like data but could not be parsed. Surfaced, never hidden. */
  skipped: number;
  /** How the file's dd/mm vs mm/dd ambiguity was resolved. */
  dateOrder: DateOrder;
  /** True when no evidence in the file settled `dateOrder`. */
  dateOrderAssumed: boolean;
}

/** Component order in a numeric date like `03/04/2026`. */
export type DateOrder = 'dmy' | 'mdy';

/**
 * A row as the review sheet holds it: the immutable parse, plus the editable
 * interpretation layered on top.
 *
 * `source` is kept verbatim alongside the edits so the sheet can always show
 * what the statement actually said next to what the user changed it to — and so
 * a wrong AI guess is visibly a guess about a real line, not a mystery.
 */
export interface DraftRow {
  id: string;
  source: StatementRow;
  /** Ticked for import. Credits and unparseable rows start unticked. */
  include: boolean;
  /** Local `YYYY-MM-DD`. Empty string when the parse found none. */
  date: string;
  /** Ledger convention: positive = spend, negative = refund. */
  amount: number;
  /** Cleaned payee name. May be empty when nothing recognisable was found. */
  merchant: string;
  /** The original description, carried into the transaction's note. */
  note: string;
  /** A key from the user's live category set, or '' when undecided. */
  category: string;
  origin: CategoryOrigin;
  /**
   * How much to trust the *categorisation*, 0–100.
   *
   * Extraction quality is reported separately through `issues`, because it is
   * measurable and a model should not be asked to rate it. See `confidence.ts`
   * for the same split applied to the assistant.
   */
  confidence: number;
  issues: RowIssue[];
  /** Id of an existing ledger transaction this looks like. */
  duplicateOf: string | null;
  /** Id of an earlier draft in this same batch this looks like. */
  duplicateInBatch: string | null;
}

/** Headline counts for the review sheet, computed from the drafts. */
export interface ImportSummary {
  found: number;
  /** Rows ticked for import right now. */
  selected: number;
  /** Confidently categorised (>= CONFIDENT_AT and no blocking issue). */
  confident: number;
  /** Rows the user should look at before confirming. */
  needsReview: number;
  duplicates: number;
  credits: number;
  /** Sum of selected amounts, ledger-signed. */
  total: number;
}

/** At or above this, a categorisation is presented without a review flag. */
export const CONFIDENT_AT = 80;

/**
 * Ceiling on model-assigned confidence.
 *
 * A category the user chose scores 96 and a merchant-table hit 88; a model's
 * guess about a descriptor nothing recognised must not be able to outrank
 * either, however sure it claims to be. Enforced at both the point the reply is
 * parsed and the point it is merged into a draft — the number that decides
 * whether a row is flagged for review should not depend on validation having
 * happened in some other module.
 */
export const MAX_AI_CONFIDENCE = 85;

/**
 * What the model is permitted to say about one description.
 *
 * Declared here, beside the draft it modifies, so the shape of the AI layer's
 * entire write surface is visible from the type that owns the data. Two strings
 * and a score: there is no field on this object that could carry an amount.
 */
export interface CategorySuggestion {
  /** Cleaned payee name, or '' when the model had nothing better. */
  merchant: string;
  /** A key from the live category set, or '' when it declined to choose. */
  category: string;
  confidence: number;
}

/** Description (upper-cased) → what the model proposed for it. */
export type SuggestionMap = Map<string, CategorySuggestion>;
