import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { alwaysOn, DEFAULT_REMINDER_PREFS, planReminders, REMINDER_KEY } from '../tools/lib/reminders';

const h = vi.hoisted(() => ({ permission: 'prompt', request: vi.fn(), schedule: vi.fn() }));

vi.mock('../native/platform', () => ({ isNativeApp: () => true }));
vi.mock('../native/reminders', () => ({
  reminderPermission: async () => h.permission,
  requestReminderPermission: async () => { h.request(); h.permission = 'granted'; return 'granted'; },
  scheduleReminders: h.schedule,
}));

import { RemindersCard, ReminderPrompt } from '../tools/ui/Reminders';
import { syncReminders } from '../tools/lib/reminderSync';

describe('notifications in the native apps', () => {
  beforeEach(() => {
    localStorage.clear();
    h.permission = 'prompt';
    h.request.mockClear();
    h.schedule.mockReset().mockResolvedValue(undefined);
  });
  afterEach(cleanup);

  it('alwaysOn ignores every saved opt-out and keeps the times', () => {
    const prefs = alwaysOn({ ...DEFAULT_REMINDER_PREFS, enabled: false, morning: false, midday: false, daily: false, hour: 21 });
    expect(prefs).toMatchObject({ enabled: true, morning: true, midday: true, daily: true, weekly: true, upcoming: true, hour: 21 });
    expect(planReminders(new Date(2026, 9, 7, 5), prefs, { expenses: [], upcoming: [], overspent: false }).length).toBeGreaterThan(0);
  });

  it('asks for the system permission itself and schedules even after an old "Not now"', async () => {
    localStorage.setItem(REMINDER_KEY, JSON.stringify({ enabled: false, morning: false }));
    await syncReminders(new Date(2026, 9, 7, 5));
    expect(h.request).toHaveBeenCalledTimes(1);
    expect(h.schedule.mock.calls[0][0].length).toBeGreaterThan(0);
  });

  it('does not schedule into a blocked permission and does not re-prompt', async () => {
    h.permission = 'denied';
    await syncReminders(new Date(2026, 9, 7, 5));
    expect(h.request).not.toHaveBeenCalled();
    expect(h.schedule.mock.calls[0][0]).toEqual([]);
  });

  it('offers no switch, checkbox or prompt to turn them off', async () => {
    const { container } = render(<><RemindersCard /><ReminderPrompt /></>);
    await screen.findByLabelText('Morning time');
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(screen.queryByText(/Not now/)).toBeNull();
    expect(container.textContent).not.toMatch(/switch off/i);
  });
});
