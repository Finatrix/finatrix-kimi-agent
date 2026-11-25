/**
 * The App lock switch in Settings, and where its setting is allowed to live:
 * on this device only, and ended by an explicit sign-out and by nothing else.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fxAppLock, platform } = vi.hoisted(() => ({
  platform: { native: true },
  fxAppLock: {
    availability: vi.fn(async (): Promise<{ available: boolean; biometry: string }> => ({ available: true, biometry: 'face' })),
    authenticate: vi.fn(async (options: { reason: string }): Promise<{ result: string }> => ({ result: options.reason ? 'ok' : 'failed' })),
    setCover: vi.fn(async () => {}),
    setLocked: vi.fn(async () => {}),
  },
}));

vi.mock('@capacitor/core', () => ({ registerPlugin: () => fxAppLock }));
vi.mock('../native/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../native/platform')>()),
  isNativeApp: () => platform.native,
}));

import { APP_LOCK_KEY, clearAppLockOnSignOut, isAppLockOn, setAppLockOn } from '../native/appLock/setting';
import { ACCOUNT_LOCAL_KEYS, SYNC_KEYS, clearSyncedLocal } from '../tools/cloudSync';
import { LOCAL_ONLY_KEYS } from '../tools/lib/settings';
import { AppLockCard } from '../tools/ui/AppLockCard';

const lockSwitch = () => screen.getByRole('checkbox', { name: 'App lock' }) as HTMLInputElement;

beforeEach(() => {
  localStorage.clear();
  platform.native = true;
  vi.clearAllMocks();
  fxAppLock.availability.mockImplementation(async () => ({ available: true, biometry: 'face' }));
  fxAppLock.authenticate.mockImplementation(async () => ({ result: 'ok' }));
});

describe('App lock setting', () => {
  it('is not offered in a browser', () => {
    platform.native = false;
    const { container } = render(<AppLockCard />);
    expect(container.innerHTML).toBe('');
  });

  it('is off until the device has unlocked once', async () => {
    render(<AppLockCard />);
    expect(lockSwitch().checked).toBe(false);

    fireEvent.click(lockSwitch());
    await waitFor(() => expect(lockSwitch().checked).toBe(true));
    expect(fxAppLock.authenticate).toHaveBeenCalledWith({ reason: 'Turn on app lock' });
    expect(isAppLockOn()).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('stays off, and says why, on a device with no passcode', async () => {
    fxAppLock.availability.mockImplementation(async () => ({ available: false, biometry: 'none' }));
    render(<AppLockCard />);
    fireEvent.click(lockSwitch());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Set a passcode or screen lock on this device first');
    expect(fxAppLock.authenticate).not.toHaveBeenCalled();
    expect(lockSwitch().checked).toBe(false);
    expect(isAppLockOn()).toBe(false);
  });

  it.each([
    ['cancelled', 'App lock is still off. Unlock once to switch it on.'],
    ['failed', 'That could not be checked, so app lock is still off.'],
  ])('stays off when the unlock is %s', async (result, message) => {
    fxAppLock.authenticate.mockImplementation(async () => ({ result }));
    render(<AppLockCard />);
    fireEvent.click(lockSwitch());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(message);
    expect(lockSwitch().checked).toBe(false);
    expect(isAppLockOn()).toBe(false);
  });

  it('says so, and stays off, when the setting cannot be saved', async () => {
    // A lock that is kept in memory only is gone after a restart, so it must not be reported as on.
    const full = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    try {
      render(<AppLockCard />);
      fireEvent.click(lockSwitch());
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toBe('App lock could not be saved on this device, so it is still off.');
    } finally {
      full.mockRestore();
    }
    expect(lockSwitch().checked).toBe(false);
    expect(isAppLockOn()).toBe(false);
  });

  it('asks the device to unlock before switching off', async () => {
    setAppLockOn(true);
    render(<AppLockCard />);
    expect(lockSwitch().checked).toBe(true);
    fireEvent.click(lockSwitch());
    await waitFor(() => expect(lockSwitch().checked).toBe(false));
    expect(fxAppLock.authenticate).toHaveBeenCalledWith({ reason: 'Turn off app lock' });
    expect(isAppLockOn()).toBe(false);
  });

  it.each([
    ['cancelled', 'App lock is still on. Unlock to switch it off.'],
    ['failed', 'That could not be checked, so app lock is still on.'],
  ])('stays on when the unlock to switch it off is %s', async (result, message) => {
    setAppLockOn(true);
    fxAppLock.authenticate.mockImplementation(async () => ({ result }));
    render(<AppLockCard />);
    fireEvent.click(lockSwitch());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(message);
    expect(lockSwitch().checked).toBe(true);
    expect(isAppLockOn()).toBe(true);
  });

  it('switches off with no prompt once the device can no longer check anyone', async () => {
    setAppLockOn(true);
    fxAppLock.availability.mockImplementation(async () => ({ available: false, biometry: 'none' }));
    render(<AppLockCard />);
    fireEvent.click(lockSwitch());
    await waitFor(() => expect(lockSwitch().checked).toBe(false));
    expect(fxAppLock.authenticate).not.toHaveBeenCalled();
    expect(isAppLockOn()).toBe(false);
  });

  it('follows a change made elsewhere', () => {
    setAppLockOn(true);
    render(<AppLockCard />);
    act(() => {
      setAppLockOn(false);
    });
    expect(lockSwitch().checked).toBe(false);
  });

  it('keeps the setting on this device, and an account switch or a lost session does not clear it', () => {
    expect(SYNC_KEYS).not.toContain(APP_LOCK_KEY);
    // "Clear finance data" is about finance records, not about who may open the app.
    expect(LOCAL_ONLY_KEYS).not.toContain(APP_LOCK_KEY);
    // That list is cleared on an account switch and whenever a session is lost. A link carrying
    // someone else's sign-in tokens causes both, and with the lock in the list it switched the
    // lock off without any unlock.
    expect(ACCOUNT_LOCAL_KEYS).not.toContain(APP_LOCK_KEY);

    setAppLockOn(true);
    clearSyncedLocal();
    expect(isAppLockOn()).toBe(true);
  });

  it('is ended by the sign-out the person asks for, and by the code path that does it', () => {
    setAppLockOn(true);
    clearAppLockOnSignOut();
    expect(isAppLockOn()).toBe(false);

    const auth = readFileSync(resolve(__dirname, '../context/AuthContext.tsx'), 'utf8');
    const from = auth.indexOf('const signOut = async () => {');
    const signOut = auth.slice(from, auth.indexOf('const resendVerification', from));
    expect(from).toBeGreaterThan(-1);
    expect(signOut).toContain('clearAppLockOnSignOut()');
  });
});
