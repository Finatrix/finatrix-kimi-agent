import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';

/**
 * First-run reminder for guests: a premium, non-intrusive modal explaining the
 * benefit of an account. Shows once — the choice is remembered in localStorage
 * so it never reappears. Never shown to signed-in users or on the auth pages.
 */
const SEEN_KEY = 'fx_login_prompt_seen';
const SUPPRESS_ON = ['/login', '/signup'];

function seen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true; // if storage is blocked, don't nag
  }
}
function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* ignore */
  }
}

export default function LoginReminderModal() {
  const { user, loading, configured } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const dismiss = useCallback(() => {
    markSeen();
    setOpen(false);
  }, []);
  const go = useCallback((to: string) => {
    markSeen();
    setOpen(false);
    navigate(to);
  }, [navigate]);

  useEffect(() => {
    if (loading || !configured) return; // backend off → guests can't sign in anyway
    if (user || seen() || SUPPRESS_ON.includes(pathname)) return;
    const t = setTimeout(() => setOpen(true), 900); // let the page settle first
    return () => clearTimeout(t);
  }, [user, loading, configured, pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cardRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, dismiss]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-5"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fx-login-modal-title"
        aria-describedby="fx-login-modal-desc"
        className="relative w-full max-w-[420px] rounded-3xl border border-white/[0.1] bg-[#141416] p-7 sm:p-8 text-center shadow-[0_40px_90px_-20px_rgba(0,0,0,0.75)]"
        style={{ animation: 'fxModalIn 320ms cubic-bezier(.34,1.56,.64,1) both' }}
      >
        <style>{`@keyframes fxModalIn{from{opacity:0;transform:translateY(16px) scale(.96)}to{opacity:1;transform:none}}`}</style>

        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-4 top-4 text-[#6b6b70] hover:text-[#F5F5F0] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl" style={{ background: 'linear-gradient(150deg,#F0D779,#C49B2E)', boxShadow: '0 12px 34px -10px rgba(212,175,55,0.6)' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1a1400" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>

        <h2 id="fx-login-modal-title" className="text-[21px] font-semibold tracking-[-0.01em] text-[#F5F5F0]">
          Save your progress
        </h2>
        <p id="fx-login-modal-desc" className="mt-3 text-[14px] leading-relaxed text-[#9c9c96]">
          Create a free account to securely save your financial plans, budgets, expenses and progress
          across all your devices.
        </p>

        <div className="mt-7 flex flex-col gap-2.5">
          <button
            onClick={() => go('/signup')}
            data-autofocus
            className="fx-btn-gold w-full font-mono text-[12px] uppercase tracking-[0.1em] py-3.5 rounded-full"
          >
            Create account
          </button>
          <button
            onClick={() => go('/login')}
            className="fx-btn-ghost w-full font-mono text-[12px] uppercase tracking-[0.1em] py-3.5 rounded-full"
          >
            Login
          </button>
          <button
            onClick={dismiss}
            className="w-full py-2.5 text-[13px] text-[#8A8A8A] hover:text-[#F5F5F0] transition-colors"
          >
            Continue as guest
          </button>
        </div>

        <p className="mt-4 text-[11px] text-[#6b6b70]">Free forever · Privacy first · No card required</p>
      </div>
    </div>
  );
}
