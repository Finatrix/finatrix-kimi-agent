import { ymdLocal } from '../../lib/date';
import { getJSON, setJSON } from './storage';
import type { ExpenseItem } from './expense';
import type { FinEvent } from './calendar';

/**
 * Reminders — what to tell someone, and when.
 *
 * Everything here is planned on the device from the device's own records, so
 * there is no server that knows anyone's spending and no push backend to run.
 * The apps hand the plan to the operating system's local-notification
 * scheduler (src/native/reminders.ts), which delivers it whether or not the
 * app is open. A website cannot do that without a push service, so in a
 * browser the same plan only produces the reminder while a tab is open.
 *
 * Restraint is the design. At most one notification a day; the daily one is
 * skipped on a day that already has an entry; and the plan only ever covers
 * the next seven days, re-made each time the app is opened or a record
 * changes. Someone who stops opening the app stops hearing from it after a
 * week, rather than being nagged forever.
 *
 * Preferences are per device on purpose (`fx_reminders` is not a synced key):
 * permission to notify is granted to a device, not to an account.
 */

export interface ReminderPrefs {
  /** `null` until the person has answered the one-time question. */
  enabled: boolean | null;
  /** Local time of the daily reminder, 24h. */
  hour: number;
  minute: number;
  /** "Add today's spending", skipped when today already has an entry. */
  daily: boolean;
  /** One look at the month, on Sunday. */
  weekly: boolean;
  /** Bills and investing dates from the calendar, the day before. */
  upcoming: boolean;
}

export const REMINDER_KEY = 'fx_reminders';

export const DEFAULT_REMINDER_PREFS: ReminderPrefs = {
  enabled: null, hour: 20, minute: 0, daily: true, weekly: true, upcoming: true,
};

export function loadReminderPrefs(): ReminderPrefs {
  const saved = getJSON<Partial<ReminderPrefs>>(REMINDER_KEY, {});
  const hour = Number(saved.hour);
  const minute = Number(saved.minute);
  return {
    enabled: typeof saved.enabled === 'boolean' ? saved.enabled : null,
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_REMINDER_PREFS.hour,
    minute: Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : DEFAULT_REMINDER_PREFS.minute,
    daily: saved.daily !== false,
    weekly: saved.weekly !== false,
    upcoming: saved.upcoming !== false,
  };
}

export function saveReminderPrefs(prefs: ReminderPrefs): void {
  setJSON(REMINDER_KEY, prefs);
}

export interface PlannedReminder {
  /** Stable per calendar day, so re-planning replaces rather than duplicates. */
  id: number;
  kind: 'daily' | 'weekly' | 'upcoming' | 'attention';
  title: string;
  body: string;
  at: Date;
  /** In-app path opened when the notification is tapped. */
  href: string;
}

/** How far ahead the plan reaches. Also how long the app keeps talking unopened. */
export const REMINDER_HORIZON_DAYS = 7;

/** One id per day-offset in the plan: seven fixed slots, so a re-plan overwrites the last one. */
const ID_BASE = 41000;

function atTime(day: Date, hour: number, minute: number): Date {
  const d = new Date(day);
  d.setHours(hour, minute, 0, 0);
  return d;
}

export interface ReminderContext {
  expenses: ReadonlyArray<Pick<ExpenseItem, 'date'>>;
  /** Calendar events for the coming week (lib/calendar getUpcomingEvents). */
  upcoming: ReadonlyArray<Pick<FinEvent, 'date' | 'title' | 'type'>>;
  /** True when recorded spending is above income this month (lib/dashboard). */
  overspent: boolean;
}

/**
 * The next week of reminders. Pure: same inputs, same plan.
 *
 * One notification per day at most, chosen in this order: something due
 * tomorrow, then the Sunday look at the month, then the plain daily nudge.
 * The wording carries no amounts — a figure fixed at planning time could be
 * wrong by the time it is read, and a lock screen is a public place.
 */
export function planReminders(now: Date, prefs: ReminderPrefs, ctx: ReminderContext): PlannedReminder[] {
  if (prefs.enabled !== true) return [];
  const todayKey = ymdLocal(now);
  const loggedToday = ctx.expenses.some((e) => e.date === todayKey);
  const plan: PlannedReminder[] = [];

  for (let offset = 0; offset < REMINDER_HORIZON_DAYS; offset += 1) {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    const at = atTime(day, prefs.hour, prefs.minute);
    if (at.getTime() <= now.getTime()) continue;
    const id = ID_BASE + offset;

    const tomorrow = new Date(day);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = ymdLocal(tomorrow);
    const due = prefs.upcoming ? ctx.upcoming.filter((e) => e.date === tomorrowKey && e.type !== 'goal') : [];
    if (due.length > 0) {
      plan.push({
        id, kind: 'upcoming', at, href: '/tools/calendar',
        title: due.length === 1 ? `${due[0].title} is due tomorrow` : `${due.length} payments are due tomorrow`,
        body: 'From your calendar. Check the date and amount with your provider.',
      });
      continue;
    }

    if (prefs.weekly && day.getDay() === 0) {
      plan.push({
        id, kind: ctx.overspent ? 'attention' : 'weekly', at, href: '/tools/dashboard',
        title: ctx.overspent ? 'Spending is above income this month' : 'Your month so far',
        body: ctx.overspent
          ? 'Open FinatriX to see which categories moved.'
          : 'See how this month is going against your budget.',
      });
      continue;
    }

    // Today's nudge is pointless once today has an entry. Later days cannot be
    // known yet; the plan is re-made whenever a record changes.
    if (prefs.daily && !(offset === 0 && loggedToday)) {
      plan.push({
        id, kind: 'daily', at, href: '/tools/expenses',
        title: 'Add today’s spending',
        body: 'A minute now keeps this month’s picture accurate.',
      });
    }
  }
  return plan;
}

/** Every id this module can ever schedule, so a re-plan can clear the old one. */
export function reminderIds(): number[] {
  return Array.from({ length: REMINDER_HORIZON_DAYS }, (_, i) => ID_BASE + i);
}
