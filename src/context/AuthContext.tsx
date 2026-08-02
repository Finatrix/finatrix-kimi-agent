import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
// Type-only, so it is erased at compile time and costs nothing at runtime.
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured } from '../lib/supabaseConfig';
import { track } from '../lib/analytics';

/**
 * `@supabase/supabase-js` is 54 KB gzipped — 38% of the landing page's entire
 * JavaScript budget — and this provider wraps every route, so it was downloaded
 * and parsed before first paint by every anonymous visitor and every crawler,
 * on a marketing page that has nothing to authenticate.
 *
 * It is now loaded on demand. The module is memoised on the promise rather than
 * on the resolved value, so concurrent callers during the fetch share one
 * request instead of racing to start several.
 */
let clientModule: Promise<typeof import('../lib/supabase')> | null = null;
function loadSupabase() {
  clientModule ??= import('../lib/supabase');
  return clientModule;
}

/**
 * Our own marker that this device has an account signed in.
 *
 * Deliberately not derived from Supabase's storage key: the probe below reads
 * `sb-*-auth-token` as a bootstrap for sessions created before this change, but
 * that key is the library's private detail and could be renamed by a future
 * version. If it were the ONLY signal, such a rename would silently show
 * signed-in users a signed-out page until they interacted. This flag is written
 * by us the first time a session is seen and cleared on sign-out, so from the
 * second load onwards the decision depends on nothing external.
 */
const SESSION_MARKER = 'fx_has_session';

/** Is there any reason to believe this load needs an authenticated client? */
function mayHaveSession(): boolean {
  try {
    if (localStorage.getItem(SESSION_MARKER) === '1') return true;
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith('sb-') && key.includes('auth-token')) return true;
    }
  } catch {
    // Storage blocked (private mode, embedded context). Assume a session might
    // exist — being wrong here costs a download, and being wrong the other way
    // costs a user their session.
    return true;
  }
  // An OAuth redirect lands back with the tokens in the URL and no stored
  // session yet. Missing this would strand every Google sign-in.
  const { hash, search } = window.location;
  return /access_token=|refresh_token=|[?&]code=|error_description=/.test(hash + search);
}

/**
 * Was this page load the return leg of an OAuth redirect?
 *
 * Captured before the Supabase client is created, because `detectSessionInUrl`
 * consumes and strips those parameters as soon as it is — by the time any
 * handler runs, the evidence is gone.
 */
function isOAuthReturn(): boolean {
  const { hash, search } = window.location;
  return /access_token=|[?&]code=/.test(hash + search);
}

/**
 * Was this account created moments ago?
 *
 * The only way to tell a Google SIGN-UP from a Google SIGN-IN: both arrive as
 * the same `SIGNED_IN` event with the same shape. Without this, either every
 * returning Google user is counted as a new sign-up, or Google sign-ups are not
 * counted at all — and Google is the one path where `Signup.tsx` cannot report
 * the outcome itself, because the browser leaves the page mid-flow.
 */
const FRESH_ACCOUNT_MS = 2 * 60 * 1000;
function isFreshAccount(u: User | null | undefined): boolean {
  const created = u?.created_at ? Date.parse(u.created_at) : NaN;
  if (!Number.isFinite(created)) return false;
  const age = Date.now() - created;
  return age >= 0 && age < FRESH_ACCOUNT_MS;
}

function rememberSession(present: boolean): void {
  try {
    if (present) localStorage.setItem(SESSION_MARKER, '1');
    else localStorage.removeItem(SESSION_MARKER);
  } catch {
    /* storage unavailable — the sb-* probe above still applies */
  }
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  configured: boolean;
  signUp: (
    email: string,
    password: string,
    name: string
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithProvider: (
    provider: 'google'
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resendVerification: (email: string) => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Turn any Supabase auth error into a clean, human-readable string.
// Guards against blank / "{}" / "[object Object]" messages ever reaching the UI,
// and maps GoTrue email-delivery failures (HTTP 500 / unexpected_failure) to
// actionable guidance instead of a cryptic blob.
function authErrorMessage(error: unknown, fallback: string): string {
  if (!error) return fallback;
  const e = error as { message?: string; status?: number; code?: string };
  const msg = (typeof error === 'string' ? error : e.message ?? '').trim();
  const garbled = !msg || msg === '{}' || msg === '[object Object]';
  if (
    /sending.*(email|confirmation)|smtp/i.test(msg) ||
    e.status === 500 ||
    e.code === 'unexpected_failure'
  ) {
    return 'We couldn’t send your confirmation email right now. Please try again in a few minutes — if it keeps happening, contact support.';
  }
  return garbled ? fallback : msg;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  /**
   * Derived at first render rather than set from the effect.
   *
   * There is genuinely nothing to wait for when no backend is configured or
   * this device has no session to restore, and starting at `true` only to
   * immediately set it to `false` would flash a loading state for a decision
   * already made — as well as being a setState inside an effect body, which
   * cascades an extra render.
   */
  const [loading, setLoading] = useState(() => isSupabaseConfigured && mayHaveSession());

  const mounted = useRef(true);
  const unsubscribe = useRef<(() => void) | undefined>(undefined);
  const subscribed = useRef(false);
  /** Read once, at first render — the client strips these params when it loads. */
  const oauthReturn = useRef(isOAuthReturn());
  const signupReported = useRef(false);

  /**
   * Load the client and make sure we are listening to it — one operation,
   * always used together.
   *
   * Keeping these two separate is what makes deferred loading dangerous: the
   * subscription used to be installed unconditionally at mount, so skipping the
   * load for a device with no stored session would have left a user who then
   * signed in with no listener at all. Their credentials would be accepted and
   * the UI would never notice. Every path that touches auth goes through here,
   * so the listener exists by the time any session can.
   */
  const ensureClient = useCallback(async () => {
    const { supabase } = await loadSupabase();
    if (!subscribed.current) {
      subscribed.current = true;
      const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        rememberSession(!!newSession);

        // A Google sign-up completing. `Signup.tsx` reports the email path
        // itself; it cannot report this one, because the browser left the page
        // to reach Google and the account is created on the way back. Guarded
        // three ways so it counts a sign-up and nothing else: only on an OAuth
        // return leg, only for an account created in the last two minutes, and
        // only once per load (this handler also fires on token refresh).
        if (!signupReported.current && oauthReturn.current && isFreshAccount(newSession?.user)) {
          signupReported.current = true;
          track('signup_completed', { kind: 'google', step: 'active' });
        }
      });
      // The provider can unmount while the import is in flight; without this the
      // subscription would outlive it, holding a reference to a dead
      // component's setState.
      if (mounted.current) unsubscribe.current = () => sub.subscription.unsubscribe();
      else sub.subscription.unsubscribe();
    }
    return supabase;
  }, []);

  useEffect(() => {
    mounted.current = true;

    // Nothing to restore: no backend, or no evidence this device has ever
    // signed in. The library is never fetched, which is the whole point — an
    // anonymous visitor to the landing page should not pay for an auth stack
    // they are not using. `ensureClient` still loads it the moment any auth
    // action below is taken.
    if (!isSupabaseConfigured || !mayHaveSession()) return;

    void (async () => {
      const supabase = await ensureClient();
      const { data } = await supabase.auth.getSession();
      if (!mounted.current) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      rememberSession(!!data.session);
      setLoading(false);
    })();

    return () => {
      mounted.current = false;
      unsubscribe.current?.();
      unsubscribe.current = undefined;
      subscribed.current = false;
    };
  }, [ensureClient]);

  const signUp: AuthContextValue['signUp'] = async (email, password, name) => {
    if (!isSupabaseConfigured)
      return { error: 'Backend not configured yet.', needsConfirmation: false };
    const supabase = await ensureClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    if (error)
      return {
        error: authErrorMessage(error, 'Could not create your account. Please try again.'),
        needsConfirmation: false,
      };
    // If email confirmation is on, there is no active session yet.
    const needsConfirmation = !data.session;
    return { error: null, needsConfirmation };
  };

  const signIn: AuthContextValue['signIn'] = async (email, password) => {
    if (!isSupabaseConfigured) return { error: 'Backend not configured yet.' };
    const supabase = await ensureClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? authErrorMessage(error, 'Could not sign in. Please try again.') : null };
  };

  const signInWithProvider: AuthContextValue['signInWithProvider'] = async (
    provider
  ) => {
    if (!isSupabaseConfigured) return { error: 'Backend not configured yet.' };
    const supabase = await ensureClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/tools`,
      },
    });
    return { error: error ? authErrorMessage(error, 'Could not sign in. Please try again.') : null };
  };

  const signOut = async () => {
    try {
      if (isSupabaseConfigured) {
        const supabase = await ensureClient();
        await supabase.auth.signOut();
      }
    } catch {
      /* Clear local state regardless of network/server outcome. */
    }
    // Cleared unconditionally, for the same reason the local state is: if the
    // network call failed, the user still asked to be signed out, and leaving
    // the marker set would make the next load fetch an auth stack for a session
    // that is gone.
    rememberSession(false);
    setUser(null);
    setSession(null);
  };

  const resendVerification: AuthContextValue['resendVerification'] = async (email) => {
    if (!isSupabaseConfigured) return { error: 'Backend not configured yet.' };
    const supabase = await ensureClient();
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    return { error: error ? authErrorMessage(error, 'Could not resend the email. Please try again.') : null };
  };

  const resetPassword: AuthContextValue['resetPassword'] = async (email) => {
    if (!isSupabaseConfigured) return { error: 'Backend not configured yet.' };
    const supabase = await ensureClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    return { error: error ? authErrorMessage(error, 'Could not send the reset link. Please try again.') : null };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        configured: isSupabaseConfigured,
        signUp,
        signIn,
        signInWithProvider,
        signOut,
        resendVerification,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
