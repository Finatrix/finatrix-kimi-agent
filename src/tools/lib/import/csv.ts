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
import { parseAmount, parseStatementDate, detectDateOrder } from './fields';
import type { DateOrder, StatementDoc, StatementRow } from './types';

/** How far into the file we will look for a header row. */
const MAX_PREAMBLE_LINES = 30;
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
  const matrix = tokenize(text, delimiter);

  let headerAt = -1;
  let map: ColumnMap = EMPTY_MAP;
  for (let i = 0; i < Math.min(matrix.length, MAX_PREAMBLE_LINES); i++) {
    const candidate = mapColumns(matrix[i]);
    if (isUsable(candidate)) { headerAt = i; map = candidate; break; }
  }
  if (headerAt < 0) {
    throw new StatementParseError(
      'We could not find a header row in this file. It needs a date column and either an amount column or separate debit/credit columns.'
    );
  }

  const preamble = matrix.slice(0, headerAt).flat().join(' ');
  const headerText = matrix[headerAt].join(' ');

  const body = matrix.slice(headerAt + 1);
  const cell = (row: string[], idx: number): string => (idx >= 0 && idx < row.length ? (row[idx] ?? '').trim() : '');

  // Date order is a property of the file, so it is settled across every row
  // before any single row is parsed.
  const dateSamples = body.map((r) => cell(r, map.date)).filter(Boolean);
  const detected = detectDateOrder(dateSamples);
  const dateOrder: DateOrder = detected ?? 'dmy';

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

    const balance = parseAmount(cell(raw, map.balance))?.value ?? null;

    // Summary lines carry the statement's own balances, which the reconciler
    // needs, but are not transactions.
    if (SUMMARY_RE.test(description) || SUMMARY_RE.test(cell(raw, 0))) {
      const text = `${cell(raw, 0)} ${description}`;
      const value = balance ?? parseAmount(cell(raw, map.amount))?.value ?? null;
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

    if (debit && debit.value > 0) {
      amount = debit.value;
      direction = 'debit';
    } else if (credit && credit.value > 0) {
      amount = credit.value;
      direction = 'credit';
    } else if (single) {
      amount = single.value;
      // An explicit Dr/Cr marker is the bank stating the direction outright and
      // outranks sign. Otherwise the sign is only a hint — `resolveDirections`
      // settles it against the balance column, which cannot be misread.
      if (single.marker === 'dr') direction = 'debit';
      else if (single.marker === 'cr') direction = 'credit';
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
      balance,
      reference: map.reference >= 0 ? (cell(raw, map.reference) || null) : null,
      currency: map.currency >= 0 ? (cell(raw, map.currency).toUpperCase() || null) : null,
    });
  });

  return {
    source: 'csv',
    rows,
    currency: sniffCurrency(headerText) ?? sniffCurrency(preamble),
    openingBalance,
    closingBalance,
    skipped,
    dateOrder,
    dateOrderAssumed: detected === null,
  };
}
