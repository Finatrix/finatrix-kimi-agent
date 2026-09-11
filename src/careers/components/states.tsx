/**
 * Shared premium state components for Careers: empty states, error/setup
 * cards, the auth gate, and a small confirm dialog. These keep every page's
 * failure and empty paths on-brand instead of ad-hoc.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon, type IconName } from '../../tools/ui/Icon';
import { useAuth } from '../../context/AuthContext';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import type { CareersError } from '../utils/errors';

/** Open dialogs, oldest first — Escape must only close the topmost one. */
const dialogStack: symbol[] = [];

/**
 * Everything inside a panel that can take focus, in DOM order.
 *
 * `:not([disabled])` and the negative-tabindex filter matter: a disabled
 * button and a programmatic focus target (`tabIndex={-1}`, which the panel
 * itself carries) are both reachable by query but neither is a Tab stop, and
 * treating them as the first or last stop is what makes a hand-rolled trap
 * park focus on something invisible.
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]',
]
  // `[hidden]` covers the visually-hidden file input the JD analyzer puts
  // behind its "Upload PDF / DOCX" label, which is focusable by query but is
  // not a Tab stop the user can see.
  .map((sel) => `${sel}:not([hidden])`)
  .join(',');

function focusableIn(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.tabIndex >= 0 && el.getAttribute('aria-hidden') !== 'true'
  );
}

/**
 * Shared shell for every Careers dialog: backdrop, panel, body scroll lock,
 * Escape-to-close (LIFO under stacking), initial focus into the dialog and
 * focus restore to the opener on close. Mount it only while the dialog is
 * open — the parent controls visibility, the shell owns the behaviour.
 */
export function ModalShell({
  label,
  onClose,
  wide,
  children,
}: {
  label: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  useBodyScrollLock(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const id = Symbol('careers-dialog');
    dialogStack.push(id);
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      (panel.querySelector<HTMLElement>('[data-autofocus]') ?? panel).focus();
    }
    const onKey = (e: KeyboardEvent) => {
      // Only the topmost dialog reacts, so a confirm opened over a workbench
      // does not close both.
      if (dialogStack[dialogStack.length - 1] !== id) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
        return;
      }

      // Focus containment (ARIA APG "modal dialog"). The dialog set initial
      // focus and trapped Escape, but Tab still walked straight out into the
      // page behind the backdrop — where the content is inert to a mouse but
      // fully reachable by keyboard, so a screen-reader or keyboard user could
      // silently operate the page they believed was blocked.
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = focusableIn(panel);
      if (!items.length) {
        // Nothing to land on — keep focus on the panel rather than the page.
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement as HTMLElement | null;

      if (!current || !panel.contains(current)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && current === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      dialogStack.splice(dialogStack.indexOf(id), 1);
      opener?.focus?.();
    };
  }, []);

  return (
    <div className="fx-modal-wrap" role="dialog" aria-modal="true" aria-label={label}>
      <div className="fx-modal-back" onClick={onClose} />
      <div ref={panelRef} tabIndex={-1} className={wide ? 'fx-modal wide' : 'fx-modal'}>
        {children}
      </div>
    </div>
  );
}

/**
 * Shimmer placeholder cards shown while a list is loading — shaped like the
 * job/company cards they stand in for, so content doesn't jump on arrival.
 */
export function SkeletonCards({ count = 3, label = 'Loading' }: { count?: number; label?: string }) {
  return (
    <div role="status" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <div className="card" key={i} style={{ padding: 18, marginBottom: 10 }} aria-hidden="true">
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="skel" style={{ width: '45%', height: 15 }} />
              <div className="skel" style={{ width: '68%', height: 11, marginTop: 10 }} />
              <div className="skel" style={{ width: '32%', height: 11, marginTop: 7 }} />
            </div>
            <div className="skel" style={{ width: 56, height: 56, borderRadius: '50%', flexShrink: 0 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <div className="skel" style={{ width: 118, height: 30, borderRadius: 980 }} />
            <div className="skel" style={{ width: 64, height: 30, borderRadius: 980 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Full-page loading placeholder for Careers pages (replaces blank space). */
export function PageLoading() {
  return (
    <div style={{ minHeight: '50vh', paddingTop: 24 }}>
      <SkeletonCards count={3} label="Loading page" />
    </div>
  );
}

export function EmptyState({
  icon = 'briefcase',
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="es-ic">
        <Icon name={icon} size={22} />
      </div>
      <div className="es-t">{title}</div>
      {children && <div className="es-d">{children}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

export function ErrorCard({
  error,
  onRetry,
}: {
  error: CareersError;
  onRetry?: () => void;
}) {
  const setup = error.code === 'not-setup';
  return (
    <div className="card" role="alert" style={{ borderColor: setup ? 'rgba(212,175,55,.3)' : 'rgba(255,90,82,.3)' }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div
          className="act-ic"
          style={{
            background: setup ? 'rgba(212,175,55,.12)' : 'rgba(255,90,82,.12)',
            color: setup ? 'var(--gold)' : 'var(--red)',
          }}
        >
          <Icon name={setup ? 'zap' : 'warn'} size={16} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            {setup ? 'One-time setup needed' : 'Something went wrong'}
          </div>
          <p style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 5, lineHeight: 1.6 }}>{error.message}</p>
          {onRetry && error.retryable && (
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Gate for the whole module: backend not configured → setup notice;
 * signed out → sign-in card; otherwise renders the page.
 */
export function CareersGate({ children }: { children: ReactNode }) {
  const { user, loading, configured } = useAuth();
  if (loading) return <div style={{ minHeight: '40vh' }} aria-hidden="true" />;
  if (!configured) {
    return (
      <div className="card" style={{ maxWidth: 560, margin: '48px auto' }}>
        <EmptyState icon="lock" title="Backend not configured">
          FinatriX Careers stores your resumes securely in your account, which needs the
          Supabase backend. Add your keys to <code>.env</code> (see SETUP.md) to enable it.
        </EmptyState>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="card" style={{ maxWidth: 560, margin: '48px auto' }}>
        <EmptyState icon="lock" title="Sign in to use Careers">
          Your resumes, scores and Career DNA are private to your account. Sign in to
          upload and analyse your resume.
        </EmptyState>
        <Link to="/login" className="btn" style={{ display: 'block', textDecoration: 'none', marginTop: 4 }}>
          Sign in
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <ModalShell label={title} onClose={onCancel}>
      <h3>{title}</h3>
      <p style={{ fontSize: 13.5, color: 'var(--ink2)', lineHeight: 1.6 }}>{body}</p>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={onCancel}>
          Cancel
        </button>
        <button
          data-autofocus
          className="btn btn-sm"
          style={{
            flex: 1,
            ...(danger
              ? { background: 'linear-gradient(180deg,#ff7a70,#e2483f)', color: '#2a0503', boxShadow: '0 12px 32px -10px rgba(226,72,63,.5)' }
              : {}),
          }}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}
