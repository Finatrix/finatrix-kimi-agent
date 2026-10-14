import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_REMINDER_PREFS, planReminders, reminderIds } from '../tools/lib/reminders';

const h = vi.hoisted(() => ({
  cancel: vi.fn(),
  schedule: vi.fn(),
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    cancel: h.cancel,
    schedule: h.schedule,
    checkPermissions: async () => ({ display: 'granted' }),
    requestPermissions: async () => ({ display: 'granted' }),
    addListener: async () => ({ remove: async () => {} }),
  },
}));

const plan = planReminders(
  new Date(2026, 9, 7, 5, 0, 0),
  { ...DEFAULT_REMINDER_PREFS, enabled: true },
  { expenses: [], upcoming: [], overspent: false },
);

describe('scheduleReminders', () => {
  beforeEach(() => {
    h.cancel.mockReset().mockResolvedValue(undefined);
    h.schedule.mockReset().mockResolvedValue({ notifications: [] });
  });

  it('clears every id it can ever have scheduled before it schedules the new plan', async () => {
    const { scheduleReminders } = await import('../native/reminders');
    await scheduleReminders(plan);
    expect(h.cancel).toHaveBeenCalledTimes(1);
    expect(h.cancel.mock.calls[0][0].notifications.map((n: { id: number }) => n.id)).toEqual(reminderIds());
    expect(h.cancel.mock.invocationCallOrder[0]).toBeLessThan(h.schedule.mock.invocationCallOrder[0]);
  });

  it('hands over all three a day, in the plan’s own order', async () => {
    const { scheduleReminders } = await import('../native/reminders');
    await scheduleReminders(plan);
    const sent = h.schedule.mock.calls[0][0].notifications;
    expect(sent).toHaveLength(plan.length);
    expect(plan).toHaveLength(21);
    expect(sent.map((n: { id: number }) => n.id)).toEqual(plan.map((p) => p.id));
    // Well inside the 64 pending notifications iOS keeps per app.
    expect(sent.length).toBeLessThan(64);
  });

  it('never asks for an exact alarm, which hangs Android 12+ on a system screen', async () => {
    const { scheduleReminders } = await import('../native/reminders');
    await scheduleReminders(plan);
    const sent = h.schedule.mock.calls[0][0].notifications;
    expect(sent.every((n: { isExactNotification: boolean }) => n.isExactNotification === false)).toBe(true);
  });

  it('lets Android show a whole line when the notification is expanded', async () => {
    const { scheduleReminders } = await import('../native/reminders');
    await scheduleReminders(plan);
    const sent = h.schedule.mock.calls[0][0].notifications;
    expect(sent.every((n: { body: string; largeBody: string }) => n.largeBody === n.body)).toBe(true);
  });

  it('carries the screen a tap should open', async () => {
    const { scheduleReminders } = await import('../native/reminders');
    await scheduleReminders(plan);
    const sent = h.schedule.mock.calls[0][0].notifications;
    expect(sent.map((n: { extra: { href: string } }) => n.extra.href).every((href: string) => /^\/tools\/[a-z]+$/.test(href))).toBe(true);
  });

  it('only clears when the plan is empty', async () => {
    const { scheduleReminders } = await import('../native/reminders');
    await scheduleReminders([]);
    expect(h.cancel).toHaveBeenCalledTimes(1);
    expect(h.schedule).not.toHaveBeenCalled();
  });

  it('swallows a scheduler that refuses, rather than breaking the app', async () => {
    h.schedule.mockRejectedValue(new Error('denied'));
    const { scheduleReminders } = await import('../native/reminders');
    await expect(scheduleReminders(plan)).resolves.toBeUndefined();
  });
});
