import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import AuthShell, { Field, PrimaryButton, Notice } from '../components/AuthShell';

export default function Signup() {
  const { signUp, configured } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    const { error, needsConfirmation } = await signUp(email.trim(), password, name.trim());
    setBusy(false);
    if (error) return setError(error);
    if (needsConfirmation) {
      setDone(true);
    } else {
      navigate('/tools');
    }
  }

  if (done) {
    return (
      <AuthShell
        title="Verify your email"
        subtitle="We've sent a confirmation link to your inbox."
        footer={
          <Link to="/login" className="text-[#D4AF37] hover:underline">
            Back to sign in
          </Link>
        }
      >
        <Notice kind="success">
          Check <strong>{email}</strong> and click the verification link to activate your
          account. After verifying, sign in to start using your synced tools.
        </Notice>
        <p className="text-[13px] text-[#8A8A8A] leading-relaxed">
          Didn't get it? Check spam, or use “Resend verification” on the sign-in page.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free. Your budgets, expenses and plans save to your profile and follow you across devices."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="text-[#D4AF37] hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {!configured && (
        <Notice kind="error">
          The backend isn't configured yet. Add your Supabase keys (see SETUP.md) to enable
          real accounts.
        </Notice>
      )}
      {error && <Notice kind="error">{error}</Notice>}

      <form onSubmit={onSubmit}>
        <Field
          label="Full name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Aarav Sharma"
        />
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
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
        />
        <Field
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Re-enter password"
        />
        <PrimaryButton type="submit" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}
