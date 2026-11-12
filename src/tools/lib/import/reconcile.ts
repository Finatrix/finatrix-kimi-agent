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
 * convenient, and it costs a few passes over an array.
 *
 * Three facts about the balance column are read from the file rather than
 * assumed, because assuming any of them makes the arithmetic agree with a
 * wrong reading: its SIGN (an overdrawn balance is negative — the parsers keep
 * it), its ORDER (`isNewestFirst`), and what it COUNTS (`balanceKindOf`).
 */

import type { BalanceKind, StatementDoc, StatementRow } from './types';

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
  /** What the balance column turned out to count. See `balanceKindOf`. */
  balanceKind: BalanceKind;
  /** True when the file lists its rows newest-first. See `isNewestFirst`. */
  newestFirst: boolean;
}

type Direction = NonNullable<StatementRow['direction']>;

/**
 * Which way a balance step says the money moved, or null when the step is not
 * exactly this row's amount (a missing row, a fee folded in, a misread digit).
 *
 * On a `'funds'` balance money coming in raises the figure; on an `'owed'`
 * balance it lowers it, so the same step means the opposite thing.
 */
function directionOfStep(delta: number, amount: number, kind: BalanceKind): Direction | null {
  const rise: Direction = kind === 'owed' ? 'debit' : 'credit';
  const fall: Direction = kind === 'owed' ? 'credit' : 'debit';
  if (Math.abs(delta - amount) < EPSILON) return rise;
  if (Math.abs(delta + amount) < EPSILON) return fall;
  return null;
}

/** How many rows step the balance by exactly their own amount, read in this order. */
function provableSteps(rows: readonly StatementRow[], opening: number | null): number {
  let count = 0;
  let previous = opening;
  for (const row of rows) {
    if (
      row.amount !== null && row.balance !== null && previous !== null &&
      Math.abs(Math.abs(row.balance - previous) - row.amount) < EPSILON
    ) count++;
    if (row.balance !== null) previous = row.balance;
  }
  return count;
}

/**
 * Is this statement listed newest-first?
 *
 * A balance belongs to the row it is printed on and follows from the row that
 * happened BEFORE it — which is the line above in a statement printed oldest
 * first, and the line below in one printed newest first, as a great many bank
 * exports are. Walked the wrong way, almost no step matches its row, so the
 * statement "fails" to reconcile; and where two neighbouring rows share an
 * amount the step does match, with its sign reversed, and a second ₹100 debit
 * is "proved" to be a credit.
 *
 * Decided by the arithmetic rather than the dates, which are useless when a
 * whole statement falls on one day: whichever reading has more rows stepping
 * the balance by exactly their own amount is the order the bank printed.
 */
export function isNewestFirst(doc: StatementDoc): boolean {
  if (doc.rows.length < 2) return false;
  const forward = provableSteps(doc.rows, doc.openingBalance);
  const backward = provableSteps([...doc.rows].reverse(), doc.openingBalance);
  return backward > forward;
}

/** The rows oldest-first: the order the balances step in. */
function chronological(rows: readonly StatementRow[], newestFirst: boolean | undefined): readonly StatementRow[] {
  return newestFirst ? [...rows].reverse() : rows;
}

/**
 * Work out what the balance column counts: money held, or money owed.
 *
 * A bank account's balance falls when you spend. A credit card's balance is
 * what you owe, so it RISES when you spend — and read as a bank balance, every
 * purchase on a card statement "proves" itself to be money coming in, every
 * repayment proves itself to be spending, and the arithmetic still reconciles
 * perfectly because it is wrong the same way on every row.
 *
 * The file settles it wherever the bank stated a direction outright (a Debit or
 * Credit column, a Dr/Cr marker): those rows are checked against the balance
 * step, and if they contradict the bank-account reading more often than they
 * agree with it, the balance is an amount owed. A bare minus sign gets no vote
 * — whether negative means "spent" is itself a convention that varies by
 * export, so it cannot be evidence about another convention.
 *
 * One contradiction on its own flips the reading only when it is all the
 * evidence there is. Otherwise a single misattributed marker in a scanned PDF
 * would turn a whole statement round.
 */
export function balanceKindOf(doc: StatementDoc, newestFirst = isNewestFirst(doc)): BalanceKind {
  let agree = 0;
  let disagree = 0;
  let provable = 0;
  let previous = doc.openingBalance;

  for (const row of chronological(doc.rows, newestFirst)) {
    if (row.amount !== null && row.balance !== null && previous !== null) {
      const asFunds = directionOfStep(row.balance - previous, row.amount, 'funds');
      if (asFunds) {
        provable++;
        if (row.directionStated && row.direction) {
          if (row.direction === asFunds) agree++;
          else disagree++;
        }
      }
    }
    if (row.balance !== null) previous = row.balance;
  }

  if (disagree <= agree) return 'funds';
  return disagree >= 2 || disagree === provable ? 'owed' : 'funds';
}

/**
 * Settle each row's direction, preferring evidence over convention.
 *
 * Precedence, strongest first:
 *   1. the balance step against the previous row (or the opening balance), read
 *      the way the bank's own stated directions say this balance works
 *   2. the direction the parser took from the file — a Debit/Credit column, a
 *      Dr/Cr marker, or failing those a minus sign, read the way the balance
 *      showed this file uses its signs
 *   3. an inflow word in the description
 *   4. debit — the overwhelming majority of rows in a spending statement
 *
 * The balance outranks the parsed direction because it cannot be misread:
 * text extraction routinely collapses a PDF's separate withdrawal and deposit
 * columns into one, and the step between two printed balances still says which
 * it was. What it must not outrank is the bank's stated directions taken as a
 * whole — that is what `balanceKindOf` is for.
 *
 * Rows are walked oldest-first, which is the order the balances step in, and
 * returned in the order the file listed them.
 */
export function resolveDirections(doc: StatementDoc): DirectionOutcome {
  const newestFirst = isNewestFirst(doc);
  const balanceKind = balanceKindOf(doc, newestFirst);
  let previousBalance = doc.openingBalance;
  let proved = 0;
  let assumed = 0;
  // How the parser's reading of a bare sign fared against the balance.
  let signAgreed = 0;
  let signContradicted = 0;
  /** Rows the balance could not reach, whose direction is only a sign reading. */
  const unprovenSignReadings: StatementRow[] = [];

  const settledRows = chronological(doc.rows, newestFirst).map((row) => {
    const settled = { ...row };
    const signReading = !row.directionStated ? row.direction : null;
    let stepped: Direction | null = null;

    if (settled.amount !== null && settled.balance !== null && previousBalance !== null) {
      stepped = directionOfStep(settled.balance - previousBalance, settled.amount, balanceKind);
      if (stepped) {
        settled.direction = stepped;
        proved++;
        if (signReading) {
          if (signReading === stepped) signAgreed++;
          else signContradicted++;
        }
      }
    }

    if (!stepped && signReading) unprovenSignReadings.push(settled);

    if (settled.direction === null) {
      settled.direction = INFLOW_HINT_RE.test(settled.description) ? 'credit' : 'debit';
      assumed++;
    }

    if (settled.balance !== null) previousBalance = settled.balance;
    return settled;
  });

  // The balance has now said what a minus sign means in this file. Where it
  // contradicted the parser's reading more often than it agreed, the rows it
  // could not reach — the oldest row, which has nothing to step from, above
  // all — were read with the same wrong convention, and are turned round.
  if (signContradicted > signAgreed) {
    for (const row of unprovenSignReadings) {
      row.direction = row.direction === 'credit' ? 'debit' : 'credit';
    }
  }

  const rows = newestFirst ? settledRows.reverse() : settledRows;
  return { rows, proved, assumed, balanceKind, newestFirst };
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
  // On an amount-owed balance a credit lowers the figure, so every balance
  // movement below is read with its sign turned round. `actualNet` stays in the
  // one convention the rest of the importer uses: credits positive.
  const sense = doc.balanceKind === 'owed' ? -1 : 1;
  // Oldest first, whatever order the file used: "first" and "last" below mean
  // the earliest and latest balances, and each step follows the one before it.
  const ordered = chronological(rows, doc.newestFirst);
  const usable = rows.filter((r) => r.amount !== null);
  const actualNet = usable.reduce(
    (sum, r) => sum + (r.direction === 'credit' ? (r.amount as number) : -(r.amount as number)),
    0,
  );

  let expectedNet: number | null = null;
  let basis: Reconciliation['basis'] = 'none';

  if (doc.openingBalance !== null && doc.closingBalance !== null) {
    expectedNet = sense * (doc.closingBalance - doc.openingBalance);
    basis = 'stated-balances';
  } else {
    const withBalance = ordered.filter((r) => r.balance !== null);
    if (withBalance.length >= 2) {
      const first = withBalance[0];
      const last = withBalance[withBalance.length - 1];
      // The first row's own movement is already inside its printed balance, so
      // the opening figure is that balance minus that row's effect.
      const firstEffect = first.amount === null
        ? 0
        : (first.direction === 'credit' ? first.amount : -first.amount);
      expectedNet = sense * ((last.balance as number) - (first.balance as number)) + firstEffect;
      basis = 'row-balances';
    }
  }

  if (expectedNet === null) return { ...NOTHING, actualNet };

  let breaks = 0;
  let previous: number | null = doc.openingBalance;
  for (const row of ordered) {
    if (row.balance === null || row.amount === null) continue;
    if (previous !== null) {
      const effect = row.direction === 'credit' ? row.amount : -row.amount;
      if (Math.abs(row.balance - (previous + sense * effect)) >= EPSILON) breaks++;
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
