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

// Phase 2 routes render through the real App (lazy chunks included). The tab
// bar labels are stable regardless of auth/backend state. Companies moved off
// the primary nav (2026-07-04 UX simplification) but the route itself still
// renders — see the "hidden" cases below.
const CASES: [string, string][] = [
  ['/careers/jobs', 'Career Coach'],
  ['/careers/applications', 'Interview Prep'],
  ['/careers/companies', 'Applications'],
  ['/careers/interviews', 'Job Search'],
  ['/careers/coach', 'Resume Library'],
];

describe('Phase 2 routes render', () => {
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

  it('keeps the hidden upload/profile routes alive', async () => {
    renderAt('/careers/upload');
    expect((await screen.findAllByText('Upload')).length).toBeGreaterThan(0);
  });

  // These sections were removed from the primary tab bar but must still be
  // fully routable — "hidden" means decluttered, never removed.
  const HIDDEN_ROUTES = ['/careers/companies', '/careers/tasks', '/careers/recruiters', '/careers/network', '/careers/assessments', '/careers/offers', '/careers/knowledge', '/careers/billing'];
  for (const path of HIDDEN_ROUTES) {
    it(`keeps the hidden route ${path} alive`, async () => {
      renderAt(path);
      expect((await screen.findAllByText('Applications')).length).toBeGreaterThan(0);
    });
  }
});
