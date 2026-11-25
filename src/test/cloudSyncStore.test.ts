import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Cloud sync against a stand-in for the `tool_data` row.
 *
 * The fake implements only what `cloudSync` actually calls, including the part
 * that matters most: an `update ... where updated_at = <the version I merged
 * with>` matches nothing once another device has written. That is the whole
 * mechanism protecting a user with two devices, so it is modelled rather than
 * stubbed — a mock that always accepts the write would pass whatever we wrote.
 */

interface StoredRow {
  user_id: string;
  data: Record<string, string>;
  updated_at: string;
}

const db = vi.hoisted(() => {
  const state = {
    rows: new Map<string, StoredRow>(),
    version: 0,
    failRead: false,
    failWrite: false,
    reads: 0,
    writes: 0,
  };
  const err = { message: 'boom' };

  const from = (table: string) => {
    if (table !== 'tool_data') throw new Error(`unexpected table ${table}`);
    return {
      select() {
        const filters: Record<string, string> = {};
        const builder = {
          eq(column: string, value: string) {
            filters[column] = value;
            return builder;
          },
          async maybeSingle() {
            state.reads += 1;
            if (state.failRead) return { data: null, error: err };
            const row = state.rows.get(filters.user_id);
            return { data: row ? { ...row } : null, error: null };
          },
        };
        return builder;
      },
      update(patch: { data: Record<string, string>; updated_at: string }) {
        const filters: Record<string, string> = {};
        const builder = {
          eq(column: string, value: string) {
            filters[column] = value;
            return builder;
          },
          select() {
            return {
              async maybeSingle() {
                state.writes += 1;
                if (state.failWrite) return { data: null, error: err };
                const row = state.rows.get(filters.user_id);
                // The compare-and-set: a row that has moved on since the
                // caller last read it does not match, and nothing is written.
                if (!row || (filters.updated_at && row.updated_at !== filters.updated_at)) {
                  return { data: null, error: null };
                }
                row.data = patch.data;
                row.updated_at = patch.updated_at;
                return { data: { updated_at: row.updated_at }, error: null };
              },
            };
          },
        };
        return builder;
      },
      upsert(payload: StoredRow) {
        return {
          select() {
            return {
              async maybeSingle() {
                state.writes += 1;
                if (state.failWrite) return { data: null, error: err };
                state.rows.set(payload.user_id, { ...payload });
                return { data: { updated_at: payload.updated_at }, error: null };
              },
            };
          },
        };
      },
    };
  };

  return { state, from };
});

vi.mock('../lib/supabase', () => ({
  supabase: { from: db.from },
  isSupabaseConfigured: true,
}));

import { clearSyncedLocal, hasPendingCloudChanges, loadCloudIntoLocal, pushLocalToCloud, recordPendingCloudChange, resetSyncVersion } from '../tools/cloudSync';
import { store } from '../tools/lib/storage';

const UID = 'user-1';

const tx = (id: string, updatedAt = '2026-08-01T10:00:00.000Z') =>
  ({ id, amount: 100, category: 'food', date: '2026-08-01', createdAt: updatedAt, updatedAt });

const ledger = (...ids: string[]) => JSON.stringify(ids.map((id) => tx(id)));
const localIds = () => JSON.parse(localStorage.getItem('fx_expenses') ?? '[]').map((t: { id: string }) => t.id);
const cloudIds = () =>
  JSON.parse(db.state.rows.get(UID)?.data.fx_expenses ?? '[]').map((t: { id: string }) => t.id);

/** Another device writes to the row while this one is not looking. */
function otherDeviceWrites(data: Record<string, string>) {
  db.state.version += 1;
  db.state.rows.set(UID, {
    user_id: UID,
    data,
    updated_at: `2026-08-16T00:00:00.${String(db.state.version).padStart(3, '0')}+00:00`,
  });
}

describe('cloud sync', () => {
  beforeEach(() => {
    localStorage.clear();
    db.state.rows.clear();
    db.state.version = 0;
    db.state.failRead = false;
    db.state.failWrite = false;
    db.state.reads = 0;
    db.state.writes = 0;
    resetSyncVersion();
  });

  describe('signing in', () => {
    it('keeps transactions this device logged before signing in', async () => {
      localStorage.setItem('fx_expenses', ledger('before-signin'));
      otherDeviceWrites({ fx_expenses: ledger('from-cloud') });

      const result = await loadCloudIntoLocal(UID);

      expect(localIds()).toEqual(['before-signin', 'from-cloud']);
      expect(result).toBe('saved');
      // …and says so, so the shell pushes the rescued rows back up.
      expect(hasPendingCloudChanges(UID)).toBe(true);
    });

    it('writes nothing when the device is already in step', async () => {
      localStorage.setItem('fx_expenses', ledger('t1'));
      otherDeviceWrites({ fx_expenses: ledger('t1') });

      await loadCloudIntoLocal(UID);

      expect(hasPendingCloudChanges(UID)).toBe(false);
      expect(db.state.writes).toBe(0);
    });

    it('leaves local data alone when the read fails', async () => {
      localStorage.setItem('fx_expenses', ledger('t1'));
      db.state.failRead = true;

      const result = await loadCloudIntoLocal(UID);

      expect(result).toBe('error');
      expect(localIds()).toEqual(['t1']);
    });

    it('does not resurrect a transaction deleted on another device', async () => {
      localStorage.setItem('fx_expenses', ledger('keep', 'deleted-elsewhere'));
      otherDeviceWrites({
        fx_expenses: ledger('keep'),
        fx_expense_tombstones: JSON.stringify({ 'deleted-elsewhere': Date.now() }),
      });

      await loadCloudIntoLocal(UID);

      expect(localIds()).toEqual(['keep']);
    });
  });

  describe('saving', () => {
    it('creates the row on the first ever write', async () => {
      localStorage.setItem('fx_expenses', ledger('t1'));

      expect(await pushLocalToCloud(UID)).toBe('saved');
      expect(cloudIds()).toEqual(['t1']);
    });

    it('reports an error the caller can retry, without touching local data', async () => {
      localStorage.setItem('fx_expenses', ledger('t1'));
      db.state.failWrite = true;

      expect(await pushLocalToCloud(UID)).toBe('error');
      expect(localIds()).toEqual(['t1']);
    });

    it('adds to what another device wrote instead of overwriting it', async () => {
      // This device signs in and sees one transaction.
      localStorage.setItem('fx_expenses', ledger('shared'));
      otherDeviceWrites({ fx_expenses: ledger('shared') });
      await loadCloudIntoLocal(UID);

      // The phone logs one while this tab sits open…
      otherDeviceWrites({ fx_expenses: ledger('shared', 'from-phone') });
      // …and this device logs its own and saves.
      localStorage.setItem('fx_expenses', ledger('shared', 'from-laptop'));

      expect(await pushLocalToCloud(UID)).toBe('saved');

      expect(cloudIds().sort()).toEqual(['from-laptop', 'from-phone', 'shared']);
      // The rows it learned about on the way land here too, so the next edit
      // from this device cannot write them back out of the account.
      expect(localIds().sort()).toEqual(['from-laptop', 'from-phone', 'shared']);
    });

    it('does not send a second write when the first one is accepted', async () => {
      localStorage.setItem('fx_expenses', ledger('t1'));
      await pushLocalToCloud(UID);
      db.state.writes = 0;

      localStorage.setItem('fx_expenses', ledger('t1', 't2'));
      expect(await pushLocalToCloud(UID)).toBe('saved');

      expect(db.state.writes).toBe(1);
      expect(cloudIds()).toEqual(['t1', 't2']);
    });

    it('recreates the row if the account data was deleted server-side', async () => {
      localStorage.setItem('fx_expenses', ledger('t1'));
      await pushLocalToCloud(UID);
      db.state.rows.clear();

      localStorage.setItem('fx_expenses', ledger('t1', 't2'));
      expect(await pushLocalToCloud(UID)).toBe('saved');
      expect(cloudIds()).toEqual(['t1', 't2']);
    });
  });

  describe('between devices', () => {
    const rows = (...ids: string[]) => ledger(...ids);

    it('brings back a restored transaction even when the other device still holds the deletion', async () => {
      const deletedAt = Date.now() - 5_000;
      const history = (action: string, ts: number) => ({ id: `${action}-a`, ts, action, txId: 'a' });
      localStorage.setItem('fx_expenses', rows('a'));
      localStorage.setItem('fx_expense_audit', JSON.stringify([history('restore', deletedAt + 1_000), history('delete', deletedAt)]));
      otherDeviceWrites({
        fx_expenses: rows('a'),
        fx_expense_audit: JSON.stringify([history('delete', deletedAt)]),
        fx_expense_tombstones: JSON.stringify({ a: deletedAt }),
      });

      await loadCloudIntoLocal(UID);

      expect(localIds()).toEqual(['a']);
      expect(localStorage.getItem('fx_expense_tombstones')).toBeNull();
    });

    it('honours a deletion from an installed app that only wrote its history', async () => {
      const entry = { id: 'e1', ts: Date.now() - 1_000, action: 'delete', txId: 'gone' };
      localStorage.setItem('fx_expenses', rows('keep', 'gone'));
      otherDeviceWrites({ fx_expenses: rows('keep'), fx_expense_audit: JSON.stringify([entry]) });

      await loadCloudIntoLocal(UID);

      expect(localIds()).toEqual(['keep']);
    });

    it('keeps deletion records when an installed app saves without them', async () => {
      const tombstones = JSON.stringify({ gone: Date.now() - 1_000 });
      localStorage.setItem('fx_expense_tombstones', tombstones);
      otherDeviceWrites({ fx_expenses: rows('keep') });

      await loadCloudIntoLocal(UID);

      expect(localStorage.getItem('fx_expense_tombstones')).toBe(tombstones);
      expect(hasPendingCloudChanges(UID)).toBe(true);
    });

    it('still removes everything after a delete-all on another device', async () => {
      localStorage.setItem('fx_expenses', rows('old'));
      localStorage.setItem('fx_goals', '{"a":1}');
      otherDeviceWrites({ fx_currency: 'INR' });

      await loadCloudIntoLocal(UID);

      expect(localStorage.getItem('fx_expenses')).toBeNull();
      expect(localStorage.getItem('fx_goals')).toBeNull();
      expect(localStorage.getItem('fx_currency')).toBe('INR');
    });

    it('settles a conflict key by key, so neither device loses its setting', async () => {
      otherDeviceWrites({ fx_currency: 'INR', fx_goals: '{"old":1}' });
      await loadCloudIntoLocal(UID);

      otherDeviceWrites({ fx_currency: 'GBP', fx_goals: '{"old":1}' });
      store.set('fx_goals', '{"new":1}');
      recordPendingCloudChange(UID, 'fx_goals');

      expect(await pushLocalToCloud(UID)).toBe('saved');

      const cloud = db.state.rows.get(UID)!.data;
      expect(cloud.fx_currency).toBe('GBP');
      expect(cloud.fx_goals).toBe('{"new":1}');
      expect(localStorage.getItem('fx_currency')).toBe('GBP');
    });

    it('does not treat the same rows in another order as a change', async () => {
      localStorage.setItem('fx_expenses', rows('a', 'b'));
      otherDeviceWrites({ fx_expenses: rows('b', 'a') });

      await loadCloudIntoLocal(UID);

      expect(hasPendingCloudChanges(UID)).toBe(false);
    });

    it('does not land a previous account’s rows after an account switch', async () => {
      otherDeviceWrites({ fx_expenses: rows('shared') });
      await loadCloudIntoLocal(UID);
      otherDeviceWrites({ fx_expenses: rows('shared', 'phone') });
      store.set('fx_expenses', rows('shared', 'laptop'));
      recordPendingCloudChange(UID, 'fx_expenses');

      const push = pushLocalToCloud(UID);
      clearSyncedLocal();
      await push;

      expect(localStorage.getItem('fx_expenses')).toBeNull();
      expect(cloudIds().sort()).toEqual(['laptop', 'phone', 'shared']);
    });

    it('re-merges on the next save when the user edited during a conflict', async () => {
      otherDeviceWrites({ fx_expenses: rows('shared') });
      await loadCloudIntoLocal(UID);
      otherDeviceWrites({ fx_expenses: rows('shared', 'phone') });
      store.set('fx_expenses', rows('shared', 'laptop'));
      recordPendingCloudChange(UID, 'fx_expenses');

      const push = pushLocalToCloud(UID);
      store.set('fx_expenses', rows('shared', 'laptop', 'typed-mid-flight'));
      recordPendingCloudChange(UID, 'fx_expenses');
      await push;
      await pushLocalToCloud(UID);

      expect(cloudIds().sort()).toEqual(['laptop', 'phone', 'shared', 'typed-mid-flight']);
    });

    it('uploads what this device holds when the cloud has no row', async () => {
      localStorage.setItem('fx_expenses', rows('only-here'));

      await loadCloudIntoLocal(UID);

      expect(hasPendingCloudChanges(UID)).toBe(true);
    });

    it('keeps an offline delete-all removed', async () => {
      otherDeviceWrites({ fx_goals: '{"a":1}', fx_currency: 'INR' });
      store.remove('fx_goals');
      recordPendingCloudChange(UID, 'fx_goals');

      await loadCloudIntoLocal(UID);

      expect(localStorage.getItem('fx_goals')).toBeNull();
      expect(hasPendingCloudChanges(UID)).toBe(true);
    });
  });
});
