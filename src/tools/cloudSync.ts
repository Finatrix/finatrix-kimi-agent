import { supabase, isSupabaseConfigured } from '../lib/supabase';

/**
 * Cloud sync bridge for the tools.
 *
 * The tools run untouched inside a same-origin <iframe>, so the data they write
 * to localStorage (keys below) lives in the SAME localStorage as this app. We
 * therefore sync purely by reading/writing those localStorage keys and pushing
 * them to the signed-in user's row in Supabase — without changing the tools.
 */

export const SYNC_KEYS = ['fx_expenses', 'fx_budget'];
const LAST_UID_KEY = 'fx_last_uid';

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}
function lsRemove(k: string) {
  try {
    localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export function clearSyncedLocal() {
  SYNC_KEYS.forEach(lsRemove);
}

export function getLastUid(): string | null {
  return lsGet(LAST_UID_KEY);
}
export function setLastUid(id: string | null) {
  if (id) lsSet(LAST_UID_KEY, id);
  else lsRemove(LAST_UID_KEY);
}

/** Load the user's cloud data into localStorage (cloud wins for keys it has). */
export async function loadCloudIntoLocal(userId: string): Promise<SyncStatus> {
  if (!isSupabaseConfigured) return 'offline';
  const { data, error } = await supabase
    .from('tool_data')
    .select('data')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return 'error';
  const blob = (data?.data || {}) as Record<string, string>;
  SYNC_KEYS.forEach((k) => {
    if (k in blob && blob[k] != null) lsSet(k, blob[k]);
  });
  return 'saved';
}

/** Push the current localStorage values up to the user's cloud row. */
export async function pushLocalToCloud(userId: string): Promise<SyncStatus> {
  if (!isSupabaseConfigured) return 'offline';
  const blob: Record<string, string> = {};
  SYNC_KEYS.forEach((k) => {
    const v = lsGet(k);
    if (v != null) blob[k] = v;
  });
  const { error } = await supabase.from('tool_data').upsert(
    { user_id: userId, data: blob, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
  return error ? 'error' : 'saved';
}
