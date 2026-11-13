import { store } from '../../tools/lib/storage';

/**
 * Whether the app lock is on, for this device only.
 *
 * Deliberately not in `SYNC_KEYS`: a lock switched on for one phone says
 * nothing about another, and a synced value could lock a device that has no
 * passcode to unlock it with. It is listed in `ACCOUNT_LOCAL_KEYS`
 * (tools/cloudSync.ts), so signing out, switching account and deleting the
 * account clear it. It is not part of a backup or of "clear finance data".
 */
export const APP_LOCK_KEY = 'fx_app_lock';

export function isAppLockOn(): boolean {
  return store.raw(APP_LOCK_KEY) === '1';
}

/** Goes through `store`, so the lock and the Settings switch hear the change. */
export function setAppLockOn(on: boolean): void {
  if (on) store.set(APP_LOCK_KEY, '1');
  else store.remove(APP_LOCK_KEY);
}
