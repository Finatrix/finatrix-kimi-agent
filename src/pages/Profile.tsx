import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import AuthShell, { Field, PrimaryButton, Notice } from '../components/AuthShell';

export default function Profile() {
  const { user, loading, signOut, configured } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user && configured) navigate('/login');
  }, [loading, user, configured, navigate]);

  useEffect(() => {
    if (user) setName((user.user_metadata?.full_name as string) || '');
  }, [user]);

  if (loading) {
    return (
      <AuthShell title="Loading…">
        <p className="text-[14px] text-[#8A8A8A]">One moment.</p>
      </AuthShell>
    );
  }

  if (!user) {
    return (
      <AuthShell
        title="Your profile"
        subtitle="Sign in to view your account and synced data."
        footer={
          <Link to="/login" className="text-[#D4AF37] hover:underline">
            Go to sign in
          </Link>
        }
      >
        <Notice kind="info">You're browsing as a guest. Tools work, but data stays on this device only.</Notice>
        <Link to="/tools" className="text-[#D4AF37] hover:underline text-[14px]">
          ← Back to tools
        </Link>
      </AuthShell>
    );
  }

  async function saveName() {
    setBusy(true);
    setInfo(null);
    setError(null);
    const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    setBusy(false);
    if (error) setError(error.message);
    else setInfo('Profile updated.');
  }

  return (
    <AuthShell
      title="Your profile"
      subtitle="Manage your account. Your tool data is securely saved here and synced everywhere you sign in."
      footer={
        <Link to="/tools" className="text-[#D4AF37] hover:underline">
          ← Back to tools
        </Link>
      }
    >
      {info && <Notice kind="success">{info}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      <div className="mb-6">
        <span className="block font-mono text-[10px] uppercase tracking-[0.08em] text-[#8A8A8A] mb-2">
          Email
        </span>
        <div className="text-[15px] text-[#F5F5F0]">{user.email}</div>
        <div className="mt-1 text-[12px] text-[#5fd394]">
          {user.email_confirmed_at ? 'Verified' : 'Not verified yet'}
        </div>
      </div>

      <Field
        label="Display name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
      />
      <PrimaryButton onClick={saveName} disabled={busy}>
        {busy ? 'Saving…' : 'Save changes'}
      </PrimaryButton>

      <button
        onClick={() => {
          void signOut().then(() => navigate('/'));
        }}
        className="mt-4 w-full border border-[#1A1A1A] text-[#8A8A8A] hover:text-white hover:border-[#8A8A8A] font-mono text-[12px] uppercase tracking-[0.08em] py-3.5 transition-colors"
      >
        Sign out
      </button>
    </AuthShell>
  );
}
