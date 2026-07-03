/** Header notification bell: unread count + dropdown list, in-app channel. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { listNotifications, markRead } from '../services/notifications';
import type { NotificationRow } from '../types/jobs';
import { timeAgo } from '../utils/format';

export function NotificationsBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const rows = await listNotifications(user.id).catch(() => []);
    setItems(rows);
  }, [user]);

  useEffect(() => {
    // Deferred a tick so state lands from a promise callback, never the
    // synchronous effect body (react-hooks/set-state-in-effect).
    void Promise.resolve().then(refresh);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const unread = items.filter((n) => !n.read);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread.length && user) {
      await markRead(user.id, unread.map((n) => n.id)).catch(() => undefined);
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    }
  };

  if (!user) return null;

  return (
    <div className="bell-wrap fx-tools" ref={wrapRef}>
      <button
        onClick={() => void toggle()}
        aria-label={unread.length ? `Notifications — ${unread.length} unread` : 'Notifications'}
        className="p-2 text-[#8A8A8A] hover:text-[#D4AF37] transition-colors relative"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unread.length > 0 && <span className="bell-dot">{unread.length > 9 ? '9+' : unread.length}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="menu" aria-label="Notifications">
          {!items.length ? (
            <div className="bell-item" style={{ color: 'var(--ink3)' }}>No notifications yet.</div>
          ) : (
            items.slice(0, 20).map((n) => (
              <div key={n.id} className={`bell-item ${n.read ? '' : 'unread'}`}>
                <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{n.title}</div>
                {n.body && <div style={{ color: 'var(--ink2)', marginTop: 2 }}>{n.body}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{timeAgo(n.created_at)}</span>
                  {n.link && (
                    <Link to={n.link} onClick={() => setOpen(false)} style={{ fontSize: 11.5, color: 'var(--gold)', textDecoration: 'none' }}>
                      Open →
                    </Link>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
