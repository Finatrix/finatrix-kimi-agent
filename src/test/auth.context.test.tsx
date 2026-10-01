import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { render, renderHook, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react';

/**
 * `AuthProvider` — session restore and error translation.
 *
 * The provider is exercised against a mocked `../lib/supabase` rather than a
 * mocked `useAuth`, because the behaviour under test IS the provider: what it
 * does when the auth chunk cannot be fetched, and what it turns a GoTrue error
 * into. Mocking the hook would assert nothing but the test's own fixture.
 */

const h = vi.hoisted(() => ({
  /** Make the dynamic `import('../lib/supabase')` reject, as a failed chunk fetch does. */
  failImport: false,
  getSession: vi.fn(),
  signInWithPassword: vi.fn(),
  resend: vi.fn(),
  signUp: vi.fn(),
  signInWithOAuth: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  setSession: vi.fn(),
  openAuthBrowser: vi.fn(),
  registerAppleToken: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('../lib/supabaseConfig', () => ({
  isSupabaseConfigured: true,
  supabaseConfigError: '',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  PLACEHOLDER_URL: 'https://placeholder.supabase.co',
  PLACEHOLDER_KEY: 'public-anon-placeholder-key',
}));

vi.mock('../lib/supabase', () => {
  if (h.failImport) throw new Error('Failed to fetch dynamically imported module');
  return {
    isSupabaseConfigured: true,
    supabaseConfigError: '',
    supabase: {
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: h.unsubscribe } } }),
        getSession: h.getSession,
        signInWithPassword: h.signInWithPassword,
        resend: h.resend,
        signUp: h.signUp,
        signInWithOAuth: h.signInWithOAuth,
        resetPasswordForEmail: h.resetPasswordForEmail,
        updateUser: h.updateUser,
        setSession: h.setSession,
      },
    },
  };
});

vi.mock('../native/bridge', () => ({ openAuthBrowser: h.openAuthBrowser }));
vi.mock('../lib/appleToken', () => ({ registerAppleToken: h.registerAppleToken }));

vi.mock('../lib/analytics', () => ({ track: vi.fn(), trackPageView: vi.fn() }));

type AuthModule = typeof import('../context/AuthContext');

/** Renders the provider's state as text, so a stuck `loading` is observable. */
function makeProbe(useAuth: AuthModule['useAuth']) {
  return function Probe() {
    const { loading, user } = useAuth();
    return <p data-testid="state">{loading ? 'loading' : user ? `user:${user.id}` : 'anon'}</p>;
  };
}

async function loadProvider(): Promise<AuthModule> {
  // Fresh module registry per test: the provider memoises the client import on
  // its promise, and a rejected promise would otherwise leak into the next test.
  vi.resetModules();
  return import('../context/AuthContext');
}

beforeEach(() => {
  h.failImport = false;
  h.getSession.mockReset().mockResolvedValue({ data: { session: null } });
  h.signInWithPassword.mockReset().mockResolvedValue({ error: null });
  h.resend.mockReset().mockResolvedValue({ error: null });
  h.signUp.mockReset().mockResolvedValue({ data: { session: null }, error: null });
  h.signInWithOAuth.mockReset().mockResolvedValue({ error: null });
  h.resetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
  h.updateUser.mockReset().mockResolvedValue({ error: null });
  h.setSession.mockReset().mockResolvedValue({ error: null });
  h.openAuthBrowser.mockReset().mockResolvedValue(undefined);
  h.registerAppleToken.mockReset().mockResolvedValue(undefined);
  localStorage.clear();
});

describe('AuthProvider — rejected requests', () => {
  const actions = {
    signUp: (auth: ReturnType<AuthModule['useAuth']>) => auth.signUp('a@test.invalid', 'password', 'A'),
    signInWithPassword: (auth: ReturnType<AuthModule['useAuth']>) => auth.signIn('a@test.invalid', 'password'),
    signInWithOAuth: (auth: ReturnType<AuthModule['useAuth']>) => auth.signInWithProvider('google'),
    resend: (auth: ReturnType<AuthModule['useAuth']>) => auth.resendVerification('a@test.invalid'),
    resetPasswordForEmail: (auth: ReturnType<AuthModule['useAuth']>) => auth.resetPassword('a@test.invalid'),
    updateUser: (auth: ReturnType<AuthModule['useAuth']>) => auth.updatePassword('password'),
  };

  it.each(Object.keys(actions) as Array<keyof typeof actions>)('returns a recoverable error when %s rejects', async (method) => {
    h[method].mockRejectedValue(new Error('Connection lost'));
    const { AuthProvider, useAuth } = await loadProvider();
    const { result: auth } = renderHook(useAuth, { wrapper: AuthProvider });
    await act(async () => {
      const result = await actions[method](auth.current);
      expect(result.error).toContain('Check your connection and try again');
      if (method === 'signUp') expect(result).toHaveProperty('needsConfirmation', false);
    });
  });
});
afterEach(cleanup);

describe('AuthProvider — restoring a session', () => {
  it('resolves to signed-out rather than loading forever when the auth chunk fails to load', async () => {
    // The marker is what makes the provider decide there IS something to
    // restore, so it starts in `loading` and commits to fetching the client.
    localStorage.setItem('fx_has_session', '1');
    h.failImport = true;

    const { AuthProvider, useAuth } = await loadProvider();
    const Probe = makeProbe(useAuth);
    render(<AuthProvider><Probe /></AuthProvider>);

    expect(screen.getByTestId('state')).toHaveTextContent('loading');

    // Without the `finally` in the restore effect this never settles, and every
    // screen that gates on `loading` — the tools shell, the careers workspace —
    // spins on a blank page for exactly the people who have an account.
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('anon'));
  });

  it('restores an existing session', async () => {
    localStorage.setItem('fx_has_session', '1');
    h.getSession.mockResolvedValue({
      data: { session: { user: { id: 'u1', email: 'a@test.invalid' } } },
    });

    const { AuthProvider, useAuth } = await loadProvider();
    const Probe = makeProbe(useAuth);
    render(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('user:u1'));
  });

  it('never fetches the auth stack for a device that has no session', async () => {
    const { AuthProvider, useAuth } = await loadProvider();
    const Probe = makeProbe(useAuth);
    render(<AuthProvider><Probe /></AuthProvider>);

    // Decided at first render — no loading flash, and no 54 KB download for an
    // anonymous visitor to the landing page.
    expect(screen.getByTestId('state')).toHaveTextContent('anon');
    expect(h.getSession).not.toHaveBeenCalled();
  });
});

describe('AuthProvider — error messages', () => {
  /** Signs in on click and renders whatever `signIn` reported. */
  function makeSignInProbe(useAuth: AuthModule['useAuth']) {
    return function SignInProbe() {
      const { signIn } = useAuth();
      const [msg, setMsg] = useState('');
      return (
        <>
          <button
            onClick={async () => {
              const { error } = await signIn('a@test.invalid', 'pw');
              setMsg(error ?? 'no-error');
            }}
          >
            go
          </button>
          <p data-testid="msg">{msg}</p>
        </>
      );
    };
  }

  /** The user-visible string produced for a given GoTrue error on sign-in. */
  async function signInReporting(error: unknown): Promise<string> {
    h.signInWithPassword.mockResolvedValue({ error });
    const { AuthProvider, useAuth } = await loadProvider();
    const Probe = makeSignInProbe(useAuth);
    render(<AuthProvider><Probe /></AuthProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    await waitFor(() => expect(screen.getByTestId('msg')).not.toBeEmptyDOMElement());
    return screen.getByTestId('msg').textContent ?? '';
  }

  it('points an unconfirmed account at the Resend button instead of restating the error', async () => {
    const msg = await signInReporting({ code: 'email_not_confirmed', message: 'Email not confirmed' });
    expect(msg).toContain('Resend verification');
  });

  it('tells someone with a bad password that it is the password', async () => {
    const msg = await signInReporting({ code: 'invalid_credentials', message: 'Invalid login credentials' });
    expect(msg).toContain('do not match an account');
  });

  it('describes a rate limit as something waiting fixes', async () => {
    const msg = await signInReporting({ status: 429, message: 'Request rate limit reached' });
    expect(msg).toContain('wait a minute');
  });

  /**
   * The regression this pins. A 500 from `signInWithPassword` used to be
   * translated into "we couldn't send your confirmation email" — a sentence
   * about an email nobody had asked for, sending the user to search a spam
   * folder while the real fault went undescribed.
   */
  it('does not blame a sign-in failure on an email it never tried to send', async () => {
    const msg = await signInReporting({ status: 500, message: '' });
    expect(msg).not.toMatch(/email/i);
    expect(msg).toContain('Something went wrong on our side');
  });

  /**
   * The same 500 on an operation that really is sending an email keeps the
   * SMTP-shaped guidance — that is the case the translation was written for,
   * and scoping it must not throw it away.
   */
  it('still explains a mail-transport failure on an operation that sends mail', async () => {
    h.resend.mockResolvedValue({ error: { status: 500, message: '' } });
    const { AuthProvider, useAuth } = await loadProvider();
    function ResendProbe() {
      const { resendVerification } = useAuth();
      const [msg, setMsg] = useState('');
      return (
        <>
          <button onClick={async () => setMsg((await resendVerification('a@test.invalid')).error ?? '')}>
            go
          </button>
          <p data-testid="msg">{msg}</p>
        </>
      );
    }
    render(<AuthProvider><ResendProbe /></AuthProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    await waitFor(() => expect(screen.getByTestId('msg')).not.toBeEmptyDOMElement());
    expect(screen.getByTestId('msg')).toHaveTextContent('couldn’t send that email');
  });

  it('never surfaces a garbled error object to the user', async () => {
    const msg = await signInReporting({ message: '{}' });
    expect(msg).toBe('Could not sign in. Please try again.');
  });
});

/**
 * Provider sign-in inside the apps uses PKCE (src/lib/nativeOAuth.ts): the
 * return on the app's custom scheme carries a one-time code, never tokens, and
 * the code is redeemed on the sign-in screen with a verifier only this device
 * holds. The website is untouched by any of it.
 */
describe('AuthProvider — app sign-in with PKCE', () => {
  const fetchMock = vi.fn();

  function enterApp() {
    (window as unknown as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };
  }

  function CallbackProbe({ useAuth }: { useAuth: AuthModule['useAuth'] }) {
    const { loading, callbackError } = useAuth();
    return <p data-testid="cb">{loading ? 'loading' : callbackError ?? 'ok'}</p>;
  }

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  it('asks the provider for a code bound to an S256 challenge, returning on the app scheme', async () => {
    enterApp();
    h.signInWithOAuth.mockResolvedValue({ data: { url: 'https://project.supabase.co/auth/v1/authorize?x=1' }, error: null });
    const { AuthProvider, useAuth } = await loadProvider();
    const { result: auth } = renderHook(useAuth, { wrapper: AuthProvider });

    await act(async () => {
      const result = await auth.current.signInWithProvider('google', '/tools/goals');
      expect(result).toEqual({ error: null, closed: true });
    });

    const { provider, options } = h.signInWithOAuth.mock.calls[0][0];
    expect(provider).toBe('google');
    expect(options.redirectTo).toBe('co.finatrix.app://auth/callback?next=%2Ftools%2Fgoals');
    expect(options.skipBrowserRedirect).toBe(true);
    expect(options.queryParams.code_challenge_method).toBe('s256');
    expect(options.queryParams.code_challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(localStorage.getItem('fx_oauth_pkce')).not.toBeNull();
    expect(h.openAuthBrowser).toHaveBeenCalledWith('https://project.supabase.co/auth/v1/authorize?x=1');
  });

  it('leaves the website’s sign-in exactly as it was — no PKCE parameters, no verifier', async () => {
    const { AuthProvider, useAuth } = await loadProvider();
    const { result: auth } = renderHook(useAuth, { wrapper: AuthProvider });
    await act(async () => {
      await auth.current.signInWithProvider('google', '/tools');
    });
    const { options } = h.signInWithOAuth.mock.calls[0][0];
    expect(options.queryParams).toBeUndefined();
    expect(options.skipBrowserRedirect).toBeUndefined();
    expect(localStorage.getItem('fx_oauth_pkce')).toBeNull();
  });

  it('redeems the returned code, signs in, and removes the code from the address', async () => {
    enterApp();
    const { beginNativePkce } = await import('../lib/nativeOAuth');
    await beginNativePkce();
    window.history.replaceState(null, '', '/login?next=%2Ftools&code=returned-code');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ access_token: 'at', refresh_token: 'rt' }), { status: 200 }));
    h.getSession.mockResolvedValue({ data: { session: { user: { id: 'u9' } } } });

    const { AuthProvider, useAuth } = await loadProvider();
    render(<AuthProvider><CallbackProbe useAuth={useAuth} /></AuthProvider>);

    await waitFor(() => expect(screen.getByTestId('cb')).toHaveTextContent('ok'));
    expect(h.setSession).toHaveBeenCalledWith({ access_token: 'at', refresh_token: 'rt' });
    expect(window.location.search).toBe('?next=%2Ftools');
    // setSession must run before the session is read, or the load flashes signed out.
    expect(h.setSession.mock.invocationCallOrder[0]).toBeLessThan(h.getSession.mock.invocationCallOrder[0]);
  });

  it.each([
    ['apple', true],
    ['google', false],
  ] as const)('after a %s sign-in, registers the provider token for revocation: %s', async (provider, registers) => {
    enterApp();
    const { beginNativePkce } = await import('../lib/nativeOAuth');
    await beginNativePkce(provider);
    window.history.replaceState(null, '', '/login?next=%2Ftools&code=returned-code');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      access_token: 'at', refresh_token: 'rt', provider_refresh_token: 'provider-rt',
    }), { status: 200 }));

    const { AuthProvider, useAuth } = await loadProvider();
    render(<AuthProvider><CallbackProbe useAuth={useAuth} /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('cb')).toHaveTextContent('ok'));

    if (registers) await waitFor(() => expect(h.registerAppleToken).toHaveBeenCalledWith('provider-rt'));
    else expect(h.registerAppleToken).not.toHaveBeenCalled();
  });

  it('refuses a code it never asked for and explains on the sign-in screen', async () => {
    enterApp();
    window.history.replaceState(null, '', '/login?next=%2Ftools&code=injected');

    const { AuthProvider, useAuth } = await loadProvider();
    render(<AuthProvider><CallbackProbe useAuth={useAuth} /></AuthProvider>);

    await waitFor(() => expect(screen.getByTestId('cb')).toHaveTextContent(/could not be completed/i));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.setSession).not.toHaveBeenCalled();
  });

  it('does not treat a `code` parameter on the website as an app sign-in', async () => {
    window.history.replaceState(null, '', '/login?code=something-else');
    const { AuthProvider, useAuth } = await loadProvider();
    render(<AuthProvider><CallbackProbe useAuth={useAuth} /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('cb')).toHaveTextContent('ok'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.setSession).not.toHaveBeenCalled();
  });
});
