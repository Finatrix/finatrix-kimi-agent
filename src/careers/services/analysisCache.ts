/**
 * AI analysis cache. Results are keyed by (user, input hash, task kind) in
 * resume_analysis, so re-uploading the same file — or retrying a pipeline —
 * reuses stored results instead of spending AI tokens again.
 */

import { supabase } from '../../lib/supabase';
import { mapSupabaseError } from '../utils/errors';

export type AnalysisKind = 'parse' | 'dna' | 'score' | 'ats';

export async function getCachedAnalysis<T>(
  userId: string,
  inputSha256: string,
  kind: AnalysisKind
): Promise<T | null> {
  const { data, error } = await supabase
    .from('resume_analysis')
    .select('result')
    .eq('user_id', userId)
    .eq('input_sha256', inputSha256)
    .eq('kind', kind)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw mapSupabaseError(error, 'Checking cached analysis');
  return (data?.result as T) ?? null;
}

export async function saveAnalysis(
  userId: string,
  versionId: string | null,
  inputSha256: string,
  kind: AnalysisKind,
  model: string,
  result: unknown,
  durationMs: number
): Promise<void> {
  const { error } = await supabase.from('resume_analysis').insert({
    user_id: userId,
    version_id: versionId,
    kind,
    input_sha256: inputSha256,
    model,
    result,
    duration_ms: Math.round(durationMs),
  });
  if (error) throw mapSupabaseError(error, 'Caching analysis');
}
