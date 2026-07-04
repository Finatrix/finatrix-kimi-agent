/**
 * RBAC (Phase 4). Roles are never client-writable — see the RLS policy on
 * platform_roles — so this service is read-only from the app's perspective.
 * Granting admin/support access happens via the Supabase dashboard or a
 * service-role script, by design.
 */

import { supabase } from '../../lib/supabase';
import { isAdminRole, type PlatformRole } from '../types/phase4';

export async function getMyRole(userId: string): Promise<PlatformRole> {
  const { data, error } = await supabase
    .from('platform_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return 'user';
  return data.role as PlatformRole;
}

export async function isAdmin(userId: string): Promise<boolean> {
  return isAdminRole(await getMyRole(userId));
}
