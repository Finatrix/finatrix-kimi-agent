import { App } from '@capacitor/app';
import { onLocalWrite } from '../../tools/lib/storage';
import { isAndroidApp } from '../platform';
import type { LockEvent } from './machine';
import { lockAvailability, onForegroundChange, setSwitcherCover, unlockWithDevice } from './plugin';
import { APP_LOCK_KEY, isAppLockOn, setAppLockOn } from './setting';

/** Shown by the system prompt: the passcode screen on iOS, the title on Android. */
const UNLOCK_REASON = 'Unlock FinatriX';

export interface LockController {
  /**
   * Ask the phone to check its owner. Safe to call while an attempt is running:
   * a tap can only reach the Unlock button when no system prompt is covering
   * it, so a second call means the first one is stuck or already over, and the
   * newest attempt is the one that counts.
   */
  unlock(): void;
  /** BACK on the lock screen: leave the app, as BACK does on any top-level screen. */
  leave(): void;
  dispose(): void;
}

/**
 * Feeds the lock's state machine (./machine.ts) from the device: when the app
 * leaves and returns, what the phone says about an unlock attempt, and the
 * setting being switched on, off or cleared.
 */
export function startLockController(dispatch: (event: LockEvent) => void): LockController {
  let disposed = false;
  let attempt = 0;
  const disposers: Array<() => void> = [];
  const send = (event: LockEvent) => {
    if (!disposed) dispatch(event);
  };
  const listen = (pending: Promise<{ remove: () => Promise<void> }>) => {
    const registration = pending.catch(() => undefined);
    disposers.push(() => void registration.then((handle) => handle?.remove()).catch(() => {}));
  };

  // "Hidden" is whichever comes first: iOS reports resign-active before it
  // reports the background, and Android reports pause before stop. The earlier
  // the page covers itself, the surer it is that the cover was painted before
  // the system froze the web view. "Shown" is only ever fully active, because
  // an unlock prompt raised while the app is still on its way in is cancelled.
  const hidden = () => send({ type: 'hidden', at: Date.now() });
  const shown = () => send({ type: 'shown', at: Date.now() });
  listen(App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) shown();
    else hidden();
  }));
  listen(App.addListener('pause', hidden));
  // Android's overview keeps the app running in its card and never pauses it,
  // so neither event above fires there and the content would sit in the card
  // for anyone to read. The plugin reports that case itself.
  listen(onForegroundChange((active) => {
    if (active) shown();
    else hidden();
  }));

  setSwitcherCover(isAppLockOn());
  disposers.push(onLocalWrite((key) => {
    if (key !== APP_LOCK_KEY) return;
    const on = isAppLockOn();
    setSwitcherCover(on);
    send({ type: on ? 'enabled' : 'disabled' });
  }));

  const unlock = async () => {
    attempt += 1;
    const mine = attempt;
    send({ type: 'prompt' });
    const availability = await lockAvailability();
    if (disposed || mine !== attempt) return;
    if (availability.state !== 'ready') {
      // The device no longer has a passcode (removing one needs the passcode),
      // so there is nothing left to check against and the phone itself is open
      // to anyone. Switch the lock off rather than shut the owner out for good.
      setAppLockOn(false);
      return;
    }
    const result = await unlockWithDevice(UNLOCK_REASON);
    if (disposed) return;
    // A confirmed owner is a confirmed owner, whichever attempt it came from.
    if (result === 'ok') send({ type: 'unlocked' });
    else if (mine !== attempt) return;
    else if (result === 'unavailable') setAppLockOn(false);
    else send({ type: 'refused', reason: result });
  };

  return {
    unlock: () => void unlock(),
    leave: () => {
      // iOS has no BACK, and no way to send an app to the background.
      if (isAndroidApp()) void App.minimizeApp().catch(() => {});
    },
    dispose: () => {
      disposed = true;
      disposers.forEach((dispose) => dispose());
    },
  };
}
