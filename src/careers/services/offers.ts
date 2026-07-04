/**
 * Offer Management + AI Offer Analysis (Phase 3, Modules 12/13).
 */

import { supabase } from '../../lib/supabase';
import { analyzeOfferWithAI } from '../ai/tasks-phase3';
import type { ResumeVersionRow } from '../types';
import type { OfferRow, OfferStatus } from '../types/phase3';
import { CareersError, mapSupabaseError, withRetry } from '../utils/errors';
import { sanitizeField, sanitizeStringArray } from '../utils/sanitize';

export async function listOffers(userId: string): Promise<OfferRow[]> {
  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .eq('user_id', userId)
    .order('received_at', { ascending: false });
  if (error) throw mapSupabaseError(error, 'Loading offers');
  return (data ?? []) as OfferRow[];
}

export async function upsertOffer(
  userId: string,
  fields: Partial<OfferRow> & { company_name: string; job_title: string; id?: string }
): Promise<OfferRow> {
  const payload = {
    user_id: userId,
    application_id: fields.application_id ?? null,
    company_name: sanitizeField(fields.company_name, 200),
    job_title: sanitizeField(fields.job_title, 200),
    base_salary: fields.base_salary ?? null,
    bonus: fields.bonus ?? null,
    equity: sanitizeField(fields.equity ?? '', 100),
    currency: sanitizeField(fields.currency || 'INR', 8),
    visa_sponsorship: sanitizeField(fields.visa_sponsorship ?? '', 60),
    relocation: sanitizeField(fields.relocation ?? '', 200),
    benefits: sanitizeStringArray(fields.benefits ?? [], 20, 100),
    leave_days: fields.leave_days ?? null,
    insurance: sanitizeField(fields.insurance ?? '', 200),
    work_mode: sanitizeField(fields.work_mode ?? '', 20),
    work_hours: sanitizeField(fields.work_hours ?? '', 60),
    probation_months: fields.probation_months ?? null,
    notice_period: sanitizeField(fields.notice_period ?? '', 60),
    status: (fields.status ?? 'received') as OfferStatus,
    expires_at: fields.expires_at ?? null,
  };
  const query = fields.id
    ? supabase.from('offers').update(payload).eq('user_id', userId).eq('id', fields.id)
    : supabase.from('offers').insert(payload);
  const { data, error } = await query.select().single();
  if (error) throw mapSupabaseError(error, 'Saving the offer');
  return data as OfferRow;
}

export async function setOfferStatus(userId: string, id: string, status: OfferStatus): Promise<OfferRow> {
  const patch: Partial<OfferRow> = { status };
  if (status === 'accepted' || status === 'declined') patch.decided_at = new Date().toISOString();
  const { data, error } = await supabase.from('offers').update(patch).eq('user_id', userId).eq('id', id).select().single();
  if (error) throw mapSupabaseError(error, 'Updating the offer');
  return data as OfferRow;
}

export async function deleteOffer(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('offers').delete().eq('user_id', userId).eq('id', id);
  if (error) throw mapSupabaseError(error, 'Deleting the offer');
}

export async function analyzeOffer(userId: string, offer: OfferRow, version: ResumeVersionRow, model = ''): Promise<OfferRow> {
  if (!version.parsed) {
    throw new CareersError('validation', 'Pick a fully analysed resume version to analyse this offer against.');
  }
  const { result } = await withRetry(
    () => analyzeOfferWithAI(offer, version.parsed!, version.career_dna, model),
    { attempts: 2 }
  );
  const { data, error } = await supabase
    .from('offers')
    .update({ ai_analysis: result })
    .eq('user_id', userId)
    .eq('id', offer.id)
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Saving the analysis');
  return data as OfferRow;
}

/** Pure comparison table for side-by-side offer review. */
export function compareOffers(offers: OfferRow[]): { field: string; label: string }[] {
  return [
    { field: 'base_salary', label: 'Base salary' },
    { field: 'bonus', label: 'Bonus' },
    { field: 'equity', label: 'Equity' },
    { field: 'visa_sponsorship', label: 'Visa sponsorship' },
    { field: 'relocation', label: 'Relocation' },
    { field: 'work_mode', label: 'Work mode' },
    { field: 'notice_period', label: 'Notice period' },
  ].filter(() => offers.length > 0);
}
