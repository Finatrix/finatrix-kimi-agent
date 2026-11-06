import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

/**
 * A save that fails must not be the end of it.
 *
 * The shell used to fire one push per edit and give up if it failed: the status
 * went red, nothing retried, and the transaction stayed on that device — which
 * is exactly how a ledger ends up missing rows on the user's other device. The
 * push is retried when the connection returns and when the user comes back to
 * the tab, which is the ordinary shape of "the phone lost signal mid-save".
 */

const h = vi.hoisted(() => {
  const pushSpy = vi.fn(async () => 'error' as 'error' | 'saved');
  return { pushSpy };
});

vi.mock('../context/AuthContext', async (importOriginal) => {
  const real = await importOriginal<typeof import('../context/AuthContext')>();
  return {
    ...real,
    useAuth: () => ({
      user: { id: 'user-a', email: 'a@test.invalid', user_metadata: {} },
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
    getLastUid: () => 'user-a', // same account, so seeding does not clear anything
    setLastUid: vi.fn(),
    loadCloudIntoLocal: vi.fn(async () => 'saved' as const),
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

/** Seed, then make one edit whose push fails. */
async function editWithFailingSave() {
  const { store } = await import('../tools/lib/storage');
  renderShell();
  await act(async () => { await vi.advanceTimersByTimeAsync(10); }); // seeding settles
  h.pushSpy.mockClear();

  await act(async () => {
    store.set('fx_expenses', '[{"id":"t1","amount":10,"category":"food","date":"2026-08-01"}]');
    await vi.advanceTimersByTimeAsync(1000); // past the 700ms debounce
  });
  expect(h.pushSpy).toHaveBeenCalledTimes(1); // …and it failed
}

describe('a save that did not reach the cloud', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    h.pushSpy.mockClear();
    h.pushSpy.mockImplementation(async () => 'error');
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('is retried when the connection comes back', async () => {
    await editWithFailingSave();

    h.pushSpy.mockImplementation(async () => { localStorage.removeItem('fx_sync_pending'); return 'saved'; });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(h.pushSpy).toHaveBeenCalledTimes(2);

    // Once it lands there is nothing outstanding, so coming back online again
    // does not re-send it.
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(h.pushSpy).toHaveBeenCalledTimes(2);
  });

  it('is retried when the user returns to the tab', async () => {
    await editWithFailingSave();

    h.pushSpy.mockImplementation(async () => { localStorage.removeItem('fx_sync_pending'); return 'saved'; });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange')); // jsdom reports 'visible'
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(h.pushSpy).toHaveBeenCalledTimes(2);
  });

  it('does not retry when everything has already been saved', async () => {
    const { store } = await import('../tools/lib/storage');
    h.pushSpy.mockImplementation(async () => { localStorage.removeItem('fx_sync_pending'); return 'saved'; });
    renderShell();
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    h.pushSpy.mockClear();

    await act(async () => {
      store.set('fx_currency', 'GBP');
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(h.pushSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(h.pushSpy).toHaveBeenCalledTimes(1);
  });
});
