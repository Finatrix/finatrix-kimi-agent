/**
 * The writes behind a confirm card, and their undo.
 *
 * Nothing here runs until the user taps Save. Each write goes through the same
 * storage, audit trail and sync bookkeeping as the screen that owns the data:
 *
 *   expense — `saveExpenses` + `recordAudit`, the path `logSubscriptionPayment`
 *             uses; Undo deletes the row the way the Expense Tracker does
 *             (an audit `delete` event and a sync tombstone).
 *   budget  — one category amount in `fx_bb_data` for the month. Budget Builder
 *             refreshes from the `fx:write` event if it is open.
 *
 * Undo only reverses what the card did: if the row or the amount was changed
 * since, it says so and leaves the user's newer change alone.
 */
import { genExpenseId, loadExpenses, saveExpenses, type ExpenseItem } from '../../lib/expense';
import { auditEvent, recordAudit } from '../../lib/expenseAudit';
import { recordDeletions } from '../../lib/expenseTombstones';
import { getJSON, setJSON } from '../../lib/storage';
import { loadTrips } from '../../lib/trips';
import type { BudgetStore } from '../../lib/budget';
import { priceExpense, type BudgetAction, type ExpenseAction } from './plan';

export type WriteResult<T> = { ok: true; action: T } | { ok: false; message: string };

const FULL = 'This device’s storage is full, so that could not be saved. Export a backup from Settings.';

export function saveExpenseAction(a: ExpenseAction, now = new Date()): WriteResult<ExpenseAction> {
  if (a.status !== 'pending') return { ok: false, message: 'This card has already been used.' };
  if (!a.category) return { ok: false, message: 'Pick a category first.' };
  const priced = priceExpense(a, loadTrips());
  if (!priced.ok) return priced;
  const iso = now.toISOString();
  const item: ExpenseItem = {
    id: genExpenseId(),
    ...priced.money,
    category: a.category,
    date: a.date,
    ...(a.note ? { note: a.note } : {}),
    ...(a.paymentMethod ? { paymentMethod: a.paymentMethod } : {}),
    createdAt: iso,
    updatedAt: iso,
  };
  if (!saveExpenses([item, ...loadExpenses()])) return { ok: false, message: FULL };
  recordAudit([auditEvent('add', item)]);
  return { ok: true, action: { ...a, status: 'saved', savedId: item.id } };
}

export function undoExpenseAction(a: ExpenseAction): WriteResult<ExpenseAction> {
  if (a.status !== 'saved' || !a.savedId) return { ok: false, message: 'There is nothing to undo.' };
  const items = loadExpenses();
  const row = items.find((e) => e.id === a.savedId);
  if (!row) return { ok: true, action: { ...a, status: 'undone' } };
  if (!saveExpenses(items.filter((e) => e.id !== a.savedId))) return { ok: false, message: FULL };
  recordAudit([auditEvent('delete', row)]);
  recordDeletions([row.id]);
  return { ok: true, action: { ...a, status: 'undone' } };
}

function readBudgets(): BudgetStore {
  return getJSON<BudgetStore>('fx_bb_data', {});
}

export function saveBudgetAction(a: BudgetAction): WriteResult<BudgetAction> {
  if (a.status !== 'pending') return { ok: false, message: 'This card has already been used.' };
  const store = readBudgets();
  const month = store[a.month];
  if (!month) return { ok: false, message: 'This month’s budget isn’t set up yet. Start it in Budget Builder.' };
  const vals = month.vals ?? {};
  const previous = Object.hasOwn(vals, a.category) ? Number(vals[a.category]) || 0 : null;
  const next: BudgetStore = { ...store, [a.month]: { ...month, vals: { ...vals, [a.category]: a.amount } } };
  if (!setJSON('fx_bb_data', next)) return { ok: false, message: FULL };
  return { ok: true, action: { ...a, status: 'saved', previous } };
}

export function undoBudgetAction(a: BudgetAction): WriteResult<BudgetAction> {
  if (a.status !== 'saved') return { ok: false, message: 'There is nothing to undo.' };
  const store = readBudgets();
  const month = store[a.month];
  const vals = { ...(month?.vals ?? {}) };
  if (!month || Number(vals[a.category]) !== a.amount) {
    return { ok: false, message: 'That budget has changed since, so it was left as it is now.' };
  }
  if (a.previous == null) delete vals[a.category];
  else vals[a.category] = a.previous;
  if (!setJSON('fx_bb_data', { ...store, [a.month]: { ...month, vals } })) return { ok: false, message: FULL };
  return { ok: true, action: { ...a, status: 'undone' } };
}
