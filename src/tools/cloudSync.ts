import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { store } from './lib/storage';

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
  // The expense change history rides along with the ledger it describes: a
  // record of "what did I delete?" that only exists on the device where the
  // deletion happened answers the question exactly where it is least useful.
  'fx_expense_audit',
  // Categorisation preferences learned from confirmed statement imports. Holds
  // merchant names and category keys only — no amounts, dates or references —
  // and following the user between devices is the whole point: a preference
  // that only applies on the laptop is one they have to teach twice. The staged
  // review itself (`fx_import_staged`) is deliberately NOT here; see draft.ts.
  'fx_import_merchants',
  'fx_budget',
  'fx_currency',
  'fx_budgets',
  'fx_bb_data',
  'fx_bb_cats',
  'fx_bb_catprefs',
  'fx_bb_income',
  'fx_lifemap',
  'fx_investmatch',
  'fx_parksmart',
  'fx_peercompare',
  'fx_goals',
  'fx_networth',
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

// Writes go through `store` (not raw localStorage) so the same-document
// `fx:write` event fires and already-mounted consumers — CurrencyProvider,
// the notifications bell — pick the new values up immediately. Tool pages
// mount after seeding (ToolsLayout gates on `ready`), but those providers
// mount before it.
export function clearSyncedLocal() {
  SYNC_KEYS.forEach((k) => store.remove(k));
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
    if (k in blob && blob[k] != null) store.set(k, blob[k]);
  });
  return 'saved';
}

/**
 * Push the current tool values up to the user's cloud row.
 *
 * Reads through `store`, not raw localStorage. When a write could not reach
 * localStorage — quota exceeded on a large expense list, or Safari private
 * mode — the storage wrapper keeps the value in its in-memory shadow and the
 * UI carries on showing it. Reading `localStorage` directly here would upload
 * the older value (or omit the key entirely, deleting it from the cloud blob),
 * so the user's most recent edits were silently lost on the next device.
 */
export async function pushLocalToCloud(userId: string): Promise<SyncStatus> {
  if (!isSupabaseConfigured) return 'offline';
  const blob: Record<string, string> = {};
  SYNC_KEYS.forEach((k) => {
    const v = store.raw(k);
    if (v != null) blob[k] = v;
  });
  const { error } = await supabase.from('tool_data').upsert(
    { user_id: userId, data: blob, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
  return error ? 'error' : 'saved';
}
