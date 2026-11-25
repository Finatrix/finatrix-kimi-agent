/**
 * Settings & data-management layer. Local-first and privacy-first: it operates
 * only on the user's own FinatriX keys, reuses SYNC_KEYS as the single source of
 * truth for "what is my data", and reuses the exporters' download helper. A JSON
 * backup is shaped so a future cloud-sync/import can consume it unchanged.
 */
import { ACCOUNT_LOCAL_KEYS, SYNC_KEYS } from '../cloudSync';
import { ymdLocal } from '../../lib/date';
import { clearPhotos } from '../../lib/billPhotos';
import { downloadBlob } from './exporters';
import { clearNotificationState } from './notifications';
import { store } from './storage';

/**
 * Non-synced local keys that still belong to the user and should be reset.
 *
 * The product tour's three (`fx_tour_progress`, `fx_tour_optout`,
 * `fx_tour_offer`, see src/tour/progress.ts) are here rather than in
 * SYNC_KEYS on purpose: what one device has been shown says nothing about
 * another, and a synced key would need its own merge rule in syncMerge.ts.
 */
export const LOCAL_ONLY_KEYS = ['fx_last_backup_export', 'fx_activity', 'fx_last_tool', 'fx_notif_read', 'fx_notif_dismissed', 'fx_notif_seen_at', 'fx_dash_layout', 'fx_exp_catsort', 'fx_onboarding_done', 'fx_walkthrough_seen', 'fx_tour_progress', 'fx_tour_optout', 'fx_tour_offer', 'fx_trip_card_hidden'];

/** Human labels for the tool data keys (for the storage summary). */
const KEY_LABEL: Record<string, string> = {
  fx_bb_data: 'Budget', fx_bb_cats: 'Budget categories',
  fx_bb_catprefs: 'Category arrangement',
  fx_bb_cats_by_month: 'Per-month categories',
  fx_bb_income: 'Income sources',
  fx_expenses: 'Expenses',
  fx_exp_bank: 'Bank balances',
  fx_fy_start: 'Financial year',
  fx_expense_audit: 'Expense change history',
  fx_goals: 'Goals', fx_investmatch: 'InvestMatch', fx_parksmart: 'ParkSmart',
  fx_planning: 'Monthly reviews, recurring-payment choices & emergency funds',
  fx_peercompare: 'PeerCompare', fx_lifemap: 'LifeMap', fx_networth: 'Net Worth',
  fx_currency: 'Currency',
  fx_trips: 'Trips',
  fx_split_people: 'Splits: people',
  fx_split_entries: 'Splits: bills and money lent',
};

export interface DataArea { key: string; label: string; present: boolean; bytes: number }

function readRaw(key: string): string | null {
  return store.raw(key);
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
export function exportBackup(now = new Date()): boolean | Promise<boolean> {
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
  return downloadBlob(`finatrix-backup-${stamp}.json`, new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
}

/** Permanently clear all of the user's local data. Returns keys cleared. */
export function resetAllData(): number {
  // Clear notification read/dismiss state first, then hard-remove every key so
  // nothing is written back afterwards (leaves storage genuinely empty).
  clearNotificationState();
  void clearPhotos(); // the bill locker's photos live outside the key store
  let n = 0;
  for (const k of [...SYNC_KEYS, ...ACCOUNT_LOCAL_KEYS, ...LOCAL_ONLY_KEYS]) {
    try {
      if (store.raw(k) != null) { store.remove(k); n += 1; }
    } catch { /* ignore */ }
  }
  return n;
}
