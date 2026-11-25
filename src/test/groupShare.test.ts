import { beforeEach, describe, expect, it } from 'vitest';
import { loadExpenses, saveExpenses, type ExpenseItem } from '../tools/lib/expense';
import { loadTombstones, recordDeletions } from '../tools/lib/expenseTombstones';
import { loadAuditLog } from '../tools/lib/expenseAudit';
import { planShareCopies, reconcileGroupShares, shareCopyId, type ShareGroup } from '../tools/lib/groupShare';
import type { GroupExpenseRow } from '../tools/lib/groups';

/**
 * Your share in your own tracker (step 2.4): one idempotent copy per group
 * expense, only your share, never Budget together, and a deletion that sync
 * can't undo.
 */

const G = 'g-1';
const group: ShareGroup = { id: G, name: 'Goa trip', currency: 'INR', memberId: 'me' };
const row = (id: string, amount: number, extra: Partial<GroupExpenseRow> = {}): GroupExpenseRow => ({
  id, group_id: G, amount, category: 'eating_out', note: 'Dinner', spent_on: '2026-11-20', paid_by: 'other',
  split_rule: 'equal', shares: [{ member: 'me', value: 1 }, { member: 'other', value: 1 }, { member: 'third', value: 1 }],
  created_by: 'other', created_at: '2026-11-20T10:00:00Z', updated_by: 'other', updated_at: '2026-11-20T10:00:00Z',
  deleted_at: null, ...extra,
});
const resolveCategory = (v: string) => (v === 'eating_out' || v === 'groceries' ? v : 'other');
const plan = (expenses: GroupExpenseRow[], ledger: ExpenseItem[] = [], tombstones = {}, currency = 'INR') =>
  planShareCopies({ group, expenses, ledger, tombstones, homeCurrency: currency, resolveCategory, now: new Date('2026-11-21T08:00:00Z') });

beforeEach(() => { localStorage.clear(); });

describe('planShareCopies', () => {
  it('copies only your share, as a normal expense marked with the group name', () => {
    const p = plan([row('e1', 1000)]);
    expect(p.upsert).toHaveLength(1);
    const copy = p.upsert[0];
    expect(copy.id).toBe(shareCopyId('e1'));
    expect(copy.amount).toBe(333.34); // the lowest member id takes the spare paisa: 'me' < 'other' < 'third'
    expect(copy.date).toBe('2026-11-20');
    expect(copy.category).toBe('eating_out');
    expect(copy.tags).toEqual(['Goa trip']);
    expect(copy.groupShare).toMatchObject({ groupId: G, expenseId: 'e1', name: 'Goa trip' });
  });
  it('never copies Budget-together spending', () => {
    expect(plan([row('e1', 1000, { split_rule: null, shares: null })]).upsert).toEqual([]);
  });
  it('copies nothing when you are not in the split, even if you paid', () => {
    const r = row('e1', 1000, { paid_by: 'me', shares: [{ member: 'other', value: 1 }, { member: 'third', value: 1 }] });
    expect(plan([r]).upsert).toEqual([]);
  });
  it('counts only your share when you paid for everyone', () => {
    const r = row('e1', 1000, { paid_by: 'me', split_rule: 'exact', shares: [{ member: 'me', value: 100 }, { member: 'other', value: 900 }] });
    expect(plan([r]).upsert[0].amount).toBe(100);
  });
  it('does not copy when the group uses another currency than the tracker', () => {
    expect(plan([row('e1', 1000)], [], {}, 'USD').upsert).toEqual([]);
  });
  it('is idempotent: a second pass over the same rows plans nothing', () => {
    const first = plan([row('e1', 1000)]);
    const second = plan([row('e1', 1000)], first.upsert);
    expect(second).toEqual({ upsert: [], remove: [] });
  });
  it('follows the group expense when it changes, keeping the copy id', () => {
    const first = plan([row('e1', 1000)]).upsert;
    const changed = row('e1', 1200, { updated_at: '2026-11-21T09:00:00Z' });
    const next = plan([changed], first);
    expect(next.upsert).toHaveLength(1);
    expect(next.upsert[0].id).toBe(first[0].id);
    expect(next.upsert[0].amount).toBe(400);
  });
  it('keeps your own edit of the copy until the group expense changes again', () => {
    const first = plan([row('e1', 1000)]).upsert[0];
    const edited = { ...first, category: 'groceries' };
    expect(plan([row('e1', 1000)], [edited]).upsert).toEqual([]);
  });
  it('removes the copy when the group expense is deleted, at the time it was deleted', () => {
    const first = plan([row('e1', 1000)]).upsert;
    const deleted = row('e1', 1000, { deleted_at: '2026-11-21T07:00:00Z', updated_at: '2026-11-21T07:00:00Z' });
    expect(plan([deleted], first).remove).toEqual([{ id: first[0].id, at: Date.parse('2026-11-21T07:00:00Z') }]);
    expect(plan([deleted], []).remove).toEqual([]);
  });
  it('removes the copy when an edit takes you out of the split', () => {
    const first = plan([row('e1', 1000)]).upsert;
    const out = row('e1', 1000, { updated_at: '2026-11-21T09:00:00Z', shares: [{ member: 'other', value: 1 }] });
    expect(plan([out], first).remove).toHaveLength(1);
  });
  it('keeps a copy you deleted yourself deleted, until the group expense changes', () => {
    const id = shareCopyId('e1');
    const deletedAt = Date.parse('2026-11-21T00:00:00Z');
    expect(plan([row('e1', 1000)], [], { [id]: deletedAt }).upsert).toEqual([]);
    const changed = row('e1', 1500, { updated_at: '2026-11-22T00:00:00Z' });
    expect(plan([changed], [], { [id]: deletedAt }).upsert).toHaveLength(1);
  });
  it('puts the copy back when the group expense delete is undone', () => {
    const id = shareCopyId('e1');
    const undone = row('e1', 1000, { deleted_at: null, updated_at: '2026-11-21T07:30:00Z' });
    expect(plan([undone], [], { [id]: Date.parse('2026-11-21T07:00:00Z') }).upsert).toHaveLength(1);
  });
  it('ignores rows of another group', () => {
    expect(plan([row('e1', 1000, { group_id: 'other-group' })]).upsert).toEqual([]);
  });
});

describe('reconcileGroupShares (through the ledger)', () => {
  const now = new Date('2026-11-21T08:00:00Z');
  it('adds one copy however many times it runs, with an audit entry', () => {
    const rows = [row('e1', 1000)];
    expect(reconcileGroupShares(group, rows, now)).toBe(true);
    expect(reconcileGroupShares(group, rows, now)).toBe(false);
    expect(reconcileGroupShares(group, rows, now)).toBe(false);
    const ledger = loadExpenses();
    expect(ledger).toHaveLength(1);
    expect(ledger[0].groupShare?.expenseId).toBe('e1');
    expect(loadAuditLog().filter((a) => a.action === 'add')).toHaveLength(1);
  });
  it('leaves other spends alone and puts the copy first', () => {
    saveExpenses([{ id: 'mine', amount: 50, category: 'groceries', date: '2026-11-01' }]);
    reconcileGroupShares(group, [row('e1', 1000)], now);
    expect(loadExpenses().map((e) => e.id)).toEqual([shareCopyId('e1'), 'mine']);
  });
  it('a group deletion removes the copy and records a tombstone sync honours', () => {
    reconcileGroupShares(group, [row('e1', 1000)], now);
    reconcileGroupShares(group, [row('e1', 1000, { deleted_at: '2026-11-21T07:00:00Z', updated_at: '2026-11-21T07:00:00Z' })], now);
    expect(loadExpenses()).toHaveLength(0);
    expect(loadTombstones()[shareCopyId('e1')]).toBe(Date.parse('2026-11-21T07:00:00Z'));
    // ...and it does not come back on the next pass.
    expect(reconcileGroupShares(group, [row('e1', 1000, { deleted_at: '2026-11-21T07:00:00Z', updated_at: '2026-11-21T07:00:00Z' })], now)).toBe(false);
  });
  it('undoing the delete brings it back and clears the tombstone', () => {
    reconcileGroupShares(group, [row('e1', 1000)], now);
    reconcileGroupShares(group, [row('e1', 1000, { deleted_at: '2026-11-21T07:00:00Z', updated_at: '2026-11-21T07:00:00Z' })], now);
    reconcileGroupShares(group, [row('e1', 1000, { updated_at: '2026-11-21T07:30:00Z' })], now);
    expect(loadExpenses()).toHaveLength(1);
    expect(loadTombstones()[shareCopyId('e1')]).toBeUndefined();
  });
  it('does not revive a copy deleted from the tracker', () => {
    reconcileGroupShares(group, [row('e1', 1000)], now);
    saveExpenses([]);
    recordDeletions([shareCopyId('e1')], Date.parse('2026-11-22T00:00:00Z'));
    expect(reconcileGroupShares(group, [row('e1', 1000)], now)).toBe(false);
    expect(loadExpenses()).toHaveLength(0);
  });
  it('the copy stays when you leave: nothing else touches it', () => {
    reconcileGroupShares(group, [row('e1', 1000)], now);
    // Leaving means no further reconcile calls; the ledger row is a plain expense.
    const copy = loadExpenses()[0];
    expect(copy.amount).toBe(333.34);
  });
});
