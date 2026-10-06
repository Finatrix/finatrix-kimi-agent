/**
 * Recognised text from a screenshot of a payment list → statement rows.
 *
 * `parseTextStatement` reads bank statements, where every row begins with its
 * date and prints money to two decimals. A payments-app history (PhonePe,
 * Google Pay, a wallet's activity screen) does neither:
 *
 *     Paid to
 *     SWIGGY                       ₹450
 *     2 days ago · Debited from ••1234
 *
 * So this reader asks for much less — a line that ENDS in an amount, and some
 * words to call it — and treats the date as optional. A row with no readable
 * date is still returned, with `date: null`; the review sheet marks it "No date
 * found" and the person supplies one. That is the honest outcome: "2 days ago"
 * is relative to when the screenshot was taken, which this code cannot know, so
 * relative dates are deliberately left blank rather than guessed (a date that
 * is actually printed beside one — "Today, 3 Oct" — is still used).
 *
 * It is only ever a fallback for text recognised from an image, tried when the
 * statement parser found nothing. Every row it produces is `source: 'ocr'`,
 * which holds all of them back for confirmation — a misread digit here is a
 * wrong number in somebody's ledger.
 *
 * What stops a photo of anything at all turning into "transactions": an amount
 * must sit at the end of its line AND either carry a currency mark or be
 * printed to two decimals. A bare number is never money.
 */
import { sanitizeField } from '../../../lib/sanitize';
import { parseStatementDate } from './fields';
import { sniffStatementCurrency } from './statement';
import type { StatementDoc, StatementRow } from './types';

const CURRENCY = '(?:₹|rs\\.?|inr|a\\$|us\\$|s\\$|\\$|£|€|aed)';
/** An amount closing the line: `₹450`, `- ₹1,200.50`, `Rs. 99`, `1,499.00`. */
const AMOUNT_END_RE = new RegExp(
  `(?:^|\\s)([+\\-−–]?)\\s*(?:${CURRENCY}\\s*(\\d[\\d,]*(?:\\.\\d{1,2})?)|(\\d[\\d,]*\\.\\d{2}))\\s*$`,
  'i',
);

const DEBIT_LABEL_RE = /^(?:paid\s+to|sent\s+to|payment\s+to|pay(?:ment)?\s+made\s+to|transfer(?:red)?\s+to|money\s+sent\s+to|bill\s+paid(?:\s+(?:to|for))?|recharge(?:d)?(?:\s+(?:of|for))?)\b[\s:-]*/i;
const CREDIT_LABEL_RE = /^(?:received\s+from|money\s+received\s+from|credited\s+(?:by|from)|refund(?:ed)?\s+(?:from|by)|cashback(?:\s+from)?)\b[\s:-]*/i;
const DEBIT_HINT_RE = /\bdebited\b/i;
const CREDIT_HINT_RE = /\bcredited\b/i;

/** Screen furniture that is never a payee. */
const NOISE_RE = /^(?:history|transaction\s+history|transactions?|search(?:\s+transactions)?|filters?|all|today|yesterday|this\s+month|last\s+month|upi(?:\s+lite)?|see\s+all|view\s+all|help|home|[\d:.\s%]+(?:am|pm)?|\W+)$/i;
const RELATIVE_DATE_RE = /\b(?:today|yesterday|just\s+now|\d+\s+(?:min(?:ute)?s?|h(?:ou)?rs?|days?|weeks?|months?)\s+ago)\b/i;

const FULL_DATE_RE = /\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}\.?,?\s+\d{2,4}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})\b/;
/** `03 Oct` / `Oct 3` with no year — common for payments earlier in the same year. */
const DAY_MONTH_ONLY_RE = /\b(?:(\d{1,2})\s+([A-Za-z]{3,9})|([A-Za-z]{3,9})\s+(\d{1,2}))\b(?!\s*[,.]?\s*\d{2,4})/;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * A date printed on the line, or null. A date with no year is read as its most
 * recent occurrence on or before `now` — a payment history never lists the
 * future.
 */
export function dateOnLine(line: string, now: Date): string | null {
  const full = FULL_DATE_RE.exec(line);
  if (full) return parseStatementDate(full[1].replace(',', ''), 'dmy', now);
  const partial = DAY_MONTH_ONLY_RE.exec(line);
  if (!partial) return null;
  const day = Number(partial[1] ?? partial[4]);
  const month = MONTHS.indexOf((partial[2] ?? partial[3]).toLowerCase().slice(0, 3));
  if (month < 0 || day < 1 || day > 31) return null;
  let year = now.getFullYear();
  if (new Date(year, month, day).getTime() > now.getTime()) year -= 1;
  const probe = new Date(year, month, day);
  if (probe.getMonth() !== month || probe.getDate() !== day) return null;
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function toAmount(digits: string): number | null {
  const value = Number(digits.replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 && value < 1e9 ? value : null;
}

type Direction = StatementRow['direction'];

export function parseLooseList(text: string, now: Date = new Date()): StatementDoc {
  const rows: StatementRow[] = [];
  /** A "Paid to" / "Received from" seen on its own line, waiting for its row. */
  let pendingDirection: Direction = null;
  /** A plain line that may be the payee of the amount on the next line. */
  let pendingName: { text: string; line: number } | null = null;
  /** The newest row, and the line it sits on, for the lines that follow it. */
  let last: { row: StatementRow; line: number } | null = null;

  const stripLabel = (value: string): { rest: string; direction: Direction } => {
    if (DEBIT_LABEL_RE.test(value)) return { rest: value.replace(DEBIT_LABEL_RE, '').trim(), direction: 'debit' };
    if (CREDIT_LABEL_RE.test(value)) return { rest: value.replace(CREDIT_LABEL_RE, '').trim(), direction: 'credit' };
    return { rest: value, direction: null };
  };

  text.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const lineNo = index + 1;
    const amountMatch = AMOUNT_END_RE.exec(line);

    if (amountMatch) {
      const amount = toAmount(amountMatch[2] ?? amountMatch[3]);
      if (amount === null) return;
      const { rest, direction: labelled } = stripLabel(line.slice(0, amountMatch.index).trim());
      const sign: Direction = amountMatch[1] === '+' ? 'credit' : amountMatch[1] ? 'debit' : null;
      let description = NOISE_RE.test(rest) ? '' : rest;
      // The payee was on the line above ("SWIGGY" then "₹450").
      if (!description && pendingName && lineNo - pendingName.line <= 2) description = pendingName.text;
      const row: StatementRow = {
        line: lineNo,
        date: dateOnLine(rest, now),
        postedDate: null,
        description: sanitizeField(description, 300),
        amount,
        direction: labelled ?? pendingDirection ?? sign,
        balance: null,
        reference: null,
        currency: null,
      };
      rows.push(row);
      last = { row, line: lineNo };
      pendingDirection = null;
      pendingName = null;
      return;
    }

    const { rest, direction } = stripLabel(line);
    if (direction) {
      pendingDirection = direction;
      pendingName = rest && !NOISE_RE.test(rest) ? { text: rest, line: lineNo } : null;
      return;
    }

    // Lines under a row: its date, which account it moved through, or — when
    // the amount sat beside the label — its payee.
    if (last && lineNo - last.line <= 3) {
      const row = last.row;
      const date = dateOnLine(line, now);
      const isDateLine = date !== null || RELATIVE_DATE_RE.test(line);
      if (date && !row.date) row.date = date;
      if (!row.direction) {
        if (DEBIT_HINT_RE.test(line)) row.direction = 'debit';
        else if (CREDIT_HINT_RE.test(line)) row.direction = 'credit';
      }
      if (isDateLine || DEBIT_HINT_RE.test(line) || CREDIT_HINT_RE.test(line)) return;
      if (!row.description && !NOISE_RE.test(line)) {
        row.description = sanitizeField(line, 300);
        return;
      }
    }

    if (!NOISE_RE.test(line) && line.length > 1) pendingName = { text: line, line: lineNo };
  });

  return {
    source: 'ocr',
    rows,
    currency: sniffStatementCurrency(text),
    openingBalance: null,
    closingBalance: null,
    skipped: 0,
    dateOrder: 'dmy',
    dateOrderAssumed: true,
  };
}
