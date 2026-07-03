import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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

// Every Careers route renders through the real App (lazy chunks included)
// without crashing. The Careers tab bar labels are stable regardless of
// auth/backend state, so they make reliable smoke assertions.
const CASES: [string, string | RegExp][] = [
  ['/careers', 'Resume Library'],
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
    renderAt('/careers');
    // Whichever applies in this environment: either the sign-in gate or the
    // backend-not-configured card — both are premium gate states, not errors.
    const gate = await screen.findByText(/Sign in to use Careers|Backend not configured/);
    expect(gate).toBeInTheDocument();
  });

  it('includes Careers in the landing navigation', async () => {
    renderAt('/');
    expect((await screen.findAllByText('Careers')).length).toBeGreaterThan(0);
  });
});
