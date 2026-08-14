/**
 * Remembering how this user categorises their own merchants.
 *
 * The second import of a statement from the same bank should be almost entirely
 * automatic, and it should be automatic in the way *this* user thinks rather
 * than the way a table does. Someone who books Uber under Travel instead of
 * Transport, or Steam under Entertainment instead of Shopping, said so once and
 * should not have to say it again.
 *
 * WHAT IS LEARNED, AND WHAT IS NOT
 * -------------------------------
 * Only choices the user actually made. A category the model guessed and the user
 * scrolled past is not a preference — treating it as one is how a single wrong
 * guess becomes a permanent, invisible rule that silently miscategorises the
 * same merchant every month afterwards. So:
 *
 *   - the user set it by hand      → learned
 *   - a previous learned entry was kept → reinforced (count goes up)
 *   - a rule or the model chose it → not learned
 *
 * The map is the user's data: it is listed, editable and clearable from the
 * import sheet, and it syncs with the rest of their tools data so the preference
 * follows them between devices.
 */

import { getJSON, setJSON } from '../storage';
import { merchantKey } from './merchant';
import type { CategoryOrigin } from './types';

/** Storage key. Added to SYNC_KEYS so preferences follow the user. */
export const LEARNED_KEY = 'fx_import_merchants';

/**
 * How many merchants are remembered.
 *
 * Generous enough to cover years of ordinary spending, bounded so the payload
 * riding along with cloud sync stays small. Eviction is least-recently-confirmed
 * first, which keeps the merchants someone actually still shops at.
 */
export const MAX_LEARNED = 400;

export interface LearnedEntry {
  /** A Budget Builder category key, validated against the live set on use. */
  category: string;
  /** How many imports have confirmed it. Drives eviction, not confidence. */
  count: number;
  /** ISO timestamp of the last confirmation. */
  updatedAt: string;
}

export type LearnedMap = Record<string, LearnedEntry>;

export function loadLearned(): LearnedMap {
  const raw = getJSON<Record<string, Partial<LearnedEntry>>>(LEARNED_KEY, {});
  const out: LearnedMap = {};
  for (const [key, value] of Object.entries(raw)) {
    const category = typeof value?.category === 'string' ? value.category : '';
    if (!key || !category) continue;
    out[key] = {
      category,
      count: Math.max(1, Number(value?.count) || 1),
      updatedAt: typeof value?.updatedAt === 'string' ? value.updatedAt : '',
    };
  }
  return out;
}

export function saveLearned(map: LearnedMap): void {
  setJSON(LEARNED_KEY, evict(map));
}

/** Look up a merchant's remembered category, if the user still has that category. */
export function recallCategory(
  map: LearnedMap,
  merchant: string,
  validKeys: ReadonlySet<string>,
): string | null {
  const entry = map[merchantKey(merchant)];
  if (!entry) return null;
  return validKeys.has(entry.category) ? entry.category : null;
}

/**
 * Fold one confirmed import into the map. Pure — returns a new map.
 *
 * `origin` is the gate described at the top of this file: only a hand-set
 * category creates an entry, and only a kept `learned` entry reinforces one.
 */
export function rememberConfirmed(
  map: LearnedMap,
  confirmations: ReadonlyArray<{ merchant: string; category: string; origin: CategoryOrigin }>,
  now: Date = new Date(),
): LearnedMap {
  const next: LearnedMap = { ...map };
  const stamp = now.toISOString();

  for (const { merchant, category, origin } of confirmations) {
    if (!category) continue;
    const key = merchantKey(merchant);
    if (key.length < 3) continue; // too generic to be an identity

    if (origin === 'user') {
      const previous = next[key];
      next[key] = {
        category,
        count: previous && previous.category === category ? previous.count + 1 : 1,
        updatedAt: stamp,
      };
    } else if (origin === 'learned' && next[key]?.category === category) {
      next[key] = { ...next[key], count: next[key].count + 1, updatedAt: stamp };
    }
  }

  return evict(next);
}

/** Drop a single remembered merchant — the undo for a preference set by mistake. */
export function forgetMerchant(map: LearnedMap, key: string): LearnedMap {
  const next = { ...map };
  delete next[key];
  return next;
}

/** Trim to MAX_LEARNED, least-recently-confirmed first. */
function evict(map: LearnedMap): LearnedMap {
  const keys = Object.keys(map);
  if (keys.length <= MAX_LEARNED) return map;
  const ordered = keys.sort((a, b) => (map[b].updatedAt || '').localeCompare(map[a].updatedAt || ''));
  const kept: LearnedMap = {};
  for (const key of ordered.slice(0, MAX_LEARNED)) kept[key] = map[key];
  return kept;
}

/** Remembered merchants for display, most recently confirmed first. */
export function listLearned(map: LearnedMap): Array<{ key: string; entry: LearnedEntry }> {
  return Object.entries(map)
    .map(([key, entry]) => ({ key, entry }))
    .sort((a, b) => (b.entry.updatedAt || '').localeCompare(a.entry.updatedAt || ''));
}
