/**
 * What the Apple Watch app shows, worked out by the phone app (step 3.8).
 *
 * The watch does no maths. It prints `WatchContext`, which wraps the widget
 * document (`widgetData.ts`, the same daily safe-to-spend figure and the same
 * Hide amounts rules, never recomputed) with the two things a quick add needs:
 * the currency symbol for the keypad and a short list of category choices.
 *
 * Hide amounts: `widget` already carries no amount while it is on, so the watch
 * face and the watch app cannot show one. The complication follows the lock
 * screen rule (`lockScreenAmounts`): a wrist is seen by anyone nearby.
 *
 * The matching ingest side, for expenses added on the watch, is `watchInbox.ts`.
 * Contract notes for both: docs/WATCH.md.
 */
import { ymLocal } from '../../lib/date';
import { loadCatViewFor } from './budgetCatsMonth';
import { allCategories, type SectionedCats } from './budget';
import { currencySym } from './format';
import { frequentCategoryKeys } from './expenseAnalytics';
import { isSpendingCategory, loadExpenses, type ExpenseItem } from './expense';
import { affectsWidget, currentWidgetPayload, type WidgetPayload } from './widgetData';

/** Bumped only for a change an older watch app would misread. */
export const WATCH_CONTEXT_VERSION = 1;

/** The watch has a small screen: a short, scrollable list is enough. */
export const WATCH_CATEGORY_LIMIT = 6;

export interface WatchCategory {
  /** The category key the phone files the expense under. */
  k: string;
  /** The label as the app prints it. */
  l: string;
}

export interface WatchContext {
  v: typeof WATCH_CONTEXT_VERSION;
  /** When the phone wrote this, ISO 8601. */
  updatedAt: string;
  /** Currency symbol for the keypad ("₹"). Amounts typed on the watch are in this currency. */
  symbol: string;
  /** The widget document, unchanged. */
  widget: WidgetPayload;
  /** Most-used spending categories first, then the rest of the spending categories. Never empty unless the user has none. */
  categories: WatchCategory[];
}

export interface WatchInputs {
  widget: WidgetPayload;
  items: ExpenseItem[];
  /** Active categories for the current month — `loadCatViewFor(month).active`. */
  cats: SectionedCats;
  currency: string;
  now: Date;
}

/** Pure: the context for these records. Tested in src/test/watchData.test.ts. */
export function buildWatchContext(input: WatchInputs): WatchContext {
  const spending = allCategories(input.cats).filter((c) => isSpendingCategory({ k: c.k, section: c.section }));
  const label = new Map(spending.map((c) => [c.k, c.l]));
  const used = frequentCategoryKeys(input.items, new Set(label.keys()), WATCH_CATEGORY_LIMIT);
  const rest = spending.map((c) => c.k).filter((k) => !used.includes(k));
  const keys = [...used, ...rest].slice(0, WATCH_CATEGORY_LIMIT);
  return {
    v: WATCH_CONTEXT_VERSION,
    updatedAt: input.now.toISOString(),
    symbol: currencySym(input.currency).trim() || input.currency,
    widget: input.widget,
    categories: keys.map((k) => ({ k, l: label.get(k) ?? k })),
  };
}

/** The context for what is saved on this device right now. */
export function currentWatchContext(now = new Date()): WatchContext {
  const widget = currentWidgetPayload(now);
  return buildWatchContext({
    widget,
    items: loadExpenses(),
    cats: loadCatViewFor(ymLocal(now)).active,
    currency: widget.currency,
    now,
  });
}

/** Storage keys whose change can change the context: the widget's, plus none of its own. */
export const affectsWatch = affectsWidget;
