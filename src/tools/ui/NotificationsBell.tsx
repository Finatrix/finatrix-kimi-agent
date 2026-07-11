import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Icon } from './Icon';
import { onLocalWrite } from '../lib/storage';
import { buildNotifications, isRead, markAllRead, dismiss, type FinNotification } from '../lib/notifications';

const TONE_COLOR: Record<FinNotification['tone'], string> = {
  ok: 'var(--green)', info: 'var(--blue)', warn: 'var(--orange)',
};

/** Finance notification bell — local-first, derived from the user's own data. */
export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Recompute when any tool writes (spend logged, budget changed, etc.).
  useEffect(() => onLocalWrite(() => setTick((t) => t + 1)), []);

  // Derived on each render (cheap; the app bar re-renders infrequently).
  const items = buildNotifications();
  const unread = items.filter((n) => !isRead(n.id)).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      // Mark read a tick later so the unread styling is visible as it opens.
      window.setTimeout(() => { markAllRead(); setTick((t) => t + 1); }, 1200);
    }
  };

  const onDismiss = (id: string) => { dismiss(id); setTick((t) => t + 1); };

  return (
    <div className="bell-wrap fx-tools" ref={wrapRef}>
      <button
        type="button"
        onClick={toggle}
        aria-label={unread ? `Notifications — ${unread} unread` : 'Notifications'}
        aria-haspopup="menu"
        aria-expanded={open}
        className="p-2 text-ink-3 hover:text-accent-text transition-colors relative"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unread > 0 && <span className="bell-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="menu" aria-label="Notifications">
          <div className="bell-head">
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>Notifications</span>
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => { markAllRead(); setTick((t) => t + 1); }}
                style={{ fontSize: 11.5, color: 'var(--accent-text)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
              >
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="bell-item" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '28px 16px', textAlign: 'center', color: 'var(--ink3)' }}>
              <Icon name="check" size={22} style={{ color: 'var(--green)' }} />
              <span style={{ fontWeight: 600, color: 'var(--ink2)' }}>You’re all caught up</span>
              <span style={{ fontSize: 11.5 }}>Alerts appear here as your budget, spending and goals change.</span>
            </div>
          ) : (
            items.slice(0, 20).map((n) => (
              <div key={n.id} className={`bell-item ${isRead(n.id) ? '' : 'unread'}`} role="menuitem">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span aria-hidden="true" style={{ marginTop: 1, color: TONE_COLOR[n.tone], flexShrink: 0 }}>
                    <Icon name={n.icon} size={16} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{n.title}</div>
                    <div style={{ color: 'var(--ink2)', marginTop: 2, fontSize: 12 }}>{n.body}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                      <Link to={n.href} onClick={() => setOpen(false)} style={{ fontSize: 11.5, color: 'var(--gold)', textDecoration: 'none', fontWeight: 600 }}>
                        Open →
                      </Link>
                      <button
                        type="button"
                        onClick={() => onDismiss(n.id)}
                        aria-label={`Dismiss: ${n.title}`}
                        style={{ fontSize: 11, color: 'var(--ink3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
