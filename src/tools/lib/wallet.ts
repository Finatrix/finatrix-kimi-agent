/**
 * The Wallet — what every category's budget has left over, added up across the
 * financial year.
 *
 * THE IDEA
 * --------
 * A monthly budget forgets. Spend 30 under on Eating Out in April and the
 * discipline evaporates on the 1st of May; spend 30 over and the debt does too.
 * The Wallet is the running total the monthly view throws away:
 *
 *     wallet(category) = Σ over the financial year so far ( budget − spent )
 *
 * A positive balance is budget you set aside and did not use — money you have
 * genuinely banked and may spend without breaking the plan. A negative balance
 * is an overspend you have not yet made up. Both signs are shown, and both are
 * labelled in words, because a bare "−30" beside a category is ambiguous in
 * exactly the way money must never be.
 *
 * SAVING IS NOT SPENDING
 * ----------------------
 * The sign convention above is right for Needs and Wants and exactly backwards
 * for Savings. Setting aside more than you planned is the best outcome this
 * product has, and reporting it as "−2,000, overdrawn" would be the single most
 * damaging number on the screen. So Savings is measured the other way up —
 * `setAside − planned` — and reported in its own figure, never merged into the
 * spending balance. This is the same rule `splitOutflow` already applies to the
 * monthly figures; the Wallet just applies it over twelve months.
 *
 * WHICH MONTHS COUNT
 * ------------------
 * Only months from the start of the financial year up to and including the one
 * being viewed, and only months the user actually planned. A month with no
 * budget contributes nothing rather than contributing its whole spend as an
 * overdraft: "I had not started using FinatriX yet" is not an overspend, and a
 * wallet that opened at minus six months of groceries would be worse than
 * useless.
 *
 * Everything here is pure.
 */
import { allCategories, type BudgetStore, type CatKey, type SectionedCats } from './budget';
import { isSpendingCategory, migrateCategory, type ExpenseItem } from './expense';
import { fyLabel, fyMonthsThrough, fyRangeLabel, fyStartMonthOf } from './fiscalYear';
import type { IconName } from '../ui/Icon';

/** One category's carry-over position for the year so far. */
export interface WalletRow {
  k: string;
  label: string;
  ic: IconName;
  section: CatKey;
  /** True for Needs/Wants. False for Savings and internal movements. */
  isSpending: boolean;
  /** Total budgeted across the counted months. */
  budgeted: number;
  /** Total logged against this category across the counted months. */
  actual: number;
  /**
   * The balance, already oriented so that **positive is always the good
   * direction**: unspent budget for a spending category, money set aside beyond
   * plan for a savings one.
   */
  balance: number;
  /** How many of the counted months this category was budgeted in. */
  monthsBudgeted: number;
}

export interface WalletResult {
  /** "FY 2025–26", or "2026" for a January-start year. */
  yearLabel: string;
  /** "April 2025 – March 2026" — what the label above actually spans. */
  yearRange: string;
  /** The first month of the year, "YYYY-MM". */
  yearStart: string;
  /** Months actually counted: planned months from the year start to `month`. */
  monthsCounted: string[];
  /**
   * The headline. Needs + Wants only: unspent budget minus overspend, summed
   * across the year. Positive is banked, negative is overdrawn.
   */
  spendingBalance: number;
  /** The positive half of `spendingBalance`, before overspends are netted off. */
  banked: number;
  /** The negative half, as a positive magnitude. */
  overdrawn: number;
  /** Savings set aside beyond plan. Positive is ahead; negative is behind. */
  savingsBalance: number;
  /** Total budgeted for spending categories across the counted months. */
  spendingBudgeted: number;
  /** Total consumed across the counted months. */
  spendingActual: number;
  /** Every category with a budget or an actual, best balance first. */
  rows: WalletRow[];
  /** Rows whose balance is negative, worst first — what to fix. */
  overdrawnRows: WalletRow[];
  /** True when no month in the year has a budget yet, so there is nothing to say. */
  empty: boolean;
}

const EMPTY_RESULT = (yearLabel: string, yearRange: string, yearStart: string): WalletResult => ({
  yearLabel,
  yearRange,
  yearStart,
  monthsCounted: [],
  spendingBalance: 0,
  banked: 0,
  overdrawn: 0,
  savingsBalance: 0,
  spendingBudgeted: 0,
  spendingActual: 0,
  rows: [],
  overdrawnRows: [],
  empty: true,
});

export interface WalletInput {
  /** The month being viewed. The year is the one this month falls in. */
  month: string;
  /** Financial-year start month, 1–12. See `fiscalYear.ts`. */
  fyStart: number;
  items: readonly ExpenseItem[];
  /** The category arrangement to report under — normally the viewed month's. */
  cats: SectionedCats;
  budgetStore: BudgetStore;
}

/**
 * Does this month carry a plan?
 *
 * A saved month with every allocation at zero is not a plan — it is a month the
 * user opened and left. Requiring a non-zero allocation is what keeps those out
 * of the denominator.
 */
function monthIsPlanned(budgetStore: BudgetStore, month: string, keys: ReadonlySet<string>): boolean {
  const vals = budgetStore[month]?.vals;
  if (!vals) return false;
  for (const k of Object.keys(vals)) {
    if (keys.has(k) && Math.max(0, Number(vals[k]) || 0) > 0) return true;
  }
  return false;
}

export function computeWallet({
  month, fyStart, items, cats, budgetStore,
}: WalletInput): WalletResult {
  const yearLabel = fyLabel(month, fyStart);
  const yearRange = fyRangeLabel(month, fyStart);
  const yearStart = fyStartMonthOf(month, fyStart);

  const flat = allCategories(cats);
  const validKeys = new Set(flat.map((c) => c.k));

  const monthsCounted = fyMonthsThrough(month, fyStart)
    .filter((m) => monthIsPlanned(budgetStore, m, validKeys));

  if (monthsCounted.length === 0) return EMPTY_RESULT(yearLabel, yearRange, yearStart);

  const countedSet = new Set(monthsCounted);

  /* ── Budgets: sum each category's allocation across the counted months ── */
  const budgeted = new Map<string, number>();
  const monthsBudgeted = new Map<string, number>();
  for (const m of monthsCounted) {
    const vals = budgetStore[m]?.vals ?? {};
    for (const c of flat) {
      const v = Math.max(0, Number(vals[c.k]) || 0);
      if (v <= 0) continue;
      budgeted.set(c.k, (budgeted.get(c.k) ?? 0) + v);
      monthsBudgeted.set(c.k, (monthsBudgeted.get(c.k) ?? 0) + 1);
    }
  }

  /* ── Actuals: the same months, resolved through `migrateCategory` so a
        legacy key lands in the same bucket its budget is under. ── */
  const actual = new Map<string, number>();
  for (const e of items) {
    const m = (e.date || '').slice(0, 7);
    if (!countedSet.has(m)) continue;
    const k = migrateCategory(e.category, validKeys);
    // A category that no longer exists cannot have a wallet: it has no budget
    // to carry over and no row to show it in. Its spend still counts in the
    // monthly figures, which is where an orphaned transaction belongs.
    if (!validKeys.has(k)) continue;
    actual.set(k, (actual.get(k) ?? 0) + e.amount);
  }

  const rows: WalletRow[] = [];
  for (const c of flat) {
    const b = budgeted.get(c.k) ?? 0;
    const a = actual.get(c.k) ?? 0;
    if (b === 0 && a === 0) continue;
    const spending = isSpendingCategory(c);
    rows.push({
      k: c.k,
      label: c.l,
      ic: c.ic,
      section: c.section,
      isSpending: spending,
      budgeted: b,
      actual: a,
      // Positive is always the good direction — see the note at the top.
      balance: spending ? b - a : a - b,
      monthsBudgeted: monthsBudgeted.get(c.k) ?? 0,
    });
  }

  const spendingRows = rows.filter((r) => r.isSpending);
  const savingRows = rows.filter((r) => !r.isSpending);

  const banked = spendingRows.reduce((s, r) => s + Math.max(0, r.balance), 0);
  const overdrawn = spendingRows.reduce((s, r) => s + Math.max(0, -r.balance), 0);

  rows.sort((a, b) => b.balance - a.balance || a.label.localeCompare(b.label));

  return {
    yearLabel,
    yearRange,
    yearStart,
    monthsCounted,
    spendingBalance: banked - overdrawn,
    banked,
    overdrawn,
    savingsBalance: savingRows.reduce((s, r) => s + r.balance, 0),
    spendingBudgeted: spendingRows.reduce((s, r) => s + r.budgeted, 0),
    spendingActual: spendingRows.reduce((s, r) => s + r.actual, 0),
    rows,
    overdrawnRows: rows
      .filter((r) => r.balance < 0)
      .sort((a, b) => a.balance - b.balance),
    empty: false,
  };
}

/**
 * One sentence describing the wallet, for the collapsed button and for screen
 * readers. Takes the caller's currency formatter so the wording and the figure
 * always come from the same place.
 */
export function walletSummary(w: WalletResult, cfmt: (n: number) => string): string {
  if (w.empty) return `No budget yet for ${w.yearLabel} — set one to start banking what you do not spend.`;
  const months = `${w.monthsCounted.length} month${w.monthsCounted.length === 1 ? '' : 's'}`;
  if (w.spendingBalance > 0) {
    return `${cfmt(w.spendingBalance)} banked across ${months} of ${w.yearLabel} — budget you set aside and did not need.`;
  }
  if (w.spendingBalance < 0) {
    return `${cfmt(Math.abs(w.spendingBalance))} overdrawn across ${months} of ${w.yearLabel} — spending still to make up.`;
  }
  return `Exactly on plan across ${months} of ${w.yearLabel}.`;
}
