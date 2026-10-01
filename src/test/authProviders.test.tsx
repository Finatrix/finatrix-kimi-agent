/**
 * Which third-party sign-in buttons appear, where, and in what order.
 *
 * This is an App Review gate rather than a preference. Guideline 4.8 requires an
 * app offering a social login for its primary account to also offer one that
 * lets the user keep their email address private; Google does not, so on iOS the
 * Apple button is a condition of being on the store. An iOS build that shipped
 * without it would be rejected — after the upload, by a human, days later — so
 * the rule is pinned here instead.
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

const h = vi.hoisted(() => ({
  auth: {} as Record<string, unknown>,
  signInWithProvider: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => h.auth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../lib/analytics', () => ({ track: vi.fn(), trackPageView: vi.fn() }));

import Login from '../pages/Login';
import Signup from '../pages/Signup';
import { authProviders, appleConfigured, PROVIDER_LABEL } from '../lib/authProviders';

type CapWindow = Window & {
  Capacitor?: { isNativePlatform: () => boolean; getPlatform: () => string };
};

const asApp = (platform: 'android' | 'ios') => {
  (window as CapWindow).Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => platform,
  };
};

const withAppleFlag = (on: boolean) => {
  vi.stubEnv('VITE_AUTH_APPLE', on ? '1' : '');
};

beforeEach(() => {
  h.signInWithProvider.mockReset().mockResolvedValue({ error: null });
  h.auth = {
    user: null,
    session: null,
    loading: false,
    configured: true,
    callbackError: null,
    recovery: false,
    signUp: vi.fn(),
    signIn: vi.fn(),
    signInWithProvider: h.signInWithProvider,
    signOut: vi.fn(),
    resendVerification: vi.fn(),
    resetPassword: vi.fn(),
    updatePassword: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  delete (window as CapWindow).Capacitor;
  vi.unstubAllEnvs();
});

/** Signup gates its buttons on the terms checkbox; Login has none. */
const acceptTerms = () => {
  for (const box of screen.queryAllByRole('checkbox')) {
    if (!(box as HTMLInputElement).checked) fireEvent.click(box);
  }
};

const renderPage = (element: React.ReactElement, entry = '/login') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/login" element={element} />
        <Route path="/signup" element={element} />
        <Route path="/tools" element={<p>TOOLS</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('which providers a build offers', () => {
  it('is Google alone on the website until Apple is configured', () => {
    withAppleFlag(false);
    expect(appleConfigured()).toBe(false);
    expect(authProviders()).toEqual(['google']);
  });

  it('adds Apple to the website once the provider is configured', () => {
    withAppleFlag(true);
    expect(authProviders()).toEqual(['google', 'apple']);
  });

  /**
   * Guideline 4.8: Google may only appear on iOS alongside Apple. And the Apple
   * button must not appear before the provider works ("Unsupported provider").
   * Both hold only if iOS offers no third-party login until Apple is configured.
   */
  it('offers no third-party login on iOS until Apple is configured', () => {
    withAppleFlag(false);
    asApp('ios');
    expect(authProviders()).toEqual([]);
  });

  it('offers Google on iOS only together with Apple', () => {
    withAppleFlag(true);
    asApp('ios');
    expect(authProviders()).toEqual(['apple', 'google']);
  });

  it('puts Apple first on iOS, and Google first everywhere else', () => {
    withAppleFlag(true);
    asApp('ios');
    expect(authProviders()[0]).toBe('apple');
    asApp('android');
    expect(authProviders()[0]).toBe('google');
  });

  it('does not force Apple on Android — Play has no equivalent rule', () => {
    withAppleFlag(false);
    asApp('android');
    expect(authProviders()).toEqual(['google']);
  });
});

describe.each([
  ['Login', () => <Login />, '/login'],
  ['Signup', () => <Signup />, '/signup'],
])('%s page', (_name, element, entry) => {
  it('renders a button for each provider, labelled the way Apple asks', () => {
    withAppleFlag(true);
    asApp('ios');
    renderPage(element(), entry);
    for (const provider of authProviders()) {
      expect(screen.getByRole('button', { name: PROVIDER_LABEL[provider] })).toBeInTheDocument();
    }
  });

  it('gives Apple the same prominence as Google, not a lesser control', () => {
    withAppleFlag(true);
    asApp('ios');
    renderPage(element(), entry);
    const apple = screen.getByRole('button', { name: PROVIDER_LABEL.apple });
    const google = screen.getByRole('button', { name: PROVIDER_LABEL.google });
    // Same component, so the same classes: 4.8 asks for an equivalent option,
    // and a visually demoted button is the usual way apps fail it.
    expect(apple.className).toBe(google.className);
    expect(apple.tagName).toBe(google.tagName);
  });

  it('starts the sign-in for the provider that was pressed', () => {
    withAppleFlag(true);
    renderPage(element(), entry);
    // A fresh render per provider, because pressing one puts the form in its
    // busy state and disables the other — which is the behaviour we want, and
    // would otherwise make the second half of this test silently assert nothing.
    //
    // Only the provider argument is asserted: Login passes a post-sign-in
    // destination and Signup does not, and that difference is not this test's.
    for (const provider of ['apple', 'google'] as const) {
      cleanup();
      h.signInWithProvider.mockClear();
      renderPage(element(), entry);
      acceptTerms();
      fireEvent.click(screen.getByRole('button', { name: PROVIDER_LABEL[provider] }));
      expect(h.signInWithProvider.mock.calls[0]?.[0], provider).toBe(provider);
    }
  });

  it('disables every provider button while one sign-in is in flight', () => {
    withAppleFlag(true);
    renderPage(element(), entry);
    acceptTerms();
    fireEvent.click(screen.getByRole('button', { name: PROVIDER_LABEL.apple }));
    for (const provider of ['apple', 'google'] as const) {
      expect(screen.getByRole('button', { name: PROVIDER_LABEL[provider] }), provider)
        .toBeDisabled();
    }
  });

  it('offers only email on iOS before Apple is configured — no dead button, no orphan divider', () => {
    withAppleFlag(false);
    asApp('ios');
    renderPage(element(), entry);
    expect(screen.queryByRole('button', { name: PROVIDER_LABEL.apple })).toBeNull();
    expect(screen.queryByRole('button', { name: PROVIDER_LABEL.google })).toBeNull();
    expect(screen.queryByText(/^or sign (in|up) with/i)).toBeNull();
  });

  it('shows no Apple button on the website while the provider is unconfigured', () => {
    withAppleFlag(false);
    renderPage(element(), entry);
    expect(screen.queryByRole('button', { name: PROVIDER_LABEL.apple })).toBeNull();
    expect(screen.getByRole('button', { name: PROVIDER_LABEL.google })).toBeInTheDocument();
  });
});
