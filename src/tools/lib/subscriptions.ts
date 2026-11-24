/**
 * Subscription radar — every subscription the ledger has seen repeat, what it
 * costs a year, and when it usually lands.
 *
 * NOTHING HERE IS INVENTED
 * ------------------------
 * The list is `detectRecurring`'s own output (the Expense Tracker's model),
 * narrowed to two things the person told us: the Subscriptions category, and
 * expenses they marked recurring. A subscription seen only once is not on it —
 * it has not repeated yet. The only new arithmetic is the yearly figure:
 *
 *     yearly = estimatedMonthly × 12
 *
 * "Usually on the 5th" is the day of the last logged payment (the same rule the
 * Calendar uses) and "about ₹1,800" is the pattern's own average. Both are
 * estimates and the screen says so.
 *
 * REMINDERS
 * ---------
 * Reminders are not a separate notification. They join the evening slot that
 * `planReminders` already owns (see reminders.ts), which keeps the app at three
 * notifications a day. This module only produces the dated events that slot
 * reads: a renewal 3 days ahead, the day after a bill that was never logged, and
 * the end of a free trial the person typed in. Notifications carry no amounts.
 *
 * Preferences are per device (`fx_sub_radar`), like `fx_reminders`: the muted
 * list and the trials only matter where the notifications are scheduled.
 */
import type { IconName } from '../ui/Icon';
import { ymdLocal, ymLocal } from '../../lib/date';
import { allCategories } from './budget';
import { loadCatViewFor } from './budgetCatsMonth';
import {
  genExpenseId, isSpendingCategory, loadExpenses, migrateCategory, saveExpenses, type ExpenseItem,
} from './expense';
import { auditEvent, recordAudit } from './expenseAudit';
import { detectRecurring, type CatMeta } from './expenseAnalytics';
import { validRecordDate } from './recordReview';
import { getJSON, setJSON } from './storage';

export const RADAR_KEY = 'fx_sub_radar';

/** Days before a renewal or the end of a trial that the evening reminder names it. */
export const RENEWAL_LEAD_DAYS = 3;

/** The category keys a "subscription" is read from. `subs` is the retired spelling. */
const SUBSCRIPTION_CATEGORIES: ReadonlySet<string> = new Set(['subscriptions', 'subs']);

/* ── Preferences ─────────────────────────────────────────────────────────── */

export interface Trial {
  id: string;
  name: string;
  /** Last day of the trial, `YYYY-MM-DD`. */
  end: string;
}

export interface RadarPrefs {
  /** `subscriptionKey`s whose reminders are switched off. */
  muted: string[];
  trials: Trial[];
}

const MAX_TRIALS = 30;
const MAX_NAME = 60;

export function loadRadarPrefs(): RadarPrefs {
  const saved = getJSON<Partial<RadarPrefs>>(RADAR_KEY, {});
  const muted = Array.isArray(saved.muted) ? saved.muted.filter((k): k is string => typeof k === 'string') : [];
  const trials = Array.isArray(saved.trials)
    ? saved.trials.filter((t): t is Trial => !!t && typeof t.id === 'string' && typeof t.name === 'string'
      && typeof t.end === 'string' && validRecordDate(t.end)).slice(0, MAX_TRIALS)
    : [];
  return { muted, trials };
}

export function saveRadarPrefs(prefs: RadarPrefs): boolean {
  return setJSON(RADAR_KEY, prefs);
}

/** Add a trial. Returns the new prefs, or null when the name or date is not usable. */
export function addTrial(prefs: RadarPrefs, name: string, end: string): RadarPrefs | null {
  const clean = name.trim().slice(0, MAX_NAME);
  if (!clean || !validRecordDate(end) || prefs.trials.length >= MAX_TRIALS) return null;
  const id = `tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  return { ...prefs, trials: [...prefs.trials, { id, name: clean, end }] };
}

export function removeTrial(prefs: RadarPrefs, id: string): RadarPrefs {
  return { ...prefs, trials: prefs.trials.filter((t) => t.id !== id) };
}

export function toggleMuted(prefs: RadarPrefs, key: string): RadarPrefs {
  const muted = prefs.muted.includes(key) ? prefs.muted.filter((k) => k !== key) : [...prefs.muted, key];
  return { ...prefs, muted };
}

/**
 * A subscription's identity: the same pair `detectRecurring` groups on.
 * Matches the calendar's bill ids (`bill-<encoded key>-<month>`), so one mute
 * switches off the "due tomorrow" line for that bill too.
 */
export function subscriptionKey(category: string, merchant: string | null): string {
  return JSON.stringify([category, merchant ? merchant.toLowerCase() : null]);
}

/** Calendar bill events carry the key in their id; drop the ones that are muted. */
export function dropMutedBills<T extends { id: string }>(events: readonly T[], muted: readonly string[]): T[] {
  if (muted.length === 0) return [...events];
  const prefixes = muted.map((k) => `bill-${encodeURIComponent(k)}-`);
  return events.filter((e) => !prefixes.some((p) => e.id.startsWith(p)));
}

/* ── The radar ───────────────────────────────────────────────────────────── */

export interface SubscriptionRow {
  key: string;
  /** Merchant as typed, or the category's label when no merchant was logged. */
  name: string;
  /** Lower-cased merchant, or null when the pattern is the category alone. */
  merchant: string | null;
  category: string;
  label: string;
  icon: IconName;
  /** Marked recurring by the person, rather than in the Subscriptions category. */
  flagged: boolean;
  /** The pattern's own average — an estimate, not a price list. */
  monthly: number;
  /** `monthly × 12`. */
  yearly: number;
  /** Day of the month it usually lands on. */
  day: number;
  /** Its last logged payment, `YYYY-MM-DD`. */
  lastDate: string;
  monthsSeen: number;
  /** Next expected date, `YYYY-MM-DD`: this month if still ahead and unpaid, otherwise next month. */
  nextDate: string;
  /** This month's usual day has passed and nothing matching is logged. */
  dueToLog: boolean;
  muted: boolean;
}

export interface TrialRow extends Trial {
  /** Whole days from today to the end date; negative once it has ended. */
  daysLeft: number;
}

export interface Radar {
  subscriptions: SubscriptionRow[];
  trials: TrialRow[];
  monthlyTotal: number;
  yearlyTotal: number;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function daysIn(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

function monthAt(now: Date, offset: number): { month: string; year: number; mo: number } {
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return { month: ymLocal(d), year: d.getFullYear(), mo: d.getMonth() + 1 };
}

/** Whole calendar days from `from` to `to` (both `YYYY-MM-DD`). */
export function daysBetween(from: string, to: string): number {
  const a = from.split('-').map(Number);
  const b = to.split('-').map(Number);
  return Math.round((new Date(b[0], b[1] - 1, b[2]).getTime() - new Date(a[0], a[1] - 1, a[2]).getTime()) / 86_400_000);
}

export function radarCatMeta(month: string): Map<string, CatMeta> {
  const out = new Map<string, CatMeta>();
  allCategories(loadCatViewFor(month).active).forEach((c) => out.set(c.k, { k: c.k, l: c.l, ic: c.ic, section: c.section }));
  return out;
}

interface Candidate {
  row: Omit<SubscriptionRow, 'nextDate' | 'dueToLog' | 'muted'>;
  merchantKey: string;
}

function candidates(
  items: readonly ExpenseItem[], catMeta: Map<string, CatMeta>, prefs: RadarPrefs,
): { found: Candidate[]; muted: ReadonlySet<string> } {
  const validKeys = new Set(catMeta.keys());
  // A merchant-less group is identified by its category alone, as in detectRecurring.
  const flagged = new Set<string>();
  const display = new Map<string, { date: string; name: string }>();
  for (const e of items) {
    const merchant = (e.merchant || '').toLowerCase();
    const identity = `${migrateCategory(e.category, validKeys)}::${merchant}`;
    if (e.recurring) flagged.add(identity);
    if (merchant && e.merchant) {
      const seen = display.get(identity);
      if (!seen || e.date > seen.date) display.set(identity, { date: e.date, name: e.merchant.trim() });
    }
  }

  const found: Candidate[] = [];
  for (const p of detectRecurring([...items], catMeta)) {
    const section = catMeta.get(p.category)?.section ?? null;
    // Savings and transfers are money moving, not a subscription.
    if (!isSpendingCategory({ k: p.category, section })) continue;
    const merchantKey = p.merchant ?? '';
    const identity = `${p.category}::${merchantKey}`;
    const isFlagged = flagged.has(identity);
    if (!SUBSCRIPTION_CATEGORIES.has(p.category) && !isFlagged) continue;
    const lastDay = Number((p.lastDate || '').slice(8, 10));
    if (!Number.isFinite(lastDay) || lastDay < 1) continue;
    found.push({
      merchantKey,
      row: {
        key: subscriptionKey(p.category, p.merchant),
        name: display.get(identity)?.name ?? p.label,
        merchant: p.merchant,
        category: p.category,
        label: p.label,
        icon: p.icon,
        flagged: isFlagged,
        monthly: p.estimatedMonthly,
        yearly: Math.round(p.estimatedMonthly * 12 * 100) / 100,
        day: lastDay,
        lastDate: p.lastDate,
        monthsSeen: p.monthsDetected,
      },
    });
  }
  return { found, muted: new Set(prefs.muted) };
}

/** Has anything matching this subscription been logged in `month`? Same rule as commitments.ts. */
function paidIn(items: readonly ExpenseItem[], validKeys: ReadonlySet<string>, c: Candidate, month: string): boolean {
  return items.some((e) => (e.date || '').slice(0, 7) === month
    && migrateCategory(e.category, validKeys) === c.row.category
    && (c.merchantKey === '' || (e.merchant || '').toLowerCase() === c.merchantKey));
}

function dateIn(c: Candidate, year: number, mo: number): string {
  return `${year}-${pad(mo)}-${pad(Math.min(c.row.day, daysIn(year, mo)))}`;
}

export function computeRadar(
  items: readonly ExpenseItem[], catMeta: Map<string, CatMeta>, prefs: RadarPrefs, now: Date,
): Radar {
  const today = ymdLocal(now);
  const validKeys = new Set(catMeta.keys());
  const { found, muted } = candidates(items, catMeta, prefs);
  const here = monthAt(now, 0);
  const next = monthAt(now, 1);

  const subscriptions = found.map((c): SubscriptionRow => {
    const thisDate = dateIn(c, here.year, here.mo);
    const paid = paidIn(items, validKeys, c, here.month);
    const dueToLog = !paid && thisDate < today;
    const nextDate = !paid && thisDate >= today ? thisDate : dateIn(c, next.year, next.mo);
    return { ...c.row, nextDate, dueToLog, muted: muted.has(c.row.key) };
  }).sort((a, b) => b.yearly - a.yearly || a.name.localeCompare(b.name));

  const trials = prefs.trials
    .map((t): TrialRow => ({ ...t, daysLeft: daysBetween(today, t.end) }))
    .filter((t) => t.daysLeft >= -1)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const monthlyTotal = subscriptions.reduce((s, r) => s + r.monthly, 0);
  return {
    subscriptions, trials, monthlyTotal, yearlyTotal: Math.round(monthlyTotal * 12 * 100) / 100,
  };
}

/* ── Reminder events ─────────────────────────────────────────────────────── */

export interface RadarEvent {
  /** What the event is about: the renewal date, or the last day of a trial. */
  date: string;
  title: string;
  kind: 'renews' | 'trial';
}

/**
 * The dated events the evening slot reads. A `renews` event exists only while
 * nothing matching is logged for its month, so the same event drives both
 * "renews in 3 days" and, the day after, "Paid it? Log it" — and stops driving
 * the second the person logs it. Muted subscriptions produce nothing.
 */
export function computeRadarEvents(
  items: readonly ExpenseItem[], catMeta: Map<string, CatMeta>, prefs: RadarPrefs, now: Date,
): RadarEvent[] {
  const validKeys = new Set(catMeta.keys());
  const { found, muted } = candidates(items, catMeta, prefs);
  const events: RadarEvent[] = [];
  // Last month matters on the 1st (a bill due on the 31st), next month near the end.
  for (const offset of [-1, 0, 1]) {
    const { month, year, mo } = monthAt(now, offset);
    for (const c of found) {
      if (muted.has(c.row.key) || paidIn(items, validKeys, c, month)) continue;
      events.push({ date: dateIn(c, year, mo), title: c.row.name, kind: 'renews' });
    }
  }
  for (const t of prefs.trials) events.push({ date: t.end, title: t.name, kind: 'trial' });
  return events;
}

/** Everything the reminder plan needs, read from this device's records. */
export function currentRadarEvents(now: Date): { events: RadarEvent[]; muted: string[] } {
  try {
    const prefs = loadRadarPrefs();
    return {
      events: computeRadarEvents(loadExpenses(), radarCatMeta(ymLocal(now)), prefs, now),
      muted: prefs.muted,
    };
  } catch {
    return { events: [], muted: [] };
  }
}

/* ── One-tap log ─────────────────────────────────────────────────────────── */

/**
 * Log a subscription as paid today at its usual amount. The person taps a
 * button that shows the amount, so nothing is entered behind their back, and
 * the entry goes through the same audit trail as one added by hand.
 */
export function logSubscriptionPayment(row: SubscriptionRow, now: Date): ExpenseItem | null {
  const item: ExpenseItem = {
    id: genExpenseId(),
    amount: row.monthly,
    category: row.category,
    date: ymdLocal(now),
    ...(row.merchant ? { merchant: row.name } : {}),
    ...(row.flagged ? { recurring: true } : {}),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  const items = loadExpenses();
  if (!saveExpenses([item, ...items])) return null;
  recordAudit([auditEvent('add', item)]);
  return item;
}
