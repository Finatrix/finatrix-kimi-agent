/**
 * Shared premium state components for Careers: empty states, error/setup
 * cards, the auth gate, and a small confirm dialog. These keep every page's
 * failure and empty paths on-brand instead of ad-hoc.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon, type IconName } from '../../tools/ui/Icon';
import { useAuth } from '../../context/AuthContext';
import type { CareersError } from '../utils/errors';

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
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div className="fx-modal-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="fx-modal-back" onClick={onCancel} />
      <div className="fx-modal" onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
        <h3>{title}</h3>
        <p style={{ fontSize: 13.5, color: 'var(--ink2)', lineHeight: 1.6 }}>{body}</p>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={onCancel}>
            Cancel
          </button>
          <button
            ref={confirmRef}
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
      </div>
    </div>
  );
}
