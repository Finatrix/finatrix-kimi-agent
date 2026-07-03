/**
 * In-app notifications + alert preferences. Derived reminders are
 * materialized here with dedupe keys, so each real-world event (a deadline,
 * an interview, an expiring offer) notifies exactly once no matter how often
 * the sync runs. Email/push channels are prepared in alert config but only
 * the in-app channel is delivered in this phase.
 */

import { supabase } from '../../lib/supabase';
import type { AlertRow, NotificationRow, Reminder } from '../types/jobs';
import { mapSupabaseError } from '../utils/errors';

export async function listNotifications(userId: string, limit = 50): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw mapSupabaseError(error, 'Loading notifications');
  return (data ?? []) as NotificationRow[];
}

export async function markRead(userId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .in('id', ids);
  if (error) throw mapSupabaseError(error, 'Updating notifications');
}

export async function pushNotification(
  userId: string,
  fields: { kind: string; title: string; body?: string; link?: string; dedupeKey?: string }
): Promise<void> {
  // Duplicate dedupe keys hit the partial unique index and are ignored.
  await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      kind: fields.kind,
      title: fields.title.slice(0, 200),
      body: (fields.body ?? '').slice(0, 500),
      link: (fields.link ?? '').slice(0, 300),
      dedupe_key: fields.dedupeKey ?? '',
    })
    .then(() => undefined, () => undefined);
}

/** Materialize derived reminders into notifications (deduped per event). */
export async function syncReminderNotifications(userId: string, reminders: Reminder[]): Promise<void> {
  for (const r of reminders) {
    await pushNotification(userId, {
      kind: r.kind,
      title: r.title,
      link: '/careers/applications',
      dedupeKey: r.id,
    });
  }
}

// ─────────────────────────── alert preferences ───────────────────────────

export const ALERT_KINDS = [
  { kind: 'new_jobs', label: 'New high-match jobs' },
  { kind: 'deadline', label: 'Application deadlines' },
  { kind: 'interview', label: 'Interview reminders' },
  { kind: 'offer_expiry', label: 'Offer expiry' },
  { kind: 'coach', label: 'Career coach suggestions' },
] as const;

export async function listAlerts(userId: string): Promise<AlertRow[]> {
  const { data, error } = await supabase.from('alerts').select('*').eq('user_id', userId);
  if (error) throw mapSupabaseError(error, 'Loading alert settings');
  return (data ?? []) as AlertRow[];
}

export async function setAlert(userId: string, kind: string, enabled: boolean): Promise<void> {
  const { data: existing } = await supabase
    .from('alerts')
    .select('id')
    .eq('user_id', userId)
    .eq('kind', kind)
    .limit(1)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from('alerts')
      .update({ enabled })
      .eq('user_id', userId)
      .eq('id', existing.id);
    if (error) throw mapSupabaseError(error, 'Saving alert settings');
    return;
  }
  const { error } = await supabase
    .from('alerts')
    .insert({ user_id: userId, kind, enabled, config: { channels: ['in_app'] } });
  if (error) throw mapSupabaseError(error, 'Saving alert settings');
}

export function alertEnabled(alerts: AlertRow[], kind: string): boolean {
  const row = alerts.find((a) => a.kind === kind);
  return row ? row.enabled : true; // alerts default on until configured off
}
