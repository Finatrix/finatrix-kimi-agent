/**
 * Phase 4.1 — Per-user Company Intelligence state: saved / favourite companies
 * and a recently-viewed trail. Backed by the RLS-scoped `ci_saved_companies`
 * and `ci_recent_companies` tables. Mirrors the userId-param convention used by
 * the other careers services.
 */

import { supabase } from '../../lib/supabase';
import { mapSupabaseError } from '../utils/errors';
import type { CiRecentCompanyRow, CiSavedCompanyRow } from '../types/companyIntel';

export async function listSavedCompanies(userId: string): Promise<CiSavedCompanyRow[]> {
  const { data, error } = await supabase
    .from('ci_saved_companies')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw mapSupabaseError(error, 'Loading saved companies');
  return (data ?? []) as CiSavedCompanyRow[];
}

export async function saveCompany(
  userId: string,
  companyId: string,
  favourite = false
): Promise<CiSavedCompanyRow> {
  const { data, error } = await supabase
    .from('ci_saved_companies')
    .upsert({ user_id: userId, company_id: companyId, favourite }, { onConflict: 'user_id,company_id' })
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Saving the company');
  return data as CiSavedCompanyRow;
}

export async function setFavourite(
  userId: string,
  companyId: string,
  favourite: boolean
): Promise<void> {
  const { error } = await supabase
    .from('ci_saved_companies')
    .upsert({ user_id: userId, company_id: companyId, favourite }, { onConflict: 'user_id,company_id' });
  if (error) throw mapSupabaseError(error, 'Updating favourite');
}

export async function unsaveCompany(userId: string, companyId: string): Promise<void> {
  const { error } = await supabase
    .from('ci_saved_companies')
    .delete()
    .eq('user_id', userId)
    .eq('company_id', companyId);
  if (error) throw mapSupabaseError(error, 'Removing the saved company');
}

export async function listRecentCompanies(userId: string, limit = 12): Promise<CiRecentCompanyRow[]> {
  const { data, error } = await supabase
    .from('ci_recent_companies')
    .select('*')
    .eq('user_id', userId)
    .order('viewed_at', { ascending: false })
    .limit(limit);
  if (error) throw mapSupabaseError(error, 'Loading recently viewed companies');
  return (data ?? []) as CiRecentCompanyRow[];
}

/** Record (or refresh) a company view. Best-effort: never throws to the UI. */
export async function recordCompanyView(userId: string, companyId: string): Promise<void> {
  const { error } = await supabase
    .from('ci_recent_companies')
    .upsert(
      { user_id: userId, company_id: companyId, viewed_at: new Date().toISOString() },
      { onConflict: 'user_id,company_id' }
    );
  if (error) throw mapSupabaseError(error, 'Recording the company view');
}
