/**
 * Local-first finance notifications. Every alert is DERIVED from the same
 * sources the Dashboard and Calendar already use (readDashboard, getUpcomingEvents)
 * — never fabricated and never a parallel calculation. Read/dismissed state is the
 * only thing persisted (ids only), so future cloud sync can adopt it unchanged.
 * Pure derivation + tiny local state; safe to call on every render.
 */
import type { IconName } from '../ui/Icon';
import { store, getJSON, setJSON } from './storage';
import { currentMonth } from './month';
import { readDashboard } from './dashboard';
import { getUpcomingEvents } from './calendar';

export type NotifTone = 'ok' | 'info' | 'warn';

export interface FinNotification {
  id: string;          // stable across sessions so read-state persists
  tone: NotifTone;
  title: string;
  body: string;
  icon: IconName;
  href: string;
  /** Sort key — higher shows first (warnings + soonest events float up). */
  weight: number;
}

const READ_KEY = 'fx_notif_read';
const DISMISS_KEY = 'fx_notif_dismissed';

function ids(key: string): Set<string> {
  try { return new Set(getJSON<string[]>(key, [])); } catch { return new Set(); }
}
function saveIds(key: string, set: Set<string>) {
  setJSON(key, Array.from(set).slice(-200)); // cap so it can't grow unbounded
}

/** Days until an ISO date (YYYY-MM-DD), from local today. */
function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

/** Derive the full notification list (already excludes dismissed). */
export function buildNotifications(now = new Date()): FinNotification[] {
  const cm = currentMonth();
  const dismissed = ids(DISMISS_KEY);
  const out: FinNotification[] = [];
  const snap = readDashboard();

  // ── Budget / cashflow signals (monthly cadence via the month in the id) ──
  if (snap.netCashflow != null && snap.netCashflow < 0) {
    out.push({
      id: `overspend-${cm}`, tone: 'warn',
      title: 'You’ve overspent this month',
      body: 'Spending is above income. Trimming one want gets you back to positive.',
      icon: 'warn', href: '/tools/budget', weight: 100,
    });
  }
  if ((snap.savingsRatePct ?? 0) >= 20) {
    out.push({
      id: `savings-strong-${cm}`, tone: 'ok',
      title: 'Strong savings rate',
      body: `You’re saving ${snap.savingsRatePct}% of income — at or above the 20% target.`,
      icon: 'check', href: '/tools/budget', weight: 20,
    });
  }
  // Saving more is worth telling someone about. Before this, the bell only
  // ever mirrored the SPEND trend — and because that trend was computed from
  // the raw outflow, a month of extra saving arrived as "Spending is up 43%".
  // Now the two are separate signals and only one of them is a warning.
  const saved = snap.insights.find((i) => /set aside .* more than last month/i.test(i.text));
  if (saved) {
    out.push({
      id: `saved-${cm}`, tone: 'ok',
      title: 'Saving is up', body: saved.text,
      icon: 'check', href: '/tools/expenses', weight: 18,
    });
  }
  // Spend-trend notification mirrors the Dashboard insight (same wording source).
  const trend = snap.insights.find((i) => /vs last month/i.test(i.text));
  if (trend) {
    out.push({
      id: `trend-${cm}`, tone: trend.tone === 'warn' ? 'warn' : 'ok',
      title: 'Spending trend', body: trend.text,
      icon: 'trending', href: '/tools/expenses', weight: trend.tone === 'warn' ? 80 : 18,
    });
  }
  if (snap.goal && snap.goal.progressPct > 0 && snap.goal.progressPct < 100) {
    out.push({
      id: `goal-progress-${cm}`, tone: 'info',
      title: `${snap.goal.name} is ${snap.goal.progressPct}% funded`,
      body: 'Keep your SIP running to stay on track.',
      icon: 'goal', href: '/tools/goals', weight: 15,
    });
  }

  // ── Upcoming events in the next 7 days (from the Calendar engine) ─────────
  for (const e of getUpcomingEvents(now, 7)) {
    const d = daysUntil(e.date);
    const when = d <= 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`;
    out.push({
      id: `upcoming-${e.id}`, tone: 'info',
      title: `${e.title} ${when}`,
      body: e.detail,
      icon: e.icon, href: e.href,
      weight: 60 - Math.min(d, 7), // sooner = higher
    });
  }

  return out
    .filter((n) => !dismissed.has(n.id))
    .sort((a, b) => b.weight - a.weight);
}

export function getUnreadCount(now = new Date()): number {
  const read = ids(READ_KEY);
  return buildNotifications(now).filter((n) => !read.has(n.id)).length;
}

export function isRead(id: string): boolean {
  return ids(READ_KEY).has(id);
}

export function markAllRead(now = new Date()): void {
  const read = ids(READ_KEY);
  buildNotifications(now).forEach((n) => read.add(n.id));
  saveIds(READ_KEY, read);
  store.set('fx_notif_seen_at', String(Date.now()));
}

export function dismiss(id: string): void {
  const d = ids(DISMISS_KEY);
  d.add(id);
  saveIds(DISMISS_KEY, d);
}

/** Reset all notification read/dismiss state (used by Settings → data reset). */
export function clearNotificationState(): void {
  try { setJSON(READ_KEY, []); setJSON(DISMISS_KEY, []); store.set('fx_notif_seen_at', ''); } catch { /* ignore */ }
}
