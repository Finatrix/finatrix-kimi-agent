import { useCallback, useEffect, useState } from 'react';
import { isNativeApp } from '../../native/platform';
import { onLocalWrite } from '../lib/storage';
import {
  REMINDER_KEY, loadReminderPrefs, saveReminderPrefs, type ReminderPrefs,
} from '../lib/reminders';
import {
  reminderPermission, requestReminderPermission, type ReminderPermission,
} from '../lib/reminderSync';
import { Toggle } from './Toggle';

function useReminderPrefs(): [ReminderPrefs, (next: ReminderPrefs) => void] {
  const [prefs, setPrefs] = useState(loadReminderPrefs);
  useEffect(() => onLocalWrite((key) => { if (key === REMINDER_KEY) setPrefs(loadReminderPrefs()); }), []);
  const update = useCallback((next: ReminderPrefs) => {
    setPrefs(next);
    saveReminderPrefs(next);
  }, []);
  return [prefs, update];
}

function timeValue(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function TimeField({ id, label, hour, minute, nested, onChange }: {
  id: string; label: string; hour: number; minute: number; nested?: boolean;
  onChange: (hour: number, minute: number) => void;
}) {
  return (
    <div className={`fg fx-reminder-time${nested ? ' is-nested' : ''}`}>
      <label className="fl" htmlFor={id}>{label}</label>
      <input
        id={id} className="fi" type="time" value={timeValue(hour, minute)}
        onChange={(e) => {
          const [h, m] = e.target.value.split(':').map(Number);
          if (Number.isInteger(h) && Number.isInteger(m)) onChange(h, m);
        }}
      />
    </div>
  );
}

function CheckRow({ label, hint, checked, onChange }: {
  label: string; hint: string; checked: boolean; onChange: (next: boolean) => void;
}) {
  return (
    <label className="fx-checkrow" style={{ alignItems: 'flex-start', margin: '10px 0' }}>
      <input className="fx-check" type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}<span className="note" style={{ display: 'block', margin: 0 }}>{hint}</span></span>
    </label>
  );
}

const BLOCKED = 'Notifications are blocked for FinatriX. Allow them in your device settings, then turn this on again.';

/**
 * Turning reminders on is the one place the system permission prompt is
 * raised — from a tap that asked for it, never on launch.
 */
async function enable(prefs: ReminderPrefs, update: (next: ReminderPrefs) => void): Promise<ReminderPermission> {
  const permission = await requestReminderPermission();
  update({ ...prefs, enabled: permission === 'granted' });
  return permission;
}

/** Settings card: on/off, which parts of the day, and the time of each. */
export function RemindersCard() {
  const [prefs, update] = useReminderPrefs();
  const [permission, setPermission] = useState<ReminderPermission | null>(null);
  const [message, setMessage] = useState('');
  const native = isNativeApp();

  useEffect(() => {
    let live = true;
    void reminderPermission().then((p) => { if (live) setPermission(p); });
    return () => { live = false; };
  }, []);

  if (permission === 'unsupported') {
    return <p className="note">This browser cannot show notifications. Reminders work in the FinatriX apps.</p>;
  }

  const on = prefs.enabled === true && permission === 'granted';
  const toggle = async (next: boolean) => {
    setMessage('');
    if (!next) { update({ ...prefs, enabled: false }); return; }
    const result = await enable(prefs, update);
    setPermission(result);
    if (result !== 'granted') setMessage(BLOCKED);
  };

  return (
    <div className="fx-reminders">
      <Toggle checked={on} onChange={(next) => void toggle(next)} label="Reminders" size="md">
        Send me reminders through the day
      </Toggle>
      {message && <p className="note" role="alert" style={{ color: 'var(--red)' }}>{message}</p>}
      {on && (
        <>
          <CheckRow
            label="Morning: a money thought to start the day"
            hint="One line, different every day."
            checked={prefs.morning}
            onChange={(morning) => update({ ...prefs, morning })}
          />
          {prefs.morning && (
            <TimeField
              id="fx-reminder-morning-time" label="Morning time" nested
              hour={prefs.morningHour} minute={prefs.morningMinute}
              onChange={(morningHour, morningMinute) => update({ ...prefs, morningHour, morningMinute })}
            />
          )}
          <CheckRow
            label="Midday: a nudge to work on your life"
            hint="One line between 1 and 2 pm, different every day."
            checked={prefs.midday}
            onChange={(midday) => update({ ...prefs, midday })}
          />
          <TimeField
            id="fx-reminder-time" label="Spending reminder time"
            hour={prefs.hour} minute={prefs.minute}
            onChange={(hour, minute) => update({ ...prefs, hour, minute })}
          />
          <CheckRow
            label="Daily: add today’s spending"
            hint="Skipped on days you have already added something."
            checked={prefs.daily}
            onChange={(daily) => update({ ...prefs, daily })}
          />
          <CheckRow
            label="Sunday: your month so far"
            hint="One look at the month against your budget."
            checked={prefs.weekly}
            onChange={(weekly) => update({ ...prefs, weekly })}
          />
          <CheckRow
            label="Bills and investing dates"
            hint="The day before, from your calendar."
            checked={prefs.upcoming}
            onChange={(upcoming) => update({ ...prefs, upcoming })}
          />
        </>
      )}
      <p className="note" style={{ marginTop: 10 }}>
        Up to three notifications a day, each one yours to switch off, and none with amounts in it.
        They are planned on this device from your own records and stop by themselves if FinatriX is not
        opened for a week.
        {!native && ' In a browser they can only appear while FinatriX is open in a tab; the apps deliver them at any time.'}
      </p>
    </div>
  );
}

/**
 * The one-time question, shown on the dashboard until it is answered either
 * way. In a browser it is offered only where notifications exist at all.
 */
export function ReminderPrompt() {
  const [prefs, update] = useReminderPrefs();
  const [message, setMessage] = useState('');
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    let live = true;
    void reminderPermission().then((p) => { if (live) setSupported(p !== 'unsupported'); });
    return () => { live = false; };
  }, []);

  if (prefs.enabled !== null || !supported) return message ? <p className="note" role="alert">{message}</p> : null;

  return (
    <aside className="card fx-reminder-prompt" aria-label="Daily reminders">
      <div>
        <b>Want a little nudge through the day?</b>
        <p className="note">
          Up to three short notifications: a money thought at 8 am, a nudge around lunchtime, and a reminder
          at 8 pm to add your spending (skipped when you already have). Change or switch off any of them in Settings.
        </p>
      </div>
      <div className="fx-reminder-prompt-actions">
        <button
          type="button" className="btn btn-sm"
          onClick={() => void enable(prefs, update).then((p) => { if (p !== 'granted') setMessage(BLOCKED); })}
        >
          Turn on reminders
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => update({ ...prefs, enabled: false })}>Not now</button>
      </div>
    </aside>
  );
}
