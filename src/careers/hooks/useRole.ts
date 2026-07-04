/** RBAC hook (Phase 4). Resolves the signed-in user's platform role once per session. */

import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getMyRole } from '../services/platformRoles';
import { isAdminRole, type PlatformRole } from '../types/phase4';

export function useRole(): { role: PlatformRole; isAdmin: boolean; loading: boolean } {
  const { user } = useAuth();
  const [role, setRole] = useState<PlatformRole>('user');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Deferred a tick so state lands from a promise callback, never the
    // synchronous effect body (react-hooks/set-state-in-effect).
    void Promise.resolve().then(async () => {
      const r = user ? await getMyRole(user.id) : 'user';
      if (!cancelled) {
        setRole(r);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { role, isAdmin: isAdminRole(role), loading };
}
