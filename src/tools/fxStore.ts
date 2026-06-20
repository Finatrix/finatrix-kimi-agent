import { supabase, isSupabaseConfigured } from '../lib/supabase';

/**
 * Cloud-backed key/value store for the FinatriX tools.
 *
 * The original tools engine expects a *synchronous* store (get/set returning
 * strings, like localStorage). We keep that contract by serving reads/writes
 * from an in-memory cache, while transparently:
 *   - mirroring to localStorage (so guests keep data on their device), and
 *   - syncing to the logged-in user's row in Supabase (so data follows them
 *     across devices / browsers / locations).
 *
 * One JSON blob per user is stored in the `tool_data` table.
 */

const LOCAL_KEY = 'finatrix_tools_v1';
const SYNCED_KEYS = ['fx_expenses', 'fx_budget', 'fx_inputs', 'fx_budgetbuilder'];

let cache: Record<string, string> = {};
let currentUserId: string | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let onStatus: ((s: SyncStatus) => void) | null = null;

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

function emit(s: SyncStatus) {
  if (onStatus) onStatus(s);
}

export function onSyncStatus(cb: (s: SyncStatus) => void) {
  onStatus = cb;
}

function readLocal(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocal() {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(cache));
  } catch {
    /* storage blocked — memory only */
  }
}

function pickSynced(obj: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of SYNCED_KEYS) if (k in obj) out[k] = obj[k];
  return out;
}

async function pushCloud() {
  if (!currentUserId || !isSupabaseConfigured) return;
  emit('saving');
  const { error } = await supabase.from('tool_data').upsert(
    {
      user_id: currentUserId,
      data: pickSynced(cache),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  emit(error ? 'error' : 'saved');
}

function scheduleSave() {
  writeLocal();
  if (!currentUserId || !isSupabaseConfigured) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void pushCloud();
  }, 700);
}

/** The synchronous store handed to the tools engine via window.__fxStore */
export const fxStore = {
  get(k: string, d?: string): string | undefined {
    return k in cache ? cache[k] : d;
  },
  set(k: string, v: string) {
    cache[k] = String(v);
    scheduleSave();
  },
  persistent: true,
};

/**
 * Hydrate the cache for the given user (or null for a guest).
 * Logged-in: load the user's cloud row; if empty, seed it from local data.
 * Guest: load whatever is on this device.
 */
export async function hydrateStore(userId: string | null) {
  currentUserId = userId;
  const local = readLocal();

  if (!userId || !isSupabaseConfigured) {
    cache = { ...local };
    emit(isSupabaseConfigured ? 'idle' : 'offline');
    return;
  }

  try {
    const { data, error } = await supabase
      .from('tool_data')
      .select('data')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    if (data && data.data && Object.keys(data.data).length > 0) {
      // Cloud is the source of truth for a returning user.
      cache = { ...local, ...(data.data as Record<string, string>) };
      writeLocal();
      emit('saved');
    } else {
      // First time on this account — seed cloud from whatever is on device.
      cache = { ...local };
      await pushCloud();
    }
  } catch {
    cache = { ...local };
    emit('error');
  }
}

/** Flush any pending writes immediately (e.g. before sign-out). */
export async function flushStore() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await pushCloud();
}

// Expose synchronously for the injected tools engine.
declare global {
  interface Window {
    __fxStore: typeof fxStore;
    __fxInit?: () => void;
    fxMountTools?: () => void;
    fxSnapshotInputs?: () => void;
    fxRestoreInputs?: () => void;
    fxSaveBudget?: () => void;
    fxRestoreBudget?: () => void;
  }
}
if (typeof window !== 'undefined') {
  window.__fxStore = fxStore;
}
