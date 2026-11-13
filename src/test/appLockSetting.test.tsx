/**
 * The App lock switch in Settings, and where its setting is allowed to live:
 * on this device only, cleared with the account.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fxAppLock, platform } = vi.hoisted(() => ({
  platform: { native: true },
  fxAppLock: {
    availability: vi.fn(async (): Promise<{ available: boolean; biometry: string }> => ({ available: true, biometry: 'face' })),
    authenticate: vi.fn(async (options: { reason: string }): Promise<{ result: string }> => ({ result: options.reason ? 'ok' : 'failed' })),
    setCover: vi.fn(async () => {}),
  },
}));

vi.mock('@capacitor/core', () => ({ registerPlugin: () => fxAppLock }));
vi.mock('../native/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../native/platform')>()),
  isNativeApp: () => platform.native,
}));

import { APP_LOCK_KEY, isAppLockOn, setAppLockOn } from '../native/appLock/setting';
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

  it('switches off without asking', () => {
    setAppLockOn(true);
    render(<AppLockCard />);
    expect(lockSwitch().checked).toBe(true);
    fireEvent.click(lockSwitch());
    expect(lockSwitch().checked).toBe(false);
    expect(isAppLockOn()).toBe(false);
    expect(fxAppLock.authenticate).not.toHaveBeenCalled();
  });

  it('follows a change made elsewhere', () => {
    setAppLockOn(true);
    render(<AppLockCard />);
    act(() => setAppLockOn(false));
    expect(lockSwitch().checked).toBe(false);
  });

  it('keeps the setting on this device, and clears it with the account', () => {
    expect(SYNC_KEYS).not.toContain(APP_LOCK_KEY);
    // "Clear finance data" is about finance records, not about who may open the app.
    expect(LOCAL_ONLY_KEYS).not.toContain(APP_LOCK_KEY);
    expect(ACCOUNT_LOCAL_KEYS).toContain(APP_LOCK_KEY);

    setAppLockOn(true);
    clearSyncedLocal();
    expect(isAppLockOn()).toBe(false);
  });
});
