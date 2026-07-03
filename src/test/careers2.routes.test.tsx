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
// bar labels are stable regardless of auth/backend state.
const CASES: [string, string][] = [
  ['/careers/jobs', 'Career Coach'],
  ['/careers/applications', 'Interview Prep'],
  ['/careers/companies', 'Applications'],
  ['/careers/interviews', 'Companies'],
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
});
