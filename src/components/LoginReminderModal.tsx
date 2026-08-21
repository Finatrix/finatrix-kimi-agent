import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { track } from '../lib/analytics';
import Button from './Button';
import { RESET_PASSWORD_PATH } from '../shared/routes';

/**
 * Guest account nudge, shown at a *value moment* rather than on arrival.
 *
 * It never interrupts the landing hero and never fires the first time a guest
 * opens a tool. Instead it appears once the guest opens their SECOND distinct
 * calculator — by then they've seen a tool produce a result and are exploring
 * more, which is the natural moment to offer cross-device saving. Shown once per
 * browser (remembered in localStorage); never to signed-in users or on the auth
 * pages.
 */
const SEEN_KEY = 'fx_login_prompt_seen';
// Never over the auth pages: on /login and /signup the modal would advertise
// the very action the page is already asking for, and on /reset-password it
// would interrupt someone mid-recovery to suggest they make an account they
// demonstrably already have.
const SUPPRESS_ON = ['/login', '/signup', RESET_PASSWORD_PATH];
/** How many distinct tools a guest must open before we offer an account. */
const TOOLS_BEFORE_PROMPT = 2;

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
  const autofocusRef = useRef<HTMLButtonElement>(null);
  const visitedTools = useRef<Set<string>>(new Set());

  const dismiss = useCallback(() => {
    markSeen();
    setOpen(false);
    track('signup_prompt_action', { action: 'dismiss' });
  }, []);
  const go = useCallback((to: string) => {
    markSeen();
    setOpen(false);
    track('signup_prompt_action', { action: to === '/signup' ? 'signup' : 'login' });
    navigate(to);
  }, [navigate]);

  useEffect(() => {
    if (loading || !configured) return; // backend off → guests can't sign in anyway
    if (user || seen() || SUPPRESS_ON.includes(pathname)) return;
    // Count only individual calculator pages (the value surface), not the index.
    const match = pathname.match(/^\/tools\/([^/]+)/);
    if (match) visitedTools.current.add(match[1]);
    // Wait until the guest has engaged with enough distinct tools — never on the
    // hero, never on the first tool arrival.
    if (visitedTools.current.size < TOOLS_BEFORE_PROMPT) return;
    const t = setTimeout(() => {
      setOpen(true);
      track('signup_prompt_shown');
    }, 900); // let the page settle first
    return () => clearTimeout(t);
  }, [user, loading, configured, pathname]);

  useBodyScrollLock(open);

  // Focus goes into the dialog, stays there while it is open, and returns to
  // whatever the guest was on when it closes. Without the trap, `aria-modal`
  // was an assertion the browser did not honour: Tab walked straight out into
  // the tool page behind, which assistive technology had been told is inert.
  useDialogFocus({ containerRef: cardRef, open, initialFocusRef: autofocusRef });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => {
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
        className="fx-login-card relative w-full max-w-[420px] rounded-3xl border border-hairline bg-surface-3 p-7 sm:p-8 text-center shadow-[var(--shadow-3)]"
      >
        <style>{`
          @keyframes fxModalIn{from{opacity:0;transform:translateY(16px) scale(.96)}to{opacity:1;transform:none}}
          .fx-login-card{animation:fxModalIn 320ms cubic-bezier(.34,1.56,.64,1) both;}
          @media (prefers-reduced-motion: reduce){.fx-login-card{animation:none;}}
        `}</style>

        <Button
          variant="plain"
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-4 top-4 text-ink-3 hover:text-ink transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Button>

        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl" style={{ background: 'linear-gradient(150deg,#F0D779,#C49B2E)', boxShadow: '0 12px 34px -10px rgba(212,175,55,0.6)' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1a1400" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>

        <h2 id="fx-login-modal-title" className="text-[21px] font-semibold tracking-[-0.01em] text-ink">
          Save your progress
        </h2>
        <p id="fx-login-modal-desc" className="mt-3 text-[14px] leading-relaxed text-ink-2">
          Create a free account to securely save your financial plans, budgets, expenses and progress
          across all your devices.
        </p>

        <div className="mt-7 flex flex-col gap-2.5">
          <Button
            variant="gold"
            onClick={() => go('/signup')}
            ref={autofocusRef}
            className="w-full font-mono text-[12px] uppercase tracking-[0.1em] py-3.5 rounded-full"
          >
            Create account
          </Button>
          <Button
            variant="ghost"
            onClick={() => go('/login')}
            className="w-full font-mono text-[12px] uppercase tracking-[0.1em] py-3.5 rounded-full"
          >
            Login
          </Button>
          <Button
            variant="plain"
            onClick={dismiss}
            className="w-full py-2.5 text-[13px] text-ink-3 hover:text-ink transition-colors"
          >
            Continue as guest
          </Button>
        </div>

        <p className="mt-4 text-[11px] text-ink-3">Free forever · Privacy first · No card required</p>
      </div>
    </div>
  );
}
