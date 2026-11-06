/**
 * Deletion records for the expense ledger.
 *
 * WHY THIS EXISTS
 * ---------------
 * Cloud sync merges the ledger rather than replacing it (see `syncMerge.ts`):
 * a transaction that exists on one side and not the other is kept, because the
 * alternative — the older "cloud wins" rule — silently threw away every
 * transaction logged on a device the cloud had not seen yet.
 *
 * A union merge on its own cannot tell those two cases apart:
 *
 *   - "this device has a row the cloud has never seen"  → keep it
 *   - "this device still has a row deleted on the phone" → do NOT resurrect it
 *
 * Absence is not evidence either way, so a deletion has to leave something
 * behind. That is what this is: `txId → when it was deleted`, synced with the
 * rest of the user's data so every device learns about the deletion.
 *
 * WHY NOT THE AUDIT LOG
 * ---------------------
 * `expenseAudit.ts` already records deletions, but it is a *history for the
 * user*: capped at 500 mixed entries, and clearable from the History tab.
 * Deriving deletions from it would mean a heavy month evicts the evidence, and
 * "I cleared my history" would quietly mean "deleted transactions come back on
 * my other laptop". Tombstones are machine state with their own lifetime, so
 * the two are kept apart. The merge still reads what the log knows
 * (`syncMerge.ts`), which covers deletions made before tombstones existed and
 * by installed apps that do not write them yet.
 *
 * Nothing here is ever read by a calculation — a tombstone only decides whether
 * a row survives a merge, never what any total is.
 */
import { getJSON, setJSON, store } from './storage';

/** Storage key. Synced with the rest of the user's data (see cloudSync.ts). */
export const TOMBSTONE_KEY = 'fx_expense_tombstones';

/**
 * How long a deletion is remembered: a year.
 *
 * The window only has to outlive the gap between a deletion and the next time
 * every other device syncs. A year covers a laptop that spends a summer in a
 * drawer; beyond that, a device carrying a copy of a row deleted twelve months
 * ago is indistinguishable from one carrying a row that was never synced, and
 * this file's whole purpose is to prefer keeping the user's data when it cannot
 * tell.
 */
export const TOMBSTONE_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Ceiling on remembered deletions, so a user who imports and discards a large
 * statement cannot push the synced payload toward the 1 MB row cap. Eviction is
 * oldest-first: the newest deletions are the ones other devices have least
 * likely heard about yet.
 */
export const MAX_TOMBSTONES = 1000;

/** `txId → epoch ms when it was deleted`. */
export type TombstoneMap = Record<string, number>;

function sanitize(raw: unknown): TombstoneMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: TombstoneMap = {};
  for (const [id, ts] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(ts);
    if (id && Number.isFinite(n) && n > 0) out[id] = n;
  }
  return out;
}

/**
 * Apply the age and count limits. Pure, and exported because the merge runs it
 * over the union of two devices' maps without touching storage.
 */
export function pruneTombstones(map: TombstoneMap, now = Date.now()): TombstoneMap {
  const live = Object.entries(map).filter(([, ts]) => now - ts < TOMBSTONE_TTL_MS);
  if (live.length > MAX_TOMBSTONES) {
    live.sort((a, b) => b[1] - a[1]); // newest first, then keep the head
    live.length = MAX_TOMBSTONES;
  }
  return Object.fromEntries(live);
}

export function loadTombstones(): TombstoneMap {
  return sanitize(getJSON<unknown>(TOMBSTONE_KEY, {}));
}

function save(map: TombstoneMap): void {
  // An empty map is removed rather than stored as `{}`, so a user who has never
  // deleted anything carries no key at all — in storage or in the cloud row.
  if (Object.keys(map).length === 0) store.remove(TOMBSTONE_KEY);
  else setJSON(TOMBSTONE_KEY, map);
}

/** Record that these transactions were deleted. */
export function recordDeletions(ids: string[], at = Date.now()): TombstoneMap {
  if (ids.length === 0) return loadTombstones();
  const next = loadTombstones();
  for (const id of ids) if (id) next[id] = at;
  const pruned = pruneTombstones(next, at);
  save(pruned);
  return pruned;
}

/**
 * Forget deletions — the transaction is back (undo, or a restore from History).
 *
 * Removing the tombstone is what makes a restore stick on this device. Another
 * device can still hold a copy of it, so the merge also lifts any tombstone older
 * than the restore recorded in the audit log.
 */
export function clearDeletions(ids: string[]): TombstoneMap {
  if (ids.length === 0) return loadTombstones();
  const next = loadTombstones();
  let touched = false;
  for (const id of ids) {
    if (id in next) {
      delete next[id];
      touched = true;
    }
  }
  if (touched) save(next);
  return next;
}

/**
 * Does a tombstone override this transaction?
 *
 * The row survives its own deletion only if it was edited *after* it — someone
 * deleted it on the phone, then edited the same row on the laptop before the
 * two met. Last writer wins, and an edit is the later statement of intent. A
 * row with no timestamps at all (pre-audit legacy data) cannot make that claim,
 * so the deletion stands.
 */
export function isDeleted(
  tombstones: TombstoneMap,
  id: string,
  updatedAtIso?: string,
): boolean {
  const deletedAt = tombstones[id];
  if (!deletedAt) return false;
  const updated = updatedAtIso ? Date.parse(updatedAtIso) : NaN;
  return !Number.isFinite(updated) || updated <= deletedAt;
}
