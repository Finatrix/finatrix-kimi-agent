import { describe, it, expect, beforeEach } from 'vitest';
import {
  AUDIT_KEY, MAX_AUDIT_ENTRIES,
  auditEvent, auditEdit, diffTransaction, newBatchId,
  loadAuditLog, saveAuditLog, appendEntries, recordAudit, clearAuditLog,
  normalizeAuditEntry, filterAudit, emptyAuditFilter, groupAuditByDay, groupAuditBatches,
  type AuditEntry,
} from '../tools/lib/expenseAudit';
import type { ExpenseItem } from '../tools/lib/expense';

function tx(over: Partial<ExpenseItem> = {}): ExpenseItem {
  return {
    id: 'tx_1', amount: 450, category: 'groceries', date: '2026-08-12',
    note: 'Weekly shop', ...over,
  };
}

const label = (k: string) => (k === 'groceries' ? 'Groceries' : k);

describe('expense audit — recording what changed', () => {
  beforeEach(() => localStorage.clear());

  it('records a whole-row event with a snapshot of the transaction', () => {
    const e = auditEvent('add', tx(), { ts: 1_760_000_000_000 });
    expect(e).toMatchObject({
      action: 'add', txId: 'tx_1', amount: 450, category: 'groceries',
      date: '2026-08-12', label: 'Weekly shop', ts: 1_760_000_000_000,
    });
    expect(e.changes).toBeUndefined();
  });

  it('prefers the merchant over the note as the row label', () => {
    expect(auditEvent('delete', tx({ merchant: 'Corner Store' })).label).toBe('Corner Store');
  });

  it('survives a delete: the snapshot still describes a row that is gone', () => {
    const victim = tx({ merchant: 'Blue Bottle', amount: 320 });
    const e = auditEvent('delete', victim);
    // Nothing on the entry points back into the ledger for its description.
    expect(e.amount).toBe(320);
    expect(e.label).toBe('Blue Bottle');
    expect(e.category).toBe('groceries');
  });

  it('diffs only the fields the user set, never the save metadata', () => {
    const before = tx({ createdAt: '2026-08-12T09:00:00.000Z', updatedAt: '2026-08-12T09:00:00.000Z' });
    const after = tx({
      amount: 520,
      createdAt: '2026-08-12T09:00:00.000Z',
      updatedAt: '2026-08-13T10:00:00.000Z', // set by the act of saving
      editCount: 1,
    });
    const changes = diffTransaction(before, after);
    expect(changes).toEqual([{ field: 'amount', before: 450, after: 520 }]);
  });

  it('reports an added field as "empty → value"', () => {
    const changes = diffTransaction(tx(), tx({ merchant: 'Corner Store' }));
    expect(changes).toEqual([{ field: 'merchant', before: null, after: 'Corner Store' }]);
  });

  it('treats absent, empty-string and empty-array as the same "nothing"', () => {
    expect(diffTransaction(tx(), tx({ merchant: '', tags: [] }))).toEqual([]);
  });

  it('compares tags by content, so reordering is not a change', () => {
    const a = tx({ tags: ['weekly', 'food'] });
    const b = tx({ tags: ['weekly', 'food'] });
    expect(diffTransaction(a, b)).toEqual([]);
    expect(diffTransaction(a, tx({ tags: ['weekly', 'food', 'bulk'] }))).toHaveLength(1);
  });

  it('records nothing at all when a save moved no field', () => {
    expect(auditEdit(tx(), tx())).toBeNull();
    // …even when the save metadata was refreshed, which it always is.
    expect(auditEdit(tx(), tx({ updatedAt: '2026-08-13T10:00:00.000Z', editCount: 3 }))).toBeNull();
  });

  it('an edit snapshots the NEW state and carries the diff', () => {
    const e = auditEdit(tx(), tx({ amount: 520, category: 'eating_out' }));
    expect(e).not.toBeNull();
    expect(e!.action).toBe('edit');
    expect(e!.amount).toBe(520);
    expect(e!.category).toBe('eating_out');
    expect(e!.changes).toEqual([
      { field: 'amount', before: 450, after: 520 },
      { field: 'category', before: 'groceries', after: 'eating_out' },
    ]);
  });

  it('mints unique entry ids', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 500; i++) ids.add(auditEvent('add', tx()).id);
    expect(ids.size).toBe(500);
  });
});

describe('expense audit — persistence', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips through storage, newest first', () => {
    const older = auditEvent('add', tx(), { ts: 1000 });
    const newer = auditEvent('delete', tx(), { ts: 2000 });
    saveAuditLog([older, newer]); // deliberately out of order
    expect(loadAuditLog().map((e) => e.ts)).toEqual([2000, 1000]);
  });

  it('prepends new entries and keeps a batch in the order it was produced', () => {
    const existing = [auditEvent('add', tx(), { ts: 1000 })];
    const batch = newBatchId();
    const fresh = [
      auditEvent('delete', tx({ id: 'a' }), { ts: 2000, batch }),
      auditEvent('delete', tx({ id: 'b' }), { ts: 2000, batch }),
    ];
    const next = appendEntries(existing, fresh);
    expect(next.map((e) => e.txId)).toEqual(['a', 'b', 'tx_1']);
  });

  it('caps the log, evicting the oldest', () => {
    const many = Array.from({ length: MAX_AUDIT_ENTRIES + 40 }, (_, i) =>
      auditEvent('add', tx({ id: `tx_${i}` }), { ts: 1000 + i }));
    const capped = appendEntries([], many);
    expect(capped).toHaveLength(MAX_AUDIT_ENTRIES);
    expect(capped[0].txId).toBe('tx_0'); // the block keeps its own order
    expect(capped.at(-1)!.txId).toBe(`tx_${MAX_AUDIT_ENTRIES - 1}`);
  });

  it('appending nothing leaves the log — and storage — untouched', () => {
    const log = [auditEvent('add', tx(), { ts: 1000 })];
    saveAuditLog(log);
    const before = localStorage.getItem(AUDIT_KEY);
    expect(recordAudit([])).toHaveLength(1);
    expect(localStorage.getItem(AUDIT_KEY)).toBe(before);
  });

  it('recordAudit persists and returns the new log', () => {
    recordAudit([auditEvent('add', tx(), { ts: 1000 })]);
    const returned = recordAudit([auditEvent('delete', tx(), { ts: 2000 })]);
    expect(returned).toHaveLength(2);
    expect(loadAuditLog()).toHaveLength(2);
  });

  it('clearing removes the key outright, leaving no residue to sync', () => {
    recordAudit([auditEvent('add', tx())]);
    clearAuditLog();
    expect(localStorage.getItem(AUDIT_KEY)).toBeNull();
    expect(loadAuditLog()).toEqual([]);
  });

  it('discards records that are beyond saving, and keeps the rest', () => {
    localStorage.setItem(AUDIT_KEY, JSON.stringify([
      { action: 'add', ts: 3000, txId: 'ok', amount: 10, category: 'rent', date: '2026-08-01', label: 'Rent' },
      { action: 'not-an-action', ts: 2000 },
      { action: 'edit' }, // no timestamp — undatable, so unusable in a history
      null,
      'nonsense',
    ]));
    const log = loadAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0].txId).toBe('ok');
  });

  it('tolerates a corrupt store rather than throwing', () => {
    localStorage.setItem(AUDIT_KEY, '{not json');
    expect(loadAuditLog()).toEqual([]);
  });

  it('drops unknown fields from a stored diff', () => {
    const e = normalizeAuditEntry({
      action: 'edit', ts: 1000, txId: 'x', amount: 1, category: 'rent', date: '2026-08-01', label: '',
      changes: [{ field: 'amount', before: 1, after: 2 }, { field: 'bogus', before: 'a', after: 'b' }],
    });
    expect(e!.changes).toEqual([{ field: 'amount', before: 1, after: 2 }]);
  });
});

describe('expense audit — reading the log', () => {
  const entries: AuditEntry[] = [
    auditEvent('delete', tx({ merchant: 'Corner Store' }), { ts: 3000 }),
    auditEvent('add', tx({ merchant: 'Blue Bottle', category: 'eating_out' }), { ts: 2000 }),
    auditEvent('add', tx({ merchant: 'Corner Store' }), { ts: 1000 }),
  ];

  it('an empty action filter means everything, never nothing', () => {
    expect(filterAudit(entries, emptyAuditFilter(), label)).toHaveLength(3);
  });

  it('filters by action', () => {
    const f = { actions: new Set(['delete' as const]), query: '' };
    expect(filterAudit(entries, f, label).map((e) => e.action)).toEqual(['delete']);
  });

  it('searches the label case-insensitively', () => {
    const f = { actions: new Set<never>(), query: 'blue bottle' };
    expect(filterAudit(entries, f, label)).toHaveLength(1);
  });

  it('searches the RESOLVED category name, not the stored key', () => {
    const f = { actions: new Set<never>(), query: 'Groceries' };
    // The key is `groceries`; a user searching the label they see must find it.
    expect(filterAudit(entries, f, label)).toHaveLength(2);
  });

  it('groups by the local day the change was made', () => {
    const now = new Date(2026, 7, 13, 10, 0, 0); // 13 Aug 2026, local
    const today = new Date(2026, 7, 13, 9, 30, 0).getTime();
    const yesterday = new Date(2026, 7, 12, 23, 55, 0).getTime();
    const older = new Date(2026, 7, 2, 8, 0, 0).getTime();
    const days = groupAuditByDay([
      auditEvent('add', tx(), { ts: today }),
      auditEvent('add', tx(), { ts: yesterday }),
      auditEvent('add', tx(), { ts: older }),
    ], now);
    expect(days.map((d) => d.label).slice(0, 2)).toEqual(['Today', 'Yesterday']);
    expect(days).toHaveLength(3);
    expect(days[2].key).toBe('2026-08-02');
  });

  it('a late-evening change stays on its own local day', () => {
    // 23:55 local on the 12th is the 13th in UTC east of Greenwich — the group
    // key must follow the calendar the user is looking at.
    const ts = new Date(2026, 7, 12, 23, 55, 0).getTime();
    const [day] = groupAuditByDay([auditEvent('add', tx(), { ts })], new Date(2026, 7, 20));
    expect(day.key).toBe('2026-08-12');
  });

  it('collapses a batch into one group while keeping every row', () => {
    const batch = newBatchId();
    const groups = groupAuditBatches([
      auditEvent('delete', tx({ id: 'a', amount: 100 }), { ts: 3000, batch }),
      auditEvent('delete', tx({ id: 'b', amount: 250 }), { ts: 3000, batch }),
      auditEvent('add', tx({ id: 'c', amount: 40 }), { ts: 2000 }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[0].total).toBe(350);
    expect(groups[1].entries).toHaveLength(1);
  });

  it('never merges two different batches, or a batch with a lone entry', () => {
    const groups = groupAuditBatches([
      auditEvent('delete', tx({ id: 'a' }), { ts: 3000, batch: 'b_1' }),
      auditEvent('delete', tx({ id: 'b' }), { ts: 3000, batch: 'b_2' }),
      auditEvent('delete', tx({ id: 'c' }), { ts: 3000 }),
    ]);
    expect(groups).toHaveLength(3);
  });
});
