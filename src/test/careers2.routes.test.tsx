import { describe, it, expect, beforeEach, vi } from 'vitest';
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

// The Careers areas render through the real App (lazy chunks included). The
// area names in the rail are stable regardless of auth/backend state.
const CASES: [string, string][] = [
  ['/careers/jobs', 'Interviews'],
  ['/careers/applications', 'Resume'],
  ['/careers/companies', 'Applications'],
  ['/careers/interviews', 'Jobs'],
  ['/careers/coach', 'Resume'],
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

  it('sends the old upload address to the Resume area', async () => {
    renderAt('/careers/upload');
    expect((await screen.findAllByRole('link', { name: 'Resume', current: 'page' })).length).toBeGreaterThan(0);
  });

  // Former pages are now tabs of an area; their old addresses must still land
  // inside Careers (bookmarks, emails, stored notification links).
  const HIDDEN_ROUTES = ['/careers/companies', '/careers/tasks', '/careers/recruiters', '/careers/network', '/careers/assessments', '/careers/offers', '/careers/knowledge', '/careers/billing'];
  for (const path of HIDDEN_ROUTES) {
    it(`keeps the hidden route ${path} alive`, async () => {
      renderAt(path);
      expect((await screen.findAllByText('Applications')).length).toBeGreaterThan(0);
    });
  }
});

describe('per-route document titles', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it('sets a route-specific title on careers sub-pages', async () => {
    renderAt('/careers/jobs');
    await screen.findAllByText('Interviews');
    expect(document.title).toBe('Jobs — FinatriX Careers');
  });

  it('offers a skip-to-content link targeting #main', async () => {
    renderAt('/careers/jobs');
    await screen.findAllByText('Interviews');
    const skip = screen.getByText('Skip to content') as HTMLAnchorElement;
    expect(skip.getAttribute('href')).toBe('#main');
    expect(document.getElementById('main')).not.toBeNull();
  });
});

// Preserve coverage of the workspace for the explicitly enabled launch state.
vi.mock('../shared/careersAvailability', async (original) => ({
  ...await original<typeof import('../shared/careersAvailability')>(), CAREERS_AVAILABLE: true,
}));
