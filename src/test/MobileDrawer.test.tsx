import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { AuthProvider } from '../context/AuthContext';
import ToolsLayout from '../tools/ToolsLayout';

/**
 * Audit regression guard (P1): the closed off-canvas drawer used to stay in
 * both the focus order and the accessibility tree. It is only hidden with
 * `opacity-0` + `pointer-events-none`, so keyboard users could tab through
 * ~18 invisible links and screen readers announced a navigation landmark that
 * was not on screen. `inert` + `aria-hidden` remove it until it is opened.
 *
 * Rendered against the shell directly rather than through <App />: the drawer
 * is shell state, and going through App's lazy routes makes the assertions
 * race the route chunk instead of testing the drawer.
 */

async function renderShell() {
  const view = render(
    <MemoryRouter initialEntries={['/tools/expenses']}>
      <AuthProvider>
        <Routes>
          <Route path="/tools" element={<ToolsLayout />}>
            <Route path=":toolId" element={<div>tool</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
  await act(async () => { await Promise.resolve(); });
  return view;
}

/**
 * The drawer's overlay container — the element that owns inert/aria-hidden.
 * Looked up by id (not by role) precisely because a correctly hidden drawer
 * has no role to query.
 */
function drawerShell(): HTMLElement {
  const el = document.getElementById('fx-tools-drawer');
  if (!el) throw new Error('drawer container was not rendered');
  return el;
}

function moreButton(): HTMLElement {
  const bar = screen.getByRole('navigation', { name: 'Primary' });
  return within(bar).getByRole('button', { name: /More tools and menu/i });
}

describe('Mobile navigation drawer — hidden means hidden', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(cleanup);

  it('keeps the closed drawer out of the focus order and the a11y tree', async () => {
    await renderShell();

    const shell = drawerShell();
    expect(shell).toHaveAttribute('inert');
    expect(shell).toHaveAttribute('aria-hidden', 'true');

    // The links still exist in the DOM (the drawer animates in and out) …
    expect(shell.querySelectorAll('a,button').length).toBeGreaterThan(10);
    // … but nothing inside is exposed: the landmark itself is gone from the
    // accessibility tree, so no descendant can be reached through it.
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close menu' })).toBeNull();
  });

  it('exposes the drawer once it is opened, and reports state on its trigger', async () => {
    await renderShell();
    const more = moreButton();

    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(more).toHaveAttribute('aria-controls', 'fx-tools-drawer');

    fireEvent.click(more);

    const shell = drawerShell();
    expect(shell).not.toHaveAttribute('inert');
    expect(shell).not.toHaveAttribute('aria-hidden');
    expect(more).toHaveAttribute('aria-expanded', 'true');

    // Now reachable, and focus has moved into the drawer.
    const drawer = screen.getByRole('navigation', { name: 'Main' });
    const close = within(drawer).getByRole('button', { name: 'Close menu' });
    expect(close).toHaveFocus();
  });

  it('closes on Escape and hands focus back to whatever opened it', async () => {
    await renderShell();
    const more = moreButton();

    more.focus();
    fireEvent.click(more);
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(drawerShell()).toHaveAttribute('inert');
    expect(more).toHaveFocus();
  });

  it('closes when a destination inside it is chosen', async () => {
    await renderShell();
    fireEvent.click(moreButton());

    const drawer = screen.getByRole('navigation', { name: 'Main' });
    fireEvent.click(within(drawer).getByRole('link', { name: 'Reports' }));

    expect(drawerShell()).toHaveAttribute('inert');
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
  });
});
