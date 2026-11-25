import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyChange, budgetsForMonth, buildFeed, computeBudgetTogether, groupAmount, groupCategoryLabel,
  groupCategoryValue, groupChoicesForExpense, groupNote, memberName, normalizeExpense, saveGroupsCache,
  GROUPS_CACHE_KEY, GROUP_OUTBOX_KEY,
  type GroupBudgetRow, type GroupChoice, type GroupExpenseRow, type GroupMemberRow,
} from '../tools/lib/groups';
import { ACCOUNT_LOCAL_KEYS } from '../tools/cloudSync';

/**
 * Groups, step 2.3: the pure side. Budget together only ADDS UP amounts
 * members logged (no new money maths), the feed says who made each change,
 * and Realtime deletes for rows this phone doesn't hold are ignored.
 */

const G = 'g-1';
const member = (id: string, name: string | null, extra: Partial<GroupMemberRow> = {}): GroupMemberRow => ({
  id, group_id: G, role: 'member', display_name: name, joined_at: '2026-11-01T10:00:00Z', left_at: null, ...extra,
});
const expense = (id: string, amount: number, category: string, spent_on: string, by: string, extra: Partial<GroupExpenseRow> = {}): GroupExpenseRow => ({
  id, group_id: G, amount, category, note: null, spent_on, paid_by: by, split_rule: null, shares: null,
  created_by: by, created_at: '2026-11-20T10:00:00Z', updated_by: by, updated_at: '2026-11-20T10:00:00Z', deleted_at: null, ...extra,
});
const budget = (month: string, category: string, amount: number): GroupBudgetRow => ({
  id: `${month}-${category}`, group_id: G, month, category, amount, created_by: 'm-amma', created_at: '2026-11-01T00:00:00Z',
  updated_by: 'm-amma', updated_at: '2026-11-01T00:00:00Z',
});

const members = [member('m-amma', 'Amma', { role: 'admin' }), member('m-priya', 'Priya'), member('m-gone', null, { left_at: '2026-11-10T00:00:00Z' })];

describe('Budget together', () => {
  it('adds up the month by category and by member, to the paisa', () => {
    const rows = [
      expense('a', 1200, 'groceries', '2026-11-03', 'm-amma'),
      expense('b', 0.1, 'groceries', '2026-11-04', 'm-priya'),
      expense('c', 0.2, 'groceries', '2026-11-05', 'm-priya'),
      expense('d', 450.55, 'eating_out', '2026-11-06', 'm-priya'),
      expense('e', 999, 'groceries', '2026-10-30', 'm-amma'),
      expense('f', 300, 'groceries', '2026-11-07', 'm-amma', { deleted_at: '2026-11-08T00:00:00Z' }),
      expense('g', 75, 'Diwali sweets', '2026-11-09', 'm-gone'),
    ];
    const t = computeBudgetTogether(rows, [budget('2026-11', 'groceries', 1000)], members, '2026-11', 'm-priya');
    expect(t.spent).toBe(1725.85);
    expect(t.budget).toBe(1000);
    const groceries = t.lines.find((l) => l.category === 'groceries')!;
    expect(groceries).toMatchObject({ label: 'Groceries', budget: 1000, spent: 1200.3 });
    expect(t.lines.find((l) => l.category === 'Diwali sweets')).toMatchObject({ label: 'Diwali sweets', budget: null, spent: 75 });
    expect(t.members.map((m) => [m.name, m.added, m.count])).toEqual([
      ['Amma', 1200, 1],
      ['You', 450.85, 3],
      ['Former member', 75, 1],
    ]);
    expect(t.carriedFrom).toBeNull();
  });

  it('lists every current member, at zero when they added nothing', () => {
    const t = computeBudgetTogether([], [], members, '2026-11', null);
    expect(t.members.map((m) => m.name).sort()).toEqual(['Amma', 'Priya']);
    expect(t.spent).toBe(0);
  });

  it('carries the latest earlier month forward, and a month of its own wins', () => {
    const rows = [budget('2026-09', 'rent', 20000), budget('2026-10', 'groceries', 8000), budget('2026-12', 'groceries', 1)];
    expect(budgetsForMonth(rows, '2026-11')).toMatchObject({ from: '2026-10', rows: [{ category: 'groceries', amount: 8000 }] });
    expect(budgetsForMonth(rows, '2026-08')).toEqual({ from: null, rows: [] });
    const t = computeBudgetTogether([], rows, members, '2026-11', null);
    expect(t.carriedFrom).toBe('2026-10');
    expect(t.budget).toBe(8000);
  });

  it('treats a budget of 0 as no budget', () => {
    const t = computeBudgetTogether([], [budget('2026-11', 'rent', 0)], members, '2026-11', null);
    expect(t.lines).toEqual([]);
  });
});

describe('the activity feed', () => {
  it('says who added, edited and deleted each expense, newest first', () => {
    const rows = [
      expense('a', 1200, 'groceries', '2026-11-03', 'm-amma', { created_at: '2026-11-20T10:00:00Z', updated_at: '2026-11-20T10:00:00Z' }),
      expense('b', 500, 'rent', '2026-11-03', 'm-amma', { updated_by: 'm-priya', updated_at: '2026-11-21T10:00:00Z' }),
      expense('c', 90, 'shopping', '2026-11-03', 'm-priya', { updated_by: 'm-amma', updated_at: '2026-11-22T10:00:00Z', deleted_at: '2026-11-22T10:00:00Z' }),
    ];
    const feed = buildFeed(rows, [], members, 'm-priya', new Set(['a'])).filter((f) => f.kind === 'expense');
    expect(feed.map((f) => f.kind === 'expense' && [f.row.id, f.action, f.who, f.addedBy, f.pending])).toEqual([
      ['c', 'deleted', 'Amma', 'you', false],
      ['b', 'edited', 'you', 'Amma', false],
      ['a', 'added', 'Amma', 'Amma', true],
    ]);
  });

  it('shows a former member as "Former member", never a name', () => {
    expect(memberName(member('x', 'Ravi', { left_at: '2026-11-01T00:00:00Z' }))).toBe('Former member');
    const feed = buildFeed([expense('a', 1, 'rent', '2026-11-01', 'm-gone')], [], members, null);
    expect(feed.find((f) => f.kind === 'expense')).toMatchObject({ who: 'Former member' });
    expect(feed.some((f) => f.kind === 'member' && f.action === 'left')).toBe(true);
  });
});

describe('live changes', () => {
  const held = [expense('a', 1, 'rent', '2026-11-01', 'm-amma')];

  it('ignores a delete for an id this phone does not hold', () => {
    // Realtime sends every delete to every subscriber, key only.
    expect(applyChange(held, G, { eventType: 'DELETE', old: { id: 'someone-elses' } }, normalizeExpense)).toBe(held);
    expect(applyChange(held, G, { eventType: 'DELETE', old: { id: 'a' } }, normalizeExpense)).toEqual([]);
  });

  it('adds and updates rows of this group only', () => {
    const fresh = { ...expense('b', 2, 'rent', '2026-11-02', 'm-priya'), amount: '2.50' as unknown as number };
    const added = applyChange(held, G, { eventType: 'INSERT', new: fresh }, normalizeExpense);
    expect(added.map((r) => [r.id, r.amount])).toEqual([['a', 1], ['b', 2.5]]);
    const other = applyChange(held, G, { eventType: 'INSERT', new: { ...fresh, group_id: 'g-2' } }, normalizeExpense);
    expect(other).toBe(held);
    const edited = applyChange(held, G, { eventType: 'UPDATE', new: { ...held[0], amount: 7 } }, normalizeExpense);
    expect(edited[0].amount).toBe(7);
  });
});

describe('what a group stores', () => {
  it('keeps built-in categories as keys and custom ones by name', () => {
    expect(groupCategoryValue('groceries', 'Groceries')).toBe('groceries');
    expect(groupCategoryValue('custom_abc123', 'School fees')).toBe('School fees');
    expect(groupCategoryLabel('eating_out')).toBe('Eating Out');
    expect(groupCategoryLabel('School fees')).toBe('School fees');
  });

  it('holds amounts as the database does: above 0, to the paisa', () => {
    expect(groupAmount(1200)).toBe(1200);
    expect(groupAmount(100 / 3)).toBe(33.33);
    expect(groupAmount(0)).toBeNull();
    expect(groupAmount(-5)).toBeNull();
    expect(groupAmount(0.004)).toBeNull();
    expect(groupAmount(Number.NaN)).toBeNull();
  });

  it('joins merchant and description into the one note, within 200 characters', () => {
    expect(groupNote(' BigBasket ', 'veg')).toBe('BigBasket · veg');
    expect(groupNote('', '')).toBeNull();
    expect(groupNote('x'.repeat(300), '')).toHaveLength(200);
  });
});

describe('this device', () => {
  beforeEach(() => localStorage.clear());

  it('offers only Budget together groups to the add-expense form', () => {
    const base: GroupChoice = { id: 'a', name: 'Sharma Family', emoji: '🏠', type: 'family', currency: 'INR', budgetTogether: true, splitCosts: false, memberId: 'm', role: 'admin', members: 3 };
    saveGroupsCache('u1', [base, { ...base, id: 'b', name: 'Flat 4B', type: 'home', budgetTogether: false, splitCosts: true }]);
    expect(groupChoicesForExpense().map((g) => g.name)).toEqual(['Sharma Family']);
  });

  it('clears the list of groups and the queue with the account', () => {
    expect(ACCOUNT_LOCAL_KEYS).toContain(GROUPS_CACHE_KEY);
    expect(ACCOUNT_LOCAL_KEYS).toContain(GROUP_OUTBOX_KEY);
  });
});
