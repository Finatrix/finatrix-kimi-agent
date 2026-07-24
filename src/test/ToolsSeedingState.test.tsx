import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

/**
 * Audit regression guard (P2): after the global loader disappeared, the
 * signed-in shell rendered its header over an empty box for as long as the
 * cloud seed took — a blank-content phase that reads as a broken page. The gap
 * now shows a labelled skeleton, and the seed's write-back no longer sits in
 * front of the first paint.
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
    getLastUid: () => null, // first run on this device → the seed also pushes
    setLastUid: vi.fn(),
    loadCloudIntoLocal: vi.fn(
      () => new Promise<'saved'>((res) => { h.state.resolveLoad = res; })
    ),
    // Never settles: proves the first paint does not wait on the write-back.
    pushLocalToCloud: vi.fn(() => new Promise<'saved'>(() => {})),
  };
});

import ToolsLayout from '../tools/ToolsLayout';

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/tools/budget']}>
      <Routes>
        <Route path="/tools" element={<ToolsLayout />}>
          <Route path=":toolId" element={<div>tool-outlet-content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('Tools shell — the window before cloud data lands', () => {
  beforeEach(() => {
    localStorage.clear();
    h.pushSpy.mockClear();
  });
  afterEach(cleanup);

  it('shows a labelled placeholder instead of a blank content area', async () => {
    renderShell();

    // Content is not there yet…
    expect(screen.queryByText('tool-outlet-content')).toBeNull();
    // …but the area is not blank, and its purpose is announced.
    const placeholder = screen.getByRole('status', { name: 'Loading your data' });
    expect(placeholder).toBeInTheDocument();
    expect(placeholder.querySelectorAll('.skel').length).toBeGreaterThan(4);
  });

  it('paints the tool as soon as the cloud read lands, without awaiting the write-back', async () => {
    renderShell();

    await act(async () => {
      h.state.resolveLoad?.('saved');
    });

    // The push is still in flight (its promise never settles) — the tool is
    // on screen anyway, and the placeholder is gone.
    expect(await screen.findByText('tool-outlet-content')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading your data' })).toBeNull();
  });
});
