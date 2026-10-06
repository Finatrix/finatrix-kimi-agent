import { isNativeApp } from '../../native/platform';
import { ymdLocal } from '../../lib/date';
import { getJSON, store } from './storage';
import { getUpcomingEvents } from './calendar';
import { readDashboard } from './dashboard';
import type { ExpenseItem } from './expense';
import {
  REMINDER_HORIZON_DAYS, loadReminderPrefs, planReminders, type PlannedReminder,
} from './reminders';

/**
 * Re-make the reminder plan from the records as they are now and hand it to
 * whichever scheduler this platform has. Called when the tools open, when a
 * record changes and when the app returns to the foreground.
 */

export type ReminderPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

export function currentPlan(now = new Date()): PlannedReminder[] {
  const snap = readDashboard();
  return planReminders(now, loadReminderPrefs(), {
    expenses: getJSON<ExpenseItem[]>('fx_expenses', []),
    upcoming: getUpcomingEvents(now, REMINDER_HORIZON_DAYS + 1),
    overspent: snap.netCashflow != null && snap.netCashflow < 0,
  });
}

export async function reminderPermission(): Promise<ReminderPermission> {
  if (isNativeApp()) return (await import('../../native/reminders')).reminderPermission();
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission === 'default' ? 'prompt' : Notification.permission;
}

export async function requestReminderPermission(): Promise<ReminderPermission> {
  if (isNativeApp()) return (await import('../../native/reminders')).requestReminderPermission();
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    return result === 'default' ? 'prompt' : result;
  } catch {
    return 'denied';
  }
}

const WEB_SHOWN_KEY = 'fx_reminder_shown';
let webTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * A browser has no scheduler that outlives the tab without a push service, so
 * the website's version is honest about its reach: if a tab is open when the
 * next reminder falls due, it is shown then — once a day.
 */
function scheduleInTab(plan: readonly PlannedReminder[]): void {
  if (webTimer) clearTimeout(webTimer);
  webTimer = undefined;
  const next = plan[0];
  if (!next || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const delay = next.at.getTime() - Date.now();
  if (delay > 24 * 60 * 60 * 1000) return;
  webTimer = setTimeout(() => {
    const today = ymdLocal(new Date());
    if (store.get(WEB_SHOWN_KEY, '') === today) return;
    // Re-plan at the moment of truth: an entry may have been added since.
    const due = currentPlan(new Date(Date.now() - 60_000))[0];
    if (!due || due.id !== next.id) return;
    try {
      new Notification(due.title, { body: due.body, tag: 'fx-reminder' });
      store.set(WEB_SHOWN_KEY, today);
    } catch {
      /* Some browsers only allow notifications from a service worker. */
    }
  }, Math.max(0, delay));
}

export async function syncReminders(now = new Date()): Promise<void> {
  const plan = currentPlan(now);
  if (isNativeApp()) {
    const native = await import('../../native/reminders');
    // Never schedule into a permission that is not there; never prompt from here.
    await native.scheduleReminders((await native.reminderPermission()) === 'granted' ? plan : []);
    return;
  }
  scheduleInTab(plan);
}
