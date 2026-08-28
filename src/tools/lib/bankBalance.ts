/**
 * Opening and closing bank balances — the reconciliation the tracker was
 * missing.
 *
 * WHY IT MATTERS
 * --------------
 * A ledger of expenses answers "where did my money go". It cannot answer "is
 * that all of it". Two numbers close that gap: what was in the account on the
 * first of the month and what was in it on the last. Everything between them is
 * money that moved, and the difference between the movement the user *recorded*
 * and the movement the bank *performed* is the amount they have not logged.
 *
 *     expected closing = opening + income − recorded outflow
 *     unrecorded       = actual closing − expected closing
 *
 * A negative `unrecorded` is spending that never made it into the ledger; a
 * positive one is money that arrived and was not booked. Naming it is the whole
 * point — an unexplained 400 is a prompt to go and look, and a tracker that
 * quietly assumes its own ledger is complete is a tracker that is confidently
 * wrong every month.
 *
 * CARRY-FORWARD
 * -------------
 * A month's opening balance is whatever the previous month closed at. The user
 * types one figure a month, not two, and the chain is unbroken back to the
 * first month they recorded. An explicitly typed opening always wins over the
 * inherited one — that is how someone corrects a chain that has drifted, and
 * the difference between the two is reported rather than swallowed.
 *
 * Pure apart from the load/save pair.
 */
import { getJSON, setJSON } from './storage';
import { prevMonth } from './month';
import { migrateCategory, type ExpenseItem } from './expense';

/** Storage key. Synced, because a balance that only exists on the laptop is half a record. */
export const BANK_KEY = 'fx_exp_bank';

/** What the user typed for one month. Either field may be absent. */
export interface BankMonth {
  /** Balance at the start of the month, when explicitly recorded. */
  opening?: number;
  /** Balance at the end of the month, when explicitly recorded. */
  closing?: number;
  /**
   * Net Worth account this balance mirrors, when the user linked one. The link
   * is one-directional on purpose: the tracker pushes a closing balance into
   * Net Worth, and never reads one back — two screens writing the same figure
   * to each other is how a value ends up with no author.
   */
  accountId?: string;
}

export type BankStore = Record<string, BankMonth>;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function loadBankStore(): BankStore {
  const raw = getJSON<Record<string, unknown>>(BANK_KEY, {});
  const out: BankStore = {};
  for (const [month, entry] of Object.entries(raw ?? {})) {
    if (!MONTH_RE.test(month) || !entry || typeof entry !== 'object') continue;
    const e = entry as BankMonth;
    const row: BankMonth = {};
    const o = num(e.opening);
    const c = num(e.closing);
    if (o !== undefined) row.opening = o;
    if (c !== undefined) row.closing = c;
    if (typeof e.accountId === 'string' && e.accountId) row.accountId = e.accountId;
    if (row.opening !== undefined || row.closing !== undefined || row.accountId) out[month] = row;
  }
  return out;
}

export function saveBankStore(store: BankStore): void {
  setJSON(BANK_KEY, store);
}

/**
 * Write one field for one month, dropping the month entirely when nothing is
 * left. An empty `{}` in the store is a month that looks recorded and is not.
 */
export function setBankField(
  store: BankStore,
  month: string,
  field: 'opening' | 'closing',
  value: number | null,
): BankStore {
  const next: BankStore = { ...store };
  const row: BankMonth = { ...(next[month] ?? {}) };
  if (value === null || !Number.isFinite(value)) delete row[field];
  else row[field] = value;
  if (row.opening === undefined && row.closing === undefined && !row.accountId) delete next[month];
  else next[month] = row;
  return next;
}

export function setBankAccountLink(store: BankStore, month: string, accountId: string | null): BankStore {
  const next: BankStore = { ...store };
  const row: BankMonth = { ...(next[month] ?? {}) };
  if (accountId) row.accountId = accountId;
  else delete row.accountId;
  if (row.opening === undefined && row.closing === undefined && !row.accountId) delete next[month];
  else next[month] = row;
  return next;
}

/**
 * The opening balance for `month`: its own if recorded, otherwise the closing
 * balance carried forward from the most recent earlier month that has one.
 *
 * Walks back at most 24 months. A chain longer than two years without a single
 * recorded balance is not a chain, and following it forever would make an
 * unbounded loop out of a malformed store.
 */
export function inheritedOpening(store: BankStore, month: string): { value: number; from: string } | null {
  let m = prevMonth(month);
  for (let i = 0; i < 24; i += 1) {
    const closing = store[m]?.closing;
    if (closing !== undefined) return { value: closing, from: m };
    const opening = store[m]?.opening;
    // A month with an opening but no closing still anchors the chain — it just
    // anchors it at the start of that month rather than the end.
    if (opening !== undefined) return { value: opening, from: m };
    m = prevMonth(m);
  }
  return null;
}

export interface BankReconciliation {
  /** True when there is an opening balance to reason from at all. */
  applicable: boolean;
  /** The opening balance in force, explicit or inherited. */
  opening: number | null;
  /** Where `opening` came from: the user typed it, or it carried forward. */
  openingSource: 'recorded' | 'carried' | 'none';
  /** The month `opening` was carried from, when it was carried. */
  carriedFrom: string | null;
  /** The closing balance the user recorded, when they did. */
  closing: number | null;
  /** Income for the month, from Budget Builder. */
  income: number;
  /** Everything logged in the ledger for this month — spending and transfers alike. */
  outflow: number;
  /** `opening + income − outflow`. Null without an opening balance. */
  expectedClosing: number | null;
  /**
   * `closing − expectedClosing`. Null until both are known.
   *
   * Negative means money left the account that the ledger does not explain;
   * positive means money arrived that it does not explain either.
   */
  unrecorded: number | null;
  /** Net movement across the month: `closing − opening`. Null until both are known. */
  netChange: number | null;
}

export interface BankInput {
  store: BankStore;
  month: string;
  items: readonly ExpenseItem[];
  /** Take-home income for the month, from Budget Builder. */
  income: number;
  /** Valid category keys — only used to resolve legacy keys consistently. */
  validKeys: ReadonlySet<string>;
}

/**
 * Reconcile the ledger against the account.
 *
 * `outflow` is the WHOLE ledger for the month, savings and transfers included —
 * unlike almost every other figure in this codebase, which carefully separates
 * consumption from money set aside. That is not an oversight: a SIP debit
 * leaves the bank account exactly as a restaurant bill does, and a
 * reconciliation that excluded it would report every disciplined saver as
 * having thousands of unexplained spending every month.
 */
export function reconcileBank({ store, month, items, income, validKeys }: BankInput): BankReconciliation {
  const row = store[month] ?? {};
  const inherited = row.opening === undefined ? inheritedOpening(store, month) : null;

  const opening = row.opening ?? inherited?.value ?? null;
  const openingSource: BankReconciliation['openingSource'] =
    row.opening !== undefined ? 'recorded' : inherited ? 'carried' : 'none';

  let outflow = 0;
  for (const e of items) {
    if ((e.date || '').slice(0, 7) !== month) continue;
    // Resolved for consistency with every other figure on the page, even
    // though the sum does not depend on which bucket the key lands in.
    migrateCategory(e.category, validKeys);
    outflow += e.amount;
  }

  const closing = row.closing ?? null;
  const expectedClosing = opening === null ? null : opening + income - outflow;

  return {
    applicable: opening !== null,
    opening,
    openingSource,
    carriedFrom: inherited?.from ?? null,
    closing,
    income,
    outflow,
    expectedClosing,
    unrecorded: closing === null || expectedClosing === null ? null : closing - expectedClosing,
    netChange: closing === null || opening === null ? null : closing - opening,
  };
}

/**
 * How big an unexplained difference has to be before it is worth mentioning.
 *
 * Rounding, a card hold and a 1.50 bank fee are not the user's problem. The
 * threshold is proportional to what actually moved so it means the same thing
 * to someone moving 500 a month and someone moving 5,000,000 — with an absolute
 * floor, because 0.5% of a very large month is still a very large number and
 * 0.5% of a very small one rounds to nothing.
 */
export function isSignificantDiscrepancy(unrecorded: number | null, outflow: number, income: number): boolean {
  if (unrecorded === null) return false;
  const moved = Math.abs(outflow) + Math.abs(income);
  const threshold = Math.max(1, moved * 0.005);
  return Math.abs(unrecorded) > threshold;
}
