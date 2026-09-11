/**
 * How a category's cost actually lands in a month.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * Two figures in this product assume that spending accrues evenly through the
 * month: the pace inside the month score (budget × fraction of month elapsed)
 * and the month-end projection (spend so far ÷ days so far × days in month).
 * For groceries, fuel and dinners that assumption is close to true. For rent it
 * is nonsense.
 *
 * Rent is due in full on the 1st. On the 4th of a 30-day month, an A$725 rent
 * payment against an A$725 budget is EXACTLY on plan — the month's rent is
 * settled — and yet:
 *
 *   • the pace test compares it to a target of A$97 and reports it 650% over,
 *     which is heavy enough to drag the whole month's fidelity to zero;
 *   • the projection divides it by four days and multiplies it back by thirty,
 *     forecasting A$5,437 of rent and a month headed far past its budget.
 *
 * Both are produced by the user doing the one correct thing, on time. Neither
 * is a rounding error; they are the wrong answer, stated confidently, on the
 * two screens that exist to tell someone how their month is going.
 *
 * So a category is classified by WHEN its money moves, not just how much:
 *
 *   fixed    — one scheduled charge a month: rent, the EMI, insurance, the
 *              broadband bill. It does not accrue; it lands.
 *   variable — accrues across the month with daily life. The even-pace
 *              assumption is right for these, and nothing changes for them.
 *
 * EVIDENCE, NOT ASSUMPTION
 * ------------------------
 * The classification prefers the user's own ledger over any built-in opinion:
 * a category whose spend has arrived as a single payment on a stable day for
 * most of the months on record IS fixed, whatever it is called, including a
 * category this codebase has never heard of. The built-in list only decides
 * categories with no history yet — a first month, where there is nothing else
 * to go on — and the current month's own ledger settles the day it landed on.
 *
 * Everything here is pure.
 */
import { isSpendingCategory, migrateCategory, type ExpenseItem } from './expense';
import type { CatKey } from './budget';
import { ymLocal } from '../../lib/date';

export type SpendShape = 'fixed' | 'variable';

export interface CategoryTiming {
  shape: SpendShape;
  /**
   * Day of the month the charge usually lands on, 1–31. Null when it is fixed
   * but nothing on record says when — which is a real state, and one the
   * callers must not paper over with a guess.
   */
  dueDay: number | null;
  /** Whether this month's ledger already carries the charge. */
  settled: boolean;
  /** What decided the classification, so no surface has to present it as fact. */
  basis: 'history' | 'default';
}

/** The minimum meta a caller must know about a category. */
export interface ShapeCatMeta { k: string; section: CatKey }

/**
 * Categories that are a single scheduled charge for almost everybody, used only
 * until the user's own ledger can speak for itself.
 *
 * Deliberately short. Every entry is something a household is billed for once a
 * month on a date somebody else chose; anything a person decides to buy is
 * absent, because that is the definition of the variable half. Savings
 * categories are not listed: they never reach these figures at all (see
 * `splitOutflow`), which is a separate and older distinction.
 */
const FIXED_BY_DEFAULT = new Set([
  'rent', 'insurance', 'loan_invest', 'phone', 'internet', 'utilities', 'subscriptions',
]);

/** Months of ledger the classifier will look back over. */
const LOOKBACK_MONTHS = 6;

/** Months of evidence before the ledger is allowed to overrule the default. */
const MIN_MONTHS_FOR_HISTORY = 2;

/** A charge counts as "one payment" when this much of the month came in a day. */
const SINGLE_DAY_SHARE = 0.8;

/** The share of observed months that must agree before a pattern is a pattern. */
const PATTERN_MAJORITY = 2 / 3;

/** How far the usual day may wander and still be "the same day each month". */
const MAX_DAY_SPREAD = 6;

function dayOf(date: string): number {
  return Number(date.slice(8, 10)) || 0;
}

/** The months before `month`, most recent first, that the lookback covers. */
function lookbackMonths(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const out: string[] = [];
  for (let i = 1; i <= LOOKBACK_MONTHS; i += 1) out.push(ymLocal(new Date(y, m - 1 - i, 1)));
  return out;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

interface MonthShape { day: number; single: boolean }

/**
 * One month of one category, reduced to "did it arrive on a day?".
 *
 * The test is share-of-total rather than transaction count: a rent payment plus
 * a small late fee two days later is still one scheduled charge, and counting
 * rows would call it variable.
 */
function shapeOfMonth(rows: readonly ExpenseItem[]): MonthShape | null {
  const total = rows.reduce((s, e) => s + e.amount, 0);
  if (total <= 0) return null;
  const byDay = new Map<number, number>();
  for (const e of rows) {
    const d = dayOf(e.date || '');
    if (d) byDay.set(d, (byDay.get(d) ?? 0) + e.amount);
  }
  let bestDay = 0;
  let bestAmount = 0;
  for (const [day, amount] of byDay) {
    if (amount > bestAmount) { bestDay = day; bestAmount = amount; }
  }
  if (!bestDay) return null;
  return { day: bestDay, single: bestAmount / total >= SINGLE_DAY_SHARE };
}

/**
 * Classify every spending category by when its money moves.
 *
 * Savings, investments and transfers are absent from the result: they are not
 * spending, and every figure built on this has already removed them.
 */
export function classifySpendTiming(
  items: readonly ExpenseItem[],
  cats: readonly ShapeCatMeta[],
  month: string,
): Map<string, CategoryTiming> {
  const validKeys = new Set(cats.map((c) => c.k));
  const past = lookbackMonths(month);
  const pastSet = new Set(past);

  /** category → month → rows. Built in one pass over the ledger. */
  const byCat = new Map<string, Map<string, ExpenseItem[]>>();
  for (const e of items) {
    const m = (e.date || '').slice(0, 7);
    if (m !== month && !pastSet.has(m)) continue;
    const k = migrateCategory(e.category, validKeys);
    const months = byCat.get(k) ?? new Map<string, ExpenseItem[]>();
    const rows = months.get(m) ?? [];
    rows.push(e);
    months.set(m, rows);
    byCat.set(k, months);
  }

  const out = new Map<string, CategoryTiming>();
  for (const cat of cats) {
    if (!isSpendingCategory({ k: cat.k, section: cat.section })) continue;
    const months = byCat.get(cat.k);
    const thisMonth = months?.get(month) ?? [];
    const settled = thisMonth.length > 0;

    const observed = past
      .map((m) => shapeOfMonth(months?.get(m) ?? []))
      .filter((s): s is MonthShape => s !== null);

    let shape: SpendShape;
    let basis: CategoryTiming['basis'];
    let dueDay: number | null = null;

    if (observed.length >= MIN_MONTHS_FOR_HISTORY) {
      const singles = observed.filter((s) => s.single);
      const days = singles.map((s) => s.day);
      const spread = days.length ? Math.max(...days) - Math.min(...days) : Infinity;
      // Both halves are required. A category paid in one go but on a different
      // day every month is not a scheduled charge, it is a habit — and giving
      // it a due date would put a date on screen the user never agreed to.
      const isFixed = singles.length / observed.length >= PATTERN_MAJORITY
        && spread <= MAX_DAY_SPREAD;
      shape = isFixed ? 'fixed' : 'variable';
      basis = 'history';
      if (isFixed) dueDay = median(days);
    } else {
      shape = FIXED_BY_DEFAULT.has(cat.k) ? 'fixed' : 'variable';
      basis = 'default';
    }

    // This month's own ledger is the most recent word on when it lands, and for
    // a first month it is the only one. It never changes WHETHER a category is
    // fixed — a single grocery run early in the month must not make groceries
    // look scheduled — only when a category already believed to be fixed is due.
    if (shape === 'fixed' && settled) {
      const here = shapeOfMonth(thisMonth);
      if (here) dueDay = here.day;
    }

    out.set(cat.k, { shape, dueDay, settled, basis });
  }
  return out;
}

/**
 * What a category should have cost by now, as a fraction of its monthly budget.
 *
 * Null means "no honest answer yet" — a scheduled charge that has not been paid
 * and is not yet due. The caller must DROP those rather than score them: a
 * target of zero would hand out a perfect mark for a bill that simply has not
 * arrived, and a target of the full budget would mark somebody down for not
 * having paid rent early.
 *
 * `elapsed` is the fraction of the month that has happened (1 for a month that
 * has ended), matching `computeExecutionScore`'s own definition.
 */
export function expectedShareByNow(
  timing: CategoryTiming | undefined,
  elapsed: number,
  today: number,
): number | null {
  // An unclassified category — a legacy key, or one with no section — keeps the
  // old even-pace reading. It is the conservative answer, and the one every
  // figure on these screens used before this module existed.
  if (!timing || timing.shape === 'variable') return elapsed;
  if (timing.settled) return 1;
  if (timing.dueDay !== null && today >= timing.dueDay) return 1;
  return null;
}
