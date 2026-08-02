import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from '../context/AuthContext';

/**
 * CareersPaywallGate — the entry gate that shows CareersProPaywall to
 * signed-in users without a paid Careers plan. Covers every state in the
 * feature's user-flow spec: logged-out, logged-in unsubscribed, active
 * subscriber, admin, and the Stripe-return exemption. Not a re-test of
 * BillingPage's own data loading (careers.routes.test.tsx / careers2.routes
 * already cover unauthenticated route rendering) — this file is specifically
 * about which screen the gate chooses.
 */

const h = vi.hoisted(() => ({
  subscription: null as null | { plan_id: string; status: string },
  isAdmin: false,
  user: { id: 'user-1', email: 'test@finatrix.invalid', user_metadata: {} } as { id: string; email: string; user_metadata: object } | null,
}));

vi.mock('../context/AuthContext', async (importOriginal) => {
  const real = await importOriginal<typeof import('../context/AuthContext')>();
  return {
    ...real,
    useAuth: () => ({
      user: h.user,
      session: null,
      loading: false,
      configured: true,
      signUp: vi.fn(), signIn: vi.fn(), signInWithProvider: vi.fn(),
      signOut: vi.fn(), resendVerification: vi.fn(), resetPassword: vi.fn(),
    }),
  };
});

vi.mock('../careers/hooks/useRole', () => ({
  useRole: () => ({ role: h.isAdmin ? 'admin' : 'user', isAdmin: h.isAdmin, loading: false }),
}));

vi.mock('../careers/services/subscriptions', async (importOriginal) => {
  const real = await importOriginal<typeof import('../careers/services/subscriptions')>();
  return {
    ...real,
    getMySubscription: async () => h.subscription,
  };
});

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

describe('Careers Pro paywall gate', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
    h.subscription = null;
    h.isAdmin = false;
    h.user = { id: 'user-1', email: 'test@finatrix.invalid', user_metadata: {} };
  });

  it('logged-in, unsubscribed (Free): shows the Careers Pro paywall, not the requested page', async () => {
    h.subscription = { plan_id: 'free', status: 'active' };
    renderAt('/careers/jobs');
    expect((await screen.findAllByText('Unlock FinatriX Careers Pro')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Maybe later')).toBeTruthy();

    // A paywall whose only exits are "pay" or "leave" loses everyone who wanted
    // to read more first — which, until the public pages existed, was the only
    // thing it could offer. Both routes out must now lead somewhere that
    // explains the product and its billing.
    expect(screen.getByRole('link', { name: /compare plans/i })).toHaveAttribute('href', '/pricing');
    expect(screen.getByRole('link', { name: /what is careers/i })).toHaveAttribute('href', '/careers');
    expect(screen.getByRole('link', { name: /refund policy/i })).toHaveAttribute('href', '/refunds');
  });

  it('logged-in, no subscription row at all: shows the paywall (fails closed)', async () => {
    h.subscription = null;
    renderAt('/careers/applications');
    expect((await screen.findAllByText('Unlock FinatriX Careers Pro')).length).toBeGreaterThan(0);
  });

  it('active paid subscriber: goes straight into Careers, never sees the paywall', async () => {
    h.subscription = { plan_id: 'professional', status: 'active' };
    renderAt('/careers/jobs');
    expect((await screen.findAllByText('Job Search')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Unlock FinatriX Careers Pro')).toBeNull();
  });

  it('admin: bypasses the paywall regardless of their own plan', async () => {
    h.isAdmin = true;
    h.subscription = { plan_id: 'free', status: 'active' };
    renderAt('/careers/jobs');
    expect((await screen.findAllByText('Job Search')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Unlock FinatriX Careers Pro')).toBeNull();
  });

  it('Stripe return trip (?checkout=) is exempt so the payment-confirmation page always renders', async () => {
    h.subscription = { plan_id: 'free', status: 'active' }; // webhook hasn't landed yet — must not matter
    renderAt('/careers/billing?checkout=success');
    expect(screen.queryByText('Unlock FinatriX Careers Pro')).toBeNull();
  });

  it('logged-out user: unchanged existing behavior — sign-in gate, not the paywall', async () => {
    h.user = null;
    renderAt('/careers/jobs');
    expect((await screen.findAllByText('Sign in to use Careers')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Unlock FinatriX Careers Pro')).toBeNull();
  });
});
