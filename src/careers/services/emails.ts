/**
 * AI Email Generator (Phase 3, Module 5). Eleven job-search email types,
 * generated from the candidate's real data, fully editable and persisted
 * for reuse/tracking.
 */

import { supabase } from '../../lib/supabase';
import { generateEmailWithAI } from '../ai/tasks-phase3';
import type { ParsedResume, ResumeVersionRow } from '../types';
import type { EmailKind, GeneratedEmailRow } from '../types/phase3';
import { CareersError, mapSupabaseError, withRetry } from '../utils/errors';
import { sanitizeField, sanitizeProse } from '../utils/sanitize';

export async function listGeneratedEmails(userId: string): Promise<GeneratedEmailRow[]> {
  const { data, error } = await supabase
    .from('generated_emails')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw mapSupabaseError(error, 'Loading generated emails');
  return (data ?? []) as GeneratedEmailRow[];
}

export async function generateEmail(
  userId: string,
  version: ResumeVersionRow,
  kind: EmailKind,
  context: { company: string; jobTitle: string; recipientName: string; extra: string; applicationId?: string; recruiterId?: string },
  model = ''
): Promise<GeneratedEmailRow> {
  if (!version.parsed) {
    throw new CareersError('validation', 'Pick a fully analysed resume version first.');
  }
  const { result } = await withRetry(
    () => generateEmailWithAI(kind, version.parsed as ParsedResume, version.career_dna, context, model),
    { attempts: 2 }
  );
  const { data, error } = await supabase
    .from('generated_emails')
    .insert({
      user_id: userId,
      application_id: context.applicationId ?? null,
      recruiter_id: context.recruiterId ?? null,
      kind,
      subject: result.subject,
      body: result.body,
    })
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Saving the email');
  return data as GeneratedEmailRow;
}

export async function updateGeneratedEmail(userId: string, id: string, patch: Partial<GeneratedEmailRow>): Promise<GeneratedEmailRow> {
  const clean: Partial<GeneratedEmailRow> = { ...patch };
  if (clean.subject != null) clean.subject = sanitizeField(clean.subject, 200);
  if (clean.body != null) clean.body = sanitizeProse(clean.body, 4_000);
  const { data, error } = await supabase.from('generated_emails').update(clean).eq('user_id', userId).eq('id', id).select().single();
  if (error) throw mapSupabaseError(error, 'Updating the email');
  return data as GeneratedEmailRow;
}

export async function markEmailSent(userId: string, id: string): Promise<GeneratedEmailRow> {
  return updateGeneratedEmail(userId, id, { sent: true, sent_at: new Date().toISOString() });
}

export async function deleteGeneratedEmail(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('generated_emails').delete().eq('user_id', userId).eq('id', id);
  if (error) throw mapSupabaseError(error, 'Deleting the email');
}
