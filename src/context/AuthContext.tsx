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
import { RESET_PASSWORD_PATH } from '../shared/routes';
import { track } from '../lib/analytics';
import { safeInternalPath } from '../lib/safePath';

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
 * Did this page load arrive on a password-recovery link?
 *
 * Read from the URL rather than trusting the `PASSWORD_RECOVERY` event alone.
 * GoTrue emits that event from inside the client's own initialisation, which
 * begins the moment `createClient` runs — i.e. while the dynamic import of
 * `../lib/supabase` is still resolving, before this provider has had a chance to
 * subscribe. A listener that registers after the emit simply never hears it. The
 * URL is still there to be read at first render, so read it, and treat the event
 * as the second of two signals rather than the only one.
 */
function isRecoveryReturn(): boolean {
  const { hash, search } = window.location;
  return /[#&?]type=recovery\b/.test(hash + search);
}

/**
 * The failure a Supabase auth redirect can carry back, translated for a human.
 *
 * GoTrue reports a rejected link — an expired recovery token, a confirmation
 * link already used, a denied OAuth consent — by redirecting to
 * `…#error=access_denied&error_code=otp_expired&error_description=…` rather
 * than by failing a call, so nothing throws and nothing returns an error: the
 * page simply renders signed-out with an unexplained URL. Every one of those
 * arrives as "I clicked the link and nothing happened".
 *
 * Read at the provider's FIRST RENDER, for the same reason as `isOAuthReturn`
 * above: `detectSessionInUrl` strips these parameters the moment the client is
 * constructed, and the client is constructed from an effect that runs later.
 * Reading it any later than this is reading an empty URL.
 */
function readCallbackError(): string | null {
  const { hash, search } = window.location;
  const params = new URLSearchParams(
    `${hash.replace(/^#/, '')}&${search.replace(/^\?/, '')}`,
  );
  const code = params.get('error_code');
  const description = params.get('error_description');
  if (!code && !description && !params.get('error')) return null;

  if (code === 'otp_expired' || /expired/i.test(description ?? '')) {
    return 'That link has expired. Links are single-use and time-limited — request a fresh one below.';
  }
  if (code === 'access_denied' && !description) {
    return 'That link is no longer valid. It may already have been used — request a fresh one below.';
  }
  return description || 'That link is no longer valid. Request a fresh one below.';
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
  /**
   * The failure this page load arrived carrying, if it is the return leg of an
   * auth link that GoTrue rejected — an expired recovery token, a confirmation
   * link already used. Null on an ordinary load. See `readCallbackError`.
   */
  callbackError: string | null;
  /**
   * True once GoTrue has accepted a password-recovery link on this load.
   *
   * The recovery session it establishes is indistinguishable from an ordinary
   * one in `user` / `session`, so without this flag `/reset-password` cannot
   * tell "arrived here from the email" from "opened this page while signed in".
   * Both may set a password — this only decides which of the two the copy
   * addresses, and someone finishing a reset should not be told they are
   * changing a password they were unable to recall.
   */
  recovery: boolean;
  signUp: (
    email: string,
    password: string,
    name: string
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  /**
   * `next` is the in-app path to land on after the provider hands the browser
   * back. Callers pass a path they have already validated as same-site (see
   * `safeDestination` in Login.tsx) — it becomes a `redirectTo` GoTrue is asked
   * to honour, and an absolute URL there would be an open redirect.
   */
  signInWithProvider: (
    provider: 'google',
    next?: string
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resendVerification: (email: string) => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  /** Set a new password for the signed-in (or recovering) user. */
  updatePassword: (password: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Which kind of operation produced an error.
 *
 * This exists because a server-side failure means two completely different
 * things depending on what was being attempted, and the message has to say the
 * one that is true. GoTrue answers a broken SMTP configuration with a bare
 * HTTP 500 / `unexpected_failure` on the operations that SEND an email, so
 * translating that into "we couldn't send your email" is the single most useful
 * thing the UI can say — but the previous version applied that translation to
 * every 500 from every operation, including `signInWithPassword`, which has no
 * email to send. Someone whose sign-in hit a transient backend fault was told
 * their confirmation email had failed, sent to look in a spam folder for a
 * message that was never owed to them, and left with the actual problem
 * undescribed.
 */
type AuthOperation = 'send-email' | 'sign-in';

/**
 * Turn any Supabase auth error into a clean, human-readable string.
 *
 * Guards against blank / "{}" / "[object Object]" ever reaching the UI, and
 * translates the GoTrue error codes a user can actually act on. Anything
 * unrecognised falls through to Supabase's own message, which is usually
 * serviceable — the fallback is only for when it is not.
 */
function authErrorMessage(
  error: unknown,
  fallback: string,
  operation: AuthOperation = 'sign-in',
): string {
  if (!error) return fallback;
  const e = error as { message?: string; status?: number; code?: string };
  const msg = (typeof error === 'string' ? error : e.message ?? '').trim();
  const code = e.code ?? '';

  // Rate limiting. Applies to every operation and is entirely recoverable by
  // waiting, so say that rather than leaving "429" to be interpreted as a
  // rejected credential.
  if (e.status === 429 || /rate.?limit/i.test(code) || /rate limit/i.test(msg)) {
    return 'Too many attempts in a short time. Please wait a minute and try again.';
  }

  // The most common real sign-in failure that is NOT a wrong password: the
  // account exists and the credentials are right, but the confirmation link was
  // never clicked. Supabase's own "Email not confirmed" is accurate and gives
  // no next step; the next step is the Resend button on this very page.
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) {
    return 'Your email address has not been confirmed yet. Use “Resend verification” below, then click the link in that email.';
  }

  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) {
    return 'That email and password do not match an account. Check both, or reset your password below.';
  }

  const serverFault =
    e.status === 500 || code === 'unexpected_failure' || /smtp/i.test(msg);

  if (operation === 'send-email' && (serverFault || /sending.*(email|confirmation)/i.test(msg))) {
    return 'We couldn’t send that email right now. Please try again in a few minutes — if it keeps happening, contact support.';
  }
  if (serverFault) {
    return 'Something went wrong on our side. Please try again in a moment — if it keeps happening, contact support.';
  }

  const garbled = !msg || msg === '{}' || msg === '[object Object]';
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
  const [recovery, setRecovery] = useState(isRecoveryReturn);

  const mounted = useRef(true);
  const unsubscribe = useRef<(() => void) | undefined>(undefined);
  const subscribed = useRef(false);
  /** Read once, at first render — the client strips these params when it loads. */
  const oauthReturn = useRef(isOAuthReturn());
  const callbackError = useRef(readCallbackError());
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
      const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        rememberSession(!!newSession);

        // The one event that carries information `session` does not. GoTrue
        // emits it exactly once, when it accepts a recovery link, and the
        // session it hands over looks like any other — so this is the only
        // moment at which "this person proved control of the mailbox just now"
        // is observable. `/reset-password` needs that distinction, and it is
        // gone by the next render if nobody records it.
        if (event === 'PASSWORD_RECOVERY') setRecovery(true);

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
      if (mounted.current) {
        unsubscribe.current = () => sub.subscription.unsubscribe();
      } else {
        sub.subscription.unsubscribe();
        // …and release the latch. It was set at the top of this block, and the
        // cleanup that ran while the import was in flight cleared it before
        // this code existed to set it again — so it was left standing with no
        // live subscription behind it. The next mount would see `subscribed`
        // and skip listening entirely: `getSession()` would still restore the
        // stored session, so the app looked fine, while every later sign-in,
        // sign-out, token refresh and PASSWORD_RECOVERY went unobserved.
        subscribed.current = false;
      }
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
    //
    // The cleanup below is registered on this path too. It used to be skipped
    // with the early return, which meant a guest who then signed in from
    // /login subscribed a listener (via `ensureClient`) that nothing would ever
    // tear down — it outlived the provider, holding setState on a dead tree.
    if (isSupabaseConfigured && mayHaveSession()) {
      void (async () => {
        try {
          const supabase = await ensureClient();
          const { data } = await supabase.auth.getSession();
          if (!mounted.current) return;
          setSession(data.session);
          setUser(data.session?.user ?? null);
          rememberSession(!!data.session);
        } catch {
          // Reaching here means the auth stack could not be loaded or queried
          // at all — a chunk request that failed because a deploy replaced the
          // fingerprinted file this tab was holding, storage unavailable, the
          // network gone. There is nothing to recover, and nothing to say that
          // is more useful than the signed-out UI, which offers a sign-in.
          //
          // What must NOT happen is staying in `loading` forever: `ToolsLayout`
          // and the careers workspace gate their whole screen on it, so an
          // unresolved promise here is an app that spins on a blank page for
          // precisely the people who DO have an account. That is why the
          // `finally` exists and why this catch is empty rather than absent.
        } finally {
          if (mounted.current) setLoading(false);
        }
      })();
    }

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
        error: authErrorMessage(
          error,
          'Could not create your account. Please try again.',
          'send-email',
        ),
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
    provider,
    next = '/tools'
  ) => {
    if (!isSupabaseConfigured) return { error: 'Backend not configured yet.' };
    const supabase = await ensureClient();
    // Belt and braces on top of the caller's own check: anything that is not a
    // same-site path is discarded rather than sent to GoTrue, so no future
    // caller can turn this into an open redirect by passing a value it read
    // straight from a query string. Same gate as Login.tsx — one implementation,
    // so the two cannot drift into disagreeing about what "same-site" means.
    const target = safeInternalPath(next, '/tools');
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}${target}`,
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
    return {
      error: error
        ? authErrorMessage(error, 'Could not resend the email. Please try again.', 'send-email')
        : null,
    };
  };

  const resetPassword: AuthContextValue['resetPassword'] = async (email) => {
    if (!isSupabaseConfigured) return { error: 'Backend not configured yet.' };
    const supabase = await ensureClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // /reset-password, NOT /login. The recovery link establishes a session
      // and then hands the browser to this URL, so whatever is here is the only
      // chance the user gets to choose a new password. Pointed at /login, that
      // chance was a sign-in form with no password field to change — the link
      // worked perfectly and the flow was a dead end, which is indistinguishable
      // from "password reset is broken" to everyone who tried it.
      redirectTo: `${window.location.origin}${RESET_PASSWORD_PATH}`,
    });
    return {
      error: error
        ? authErrorMessage(error, 'Could not send the reset link. Please try again.', 'send-email')
        : null,
    };
  };

  const updatePassword: AuthContextValue['updatePassword'] = async (password) => {
    if (!isSupabaseConfigured) return { error: 'Backend not configured yet.' };
    const supabase = await ensureClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      return { error: authErrorMessage(error, 'Could not update your password. Please try again.') };
    }
    // The recovery grant is spent. Clearing it stops a back-navigation to this
    // page from presenting the "set a new password" form a second time on the
    // strength of a link that has already been redeemed.
    setRecovery(false);
    return { error: null };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        configured: isSupabaseConfigured,
        callbackError: callbackError.current,
        recovery,
        signUp,
        signIn,
        signInWithProvider,
        signOut,
        resendVerification,
        resetPassword,
        updatePassword,
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
