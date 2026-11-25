import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Groups, step 2.3: the offline queue. Writes go to the phone first and upload
 * from there; a resent insert carries the same phone-made id with
 * ignore-duplicates, so it can't make a second row; a lost connection keeps
 * the queue; a refusal is dropped and reported; and only the account that
 * made a change ever sends it.
 */

const h = vi.hoisted(() => ({
  uid: 'user-1' as string | null,
  calls: [] as Array<{ table: string; kind: string; body: unknown; opts?: unknown; filters?: unknown[] }>,
  answers: [] as Array<{ error: { code?: string; message?: string } | null }>,
}));

vi.mock('../lib/supabase', () => {
  const answer = () => Promise.resolve(h.answers.shift() ?? { error: null });
  return {
    isSupabaseConfigured: true,
    supabase: {
      auth: { getSession: () => Promise.resolve({ data: { session: h.uid ? { user: { id: h.uid } } : null } }) },
      from: (table: string) => ({
        upsert: (body: unknown, opts: unknown) => { h.calls.push({ table, kind: 'upsert', body, opts }); return answer(); },
        update: (body: unknown) => {
          const call = { table, kind: 'update', body, filters: [] as unknown[] };
          h.calls.push(call);
          const chain = { eq: (col: string, v: unknown) => { call.filters.push([col, v]); return chain; }, then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => answer().then(ok, ko) };
          return chain;
        },
      }),
    },
  };
});

const { flushGroupOutbox, queueBudgets, queueExpenseUpdate, queueGroupExpense } = await import('../tools/lib/groupsApi');
const { loadOutbox } = await import('../tools/lib/groups');

const row = { group_id: 'g-1', amount: 1200, category: 'groceries', note: 'BigBasket', spent_on: '2026-11-25', paid_by: 'm-me' };
const settle = async () => { await flushGroupOutbox(); };

beforeEach(() => {
  localStorage.clear();
  h.uid = 'user-1';
  h.calls = [];
  h.answers = [];
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
});

describe('the group offline queue', () => {
  it('sends a new expense with its phone-made id and ignore-duplicates, then empties', async () => {
    const op = await queueGroupExpense(row);
    await settle();
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]).toMatchObject({
      table: 'group_expenses', kind: 'upsert', opts: { onConflict: 'id', ignoreDuplicates: true },
      body: { ...row, id: op.key, split_rule: null, shares: null },
    });
    // Only the columns the app may insert: the database stamps the rest.
    expect(Object.keys(h.calls[0].body as object).sort()).toEqual(['amount', 'category', 'group_id', 'id', 'note', 'paid_by', 'shares', 'spent_on', 'split_rule']);
    expect(loadOutbox()).toEqual([]);
  });

  it('keeps everything queued while offline, and resends the same id later', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    const op = await queueGroupExpense(row);
    await settle();
    expect(h.calls).toEqual([]);
    expect(loadOutbox()).toHaveLength(1);

    // Back online, but the request dies on the way: still queued, same id.
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    h.answers.push({ error: { message: 'TypeError: Failed to fetch' } });
    await settle();
    expect(loadOutbox()).toHaveLength(1);

    await settle();
    expect(h.calls.map((c) => (c.body as { id: string }).id)).toEqual([op.key, op.key]);
    expect(loadOutbox()).toEqual([]);
  });

  it('keeps the order: an edit made offline goes after the add it edits', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    const add = await queueGroupExpense(row);
    await queueExpenseUpdate({ id: add.key, group_id: 'g-1' }, { amount: 1300 });
    await queueBudgets('g-1', [{ group_id: 'g-1', month: '2026-11', category: 'groceries', amount: 8000 }]);
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    await settle();
    expect(h.calls.map((c) => [c.table, c.kind])).toEqual([
      ['group_expenses', 'upsert'], ['group_expenses', 'update'], ['group_budgets', 'upsert'],
    ]);
    expect(h.calls[1].filters).toEqual([['id', add.key], ['group_id', 'g-1']]);
    expect(h.calls[2].opts).toEqual({ onConflict: 'group_id,month,category' });
  });

  it('drops and reports a change the database refuses, and carries on', async () => {
    await (async () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      await queueGroupExpense(row);
      await queueGroupExpense({ ...row, amount: 5 });
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    })();
    h.answers.push({ error: { code: '42501', message: 'new row violates row-level security policy' } });
    const result = await flushGroupOutbox();
    expect(result.sent).toBe(1);
    expect(result.dropped).toHaveLength(1);
    expect(loadOutbox()).toEqual([]);
  });

  it('never sends another account’s queued change', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    await queueGroupExpense(row);
    await settle();
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    h.uid = 'user-2';
    await settle();
    expect(h.calls).toEqual([]);
    expect(loadOutbox()).toHaveLength(1);
  });

  it('refuses to queue anything signed out', async () => {
    h.uid = null;
    await expect(queueGroupExpense(row)).rejects.toMatchObject({ code: 'signed_out' });
    expect(loadOutbox()).toEqual([]);
  });
});
