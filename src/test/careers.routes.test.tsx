import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from '../context/AuthContext';
import App from '../App';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
}

// Every Careers WORKSPACE route renders through the real App (lazy chunks
// included) without crashing. The Careers tab bar labels are stable regardless
// of auth/backend state, so they make reliable smoke assertions.
//
// `/careers` is deliberately absent: it is no longer the workspace. It renders
// the public marketing landing page, which is covered by
// `marketingRoutes.test.tsx` — and the whole point of that change is that it
// does NOT render a tab bar or hit an auth gate.
const CASES: [string, string | RegExp][] = [
  ['/careers/dashboard', 'Resume Library'],
  ['/careers/upload', 'Career Coach'],
  ['/careers/resumes', 'Career Coach'],
  ['/careers/profile', 'Dashboard'],
  ['/careers/settings', 'Dashboard'],
];

describe('Careers routes render', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  for (const [path, expected] of CASES) {
    it(`renders ${path}`, async () => {
      renderAt(path);
      expect((await screen.findAllByText(expected)).length).toBeGreaterThan(0);
    });
  }

  it('shows the auth/setup gate instead of crashing when signed out', async () => {
    renderAt('/careers/dashboard');
    // Whichever applies in this environment: either the sign-in gate or the
    // backend-not-configured card — both are premium gate states, not errors.
    const gate = await screen.findByText(/Sign in to use Careers|Backend not configured/);
    expect(gate).toBeInTheDocument();
  });

  /**
   * ⌘K reaches the Careers shell too. A shortcut that works on one half of a
   * product is worse than no shortcut: it teaches a reflex that then fails.
   */
  it('opens the command palette on the shortcut, and on its visible trigger', async () => {
    renderAt('/careers/dashboard');
    const trigger = await screen.findByRole('button', { name: 'Search tools, guides and actions' });

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
  });

  it('includes Careers in the landing navigation', async () => {
    renderAt('/');
    expect((await screen.findAllByText('Careers')).length).toBeGreaterThan(0);
  });
});
