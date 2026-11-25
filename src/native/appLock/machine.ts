/**
 * The app lock's rules, with no browser, React or native code in them.
 *
 * The lock is a privacy gate for a phone that is already unlocked: when it is
 * on, FinatriX asks the phone to check who is holding it (a face, a
 * fingerprint, or the device passcode) before it shows anything. It does not
 * encrypt what is stored on the device, and nothing here pretends it does.
 *
 * Three phases:
 *  - `open`    the app is in use.
 *  - `veiled`  the app has left the foreground and its content is covered, but
 *              nothing is decided yet. Coming back soon enough lifts the veil
 *              with no prompt.
 *  - `locked`  the content stays covered until the phone confirms its owner.
 *
 * Every page load starts `locked` when the setting is on. A cold start, the
 * reload that follows a sign-in, and the reload after the system reclaimed the
 * web view are all "opening the app", and none of them can prove how long the
 * phone was out of its owner's hands.
 */

/** How long the app may be out of the foreground before coming back needs an unlock. */
export const LOCK_AFTER_MS = 60_000;

export type LockPhase = 'open' | 'veiled' | 'locked';

export interface LockState {
  /** The setting. While it is off every event leaves the app open. */
  enabled: boolean;
  phase: LockPhase;
  /** When the app left the foreground (epoch ms), or null while it is in front. */
  hiddenAt: number | null;
  /** The system's unlock prompt is, as far as we know, on screen. */
  prompting: boolean;
  /** The last attempt was refused by the phone, as opposed to cancelled. */
  failed: boolean;
  /**
   * Counts each time the lock engages. The controller asks the phone once per
   * value, so a cancelled prompt waits for the Unlock button instead of
   * reappearing in a loop.
   */
  engagement: number;
}

export type LockEvent =
  /** The app left the foreground, or is about to. */
  | { type: 'hidden'; at: number }
  /** The app is in front again. */
  | { type: 'shown'; at: number }
  /** An unlock attempt is starting. */
  | { type: 'prompt' }
  /** The phone confirmed its owner. */
  | { type: 'unlocked' }
  /** The attempt ended without an unlock. */
  | { type: 'refused'; reason: 'cancelled' | 'failed' }
  /** The setting was switched on, which only happens straight after an unlock. */
  | { type: 'enabled' }
  /** The setting was switched off or cleared. */
  | { type: 'disabled' };

export function initialLockState(enabled: boolean): LockState {
  return {
    enabled,
    phase: enabled ? 'locked' : 'open',
    hiddenAt: null,
    prompting: false,
    failed: false,
    engagement: enabled ? 1 : 0,
  };
}

/**
 * Was the app away long enough to lock?
 *
 * The wall clock is the only clock that keeps counting while the phone sleeps,
 * so it is the one used. A clock that moved backwards, or a time that is not a
 * number, cannot show the absence was short, so both lock.
 */
export function awayTooLong(hiddenAt: number, now: number): boolean {
  const away = now - hiddenAt;
  return !(away >= 0 && away < LOCK_AFTER_MS);
}

export function lockReducer(state: LockState, event: LockEvent): LockState {
  if (event.type === 'enabled') {
    return state.enabled ? state : { ...initialLockState(false), enabled: true };
  }
  if (event.type === 'disabled') {
    return state.enabled || state.phase !== 'open' ? initialLockState(false) : state;
  }
  if (!state.enabled) return state;

  switch (event.type) {
    case 'hidden':
      // The unlock prompt takes the foreground from the app: on iOS every time,
      // on older Android when it asks for the PIN. That is not the user leaving,
      // and treating it as one would make every cancelled prompt ask again.
      if (state.prompting || state.hiddenAt !== null) return state;
      return { ...state, hiddenAt: event.at, phase: state.phase === 'open' ? 'veiled' : state.phase };

    case 'shown':
      if (state.hiddenAt === null) return state;
      if (state.phase === 'locked') {
        // Came back to a locked app: ask again, without waiting for a tap.
        return { ...state, hiddenAt: null, failed: false, engagement: state.engagement + 1 };
      }
      return awayTooLong(state.hiddenAt, event.at)
        ? { ...state, phase: 'locked', hiddenAt: null, failed: false, engagement: state.engagement + 1 }
        : { ...state, phase: 'open', hiddenAt: null };

    case 'prompt':
      return state.phase === 'locked' ? { ...state, prompting: true, failed: false } : state;

    case 'unlocked':
      return state.phase === 'locked'
        ? { ...state, phase: 'open', hiddenAt: null, prompting: false, failed: false }
        : state;

    case 'refused':
      return state.phase === 'locked'
        ? { ...state, prompting: false, failed: event.reason === 'failed' }
        : state;
  }
}
