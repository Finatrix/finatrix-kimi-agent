import { store } from '../../tools/lib/storage';

/**
 * Whether the app lock is on, for this device only.
 *
 * Deliberately not in `SYNC_KEYS`: a lock switched on for one phone says
 * nothing about another, and a synced value could lock a device that has no
 * passcode to unlock it with. Not in `ACCOUNT_LOCAL_KEYS` either: that list is
 * cleared by an account switch and by losing a session, and a link carrying
 * someone else's sign-in tokens triggers both. The lock ends with an explicit
 * sign-out (`clearAppLockOnSignOut`) and with nothing else. It is not part of a
 * backup or of "clear finance data".
 */
export const APP_LOCK_KEY = 'fx_app_lock';

export function isAppLockOn(): boolean {
  return store.raw(APP_LOCK_KEY) === '1';
}

/**
 * Switch the lock on or off. Returns whether the setting now holds.
 *
 * Switching on reports false when it could not be saved for good (storage full
 * or blocked): `store` then keeps the value in memory only, so the lock would
 * work until the app restarts and be gone after. A lock that quietly forgets
 * itself is worse than none, so the key is removed again and the caller says so.
 * Goes through `store`, so the lock and the Settings switch hear the change.
 */
export function setAppLockOn(on: boolean): boolean {
  if (!on) {
    store.remove(APP_LOCK_KEY);
    return true;
  }
  if (store.set(APP_LOCK_KEY, '1')) return true;
  store.remove(APP_LOCK_KEY);
  return false;
}

/** The sign-out the person asks for ends the lock with the account. */
export function clearAppLockOnSignOut(): void {
  if (isAppLockOn()) setAppLockOn(false);
}
