/**
 * PDF statement text → statement rows.
 *
 * A PDF's text layer arrives as lines, not columns, so the structure has to be
 * recovered from what banks reliably do rather than from a grid:
 *
 *     14/08/2026  UPI/DR/4123…/SWIGGY/ICIC      450.00     12,340.50
 *     ↑ a date starts the row        amounts and the balance end it ↑
 *
 * Two properties hold across essentially every retail statement and are what
 * this parser leans on: a transaction row *begins* with its date, and the money
 * columns are the *last* things on the line. Anything between them is the
 * description, including whatever reference numbers the bank chose to print.
 *
 * Wrapped descriptions are the other reality — a long narration continues on the
 * next line with no date — so a dateless line is appended to the row above
 * rather than counted as a failure.
 *
 * Money is recognised by its two decimal places, not by position. That single
 * rule is what keeps a twelve-digit UPI reference inside the description from
 * being read as an amount.
 */

import { sanitizeField } from '../../../lib/sanitize';
import { parseAmount, parseStatementDate, detectDateOrder } from './fields';
import type { DateOrder, StatementDoc, StatementRow } from './types';

/** A date at the very start of a line — the marker for "a new row begins here". */
const LEADING_DATE_RE =
  /^\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-\s][A-Za-z]{3,9}[-\s]\d{2,4})\b/;

/**
 * A money token: digits with grouping and exactly two decimals, optionally
 * signed, bracketed, or suffixed Dr/Cr.
 *
 * The two-decimal requirement is deliberate and load-bearing. Statements print
 * money to the paisa/cent; reference numbers, invoice ids and phone numbers do
 * not. Dropping it would make every long digit run a candidate amount.
 *
 * Whitespace is excluded from the token in two places, both for the same
 * reason: on a printed line, whitespace is what separates one column from the
 * next. Allowing it inside the digit run let one token span the gap between the
 * amount and the balance (`450.00     9,550.00` matched once, as
 * "450.00     9,550" plus ".00"), and allowing it *after* the digits meant the
 * first match consumed the separator the next match needed to start on — so a
 * row with two money columns reported one.
 */
const MONEY_RE = /(?:^|\s)(\(?-?\s*(?:₹|rs\.?|\$|£|€)?\s*\d[\d,]*\.\d{2}\)?-?(?:\s*(?:DR|CR)\b\.?)?)/gi;

/** Statement furniture that is never a transaction. */
const NOISE_RE =
  /^\s*(?:page\s*\d|statement\s+of|account\s+(?:no|number|name|type)|customer\s+(?:id|name)|branch|ifsc|micr|address|generated\s+on|this\s+is\s+a\s+computer|continued|date\s+.*(?:narration|particulars|description))/i;

/** Lines that state a balance rather than record a movement. */
const OPENING_RE = /\b(?:opening\s+balance|balance\s+b\/f|b\/f)\b/i;
const CLOSING_RE = /\b(?:closing\s+balance|balance\s+c\/f|c\/f)\b/i;

interface MoneyToken {
  text: string;
  value: number;
  negative: boolean;
  marker: 'dr' | 'cr' | null;
  /** Index in the line, so tokens can be removed from the description. */
  at: number;
}

/** Every money-shaped token on a line, in order. */
function moneyTokens(line: string): MoneyToken[] {
  const out: MoneyToken[] = [];
  MONEY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MONEY_RE.exec(line)) !== null) {
    const text = m[1];
    const parsed = parseAmount(text);
    if (parsed) out.push({ text, value: parsed.value, negative: parsed.negative, marker: parsed.marker, at: m.index });
  }
  return out;
}

/**
 * Parse the text layer of a PDF statement.
 *
 * Never throws for content reasons: a page of prose simply yields no rows, and
 * the caller reports "no transactions found" with the page count, which is more
 * useful than an exception.
 */
export function parseTextStatement(text: string, now: Date = new Date()): StatementDoc {
  const lines = text.split('\n').map((l) => l.replace(/\s+$/, ''));

  // Date order is settled over the whole document first, exactly as for CSV.
  const dateSamples: string[] = [];
  for (const line of lines) {
    const m = LEADING_DATE_RE.exec(line);
    if (m) dateSamples.push(m[1]);
  }
  const detected = detectDateOrder(dateSamples);
  const dateOrder: DateOrder = detected ?? 'dmy';

  const rows: StatementRow[] = [];
  let openingBalance: number | null = null;
  let closingBalance: number | null = null;
  let skipped = 0;

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (OPENING_RE.test(trimmed) || CLOSING_RE.test(trimmed)) {
      const tokens = moneyTokens(line);
      const value = tokens.length ? tokens[tokens.length - 1].value : null;
      if (value !== null) {
        if (OPENING_RE.test(trimmed)) openingBalance = value;
        else closingBalance = value;
      }
      return;
    }

    const dateMatch = LEADING_DATE_RE.exec(line);
    if (!dateMatch) {
      // A continuation of the description above, provided we are inside a row
      // and the line is not statement furniture.
      const last = rows[rows.length - 1];
      if (last && !NOISE_RE.test(trimmed) && !moneyTokens(line).length && trimmed.length > 2) {
        last.description = sanitizeField(`${last.description} ${trimmed}`, 300);
      }
      return;
    }

    if (NOISE_RE.test(trimmed)) return;

    const date = parseStatementDate(dateMatch[1], dateOrder, now);
    const tokens = moneyTokens(line);
    if (!tokens.length) { skipped++; return; }

    // Last token is the running balance when the bank prints one, which it does
    // whenever there are two or more money columns on the row.
    const hasBalance = tokens.length >= 2;
    const balanceToken = hasBalance ? tokens[tokens.length - 1] : null;
    const amountToken = hasBalance ? tokens[tokens.length - 2] : tokens[0];

    const descStart = dateMatch[0].length;
    const descEnd = tokens[hasBalance ? tokens.length - 2 : 0].at;
    const description = sanitizeField(line.slice(descStart, Math.max(descStart, descEnd)), 300);

    let direction: StatementRow['direction'] = null;
    if (amountToken.marker === 'dr') direction = 'debit';
    else if (amountToken.marker === 'cr') direction = 'credit';
    else if (amountToken.negative) direction = 'debit';

    rows.push({
      line: i + 1,
      date,
      postedDate: null,
      description,
      amount: amountToken.value,
      direction,
      balance: balanceToken ? balanceToken.value : null,
      reference: null,
      currency: null,
    });
  });

  return {
    source: 'pdf-text',
    rows,
    currency: sniffStatementCurrency(text),
    openingBalance,
    closingBalance,
    skipped,
    dateOrder,
    dateOrderAssumed: detected === null,
  };
}

const CURRENCY_HINTS: ReadonlyArray<[RegExp, string]> = [
  [/₹|\bINR\b|\bRs\.?\s?\d/i, 'INR'], [/\bAUD\b|\bA\$/i, 'AUD'], [/\bUSD\b|\bUS\$/i, 'USD'],
  [/\bGBP\b|£/, 'GBP'], [/\bEUR\b|€/, 'EUR'], [/\bSGD\b/i, 'SGD'], [/\bAED\b/i, 'AED'],
];

function sniffStatementCurrency(text: string): string | null {
  const head = text.slice(0, 4_000);
  for (const [re, code] of CURRENCY_HINTS) if (re.test(head)) return code;
  return null;
}
