/**
 * Transaction search / filter / sort / grouping — pure, dependency-free helpers
 * so the Expense Tracker's list behaves like a professional finance app while
 * staying fully unit-testable. None of this touches the calculation engine; it
 * only decides which already-computed transactions are shown and in what order.
 */
import type { ExpenseItem } from './expense';

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

/** Map of category key → display label, used for search + sort. */
export type CatLabels = Record<string, string>;

function matchesQuery(e: ExpenseItem, q: string, labels: CatLabels): boolean {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    e.merchant,
    e.note,
    e.notes,
    labels[e.category] ?? e.category,
    ...(e.tags ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

export function filterTransactions(items: ExpenseItem[], f: TxFilters, labels: CatLabels): ExpenseItem[] {
  const catSet = f.categories.length ? new Set(f.categories) : null;
  const paySet = f.paymentMethods.length ? new Set(f.paymentMethods) : null;
  return items.filter((e) => {
    if (!matchesQuery(e, f.query, labels)) return false;
    if (f.dateFrom && (e.date || '') < f.dateFrom) return false;
    if (f.dateTo && (e.date || '') > f.dateTo) return false;
    if (catSet && !catSet.has(e.category)) return false;
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
      return arr.sort((a, b) =>
        (labels[a.category] ?? a.category).localeCompare(labels[b.category] ?? b.category) || byDateDesc(a, b));
    case 'merchant':
      return arr.sort((a, b) =>
        (a.merchant || a.note || '').localeCompare(b.merchant || b.note || '') || byDateDesc(a, b));
    default:
      return arr;
  }
}

/* ── Timeline grouping ── */
export interface TxGroup { key: string; label: string; items: ExpenseItem[] }

/** Local YYYY-MM-DD for a Date (mirrors expense.ts ymdLocal, kept local to avoid a cycle). */
function ymd(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

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
        : monthName(mk);
      push('m_' + mk, label, e);
    }
  }
  return groups;
}

function monthName(mk: string): string {
  const [yr, mo] = mk.split('-').map(Number);
  if (!yr || !mo) return 'Earlier';
  const d = new Date(yr, mo - 1, 1);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, sameYear ? { month: 'long' } : { month: 'long', year: 'numeric' });
}
