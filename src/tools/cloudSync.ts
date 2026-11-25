import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { runRemoteApply, store } from './lib/storage';
import { TOMBSTONE_KEY } from './lib/expenseTombstones';
import { mergeCloudBlob, TRIPS_KEY } from './lib/syncMerge';

/**
 * Cloud sync bridge for the tools.
 *
 * The tools are native React pages that persist to localStorage under the keys
 * below (unchanged from the original app, so existing users' cloud data keeps
 * working). ToolsLayout watches for writes — via the same-document `fx:write`
 * event dispatched by the storage wrapper, plus cross-tab `storage` events — and
 * debounces a push of these keys to the signed-in user's Supabase row.
 *
 * Sync is a merge in both directions (see `lib/syncMerge.ts`). A load keeps rows
 * the cloud has not seen, and a push is a compare-and-set against the row's
 * `updated_at`: a write that finds another device got there first re-reads,
 * merges and tries again rather than flattening it.
 */

export const SYNC_KEYS = [
  'fx_expenses',
  // The expense change history rides along with the ledger it describes: a
  // record of "what did I delete?" that only exists on the device where the
  // deletion happened answers the question exactly where it is least useful.
  'fx_expense_audit',
  // Which transactions were deleted, so a merge can tell a row the cloud has not
  // seen (keep it) from one deleted on another device (do not bring it back).
  TOMBSTONE_KEY,
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
  // Travel mode's trips (lib/trips.ts). Merged by id with the later edit
  // winning, and a deleted trip keeps a `deletedAt` record so the deletion
  // travels too (`mergeTrips` in lib/syncMerge.ts). Fetched live rates
  // (`fx_fx_live`) are NOT here: every device fetches its own.
  TRIPS_KEY,
];
/**
 * Sensitive statement drafts stay on this device but belong to its account.
 *
 * The app lock setting (`fx_app_lock`, native/appLock/setting.ts) is NOT here,
 * on purpose. This list is cleared on an account switch and whenever a session
 * is lost, and a link that carries someone else's sign-in tokens causes both:
 * with the lock in this list, that link switched the lock off without any
 * unlock. The lock ends with an explicit sign-out only (`clearAppLockOnSignOut`,
 * called from AuthContext.signOut); appLockSetting.test.tsx holds this in place.
 *
 * `fx_groups` and `fx_group_outbox` (lib/groups.ts) are the account's list of
 * groups and its queue of group changes waiting to upload. Neither is synced:
 * groups live in their own server tables. The queue is also tagged with the
 * account that made each change, and only that account's session sends it.
 */
export const ACCOUNT_LOCAL_KEYS = ['fx_import_staged', 'fx_sub_radar', 'fx_money_cal', 'fx_groups', 'fx_group_outbox', 'fx_group_share_cursor', 'fx_group_seen'];
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

/**
 * Bumped whenever this device's account data is cleared. A push still in flight
 * from the previous account compares it before landing anything locally, or
 * that account's rows could appear on the next one.
 */
let localGeneration = 0;

// Writes go through `store` (not raw localStorage) so the same-document
// `fx:write` event fires and already-mounted consumers — CurrencyProvider,
// the notifications bell — pick the new values up immediately. Tool pages
// mount after seeding (ToolsLayout gates on `ready`), but those providers
// mount before it.
export function clearSyncedLocal() {
  localGeneration += 1;
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

/** This device's current values for the synced keys. */
function snapshotLocal(): Record<string, string | null> {
  return Object.fromEntries(SYNC_KEYS.map((key) => [key, store.raw(key)]));
}

/**
 * Write merged values locally, tagged as remote so they are not mistaken for an
 * edit. A key that changed since `expected` was read is left alone, because the
 * user's newer edit stands. Returns false when that happened.
 */
function applyLocally(values: Record<string, string>, expected: Record<string, string | null>): boolean {
  let complete = true;
  runRemoteApply(() => {
    for (const key of SYNC_KEYS) {
      const next = values[key] ?? null;
      const current = store.raw(key);
      if (current === next) continue;
      if (current !== (expected[key] ?? null)) {
        complete = false;
        continue;
      }
      if (next == null) store.remove(key);
      else store.set(key, next);
    }
  });
  return complete;
}

/**
 * The `updated_at` this device last saw, which a push must still find to write.
 * Only compared for equality, so a device with a wrong clock is harmless. It is
 * per-user so an account switch cannot inherit the previous account's token.
 */
let seenVersion: { userId: string; updatedAt: string } | null = null;

function rememberVersion(userId: string, updatedAt: string | null | undefined) {
  seenVersion = updatedAt ? { userId, updatedAt } : null;
}

/** Test seam: forget which row version we last saw. */
export function resetSyncVersion() {
  seenVersion = null;
}

type CloudRow = { data: unknown; updated_at?: string | null };

function validBlob(row: CloudRow): Record<string, string> | null {
  const blob = row.data ?? {};
  if (typeof blob !== 'object' || Array.isArray(blob)) return null;
  const values = blob as Record<string, unknown>;
  if (SYNC_KEYS.some((k) => values[k] != null && typeof values[k] !== 'string')) return null;
  return values as Record<string, string>;
}

async function readRow(userId: string) {
  const { data, error } = await supabase
    .from('tool_data')
    .select('data, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  return { row: (data as CloudRow | null) ?? null, error };
}

/** Merge cloud data into this device, keeping anything the cloud has not seen. */
export async function loadCloudIntoLocal(
  userId: string,
  shouldApply: () => boolean = () => true,
  { mergeLocal = false }: { mergeLocal?: boolean } = {},
): Promise<SyncStatus> {
  if (!isSupabaseConfigured) return 'offline';
  try {
    const { row, error } = await readRow(userId);
    if (error) return 'error';
    // The caller can switch account or unmount while the request is pending.
    // Check before writing anything, not after this function has mutated storage.
    if (!shouldApply()) return 'idle';
    const local = snapshotLocal();
    if (!row) {
      // Nothing in the cloud yet, so everything here still needs uploading.
      rememberVersion(userId, null);
      for (const key of SYNC_KEYS) if (local[key] != null) recordPendingCloudChange(userId, key);
      return 'saved';
    }
    const remote = validBlob(row);
    if (!remote) return 'error';
    const { merged, aheadKeys } = mergeCloudBlob(SYNC_KEYS, local, remote, {
      pending: new Set(Object.keys(pendingChanges(userId))),
      keepLocalOnly: mergeLocal,
    });
    applyLocally(merged, local);
    rememberVersion(userId, row.updated_at);
    for (const key of aheadKeys) recordPendingCloudChange(userId, key);
    return 'saved';
  } catch {
    return 'error';
  }
}

/**
 * Push this device's values to the user's cloud row.
 *
 * Reads through `store`, not raw localStorage. When a write could not reach
 * localStorage — quota exceeded on a large expense list, or Safari private
 * mode — the storage wrapper keeps the value in its in-memory shadow and the
 * UI carries on showing it. Reading `localStorage` directly here would upload
 * the older value (or omit the key entirely, deleting it from the cloud blob),
 * so the user's most recent edits were silently lost on the next device.
 *
 * Values are snapshotted before the first await, so a flush during sign-out
 * still captures this account's data ahead of the seeding effect clearing it.
 */
export async function pushLocalToCloud(userId: string): Promise<SyncStatus> {
  if (!isSupabaseConfigured) return 'offline';
  const generation = localGeneration;
  const pendingKeys = new Set(Object.keys(pendingChanges(userId)));
  let local = snapshotLocal();
  let blob: Record<string, string> = {};
  for (const [key, value] of Object.entries(local)) if (value != null) blob[key] = value;
  let staleLocal = false;

  /** Fold in a row another device wrote, and show its rows here too. */
  const reconcile = (row: CloudRow): boolean => {
    const remote = validBlob(row);
    if (!remote) return false;
    const { merged } = mergeCloudBlob(SYNC_KEYS, local, remote, { pending: pendingKeys });
    blob = merged;
    if (generation === localGeneration) {
      if (!applyLocally(merged, local)) staleLocal = true;
      local = snapshotLocal();
    } else {
      local = Object.fromEntries(SYNC_KEYS.map((key) => [key, merged[key] ?? null]));
    }
    rememberVersion(userId, row.updated_at);
    return true;
  };

  /** A key the user edited mid-merge lacks those rows, so its push must re-merge. */
  const saved = (updatedAt: string | null | undefined): SyncStatus => {
    rememberVersion(userId, staleLocal ? null : updatedAt);
    const pending = pendingChanges(userId);
    if (!Object.keys(pending).length) return 'saved';
    for (const [key, value] of Object.entries(pending)) {
      // Preserve a newer edit made while this save was in flight.
      if (value === (blob[key] ?? null)) delete pending[key];
    }
    if (Object.keys(pending).length) store.set(PENDING_KEY, JSON.stringify({ userId, keys: Object.keys(pending) }));
    else store.remove(PENDING_KEY);
    return 'saved';
  };

  // The last attempt drops the version check. By then the blob merges this device
  // with a row read moments ago, and saving the user's data matters more than a
  // race two rounds could not settle.
  const MAX_ATTEMPTS = 3;
  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const baseline = seenVersion?.userId === userId ? seenVersion.updatedAt : null;
      const lastChance = attempt === MAX_ATTEMPTS - 1;

      if (baseline && !lastChance) {
        const { data, error } = await supabase
          .from('tool_data')
          .update({ data: blob, updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('updated_at', baseline)
          .select('updated_at')
          .maybeSingle();
        if (error) return 'error';
        if (data) return saved(data.updated_at);
      }

      // No version yet, or another device moved the row: read it before writing.
      const { row, error: readError } = await readRow(userId);
      if (readError) return 'error';
      if (row) {
        if (!reconcile(row)) return 'error';
        if (!lastChance) continue;
      } else {
        rememberVersion(userId, null);
      }
      const { data, error } = await supabase
        .from('tool_data')
        .upsert({ user_id: userId, data: blob, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
        .select('updated_at')
        .maybeSingle();
      if (error) return 'error';
      return saved(data?.updated_at);
    }
    return 'error';
  } catch {
    return 'error';
  }
}
