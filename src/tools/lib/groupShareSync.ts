import { loadGroupsCache } from './groups';
import { reconcileGroupShares, SHARE_CURSOR_KEY } from './groupShare';
import { store } from './storage';

/**
 * Keep your share in the Expense Tracker current when the Groups screen is not
 * open: ask each split group for what changed since this device last looked,
 * and run it through `reconcileGroupShares` (idempotent, so asking twice does
 * no harm). The cursor is per device and account (cloudSync ACCOUNT_LOCAL_KEYS).
 */

interface Cursors { uid: string; at: Record<string, string> }

function loadCursors(uid: string): Cursors {
  try {
    const parsed = JSON.parse(store.get(SHARE_CURSOR_KEY, 'null')) as Cursors | null;
    if (parsed && parsed.uid === uid && parsed.at && typeof parsed.at === 'object') return parsed;
  } catch { /* start again */ }
  return { uid, at: {} };
}

const PAGE = 500;
let inflight: Promise<boolean> | null = null;

/** Returns whether the ledger changed. Never throws: offline or signed out is simply "no change". */
export function catchUpGroupShares(): Promise<boolean> {
  if (inflight) return inflight;
  inflight = (async () => {
    const cache = loadGroupsCache();
    const groups = (cache?.groups ?? []).filter((g) => g.splitCosts);
    if (!cache || groups.length === 0) return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    const api = await import('./groupsApi');
    const cursors = loadCursors(cache.uid);
    let changed = false;
    for (const g of groups) {
      for (let page = 0; page < 20; page += 1) {
        const rows = await api.fetchSplitExpensesSince(g.id, cursors.at[g.id] ?? null);
        if (rows.length === 0) break;
        changed = reconcileGroupShares({ id: g.id, name: g.name, currency: g.currency, memberId: g.memberId }, rows) || changed;
        const last = rows[rows.length - 1].updated_at;
        if (last === cursors.at[g.id]) break;
        cursors.at[g.id] = last;
        store.set(SHARE_CURSOR_KEY, JSON.stringify(cursors));
        if (rows.length < PAGE) break;
      }
    }
    return changed;
  })().catch(() => false).finally(() => { inflight = null; });
  return inflight;
}
