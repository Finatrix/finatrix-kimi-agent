import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { REMINDER_KEY, loadReminderPrefs } from '../tools/lib/reminders';
import { RemindersCard, ReminderPrompt } from '../tools/ui/Reminders';

const requestPermission = vi.fn(async () => 'granted');

function seed(value: unknown) {
  localStorage.setItem(REMINDER_KEY, JSON.stringify(value));
}

describe('RemindersCard', () => {
  beforeEach(() => {
    localStorage.clear();
    requestPermission.mockClear();
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  async function open() {
    render(<RemindersCard />);
    return screen.findByRole('checkbox', { name: /Morning: a money thought/ });
  }

  it('offers the new lines, off, to someone who had agreed to one reminder a day', async () => {
    seed({ enabled: true });
    const morning = await open();
    expect(morning).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Midday: a nudge/ })).not.toBeChecked();
    expect(screen.queryByLabelText('Morning time')).toBeNull();
    // What they already had is still there and still on.
    expect(screen.getByRole('checkbox', { name: /Daily: add today’s spending/ })).toBeChecked();
    expect(screen.getByLabelText('Spending reminder time')).toHaveValue('20:00');
  });

  it('turns the morning line on, shows its time, and remembers a new one', async () => {
    seed({ enabled: true });
    const morning = await open();
    fireEvent.click(morning);
    expect(loadReminderPrefs()).toMatchObject({ morning: true });

    const time = await screen.findByLabelText('Morning time');
    expect(time).toHaveValue('08:00');
    fireEvent.change(time, { target: { value: '07:30' } });
    expect(loadReminderPrefs()).toMatchObject({ morningHour: 7, morningMinute: 30 });
    expect(screen.getByLabelText('Morning time')).toHaveValue('07:30');
  });

  it('turns the midday line on and off on its own', async () => {
    seed({ enabled: true, morning: true, midday: false });
    await open();
    fireEvent.click(screen.getByRole('checkbox', { name: /Midday: a nudge/ }));
    expect(loadReminderPrefs()).toMatchObject({ midday: true, morning: true });
    fireEvent.click(screen.getByRole('checkbox', { name: /Midday: a nudge/ }));
    expect(loadReminderPrefs()).toMatchObject({ midday: false, morning: true });
  });

  it('tells the truth about how many a day there can be', async () => {
    seed({ enabled: true });
    await open();
    expect(screen.getByText(/Up to three notifications a day/)).toBeInTheDocument();
    expect(screen.queryByText(/At most one notification a day/)).toBeNull();
  });

  it('shows no options until reminders are on', async () => {
    seed({ enabled: false });
    render(<RemindersCard />);
    await screen.findByRole('checkbox', { name: 'Reminders' });
    expect(screen.queryByRole('checkbox', { name: /Morning: a money thought/ })).toBeNull();
  });
});

describe('ReminderPrompt', () => {
  beforeEach(() => {
    localStorage.clear();
    requestPermission.mockClear();
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('asks about all three at once, and says when each one comes', async () => {
    render(<ReminderPrompt />);
    expect(await screen.findByText(/Up to three short notifications/)).toHaveTextContent(/8 am.*lunchtime.*8 pm/);
  });

  it('turning it on is the one moment the system permission is asked for, and starts all three', async () => {
    render(<ReminderPrompt />);
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on reminders' }));
    await waitFor(() => expect(loadReminderPrefs().enabled).toBe(true));
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(loadReminderPrefs()).toMatchObject({ morning: true, midday: true, daily: true });
  });

  it('"Not now" asks for nothing and sends nothing', async () => {
    render(<ReminderPrompt />);
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(requestPermission).not.toHaveBeenCalled();
    expect(loadReminderPrefs().enabled).toBe(false);
  });

  it('stays away from someone who has already answered', async () => {
    localStorage.setItem(REMINDER_KEY, JSON.stringify({ enabled: true }));
    const { container } = render(<ReminderPrompt />);
    await waitFor(() => expect(requestPermission).not.toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
