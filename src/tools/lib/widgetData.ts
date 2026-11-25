/**
 * What the home-screen and lock-screen widgets show, worked out by the app.
 *
 * The widgets (iOS WidgetKit in `ios/App/FinatriXWidget`, Android app widgets
 * in `android/.../widget`) are native code that cannot run this app's
 * TypeScript, so they do no maths at all. The app writes one JSON document —
 * `WidgetPayload` below — into storage the widgets can read, and they print it.
 * The figure is the Expense Tracker's own `dailySafeSpend` from
 * `computeDashboard`, fed the same inputs the page feeds it, so the widget can
 * never disagree with the screen it opens.
 *
 * The contract (also used by the watch app, step 3.8) — see docs/WIDGETS.md:
 *  - iOS: `UserDefaults(suiteName: "group.co.finatrix.app")`, key `fx_widget`.
 *  - Android: SharedPreferences file `fx_widget`, key `payload`.
 *  - The value is the JSON string of `WidgetPayload`, version `v: 1`. A reader
 *    that sees a higher `v` it does not know shows its "open the app" state.
 *
 * Why a list of days rather than one number: the figure divides what is left
 * by the days left, today included, so it changes at midnight with no new
 * spending. Each entry is `computeDashboard` run for that day on the records
 * as they are now — the number the app itself would show that day if nothing
 * else were logged. No new formula: the same function, a different `now`. The
 * widget shows the entry for its own local today and, when it has none (the
 * month ended, or the app has not opened for a week), asks to be opened
 * instead of guessing.
 */
import { ymdLocal, ymLocal } from '../../lib/date';
import { computeDashboard, loadExpenses, type ExpenseItem } from './expense';
import { readBudgetMonth } from './budgetEvidence';
import { loadCatViewFor } from './budgetCatsMonth';
import { HIDE_AMOUNTS_KEY, amountsHidden } from './hideAmounts';
import { CURRENCIES, cfmt, maskedAmount } from './format';
import { getJSON, store } from './storage';
import type { BudgetStore, SectionedCats } from './budget';

/** Bumped only for a change an older widget would misread. */
export const WIDGET_PAYLOAD_VERSION = 1;

/**
 * The lock-screen switch: '1' once the user lets the iPhone lock screen show
 * the amount. Off until then — decided 24 Nov 2026 — because a lock screen is
 * seen by anyone holding the phone. Device-only like Hide amounts, so it is not
 * in `SYNC_KEYS`.
 */
export const WIDGET_LOCK_AMOUNTS_KEY = 'fx_widget_lock_amounts';

/**
 * How many days ahead are written. A week covers someone who does not open the
 * app every day; past that the widget asks to be opened rather than trust
 * records that have probably moved on.
 */
export const WIDGET_DAYS_AHEAD = 7;

export interface WidgetDay {
  /** Local calendar day this entry is for, `YYYY-MM-DD`. */
  date: string;
  /** `dailySafeSpend` for that day, unrounded, in `currency`. */
  amount: number;
  /** The same amount formatted exactly as the app prints it ("₹1,240"). */
  text: string;
}

export interface WidgetPayload {
  v: typeof WIDGET_PAYLOAD_VERSION;
  /** When the app wrote this, ISO 8601. */
  updatedAt: string;
  /** ISO currency code of every amount below. */
  currency: string;
  /**
   * Hide amounts is on (lib/hideAmounts.ts). Every widget shows `mask`, and no
   * amount is written at all — `days` is empty — so the number is not sitting
   * in shared storage while the user has asked for it to be hidden.
   */
  hidden: boolean;
  /** The user has let the lock screen show the amount. Off means `mask` there. */
  lockScreenAmounts: boolean;
  /** "₹ ••••" in the user's currency — what a hidden amount shows. */
  mask: string;
  /**
   * There is nothing to pace this month: no budget outside savings, so the
   * app's own figure is null. The widget says to set a budget.
   */
  noBudget: boolean;
  /** Today first, then the following days of this month. Empty when hidden or noBudget. */
  days: WidgetDay[];
}

export interface WidgetInputs {
  items: ExpenseItem[];
  /** Active categories for `now`'s month — `loadCatViewFor(month).active`. */
  cats: SectionedCats;
  budgetStore: BudgetStore;
  currency: string;
  hidden: boolean;
  lockScreenAmounts: boolean;
  now: Date;
}

function localMidnight(d: Date, plusDays = 0): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + plusDays);
}

/** Pure: the payload for these records. Tested in src/test/widgetData.test.ts. */
export function buildWidgetPayload(input: WidgetInputs): WidgetPayload {
  const { items, cats, budgetStore, currency, hidden, lockScreenAmounts } = input;
  const today = localMidnight(input.now);
  const month = ymLocal(today);
  const budget = readBudgetMonth(budgetStore, month);

  const days: WidgetDay[] = [];
  let noBudget = false;
  for (let i = 0; i < WIDGET_DAYS_AHEAD; i++) {
    const day = localMidnight(today, i);
    // Stay inside this month: the next month has its own categories and plan,
    // which may not exist yet, and the app has not shown any figure for it.
    if (ymLocal(day) !== month) break;
    const safe = computeDashboard(month, items, cats, budget.vals, day, budget.income).dailySafeSpend;
    if (safe == null) {
      // The spendable budget does not change day to day, so null today is null all month.
      noBudget = true;
      break;
    }
    if (hidden) break;
    days.push({ date: ymdLocal(day), amount: safe, text: cfmt(safe, currency) });
  }

  return {
    v: WIDGET_PAYLOAD_VERSION,
    updatedAt: input.now.toISOString(),
    currency,
    hidden,
    lockScreenAmounts,
    mask: maskedAmount(currency),
    noBudget,
    days: noBudget || hidden ? [] : days,
  };
}

export function lockScreenAmountsOn(): boolean {
  return store.get(WIDGET_LOCK_AMOUNTS_KEY, '') === '1';
}

export function setLockScreenAmounts(on: boolean): void {
  store.set(WIDGET_LOCK_AMOUNTS_KEY, on ? '1' : '0');
}

/** The payload for what is saved on this device right now. */
export function currentWidgetPayload(now = new Date()): WidgetPayload {
  const code = store.get('fx_currency', 'INR') || 'INR';
  return buildWidgetPayload({
    items: loadExpenses(),
    cats: loadCatViewFor(ymLocal(now)).active,
    budgetStore: getJSON<BudgetStore>('fx_bb_data', {}),
    currency: CURRENCIES[code] ? code : 'INR',
    hidden: amountsHidden(),
    lockScreenAmounts: lockScreenAmountsOn(),
    now,
  });
}

/** Storage keys whose change can change the payload. */
export function affectsWidget(key: string): boolean {
  return key === 'fx_expenses' || key === 'fx_currency' || key === HIDE_AMOUNTS_KEY
    || key === WIDGET_LOCK_AMOUNTS_KEY || key.startsWith('fx_bb_');
}
