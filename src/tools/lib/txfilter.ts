/**
 * Transaction search / filter / sort / grouping — pure, dependency-free helpers
 * so the Expense Tracker's list behaves like a professional finance app while
 * staying fully unit-testable. None of this touches the calculation engine; it
 * only decides which already-computed transactions are shown and in what order.
 */
import { ymdLocal } from '../../lib/date';
import { migrateCategory, type ExpenseItem } from './expense';

export type SortKey = 'newest' | 'oldest' | 'amount_desc' | 'amount_asc' | 'category' | 'merchant';

export const SORT_OPTIONS: Array<{ k: SortKey; label: string }> = [
  { k: 'newest', label: 'Newest first' },
  { k: 'oldest', label: 'Oldest first' },
  { k: 'amount_desc', label: 'Highest amount' },
  { k: 'amount_asc', label: 'Lowest amount' },
  { k: 'category', label: 'Category (A–Z)' },
  { k: 'merchant', label: 'Merchant (A–Z)' },
];

export interface TxFilters {
  /** Free-text query — matched against merchant, description, category label and tags. */
  query: string;
  /** Inclusive YYYY-MM-DD bounds (either may be empty). */
  dateFrom: string;
  dateTo: string;
  /** Category keys to include; empty = all. */
  categories: string[];
  /** Payment methods to include; empty = all. */
  paymentMethods: string[];
  /** 'any' | 'recurring' | 'one_off'. */
  recurring: 'any' | 'recurring' | 'one_off';
  /** Inclusive amount bounds (null = unbounded). */
  amountMin: number | null;
  amountMax: number | null;
}

export const emptyFilters = (): TxFilters => ({
  query: '', dateFrom: '', dateTo: '', categories: [], paymentMethods: [],
  recurring: 'any', amountMin: null, amountMax: null,
});

/** True when any constraint (other than a blank query) is active. */
export function hasActiveFilters(f: TxFilters): boolean {
  return (
    f.dateFrom !== '' || f.dateTo !== '' || f.categories.length > 0 || f.paymentMethods.length > 0 ||
    f.recurring !== 'any' || f.amountMin != null || f.amountMax != null
  );
}

export function countActiveFilters(f: TxFilters): number {
  let n = 0;
  if (f.dateFrom || f.dateTo) n++;
  if (f.categories.length) n++;
  if (f.paymentMethods.length) n++;
  if (f.recurring !== 'any') n++;
  if (f.amountMin != null || f.amountMax != null) n++;
  return n;
}

/**
 * Map of category key → display label, used for search + sort. Its KEYS are also
 * the authoritative set of live category keys, which is what lets this module
 * resolve legacy keys the same way the dashboard does — see `resolveKey`.
 */
export type CatLabels = Record<string, string>;

/**
 * The category key a transaction actually belongs to.
 *
 * Expenses logged before the V4.1 Budget/Expense merge stored the retired keys
 * (`food`, `grocery`, `bills`…). `computeDashboard` and `suggestBudgets` run
 * every one of them through `migrateCategory`, so the dashboard totals a legacy
 * `food` row under **Eating Out** — but this module used to compare the RAW
 * stored key. The two disagreed in the one place a user is most likely to
 * notice: clicking a budget warning called `focusCategory('eating_out')`, which
 * filtered on a key no stored row carried, so a category the dashboard had just
 * reported as over budget drilled through to an empty list. The same mismatch
 * hid the category's filter chip and made a search for "Eating Out" miss it.
 *
 * One resolution rule, shared with the dashboard, is what keeps a total and the
 * rows behind it describing the same set of transactions.
 */
function resolveKey(category: string, validKeys: Set<string>): string {
  return migrateCategory(category, validKeys);
}

const MONTHS_LONG = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/**
 * Searchable words for a date, so "jul", "july" and "2026-07-05" all find the
 * same transaction. Built from the stored ISO string with a fixed month table
 * rather than `toLocaleDateString`, so search results never depend on the
 * runtime locale.
 */
function dateWords(d: string): string {
  const [y, m, day] = (d || '').split('-');
  const mi = Number(m) - 1;
  const name = mi >= 0 && mi < 12 ? MONTHS_LONG[mi] : '';
  return [d, name, name.slice(0, 3), day, y].filter(Boolean).join(' ');
}

/** Strip separators and currency marks so "1,200" and "₹1200" both match 1200. */
function digitsOnly(s: string): string {
  return s.replace(/[^0-9.]/g, '');
}

/**
 * Free-text match across every field a person might remember a spend by:
 * merchant, description, notes, category, tags, payment method, date and
 * amount. Amount and date are matched on a separate digit-normalised haystack
 * so a typed "1,200" or "₹1200" still lands on a 1200 transaction.
 */
function matchesQuery(e: ExpenseItem, q: string, categoryLabel: string): boolean {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;

  const amount = Number(e.amount) || 0;
  const haystack = [
    e.merchant,
    e.note,
    e.notes,
    categoryLabel,
    ...(e.tags ?? []),
    e.paymentMethod,
    dateWords(e.date || ''),
    String(amount),
    amount.toLocaleString('en-US'),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (haystack.includes(needle)) return true;

  // Numeric fallback: compare digits to digits (amount and the raw date).
  const needleDigits = digitsOnly(needle);
  if (!needleDigits) return false;
  const numeric = `${amount} ${amount.toFixed(2)} ${(e.date || '').replace(/-/g, '')}`;
  return numeric.includes(needleDigits);
}

export function filterTransactions(items: ExpenseItem[], f: TxFilters, labels: CatLabels): ExpenseItem[] {
  const catSet = f.categories.length ? new Set(f.categories) : null;
  const paySet = f.paymentMethods.length ? new Set(f.paymentMethods) : null;
  const validKeys = new Set(Object.keys(labels));
  return items.filter((e) => {
    const key = resolveKey(e.category, validKeys);
    if (!matchesQuery(e, f.query, labels[key] ?? e.category)) return false;
    if (f.dateFrom && (e.date || '') < f.dateFrom) return false;
    if (f.dateTo && (e.date || '') > f.dateTo) return false;
    if (catSet && !catSet.has(key)) return false;
    if (paySet && !paySet.has(e.paymentMethod ?? '')) return false;
    if (f.recurring === 'recurring' && !e.recurring) return false;
    if (f.recurring === 'one_off' && e.recurring) return false;
    if (f.amountMin != null && e.amount < f.amountMin) return false;
    if (f.amountMax != null && e.amount > f.amountMax) return false;
    return true;
  });
}

/**
 * Stable sort by the chosen key. `order` is a tiebreaker map (original index)
 * so equal rows keep their incoming order — important for predictable UIs.
 */
export function sortTransactions(items: ExpenseItem[], key: SortKey, labels: CatLabels): ExpenseItem[] {
  const validKeys = new Set(Object.keys(labels));
  // Same resolution as the filter, so "Category (A–Z)" sorts a legacy row under
  // the heading the rest of the app files it under rather than under its raw key.
  const catLabel = (e: ExpenseItem) => labels[resolveKey(e.category, validKeys)] ?? e.category;
  const order = new Map(items.map((e, i) => [e.id, i]));
  const tie = (a: ExpenseItem, b: ExpenseItem) => (order.get(a.id)! - order.get(b.id)!);
  const byDateDesc = (a: ExpenseItem, b: ExpenseItem) =>
    (b.date || '').localeCompare(a.date || '') || tie(a, b);
  const arr = [...items];
  switch (key) {
    case 'newest':
      return arr.sort(byDateDesc);
    case 'oldest':
      return arr.sort((a, b) => (a.date || '').localeCompare(b.date || '') || tie(a, b));
    case 'amount_desc':
      return arr.sort((a, b) => b.amount - a.amount || byDateDesc(a, b));
    case 'amount_asc':
      return arr.sort((a, b) => a.amount - b.amount || byDateDesc(a, b));
    case 'category':
      return arr.sort((a, b) => catLabel(a).localeCompare(catLabel(b)) || byDateDesc(a, b));
    case 'merchant':
      return arr.sort((a, b) =>
        (a.merchant || a.note || '').localeCompare(b.merchant || b.note || '') || byDateDesc(a, b));
    default:
      return arr;
  }
}

/* ── Timeline grouping ── */
export interface TxGroup { key: string; label: string; items: ExpenseItem[] }

/** Local calendar day. See lib/date for why this must never go via UTC. */
const ymd = ymdLocal;

/**
 * Bucket transactions into human date bands relative to `now`:
 * Today · Yesterday · This week · Last month-name(s) · Older.
 * Assumes `items` are already ordered as the caller wants within each band
 * (grouping is order-preserving).
 */
export function groupByTimeline(items: ExpenseItem[], now: Date): TxGroup[] {
  const todayStr = ymd(now);
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  const yestStr = ymd(y);
  // Start of the current week (Monday).
  const weekStart = new Date(now);
  const dow = (now.getDay() + 6) % 7; // 0 = Monday
  weekStart.setDate(now.getDate() - dow);
  const weekStartStr = ymd(weekStart);
  const curMonth = todayStr.slice(0, 7);

  const groups: TxGroup[] = [];
  const index: Record<string, TxGroup> = {};
  const push = (key: string, label: string, e: ExpenseItem) => {
    let g = index[key];
    if (!g) { g = { key, label, items: [] }; index[key] = g; groups.push(g); }
    g.items.push(e);
  };

  for (const e of items) {
    const d = e.date || '';
    if (d > todayStr) push('future', 'Upcoming', e);
    else if (d === todayStr) push('today', 'Today', e);
    else if (d === yestStr) push('yesterday', 'Yesterday', e);
    else if (d >= weekStartStr && d < yestStr) push('week', 'Earlier this week', e);
    else {
      const mk = d.slice(0, 7) || 'unknown';
      const label = mk === curMonth
        ? 'Earlier this month'
        : monthName(mk, now);
      push('m_' + mk, label, e);
    }
  }
  return groups;
}

/**
 * `now` is the caller's reference date, not the wall clock. groupByTimeline is
 * given a reference date precisely so its banding is deterministic, but this
 * helper used to re-read `new Date()` for the same-year test — so the bands and
 * the year suffix could be decided against two different dates. The two agree
 * in the app (which passes the real now), but they diverge for any caller that
 * supplies its own reference, which is the documented contract of this module:
 * on 1 January a June transaction banded as "last year" by the caller's date
 * was still labelled bare "June" by the real one.
 */
function monthName(mk: string, now: Date): string {
  const [yr, mo] = mk.split('-').map(Number);
  if (!yr || !mo) return 'Earlier';
  const d = new Date(yr, mo - 1, 1);
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, sameYear ? { month: 'long' } : { month: 'long', year: 'numeric' });
}
