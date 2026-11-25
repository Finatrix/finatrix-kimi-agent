import { allCategories } from './budget';
import { loadCatViewFor } from './budgetCatsMonth';
import { loadExpenses, migrateCategory, saveExpenses, type ExpenseItem } from './expense';
import { auditEvent, auditEdit, recordAudit, type AuditEntry } from './expenseAudit';
import { clearDeletions, loadTombstones, recordDeletions, type TombstoneMap } from './expenseTombstones';
import { groupNote, type GroupExpenseRow } from './groups';
import { fromPaise, shareOf } from './groupSplit';
import { store } from './storage';
import { effectiveRates, type RateTable } from './fx';
import { isHomeTrip, loadTrips, tripHomeAmount, tripOn, tripRateFor, type Trip } from './trips';

/**
 * Your share of a Split-costs expense, copied into your own Expense Tracker
 * (NEW_FEATURES item 12, step 2.4). The rules are in
 * `step-2.4-maths-proposal.md` section 6 and docs/GROUPS.md.
 *
 * - Only YOUR share counts as your spending (what others owe you is not), and
 *   Budget-together expenses are never copied.
 * - One copy per group expense, with the id `tx_grp_<group expense id>`. The id
 *   is the same on every device you use, so a repeated Realtime event, a
 *   reconnect or a second phone upserts the same row and never duplicates it.
 * - The copy follows the group expense when its `updated_at` changes. Edit the
 *   copy yourself and it stays until the group expense changes again.
 * - Deleting the group expense removes the copy (a normal deletion, so cloud
 *   sync does not bring it back); undoing the delete puts it back. Delete the
 *   copy yourself and it stays deleted until the group expense changes.
 * - Leaving the group stops all updates; the copies stay as ordinary spends.
 * - A copy is a plain personal expense; nothing reads the ledger back into a group.
 * - A group in another currency (a trip group, or members in other countries,
 *   step 3.9): the share is priced into your home currency with travel mode's
 *   formula and no card fee, at your trip's fixed rate when a trip of yours in
 *   that currency covers the day, else at the live rate. The copy keeps the
 *   rate it was first made with. No rate: no copy, never a guess.
 */

export const SHARE_ID_PREFIX = 'tx_grp_';
export const shareCopyId = (groupExpenseId: string): string => `${SHARE_ID_PREFIX}${groupExpenseId}`;

/** Where each group's catch-up stopped (an `updated_at`). Per device and account, cleared with them. */
export const SHARE_CURSOR_KEY = 'fx_group_share_cursor';

export interface ShareGroup {
  id: string;
  name: string;
  currency: string;
  /** Your member id in the group. */
  memberId: string;
}

export interface SharePlan {
  /** Copies to add or replace (by id). */
  upsert: ExpenseItem[];
  /** Copies to remove, with when the group expense was deleted. */
  remove: Array<{ id: string; at: number }>;
  /** Shares left out because there is no rate for the group's currency yet. */
  noRate?: number;
}

/** The rate a share in another currency is priced at, for the expense's day. */
export interface ShareRate {
  rate: number;
  /** Set when the rate is a trip's fixed rate: the copy is that trip's spending. */
  tripId?: string;
}

/**
 * Where a share in `currency` gets its rate (step 3.9): a trip of yours in that
 * currency covering the day, else travel mode's live rate (feed plus your own
 * overrides), else none.
 */
export function shareRateFor(
  currency: string,
  home: string,
  trips: readonly Trip[] = loadTrips(),
  rates: RateTable = effectiveRates(),
): (ymd: string) => ShareRate | null {
  const live = tripRateFor(currency, home, rates);
  return (ymd) => {
    const trip = tripOn(trips, ymd);
    if (trip && !isHomeTrip(trip) && trip.currency === currency && trip.homeCurrency === home && trip.rate > 0) {
      return { rate: trip.rate, tripId: trip.id };
    }
    return live ? { rate: live } : null;
  };
}

/** What the note of a copy says: the group expense's own note, else the group's name. */
function copyFields(row: GroupExpenseRow): Pick<ExpenseItem, 'note' | 'merchant'> {
  const note = groupNote('', row.note ?? '');
  return note ? { note } : {};
}

/**
 * Decide what the ledger needs, from the group's expenses. Pure: it reads the
 * ledger and tombstones it is given and returns changes, so it is easy to test
 * and safe to run again and again (the same input gives an empty plan the
 * second time).
 */
export function planShareCopies(opts: {
  group: ShareGroup;
  expenses: readonly GroupExpenseRow[];
  ledger: readonly ExpenseItem[];
  tombstones: TombstoneMap;
  /** The tracker's own currency: shares are copied only when the group uses it. */
  homeCurrency: string;
  /** The group's category value to a personal category key, for that date's month. */
  resolveCategory: (value: string, month: string) => string;
  /** For a group in another currency: the rate for a day, or null. Without it, such shares aren't copied. */
  rateFor?: (ymd: string) => ShareRate | null;
  now?: Date;
}): SharePlan {
  const { group, expenses, ledger, tombstones, homeCurrency, resolveCategory, rateFor } = opts;
  const now = opts.now ?? new Date();
  const plan: SharePlan = { upsert: [], remove: [] };
  const sameCurrency = group.currency.toUpperCase() === homeCurrency.toUpperCase();
  const byId = new Map(ledger.map((e) => [e.id, e]));

  for (const row of expenses) {
    if (row.group_id !== group.id || row.split_rule == null) continue; // Budget together: never copied.
    const id = shareCopyId(row.id);
    const existing = byId.get(id);
    const mine = row.deleted_at || (!sameCurrency && !rateFor) ? 0 : shareOf(row, group.memberId);

    if (mine <= 0) {
      if (existing) plan.remove.push({ id, at: row.deleted_at ? Date.parse(row.deleted_at) || now.getTime() : now.getTime() });
      continue;
    }

    const version = row.updated_at;
    if (existing) {
      if (existing.groupShare?.v === version) continue; // up to date; a personal edit stays
    } else {
      const deletedAt = tombstones[id];
      // Deleted by you after the group expense last changed: it stays deleted.
      if (deletedAt != null && deletedAt >= (Date.parse(version) || 0)) continue;
    }
    // Another currency: priced with travel mode's formula, no card fee. The
    // copy keeps the rate it was first made with, so an edit doesn't move it.
    let money: Pick<ExpenseItem, 'amount' | 'fxAmount' | 'fxCurrency' | 'fxRate' | 'tripId'> = { amount: fromPaise(mine) };
    if (!sameCurrency) {
      const kept = existing && existing.fxCurrency === group.currency && (existing.fxRate ?? 0) > 0
        ? { rate: existing.fxRate!, ...(existing.tripId ? { tripId: existing.tripId } : {}) }
        : null;
      const priced = kept ?? rateFor?.(row.spent_on) ?? null;
      if (!priced) {
        plan.noRate = (plan.noRate ?? 0) + 1;
        continue;
      }
      const foreign = fromPaise(mine);
      money = {
        amount: tripHomeAmount(foreign, priced.rate, undefined, undefined),
        fxAmount: foreign,
        fxCurrency: group.currency,
        fxRate: priced.rate,
        ...(priced.tripId ? { tripId: priced.tripId } : {}),
      };
    }
    const month = row.spent_on.slice(0, 7);
    const stamp = now.toISOString();
    const base = { ...(existing ?? {}) } as Partial<ExpenseItem>;
    // A re-priced copy never keeps a stale trip tag or charged-amount fix.
    if (!sameCurrency) { delete base.tripId; delete base.fxCharged; delete base.fxFee; }
    plan.upsert.push({
      ...base,
      id,
      ...money,
      category: resolveCategory(row.category, month),
      date: row.spent_on,
      ...copyFields(row),
      tags: [group.name],
      groupShare: { groupId: group.id, expenseId: row.id, name: group.name, v: version },
      createdAt: existing?.createdAt ?? stamp,
      updatedAt: stamp,
      ...(existing?.editCount ? { editCount: existing.editCount } : {}),
    } as ExpenseItem);
  }
  return plan;
}

/** The group's category (a built-in key, or a name someone typed) as a category this month has. */
export function resolveShareCategory(value: string, month: string): string {
  const keys = allCategories(loadCatViewFor(month).active).filter((c) => c.section !== 'save').map((c) => c.k);
  const valid = new Set(keys);
  const resolved = migrateCategory(value, valid);
  if (valid.has(resolved)) return resolved;
  return valid.has('other') ? 'other' : keys[0] ?? value;
}

/**
 * Write a plan through the ledger's rules: the same audit trail as any other
 * change, and a tombstone for every removal (what `commit()` in the Expense
 * Tracker derives), so a deletion survives cloud sync. Returns whether the
 * ledger changed.
 */
export function applySharePlan(plan: SharePlan, now = Date.now()): boolean {
  if (plan.upsert.length === 0 && plan.remove.length === 0) return false;
  const ledger = loadExpenses();
  const byId = new Map(ledger.map((e) => [e.id, e]));
  const events: AuditEntry[] = [];
  const restored: string[] = [];
  const upsertIds = new Set(plan.upsert.map((e) => e.id));
  const removedIds = new Set(plan.remove.filter((r) => byId.has(r.id) && !upsertIds.has(r.id)).map((r) => r.id));
  const removedItems = ledger.filter((e) => removedIds.has(e.id));

  let next = ledger.filter((e) => !removedIds.has(e.id));
  const added: ExpenseItem[] = [];
  for (const item of plan.upsert) {
    const before = byId.get(item.id);
    if (before) {
      next = next.map((e) => (e.id === item.id ? { ...item, editCount: (before.editCount ?? 0) + 1 } : e));
      const edit = auditEdit(before, item);
      if (edit) events.push(edit);
    } else {
      added.push(item);
      events.push(auditEvent('add', item));
      restored.push(item.id);
    }
  }
  next = [...added, ...next];
  for (const item of removedItems) events.push(auditEvent('delete', item));

  if (!saveExpenses(next)) return false;
  if (events.length) recordAudit(events);
  for (const r of plan.remove) if (removedIds.has(r.id)) recordDeletions([r.id], r.at || now);
  clearDeletions(restored);
  return true;
}

/** The tracker's own currency. */
export function homeCurrency(): string {
  return (store.get('fx_currency', 'INR') || 'INR').toUpperCase();
}

/** Bring the ledger up to date with these group expenses. Safe to run any number of times. */
export function reconcileGroupShares(group: ShareGroup, expenses: readonly GroupExpenseRow[], now = new Date()): boolean {
  const home = homeCurrency();
  const plan = planShareCopies({
    group, expenses, ledger: loadExpenses(), tombstones: loadTombstones(),
    homeCurrency: home, resolveCategory: resolveShareCategory, now,
    rateFor: group.currency.toUpperCase() === home ? undefined : shareRateFor(group.currency.toUpperCase(), home),
  });
  return applySharePlan(plan, now.getTime());
}
