/**
 * CSV / TSV bank exports → statement rows.
 *
 * Banks agree on almost nothing. The same month of spending arrives as
 * `Date,Narration,Withdrawal Amt.,Deposit Amt.,Closing Balance` from one, as
 * `Transaction Date,Details,Amount,Balance` from another, semicolon-separated
 * from a third, and all three bury the header under six lines of account
 * preamble. So this module does three things in order: find the delimiter, find
 * the header, and map that header onto the fields the importer needs.
 *
 * Everything here is deterministic. Where a file cannot be understood the
 * failure is explicit and names what was looked for — a parser that guesses at
 * the shape of a bank statement will eventually guess a column of balances into
 * a column of amounts, and the user has no way to notice.
 *
 * The tokenizer is RFC 4180: quoted fields, doubled quotes, embedded newlines.
 * It is written here rather than pulled in because `src/lib/csv.ts` is the
 * *writer* — one direction each, no dependency, no third-party parser.
 */

import { sanitizeField } from '../../../lib/sanitize';
import { parseAmount, parseBalance, parseStatementDate, detectDateOrder } from './fields';
import type { DateOrder, SourceKind, StatementDoc, StatementRow } from './types';

/** How far into the file we will look for a header row. */
const MAX_PREAMBLE_LINES = 30;

/**
 * Rows one import will read. The same ceiling the spreadsheet reader applies,
 * and for the same reason: far above any personal statement, and a file over
 * it is refused rather than read in part — a ledger must never be handed "the
 * first 20,000 rows" as though that were the statement.
 */
export const MAX_STATEMENT_ROWS = 20_000;
/** Delimiters worth trying, most likely first. */
const DELIMITERS = [',', ';', '\t', '|'] as const;

export class StatementParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StatementParseError';
  }
}

/* ════════════════════════════════════════════════════════════════════════
   Tokenizing
   ════════════════════════════════════════════════════════════════════════ */

/** Split delimited text into a matrix, honouring quotes and embedded newlines. */
export function tokenize(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') { quoted = true; continue; }
    if (ch === delimiter) { row.push(cell); cell = ''; continue; }
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    if (ch === '\r') continue;
    cell += ch;
  }
  row.push(cell);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

/**
 * Pick the delimiter by consistency, not frequency.
 *
 * The winner is the one producing the most stable column count across the first
 * lines. A description containing "Bengaluru, KA" makes commas *frequent* in a
 * semicolon-separated file; it does not make them *consistent*.
 */
export function detectDelimiter(text: string): string {
  const sample = text.split('\n').slice(0, 40).join('\n');
  let best = ',';
  let bestScore = -1;

  for (const d of DELIMITERS) {
    const rows = tokenize(sample, d).filter((r) => r.some((c) => c.trim() !== ''));
    if (rows.length < 2) continue;
    const counts = rows.map((r) => r.length);
    const max = Math.max(...counts);
    if (max < 2) continue;
    const agreeing = counts.filter((c) => c === max).length;
    const score = agreeing / counts.length * 10 + Math.min(max, 12);
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

/* ════════════════════════════════════════════════════════════════════════
   Header mapping
   ════════════════════════════════════════════════════════════════════════ */

/** Header text reduced to comparable letters. */
function normHeader(h: string): string {
  return (h || '').toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Header synonyms, by field.
 *
 * Matched as substrings of the normalised header, longest pattern first, so
 * `transactiondate` is read as a date rather than being caught by a looser rule.
 * Ordering within a field matters for the same reason.
 */
const HEADER_PATTERNS: Record<string, readonly string[]> = {
  postedDate: ['postingdate', 'postdate', 'valuedate', 'processdate', 'settlementdate'],
  date: ['transactiondate', 'txndate', 'trandate', 'dateoftransaction', 'bookingdate', 'date'],
  description: ['transactiondetails', 'transactiondescription', 'narration', 'particulars',
    'description', 'details', 'remarks', 'payee', 'merchant', 'transactionremarks'],
  debit: ['withdrawalamt', 'withdrawalamount', 'withdrawal', 'debitamount', 'amountdebited',
    'paidout', 'moneyout', 'debit', 'dr'],
  credit: ['depositamt', 'depositamount', 'deposit', 'creditamount', 'amountcredited',
    'paidin', 'moneyin', 'credit', 'cr'],
  amount: ['transactionamount', 'amountinr', 'amount', 'amt', 'value'],
  balance: ['closingbalance', 'runningbalance', 'availablebalance', 'balanceamt', 'balance'],
  reference: ['referencenumber', 'referenceno', 'chequenumber', 'chequeno', 'chqno',
    'transactionid', 'refno', 'utrno', 'utr', 'reference'],
  currency: ['currencycode', 'currency', 'ccy'],
};

export interface ColumnMap {
  date: number;
  postedDate: number;
  description: number[];
  debit: number;
  credit: number;
  amount: number;
  balance: number;
  reference: number;
  currency: number;
}

const EMPTY_MAP: ColumnMap = {
  date: -1, postedDate: -1, description: [], debit: -1, credit: -1,
  amount: -1, balance: -1, reference: -1, currency: -1,
};

/**
 * Map a candidate header row onto fields.
 *
 * A column is claimed by at most one field, first-come. `balance` is matched
 * before `amount` because "Balance Amount" contains both words and is never the
 * transaction amount.
 */
export function mapColumns(headers: readonly string[]): ColumnMap {
  const norm = headers.map(normHeader);
  const taken = new Set<number>();
  const map: ColumnMap = { ...EMPTY_MAP, description: [] };

  /**
   * A two-letter alias must match the whole header, never a fragment of one.
   *
   * "Description" contains "cr", and matching it as a substring made the credit
   * column claim the narration on any statement whose header said "Description"
   * — which then took the amount column with it. Short aliases are real ("Dr",
   * "Cr" are printed as column headers), so the fix is to require exactness of
   * them rather than to drop them.
   */
  const matches = (header: string, pattern: string): boolean =>
    pattern.length <= 2 ? header === pattern : header.includes(pattern);

  const claim = (field: keyof ColumnMap): void => {
    for (const pattern of HEADER_PATTERNS[field]) {
      for (let i = 0; i < norm.length; i++) {
        if (taken.has(i) || !norm[i]) continue;
        if (!matches(norm[i], pattern)) continue;
        taken.add(i);
        if (field === 'description') map.description.push(i);
        else (map[field] as number) = i;
        return;
      }
    }
  };

  // Order is significant: the most specific field names go first so a loose
  // pattern cannot steal a column a precise one needed.
  claim('postedDate');
  claim('date');
  claim('balance');
  claim('debit');
  claim('credit');
  claim('amount');
  claim('reference');
  claim('currency');
  claim('description');

  // A second description-ish column ("Narration" plus "Remarks") is appended
  // rather than dropped: banks split the payee across both.
  for (let i = 0; i < norm.length; i++) {
    if (taken.has(i) || !norm[i]) continue;
    if (HEADER_PATTERNS.description.some((p) => matches(norm[i], p))) {
      taken.add(i);
      map.description.push(i);
    }
  }

  return map;
}

/** True when a mapping can actually produce transactions. */
export function isUsable(map: ColumnMap): boolean {
  const hasAmount = map.amount >= 0 || map.debit >= 0 || map.credit >= 0;
  return map.date >= 0 && hasAmount;
}

/* ════════════════════════════════════════════════════════════════════════
   Parsing
   ════════════════════════════════════════════════════════════════════════ */

/** Rows that summarise rather than record. Never imported; may carry balances. */
const SUMMARY_RE = /^(?:opening|closing|total|grand\s*total|sub\s*total|statement|balance\s*(?:b\/f|c\/f)|b\/f|c\/f)\b/i;

/** Currency codes and symbols we can name from a header or preamble. */
const CURRENCY_HINTS: ReadonlyArray<[RegExp, string]> = [
  [/\b(?:inr|rs\.?|₹)\b/i, 'INR'], [/\baud\b|\ba\$/i, 'AUD'], [/\busd\b|\bus\$/i, 'USD'],
  [/\bgbp\b|£/i, 'GBP'], [/\beur\b|€/i, 'EUR'], [/\bsgd\b/i, 'SGD'], [/\baed\b/i, 'AED'],
  [/\bcad\b/i, 'CAD'], [/\bjpy\b|¥/i, 'JPY'],
];

function sniffCurrency(text: string): string | null {
  for (const [re, code] of CURRENCY_HINTS) if (re.test(text)) return code;
  return null;
}

/**
 * Parse a delimited bank export.
 *
 * Throws `StatementParseError` with an actionable message when the file has no
 * header this importer can read — the one case where guessing would silently
 * produce a plausible, wrong ledger.
 */
export function parseCsvStatement(text: string, now: Date = new Date()): StatementDoc {
  const delimiter = detectDelimiter(text);
  return parseStatementMatrix(tokenize(text, delimiter), now, 'csv');
}

/**
 * The same parse, from a grid that is already a grid.
 *
 * A spreadsheet arrives as rows of cells, not as delimited text, and round-
 * tripping it through CSV to reuse this logic would mean re-quoting every cell
 * — a cell containing a comma, a quote or a newline is where that goes wrong,
 * and a bank's own export is full of all three. So the tokenizer is skipped and
 * everything after it is shared: one set of column-mapping rules, one set of
 * date-order rules, one set of tests, and no way for a statement to be read
 * differently depending on which format it was saved in.
 */
export function parseStatementMatrix(
  matrix: string[][],
  now: Date = new Date(),
  source: SourceKind = 'csv',
): StatementDoc {
  if (matrix.length > MAX_STATEMENT_ROWS + MAX_PREAMBLE_LINES) {
    throw new StatementParseError(
      `This statement has more than ${MAX_STATEMENT_ROWS.toLocaleString('en')} rows. Please download a shorter date range from your bank.`,
    );
  }

  let headerAt = -1;
  let map: ColumnMap = EMPTY_MAP;
  for (let i = 0; i < Math.min(matrix.length, MAX_PREAMBLE_LINES); i++) {
    const candidate = mapColumns(matrix[i]);
    if (isUsable(candidate)) { headerAt = i; map = candidate; break; }
  }
  // No header row. Some banks export exactly that, so the columns are worked
  // out from what is in them — but only where the file itself settles it (see
  // `inferColumns`). Anything short of that is still refused.
  let columnsInferred = false;
  if (headerAt < 0) {
    const inferred = inferColumns(matrix);
    if (!inferred) {
      throw new StatementParseError(
        'We could not find a header row in this file. It needs a date column and either an amount column or separate debit/credit columns.'
      );
    }
    map = inferred;
    columnsInferred = true;
  }

  const preamble = headerAt > 0 ? matrix.slice(0, headerAt).flat().join(' ') : '';
  const headerText = headerAt >= 0 ? matrix[headerAt].join(' ') : '';

  const body = matrix.slice(headerAt + 1);
  const cell = (row: string[], idx: number): string => (idx >= 0 && idx < row.length ? (row[idx] ?? '').trim() : '');

  // Date order is a property of the file, so it is settled across every row
  // before any single row is parsed.
  const dateSamples = body.map((r) => cell(r, map.date)).filter(Boolean);
  const detected = detectDateOrder(dateSamples);
  const dateOrder: DateOrder = detected ?? 'dmy';

  // How a bare sign is to be read, settled across the whole column first.
  //
  // A column holding both negative and positive amounts is using the sign to
  // say which way the money went — but not every export agrees which sign is
  // which: a bank prints spending as negative, some card exports print it as
  // positive and the repayments as negative. Reading negative as "spent" and
  // leaving positives to default to "spent" as well made every deposit in a
  // bank export an expense. The side with more rows is the spending, because
  // that is what a statement mostly is; a tie keeps the bank convention. This
  // is only ever a reading, never a statement: the balance column overrules it
  // wherever there is one, and the review sheet offers to swap it.
  let negatives = 0;
  let positives = 0;
  if (map.amount >= 0) {
    for (const raw of body) {
      const debit = map.debit >= 0 ? parseAmount(cell(raw, map.debit)) : null;
      const credit = map.credit >= 0 ? parseAmount(cell(raw, map.credit)) : null;
      if ((debit && debit.value > 0) || (credit && credit.value > 0)) continue;
      const single = parseAmount(cell(raw, map.amount));
      if (!single || single.marker || single.value === 0) continue;
      if (single.negative) negatives++;
      else positives++;
    }
  }
  const signedColumn = negatives > 0 && positives > 0;
  const spendingIsNegative = negatives >= positives;

  const rows: StatementRow[] = [];
  let skipped = 0;
  let openingBalance: number | null = null;
  let closingBalance: number | null = null;

  body.forEach((raw, i) => {
    const line = headerAt + 2 + i; // 1-based, counting the header
    if (!raw.some((c) => (c ?? '').trim() !== '')) return; // blank line, not a failure

    const description = map.description
      .map((idx) => cell(raw, idx))
      .filter(Boolean)
      .join(' — ');

    const balance = parseBalance(cell(raw, map.balance));

    // Summary lines carry the statement's own balances, which the reconciler
    // needs, but are not transactions.
    if (SUMMARY_RE.test(description) || SUMMARY_RE.test(cell(raw, 0))) {
      const text = `${cell(raw, 0)} ${description}`;
      const value = balance ?? parseBalance(cell(raw, map.amount));
      if (value !== null) {
        if (/opening|b\/f/i.test(text)) openingBalance = value;
        else if (/closing|c\/f/i.test(text)) closingBalance = value;
      }
      return;
    }

    const date = parseStatementDate(cell(raw, map.date), dateOrder, now);
    const postedDate = map.postedDate >= 0
      ? parseStatementDate(cell(raw, map.postedDate), dateOrder, now)
      : null;

    const debit = map.debit >= 0 ? parseAmount(cell(raw, map.debit)) : null;
    const credit = map.credit >= 0 ? parseAmount(cell(raw, map.credit)) : null;
    const single = map.amount >= 0 ? parseAmount(cell(raw, map.amount)) : null;

    let amount: number | null = null;
    let direction: StatementRow['direction'] = null;
    // Whether the bank said which way the money moved, or we read it off a sign.
    let directionStated = false;

    if (debit && debit.value > 0) {
      amount = debit.value;
      direction = 'debit';
      directionStated = true;
    } else if (credit && credit.value > 0) {
      amount = credit.value;
      direction = 'credit';
      directionStated = true;
    } else if (single) {
      amount = single.value;
      // An explicit Dr/Cr marker is the bank stating the direction outright and
      // outranks sign. Otherwise the sign is only a hint — `resolveDirections`
      // settles it against the balance column, which cannot be misread.
      if (single.marker === 'dr') { direction = 'debit'; directionStated = true; }
      else if (single.marker === 'cr') { direction = 'credit'; directionStated = true; }
      else if (signedColumn) direction = single.negative === spendingIsNegative ? 'debit' : 'credit';
      else if (single.negative) direction = 'debit';
      else direction = null;
    }

    if (date === null && amount === null) { skipped++; return; }

    rows.push({
      line,
      date,
      postedDate: postedDate && postedDate !== date ? postedDate : null,
      description: sanitizeField(description || cell(raw, 0), 300),
      amount,
      direction,
      ...(directionStated ? { directionStated } : null),
      balance,
      reference: map.reference >= 0 ? (cell(raw, map.reference) || null) : null,
      currency: map.currency >= 0 ? (cell(raw, map.currency).toUpperCase() || null) : null,
    });
  });

  return {
    source,
    rows,
    currency: sniffCurrency(headerText) ?? sniffCurrency(preamble),
    openingBalance,
    closingBalance,
    skipped,
    dateOrder,
    dateOrderAssumed: detected === null,
    ...(columnsInferred ? { columnsInferred } : null),
  };
}

/* ════════════════════════════════════════════════════════════════════════
   Files with no header row
   ════════════════════════════════════════════════════════════════════════ */

/** A cell that is a date and nothing else. */
const DATE_LIKE_RE = /^(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[ -][A-Za-z]{3,9}[ -]\d{2,4})$/;

/** Share of a column's filled cells that must agree before it is called that kind. */
const COLUMN_AGREEMENT = 0.9;

/** Share of rows whose balance must step by their own amount to call a column the balance. */
const CHAIN_PROOF = 0.6;

/**
 * How many rows step `balanceCol` by exactly the figure in `amountCol`, in
 * whichever order the file lists them. This is the same evidence the reconciler
 * uses: a running balance is the one column whose steps ARE another column.
 */
function chainMatches(rows: string[][], amountCol: number, balanceCol: number): number {
  const amounts = rows.map((r) => parseAmount((r[amountCol] ?? '').trim())?.value ?? null);
  const balances = rows.map((r) => parseBalance((r[balanceCol] ?? '').trim()));
  let forward = 0;
  let backward = 0;
  for (let i = 0; i < rows.length; i++) {
    const amount = amounts[i];
    const balance = balances[i];
    if (amount === null || balance === null) continue;
    const above = i > 0 ? balances[i - 1] : null;
    const below = i < rows.length - 1 ? balances[i + 1] : null;
    if (above !== null && Math.abs(Math.abs(balance - above) - amount) < 0.005) forward++;
    if (below !== null && Math.abs(Math.abs(balance - below) - amount) < 0.005) backward++;
  }
  return Math.max(forward, backward);
}

/**
 * Work out the columns of a file that has no header row.
 *
 * Only two shapes are accepted, because only these can be read from evidence
 * rather than from a guess about what a bank probably meant:
 *
 *   date, description, amount            — one money column: it is the amount
 *   date, description, amount, balance   — two money columns, where one steps
 *                                          by the other row after row, which
 *                                          makes it the running balance
 *
 * in any column order. Two money columns that do not step that way (they might
 * be withdrawals and deposits, in either order), three or more money columns,
 * no date column, or no text column all return null, and the caller refuses the
 * file as before. The result is marked as inferred so the review sheet says so.
 */
export function inferColumns(matrix: string[][]): ColumnMap | null {
  const rows = matrix.filter((row) => row.some((c) => (c ?? '').trim() !== '')).slice(0, 400);
  if (!rows.length) return null;
  const width = Math.max(...rows.map((r) => r.length));

  const dates: number[] = [];
  const money: number[] = [];
  const text: Array<{ index: number; length: number }> = [];

  for (let c = 0; c < width; c++) {
    const cells = rows.map((r) => (r[c] ?? '').trim()).filter(Boolean);
    if (!cells.length) continue;
    const dateLike = cells.filter((v) => DATE_LIKE_RE.test(v)).length;
    const moneyLike = cells.filter((v) => !DATE_LIKE_RE.test(v) && parseAmount(v) !== null).length;
    if (dateLike / cells.length >= COLUMN_AGREEMENT) dates.push(c);
    else if (moneyLike / cells.length >= COLUMN_AGREEMENT) money.push(c);
    else text.push({ index: c, length: cells.reduce((sum, v) => sum + v.length, 0) / cells.length });
  }

  if (!dates.length || !text.length || money.length < 1 || money.length > 2) return null;

  let amount = money[0];
  let balance = -1;
  if (money.length === 2) {
    const needed = Math.max(1, Math.ceil((rows.length - 1) * CHAIN_PROOF));
    const firstIsAmount = chainMatches(rows, money[0], money[1]);
    const secondIsAmount = chainMatches(rows, money[1], money[0]);
    if (firstIsAmount >= needed && firstIsAmount > secondIsAmount) { amount = money[0]; balance = money[1]; }
    else if (secondIsAmount >= needed && secondIsAmount > firstIsAmount) { amount = money[1]; balance = money[0]; }
    else return null;
  }

  return {
    ...EMPTY_MAP,
    date: dates[0],
    postedDate: dates.length > 1 ? dates[1] : -1,
    // The widest text column is the description; codes and types are shorter.
    description: [text.sort((a, b) => b.length - a.length)[0].index],
    amount,
    balance,
  };
}
