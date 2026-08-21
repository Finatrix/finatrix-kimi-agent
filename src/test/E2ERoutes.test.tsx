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

// Every page renders through the real App without crashing (automated
// equivalent of "open every page"). Each assertion is a stable heading.
const CASES: [string, string | RegExp][] = [
  ['/', 'Real-time calculations'],
  ['/login', 'Welcome back'],
  ['/signup', 'Create your account'],
  // Both titles are correct states of this route, and which one renders depends
  // on the environment rather than on the code being right: with Supabase
  // configured and no recovery session in the URL — a visitor who opens the
  // page directly — it correctly says the link didn't work; without credentials
  // (CI has no .env) it renders the "backend isn't configured" state, which
  // still carries the heading. Asserting only the latter meant this case passed
  // on CI purely because CI has no credentials, and could never have caught a
  // regression in what a real visitor sees. `auth.pages.test.tsx` pins each
  // state deliberately; this file only asks that the route renders.
  ['/reset-password', /Choose a new password|That link didn't work/],
  ['/profile', 'Your profile'],
  ['/privacy', 'Privacy Policy'],
  ['/terms', 'Terms & Conditions'],
  ['/tools/budget', 'The 50/30/20 rule, made effortless.'],
  ['/tools/expenses', 'Your money, tracked and understood.'],
  ['/tools/investmatch', 'A portfolio shaped to you.'],
  ['/tools/parksmart', "Idle money shouldn't idle."],
  ['/tools/peercompare', 'How do you really stack up?'],
  ['/tools/goals', 'Start at the dream. Work backwards.'],
  ['/tools/lifemap', 'Simulate your entire financial life.'],
  ['/tools/reports', 'Your finances, ready to share.'],
  ['/tools/calendar', 'Your money month, at a glance.'],
  ['/tools/settings', 'Settings & personalisation.'],
  ['/this-route-does-not-exist', 'Off the chart'],
];

describe('E2E — every route renders', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  for (const [path, expected] of CASES) {
    it(`renders ${path}`, async () => {
      renderAt(path);
      // Some titles also appear in the breadcrumb (Home › FinatriX › Title),
      // so accept one or more matches — the page rendered without crashing.
      expect((await screen.findAllByText(expected)).length).toBeGreaterThan(0);
    });
  }
});
