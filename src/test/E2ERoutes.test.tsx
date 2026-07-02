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
  ['/profile', 'Your profile'],
  ['/privacy', 'Privacy Policy'],
  ['/terms', 'Terms & Conditions'],
  ['/tools/budget', 'The 50/30/20 rule, made effortless.'],
  ['/tools/expenses', 'Track every rupee. Privately.'],
  ['/tools/investmatch', 'A portfolio shaped to you.'],
  ['/tools/parksmart', "Idle money shouldn't idle."],
  ['/tools/peercompare', 'How do you really stack up?'],
  ['/tools/goals', 'Start at the dream. Work backwards.'],
  ['/tools/lifemap', 'Simulate your entire financial life.'],
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
      expect(await screen.findByText(expected)).toBeInTheDocument();
    });
  }
});
