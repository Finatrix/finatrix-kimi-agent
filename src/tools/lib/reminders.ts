import { ymdLocal } from '../../lib/date';
import { getJSON, setJSON } from './storage';
import type { ExpenseItem } from './expense';
import type { FinEvent } from './calendar';
import { MIDDAY_LINES, MORNING_LINES, dayNumber, lineForDay } from './dailyLines';

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
 * Restraint is the design. Up to three notifications a day, one per part of
 * the day, each switchable on its own: a line in the morning, a line at
 * midday, and the reminder to add spending in the evening. The evening one is
 * skipped on a day that already has an entry, and takes the day's one evening
 * slot (a bill due tomorrow, the Sunday look at the month, or the plain
 * nudge). The plan only ever covers the next seven days, re-made each time the
 * app is opened or a record changes. Someone who stops opening the app stops
 * hearing from it after a week, rather than being nagged forever.
 *
 * Preferences are per device on purpose (`fx_reminders` is not a synced key):
 * permission to notify is granted to a device, not to an account.
 */

export interface ReminderPrefs {
  /** `null` until the person has answered the one-time question. */
  enabled: boolean | null;
  /** Local time of the evening spending reminder, 24h. */
  hour: number;
  minute: number;
  /** "Add today's spending", skipped when today already has an entry. */
  daily: boolean;
  /** One look at the month, on Sunday. */
  weekly: boolean;
  /** Bills and investing dates from the calendar, the day before. */
  upcoming: boolean;
  /** One line to start the day on, different every day. */
  morning: boolean;
  /** Local time of the morning line, 24h. */
  morningHour: number;
  morningMinute: number;
  /** One line between 1 and 2 pm, different every day. */
  midday: boolean;
}

export const REMINDER_KEY = 'fx_reminders';

export const DEFAULT_REMINDER_PREFS: ReminderPrefs = {
  enabled: null, hour: 20, minute: 0, daily: true, weekly: true, upcoming: true,
  morning: true, morningHour: 8, morningMinute: 0, midday: true,
};

function clockPart(value: unknown, max: number, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : fallback;
}

export function loadReminderPrefs(): ReminderPrefs {
  const saved = getJSON<Partial<ReminderPrefs>>(REMINDER_KEY, {});
  // Someone who already said yes agreed to one notification a day, at night.
  // The morning and midday lines are theirs to switch on, not ours to start
  // sending. Anyone who has not answered yet is asked about all three at once.
  const newSlotsOn = saved.enabled !== true;
  return {
    enabled: typeof saved.enabled === 'boolean' ? saved.enabled : null,
    hour: clockPart(saved.hour, 23, DEFAULT_REMINDER_PREFS.hour),
    minute: clockPart(saved.minute, 59, DEFAULT_REMINDER_PREFS.minute),
    daily: saved.daily !== false,
    weekly: saved.weekly !== false,
    upcoming: saved.upcoming !== false,
    morning: typeof saved.morning === 'boolean' ? saved.morning : newSlotsOn,
    morningHour: clockPart(saved.morningHour, 23, DEFAULT_REMINDER_PREFS.morningHour),
    morningMinute: clockPart(saved.morningMinute, 59, DEFAULT_REMINDER_PREFS.morningMinute),
    midday: typeof saved.midday === 'boolean' ? saved.midday : newSlotsOn,
  };
}

export function saveReminderPrefs(prefs: ReminderPrefs): void {
  setJSON(REMINDER_KEY, prefs);
}

export interface PlannedReminder {
  /** Fixed per part of the day and day-offset, so re-planning replaces rather than duplicates. */
  id: number;
  kind: 'daily' | 'weekly' | 'upcoming' | 'attention' | 'morning' | 'midday';
  title: string;
  body: string;
  at: Date;
  /** In-app path opened when the notification is tapped. */
  href: string;
}

/** How far ahead the plan reaches. Also how long the app keeps talking unopened. */
export const REMINDER_HORIZON_DAYS = 7;

/**
 * One id per day-offset in the plan, with a run of seven for each part of the
 * day, so a re-plan overwrites the last one rather than adding to it.
 */
const EVENING_IDS = 41000;
const MORNING_IDS = 41100;
const MIDDAY_IDS = 41200;

/** The midday line falls between 1 and 2 pm. */
const MIDDAY_HOUR = 13;

/**
 * The minute past 1 pm for a day (see `dayNumber`). It moves every day so the
 * line does not become wallpaper, and stays in the first 46 so an alarm the
 * system delays by a few minutes still lands before 2 pm. 17 shares no factor
 * with 46, so no two neighbouring days get the same minute.
 */
export function middayMinute(day: number): number {
  return (day * 17) % 46;
}

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

function morningFor(day: Date, offset: number, now: Date, prefs: ReminderPrefs): PlannedReminder | undefined {
  if (!prefs.morning) return undefined;
  const at = atTime(day, prefs.morningHour, prefs.morningMinute);
  if (at.getTime() <= now.getTime()) return undefined;
  return {
    id: MORNING_IDS + offset, kind: 'morning', at, href: '/tools/dashboard',
    title: 'Good morning', body: lineForDay(MORNING_LINES, dayNumber(day)),
  };
}

function middayFor(day: Date, offset: number, now: Date, prefs: ReminderPrefs): PlannedReminder | undefined {
  if (!prefs.midday) return undefined;
  const at = atTime(day, MIDDAY_HOUR, middayMinute(dayNumber(day)));
  if (at.getTime() <= now.getTime()) return undefined;
  return {
    id: MIDDAY_IDS + offset, kind: 'midday', at, href: '/tools/goals',
    title: 'Midday nudge', body: lineForDay(MIDDAY_LINES, dayNumber(day)),
  };
}

/**
 * The evening slot: something due tomorrow, then the Sunday look at the month,
 * then the plain daily nudge. One of them at most.
 */
function eveningFor(
  day: Date, offset: number, now: Date, prefs: ReminderPrefs, ctx: ReminderContext, loggedToday: boolean,
): PlannedReminder | undefined {
  const at = atTime(day, prefs.hour, prefs.minute);
  if (at.getTime() <= now.getTime()) return undefined;
  const id = EVENING_IDS + offset;

  const tomorrow = new Date(day);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = ymdLocal(tomorrow);
  const due = prefs.upcoming ? ctx.upcoming.filter((e) => e.date === tomorrowKey && e.type !== 'goal') : [];
  if (due.length > 0) {
    return {
      id, kind: 'upcoming', at, href: '/tools/calendar',
      title: due.length === 1 ? `${due[0].title} is due tomorrow` : `${due.length} payments are due tomorrow`,
      body: 'From your calendar. Check the date and amount with your provider.',
    };
  }

  if (prefs.weekly && day.getDay() === 0) {
    return {
      id, kind: ctx.overspent ? 'attention' : 'weekly', at, href: '/tools/dashboard',
      title: ctx.overspent ? 'Spending is above income this month' : 'Your month so far',
      body: ctx.overspent
        ? 'Open FinatriX to see which categories moved.'
        : 'See how this month is going against your budget.',
    };
  }

  // Today's nudge is pointless once today has an entry. Later days cannot be
  // known yet; the plan is re-made whenever a record changes.
  if (prefs.daily && !(offset === 0 && loggedToday)) {
    return {
      id, kind: 'daily', at, href: '/tools/expenses',
      title: 'Add today’s spending',
      body: 'A minute now keeps this month’s picture accurate.',
    };
  }
  return undefined;
}

/**
 * The next week of reminders, soonest first. Pure: same inputs, same plan.
 *
 * Up to three a day, one per part of the day. The wording carries no amounts —
 * a figure fixed at planning time could be wrong by the time it is read, and a
 * lock screen is a public place. The morning and midday lines come from the
 * date alone (see dailyLines.ts), so re-planning never changes today's.
 */
export function planReminders(now: Date, prefs: ReminderPrefs, ctx: ReminderContext): PlannedReminder[] {
  if (prefs.enabled !== true) return [];
  const todayKey = ymdLocal(now);
  const loggedToday = ctx.expenses.some((e) => e.date === todayKey);
  const plan: PlannedReminder[] = [];

  for (let offset = 0; offset < REMINDER_HORIZON_DAYS; offset += 1) {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    for (const slot of [
      morningFor(day, offset, now, prefs),
      middayFor(day, offset, now, prefs),
      eveningFor(day, offset, now, prefs, ctx, loggedToday),
    ]) {
      if (slot) plan.push(slot);
    }
  }
  return plan.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Every id this module can ever schedule, so a re-plan can clear the old one. */
export function reminderIds(): number[] {
  return [EVENING_IDS, MORNING_IDS, MIDDAY_IDS].flatMap((base) =>
    Array.from({ length: REMINDER_HORIZON_DAYS }, (_, i) => base + i));
}
