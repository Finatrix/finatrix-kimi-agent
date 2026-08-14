/**
 * Reading a date and an amount out of a statement cell.
 *
 * These two functions are where "the parser owns every number" actually lives,
 * so they are pure, total, and tested directly. Anything they cannot read with
 * confidence returns null — a row with a null amount is surfaced to the user as
 * unreadable rather than guessed at, which is the whole point of the design.
 *
 * SEPARATORS
 * ----------
 * Statements in the markets FinatriX serves write money as `1,23,456.78` (Indian
 * grouping), `1,234.56` (US/UK/AU) or `1.234,56` (much of Europe). The decimal
 * separator is resolved from the shape of the string, not from a locale guess:
 *
 *   - both `.` and `,` present  → whichever comes last is the decimal point
 *   - repeated `,` only         → grouping (`1,23,456`)
 *   - one `,` with exactly two trailing digits → decimal (`1.234,56`, `12,50`)
 *   - one `,` otherwise         → grouping (`1,500`)
 *   - `.` only                  → decimal, unless repeated (`1.234.567`)
 *
 * The last rule is a deliberate bias toward dot-decimal: `1.234` is far more
 * likely to be a rupee/dollar amount with three decimals than European grouping
 * in a file that never once used a comma. It is the only judgement call here and
 * it is confined to one line.
 *
 * DATE ORDER
 * ----------
 * `03/04/2026` is 3 April or 4 March depending on who printed it, and no amount
 * of cleverness settles it from one row. `detectDateOrder` therefore looks at
 * the whole file: a single day-part above 12 anywhere in the statement settles
 * it for every row. When nothing settles it the caller is told so (rather than
 * quietly picking), and the review sheet offers the user the switch.
 */

import { ymdLocal } from '../../../lib/date';
import type { DateOrder } from './types';

/* ════════════════════════════════════════════════════════════════════════
   Amounts
   ════════════════════════════════════════════════════════════════════════ */

export interface ParsedAmount {
  /** Unsigned magnitude. */
  value: number;
  /** The cell carried a negative marker: `-123`, `123-`, or `(123)`. */
  negative: boolean;
  /** An explicit Dr/Cr suffix, which outranks column position when present. */
  marker: 'dr' | 'cr' | null;
}

/** Currency symbols and codes that may sit against an amount. */
const CURRENCY_NOISE = /(?:₹|rs\.?|inr|aud|a\$|usd|us\$|\$|gbp|£|eur|€|sgd|s\$|aed|cad|c\$|jpy|¥)/gi;

/** A trailing or leading Dr/Cr marker, the Indian statement convention. */
const DR_CR = /\b(dr|cr)\b\.?/i;

/**
 * Read one amount cell.
 *
 * Returns null for anything without digits — blanks, `-`, `—`, `N/A` — which is
 * how a debit/credit column pair reports "not this side". That null is
 * meaningful to the caller and must not be collapsed to zero.
 */
export function parseAmount(raw: string): ParsedAmount | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s) return null;

  const drCr = DR_CR.exec(s);
  const marker = drCr ? (drCr[1].toLowerCase() as 'dr' | 'cr') : null;
  s = s.replace(DR_CR, ' ');

  // Parentheses are the accounting negative and must be caught before the
  // brackets are stripped as noise.
  const parenthesised = /^\s*\(.*\)\s*$/.test(s);

  // Non-breaking and narrow no-break spaces are matched explicitly rather than
  // left as literals: both are used as thousands separators by real statement
  // exports, and both are invisible in source.
  s = s.replace(CURRENCY_NOISE, '').replace(/[()\s\u00A0\u202F']/g, '');

  const trailingMinus = /-$/.test(s);
  const leadingMinus = /^-/.test(s);
  s = s.replace(/^[+-]+/, '').replace(/[+-]+$/, '');

  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const value = toNumber(s);
  if (value === null) return null;

  return {
    value,
    negative: parenthesised || trailingMinus || leadingMinus,
    marker,
  };
}

/** Digits with `.`/`,` separators → a number, applying the rules above. */
function toNumber(s: string): number | null {
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;

  let decimalAt = -1;
  if (lastDot >= 0 && lastComma >= 0) {
    decimalAt = Math.max(lastDot, lastComma);
  } else if (commas > 0) {
    // One comma with exactly two trailing digits reads as a decimal point;
    // anything else is grouping.
    decimalAt = commas === 1 && /,\d{2}$/.test(s) ? lastComma : -1;
  } else if (dots > 0) {
    decimalAt = dots === 1 ? lastDot : -1;
  }

  const intPart = (decimalAt >= 0 ? s.slice(0, decimalAt) : s).replace(/[.,]/g, '');
  const fracPart = decimalAt >= 0 ? s.slice(decimalAt + 1).replace(/[.,]/g, '') : '';

  if (!intPart && !fracPart) return null;
  const n = Number(`${intPart || '0'}.${fracPart || '0'}`);
  return Number.isFinite(n) ? n : null;
}

/* ════════════════════════════════════════════════════════════════════════
   Dates
   ════════════════════════════════════════════════════════════════════════ */

const MONTH_ABBR: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** `2026-08-14` / `2026/08/14` — unambiguous by construction. */
const ISO_RE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/;
/** `14/08/2026`, `14-08-26`, `14.08.2026` — order decided by the document. */
const NUMERIC_RE = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/;
/** `14 Aug 2026`, `14-Aug-26`, `14 August 2026`. */
const DAY_MONTH_RE = /^(\d{1,2})[-\s/]([a-z]{3,9})\.?[-\s/](\d{2,4})$/i;
/** `Aug 14, 2026`, `August 14 2026`. */
const MONTH_DAY_RE = /^([a-z]{3,9})\.?[-\s/](\d{1,2}),?[-\s/](\d{2,4})$/i;

/**
 * Decide dd/mm vs mm/dd for a whole statement.
 *
 * Evidence beats preference: one row with a first component above 12 proves
 * day-first for the file, and one with a second component above 12 proves
 * month-first. When a statement offers neither (every date falls in the first
 * twelve days of its month) the answer is honestly `null` and the caller
 * records that it assumed.
 */
export function detectDateOrder(samples: readonly string[]): DateOrder | null {
  let dmy = 0;
  let mdy = 0;
  for (const s of samples) {
    const m = NUMERIC_RE.exec((s || '').trim());
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12 && b <= 12) dmy++;
    else if (b > 12 && a <= 12) mdy++;
  }
  if (dmy && !mdy) return 'dmy';
  if (mdy && !dmy) return 'mdy';
  // Contradictory evidence means the column is not a consistent date column;
  // day-first is the safer read for the markets this ships to, and the caller
  // still flags the rows.
  return null;
}

/**
 * Parse one date cell to a local `YYYY-MM-DD`, or null.
 *
 * Never constructs a `Date` from a string: `new Date('2026-08-14')` is UTC
 * midnight, which renders as the 13th for anyone west of Greenwich. Components
 * are validated and re-emitted directly, so the day that was printed is the day
 * that is stored — the rule `src/lib/date.ts` exists to enforce.
 */
export function parseStatementDate(
  raw: string,
  order: DateOrder,
  now: Date = new Date(),
): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return null;

  let y: number, mo: number, d: number;

  const iso = ISO_RE.exec(s);
  const num = iso ? null : NUMERIC_RE.exec(s);
  const dm = iso || num ? null : DAY_MONTH_RE.exec(s);
  const md = iso || num || dm ? null : MONTH_DAY_RE.exec(s);

  if (iso) {
    [y, mo, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (num) {
    const a = Number(num[1]);
    const b = Number(num[2]);
    // A component above 12 settles the row regardless of the document's order:
    // 25/12 is Christmas whichever way the rest of the file reads.
    if (a > 12) [d, mo] = [a, b];
    else if (b > 12) [d, mo] = [b, a];
    else [d, mo] = order === 'dmy' ? [a, b] : [b, a];
    y = expandYear(Number(num[3]), now);
  } else if (dm) {
    const m = MONTH_ABBR[dm[2].toLowerCase().slice(0, dm[2].length > 4 ? 4 : 3)]
      ?? MONTH_ABBR[dm[2].toLowerCase().slice(0, 3)];
    if (!m) return null;
    [d, mo, y] = [Number(dm[1]), m, expandYear(Number(dm[3]), now)];
  } else if (md) {
    const m = MONTH_ABBR[md[1].toLowerCase().slice(0, md[1].length > 4 ? 4 : 3)]
      ?? MONTH_ABBR[md[1].toLowerCase().slice(0, 3)];
    if (!m) return null;
    [d, mo, y] = [Number(md[2]), m, expandYear(Number(md[3]), now)];
  } else {
    return null;
  }

  if (!isRealDate(y, mo, d)) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * `26` → 2026, `98` → 1998.
 *
 * A two-digit year belongs to this century unless that would put the statement
 * more than a year in the future, which no bank prints.
 */
function expandYear(y: number, now: Date): number {
  if (y >= 1000) return y;
  const century = Math.floor(now.getFullYear() / 100) * 100;
  const candidate = century + (y % 100);
  return candidate > now.getFullYear() + 1 ? candidate - 100 : candidate;
}

/** Rejects 31 February and friends without round-tripping through UTC. */
function isRealDate(y: number, mo: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return false;
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1) return false;
  const probe = new Date(y, mo - 1, d);
  return probe.getFullYear() === y && probe.getMonth() === mo - 1 && probe.getDate() === d;
}

/** Today as a local calendar day — the ceiling for a plausible statement date. */
export function todayKey(now: Date = new Date()): string {
  return ymdLocal(now);
}

/**
 * The other reading of an ambiguous date: `2026-08-01` ⇄ `2026-01-08`.
 *
 * When a file never disambiguates dd/mm from mm/dd, the user is offered a switch
 * rather than being made to fix every row by hand. Swapping the parsed
 * components is exactly equivalent to re-parsing under the other order, and only
 * where both components are twelve or less — which is precisely the set of rows
 * that were ambiguous in the first place. A row like 25/12 is untouched, because
 * it was never in doubt.
 */
export function swapDayMonth(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  if (!m) return ymd;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month > 12 || day > 12) return ymd;
  return isRealDate(Number(m[1]), day, month) ? `${m[1]}-${m[3]}-${m[2]}` : ymd;
}
