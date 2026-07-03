/**
 * Job intelligence pipeline: text → cached AI analysis → stored structure.
 * Reuses the Phase 1 resume_analysis cache (kind-keyed by content hash), so
 * an identical job description is never analysed twice, and normalizes the
 * extracted skills/keywords into job_skills / job_keywords rows.
 */

import { supabase } from '../../lib/supabase';
import { analyzeJobWithAI } from '../ai/tasks-jobs';
import type { JobAnalysis, JobKeywordReport } from '../types/jobs';
import { mapSupabaseError, withRetry } from '../utils/errors';
import { sha256OfText } from '../utils/hash';
import { getCachedAnalysis, saveAnalysis } from './analysisCache';
import { trackEvent } from './analytics';

export interface JobIntelResult {
  analysis: JobAnalysis;
  keywords: JobKeywordReport;
}

/**
 * Analyse a job's text with caching. `target` links the normalized rows to
 * either a fetched job or a pasted description.
 */
export async function analyzeJobText(
  userId: string,
  jobText: string,
  target: { jobId?: string; descriptionId?: string },
  model = ''
): Promise<JobIntelResult> {
  const sha = await sha256OfText(jobText);
  const cached = await getCachedAnalysis<JobIntelResult>(userId, sha, 'job-analysis').catch(() => null);
  let result = cached;
  if (!result) {
    const { result: fresh, model: usedModel, ms } = await withRetry(
      () => analyzeJobWithAI(jobText, model),
      { attempts: 2 }
    );
    result = fresh;
    await saveAnalysis(userId, null, sha, 'job-analysis', usedModel, fresh, ms).catch(() => undefined);
    trackEvent('ai_completed', ms);
  }
  await persistAnalysis(userId, target, result);
  return result;
}

async function persistAnalysis(
  userId: string,
  target: { jobId?: string; descriptionId?: string },
  { analysis, keywords }: JobIntelResult
): Promise<void> {
  if (target.jobId) {
    const { error } = await supabase
      .from('jobs')
      .update({
        analysis,
        keywords,
        industry: analysis.extraction.industry || undefined,
        skills: analysis.skills.map((s) => s.name).slice(0, 60),
        responsibilities: analysis.extraction.responsibilities,
        benefits: analysis.extraction.benefits,
        experience: analysis.extraction.experienceRequired,
        education: analysis.extraction.education,
        visa_sponsorship: analysis.extraction.visaSponsorship || 'unknown',
      })
      .eq('user_id', userId)
      .eq('id', target.jobId);
    if (error) throw mapSupabaseError(error, 'Saving job analysis');
  }
  if (target.descriptionId) {
    const { error } = await supabase
      .from('job_descriptions')
      .update({
        analysis,
        keywords,
        title: analysis.extraction.title || undefined,
        company: analysis.extraction.company || undefined,
      })
      .eq('user_id', userId)
      .eq('id', target.descriptionId);
    if (error) throw mapSupabaseError(error, 'Saving the analysis');
  }

  // Rebuild normalized rows (idempotent: clear + insert, as in Phase 1).
  const link = target.jobId
    ? { column: 'job_id', value: target.jobId }
    : target.descriptionId
      ? { column: 'description_id', value: target.descriptionId }
      : null;
  if (!link) return;

  for (const table of ['job_skills', 'job_keywords'] as const) {
    await supabase.from(table).delete().eq('user_id', userId).eq(link.column, link.value);
  }
  if (analysis.skills.length) {
    await supabase.from('job_skills').insert(
      analysis.skills.map((s) => ({
        user_id: userId,
        [link.column]: link.value,
        name: s.name,
        category: s.category,
        required: s.required,
        weight: s.weight,
      }))
    );
  }
  if (keywords.keywords.length) {
    await supabase.from('job_keywords').insert(
      keywords.keywords.map((k) => ({
        user_id: userId,
        [link.column]: link.value,
        keyword: k.keyword,
        tier: k.tier,
        weight: k.weight,
        frequency: k.frequency,
      }))
    );
  }
}
