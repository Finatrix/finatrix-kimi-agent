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
/**
 * What a list row ends with after its amount, once recognised: the disclosure
 * chevron (`>`), and the specks a recogniser makes of icons and row borders.
 */
const TRAILING_JUNK_RE = /[\s>›»‹<|,;:.·•)\]]+$/;
/** A line that is nothing but a date — a section heading in most apps. */
const DATE_ONLY_RE = /^(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+)?(?:\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\.?(?:,?\s+\d{2,4})?|[A-Za-z]{3,9}\.?\s+\d{1,2}(?:,?\s+\d{4})?)$/i;

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

/** A line with the specks after its last real character removed. */
function tidy(raw: string): string {
  return raw.trim().replace(TRAILING_JUNK_RE, '');
}

/** Bank descriptors are printed in capitals; screen copy is not. */
function shouty(text: string): boolean {
  return /[A-Z]/.test(text) && !/[a-z]/.test(text);
}

interface AmountHit { value: number; sign: Direction; before: string }

/** The amount that closes a line, and the text before it. */
function amountAtEnd(line: string): AmountHit | null {
  const match = AMOUNT_END_RE.exec(line);
  if (!match) return null;
  const value = toAmount(match[2] ?? match[3]);
  if (value === null) return null;
  return {
    value,
    sign: match[1] === '+' ? 'credit' : match[1] ? 'debit' : null,
    before: line.slice(0, match.index).trim(),
  };
}

function stripLabel(value: string): { rest: string; direction: Direction } {
  if (DEBIT_LABEL_RE.test(value)) return { rest: value.replace(DEBIT_LABEL_RE, '').trim(), direction: 'debit' };
  if (CREDIT_LABEL_RE.test(value)) return { rest: value.replace(CREDIT_LABEL_RE, '').trim(), direction: 'credit' };
  return { rest: value, direction: null };
}

function isDateOnly(line: string, now: Date): boolean {
  return DATE_ONLY_RE.test(line) && dateOnLine(line, now) !== null;
}

function emptyDoc(text: string, rows: StatementRow[]): StatementDoc {
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

export function parseLooseList(text: string, now: Date = new Date()): StatementDoc {
  const lines = text.split('\n').map(tidy);

  // Is a date standing alone a HEADING for the rows under it (a card app's
  // "4 Oct" above that day's purchases) or the date OF the row above it? A lone
  // date is nearly always a heading; it is read as trailing only when the list
  // visibly ends on one and does not begin with one.
  const amountLines = lines.map((line, i) => (amountAtEnd(line) ? i : -1)).filter((i) => i >= 0);
  const dateOnlyLines = lines.map((line, i) => (isDateOnly(line, now) ? i : -1)).filter((i) => i >= 0);
  const firstAmount = amountLines[0] ?? -1;
  const lastAmount = amountLines[amountLines.length - 1] ?? -1;
  const datesTrail = dateOnlyLines.some((i) => i > lastAmount) && !dateOnlyLines.some((i) => i < firstAmount);

  const rows: StatementRow[] = [];
  /** A "Paid to" / "Received from" seen on its own line, waiting for its row. */
  let pendingDirection: Direction = null;
  /** A plain line that may be the payee of the amount on the next line. */
  let pendingName: { text: string; line: number; underRow?: boolean } | null = null;
  /** The newest row, and the line it sits on, for the lines that follow it. */
  let last: { row: StatementRow; line: number } | null = null;
  /** The date heading currently in force. */
  let headingDate: string | null = null;

  lines.forEach((line, index) => {
    if (!line) return;
    const lineNo = index + 1;
    const hit = amountAtEnd(line);

    if (hit) {
      const { rest, direction: labelled } = stripLabel(hit.before);
      let description = NOISE_RE.test(rest) ? '' : rest;
      if (pendingName) {
        // The payee was on the line above ("SWIGGY" then "₹450"), or its first
        // half was ("WOOLWORTHS" then "3304 MELBOURNE  $6.00").
        if (!description && lineNo - pendingName.line <= 2) description = pendingName.text;
        else if (lineNo - pendingName.line === 1 && !pendingName.underRow && shouty(description) && shouty(pendingName.text)) {
          description = `${pendingName.text} ${description}`;
        }
      }
      const row: StatementRow = {
        line: lineNo,
        date: dateOnLine(rest, now) ?? headingDate,
        postedDate: null,
        description: sanitizeField(description, 300),
        amount: hit.value,
        direction: labelled ?? pendingDirection ?? hit.sign,
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

    if (isDateOnly(line, now)) {
      const date = dateOnLine(line, now);
      if (datesTrail) {
        if (last && !last.row.date && lineNo - last.line <= 3) last.row.date = date;
      } else {
        headingDate = date;
      }
      pendingName = null;
      return;
    }

    const { rest, direction } = stripLabel(line);
    if (direction) {
      pendingDirection = direction;
      pendingName = rest && !NOISE_RE.test(rest) ? { text: rest, line: lineNo } : null;
      return;
    }

    // Lines under a row: its date, which account it moved through, its payee
    // when the amount sat beside the label, or the second half of its name.
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
      if (lineNo - last.line === 1 && shouty(line) && shouty(row.description) && !NOISE_RE.test(line)) {
        row.description = sanitizeField(`${row.description} ${line}`, 300);
        last = { row, line: lineNo };
        return;
      }
      // Directly under a finished row and not part of it. It may name an
      // amount standing alone on the next line, but it is never the first half
      // of a name that continues beside the next amount.
      if (lineNo - last.line === 1) {
        if (!NOISE_RE.test(line) && line.length > 1) pendingName = { text: line, line: lineNo, underRow: true };
        return;
      }
    }

    if (!NOISE_RE.test(line) && line.length > 1) pendingName = { text: line, line: lineNo };
  });

  return emptyDoc(text, rows);
}

/* ── The assisted route ─────────────────────────────────────────────────── */

/**
 * One transaction as a layout reader describes it: WHICH LINES, never what
 * they say. Every index is 0-based into the lines that were sent.
 */
export interface LayoutItem {
  amount: number;
  name: number[];
  date: number | null;
  direction: Direction;
}

/** Lines sent to a layout reader, and how long each may be. */
export const LAYOUT_MAX_LINES = 160;
const LAYOUT_MAX_CHARS = 120;

/**
 * The recognised lines with every digit hidden.
 *
 * A layout reader needs the SHAPE of the page — `$#.##` is an amount, `# Oct`
 * a date — and nothing else. Hiding the digits means no amount, date, balance,
 * card number or reference is ever in what is sent; the figures are read here,
 * from the original lines, by `rowsFromLayout`.
 */
export function maskedLines(text: string): string[] {
  return text.split('\n').slice(0, LAYOUT_MAX_LINES)
    .map((line) => sanitizeField(tidy(line), LAYOUT_MAX_CHARS).replace(/\d/g, '#'));
}

/**
 * Build rows from a layout reader's answer.
 *
 * The reader chooses lines; this reads them. An item is dropped unless its
 * amount line really does carry an amount, and a description or date can only
 * be text that is on the lines it pointed at — so a reader that is wrong,
 * confused or steered by a hostile merchant name can mis-group rows the person
 * is about to review, and cannot put a figure or a word into the ledger that
 * was not in their own screenshot.
 */
export function rowsFromLayout(text: string, items: readonly LayoutItem[], now: Date = new Date()): StatementDoc {
  const lines = text.split('\n').slice(0, LAYOUT_MAX_LINES).map(tidy);
  const inRange = (i: unknown): i is number => typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < lines.length;
  const used = new Set<number>();
  const rows: StatementRow[] = [];

  for (const item of items) {
    if (!inRange(item.amount) || used.has(item.amount)) continue;
    const hit = amountAtEnd(lines[item.amount]);
    if (!hit) continue;
    used.add(item.amount);

    const nameLines = (Array.isArray(item.name) ? item.name : [])
      .filter((i) => inRange(i) && Math.abs(i - item.amount) <= 3)
      .slice(0, 3)
      .sort((x, y) => x - y);
    const parts = nameLines.map((i) => {
      const own = i === item.amount ? hit.before : (amountAtEnd(lines[i])?.before ?? lines[i]);
      return stripLabel(own).rest;
    }).filter(Boolean);
    const labelled = stripLabel(hit.before).direction;
    const direction: Direction = item.direction === 'debit' || item.direction === 'credit'
      ? item.direction : labelled ?? hit.sign;

    rows.push({
      line: item.amount + 1,
      date: inRange(item.date) ? dateOnLine(lines[item.date], now) : dateOnLine(hit.before, now),
      postedDate: null,
      description: sanitizeField(parts.join(' '), 300),
      amount: hit.value,
      direction,
      balance: null,
      reference: null,
      currency: null,
    });
  }

  rows.sort((x, y) => x.line - y.line);
  return emptyDoc(text, rows);
}
