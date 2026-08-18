import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import AuthShell, { Field, PrimaryButton, Notice } from '../components/AuthShell';

/** Matches the minimum enforced at sign-up, so the two never disagree. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * The other half of "Forgot password?".
 *
 * `resetPasswordForEmail` was already wired up and already sent a working
 * email. What did not exist was anywhere for that email to land: the link
 * pointed at `/login`, so GoTrue established a recovery session and then
 * dropped the user on a sign-in form with no password field to change and no
 * indication anything had happened. The link worked; the flow was a dead end.
 * Anyone who had forgotten their password had no route back into their account
 * at all, which is indistinguishable from "login is broken".
 *
 * This page is that landing. Three states, because the link can arrive in three
 * conditions and conflating them is what makes a reset feel broken:
 *
 *   • accepted   — a session exists, so offer the new password;
 *   • rejected   — GoTrue bounced the token (expired, already used) and says so
 *                  in the URL fragment, which is captured by `AuthContext`
 *                  before the client strips it;
 *   • absent     — someone opened this URL directly, with no link at all.
 *
 * The last two share one remedy, so they share one form: request a fresh link
 * without going anywhere else first.
 */
export default function ResetPassword() {
  const { user, loading, configured, callbackError, recovery, updatePassword, resetPassword } =
    useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH)
      return setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (password !== confirm) return setError('Passwords do not match.');

    setBusy(true);
    const { error } = await updatePassword(password);
    setBusy(false);
    if (error) return setError(error);
    setDone(true);
  }

  async function onRequestLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    const { error } = await resetPassword(email.trim());
    setBusy(false);
    // Reported as an error when it is one. Routing a failure into the success
    // notice — which is what the sign-in page used to do — paints a red
    // outcome green and announces it as a status rather than an alert.
    if (error) return setError(error);
    setInfo('Check your inbox for a fresh reset link. It expires in an hour.');
  }

  if (done) {
    return (
      <AuthShell
        title="Password updated"
        subtitle="You're signed in with your new password on this device."
      >
        <Notice kind="success">
          Your password has been changed. Other devices stay signed in — sign out from
          Profile if you want to end those sessions too.
        </Notice>
        <PrimaryButton type="button" onClick={() => navigate('/tools')}>
          Continue to your tools
        </PrimaryButton>
      </AuthShell>
    );
  }

  // Still deciding whether the link produced a session. Rendering the "link
  // expired" state here would accuse a perfectly good link of being broken for
  // as long as the auth chunk takes to arrive.
  if (loading) {
    return (
      <AuthShell title="Choose a new password" subtitle="Checking your reset link…">
        <p className="text-[13px] text-ink-3 leading-relaxed" role="status">
          One moment.
        </p>
      </AuthShell>
    );
  }

  if (!configured) {
    return (
      <AuthShell title="Choose a new password">
        <Notice kind="error">
          The backend isn't configured yet, so passwords cannot be changed. See SETUP.md.
        </Notice>
      </AuthShell>
    );
  }

  if (user) {
    return (
      <AuthShell
        title="Choose a new password"
        subtitle={
          recovery
            ? 'Your reset link checked out. Pick a new password to finish.'
            : 'Set a new password for your account.'
        }
        footer={
          <Link to="/tools" className="fx-prose-link">
            Cancel and go back to your tools
          </Link>
        }
      >
        {error && <Notice kind="error">{error}</Notice>}
        <form onSubmit={onSubmit}>
          <Field
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          />
          <Field
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter password"
          />
          <PrimaryButton type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save new password'}
          </PrimaryButton>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="That link didn't work"
      subtitle="Reset links are single-use and expire after an hour. Enter your email and we'll send a fresh one."
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="fx-prose-link">
            Back to sign in
          </Link>
        </>
      }
    >
      {/* The reason GoTrue gave, when it gave one — far more use than a generic
          "invalid link", and the only place it is ever surfaced. */}
      {callbackError && <Notice kind="error">{callbackError}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      {info && <Notice kind="success">{info}</Notice>}

      <form onSubmit={onRequestLink}>
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <PrimaryButton type="submit" disabled={busy}>
          {busy ? 'Sending…' : 'Send a new reset link'}
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}
