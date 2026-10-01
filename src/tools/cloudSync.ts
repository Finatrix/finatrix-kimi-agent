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
  // Per-month category arrangements. `fx_bb_cats`/`fx_bb_catprefs` above are the
  // account-wide TEMPLATE a month inherits when nothing earlier overrides it;
  // this is the set of months that carry their own. Both have to travel, or a
  // second device rebuilds every month from the template and silently undoes
  // every per-month decision. See lib/budgetCatsMonth.ts.
  'fx_bb_cats_by_month',
  'fx_bb_income',
  // Opening/closing bank balances per month, and the financial-year start the
  // Wallet reports against. Small, and useless on one device only.
  'fx_exp_bank',
  'fx_fy_start',
  'fx_lifemap',
  'fx_investmatch',
  'fx_parksmart',
  'fx_peercompare',
  'fx_goals',
  'fx_planning',
  'fx_networth',
  // Which market's instruments, tax rules and benchmarks the tools compare
  // against. Travels for the same reason the currency does: someone who set
  // themselves to the UK on a laptop has not moved back to India by opening
  // the app on their phone.
  'fx_market',
  // Exchange rates the user corrected by hand. Small, and a rate someone
  // bothered to look up should not have to be looked up again on their phone.
  'fx_fx_overrides',
];
/** Sensitive statement drafts stay on this device but belong to its account. */
export const ACCOUNT_LOCAL_KEYS = ['fx_import_staged'];
const LAST_UID_KEY = 'fx_last_uid';
const PENDING_KEY = 'fx_sync_pending';

interface PendingChanges {
  userId: string;
  keys: string[];
}

function pendingChanges(userId: string): Record<string, string | null> {
  try {
    const pending = JSON.parse(store.get(PENDING_KEY, 'null')) as PendingChanges | null;
    if (pending?.userId !== userId || !Array.isArray(pending.keys)) return {};
    return Object.fromEntries(pending.keys.filter((key) => SYNC_KEYS.includes(key)).map((key) => [key, store.raw(key)]));
  } catch {
    return {};
  }
}

/** Keep offline edits separate so a later cloud read cannot erase them. */
export function recordPendingCloudChange(userId: string, key: string | null) {
  const values = pendingChanges(userId);
  for (const changedKey of key ? [key] : SYNC_KEYS) {
    if (SYNC_KEYS.includes(changedKey)) values[changedKey] = store.raw(changedKey);
  }
  // Persist just the keys: duplicating a large ledger here can exhaust device
  // quota. Its latest value already lives in the normal storage key.
  store.set(PENDING_KEY, JSON.stringify({ userId, keys: Object.keys(values) }));
}

export function hasPendingCloudChanges(userId: string): boolean {
  return Object.keys(pendingChanges(userId)).length > 0;
}

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
  [...SYNC_KEYS, ...ACCOUNT_LOCAL_KEYS].forEach((k) => store.remove(k));
  store.remove(PENDING_KEY);
}

export function getLastUid(): string | null {
  return lsGet(LAST_UID_KEY);
}
export function setLastUid(id: string | null) {
  if (id) lsSet(LAST_UID_KEY, id);
  else lsRemove(LAST_UID_KEY);
}

/** Load cloud data, preserving this account's confirmed but unsaved edits. */
export async function loadCloudIntoLocal(
  userId: string,
  shouldApply: () => boolean = () => true,
  { mergeLocal = false }: { mergeLocal?: boolean } = {},
): Promise<SyncStatus> {
  if (!isSupabaseConfigured) return 'offline';
  try {
    const { data, error } = await supabase
      .from('tool_data')
      .select('data')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return 'error';
    // The caller can switch account or unmount while the request is pending.
    // Check before writing anything, not after this function has mutated storage.
    if (!shouldApply()) return 'idle';
    const blob: unknown = data?.data ?? {};
    if (!blob || typeof blob !== 'object' || Array.isArray(blob)) return 'error';
    const values = blob as Record<string, unknown>;
    if (SYNC_KEYS.some((k) => values[k] != null && typeof values[k] !== 'string')) return 'error';
    const pending = pendingChanges(userId);
    SYNC_KEYS.forEach((k) => {
      if (typeof values[k] === 'string') store.set(k, values[k]);
      // An existing row is a complete snapshot, so omitted keys were deleted.
      // Preserve guest data only for the explicit first-account merge.
      else if (data && !mergeLocal) store.remove(k);
    });
    // The device may have been edited while offline. Those confirmed edits
    // override the older cloud values; untouched areas still come from cloud.
    for (const [key, value] of Object.entries(pending)) {
      if (value === null) store.remove(key);
      else store.set(key, value);
    }
    return 'saved';
  } catch {
    return 'error';
  }
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
  try {
    const { error } = await supabase.from('tool_data').upsert(
      { user_id: userId, data: blob, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
    if (error) return 'error';
    const pending = pendingChanges(userId);
    if (!Object.keys(pending).length) return 'saved';
    for (const [key, value] of Object.entries(pending)) {
      // Preserve a newer edit made while this save was in flight.
      if (value === (blob[key] ?? null)) delete pending[key];
    }
    if (Object.keys(pending).length) store.set(PENDING_KEY, JSON.stringify({ userId, keys: Object.keys(pending) }));
    else store.remove(PENDING_KEY);
    return 'saved';
  } catch {
    return 'error';
  }
}
