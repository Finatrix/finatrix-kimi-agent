/**
 * Job search + persistence. Search fans out to the careers-jobs edge
 * function's provider registry; results the user keeps are normalized into
 * the jobs table, deduped by content hash so re-saving the same posting
 * never duplicates a row (or a later analysis).
 */

import { supabase } from '../../lib/supabase';
import { invokeAuthed } from '../../lib/functions';
import type {
  JobDescriptionRow,
  JobRow,
  JobSearchParams,
  NormalizedJob,
  SavedSearchRow,
} from '../types/jobs';
import { CareersError, mapSupabaseError } from '../utils/errors';
import { sha256OfText } from '../utils/hash';
import { sanitizeField, sanitizeText } from '../utils/sanitize';

export interface SearchOutcome {
  jobs: NormalizedJob[];
  /** provider id → ok | error | not-configured | skipped */
  status: Record<string, string>;
  /** provider id → number of jobs returned (after dedupe). */
  counts?: Record<string, number>;
  /** provider id → response time in ms (provider health). */
  latency?: Record<string, number>;
  /** provider id → short error string (only for failed providers). */
  errors?: Record<string, string>;
  /** True when at least one provider ran and not all of them failed. */
  providersUp?: boolean;
  /** How many providers actually ran (had secrets + supported the query). */
  ran?: number;
  page: number;
}

/**
 * Phase 2.1 provider fan-out. Raw, unfiltered provider results — all
 * filtering, matching and ranking happen in the deterministic search
 * pipeline (src/careers/search/pipeline.ts). `terms` are the intent
 * engine's expanded query terms; the edge function's provider adapters
 * translate them into each provider's native query syntax.
 */
export async function searchProviders(params: JobSearchParams, terms: string[] = []): Promise<SearchOutcome> {
  // `invokeAuthed` attaches the current user's JWT explicitly (the publishable
  // key is NOT a bearer token) and short-circuits when there is no session, so a
  // signed-out or not-yet-hydrated search never hits the platform with a missing
  // Authorization header (which returns a 401 the browser masks as a CORS error).
  const { data, error, reason } = await invokeAuthed<SearchOutcome>('careers-jobs', {
    query: params.query,
    terms: terms.slice(0, 18),
    location: params.location,
    country: params.country,
    remoteOnly: params.remoteOnly || params.workMode === 'remote',
    workMode: params.workMode,
    employmentType: params.employmentType,
    salaryMin: params.salaryMin,
    salaryMax: params.salaryMax,
    providers: params.providers.length ? params.providers : undefined,
    page: params.page,
  });
  if (reason === 'not-configured') {
    throw new CareersError(
      'not-setup',
      'Job search needs the Supabase backend configured (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).'
    );
  }
  if (reason === 'no-session') {
    throw new CareersError('auth', 'Sign in to search jobs.');
  }
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const status = ctx instanceof Response ? ctx.status : 0;
    // Try to read the backend's own error message (CORS-safe JSON), if any.
    let serverMessage = '';
    if (ctx instanceof Response) {
      try { serverMessage = String(((await ctx.clone().json()) as { error?: string })?.error ?? ''); }
      catch { /* not JSON — leave blank */ }
    }
    if (status === 401 || status === 403) {
      // Reaching here despite attaching a Bearer means the token was rejected
      // (expired/rotated) — a re-auth issue, never a CORS one. Show sign-in
      // guidance rather than the raw gateway string ("Missing authorization header").
      throw new CareersError('auth', 'Your session has expired. Please sign in again to search jobs.');
    }
    if (status === 404) {
      throw new CareersError(
        'not-setup',
        'The careers-jobs function is not deployed yet. Run "supabase functions deploy careers-jobs" (see SETUP.md §6).'
      );
    }
    if (status === 429) throw new CareersError('rate-limit', serverMessage || 'Too many searches. Wait a minute and try again.');
    if (status >= 500) {
      throw new CareersError('backend', serverMessage || 'The job search backend is temporarily unavailable. Please try again shortly.');
    }
    if (status === 0) {
      // No HTTP response reached us at all → network or CORS.
      throw new CareersError('network', 'Could not reach the job search service. Check your connection and try again.');
    }
    throw new CareersError('network', serverMessage || 'Job search failed. Please try again.');
  }
  const out = data as SearchOutcome;
  if (!Array.isArray(out?.jobs)) {
    throw new CareersError('unknown', 'The job search returned an unexpected response.');
  }
  return out;
}

/** Content fingerprint of a job posting (dedupe + analysis cache key). */
export function jobContentSha(job: Pick<NormalizedJob, 'company' | 'title' | 'description'>): Promise<string> {
  return sha256OfText(`${job.company}\n${job.title}\n${job.description}`.toLowerCase());
}

/** Persist a search result the user wants to keep (idempotent by sha). */
export async function saveJob(userId: string, job: NormalizedJob): Promise<JobRow> {
  const sha256 = await jobContentSha(job);
  const { data: existing, error: findErr } = await supabase
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('sha256', sha256)
    .limit(1)
    .maybeSingle();
  if (findErr) throw mapSupabaseError(findErr, 'Saving the job');
  if (existing) {
    if (!(existing as JobRow).is_saved) {
      return updateJob(userId, (existing as JobRow).id, { is_saved: true });
    }
    return existing as JobRow;
  }
  const { data, error } = await supabase
    .from('jobs')
    .insert({
      user_id: userId,
      source: sanitizeField(job.source, 40),
      external_id: sanitizeField(job.external_id, 200),
      company: sanitizeField(job.company, 200),
      title: sanitizeField(job.title, 300),
      industry: sanitizeField(job.industry, 120),
      description: sanitizeText(job.description, 30_000),
      salary_min: job.salary_min,
      salary_max: job.salary_max,
      currency: sanitizeField(job.currency, 8),
      location: sanitizeField(job.location, 200),
      country: sanitizeField(job.country, 8),
      work_mode: sanitizeField(job.work_mode, 20),
      employment_type: sanitizeField(job.employment_type, 60),
      apply_url: sanitizeField(job.apply_url, 600),
      posted_at: job.posted_at,
      closes_at: job.closes_at,
      is_saved: true,
      sha256,
      raw: { via: job.via },
    })
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Saving the job');
  return data as JobRow;
}

export async function listSavedJobs(userId: string): Promise<JobRow[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('is_saved', true)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw mapSupabaseError(error, 'Loading saved jobs');
  return (data ?? []) as JobRow[];
}

export async function updateJob(userId: string, jobId: string, patch: Partial<JobRow>): Promise<JobRow> {
  const { data, error } = await supabase
    .from('jobs')
    .update(patch)
    .eq('user_id', userId)
    .eq('id', jobId)
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Updating the job');
  return data as JobRow;
}

export async function deleteJob(userId: string, jobId: string): Promise<void> {
  const { error } = await supabase.from('jobs').delete().eq('user_id', userId).eq('id', jobId);
  if (error) throw mapSupabaseError(error, 'Removing the job');
}

// ─────────────────────────── pasted job descriptions ───────────────────────────

export async function saveJobDescription(
  userId: string,
  fields: { title: string; company: string; rawText: string }
): Promise<JobDescriptionRow> {
  const rawText = sanitizeText(fields.rawText, 40_000);
  const sha256 = await sha256OfText(rawText);
  const { data: existing } = await supabase
    .from('job_descriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('sha256', sha256)
    .limit(1)
    .maybeSingle();
  if (existing) return existing as JobDescriptionRow;
  const { data, error } = await supabase
    .from('job_descriptions')
    .insert({
      user_id: userId,
      title: sanitizeField(fields.title, 200),
      company: sanitizeField(fields.company, 200),
      raw_text: rawText,
      sha256,
    })
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Saving the job description');
  return data as JobDescriptionRow;
}

export async function listJobDescriptions(userId: string): Promise<JobDescriptionRow[]> {
  const { data, error } = await supabase
    .from('job_descriptions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw mapSupabaseError(error, 'Loading analysed descriptions');
  return (data ?? []) as JobDescriptionRow[];
}

// ─────────────────────────── saved searches ───────────────────────────

export async function listSavedSearches(userId: string): Promise<SavedSearchRow[]> {
  const { data, error } = await supabase
    .from('saved_searches')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw mapSupabaseError(error, 'Loading saved searches');
  return (data ?? []) as SavedSearchRow[];
}

export async function saveSearch(userId: string, name: string, params: JobSearchParams): Promise<SavedSearchRow> {
  const { data, error } = await supabase
    .from('saved_searches')
    .insert({ user_id: userId, name: sanitizeField(name, 80) || 'Saved search', params, alert_enabled: true })
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Saving the search');
  return data as SavedSearchRow;
}

export async function deleteSavedSearch(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('saved_searches').delete().eq('user_id', userId).eq('id', id);
  if (error) throw mapSupabaseError(error, 'Deleting the saved search');
}
