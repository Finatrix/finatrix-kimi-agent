/**
 * Net Worth tracker — the model.
 *
 * WHAT IT COMPUTES
 * ----------------
 * One subtraction, done honestly:
 *
 *     net worth (month) = total assets (month) − total liabilities (month)
 *
 * There is no rate of return here, no inflation adjustment and no projection.
 * Every figure this file produces is a balance the user typed in, or a sum of
 * balances the user typed in. That is a deliberate product decision, and it is
 * the same one the Calendar makes: a number nobody entered is a number nobody
 * should be shown next to their own.
 *
 * THE ONE RULE WORTH READING
 * --------------------------
 * Balances CARRY FORWARD. An account records a balance in the months the user
 * updated it, and its value in any other month is the most recent balance on or
 * before that month. Without this, tracking net worth would mean re-typing a
 * PPF balance and a home-loan outstanding every single month, and the first
 * month someone skipped would show their net worth collapsing.
 *
 * The cost of the rule is staleness, so it is made visible rather than hidden:
 * `staleAccounts` reports what has not been touched lately, and an account
 * contributes nothing at all to a month BEFORE its first recorded balance —
 * a home loan taken in March does not reach back and reduce February.
 *
 * Everything here is pure apart from `loadAccounts`/`saveAccounts`, which are
 * the storage boundary.
 */
import type { IconName } from '../ui/Icon';
import { getJSON, setJSON } from './storage';
import { currentMonth } from './month';

export type AccountKind = 'asset' | 'liability';

export interface NetWorthCategory {
  /** Stable key. Stored on the account — never renamed, only added to. */
  k: string;
  /** Human label. */
  l: string;
  ic: IconName;
  kind: AccountKind;
}

/**
 * The taxonomy. Fixed rather than user-defined, on purpose: the value of a net
 * worth view is comparing the same buckets over years, and a taxonomy that
 * drifts makes its own history unreadable. "Something else" absorbs the rest.
 */
export const NET_WORTH_CATEGORIES: readonly NetWorthCategory[] = [
  { k: 'cash', l: 'Cash & bank', ic: 'bank', kind: 'asset' },
  { k: 'deposits', l: 'Deposits (FD/RD)', ic: 'lock', kind: 'asset' },
  { k: 'equity', l: 'Stocks & mutual funds', ic: 'invest-cat', kind: 'asset' },
  { k: 'retirement', l: 'EPF, PPF & NPS', ic: 'shield', kind: 'asset' },
  { k: 'property', l: 'Property', ic: 'home', kind: 'asset' },
  { k: 'gold', l: 'Gold & jewellery', ic: 'award', kind: 'asset' },
  { k: 'vehicle', l: 'Vehicles', ic: 'car', kind: 'asset' },
  { k: 'other_asset', l: 'Other assets', ic: 'other', kind: 'asset' },
  { k: 'home_loan', l: 'Home loan', ic: 'home', kind: 'liability' },
  { k: 'vehicle_loan', l: 'Vehicle loan', ic: 'car', kind: 'liability' },
  { k: 'education_loan', l: 'Education loan', ic: 'education', kind: 'liability' },
  { k: 'personal_loan', l: 'Personal loan', ic: 'emi', kind: 'liability' },
  { k: 'credit_card', l: 'Credit card', ic: 'bills', kind: 'liability' },
  { k: 'other_liability', l: 'Other debt', ic: 'other', kind: 'liability' },
];

const CATEGORY_BY_KEY = new Map(NET_WORTH_CATEGORIES.map((c) => [c.k, c]));

export function categoryFor(key: string): NetWorthCategory | null {
  return CATEGORY_BY_KEY.get(key) ?? null;
}

export function categoriesFor(kind: AccountKind): NetWorthCategory[] {
  return NET_WORTH_CATEGORIES.filter((c) => c.kind === kind);
}

export interface NetWorthAccount {
  id: string;
  /** What the user calls it — "HDFC savings", "Flat in Pune". */
  name: string;
  kind: AccountKind;
  /** A key from NET_WORTH_CATEGORIES. */
  category: string;
  /**
   * Recorded balances, keyed by "YYYY-MM".
   *
   * Always a positive magnitude, for a liability as much as an asset: "how much
   * do I still owe" is the question people can answer, and storing debt as a
   * negative number is how a sign error turns into a wrong net worth.
   */
  balances: Record<string, number>;
  note?: string;
}

export const NET_WORTH_KEY = 'fx_networth';

export function genAccountId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return 'nw_' + crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return 'nw_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

/** "YYYY-MM" and nothing else. Guards the balance map against junk keys. */
function isMonthKey(k: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(k);
}

/**
 * Coerce a stored record into a well-formed account.
 *
 * Storage is a text file the user can edit, a cloud row written by an older
 * build, or a half-finished migration — so nothing here trusts its input. An
 * unknown category falls back to the "other" bucket of its own kind rather than
 * vanishing, because losing an account is worse than mis-filing one.
 */
export function normalizeAccount(raw: Partial<NetWorthAccount> & { id?: string | number }): NetWorthAccount {
  const kind: AccountKind = raw.kind === 'liability' ? 'liability' : 'asset';
  const category = typeof raw.category === 'string' && CATEGORY_BY_KEY.get(raw.category)?.kind === kind
    ? raw.category
    : kind === 'asset' ? 'other_asset' : 'other_liability';

  const balances: Record<string, number> = {};
  const rawBalances = raw.balances;
  if (rawBalances && typeof rawBalances === 'object') {
    for (const [month, value] of Object.entries(rawBalances)) {
      if (!isMonthKey(month)) continue;
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      balances[month] = Math.max(0, n);
    }
  }

  return {
    id: raw.id === undefined || raw.id === null || raw.id === '' ? genAccountId() : String(raw.id),
    name: String(raw.name ?? '').trim() || 'Untitled account',
    kind,
    category,
    balances,
    ...(raw.note ? { note: String(raw.note) } : {}),
  };
}

export function loadAccounts(): NetWorthAccount[] {
  const arr = getJSON<Array<Partial<NetWorthAccount> & { id?: string | number }>>(NET_WORTH_KEY, []);
  return Array.isArray(arr) ? arr.map(normalizeAccount) : [];
}

export function saveAccounts(accounts: readonly NetWorthAccount[]): void {
  setJSON(NET_WORTH_KEY, accounts);
}

/* ─────────────────────────────────────────────────────────────────────────
   The arithmetic
   ───────────────────────────────────────────────────────────────────────── */

/**
 * The account's balance in `month` under the carry-forward rule, or `null` when
 * the account did not exist yet (no recorded balance on or before `month`).
 *
 * `null` and `0` are different answers and the difference matters: zero is a
 * loan that has been paid off and should be shown as such, while null is an
 * account that had not been opened and must not appear at all.
 */
export function balanceAt(account: NetWorthAccount, month: string): number | null {
  let best: string | null = null;
  for (const key of Object.keys(account.balances)) {
    if (key <= month && (best === null || key > best)) best = key;
  }
  return best === null ? null : account.balances[best];
}

/** The month whose balance `balanceAt` used, for "last updated" copy. */
export function lastRecordedMonth(account: NetWorthAccount, month: string): string | null {
  let best: string | null = null;
  for (const key of Object.keys(account.balances)) {
    if (key <= month && (best === null || key > best)) best = key;
  }
  return best;
}

export interface AccountBalance {
  account: NetWorthAccount;
  balance: number;
  /** The month this balance was actually recorded in (≤ the month asked for). */
  recorded: string;
  /** Whether the balance was entered for the month being viewed. */
  current: boolean;
  /** Share of its own side of the sheet (assets or liabilities), 0–100. */
  share: number;
}

export interface CategoryTotal {
  category: NetWorthCategory;
  total: number;
  /** Share of its own side of the sheet, 0–100. */
  share: number;
}

export interface NetWorthSnapshot {
  month: string;
  assets: number;
  liabilities: number;
  /** assets − liabilities. Negative is a real, valid answer. */
  net: number;
  assetRows: AccountBalance[];
  liabilityRows: AccountBalance[];
  assetCategories: CategoryTotal[];
  liabilityCategories: CategoryTotal[];
  /** Liabilities as a share of assets, 0–100+. Null when there are no assets. */
  debtRatio: number | null;
}

function rowsFor(
  accounts: readonly NetWorthAccount[],
  month: string,
  kind: AccountKind,
): { rows: AccountBalance[]; total: number } {
  const rows: AccountBalance[] = [];
  let total = 0;
  for (const account of accounts) {
    if (account.kind !== kind) continue;
    const balance = balanceAt(account, month);
    if (balance === null) continue; // did not exist yet
    const recorded = lastRecordedMonth(account, month)!;
    rows.push({ account, balance, recorded, current: recorded === month, share: 0 });
    total += balance;
  }
  for (const row of rows) row.share = total > 0 ? (row.balance / total) * 100 : 0;
  rows.sort((a, b) => b.balance - a.balance || a.account.name.localeCompare(b.account.name));
  return { rows, total };
}

function categoryTotals(rows: readonly AccountBalance[], total: number, kind: AccountKind): CategoryTotal[] {
  const sums = new Map<string, number>();
  for (const row of rows) {
    sums.set(row.account.category, (sums.get(row.account.category) ?? 0) + row.balance);
  }
  return categoriesFor(kind)
    .filter((c) => (sums.get(c.k) ?? 0) > 0)
    .map((category) => ({
      category,
      total: sums.get(category.k) ?? 0,
      share: total > 0 ? ((sums.get(category.k) ?? 0) / total) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

/** The whole balance sheet for one month. Pure. */
export function computeNetWorth(
  accounts: readonly NetWorthAccount[],
  month: string,
): NetWorthSnapshot {
  const assetsSide = rowsFor(accounts, month, 'asset');
  const liabilitiesSide = rowsFor(accounts, month, 'liability');
  return {
    month,
    assets: assetsSide.total,
    liabilities: liabilitiesSide.total,
    net: assetsSide.total - liabilitiesSide.total,
    assetRows: assetsSide.rows,
    liabilityRows: liabilitiesSide.rows,
    assetCategories: categoryTotals(assetsSide.rows, assetsSide.total, 'asset'),
    liabilityCategories: categoryTotals(liabilitiesSide.rows, liabilitiesSide.total, 'liability'),
    debtRatio: assetsSide.total > 0 ? (liabilitiesSide.total / assetsSide.total) * 100 : null,
  };
}

/** Every month the user has recorded anything in, plus the current month. */
export function monthsWithData(accounts: readonly NetWorthAccount[], now = currentMonth()): string[] {
  const set = new Set<string>();
  for (const account of accounts) {
    for (const month of Object.keys(account.balances)) set.add(month);
  }
  set.add(now);
  return [...set].sort();
}

export interface SeriesPoint {
  month: string;
  assets: number;
  liabilities: number;
  net: number;
}

/**
 * The trend, from the first month anything was recorded to `through`.
 *
 * Every month in between is included, recorded or not — a gap in the x-axis
 * would draw a straight line between two dates that are not adjacent, which
 * reads as a slower or faster change than actually happened.
 */
export function netWorthSeries(
  accounts: readonly NetWorthAccount[],
  through = currentMonth(),
): SeriesPoint[] {
  // Recorded months only — deliberately NOT `monthsWithData`, which injects the
  // current month so the month navigator always has one to land on. A user with
  // no accounts has no trend, and a lone zero point is not the honest way to say
  // that.
  const recorded: string[] = [];
  for (const account of accounts) {
    for (const month of Object.keys(account.balances)) {
      if (month <= through) recorded.push(month);
    }
  }
  if (!recorded.length) return [];
  recorded.sort();
  const out: SeriesPoint[] = [];
  let cursor = recorded[0];
  // Bounded by construction: `cursor` strictly increases and stops at `through`.
  while (cursor <= through) {
    const snapshot = computeNetWorth(accounts, cursor);
    out.push({
      month: cursor,
      assets: snapshot.assets,
      liabilities: snapshot.liabilities,
      net: snapshot.net,
    });
    const [y, m] = cursor.split('-').map(Number);
    cursor = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;
  }
  return out;
}

export interface Change {
  /** Signed difference. */
  abs: number;
  /**
   * Percentage change, or null when it would be meaningless — a change from
   * zero (or across zero) has no percentage, and "+∞%" is not an insight.
   */
  pct: number | null;
}

export function changeBetween(from: number, to: number): Change {
  const abs = to - from;
  const pct = from > 0 && to >= 0 ? (abs / from) * 100 : null;
  return { abs, pct };
}

/**
 * Accounts whose balance is older than `months` months at `asOf`.
 *
 * The honest counterweight to carry-forward: a net worth built from a
 * two-year-old mutual-fund balance is fiction, and the only way this tool can
 * be trusted is by saying so itself.
 */
export function staleAccounts(
  accounts: readonly NetWorthAccount[],
  asOf = currentMonth(),
  months = 3,
): NetWorthAccount[] {
  return accounts.filter((account) => {
    const recorded = lastRecordedMonth(account, asOf);
    if (recorded === null) return false; // not open yet — not stale
    return monthsBetween(recorded, asOf) >= months;
  });
}

/** Whole months from `a` to `b` ("YYYY-MM"). Negative when `b` precedes `a`. */
export function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

/**
 * Set (or clear) one account's balance for one month.
 *
 * Returns a new list — the page holds accounts in React state, and mutating in
 * place is how a "saved" indicator ends up disagreeing with the screen. An
 * empty string clears the entry for that month, which is not the same as
 * writing zero: clearing restores the carry-forward from the previous entry.
 */
export function setBalance(
  accounts: readonly NetWorthAccount[],
  id: string,
  month: string,
  value: number | null,
): NetWorthAccount[] {
  return accounts.map((account) => {
    if (account.id !== id) return account;
    const balances = { ...account.balances };
    if (value === null) delete balances[month];
    else balances[month] = Math.max(0, value);
    return { ...account, balances };
  });
}

/** Rows for the CSV export: one line per account per recorded month. */
export function exportRows(accounts: readonly NetWorthAccount[]): (string | number)[][] {
  const rows: (string | number)[][] = [['Month', 'Type', 'Category', 'Account', 'Balance']];
  const months = new Set<string>();
  for (const account of accounts) for (const m of Object.keys(account.balances)) months.add(m);
  for (const month of [...months].sort()) {
    for (const account of accounts) {
      const value = account.balances[month];
      if (value === undefined) continue;
      rows.push([
        month,
        account.kind === 'asset' ? 'Asset' : 'Liability',
        categoryFor(account.category)?.l ?? account.category,
        account.name,
        value,
      ]);
    }
  }
  return rows;
}
