/**
 * How this device's data and the account's cloud copy are reconciled.
 *
 * THE BUG THIS REPLACES
 * ---------------------
 * Sync used to be "cloud wins for every key it has": signing in overwrote
 * `fx_expenses` with the cloud copy outright. Anything logged on this device
 * that the cloud had not seen — transactions entered before signing in, on a
 * new browser, or while a push was failing — was gone the moment the user
 * logged in, with no error and nothing to restore from. The user saw a ledger
 * that was missing "a few transactions".
 *
 * THE RULE NOW
 * ------------
 * A record that exists on either side is kept, unless it was deliberately
 * deleted. Sync is a merge, and absence is not a deletion — only a tombstone is
 * (see `expenseTombstones.ts`). Two devices editing the same transaction is the
 * one genuine conflict, and it is settled by `updatedAt`: the later edit wins.
 *
 * Everything here is pure — parse in, string out, no storage and no network —
 * so each rule can be tested directly. And nothing here reads or writes an
 * amount: a merge decides *which records exist*, never what any of them says or
 * what any total comes to.
 *
 * KEYS THAT ARE NOT MERGED
 * ------------------------
 * The remaining tool keys are settings and single-document state (display
 * currency, budget figures, planner inputs) where the two copies are not
 * collections to union but alternative answers to the same question. A key this
 * device changed and has not saved yet keeps this device's answer; every other
 * key takes the cloud's.
 *
 * A WHOLE KEY GOING MISSING
 * -------------------------
 * Absence of a row is not a deletion, but absence of a whole key from an
 * existing cloud snapshot is: that is how "delete all my data" reaches other
 * devices. Tombstones are the exception, because installed apps that predate
 * them drop the key on every save.
 */
import { AUDIT_KEY, MAX_AUDIT_ENTRIES } from './expenseAudit';
import { evictLearned, LEARNED_KEY, type LearnedMap } from './import/learned';
import {
  TOMBSTONE_KEY,
  isDeleted,
  pruneTombstones,
  type TombstoneMap,
} from './expenseTombstones';

export const EXPENSES_KEY = 'fx_expenses';

/** Travel mode's trips (`trips.ts` takes the key from here, so the two cannot drift). */
export const TRIPS_KEY = 'fx_trips';

/**
 * Splits with people not on FinatriX (`splits.ts`): the people and the entries.
 * Records shaped like trips (an id, `updatedAt`, a `deletedAt` mark), so they
 * merge the same way, by `mergeTrips`.
 */
export const SPLIT_PEOPLE_KEY = 'fx_split_people';
export const SPLIT_ENTRIES_KEY = 'fx_split_entries';
const BY_ID_KEYS: ReadonlySet<string> = new Set([TRIPS_KEY, SPLIT_PEOPLE_KEY, SPLIT_ENTRIES_KEY]);

type Row = Record<string, unknown>;

function parseArray(raw: string | null | undefined): Row[] | null {
  if (raw == null) return null;
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? (value as Row[]) : null;
  } catch {
    return null;
  }
}

/** Do two lists hold the same members, whatever their order? */
function sameMembers(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  const canonical = (list: unknown[]) => list.map((item) => JSON.stringify(item)).sort();
  const left = canonical(a);
  const right = canonical(b);
  return left.every((item, i) => item === right[i]);
}

function parseObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (raw == null) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** The row's stable id, or '' for pre-V4 rows that never got one. */
function stableId(row: Row): string {
  const id = row.id;
  if (typeof id === 'string' && id !== '') return id;
  if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  return '';
}

/** What a row says, for rows that have no id to be known by. */
function contentSignature(row: Row): string {
  return ['legacy', row.date, row.amount, row.category, row.note ?? row.merchant ?? ''].join('|');
}

/**
 * What makes two records the same record, one side at a time.
 *
 * Every transaction written since V4 carries a stable `id` and is known by it.
 * Older rows have to be recognised by what they say, and this must never mint
 * an id for them: a fresh id on each merge would make the same spend reappear
 * as a new row on every sync.
 *
 * Two subtleties, both about not losing a real transaction:
 *
 *   - Identical rows are counted, not collapsed. Someone who bought the same
 *     coffee twice on the same day has two rows, and matching them off in
 *     order keeps two — a plain content key would quietly merge them into one.
 *   - A row with no id adopts the identity of the row on the other side saying
 *     exactly the same thing. `loadExpenses` mints ids for legacy rows as it
 *     reads them, so two devices independently mint *different* ids for what is
 *     one spend; without this, the first device to save would turn it into two.
 */
function identify(rows: Row[], counterpart?: Map<string, string[]>): string[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const signature = contentSignature(row);
    const occurrence = seen.get(signature) ?? 0;
    seen.set(signature, occurrence + 1);
    const id = stableId(row);
    if (id) return id;
    return counterpart?.get(signature)?.[occurrence] ?? `${signature}|#${occurrence}`;
  });
}

/** Signature → the identities of the rows carrying it, in order. */
function indexBySignature(rows: Row[], keys: string[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  rows.forEach((row, i) => {
    const signature = contentSignature(row);
    const bucket = index.get(signature);
    if (bucket) bucket.push(keys[i]);
    else index.set(signature, [keys[i]]);
  });
  return index;
}

/** The ISO timestamp a row was last touched, if it carries one. */
function rowUpdatedIso(row: Row): string | undefined {
  if (typeof row.updatedAt === 'string' && row.updatedAt) return row.updatedAt;
  if (typeof row.createdAt === 'string' && row.createdAt) return row.createdAt;
  return undefined;
}

function rowStamp(row: Row): number {
  const iso = rowUpdatedIso(row);
  const parsed = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Union two copies of the ledger.
 *
 * Order: this device's rows keep their positions and the cloud's unseen rows
 * are appended. Storage order carries no meaning — every view sorts by date or
 * amount before showing anything, and every total is a sum — so this is chosen
 * to keep the local file stable rather than to express anything.
 */
export function mergeExpenseLists(
  localRaw: string | null,
  remoteRaw: string | null,
  tombstones: TombstoneMap = {},
): string | null {
  const local = parseArray(localRaw);
  const remote = parseArray(remoteRaw);
  // A side that is missing or unreadable contributes nothing; it must not be
  // allowed to empty the other one. When neither is readable there is nothing
  // to merge, and the raw value is passed through untouched rather than
  // replaced with an empty ledger.
  if (!local && !remote) return localRaw ?? remoteRaw ?? null;

  const localRows = (local ?? []).filter((row) => row && typeof row === 'object');
  const remoteRows = (remote ?? []).filter((row) => row && typeof row === 'object');
  // Only one side has a ledger and no deletion touches it: hand it back exactly.
  if (!local || !remote) {
    const rows = local ? localRows : remoteRows;
    if (!rows.some((row) => isDeleted(tombstones, stableId(row), rowUpdatedIso(row)))) {
      return local ? localRaw : remoteRaw;
    }
  }
  const remoteKeys = identify(remoteRows);
  const localKeys = identify(localRows, indexBySignature(remoteRows, remoteKeys));

  const byKey = new Map<string, Row>();
  const order: string[] = [];
  const consider = (row: Row, key: string) => {
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      order.push(key);
      return;
    }
    // Same transaction on both sides: the later edit wins. On a tie the
    // incumbent (this device's row) stands, so a merge that changes nothing
    // rewrites nothing — unless the challenger is the same legacy spend after
    // the other device gave it a stable id, which is the copy worth keeping:
    // it is the identity the history and the deletion records already use.
    const newer = rowStamp(row) > rowStamp(existing);
    const identified = rowStamp(row) === rowStamp(existing) && !stableId(existing) && !!stableId(row);
    if (newer || identified) byKey.set(key, row);
  };
  localRows.forEach((row, i) => consider(row, localKeys[i]));
  remoteRows.forEach((row, i) => consider(row, remoteKeys[i]));

  // The filter runs over everything that survives, including the case where
  // only one side had a readable ledger: a deletion recorded on either device
  // still has to be honoured, or a row the user removed comes back.
  const merged = order
    .map((key) => byKey.get(key)!)
    .filter((row) => !isDeleted(tombstones, stableId(row), rowUpdatedIso(row)));

  // The same rows in another order are not a change, and must not read as one:
  // two devices would otherwise take turns uploading their own ordering.
  if (remote && sameMembers(merged, remoteRows)) return remoteRaw;
  return JSON.stringify(merged);
}

/**
 * Union the change history.
 *
 * Append-only and keyed by the entry's own id, so two devices that each logged
 * changes end up with one history containing both — the alternative is a
 * history that goes quiet for whichever device pushed second. Newest first, and
 * capped exactly as `appendEntries` caps it.
 */
export function mergeAuditLogs(localRaw: string | null, remoteRaw: string | null): string | null {
  const local = parseArray(localRaw);
  const remote = parseArray(remoteRaw);
  if (!local) return remoteRaw ?? null;
  if (!remote) return localRaw ?? null;

  const byId = new Map<string, Row>();
  for (const entry of [...local, ...remote]) {
    if (!entry || typeof entry !== 'object') continue;
    const id = typeof entry.id === 'string' ? entry.id : '';
    if (id && !byId.has(id)) byId.set(id, entry);
  }
  const merged = [...byId.values()]
    .sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0))
    .slice(0, MAX_AUDIT_ENTRIES);
  if (sameMembers(merged, remote)) return remoteRaw ?? null;
  return JSON.stringify(merged);
}

/** Union two devices' deletion records: every deletion either side knows about. */
export function mergeTombstoneMaps(
  localRaw: string | null,
  remoteRaw: string | null,
  now = Date.now(),
): TombstoneMap {
  const merged: TombstoneMap = {};
  for (const source of [parseObject(localRaw), parseObject(remoteRaw)]) {
    if (!source) continue;
    for (const [id, value] of Object.entries(source)) {
      const ts = Number(value);
      if (!id || !Number.isFinite(ts) || ts <= 0) continue;
      // Two devices can each record a deletion of the same row (deleted on the
      // phone, deleted again on the laptop after an edit in between). The
      // latest stamp is the one to keep: it is the most recent statement of
      // intent, and keeping an earlier one would let the intervening edit
      // outrank a deletion that came after it.
      merged[id] = merged[id] ? Math.max(merged[id], ts) : ts;
    }
  }
  return pruneTombstones(merged, now);
}

/**
 * Bring deletion records in line with the change history.
 *
 * Tombstones are copied between devices, so lifting one on a restore is not
 * enough: the other device's copy would come back at the next merge and delete
 * the restored row again. The history is a union that both sides agree on, and
 * it says which came last. It is also the only record of a deletion made before
 * tombstones existed or by an installed app that does not write them.
 */
export function applyAuditToTombstones(
  tombstones: TombstoneMap,
  auditRaw: string | null,
  now = Date.now(),
): TombstoneMap {
  const out = { ...tombstones };
  const seen = new Set<string>();
  const newestFirst = [...(parseArray(auditRaw) ?? [])].sort((a, b) => (Number(b?.ts) || 0) - (Number(a?.ts) || 0));
  for (const entry of newestFirst) {
    const id = typeof entry?.txId === 'string' ? entry.txId : '';
    const ts = Number(entry?.ts);
    if (!id || seen.has(id) || !Number.isFinite(ts) || ts <= 0) continue;
    if (entry.action === 'delete') {
      seen.add(id);
      out[id] = Math.max(out[id] ?? 0, ts);
    } else if (entry.action === 'restore') {
      seen.add(id);
      if ((out[id] ?? 0) <= ts) delete out[id];
    }
  }
  return pruneTombstones(out, now);
}

/**
 * Union the merchant → category preferences learned from statement imports.
 * Per merchant the most recently confirmed answer wins, which is the same rule
 * `rememberConfirmed` applies on one device.
 */
export function mergeLearnedMerchants(
  localRaw: string | null,
  remoteRaw: string | null,
): string | null {
  const local = parseObject(localRaw);
  const remote = parseObject(remoteRaw);
  if (!local) return remoteRaw ?? null;
  if (!remote) return localRaw ?? null;

  const merged: LearnedMap = {};
  for (const source of [local, remote]) {
    for (const [key, value] of Object.entries(source)) {
      const entry = value as Partial<LearnedMap[string]> | null;
      const category = typeof entry?.category === 'string' ? entry.category : '';
      if (!key || !category) continue;
      const updatedAt = typeof entry?.updatedAt === 'string' ? entry.updatedAt : '';
      const count = Math.max(1, Number(entry?.count) || 1);
      const existing = merged[key];
      if (!existing) {
        merged[key] = { category, count, updatedAt };
      } else if (updatedAt.localeCompare(existing.updatedAt) > 0) {
        merged[key] = { category, count: Math.max(count, existing.count), updatedAt };
      } else {
        existing.count = Math.max(existing.count, count);
      }
    }
  }
  const result = evictLearned(merged);
  if (sameMembers(Object.entries(result), Object.entries(remote))) return remoteRaw ?? null;
  return JSON.stringify(result);
}

/**
 * Union two devices' trips (travel mode, `trips.ts`).
 *
 * A trip is known by its id. When both devices changed the same trip, the later
 * `updatedAt` wins, as for transactions. Deleting a trip is a change like any
 * other: the record stays, marked `deletedAt`, so the deletion reaches the
 * other device rather than the trip being merged back from it. Trips are few
 * (a handful a year), so the marked records cost nothing to keep.
 */
export function mergeTrips(localRaw: string | null, remoteRaw: string | null): string | null {
  const local = parseArray(localRaw);
  const remote = parseArray(remoteRaw);
  if (!local) return remoteRaw ?? null;
  if (!remote) return localRaw ?? null;

  const byId = new Map<string, Row>();
  const order: string[] = [];
  for (const row of [...local, ...remote]) {
    if (!row || typeof row !== 'object') continue;
    const id = stableId(row);
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, row);
      order.push(id);
    } else if (rowStamp(row) > rowStamp(existing)) {
      // On a tie this device's copy stands, so a merge that changes nothing rewrites nothing.
      byId.set(id, row);
    }
  }
  const merged = order.map((id) => byId.get(id)!);
  if (sameMembers(merged, remote)) return remoteRaw;
  return JSON.stringify(merged);
}

export interface BlobMergeOptions {
  /**
   * Keys this device changed and the cloud has not accepted yet. Its answer
   * stands for settings-shaped keys, and a pending removal stays removed.
   */
  pending?: ReadonlySet<string>;
  /**
   * The first merge of a guest's data into an account: a key the cloud does not
   * have is data to upload, not something deleted elsewhere.
   */
  keepLocalOnly?: boolean;
  now?: number;
}

export interface BlobMergeResult {
  /** The value each key should hold, on this device and in the cloud. */
  merged: Record<string, string>;
  /** Keys whose merged value the cloud does not have yet, so they need a push. */
  aheadKeys: string[];
}

/**
 * Reconcile every synced key at once.
 *
 * `local` holds this device's raw values (null where the key is absent) and
 * `remote` the cloud row's blob. The history is merged first and deletion
 * records second, because both are inputs to deciding which transactions survive.
 */
export function mergeCloudBlob(
  keys: readonly string[],
  local: Record<string, string | null>,
  remote: Record<string, string>,
  options: BlobMergeOptions = {},
): BlobMergeResult {
  const { pending = new Set<string>(), keepLocalOnly = false, now = Date.now() } = options;

  /** A whole key removed on purpose, here or on another device. */
  const removedOutright = (key: string): boolean => {
    if (pending.has(key)) return (local[key] ?? null) == null;
    return (remote[key] ?? null) == null && !keepLocalOnly;
  };

  const auditRaw = removedOutright(AUDIT_KEY)
    ? null
    : mergeAuditLogs(local[AUDIT_KEY] ?? null, remote[AUDIT_KEY] ?? null);
  // Never removed by absence: apps that predate tombstones drop this key on save.
  const tombstones = pending.has(TOMBSTONE_KEY) && (local[TOMBSTONE_KEY] ?? null) == null
    ? {}
    : applyAuditToTombstones(
      mergeTombstoneMaps(local[TOMBSTONE_KEY] ?? null, remote[TOMBSTONE_KEY] ?? null, now),
      auditRaw,
      now,
    );

  const merged: Record<string, string> = {};
  const aheadKeys: string[] = [];

  for (const key of keys) {
    const localRaw = local[key] ?? null;
    const remoteRaw = remote[key] ?? null;
    let value: string | null;

    if (key === TOMBSTONE_KEY) {
      const unchanged = remoteRaw != null
        && sameMembers(Object.entries(tombstones), Object.entries(parseObject(remoteRaw) ?? {}));
      value = unchanged ? remoteRaw : Object.keys(tombstones).length ? JSON.stringify(tombstones) : null;
    } else if (removedOutright(key)) {
      value = null;
    } else if (key === EXPENSES_KEY) {
      value = mergeExpenseLists(localRaw, remoteRaw, tombstones);
    } else if (key === AUDIT_KEY) {
      value = auditRaw;
    } else if (key === LEARNED_KEY) {
      value = mergeLearnedMerchants(localRaw, remoteRaw);
    } else if (BY_ID_KEYS.has(key)) {
      value = mergeTrips(localRaw, remoteRaw);
    } else {
      value = pending.has(key) ? localRaw : (remoteRaw ?? localRaw);
    }

    if (value != null) merged[key] = value;
    if (value !== remoteRaw) aheadKeys.push(key);
  }

  return { merged, aheadKeys };
}
