/**
 * Using the balance column to check the parser's work.
 *
 * A statement carries its own proof. Every row prints the balance that resulted
 * from it, so the difference between consecutive balances *is* the transaction —
 * signed, unambiguous, and written by the bank rather than inferred by us. Two
 * things fall out of that, and both are things a language model could not do
 * more reliably than arithmetic:
 *
 *  1. **Direction.** "Was this money in or out?" is genuinely ambiguous in a
 *     single-amount column, and PDF text extraction routinely collapses separate
 *     withdrawal/deposit columns into one. The balance delta settles it as a
 *     fact. Only where the chain is missing does the importer fall back to a
 *     convention — and it says so.
 *
 *  2. **Completeness.** If the balances step by exactly the amounts we parsed,
 *     from the opening figure to the closing one, then we read every row. If
 *     they do not, rows are missing or misread, and the user is told *before*
 *     importing rather than discovering a wrong month total later.
 *
 * This is the feature that makes the importer trustworthy rather than merely
 * convenient, and it costs one pass over an array.
 */

import type { StatementDoc, StatementRow } from './types';

/** Money compares to the paisa/cent; below this two figures are the same. */
const EPSILON = 0.005;

/** Descriptions that name an inflow, used only where the balance chain is absent. */
const INFLOW_HINT_RE =
  /\b(?:SALARY|SAL\b|CREDIT\s*INT|INTEREST\s*(?:CR|CREDIT|PAID)|REFUND|REVERSAL|CASHBACK|REIMB|DIVIDEND|MATURITY|NEFT\s*CR|IMPS\s*CR|UPI\/CR|BY\s*TRANSFER|DEPOSIT|RECEIVED\s*FROM)\b/i;

export interface DirectionOutcome {
  rows: StatementRow[];
  /** Rows whose direction the balance chain proved outright. */
  proved: number;
  /** Rows left to the description hint or the default. */
  assumed: number;
}

/**
 * Settle each row's direction, preferring evidence over convention.
 *
 * Precedence, strongest first:
 *   1. an explicit Dr/Cr marker the bank printed (already applied by the parsers)
 *   2. the balance delta against the previous row (or the opening balance)
 *   3. an inflow word in the description
 *   4. debit — the overwhelming majority of rows in a spending statement
 *
 * Rows are processed in file order, which is the order the balances step in.
 */
export function resolveDirections(doc: StatementDoc): DirectionOutcome {
  let previousBalance = doc.openingBalance;
  let proved = 0;
  let assumed = 0;

  const rows = doc.rows.map((row) => {
    const settled = { ...row };

    if (settled.amount !== null && settled.balance !== null && previousBalance !== null) {
      const delta = settled.balance - previousBalance;
      if (Math.abs(delta - settled.amount) < EPSILON) {
        settled.direction = 'credit';
        proved++;
      } else if (Math.abs(delta + settled.amount) < EPSILON) {
        settled.direction = 'debit';
        proved++;
      }
    }

    if (settled.direction === null) {
      settled.direction = INFLOW_HINT_RE.test(settled.description) ? 'credit' : 'debit';
      assumed++;
    }

    if (settled.balance !== null) previousBalance = settled.balance;
    return settled;
  });

  return { rows, proved, assumed };
}

export interface Reconciliation {
  /** False when the statement gave us nothing to check against. */
  checked: boolean;
  /** True when the arithmetic agrees. */
  ok: boolean;
  /** Net movement the statement's own balances imply. */
  expectedNet: number;
  /** Net movement of the rows we parsed. Credits positive, debits negative. */
  actualNet: number;
  /** expectedNet − actualNet. Zero when everything was recovered. */
  difference: number;
  /** Rows whose balance does not follow from the row above it. */
  breaks: number;
  /** Where the expected figure came from, for the message shown to the user. */
  basis: 'stated-balances' | 'row-balances' | 'none';
}

const NOTHING: Reconciliation = {
  checked: false, ok: false, expectedNet: 0, actualNet: 0, difference: 0, breaks: 0, basis: 'none',
};

/**
 * Check the parsed rows against the statement's own balances.
 *
 * Prefers the stated opening/closing figures; falls back to the first and last
 * running balances, which bound the same movement whenever the bank printed a
 * balance column. Returns `checked: false` rather than a passing result when
 * neither is available — claiming a statement reconciled when nothing was
 * compared would be the exact kind of false assurance this feature exists to
 * avoid.
 */
export function reconcile(doc: StatementDoc, rows: readonly StatementRow[]): Reconciliation {
  const usable = rows.filter((r) => r.amount !== null);
  const actualNet = usable.reduce(
    (sum, r) => sum + (r.direction === 'credit' ? (r.amount as number) : -(r.amount as number)),
    0,
  );

  let expectedNet: number | null = null;
  let basis: Reconciliation['basis'] = 'none';

  if (doc.openingBalance !== null && doc.closingBalance !== null) {
    expectedNet = doc.closingBalance - doc.openingBalance;
    basis = 'stated-balances';
  } else {
    const withBalance = rows.filter((r) => r.balance !== null);
    if (withBalance.length >= 2) {
      const first = withBalance[0];
      const last = withBalance[withBalance.length - 1];
      // The first row's own movement is already inside its printed balance, so
      // the opening figure is that balance minus that row's effect.
      const firstEffect = first.amount === null
        ? 0
        : (first.direction === 'credit' ? first.amount : -first.amount);
      expectedNet = (last.balance as number) - ((first.balance as number) - firstEffect);
      basis = 'row-balances';
    }
  }

  if (expectedNet === null) return { ...NOTHING, actualNet };

  let breaks = 0;
  let previous: number | null = doc.openingBalance;
  for (const row of rows) {
    if (row.balance === null || row.amount === null) continue;
    if (previous !== null) {
      const effect = row.direction === 'credit' ? row.amount : -row.amount;
      if (Math.abs(row.balance - (previous + effect)) >= EPSILON) breaks++;
    }
    previous = row.balance;
  }

  const difference = expectedNet - actualNet;
  return {
    checked: true,
    ok: Math.abs(difference) < EPSILON && breaks === 0,
    expectedNet,
    actualNet,
    difference,
    breaks,
    basis,
  };
}
