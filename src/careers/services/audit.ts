/**
 * Audit logging (Phase 4, Module 13). Fire-and-forget, like AI usage
 * telemetry — a failed audit write must never block the action it's
 * recording. Only admins can read the log (enforced by RLS).
 */

import { supabase } from '../../lib/supabase';
import { mapSupabaseError } from '../utils/errors';
import type { AuditLogRow } from '../types/phase4';

export function logAudit(
  actorUserId: string,
  action: string,
  target?: { type: string; id: string },
  meta: Record<string, unknown> = {}
): void {
  void supabase.from('audit_log').insert({
    actor_user_id: actorUserId,
    action: action.slice(0, 200),
    target_type: (target?.type ?? '').slice(0, 60),
    target_id: (target?.id ?? '').slice(0, 120),
    meta,
  }).then(() => undefined, () => undefined);
}

/** Admin-only. */
export async function listAuditLog(limit = 200): Promise<AuditLogRow[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw mapSupabaseError(error, 'Loading the audit log');
  return (data ?? []) as AuditLogRow[];
}
