import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadExpenses, saveExpenses } from '../tools/lib/expense';
import { loadAuditLog } from '../tools/lib/expenseAudit';
import { onLocalWrite } from '../tools/lib/storage';
import {
  WATCH_SEEN_KEY, WATCH_SEEN_LIMIT, ingestWatchExpenses, parseWatchExpense,
} from '../tools/lib/watchInbox';

const NOW = new Date(2026, 2, 15, 14, 30);
const entry = (over: Record<string, unknown> = {}) => ({
  id: 'tx_aaaaaaaa-0001', amount: 120, category: 'eating_out', date: '2026-03-15', at: NOW.toISOString(), ...over,
});

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('parseWatchExpense', () => {
  it('accepts a well-formed entry and rounds the amount to 2 places', () => {
    expect(parseWatchExpense(entry({ amount: 12.345 }), NOW)?.amount).toBe(12.35);
  });

  it.each([
    ['no id', { id: undefined }],
    ['an id that is not a watch id', { id: '../../x' }],
    ['a zero amount', { amount: 0 }],
    ['a negative amount', { amount: -5 }],
    ['a string amount', { amount: '120' }],
    ['NaN', { amount: Number.NaN }],
    ['Infinity', { amount: Number.POSITIVE_INFINITY }],
    ['an absurd amount', { amount: 1e12 }],
    ['an amount that rounds to nothing', { amount: 0.001 }],
    ['no category', { category: '' }],
    ['a made-up date', { date: '2026-02-31' }],
    ['a date in the wrong shape', { date: '15/03/2026' }],
    ['a date a month ahead', { date: '2026-04-15' }],
    ['a date years ago', { date: '2019-03-15' }],
  ])('rejects %s', (_n, over) => {
    expect(parseWatchExpense(entry(over), NOW)).toBeNull();
  });

  it('rejects non-objects', () => {
    expect(parseWatchExpense(null, NOW)).toBeNull();
    expect(parseWatchExpense('x', NOW)).toBeNull();
  });

  it('allows a day of slack for a watch in another time zone', () => {
    expect(parseWatchExpense(entry({ date: '2026-03-16' }), NOW)).not.toBeNull();
  });

  it('replaces an unusable timestamp with now', () => {
    expect(parseWatchExpense(entry({ at: 'later' }), NOW)?.at).toBe(NOW.toISOString());
  });
});

describe('ingestWatchExpenses', () => {
  it('saves through the ledger and the audit trail, keeping the watch-made id', () => {
    const r = ingestWatchExpenses([entry()], NOW);
    expect(r).toEqual({ added: ['tx_aaaaaaaa-0001'], ack: ['tx_aaaaaaaa-0001'], retry: [] });
    const [row] = loadExpenses();
    expect(row).toMatchObject({ id: 'tx_aaaaaaaa-0001', amount: 120, category: 'eating_out', date: '2026-03-15' });
    expect(row.createdAt).toBe(NOW.toISOString());
    expect(loadAuditLog().some((a) => a.action === 'add' && a.txId === 'tx_aaaaaaaa-0001')).toBe(true);
  });

  it('does not add the same entry twice, however often it arrives', () => {
    ingestWatchExpenses([entry()], NOW);
    const again = ingestWatchExpenses([entry(), entry()], NOW);
    expect(again.added).toEqual([]);
    expect(again.ack).toEqual(['tx_aaaaaaaa-0001', 'tx_aaaaaaaa-0001']);
    expect(loadExpenses()).toHaveLength(1);
  });

  it('does not repeat an entry inside one batch', () => {
    const r = ingestWatchExpenses([entry(), entry()], NOW);
    expect(r.added).toEqual(['tx_aaaaaaaa-0001']);
    expect(loadExpenses()).toHaveLength(1);
  });

  it('does not bring back an entry the user deleted on the phone', () => {
    ingestWatchExpenses([entry()], NOW);
    saveExpenses([]);
    const r = ingestWatchExpenses([entry()], NOW);
    expect(r.added).toEqual([]);
    expect(r.ack).toEqual(['tx_aaaaaaaa-0001']);
    expect(loadExpenses()).toEqual([]);
  });

  it('keeps what is already in the ledger and puts the new entry first', () => {
    saveExpenses([{ id: 'old', amount: 5, category: 'groceries', date: '2026-03-01' }]);
    ingestWatchExpenses([entry()], NOW);
    expect(loadExpenses().map((e) => e.id)).toEqual(['tx_aaaaaaaa-0001', 'old']);
  });

  it('acknowledges invalid entries so the watch stops resending them, and saves nothing', () => {
    const r = ingestWatchExpenses([entry({ id: 'tx_bad00000-0001', amount: -1 }), 42, { id: 7 }], NOW);
    expect(r.added).toEqual([]);
    expect(r.ack).toEqual(['tx_bad00000-0001']);
    expect(loadExpenses()).toEqual([]);
  });

  it('resolves a legacy category key like every other reader', () => {
    ingestWatchExpenses([entry({ category: 'grocery' })], NOW);
    expect(loadExpenses()[0].category).toBe('groceries');
  });

  it('files an entry whose category is gone under the most-used one, and says so', () => {
    saveExpenses([
      { id: 'a', amount: 1, category: 'groceries', date: '2026-03-01' },
      { id: 'b', amount: 1, category: 'groceries', date: '2026-03-02' },
    ]);
    ingestWatchExpenses([entry({ category: 'no_such_cat' })], NOW);
    const row = loadExpenses().find((e) => e.id === 'tx_aaaaaaaa-0001')!;
    expect(row.category).toBe('groceries');
    expect(row.note).toMatch(/watch/);
  });

  it('refuses a savings category as a quick spend, filing it as the fallback', () => {
    ingestWatchExpenses([entry({ category: 'emergency' })], NOW);
    expect(loadExpenses()[0].category).not.toBe('emergency');
  });

  it('notifies open pages as a device write, so a mounted Expenses page re-reads the ledger', () => {
    const seen: Array<[string, string]> = [];
    const off = onLocalWrite((k, o) => { seen.push([k, o]); });
    ingestWatchExpenses([entry()], NOW);
    off();
    expect(seen).toContainEqual(['fx_expenses', 'device']);
  });

  it('keeps the seen list bounded', () => {
    const many = Array.from({ length: WATCH_SEEN_LIMIT + 20 }, (_, i) =>
      entry({ id: `tx_batch${String(i).padStart(6, '0')}` }));
    ingestWatchExpenses(many, NOW);
    expect(JSON.parse(localStorage.getItem(WATCH_SEEN_KEY)!).length).toBe(WATCH_SEEN_LIMIT);
    expect(loadExpenses()).toHaveLength(WATCH_SEEN_LIMIT + 20);
  });

  it('handles an empty inbox', () => {
    expect(ingestWatchExpenses([], NOW)).toEqual({ added: [], ack: [], retry: [] });
  });
});
