/**
 * Networking CRM (Phase 3, Module 7). Mentors, hiring managers, employees,
 * referrals, alumni and event contacts — one relationship ledger with
 * follow-up reminders.
 */

import { supabase } from '../../lib/supabase';
import type { NetworkContactRow, NetworkInteractionRow, NetworkRelationship } from '../types/phase3';
import { mapSupabaseError } from '../utils/errors';
import { sanitizeField, sanitizeProse } from '../utils/sanitize';

export async function listNetworkContacts(userId: string): Promise<NetworkContactRow[]> {
  const { data, error } = await supabase
    .from('network_contacts')
    .select('*')
    .eq('user_id', userId)
    .order('name');
  if (error) throw mapSupabaseError(error, 'Loading your network');
  return (data ?? []) as NetworkContactRow[];
}

export async function upsertNetworkContact(
  userId: string,
  fields: Partial<NetworkContactRow> & { name: string; id?: string }
): Promise<NetworkContactRow> {
  const payload = {
    user_id: userId,
    name: sanitizeField(fields.name, 200),
    relationship: (fields.relationship ?? 'connection') as NetworkRelationship,
    company_name: sanitizeField(fields.company_name ?? '', 200),
    university: sanitizeField(fields.university ?? '', 200),
    event_name: sanitizeField(fields.event_name ?? '', 200),
    email: sanitizeField(fields.email ?? '', 200),
    linkedin_url: sanitizeField(fields.linkedin_url ?? '', 400),
    notes: sanitizeProse(fields.notes ?? '', 4_000),
    follow_up_at: fields.follow_up_at ?? null,
  };
  const query = fields.id
    ? supabase.from('network_contacts').update(payload).eq('user_id', userId).eq('id', fields.id)
    : supabase.from('network_contacts').insert(payload);
  const { data, error } = await query.select().single();
  if (error) throw mapSupabaseError(error, 'Saving the contact');
  return data as NetworkContactRow;
}

export async function deleteNetworkContact(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('network_contacts').delete().eq('user_id', userId).eq('id', id);
  if (error) throw mapSupabaseError(error, 'Removing the contact');
}

export async function listNetworkInteractions(userId: string, contactId: string): Promise<NetworkInteractionRow[]> {
  const { data, error } = await supabase
    .from('network_interactions')
    .select('*')
    .eq('user_id', userId)
    .eq('contact_id', contactId)
    .order('occurred_at', { ascending: false });
  if (error) throw mapSupabaseError(error, 'Loading conversation history');
  return (data ?? []) as NetworkInteractionRow[];
}

export async function logNetworkInteraction(userId: string, contactId: string, body: string): Promise<void> {
  const occurred_at = new Date().toISOString();
  const { error } = await supabase.from('network_interactions').insert({
    user_id: userId,
    contact_id: contactId,
    body: sanitizeProse(body, 2_000),
    occurred_at,
  });
  if (error) throw mapSupabaseError(error, 'Logging the conversation');
  await supabase.from('network_contacts').update({ last_contact_at: occurred_at }).eq('user_id', userId).eq('id', contactId);
}

export function dueFollowUps(contacts: NetworkContactRow[], withinDays = 7): NetworkContactRow[] {
  const horizon = Date.now() + withinDays * 86_400_000;
  return contacts.filter((c) => c.follow_up_at && new Date(c.follow_up_at).getTime() <= horizon);
}
