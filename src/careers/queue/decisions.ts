/**
 * Match Queue — decision persistence.
 *
 * Declines and applications survive a reload; skips do not. That asymmetry is
 * the product decision, not a limitation: "not now" should mean *not now*, and
 * a job you deferred on Monday deserves a second look on Friday. Only the two
 * terminal verdicts are worth remembering.
 *
 * ── Why localStorage and not a table ──────────────────────────────────────────
 * Declines are a per-device convenience, not a record. Giving them a table
 * means a migration, an RLS policy and a sync path for a signal we have not yet
 * tuned — the threshold at which people decline, and whether they want it to be
 * permanent at all, are exactly the questions the first weeks of this queue
 * exist to answer. Phase 3 moves this server-side once there is something worth
 * moving. Until then the cost of being wrong is one device forgetting a
 * decline, which is recoverable; the cost of a premature schema is not.
 *
 * Keyed per user so a shared device never leaks one person's declines into
 * another's queue.
 */

import type { QueueVerdict } from './deck';
import { isTerminal } from './deck';

const PREFIX = 'fx.careers.queue.decisions';

/**
 * Cap on remembered decisions per user. Job content hashes are 64 chars, so
 * 500 entries is roughly 40 KB — comfortably inside any localStorage budget
 * while covering far more reviewing than a single job search ever involves.
 * Oldest decisions fall off first.
 */
const MAX_ENTRIES = 500;

interface StoredDecision {
  k: string;          // job content sha256
  v: QueueVerdict;
  t: number;          // epoch ms, for eviction order
}

function storageKey(userId: string): string {
  return `${PREFIX}.${userId}`;
}

/** localStorage throws in private mode and when the quota is full. Never let that break the queue. */
function safeRead(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota or private mode — decisions stay in memory for this session */
  }
}

function parse(raw: string | null): StoredDecision[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (d): d is StoredDecision =>
        !!d &&
        typeof d === 'object' &&
        typeof (d as StoredDecision).k === 'string' &&
        typeof (d as StoredDecision).t === 'number' &&
        isTerminal((d as StoredDecision).v),
    );
  } catch {
    return [];
  }
}

/** Every remembered terminal verdict for this user, newest last. */
export function loadDecisions(userId: string): Map<string, QueueVerdict> {
  const out = new Map<string, QueueVerdict>();
  for (const d of parse(safeRead(storageKey(userId)))) out.set(d.k, d.v);
  return out;
}

/**
 * Remember a terminal verdict. Skips are accepted and ignored rather than
 * rejected, so callers can record every decision through one path without
 * having to know which ones persist.
 */
export function recordDecision(userId: string, key: string, verdict: QueueVerdict): void {
  if (!key || !isTerminal(verdict)) return;
  const k = storageKey(userId);
  const existing = parse(safeRead(k)).filter((d) => d.k !== key);
  existing.push({ k: key, v: verdict, t: Date.now() });
  // Evict oldest first — a decline from six months ago matters less than one
  // made this morning, and the array is already in insertion order.
  const trimmed = existing.slice(-MAX_ENTRIES);
  safeWrite(k, JSON.stringify(trimmed));
}

/** Forget every remembered decision for this user — powers "reset my queue". */
export function clearDecisions(userId: string): void {
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    /* nothing to do — see safeWrite */
  }
}
