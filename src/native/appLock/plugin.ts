import { registerPlugin } from '@capacitor/core';

/**
 * The web side of the in-repo `FxAppLock` plugin:
 *   ios/App/App/FxAppLockPlugin.swift
 *   android/app/src/main/java/co/finatrix/app/AppLockPlugin.java
 *
 * Both halves answer the same three calls, so nothing here branches on the
 * platform. Loaded only inside the installed apps.
 */

export type Biometry = 'face' | 'touch' | 'biometric' | 'none';

/** How an unlock attempt ended. */
export type UnlockResult = 'ok' | 'cancelled' | 'failed' | 'unavailable';

interface FxAppLockPlugin {
  /** `available` means the device has a passcode or screen lock to check against. */
  availability(): Promise<{ available: boolean; biometry: Biometry }>;
  /** The system prompt: biometrics first, the device passcode as the fallback. */
  authenticate(options: { reason: string }): Promise<{ result: UnlockResult }>;
  /** Keep the app's content out of the app switcher while the lock is on. */
  setCover(options: { enabled: boolean }): Promise<void>;
  /**
   * Android only. The app stopped or started being the one in front without
   * being paused, which is what the overview screen does to it.
   */
  addListener(
    event: 'foreground',
    handler: (state: { active: boolean }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

const FxAppLock = registerPlugin<FxAppLockPlugin>('FxAppLock');

export type LockAvailability =
  | { state: 'ready'; biometry: Biometry }
  /** No passcode or screen lock on the device, so there is nothing to check against. */
  | { state: 'no-passcode' }
  /** This build of the app has no lock at all. */
  | { state: 'unsupported' };

const BIOMETRY: readonly Biometry[] = ['face', 'touch', 'biometric', 'none'];

function isUnimplemented(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'UNIMPLEMENTED';
}

export async function lockAvailability(): Promise<LockAvailability> {
  try {
    const { available, biometry } = await FxAppLock.availability();
    if (available !== true) return { state: 'no-passcode' };
    return { state: 'ready', biometry: BIOMETRY.includes(biometry) ? biometry : 'none' };
  } catch (error) {
    // Only a missing plugin means "no lock here". Anything else is unknown, and
    // an unknown must not open a locked app: report it as ready and let the
    // unlock attempt itself succeed or fail.
    return isUnimplemented(error) ? { state: 'unsupported' } : { state: 'ready', biometry: 'none' };
  }
}

export async function unlockWithDevice(reason: string): Promise<UnlockResult> {
  try {
    const { result } = await FxAppLock.authenticate({ reason });
    return result === 'ok' || result === 'cancelled' || result === 'unavailable' ? result : 'failed';
  } catch {
    return 'failed';
  }
}

/** See `addListener` above. Never fires on iOS, where "inactive" already covers it. */
export function onForegroundChange(handler: (active: boolean) => void): Promise<{ remove: () => Promise<void> }> {
  return FxAppLock.addListener('foreground', ({ active }) => handler(active === true));
}

export function setSwitcherCover(enabled: boolean): void {
  void FxAppLock.setCover({ enabled }).catch(() => {});
}
