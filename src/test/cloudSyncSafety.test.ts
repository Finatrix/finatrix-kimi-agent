import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ read: vi.fn(), upsert: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: h.read }) }),
      upsert: h.upsert,
    }),
  },
}));

import { clearSyncedLocal, hasPendingCloudChanges, loadCloudIntoLocal, pushLocalToCloud, recordPendingCloudChange } from '../tools/cloudSync';
import { store } from '../tools/lib/storage';

beforeEach(() => {
  localStorage.clear();
  h.read.mockReset();
  h.upsert.mockReset().mockResolvedValue({ error: null });
});
afterEach(() => {
  vi.restoreAllMocks();
  clearSyncedLocal();
});

describe('cloud storage account and failure boundaries', () => {
  it('ignores a cloud response after its account is no longer active', async () => {
    let finish!: (value: unknown) => void;
    let active = true;
    h.read.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const pending = loadCloudIntoLocal('old-user', () => active);
    active = false;
    store.set('fx_expenses', '["new-user-data"]');
    finish({ data: { data: { fx_expenses: '["old-user-data"]' } }, error: null });
    expect(await pending).toBe('idle');
    expect(store.raw('fx_expenses')).toBe('["new-user-data"]');
  });

  it('handles a rejected read without mutating the current copy', async () => {
    store.set('fx_expenses', '[]');
    h.read.mockRejectedValue(new Error('Network unavailable'));
    expect(await loadCloudIntoLocal('user')).toBe('error');
    expect(store.raw('fx_expenses')).toBe('[]');
  });

  it('removes keys deleted from an existing cloud snapshot instead of resurrecting them', async () => {
    store.set('fx_expenses', '["stale-device-copy"]');
    h.read.mockResolvedValue({ data: { data: { fx_currency: 'AUD' } }, error: null });
    expect(await loadCloudIntoLocal('user')).toBe('saved');
    expect(store.raw('fx_expenses')).toBeNull();
    await pushLocalToCloud('user');
    expect(h.upsert.mock.calls[0][0].data).toEqual({ fx_currency: 'AUD' });
  });

  it('preserves guest keys for the explicit first-account merge', async () => {
    store.set('fx_expenses', '["guest-entry"]');
    h.read.mockResolvedValue({ data: { data: { fx_currency: 'AUD' } }, error: null });
    expect(await loadCloudIntoLocal('user', () => true, { mergeLocal: true })).toBe('saved');
    expect(store.raw('fx_expenses')).toBe('["guest-entry"]');
    expect(store.raw('fx_currency')).toBe('AUD');
  });

  it('preserves the device copy when no cloud row has ever been created', async () => {
    store.set('fx_expenses', '["first-entry"]');
    h.read.mockResolvedValue({ data: null, error: null });
    expect(await loadCloudIntoLocal('user')).toBe('saved');
    expect(store.raw('fx_expenses')).toBe('["first-entry"]');
  });

  it('rejects malformed cloud values before applying any of the snapshot', async () => {
    store.set('fx_expenses', '["existing"]');
    h.read.mockResolvedValue({ data: { data: { fx_expenses: '[]', fx_goals: { malformed: true } } }, error: null });
    expect(await loadCloudIntoLocal('user')).toBe('error');
    expect(store.raw('fx_expenses')).toBe('["existing"]');
  });

  it('reports a rejected save as a sync error', async () => {
    h.upsert.mockRejectedValue(new Error('Network unavailable'));
    expect(await pushLocalToCloud('user')).toBe('error');
  });

  it('merges pending offline edits and deletions over cloud while loading untouched data', async () => {
    store.set('fx_expenses', '["offline-edit"]');
    recordPendingCloudChange('user', 'fx_expenses');
    store.remove('fx_goals');
    recordPendingCloudChange('user', 'fx_goals');
    h.read.mockResolvedValue({ data: { data: { fx_expenses: '["old"]', fx_goals: '{}', fx_currency: 'AUD' } }, error: null });
    expect(await loadCloudIntoLocal('user')).toBe('saved');
    expect(store.raw('fx_expenses')).toBe('["offline-edit"]');
    expect(store.raw('fx_goals')).toBeNull();
    expect(store.raw('fx_currency')).toBe('AUD');
    expect(hasPendingCloudChanges('user')).toBe(true);
    await pushLocalToCloud('user');
    expect(h.upsert.mock.calls[0][0].data).toEqual({ fx_expenses: '["offline-edit"]', fx_currency: 'AUD' });
    expect(hasPendingCloudChanges('user')).toBe(false);
  });

  it('does not clear newer pending edits when an older save completes', async () => {
    let finish!: (value: unknown) => void;
    h.upsert.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    store.set('fx_expenses', '["first"]');
    recordPendingCloudChange('user', 'fx_expenses');
    const pending = pushLocalToCloud('user');
    store.set('fx_expenses', '["second"]');
    recordPendingCloudChange('user', 'fx_expenses');
    finish({ error: null });
    await pending;
    expect(hasPendingCloudChanges('user')).toBe(true);
  });

  it('does not clear another account’s pending edits when a previous save completes', async () => {
    let finish!: (value: unknown) => void;
    h.upsert.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const pending = pushLocalToCloud('old-user');
    store.set('fx_expenses', '["new-user-edit"]');
    recordPendingCloudChange('new-user', 'fx_expenses');
    finish({ error: null });
    await pending;
    expect(hasPendingCloudChanges('new-user')).toBe(true);
  });

  it('clears private statement drafts when clearing an account from this device', () => {
    store.set('fx_import_staged', '{"description":"private statement"}');
    clearSyncedLocal();
    expect(store.raw('fx_import_staged')).toBeNull();
  });

  it('does not resurrect or upload data when a device refuses a deletion', async () => {
    store.set('fx_expenses', '["private"]');
    const blocked = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Storage denied', 'SecurityError');
    });
    store.remove('fx_expenses');
    expect(localStorage.getItem('fx_expenses')).toBe('["private"]');
    expect(store.raw('fx_expenses')).toBeNull();
    expect(store.get('fx_expenses', '[]')).toBe('[]');
    expect(store.hasUnpersistedChanges).toBe(true);
    await pushLocalToCloud('user');
    expect(h.upsert.mock.calls[0][0].data).not.toHaveProperty('fx_expenses');
    blocked.mockRestore();
    store.remove('fx_expenses');
    expect(store.hasUnpersistedChanges).toBe(false);
    expect(localStorage.getItem('fx_expenses')).toBeNull();
  });
});
