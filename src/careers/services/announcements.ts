/** Announcements (Phase 4, Module 4). Everyone signed in can read active ones. */

import { supabase } from '../../lib/supabase';
import { mapSupabaseError } from '../utils/errors';
import { sanitizeField, sanitizeProse } from '../utils/sanitize';
import type { AnnouncementRow } from '../types/phase4';

export async function listActiveAnnouncements(): Promise<AnnouncementRow[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .eq('active', true)
    .lte('starts_at', now)
    .order('starts_at', { ascending: false });
  if (error) throw mapSupabaseError(error, 'Loading announcements');
  return ((data ?? []) as AnnouncementRow[]).filter((a) => !a.ends_at || a.ends_at > now);
}

/** Admin-only. */
export async function listAllAnnouncements(): Promise<AnnouncementRow[]> {
  const { data, error } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
  if (error) throw mapSupabaseError(error, 'Loading announcements');
  return (data ?? []) as AnnouncementRow[];
}

export async function createAnnouncement(
  createdBy: string,
  fields: { title: string; body: string; audience?: string; endsAt?: string | null }
): Promise<AnnouncementRow> {
  const { data, error } = await supabase
    .from('announcements')
    .insert({
      title: sanitizeField(fields.title, 200),
      body: sanitizeProse(fields.body, 2_000),
      audience: fields.audience ?? 'all',
      ends_at: fields.endsAt ?? null,
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Creating the announcement');
  return data as AnnouncementRow;
}

export async function setAnnouncementActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('announcements').update({ active }).eq('id', id);
  if (error) throw mapSupabaseError(error, 'Updating the announcement');
}
