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

function timeValue(prefs: ReminderPrefs): string {
  return `${String(prefs.hour).padStart(2, '0')}:${String(prefs.minute).padStart(2, '0')}`;
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

/** Settings card: on/off, the time, and which kinds. */
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
        Remind me to add my spending
      </Toggle>
      {message && <p className="note" role="alert" style={{ color: 'var(--red)' }}>{message}</p>}
      {on && (
        <>
          <div className="fg" style={{ marginTop: 14, maxWidth: 220 }}>
            <label className="fl" htmlFor="fx-reminder-time">Daily reminder time</label>
            <input
              id="fx-reminder-time" className="fi" type="time" value={timeValue(prefs)}
              onChange={(e) => {
                const [h, m] = e.target.value.split(':').map(Number);
                if (Number.isInteger(h) && Number.isInteger(m)) update({ ...prefs, hour: h, minute: m });
              }}
            />
          </div>
          {([
            ['daily', 'Daily: add today’s spending', 'Skipped on days you have already added something.'],
            ['weekly', 'Sunday: your month so far', 'One look at the month against your budget.'],
            ['upcoming', 'Bills and investing dates', 'The day before, from your calendar.'],
          ] as const).map(([key, label, hint]) => (
            <label key={key} className="fx-checkrow" style={{ alignItems: 'flex-start', margin: '10px 0' }}>
              <input className="fx-check" type="checkbox" checked={prefs[key]} onChange={(e) => update({ ...prefs, [key]: e.target.checked })} />
              <span>{label}<span className="note" style={{ display: 'block', margin: 0 }}>{hint}</span></span>
            </label>
          ))}
        </>
      )}
      <p className="note" style={{ marginTop: 10 }}>
        At most one notification a day, with no amounts in it. Reminders are planned on this device from
        your own records and stop by themselves if FinatriX is not opened for a week.
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
    <aside className="card fx-reminder-prompt" aria-label="Daily reminder">
      <div>
        <b>Want a reminder to add your spending?</b>
        <p className="note">One notification a day at 8 pm, skipped when you have already added something. Change the time or turn it off in Settings.</p>
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
