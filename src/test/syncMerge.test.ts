import { describe, it, expect } from 'vitest';
import {
  mergeAuditLogs,
  mergeCloudBlob,
  mergeExpenseLists,
  mergeLearnedMerchants,
  mergeTombstoneMaps,
  applyAuditToTombstones,
} from '../tools/lib/syncMerge';
import { MAX_AUDIT_ENTRIES } from '../tools/lib/expenseAudit';
import { MAX_TOMBSTONES, TOMBSTONE_TTL_MS, TOMBSTONE_KEY } from '../tools/lib/expenseTombstones';
import { SYNC_KEYS } from '../tools/cloudSync';

/**
 * The reconciliation rules behind cloud sync.
 *
 * The case that opens the file is the bug the merge exists to fix: a user who
 * logged transactions on a device and then signed in used to find them gone,
 * because signing in replaced local data with the cloud copy.
 */

type Tx = {
  id: string;
  amount: number;
  category: string;
  date: string;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
};

const tx = (id: string, over: Partial<Tx> = {}): Tx => ({
  id,
  amount: 100,
  category: 'food',
  date: '2026-08-01',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
  ...over,
});

const list = (...items: Tx[]) => JSON.stringify(items);
const idsIn = (raw: string | null): string[] =>
  (JSON.parse(raw ?? '[]') as Tx[]).map((t) => t.id);

describe('signing in does not discard transactions the cloud has not seen', () => {
  it('keeps rows logged on this device before sign-in', () => {
    const onDevice = list(tx('local-1'), tx('local-2'));
    const inCloud = list(tx('cloud-1'));

    const merged = mergeExpenseLists(onDevice, inCloud);

    expect(idsIn(merged)).toEqual(['local-1', 'local-2', 'cloud-1']);
  });

  it('keeps the whole ledger when the cloud row is empty', () => {
    const onDevice = list(tx('local-1'));
    expect(idsIn(mergeExpenseLists(onDevice, null))).toEqual(['local-1']);
    expect(idsIn(mergeExpenseLists(onDevice, '[]'))).toEqual(['local-1']);
  });

  it('does not let unreadable data on either side empty the other', () => {
    const onDevice = list(tx('local-1'));
    expect(idsIn(mergeExpenseLists(onDevice, 'not json'))).toEqual(['local-1']);
    expect(idsIn(mergeExpenseLists('not json', onDevice))).toEqual(['local-1']);
  });
});

describe('the same transaction on two devices', () => {
  it('keeps the later edit', () => {
    const older = list(tx('t1', { amount: 100, updatedAt: '2026-08-01T10:00:00.000Z' }));
    const newer = list(tx('t1', { amount: 250, updatedAt: '2026-08-02T09:00:00.000Z' }));

    const localNewer = JSON.parse(mergeExpenseLists(newer, older)!) as Tx[];
    const remoteNewer = JSON.parse(mergeExpenseLists(older, newer)!) as Tx[];

    expect(localNewer).toHaveLength(1);
    expect(localNewer[0].amount).toBe(250);
    expect(remoteNewer).toHaveLength(1);
    expect(remoteNewer[0].amount).toBe(250);
  });

  it('is a no-op when both copies are identical', () => {
    const same = list(tx('t1'), tx('t2'));
    expect(mergeExpenseLists(same, same)).toBe(same);
  });

  it('does not duplicate legacy rows that have no id, however often it runs', () => {
    const legacy = JSON.stringify([{ amount: 40, category: 'food', date: '2026-07-02' }]);
    const once = mergeExpenseLists(legacy, legacy);
    const twice = mergeExpenseLists(once, legacy);
    expect(JSON.parse(once!)).toHaveLength(1);
    expect(JSON.parse(twice!)).toHaveLength(1);
  });

  it('keeps two identical legacy rows as two — the same coffee twice is two spends', () => {
    const coffee = { amount: 40, category: 'food', date: '2026-07-02', note: 'Coffee' };
    const twice = JSON.stringify([coffee, coffee]);
    expect(JSON.parse(mergeExpenseLists(twice, twice)!)).toHaveLength(2);
    // …and one side having logged it twice while the other has it once still
    // leaves both, rather than dropping the one the cloud has not seen.
    expect(JSON.parse(mergeExpenseLists(twice, JSON.stringify([coffee]))!)).toHaveLength(2);
  });

  it('recognises a legacy row that the other device has already given an id', () => {
    // `loadExpenses` mints ids for pre-V4 rows as it reads them, so each device
    // mints a different one for what is a single spend. Matching on what the
    // row says is what stops the first device to save turning it into two.
    const legacy = JSON.stringify([{ amount: 40, category: 'food', date: '2026-07-02', note: 'Chai' }]);
    const withId = JSON.stringify([
      { id: 'tx_minted_on_the_phone', amount: 40, category: 'food', date: '2026-07-02', note: 'Chai' },
    ]);

    const merged = JSON.parse(mergeExpenseLists(legacy, withId)!) as Tx[];

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('tx_minted_on_the_phone');
  });
});

describe('deletions survive the merge', () => {
  const deletedAt = Date.parse('2026-08-05T12:00:00.000Z');

  it('does not resurrect a row deleted on another device', () => {
    // The phone deleted t2 and pushed; this laptop still has its copy.
    const onDevice = list(tx('t1'), tx('t2'));
    const inCloud = list(tx('t1'));

    const merged = mergeExpenseLists(onDevice, inCloud, { t2: deletedAt });

    expect(idsIn(merged)).toEqual(['t1']);
  });

  it('removes it whichever side the row is on', () => {
    const merged = mergeExpenseLists(list(tx('t1')), list(tx('t1'), tx('t2')), { t2: deletedAt });
    expect(idsIn(merged)).toEqual(['t1']);
  });

  it('keeps a row that was edited after the deletion', () => {
    const editedAfter = list(tx('t2', { updatedAt: '2026-08-06T08:00:00.000Z' }));
    const merged = mergeExpenseLists(editedAfter, '[]', { t2: deletedAt });
    expect(idsIn(merged)).toEqual(['t2']);
  });

  it('drops an untimestamped row, which cannot claim to be newer', () => {
    const legacy = JSON.stringify([{ id: 't2', amount: 10, category: 'food', date: '2026-08-01' }]);
    expect(idsIn(mergeExpenseLists(legacy, '[]', { t2: deletedAt }))).toEqual([]);
  });
});

describe('deletion records', () => {
  const now = Date.parse('2026-08-16T00:00:00.000Z');

  it('unions both devices, keeping the latest deletion of a row', () => {
    const [early, mid, late] = [now - 3000, now - 2000, now - 1000];
    const merged = mergeTombstoneMaps(
      JSON.stringify({ a: early, shared: early }),
      JSON.stringify({ b: mid, shared: late }),
      now,
    );
    expect(merged).toEqual({ a: early, b: mid, shared: late });
  });

  it('forgets deletions older than the retention window', () => {
    const stale = now - TOMBSTONE_TTL_MS - 1;
    const fresh = now - 1000;
    const merged = mergeTombstoneMaps(JSON.stringify({ old: stale, recent: fresh }), null, now);
    expect(merged).toEqual({ recent: fresh });
  });

  it('caps the count, keeping the newest', () => {
    const many: Record<string, number> = {};
    for (let i = 0; i < MAX_TOMBSTONES + 50; i++) many[`t${i}`] = now - i * 1000;
    const merged = mergeTombstoneMaps(JSON.stringify(many), null, now);
    expect(Object.keys(merged)).toHaveLength(MAX_TOMBSTONES);
    expect(merged.t0).toBeDefined(); // newest kept
    expect(merged[`t${MAX_TOMBSTONES + 49}`]).toBeUndefined(); // oldest dropped
  });

  it('ignores junk values', () => {
    const merged = mergeTombstoneMaps(JSON.stringify({ ok: now, bad: 'x', zero: 0 }), '[]', now);
    expect(merged).toEqual({ ok: now });
  });
});

describe('the change history', () => {
  const entry = (id: string, ts: number) => ({ id, ts, action: 'add', txId: 't', amount: 1, category: 'food', date: '2026-08-01', label: 'x' });

  it('keeps both devices’ entries, newest first', () => {
    const merged = mergeAuditLogs(
      JSON.stringify([entry('a', 300), entry('b', 100)]),
      JSON.stringify([entry('c', 200)]),
    );
    expect((JSON.parse(merged!) as { id: string }[]).map((e) => e.id)).toEqual(['a', 'c', 'b']);
  });

  it('does not double-count entries both sides already have', () => {
    const shared = JSON.stringify([entry('a', 300)]);
    expect(JSON.parse(mergeAuditLogs(shared, shared)!)).toHaveLength(1);
  });

  it('applies the same ceiling as a local append', () => {
    const many = Array.from({ length: MAX_AUDIT_ENTRIES }, (_, i) => entry(`l${i}`, i));
    const more = Array.from({ length: 40 }, (_, i) => entry(`r${i}`, 10_000 + i));
    const merged = JSON.parse(mergeAuditLogs(JSON.stringify(many), JSON.stringify(more))!);
    expect(merged).toHaveLength(MAX_AUDIT_ENTRIES);
  });
});

describe('learned merchant categories', () => {
  it('takes the most recently confirmed answer per merchant', () => {
    const local = JSON.stringify({ swiggy: { category: 'food', count: 2, updatedAt: '2026-08-01T00:00:00.000Z' } });
    const remote = JSON.stringify({
      swiggy: { category: 'grocery', count: 1, updatedAt: '2026-08-09T00:00:00.000Z' },
      uber: { category: 'transport', count: 3, updatedAt: '2026-08-02T00:00:00.000Z' },
    });
    const merged = JSON.parse(mergeLearnedMerchants(local, remote)!);
    expect(merged.swiggy.category).toBe('grocery');
    expect(merged.uber.category).toBe('transport');
  });
});

describe('reconciling the whole blob', () => {
  const local = { fx_expenses: list(tx('local-1')), fx_currency: 'GBP' };
  const remote = { fx_expenses: list(tx('cloud-1')), fx_currency: 'INR' };

  it('reports which keys the cloud does not have yet', () => {
    const { merged, aheadKeys } = mergeCloudBlob(SYNC_KEYS, local, remote);
    expect(idsIn(merged.fx_expenses)).toEqual(['local-1', 'cloud-1']);
    expect(aheadKeys).toEqual(['fx_expenses']);
  });

  it('reports nothing to do when the two are already in step', () => {
    const same = { fx_expenses: list(tx('t1')), fx_currency: 'INR' };
    expect(mergeCloudBlob(SYNC_KEYS, same, same).aheadKeys).toEqual([]);
  });

  it('takes the cloud’s setting unless this device changed it and has not saved', () => {
    expect(mergeCloudBlob(SYNC_KEYS, local, remote).merged.fx_currency).toBe('INR');
    expect(mergeCloudBlob(SYNC_KEYS, local, remote, { pending: new Set(['fx_currency']) }).merged.fx_currency).toBe('GBP');
  });

  it('treats a whole key missing from the cloud as deleted, except on a guest’s first merge', () => {
    const device = { fx_goals: '{"a":1}', fx_expenses: list(tx('guest')) };
    expect(mergeCloudBlob(SYNC_KEYS, device, {}).merged).toEqual({});
    const first = mergeCloudBlob(SYNC_KEYS, device, {}, { keepLocalOnly: true });
    expect(first.merged.fx_goals).toBe('{"a":1}');
    expect(first.merged.fx_expenses).toBe(device.fx_expenses);
  });

  it('keeps a whole key this device removed and has not saved removed', () => {
    const { merged } = mergeCloudBlob(SYNC_KEYS, {}, remote, { pending: new Set(['fx_expenses']) });
    expect(merged.fx_expenses).toBeUndefined();
  });

  it('applies both devices’ deletion records to the merged ledger', () => {
    const deletedAt = Date.parse('2026-08-10T00:00:00.000Z');
    const { merged } = mergeCloudBlob(
      SYNC_KEYS,
      { fx_expenses: list(tx('t1'), tx('t2')) },
      { fx_expenses: list(tx('t1')), [TOMBSTONE_KEY]: JSON.stringify({ t2: deletedAt }) },
      { now: deletedAt },
    );
    expect(idsIn(merged.fx_expenses)).toEqual(['t1']);
  });

  it('syncs the deletion records themselves', () => {
    expect(SYNC_KEYS).toContain(TOMBSTONE_KEY);
  });
});

describe('deletion records and the change history', () => {
  const NOW = Date.parse('2026-11-01T00:00:00.000Z');
  const event = (txId: string, action: string, ts: number) => ({ id: `${txId}-${action}`, txId, action, ts });
  const history = (...events: ReturnType<typeof event>[]) => JSON.stringify(events);

  it('recovers a deletion only the history knows about', () => {
    expect(applyAuditToTombstones({}, history(event('a', 'delete', NOW - 10)), NOW)).toEqual({ a: NOW - 10 });
  });

  it('lifts a deletion that a later restore overrode, whichever device held it', () => {
    const audit = history(event('a', 'restore', NOW - 5), event('a', 'delete', NOW - 10));
    expect(applyAuditToTombstones({ a: NOW - 10 }, audit, NOW)).toEqual({});
  });

  it('keeps a deletion made after an earlier restore', () => {
    const audit = history(event('a', 'delete', NOW - 1), event('a', 'restore', NOW - 5));
    expect(applyAuditToTombstones({}, audit, NOW)).toEqual({ a: NOW - 1 });
  });

  it('ignores an unreadable history', () => {
    expect(applyAuditToTombstones({ a: NOW - 1 }, 'not json', NOW)).toEqual({ a: NOW - 1 });
  });
});
