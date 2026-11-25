import { beforeEach, describe, expect, it } from 'vitest';
import { loadExpenses, saveExpenses, type ExpenseItem } from '../tools/lib/expense';
import { loadTombstones, recordDeletions } from '../tools/lib/expenseTombstones';
import { loadAuditLog } from '../tools/lib/expenseAudit';
import { planShareCopies, reconcileGroupShares, shareCopyId, shareRateFor, type ShareGroup } from '../tools/lib/groupShare';
import { saveAllTrips, type Trip } from '../tools/lib/trips';
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

/**
 * Step 3.9: trip groups and members in other countries. The worked examples
 * are the ones in the PR description.
 */
describe('a group in another currency', () => {
  const aed: ShareGroup = { id: G, name: 'Dubai trip', currency: 'AED', memberId: 'me' };
  const usd: ShareGroup = { id: G, name: 'Friends', currency: 'USD', memberId: 'me' };
  const DUBAI: Trip = {
    id: 'trip-dxb', name: 'Dubai', currency: 'AED', homeCurrency: 'INR', start: '2026-11-18', end: '2026-11-22',
    rate: 24, rateSource: 'live', feePct: 3.5, homeCats: [], createdAt: '', updatedAt: '',
  };
  const RATES = { USD: 1, INR: 88.42, AED: 3.6725 };
  const foreign = (g: ShareGroup, expenses: GroupExpenseRow[], ledger: ExpenseItem[] = [], trips: Trip[] = []) => planShareCopies({
    group: g, expenses, ledger, tombstones: {}, homeCurrency: 'INR', resolveCategory,
    rateFor: shareRateFor(g.currency, 'INR', trips, RATES), now: new Date('2026-11-21T08:00:00Z'),
  });

  it('trip group: AED 400 at the trip’s fixed 24.0 is ₹9,600.00, with no card fee, tagged with the trip', () => {
    const copy = foreign(aed, [row('e1', 1200)], [], [DUBAI]).upsert[0];
    expect(copy).toMatchObject({ amount: 9600, fxAmount: 400, fxCurrency: 'AED', fxRate: 24, tripId: 'trip-dxb' });
    expect(copy.fxFee).toBeUndefined();
  });

  it('member abroad: USD 33.34 at the live 88.42 is ₹2,947.92, and an edit keeps that rate', () => {
    const usdRow = row('e1', 100.02, { shares: [{ member: 'me', value: 1 }, { member: 'other', value: 1 }, { member: 'third', value: 1 }] });
    const first = foreign(usd, [usdRow]).upsert;
    expect(first[0]).toMatchObject({ amount: 2947.92, fxAmount: 33.34, fxCurrency: 'USD', fxRate: 88.42 });
    expect(first[0].tripId).toBeUndefined();
    // Edited to USD 40.00 for me, on a day the live rate has moved: same rate as before.
    const edited = row('e1', 40, { split_rule: 'exact', shares: [{ member: 'me', value: 40 }], updated_at: '2026-11-22T10:00:00Z' });
    const moved = planShareCopies({
      group: usd, expenses: [edited], ledger: first, tombstones: {}, homeCurrency: 'INR', resolveCategory,
      rateFor: shareRateFor('USD', 'INR', [], { USD: 1, INR: 90 }), now: new Date('2026-11-22T11:00:00Z'),
    }).upsert[0];
    expect(moved).toMatchObject({ amount: 3536.8, fxAmount: 40, fxRate: 88.42 });
  });

  it('outside the trip’s days, the live rate is used instead of the trip’s', () => {
    const copy = foreign(aed, [row('e1', 1200, { spent_on: '2026-11-25' })], [], [DUBAI]).upsert[0];
    expect(copy.tripId).toBeUndefined();
    expect(copy.fxRate).toBe(24.08); // tripRateFor: 88.42 / 3.6725 fixed the way travel mode fixes it
  });

  it('no rate: no copy, counted so the group can say so, and never a guess', () => {
    const p = planShareCopies({
      group: { ...usd, currency: 'VND' }, expenses: [row('e1', 300000)], ledger: [], tombstones: {}, homeCurrency: 'INR',
      resolveCategory, rateFor: shareRateFor('VND', 'INR', [], RATES), now: new Date('2026-11-21T08:00:00Z'),
    });
    expect(p.upsert).toEqual([]);
    expect(p.remove).toEqual([]);
    expect(p.noRate).toBe(1);
  });

  it('reconcileGroupShares prices with the phone’s trips and rates', () => {
    localStorage.setItem('fx_currency', 'INR');
    saveAllTrips([DUBAI]);
    reconcileGroupShares(aed, [row('e1', 1200)]);
    expect(loadExpenses()[0]).toMatchObject({ amount: 9600, fxCurrency: 'AED', tripId: 'trip-dxb' });
  });
});

describe('group currency helpers (step 3.9)', async () => {
  const { approxInHome, groupTripCurrency } = await import('../tools/lib/groupCurrency');
  const trip = (over: Partial<Trip>): Trip => ({
    id: 't', name: 'Dubai', currency: 'AED', homeCurrency: 'INR', start: '2026-12-01', end: '2026-12-05',
    rate: 24, rateSource: 'live', homeCats: [], createdAt: '', updatedAt: '', ...over,
  });

  it('a new Trip group starts in your current or next trip’s currency, never a home trip’s', () => {
    expect(groupTripCurrency('INR', [trip({})], '2026-11-25')).toEqual({ currency: 'AED', name: 'Dubai' });
    expect(groupTripCurrency('INR', [trip({ currency: 'INR' })], '2026-11-25')).toBeNull();
    expect(groupTripCurrency('INR', [], '2026-11-25')).toBeNull();
  });

  it('≈ home amount uses the same rate as the copy, and nothing without a rate or in your own currency', () => {
    expect(approxInHome(400, 'AED', 'INR', '2026-12-02', [trip({})], { USD: 1, INR: 88.42, AED: 3.6725 })).toBe(9600);
    expect(approxInHome(400, 'INR', 'INR')).toBeNull();
    expect(approxInHome(400, 'VND', 'INR', '2026-12-02', [], { USD: 1, INR: 88.42 })).toBeNull();
  });
});
