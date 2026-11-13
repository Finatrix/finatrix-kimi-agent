/**
 * The app lock in the installed apps: what covers the screen, when the phone is
 * asked to check its owner, and what cannot get past the cover.
 *
 * The native plugin and @capacitor/app are mocked. What is under test is the
 * policy on the web side. The two native halves are tried on a simulator and an
 * emulator (docs/handoff/first-four.md, step 2.5).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fxAppLock, app, appListeners, platform } = vi.hoisted(() => {
  const appListeners = new Map<string, (payload: { isActive: boolean }) => void>();
  return {
    appListeners,
    platform: { native: true, android: false },
    fxAppLock: {
      availability: vi.fn(async (): Promise<{ available: boolean; biometry: string }> => ({ available: true, biometry: 'face' })),
      authenticate: vi.fn(async (options: { reason: string }): Promise<{ result: string }> => ({ result: options.reason ? 'ok' : 'failed' })),
      setCover: vi.fn(async (options: { enabled: boolean }): Promise<void> => void options),
    },
    app: {
      minimizeApp: vi.fn(async () => {}),
      addListener: vi.fn(async (event: string, cb: (payload: { isActive: boolean }) => void) => {
        appListeners.set(event, cb);
        return { remove: vi.fn(async () => { appListeners.delete(event); }) };
      }),
    },
  };
});

vi.mock('@capacitor/core', () => ({ registerPlugin: () => fxAppLock }));
vi.mock('@capacitor/app', () => ({ App: app }));
vi.mock('../native/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../native/platform')>()),
  isNativeApp: () => platform.native,
  isAndroidApp: () => platform.android,
}));

import AppLock from '../native/AppLock';
import { LOCK_AFTER_MS } from '../native/appLock/machine';
import { APP_LOCK_KEY, isAppLockOn, setAppLockOn } from '../native/appLock/setting';
import { store } from '../tools/lib/storage';

const T0 = 1_800_000_000_000;
const LOCKED = { name: 'FinatriX is locked' };

function renderApp() {
  return render(
    <>
      <AppLock />
      <main>
        <button type="button">Behind the lock</button>
      </main>
    </>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

/** Deliver an app event as if it happened at `ms` on the device's clock. */
function appEvent(event: 'appStateChange' | 'pause', isActive: boolean, ms: number) {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(ms);
  try {
    act(() => appListeners.get(event)?.({ isActive }));
  } finally {
    clock.mockRestore();
  }
}
const goAway = (ms: number) => appEvent('appStateChange', false, ms);
const comeBack = (ms: number) => appEvent('appStateChange', true, ms);

/** Let promises that are already resolved run their continuations. */
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function unlockedApp() {
  setAppLockOn(true);
  const view = renderApp();
  await waitFor(() => expect(fxAppLock.authenticate).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(document.querySelector('.fx-applock')).toBeNull());
  return view;
}

beforeEach(() => {
  localStorage.clear();
  appListeners.clear();
  platform.native = true;
  platform.android = false;
  vi.clearAllMocks();
  fxAppLock.availability.mockImplementation(async () => ({ available: true, biometry: 'face' }));
  fxAppLock.authenticate.mockImplementation(async () => ({ result: 'ok' }));
});

describe('app lock', () => {
  it('is not there at all in a browser', () => {
    platform.native = false;
    localStorage.setItem(APP_LOCK_KEY, '1');
    renderApp();
    expect(document.querySelector('.fx-applock, .fx-applock-hold')).toBeNull();
    expect(app.addListener).not.toHaveBeenCalled();
  });

  it('does nothing in the app while the setting is off', async () => {
    renderApp();
    await settle();
    expect(document.querySelector('.fx-applock, .fx-applock-hold')).toBeNull();
    expect(app.addListener).not.toHaveBeenCalled();
    expect(fxAppLock.authenticate).not.toHaveBeenCalled();
  });

  it('covers the app from the first paint, asks the phone, and opens when it confirms', async () => {
    const attempt = deferred<{ result: string }>();
    fxAppLock.authenticate.mockReturnValueOnce(attempt.promise);
    setAppLockOn(true);
    const { container } = renderApp();
    // Before the lock's own code has even arrived.
    expect(document.querySelector('.fx-applock-hold, .fx-applock')).not.toBeNull();

    await screen.findByRole('dialog', LOCKED);
    const unlock = screen.getByRole('button', { name: 'Unlock' });
    await waitFor(() => expect(document.activeElement).toBe(unlock));
    expect(container.hasAttribute('inert')).toBe(true);
    await waitFor(() => expect(fxAppLock.authenticate).toHaveBeenCalledTimes(1));
    expect(fxAppLock.authenticate).toHaveBeenCalledWith({ reason: 'Unlock FinatriX' });
    expect(fxAppLock.setCover).toHaveBeenLastCalledWith({ enabled: true });

    await act(async () => { attempt.resolve({ result: 'ok' }); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.querySelector('.fx-applock')).toBeNull();
    expect(container.hasAttribute('inert')).toBe(false);
  });

  it('stays locked after a cancelled prompt and waits for the Unlock button', async () => {
    const attempt = deferred<{ result: string }>();
    fxAppLock.authenticate.mockReturnValueOnce(attempt.promise);
    setAppLockOn(true);
    renderApp();
    await screen.findByRole('dialog', LOCKED);
    await waitFor(() => expect(fxAppLock.authenticate).toHaveBeenCalledTimes(1));

    // iOS makes the app inactive while the Face ID sheet is up, and active
    // again when it closes. Neither is the user leaving or coming back.
    goAway(T0);
    await act(async () => { attempt.resolve({ result: 'cancelled' }); });
    comeBack(T0 + LOCK_AFTER_MS * 5);
    await settle();
    expect(fxAppLock.authenticate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', LOCKED)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(fxAppLock.authenticate).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('says so when the phone refuses', async () => {
    fxAppLock.authenticate.mockImplementation(async () => ({ result: 'failed' }));
    setAppLockOn(true);
    renderApp();
    await screen.findByRole('dialog', LOCKED);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('That did not work. Try again.'));
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeTruthy();
  });

  it('asks again when someone comes back to a locked app', async () => {
    fxAppLock.authenticate.mockImplementation(async () => ({ result: 'cancelled' }));
    setAppLockOn(true);
    renderApp();
    await screen.findByRole('dialog', LOCKED);
    await waitFor(() => expect(fxAppLock.authenticate).toHaveBeenCalledTimes(1));
    await settle();

    goAway(T0);
    comeBack(T0 + 2_000);
    await waitFor(() => expect(fxAppLock.authenticate).toHaveBeenCalledTimes(2));
  });

  it('covers the app while it is away, and lifts the cover without a prompt within a minute', async () => {
    const { container } = await unlockedApp();
    const typing = screen.getByRole('button', { name: 'Behind the lock' });
    typing.focus();

    goAway(T0);
    const cover = document.querySelector('.fx-applock');
    expect(cover?.getAttribute('data-phase')).toBe('veiled');
    expect(cover?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('dialog')).toBeNull();
    // A cover and nothing more: the page keeps its focus for a quick return.
    expect(container.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(typing);

    comeBack(T0 + LOCK_AFTER_MS - 1);
    expect(document.querySelector('.fx-applock')).toBeNull();
    await settle();
    expect(fxAppLock.authenticate).toHaveBeenCalledTimes(1);
  });

  it('locks and asks again after a minute away, then gives focus back', async () => {
    await unlockedApp();
    const typing = screen.getByRole('button', { name: 'Behind the lock' });
    typing.focus();

    // Android reports the pause before the stop; the first one starts the clock.
    appEvent('pause', false, T0);
    goAway(T0 + 500);
    comeBack(T0 + LOCK_AFTER_MS);
    await screen.findByRole('dialog', LOCKED);
    await waitFor(() => expect(fxAppLock.authenticate).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(typing);
  });

  it('switches itself off and opens when the device no longer has a passcode', async () => {
    fxAppLock.availability.mockImplementation(async () => ({ available: false, biometry: 'none' }));
    setAppLockOn(true);
    renderApp();
    await waitFor(() => expect(isAppLockOn()).toBe(false));
    await waitFor(() => expect(document.querySelector('.fx-applock')).toBeNull());
    expect(fxAppLock.authenticate).not.toHaveBeenCalled();
    expect(fxAppLock.setCover).toHaveBeenLastCalledWith({ enabled: false });
  });

  it('stays locked when the phone cannot say whether it has a passcode', async () => {
    fxAppLock.availability.mockImplementation(async () => { throw new Error('bridge hiccup'); });
    fxAppLock.authenticate.mockImplementation(async () => { throw new Error('bridge hiccup'); });
    setAppLockOn(true);
    renderApp();
    await screen.findByRole('dialog', LOCKED);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('That did not work. Try again.'));
    expect(isAppLockOn()).toBe(true);
  });

  it('opens when the setting is cleared, as signing out does', async () => {
    fxAppLock.authenticate.mockImplementation(async () => ({ result: 'cancelled' }));
    setAppLockOn(true);
    renderApp();
    await screen.findByRole('dialog', LOCKED);
    act(() => store.remove(APP_LOCK_KEY));
    expect(document.querySelector('.fx-applock')).toBeNull();
    expect(fxAppLock.setCover).toHaveBeenLastCalledWith({ enabled: false });

    goAway(T0);
    comeBack(T0 + LOCK_AFTER_MS * 2);
    expect(document.querySelector('.fx-applock')).toBeNull();
  });

  it('starts open when switched on while the app is running, then locks after a minute away', async () => {
    renderApp();
    act(() => setAppLockOn(true));
    await waitFor(() => expect(fxAppLock.setCover).toHaveBeenLastCalledWith({ enabled: true }));
    await waitFor(() => expect(appListeners.has('appStateChange')).toBe(true));
    expect(document.querySelector('.fx-applock')).toBeNull();
    expect(fxAppLock.authenticate).not.toHaveBeenCalled();

    goAway(T0);
    comeBack(T0 + LOCK_AFTER_MS + 1);
    await screen.findByRole('dialog', LOCKED);
    await waitFor(() => expect(fxAppLock.authenticate).toHaveBeenCalledTimes(1));
  });

  it('keeps the keyboard away from the page behind', async () => {
    fxAppLock.authenticate.mockImplementation(async () => ({ result: 'cancelled' }));
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    try {
      setAppLockOn(true);
      renderApp();
      const unlock = await screen.findByRole('button', { name: 'Unlock' });
      await waitFor(() => expect(document.activeElement).toBe(unlock));
      fireEvent.keyDown(unlock, { key: 'k', metaKey: true });
      fireEvent.keyDown(unlock, { key: 'Tab' });
      fireEvent.keyDown(unlock, { key: 'Escape' });
      expect(behind).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(unlock);
      // iOS has no BACK, so Escape leaves nothing.
      expect(app.minimizeApp).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', behind);
    }
  });

  it('leaves the app when BACK is pressed on the lock screen on Android', async () => {
    platform.android = true;
    fxAppLock.authenticate.mockImplementation(async () => ({ result: 'cancelled' }));
    setAppLockOn(true);
    renderApp();
    const unlock = await screen.findByRole('button', { name: 'Unlock' });
    // bridge.ts turns BACK into Escape on the topmost dialog.
    fireEvent.keyDown(unlock, { key: 'Escape' });
    expect(app.minimizeApp).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', LOCKED)).toBeTruthy();
  });
});
