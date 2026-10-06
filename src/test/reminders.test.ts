import { describe, expect, it } from 'vitest';
import { DEFAULT_REMINDER_PREFS, planReminders, reminderIds, type ReminderContext, type ReminderPrefs } from '../tools/lib/reminders';

const on: ReminderPrefs = { ...DEFAULT_REMINDER_PREFS, enabled: true };
const nothing: ReminderContext = { expenses: [], upcoming: [], overspent: false };
/** Wednesday 7 October 2026, 10:00 local. */
const now = new Date(2026, 9, 7, 10, 0, 0);

describe('planReminders', () => {
  it('plans nothing until the person has said yes', () => {
    expect(planReminders(now, DEFAULT_REMINDER_PREFS, nothing)).toEqual([]);
    expect(planReminders(now, { ...on, enabled: false }, nothing)).toEqual([]);
  });

  it('plans at most one reminder a day for the next week, at the chosen time', () => {
    const plan = planReminders(now, on, nothing);
    expect(plan).toHaveLength(7);
    expect(new Set(plan.map((p) => p.at.toDateString())).size).toBe(7);
    expect(plan.every((p) => p.at.getHours() === 20 && p.at.getMinutes() === 0)).toBe(true);
    expect(plan.every((p) => reminderIds().includes(p.id))).toBe(true);
  });

  it('skips today once today has an entry, and only today', () => {
    const plan = planReminders(now, on, { ...nothing, expenses: [{ date: '2026-10-07' }] });
    expect(plan).toHaveLength(6);
    expect(plan[0].at.getDate()).toBe(8);
  });

  it('does not schedule a time that has already passed', () => {
    const late = new Date(2026, 9, 7, 21, 0, 0);
    expect(planReminders(late, on, nothing)[0].at.getDate()).toBe(8);
  });

  it('uses Sunday for the look at the month, and says so plainly when overspent', () => {
    const sunday = planReminders(now, on, nothing).find((p) => p.at.getDay() === 0);
    expect(sunday).toMatchObject({ kind: 'weekly', href: '/tools/dashboard' });
    const over = planReminders(now, on, { ...nothing, overspent: true }).find((p) => p.at.getDay() === 0);
    expect(over?.kind).toBe('attention');
  });

  it('puts a payment due tomorrow ahead of the daily nudge', () => {
    const plan = planReminders(now, on, { ...nothing, upcoming: [{ date: '2026-10-09', title: 'Rent', type: 'bill' }] });
    const thursday = plan.find((p) => p.at.getDate() === 8);
    expect(thursday).toMatchObject({ kind: 'upcoming', title: 'Rent is due tomorrow' });
    expect(plan.filter((p) => p.kind === 'upcoming')).toHaveLength(1);
  });

  it('never puts an amount in a notification', () => {
    const plan = planReminders(now, on, { expenses: [], overspent: true, upcoming: [{ date: '2026-10-09', title: 'Rent', type: 'bill' }] });
    expect(plan.some((p) => /\d{3,}|[₹$£€]/.test(`${p.title} ${p.body}`))).toBe(false);
  });

  it('honours each kind being switched off', () => {
    expect(planReminders(now, { ...on, daily: false, weekly: false }, nothing)).toEqual([]);
    expect(planReminders(now, { ...on, weekly: false }, nothing).every((p) => p.kind === 'daily')).toBe(true);
  });
});
