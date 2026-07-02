import { supabase, isSupabaseConfigured } from '../lib/supabase';

/**
 * Cloud sync bridge for the tools.
 *
 * The tools are native React pages that persist to localStorage under the keys
 * below (unchanged from the original app, so existing users' cloud data keeps
 * working). ToolsLayout watches for writes — via the same-document `fx:write`
 * event dispatched by the storage wrapper, plus cross-tab `storage` events — and
 * debounces a push of these keys to the signed-in user's Supabase row. The keys,
 * the RLS-protected `tool_data` JSONB row, and the pull/push logic are preserved
 * exactly.
 */

export const SYNC_KEYS = [
  'fx_expenses',
  'fx_budget',
  'fx_currency',
  'fx_budgets',
  'fx_bb_data',
  'fx_lifemap',
  'fx_investmatch',
  'fx_parksmart',
  'fx_peercompare',
  'fx_goals',
];
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
