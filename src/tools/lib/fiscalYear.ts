/**
 * The financial year — one definition, shared by every surface that reports a
 * year rather than a month.
 *
 * WHY THIS EXISTS
 * ---------------
 * "This year" is not a fact about the calendar, it is a fact about where the
 * user lives. India runs April–March, Australia and New Zealand July–June, the
 * UK April–March for personal tax, most of the rest January–December. The
 * Wallet carries balances "for the financial year", so the first thing it needs
 * is an honest answer to which months that is — and an answer that is wrong by
 * three months silently changes every figure it reports.
 *
 * The user owns the setting. The default is derived from their display currency
 * because that is the only signal the product has, and a sensible default beats
 * an empty field on a screen nobody visits — but it is only ever a default: the
 * stored value always wins, and it is synced, so the answer follows them
 * between devices.
 *
 * Pure, apart from the load/save pair at the bottom.
 */
import { getJSON, setJSON } from './storage';
import { monthLabel } from './month';

/** Storage key for the user's chosen financial-year start month (1–12). */
export const FY_START_KEY = 'fx_fy_start';

/**
 * Default FY start month by currency, 1-based.
 *
 * Only currencies whose jurisdiction has a well-known non-January personal
 * financial year are listed; everything else falls through to January, which is
 * both the most common convention and the least surprising wrong answer.
 */
const FY_START_BY_CURRENCY: Readonly<Record<string, number>> = {
  INR: 4,  // India: 1 April – 31 March
  GBP: 4,  // UK personal tax year starts 6 April; April is the honest month
  PKR: 7,  // Pakistan: 1 July – 30 June
  BDT: 7,  // Bangladesh: 1 July – 30 June
  NPR: 7,  // Nepal: mid-July
  LKR: 4,  // Sri Lanka: 1 April – 31 March
  AUD: 7,  // Australia: 1 July – 30 June
  NZD: 4,  // New Zealand: 1 April – 31 March
  ZAR: 3,  // South Africa: 1 March – end February
  EGP: 7,  // Egypt: 1 July – 30 June
  JPY: 4,  // Japan: 1 April – 31 March
  HKD: 4,  // Hong Kong: 1 April – 31 March
  SGD: 4,  // Singapore (government FY): 1 April – 31 March
};

/** Month names for the picker, index 0 unused so the array is 1-based. */
export const MONTH_NAMES: readonly string[] = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** The default start month for a currency. Always 1–12. */
export function defaultFyStart(currencyCode: string): number {
  return FY_START_BY_CURRENCY[currencyCode] ?? 1;
}

/** Coerce anything stored (or typed) into a valid 1–12 month. */
function clampMonth(v: unknown, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : fallback;
}

/**
 * What the user actually chose, or null if they never have.
 *
 * Separate from `loadFyStart` so a component can hold the *choice* in state and
 * derive the effective month from it plus the live currency — rather than
 * re-reading storage in an effect every time the currency changes, which is a
 * cascading render for a value that has not moved.
 */
export function loadFyChoice(): number | null {
  const stored = getJSON<unknown>(FY_START_KEY, null);
  if (stored == null) return null;
  const n = Math.round(Number(stored));
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
}

/**
 * The user's financial-year start month. Falls back to the currency default
 * when nothing has been chosen, so this never returns a meaningless value.
 */
export function loadFyStart(currencyCode = 'INR'): number {
  return loadFyChoice() ?? defaultFyStart(currencyCode);
}

export function saveFyStart(month: number): void {
  setJSON(FY_START_KEY, clampMonth(month, 1));
}

/* ══════════════════════════════════════════════════════════════════════════
   The maths. Everything below is pure and takes `fyStart` explicitly.
   ══════════════════════════════════════════════════════════════════════════ */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Split a "YYYY-MM" key. Returns nulls for anything malformed. */
function parseMonth(ym: string): { y: number; m: number } | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(ym ?? '');
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) };
}

/**
 * The first month of the financial year that `ym` belongs to.
 *
 * A January-start year is the calendar year, which is why the general form has
 * to work for `fyStart === 1` without a special case: a month before the start
 * month belongs to the year that began in the *previous* calendar year.
 */
export function fyStartMonthOf(ym: string, fyStart: number): string {
  const p = parseMonth(ym);
  const start = clampMonth(fyStart, 1);
  if (!p) return ym;
  const year = p.m >= start ? p.y : p.y - 1;
  return `${year}-${pad2(start)}`;
}

/** The last month of the financial year `ym` belongs to. */
export function fyEndMonthOf(ym: string, fyStart: number): string {
  const first = fyStartMonthOf(ym, fyStart);
  const p = parseMonth(first)!;
  const endMonth = p.m === 1 ? 12 : p.m - 1;
  const endYear = p.m === 1 ? p.y : p.y + 1;
  return `${endYear}-${pad2(endMonth)}`;
}

/**
 * Every month of the financial year containing `ym`, in order, from the year's
 * first month up to and including `ym` itself.
 *
 * "Up to and including" rather than the whole year on purpose: the Wallet is a
 * running balance, and including months that have not happened yet would report
 * a surplus made entirely of budgets nobody has had the chance to spend.
 */
export function fyMonthsThrough(ym: string, fyStart: number): string[] {
  const p = parseMonth(ym);
  if (!p) return [];
  const first = parseMonth(fyStartMonthOf(ym, fyStart))!;
  const out: string[] = [];
  let y = first.y;
  let m = first.m;
  // At most 12 iterations by construction; the guard is belt-and-braces against
  // a malformed input producing an unbounded loop.
  for (let i = 0; i < 12; i += 1) {
    const key = `${y}-${pad2(m)}`;
    out.push(key);
    if (key === ym) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/** Every month of the financial year containing `ym`, first to last (12 keys). */
export function fyAllMonths(ym: string, fyStart: number): string[] {
  const first = parseMonth(fyStartMonthOf(ym, fyStart));
  if (!first) return [];
  const out: string[] = [];
  let y = first.y;
  let m = first.m;
  for (let i = 0; i < 12; i += 1) {
    out.push(`${y}-${pad2(m)}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/**
 * How the financial year reads on screen — "FY 2025–26" when it straddles two
 * calendar years, "2026" when it is the calendar year.
 *
 * The en dash and the two-digit second year are the conventional form in every
 * jurisdiction that uses a straddling year; writing "FY 2025-2026" is not wrong
 * but it is nobody's house style.
 */
export function fyLabel(ym: string, fyStart: number): string {
  const first = parseMonth(fyStartMonthOf(ym, fyStart));
  if (!first) return '';
  if (clampMonth(fyStart, 1) === 1) return String(first.y);
  return `FY ${first.y}–${pad2((first.y + 1) % 100)}`;
}

/** "April 2025 – March 2026", for the tooltip that explains the label. */
export function fyRangeLabel(ym: string, fyStart: number): string {
  const first = fyStartMonthOf(ym, fyStart);
  const last = fyEndMonthOf(ym, fyStart);
  return `${monthLabel(first)} – ${monthLabel(last)}`;
}
