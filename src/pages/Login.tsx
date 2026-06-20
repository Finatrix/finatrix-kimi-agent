import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import AuthShell, { Field, PrimaryButton, Notice } from '../components/AuthShell';

export default function Login() {
  const { signIn, resendVerification, resetPassword, configured } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    navigate('/tools');
  }

  async function onResend() {
    if (!email.trim()) return setError('Enter your email above first.');
    const { error } = await resendVerification(email.trim());
    setError(null);
    setInfo(error ? error : 'Verification email sent. Check your inbox.');
  }

  async function onReset() {
    if (!email.trim()) return setError('Enter your email above first.');
    const { error } = await resetPassword(email.trim());
    setError(null);
    setInfo(error ? error : 'Password reset link sent to your email.');
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to access your tools and synced data on any device."
      footer={
        <>
          New here?{' '}
          <Link to="/signup" className="text-[#D4AF37] hover:underline">
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
      {error && <Notice kind="error">{error}</Notice>}
      {info && <Notice kind="success">{info}</Notice>}

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

      <div className="mt-5 flex items-center justify-between text-[12px] text-[#8A8A8A]">
        <button onClick={onReset} className="hover:text-[#D4AF37] transition-colors">
          Forgot password?
        </button>
        <button onClick={onResend} className="hover:text-[#D4AF37] transition-colors">
          Resend verification
        </button>
      </div>
    </AuthShell>
  );
}
