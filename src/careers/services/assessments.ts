/**
 * Assessment Center (Phase 3, Module 11). Tracks online assessments, case
 * studies, psychometric/numerical/logical tests, coding tests and video
 * interviews — with results, links and prep resources.
 */

import { supabase } from '../../lib/supabase';
import type { AssessmentKind, AssessmentResource, AssessmentResult, AssessmentRow } from '../types/phase3';
import { mapSupabaseError } from '../utils/errors';
import { sanitizeField, sanitizeProse } from '../utils/sanitize';

export async function listAssessments(userId: string): Promise<AssessmentRow[]> {
  const { data, error } = await supabase
    .from('assessments')
    .select('*')
    .eq('user_id', userId)
    .order('due_at', { ascending: true, nullsFirst: false });
  if (error) throw mapSupabaseError(error, 'Loading assessments');
  return (data ?? []) as AssessmentRow[];
}

export async function upsertAssessment(
  userId: string,
  fields: Partial<AssessmentRow> & { title: string; id?: string }
): Promise<AssessmentRow> {
  const payload = {
    user_id: userId,
    application_id: fields.application_id ?? null,
    kind: (fields.kind ?? 'online') as AssessmentKind,
    title: sanitizeField(fields.title, 200),
    provider: sanitizeField(fields.provider ?? '', 150),
    link: sanitizeField(fields.link ?? '', 500),
    due_at: fields.due_at ?? null,
    notes: sanitizeProse(fields.notes ?? '', 3_000),
    resources: (fields.resources ?? []) as AssessmentResource[],
  };
  const query = fields.id
    ? supabase.from('assessments').update(payload).eq('user_id', userId).eq('id', fields.id)
    : supabase.from('assessments').insert(payload);
  const { data, error } = await query.select().single();
  if (error) throw mapSupabaseError(error, 'Saving the assessment');
  return data as AssessmentRow;
}

export async function completeAssessment(
  userId: string,
  id: string,
  result: AssessmentResult,
  score: number | null
): Promise<AssessmentRow> {
  const { data, error } = await supabase
    .from('assessments')
    .update({ result, score, completed_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', id)
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Recording the result');
  return data as AssessmentRow;
}

export async function deleteAssessment(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('assessments').delete().eq('user_id', userId).eq('id', id);
  if (error) throw mapSupabaseError(error, 'Deleting the assessment');
}

export function upcomingAssessments(items: AssessmentRow[], days = 7): AssessmentRow[] {
  const horizon = Date.now() + days * 86_400_000;
  return items.filter((a) => !a.completed_at && a.due_at && new Date(a.due_at).getTime() <= horizon);
}
