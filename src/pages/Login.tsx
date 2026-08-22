import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { safeInternalPath } from '../lib/safePath';
import AuthShell, {
  Field,
  PrimaryButton,
  Notice,
  OrDivider,
  SocialButton,
} from '../components/AuthShell';

/** Where a successful sign-in lands when nothing better was requested. */
const DEFAULT_DESTINATION = '/tools';

/**
 * The post-sign-in destination, taken from `?next=` when it is safe to honour.
 *
 * Restricted to same-site paths on purpose. `?next=https://evil.example` would
 * make this page an open redirector — a link that reads as finatrix.co, lands
 * on a real sign-in form, and forwards to somebody else's site the moment it
 * succeeds. The decision is `safeInternalPath`'s, which resolves the candidate
 * the way a browser will rather than testing its first two characters: `/\`,
 * `/<TAB>/` and `/<LF>/` are all the same attack written to survive a prefix
 * check. See src/lib/safePath.ts.
 */
function safeDestination(search: string): string {
  return safeInternalPath(new URLSearchParams(search).get('next'), DEFAULT_DESTINATION);
}

export default function Login() {
  const {
    signIn,
    signInWithProvider,
    resendVerification,
    resetPassword,
    configured,
    user,
    loading,
    callbackError,
  } = useAuth();
  const navigate = useNavigate();
  const { search } = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const destination = safeDestination(search);

  /**
   * Anyone who reaches this page already signed in is sent on.
   *
   * Two flows land here holding a live session and neither can be told apart
   * from a normal visit by looking at the form: an email-confirmation link
   * (`emailRedirectTo` in `AuthContext.signUp`), and any ordinary navigation
   * back to /login by someone who never signed out. In both cases the browser
   * has a session and the page renders "Welcome back — sign in", which reads as
   * the sign-in having silently failed. Someone who has just confirmed their
   * address and been handed a working account is shown a login form for it;
   * most people then type their password again, and a fair number conclude
   * their new account does not work.
   *
   * `replace` so the back button returns to wherever they came from rather than
   * to a page that will immediately bounce them forward again.
   */
  useEffect(() => {
    if (!loading && user) navigate(destination, { replace: true });
  }, [loading, user, destination, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    const { error } = await signIn(email.trim(), password);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    navigate(destination, { replace: true });
  }

  async function onProvider(provider: 'google') {
    setError(null);
    setInfo(null);
    setBusy(true);
    const { error } = await signInWithProvider(provider, destination);
    if (error) {
      setBusy(false);
      setError(error);
    }
    // On success the browser redirects to the provider, so no further action here.
  }

  /**
   * Both secondary actions previously put their FAILURE into `info`, which
   * renders as a green success notice with `role="status"`. A rejected request
   * — rate-limited, unknown address, mail transport down — was therefore shown
   * in the colour and the ARIA role of a success, so a screen reader announced
   * a failure as a passive status update and everyone else read "sent" styling
   * around the words explaining that nothing had been sent.
   */
  async function onResend() {
    if (!email.trim()) return setError('Enter your email above first.');
    setError(null);
    setInfo(null);
    setBusy(true);
    const { error } = await resendVerification(email.trim());
    setBusy(false);
    if (error) return setError(error);
    setInfo('Verification email sent. Check your inbox, including spam.');
  }

  async function onReset() {
    if (!email.trim()) return setError('Enter your email above first.');
    setError(null);
    setInfo(null);
    setBusy(true);
    const { error } = await resetPassword(email.trim());
    setBusy(false);
    if (error) return setError(error);
    setInfo('Password reset link sent. It expires in an hour.');
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to access your tools and synced data on any device."
      footer={
        <>
          New here?{' '}
          <Link to="/signup" className="fx-prose-link">
            Create an account
          </Link>
        </>
      }
    >
      {!configured && (
        <Notice kind="error">
          The backend isn't configured yet. Add your Supabase keys (see SETUP.md) to
          enable real sign-in. You can still use the tools — data stays on this device.
        </Notice>
      )}
      {/* A link that GoTrue rejected on the way here — an expired confirmation
          token, a denied Google consent. It arrives as URL fragment parameters
          and nothing else reports it, so without this the page renders as an
          ordinary sign-in form and the failed link looks like a page that
          simply did nothing. */}
      {callbackError && !error && <Notice kind="error">{callbackError}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      {info && <Notice kind="success">{info}</Notice>}

      <SocialButton
        disabled={busy || !configured}
        onClick={() => onProvider('google')}
      >
        Continue with Google
      </SocialButton>

      <OrDivider label="or sign in with email" />

      <form onSubmit={onSubmit}>
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
        <PrimaryButton type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </PrimaryButton>
      </form>

      <div className="mt-5 flex items-center justify-between text-[12px] text-ink-3">
        <button
          type="button"
          onClick={onReset}
          disabled={busy || !configured}
          className="hover:text-accent-text transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Forgot password?
        </button>
        <button
          type="button"
          onClick={onResend}
          disabled={busy || !configured}
          className="hover:text-accent-text transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Resend verification
        </button>
      </div>
    </AuthShell>
  );
}
