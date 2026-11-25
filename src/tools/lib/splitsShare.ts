import { loadExpenses, type ExpenseItem } from './expense';
import { fromPaise } from './groupSplit';
import { applySharePlan, resolveShareCategory, type SharePlan } from './groupShare';
import { myShareOf, type BillEntry } from './splits';

/**
 * Your share of a bill split with people not on FinatriX, copied into your own
 * Expense Tracker (step 2.5), through 2.4's `applySharePlan`: the same audit
 * trail, and a deletion tombstone so cloud sync never brings a removed copy back.
 *
 * - Only your share of a bill is spending. Money lent or borrowed, and
 *   settlements, never reach the tracker.
 * - One copy per bill, `tx_split_<bill id>`, written when the bill is saved.
 *   The bill and the copy are both synced data, so another device receives
 *   both and needs no catch-up of its own.
 * - Saving the bill again replaces the copy; deleting the bill removes it.
 */

export const SPLIT_COPY_PREFIX = 'tx_split_';
export const SPLIT_TAG = 'Split';
export const splitCopyId = (billId: string): string => `${SPLIT_COPY_PREFIX}${billId}`;

/** What the ledger needs after `bill` was saved or deleted. Pure. */
export function planSplitCopy(
  bill: BillEntry,
  ledger: readonly ExpenseItem[],
  resolveCategory: (value: string, month: string) => string,
  now = new Date(),
): SharePlan {
  const id = splitCopyId(bill.id);
  const existing = ledger.find((e) => e.id === id);
  const mine = myShareOf(bill);
  if (mine <= 0) return { upsert: [], remove: existing ? [{ id, at: now.getTime() }] : [] };
  const stamp = now.toISOString();
  const copy: ExpenseItem = {
    ...(existing ?? {}),
    id,
    amount: fromPaise(mine),
    category: resolveCategory(bill.category, bill.date.slice(0, 7)),
    date: bill.date,
    ...(bill.note ? { note: bill.note } : {}),
    tags: [SPLIT_TAG],
    createdAt: existing?.createdAt ?? stamp,
    updatedAt: stamp,
  };
  if (!bill.note) delete copy.note;
  return { upsert: [copy], remove: [] };
}

/** Bring your tracker in line with this bill. Returns whether the ledger changed. */
export function syncSplitCopy(bill: BillEntry, now = new Date()): boolean {
  return applySharePlan(planSplitCopy(bill, loadExpenses(), resolveShareCategory, now), now.getTime());
}
