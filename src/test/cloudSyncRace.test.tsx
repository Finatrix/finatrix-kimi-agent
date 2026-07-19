import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

/**
 * Account-switch cloud-sync race (QA pass 2 fix).
 *
 * Seeding for an account switch runs: clearSyncedLocal() → loadCloudIntoLocal()
 * → pushLocalToCloud(). clearSyncedLocal notifies via fx:write so mounted
 * providers refresh — but those events must NOT schedule the debounced push:
 * if one fired while the (slow) cloud load was still in flight, it would
 * upsert an EMPTY blob over the incoming account's cloud row (data loss).
 *
 * This test signs in as user-b with user-a recorded as the last uid, makes the
 * cloud load hang, advances well past the 700ms debounce, and asserts the only
 * push is the seeding flow's own explicit one — after the load resolves.
 */

const h = vi.hoisted(() => {
  const state: { resolveLoad?: (s: 'saved') => void } = {};
  const pushSpy = vi.fn(async () => 'saved' as const);
  return { state, pushSpy };
});

vi.mock('../context/AuthContext', async (importOriginal) => {
  const real = await importOriginal<typeof import('../context/AuthContext')>();
  return {
    ...real,
    useAuth: () => ({
      user: { id: 'user-b', email: 'b@test.invalid', user_metadata: {} },
      session: null,
      loading: false,
      configured: true,
      signUp: vi.fn(), signIn: vi.fn(), signInWithProvider: vi.fn(),
      signOut: vi.fn(), resendVerification: vi.fn(), resetPassword: vi.fn(),
    }),
  };
});

vi.mock('../tools/cloudSync', async (importOriginal) => {
  const real = await importOriginal<typeof import('../tools/cloudSync')>();
  return {
    ...real,
    // Real clearSyncedLocal (store.remove → fx:write events — the race trigger).
    getLastUid: () => 'user-a', // ≠ current uid → account-switch path
    setLastUid: vi.fn(),
    loadCloudIntoLocal: vi.fn(
      () => new Promise<'saved'>((res) => { h.state.resolveLoad = res; })
    ),
    pushLocalToCloud: h.pushSpy,
  };
});

import ToolsLayout from '../tools/ToolsLayout';

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/tools/budget']}>
      <Routes>
        <Route path="/tools" element={<ToolsLayout />}>
          <Route path=":toolId" element={<div>outlet</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('cloud sync — account-switch seeding race', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    // user-a's data is on the device when user-b signs in.
    localStorage.setItem('fx_expenses', JSON.stringify([{ id: 'a1', amount: 1, category: 'rent', date: '2026-07-01' }]));
    h.pushSpy.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('never pushes while the cloud load is in flight, then pushes exactly once', async () => {
    renderShell();

    // Let the seeding effect start: clearSyncedLocal has fired its fx:write
    // events by now. Advance far past the 700ms push debounce while the cloud
    // load is still pending.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(h.pushSpy).not.toHaveBeenCalled();

    // Cloud load completes → the seeding flow's own explicit push runs.
    await act(async () => {
      h.state.resolveLoad?.("saved");
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(h.pushSpy).toHaveBeenCalledTimes(1);
    expect(h.pushSpy).toHaveBeenCalledWith('user-b');

    // And ordinary writes AFTER seeding still schedule the debounced push.
    const { store } = await import('../tools/lib/storage');
    await act(async () => {
      store.set('fx_expenses', '[]');
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(h.pushSpy).toHaveBeenCalledTimes(2);
  });
});
