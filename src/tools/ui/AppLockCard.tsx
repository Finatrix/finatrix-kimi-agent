import { useEffect, useState } from 'react';
import { APP_LOCK_KEY, isAppLockOn, setAppLockOn } from '../../native/appLock/setting';
import { isNativeApp } from '../../native/platform';
import { onLocalWrite } from '../lib/storage';
import { Toggle } from './Toggle';

interface Note {
  text: string;
  /** Something the user has to fix, as opposed to something they chose. */
  problem: boolean;
}

const NO_PASSCODE: Note = {
  text: 'Set a passcode or screen lock on this device first. App lock uses it to check that it is you.',
  problem: true,
};
const UNSUPPORTED: Note = { text: 'App lock is not available on this device.', problem: true };
const FAILED: Note = { text: 'That could not be checked, so app lock is still off.', problem: true };
const CANCELLED: Note = { text: 'App lock is still off. Unlock once to switch it on.', problem: false };

/**
 * The switch for the app lock (src/native/AppLock.tsx). Only the installed
 * apps have a lock, so a browser gets nothing.
 *
 * Switching it on asks the device to unlock once first. A lock that this
 * device cannot open would shut its owner out, so the proof comes before the
 * setting is saved, and a device with no passcode is told why it stays off.
 */
export function AppLockCard() {
  const [on, setOn] = useState(isAppLockOn);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  // The setting can change from outside this card: signing out clears it, and
  // the lock switches itself off if the device's passcode is removed.
  useEffect(() => onLocalWrite((key) => {
    if (key === APP_LOCK_KEY) setOn(isAppLockOn());
  }), []);

  if (!isNativeApp()) return null;

  const change = async (next: boolean) => {
    if (busy) return;
    setNote(null);
    if (!next) {
      setAppLockOn(false);
      return;
    }
    setBusy(true);
    try {
      const { lockAvailability, unlockWithDevice } = await import('../../native/appLock/plugin');
      const availability = await lockAvailability();
      if (availability.state !== 'ready') {
        setNote(availability.state === 'no-passcode' ? NO_PASSCODE : UNSUPPORTED);
        return;
      }
      const result = await unlockWithDevice('Turn on app lock');
      if (result === 'ok') setAppLockOn(true);
      else if (result === 'cancelled') setNote(CANCELLED);
      else setNote(result === 'unavailable' ? NO_PASSCODE : FAILED);
    } catch {
      setNote(FAILED);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fx-applock-setting">
      <Toggle checked={on} onChange={(next) => void change(next)} label="App lock" size="md">
        Lock FinatriX on this device
      </Toggle>
      {note && (
        <p className="note" role="alert" style={{ marginTop: 10, color: note.problem ? 'var(--red)' : undefined }}>
          {note.text}
        </p>
      )}
      <p className="note" style={{ marginTop: 10 }}>
        This setting stays on this device, and signing out switches it off.
      </p>
    </div>
  );
}
