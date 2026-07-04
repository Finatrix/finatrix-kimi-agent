/**
 * Recruiter CRM (Phase 3, Module 6). Owner-scoped recruiter records with a
 * relationship score and a logged interaction history.
 */

import { supabase } from '../../lib/supabase';
import type { InteractionKind, RecruiterInteractionRow, RecruiterRow } from '../types/phase3';
import { mapSupabaseError } from '../utils/errors';
import { sanitizeField, sanitizeProse } from '../utils/sanitize';

export async function listRecruiters(userId: string): Promise<RecruiterRow[]> {
  const { data, error } = await supabase
    .from('recruiters')
    .select('*')
    .eq('user_id', userId)
    .order('name');
  if (error) throw mapSupabaseError(error, 'Loading recruiters');
  return (data ?? []) as RecruiterRow[];
}

export async function upsertRecruiter(
  userId: string,
  fields: Partial<RecruiterRow> & { name: string; id?: string }
): Promise<RecruiterRow> {
  const payload = {
    user_id: userId,
    company_id: fields.company_id ?? null,
    name: sanitizeField(fields.name, 200),
    role: sanitizeField(fields.role ?? '', 150),
    company_name: sanitizeField(fields.company_name ?? '', 200),
    email: sanitizeField(fields.email ?? '', 200),
    phone: sanitizeField(fields.phone ?? '', 40),
    linkedin_url: sanitizeField(fields.linkedin_url ?? '', 400),
    notes: sanitizeProse(fields.notes ?? '', 4_000),
    relationship_score: Math.min(100, Math.max(0, fields.relationship_score ?? 50)),
  };
  const query = fields.id
    ? supabase.from('recruiters').update(payload).eq('user_id', userId).eq('id', fields.id)
    : supabase.from('recruiters').insert(payload);
  const { data, error } = await query.select().single();
  if (error) throw mapSupabaseError(error, 'Saving the recruiter');
  return data as RecruiterRow;
}

export async function deleteRecruiter(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('recruiters').delete().eq('user_id', userId).eq('id', id);
  if (error) throw mapSupabaseError(error, 'Deleting the recruiter');
}

export async function listInteractions(userId: string, recruiterId: string): Promise<RecruiterInteractionRow[]> {
  const { data, error } = await supabase
    .from('recruiter_interactions')
    .select('*')
    .eq('user_id', userId)
    .eq('recruiter_id', recruiterId)
    .order('occurred_at', { ascending: false });
  if (error) throw mapSupabaseError(error, 'Loading interaction history');
  return (data ?? []) as RecruiterInteractionRow[];
}

/** Logging an interaction bumps last_contact_at and nudges the relationship score up. */
export async function logInteraction(
  userId: string,
  recruiterId: string,
  kind: InteractionKind,
  body: string
): Promise<void> {
  const occurred_at = new Date().toISOString();
  const { error } = await supabase.from('recruiter_interactions').insert({
    user_id: userId,
    recruiter_id: recruiterId,
    kind,
    body: sanitizeProse(body, 2_000),
    occurred_at,
  });
  if (error) throw mapSupabaseError(error, 'Logging the interaction');
  const { data: current } = await supabase.from('recruiters').select('relationship_score').eq('id', recruiterId).single();
  const bump = kind === 'meeting' ? 8 : kind === 'call' ? 6 : 4;
  const nextScore = Math.min(100, ((current as { relationship_score: number } | null)?.relationship_score ?? 50) + bump);
  await supabase.from('recruiters').update({ last_contact_at: occurred_at, relationship_score: nextScore })
    .eq('user_id', userId).eq('id', recruiterId);
}

export function searchRecruiters(recruiters: RecruiterRow[], query: string): RecruiterRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return recruiters;
  return recruiters.filter((r) =>
    [r.name, r.role, r.company_name, r.email, r.notes].join(' ').toLowerCase().includes(q)
  );
}
