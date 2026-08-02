/**
 * Settings & data-management layer. Local-first and privacy-first: it operates
 * only on the user's own FinatriX keys, reuses SYNC_KEYS as the single source of
 * truth for "what is my data", and reuses the exporters' download helper. A JSON
 * backup is shaped so a future cloud-sync/import can consume it unchanged.
 */
import { SYNC_KEYS } from '../cloudSync';
import { ymdLocal } from '../../lib/date';
import { downloadBlob } from './exporters';
import { clearNotificationState } from './notifications';

/** Non-synced local keys that still belong to the user and should be reset. */
const LOCAL_ONLY_KEYS = ['fx_activity', 'fx_last_tool', 'fx_notif_read', 'fx_notif_dismissed', 'fx_notif_seen_at', 'fx_dash_layout'];

/** Human labels for the tool data keys (for the storage summary). */
const KEY_LABEL: Record<string, string> = {
  fx_bb_data: 'Budget', fx_bb_cats: 'Budget categories',
  fx_bb_catprefs: 'Category arrangement', fx_bb_income: 'Income sources',
  fx_expenses: 'Expenses',
  fx_goals: 'Goals', fx_investmatch: 'InvestMatch', fx_parksmart: 'ParkSmart',
  fx_peercompare: 'PeerCompare', fx_lifemap: 'LifeMap', fx_currency: 'Currency',
};

export interface DataArea { key: string; label: string; present: boolean; bytes: number }

function readRaw(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** Summarise which tool data exists locally (drives the Settings data view). */
export function getDataSummary(): DataArea[] {
  return SYNC_KEYS
    .filter((k) => k in KEY_LABEL)
    .map((k) => {
      const raw = readRaw(k);
      return { key: k, label: KEY_LABEL[k], present: !!raw && raw !== '{}' && raw !== '[]', bytes: raw ? raw.length : 0 };
    });
}

/** True when the user has any saved data at all. */
export function hasAnyData(): boolean {
  return getDataSummary().some((d) => d.present);
}

/** Download a portable JSON backup of every FinatriX key the user owns. */
export function exportBackup(now = new Date()): boolean {
  const payload: Record<string, unknown> = {};
  for (const k of SYNC_KEYS) {
    const raw = readRaw(k);
    if (raw == null) continue;
    try { payload[k] = JSON.parse(raw); } catch { payload[k] = raw; }
  }
  if (Object.keys(payload).length === 0) return false;
  const doc = {
    app: 'FinatriX',
    kind: 'backup',
    version: 1,
    exportedAt: now.toISOString(),
    data: payload,
  };
  // Local, not UTC: the filename should name the day the user pressed Export.
  const stamp = ymdLocal(now);
  downloadBlob(`finatrix-backup-${stamp}.json`, new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
  return true;
}

/** Permanently clear all of the user's local data. Returns keys cleared. */
export function resetAllData(): number {
  // Clear notification read/dismiss state first, then hard-remove every key so
  // nothing is written back afterwards (leaves storage genuinely empty).
  clearNotificationState();
  let n = 0;
  for (const k of [...SYNC_KEYS, ...LOCAL_ONLY_KEYS]) {
    try {
      if (localStorage.getItem(k) != null) { localStorage.removeItem(k); n += 1; }
    } catch { /* ignore */ }
  }
  return n;
}
