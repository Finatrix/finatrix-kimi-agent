import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_REMINDER_PREFS, REMINDER_KEY, loadReminderPrefs, middayMinute, planReminders, reminderIds,
  type ReminderContext, type ReminderPrefs,
} from '../tools/lib/reminders';
import { MIDDAY_LINES, MORNING_LINES } from '../tools/lib/dailyLines';

/** Everything on: the morning line, the midday line and the evening reminder. */
const on: ReminderPrefs = { ...DEFAULT_REMINDER_PREFS, enabled: true };
/** The evening reminder alone, which is what these tests were written against. */
const evening: ReminderPrefs = { ...on, morning: false, midday: false };
const nothing: ReminderContext = { expenses: [], upcoming: [], overspent: false };
/** Wednesday 7 October 2026, 10:00 local. */
const now = new Date(2026, 9, 7, 10, 0, 0);

describe('planReminders: the evening reminder', () => {
  it('plans nothing until the person has said yes', () => {
    expect(planReminders(now, DEFAULT_REMINDER_PREFS, nothing)).toEqual([]);
    expect(planReminders(now, { ...on, enabled: false }, nothing)).toEqual([]);
  });

  it('plans at most one a day for the next week, at the chosen time', () => {
    const plan = planReminders(now, evening, nothing);
    expect(plan).toHaveLength(7);
    expect(new Set(plan.map((p) => p.at.toDateString())).size).toBe(7);
    expect(plan.every((p) => p.at.getHours() === 20 && p.at.getMinutes() === 0)).toBe(true);
    expect(plan.every((p) => reminderIds().includes(p.id))).toBe(true);
  });

  it('skips today once today has an entry, and only today', () => {
    const plan = planReminders(now, evening, { ...nothing, expenses: [{ date: '2026-10-07' }] });
    expect(plan).toHaveLength(6);
    expect(plan[0].at.getDate()).toBe(8);
  });

  it('does not schedule a time that has already passed', () => {
    const late = new Date(2026, 9, 7, 21, 0, 0);
    expect(planReminders(late, evening, nothing)[0].at.getDate()).toBe(8);
  });

  it('uses Sunday for the look at the month, and says so plainly when overspent', () => {
    const sunday = planReminders(now, evening, nothing).find((p) => p.at.getDay() === 0);
    expect(sunday).toMatchObject({ kind: 'weekly', href: '/tools/dashboard' });
    const over = planReminders(now, evening, { ...nothing, overspent: true }).find((p) => p.at.getDay() === 0);
    expect(over?.kind).toBe('attention');
  });

  it('puts a payment due tomorrow ahead of the daily nudge', () => {
    const plan = planReminders(now, evening, { ...nothing, upcoming: [{ date: '2026-10-09', title: 'Rent', type: 'bill' }] });
    const thursday = plan.find((p) => p.at.getDate() === 8);
    expect(thursday).toMatchObject({ kind: 'upcoming', title: 'Rent is due tomorrow' });
    expect(plan.filter((p) => p.kind === 'upcoming')).toHaveLength(1);
  });

  it('never puts an amount in a notification', () => {
    const plan = planReminders(now, on, { expenses: [], overspent: true, upcoming: [{ date: '2026-10-09', title: 'Rent', type: 'bill' }] });
    expect(plan.some((p) => /\d{3,}|[₹$£€]/.test(`${p.title} ${p.body}`))).toBe(false);
  });

  it('honours each kind being switched off', () => {
    expect(planReminders(now, { ...evening, daily: false, weekly: false }, nothing)).toEqual([]);
    expect(planReminders(now, { ...evening, weekly: false }, nothing).every((p) => p.kind === 'daily')).toBe(true);
  });
});

describe('planReminders: the morning and midday lines', () => {
  const plan = planReminders(now, on, nothing);
  const ofKind = (kind: string, p = plan) => p.filter((r) => r.kind === kind);
  const morning = (p = plan) => p.filter((r) => r.kind === 'morning');
  const midday = (p = plan) => p.filter((r) => r.kind === 'midday');

  it('makes three a day for the next week, soonest first, none sharing an id', () => {
    // 10:00 on day one is past 08:00, so the first morning line is tomorrow's.
    expect(plan).toHaveLength(20);
    expect(plan.map((p) => p.at.getTime())).toEqual([...plan.map((p) => p.at.getTime())].sort((a, b) => a - b));
    expect(new Set(plan.map((p) => p.id)).size).toBe(plan.length);
    expect(plan.every((p) => reminderIds().includes(p.id))).toBe(true);
  });

  it('plans a full three on a day that has not started yet', () => {
    const dawn = new Date(2026, 9, 7, 5, 0, 0);
    const full = planReminders(dawn, on, nothing);
    expect(full).toHaveLength(21);
    const firstDay = full.filter((p) => p.at.getDate() === 7).map((p) => p.kind);
    expect(firstDay).toEqual(['morning', 'midday', 'daily']);
  });

  it('puts the morning line at the chosen time', () => {
    expect(morning().every((p) => p.at.getHours() === 8 && p.at.getMinutes() === 0)).toBe(true);
    const custom = planReminders(now, { ...on, morningHour: 6, morningMinute: 45 }, nothing);
    expect(morning(custom).every((p) => p.at.getHours() === 6 && p.at.getMinutes() === 45)).toBe(true);
  });

  it('keeps the midday line between 1 and 2 pm, early enough for a late alarm', () => {
    expect(midday().length).toBeGreaterThan(0);
    for (const p of midday()) {
      expect(p.at.getHours()).toBe(13);
      expect(p.at.getMinutes()).toBeLessThanOrEqual(45);
    }
  });

  it('moves the midday minute from one day to the next', () => {
    const minutes = Array.from({ length: 500 }, (_, d) => middayMinute(20_000 + d));
    expect(minutes.every((m) => Number.isInteger(m) && m >= 0 && m <= 45)).toBe(true);
    for (let i = 1; i < minutes.length; i += 1) expect(minutes[i]).not.toBe(minutes[i - 1]);
    expect(new Set(minutes).size).toBeGreaterThan(20);
  });

  it('says something different every day', () => {
    for (const kind of ['morning', 'midday']) {
      const bodies = ofKind(kind).map((p) => p.body);
      expect(new Set(bodies).size).toBe(bodies.length);
    }
  });

  it('draws the morning from the morning pool and the midday from the midday pool', () => {
    expect(morning().every((p) => MORNING_LINES.includes(p.body))).toBe(true);
    expect(midday().every((p) => MIDDAY_LINES.includes(p.body))).toBe(true);
  });

  it('gives a day the same line however many times and whenever it is planned', () => {
    const earlier = planReminders(new Date(2026, 9, 7, 4, 0, 0), on, nothing);
    const later = planReminders(new Date(2026, 9, 7, 12, 59, 0), on, nothing);
    const line = (p: typeof plan, kind: string, date: number) => ofKind(kind, p).find((r) => r.at.getDate() === date)?.body;
    for (const kind of ['morning', 'midday']) {
      expect(line(earlier, kind, 8)).toBeDefined();
      expect(line(earlier, kind, 8)).toBe(line(later, kind, 8));
    }
  });

  it('does not schedule a slot that has already passed today', () => {
    const afterMorning = planReminders(new Date(2026, 9, 7, 9, 0, 0), on, nothing);
    expect(morning(afterMorning).some((p) => p.at.getDate() === 7)).toBe(false);
    expect(midday(afterMorning).some((p) => p.at.getDate() === 7)).toBe(true);
    const afterMidday = planReminders(new Date(2026, 9, 7, 14, 30, 0), on, nothing);
    expect(midday(afterMidday).some((p) => p.at.getDate() === 7)).toBe(false);
  });

  it('honours each line being switched off on its own', () => {
    expect(morning(planReminders(now, { ...on, morning: false }, nothing))).toHaveLength(0);
    expect(midday(planReminders(now, { ...on, morning: false }, nothing))).not.toHaveLength(0);
    expect(midday(planReminders(now, { ...on, midday: false }, nothing))).toHaveLength(0);
    expect(morning(planReminders(now, { ...on, midday: false }, nothing))).not.toHaveLength(0);
    expect(planReminders(now, { ...on, morning: false, midday: false, daily: false, weekly: false }, nothing)).toEqual([]);
  });

  it('is silenced by the one master switch', () => {
    expect(planReminders(now, { ...on, enabled: false }, nothing)).toEqual([]);
    expect(planReminders(now, { ...on, enabled: null }, nothing)).toEqual([]);
  });

  it('keeps the morning and midday lines on a day the evening reminder is busy or skipped', () => {
    const busy = planReminders(new Date(2026, 9, 7, 5, 0, 0), on, {
      expenses: [{ date: '2026-10-07' }],
      upcoming: [{ date: '2026-10-09', title: 'Rent', type: 'bill' }],
      overspent: false,
    });
    const thursday = busy.filter((p) => p.at.getDate() === 8).map((p) => p.kind);
    expect(thursday).toEqual(['morning', 'midday', 'upcoming']);
    const today = busy.filter((p) => p.at.getDate() === 7).map((p) => p.kind);
    expect(today).toEqual(['morning', 'midday']);
  });

  it('sends the morning line to the dashboard and the midday line to goals', () => {
    expect(morning().every((p) => p.href === '/tools/dashboard')).toBe(true);
    expect(midday().every((p) => p.href === '/tools/goals')).toBe(true);
  });

  it('never goes past the week, however many slots there are', () => {
    const horizon = new Date(2026, 9, 7, 10, 0, 0);
    horizon.setDate(horizon.getDate() + 7);
    expect(plan.every((p) => p.at.getTime() < horizon.getTime())).toBe(true);
  });
});

describe('loadReminderPrefs', () => {
  beforeEach(() => localStorage.clear());
  const save = (value: unknown) => localStorage.setItem(REMINDER_KEY, JSON.stringify(value));

  it('offers all three to someone who has not been asked yet', () => {
    expect(loadReminderPrefs()).toMatchObject({ enabled: null, morning: true, midday: true, morningHour: 8, morningMinute: 0 });
  });

  it('does not start sending the new lines to someone who agreed to one reminder a day', () => {
    save({ enabled: true, hour: 21, minute: 15, daily: true });
    expect(loadReminderPrefs()).toMatchObject({ enabled: true, hour: 21, minute: 15, morning: false, midday: false });
  });

  it('offers all three again to someone who said no to the old single reminder', () => {
    save({ enabled: false });
    expect(loadReminderPrefs()).toMatchObject({ enabled: false, morning: true, midday: true });
  });

  it('keeps what the person chose once they have chosen', () => {
    save({ enabled: true, morning: true, midday: false, morningHour: 6, morningMinute: 30 });
    expect(loadReminderPrefs()).toMatchObject({ morning: true, midday: false, morningHour: 6, morningMinute: 30 });
  });

  it('falls back to the default time for a time that cannot be real', () => {
    save({ enabled: true, morningHour: 99, morningMinute: -4, hour: 'late' });
    expect(loadReminderPrefs()).toMatchObject({ morningHour: 8, morningMinute: 0, hour: 20 });
  });
});
