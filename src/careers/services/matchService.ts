/**
 * Resume ↔ job matching: deterministic scores (keywords, industry, location,
 * salary) merged with the ten AI-scored categories, cached by the combined
 * content hash of resume text + job text so a pair is only ever scored once.
 */

import { supabase } from '../../lib/supabase';
import { matchResumeWithAI } from '../ai/tasks-jobs';
import type { CareerProfileRow, ResumeVersionRow } from '../types';
import type { JobKeywordReport, JobMatchRow, JobRow, MatchReport } from '../types/jobs';
import { CareersError, mapSupabaseError, withRetry } from '../utils/errors';
import { sha256OfText } from '../utils/hash';
import { getCachedAnalysis, saveAnalysis } from './analysisCache';
import { combineScores, deterministicScores, missingKeywords } from './matchEngine';

export interface MatchTarget {
  jobId?: string;
  descriptionId?: string;
  jobText: string;
  job: Pick<JobRow, 'industry' | 'location' | 'work_mode' | 'salary_min' | 'salary_max'>;
  analysis: NonNullable<JobRow['analysis']>;
  keywords: JobKeywordReport | null;
}

export async function matchResumeToJob(
  userId: string,
  version: ResumeVersionRow,
  profile: CareerProfileRow | null,
  target: MatchTarget,
  model = ''
): Promise<MatchReport> {
  if (!version.parsed || !version.raw_text) {
    throw new CareersError('validation', 'Pick a fully analysed resume version to match with.');
  }
  const inputSha = await sha256OfText(`${version.raw_text}\n::JOB::\n${target.jobText}`.toLowerCase());

  const cached = await getCachedAnalysis<MatchReport>(userId, inputSha, 'job-match').catch(() => null);
  if (cached) {
    await persistMatch(userId, version.id, target, cached, inputSha);
    return cached;
  }

  const { result: aiPart, model: usedModel, ms } = await withRetry(
    () => matchResumeWithAI(version.parsed!, version.career_dna, target.analysis, target.jobText, model),
    { attempts: 2 }
  );

  const det = deterministicScores({
    job: target.job,
    keywords: target.keywords,
    resumeText: version.raw_text,
    parsed: version.parsed,
    profile,
  });
  const { overall, scores } = combineScores(aiPart.scores, det);

  // Ground the keyword gaps deterministically — never let the model invent them.
  const gaps = missingKeywords(target.keywords, version.raw_text).slice(0, 8);
  if (gaps.length) {
    aiPart.insights.missingKeywords = gaps.map((keyword) => ({ text: keyword, priority: 'high' as const }));
  }

  const report: MatchReport = { overall, scores, insights: aiPart.insights };
  await saveAnalysis(userId, version.id, inputSha, 'job-match', usedModel, report, ms).catch(() => undefined);
  await persistMatch(userId, version.id, target, report, inputSha);
  return report;
}

async function persistMatch(
  userId: string,
  resumeVersionId: string,
  target: MatchTarget,
  report: MatchReport,
  inputSha: string
): Promise<void> {
  const { data: existing } = await supabase
    .from('job_matches')
    .select('id')
    .eq('user_id', userId)
    .eq('input_sha256', inputSha)
    .limit(1)
    .maybeSingle();
  if (existing) return;
  const { error } = await supabase.from('job_matches').insert({
    user_id: userId,
    job_id: target.jobId ?? null,
    description_id: target.descriptionId ?? null,
    resume_version_id: resumeVersionId,
    overall: report.overall,
    scores: report.scores,
    insights: report.insights,
    input_sha256: inputSha,
  });
  if (error) throw mapSupabaseError(error, 'Saving the match report');
}

export async function listMatches(userId: string): Promise<JobMatchRow[]> {
  const { data, error } = await supabase
    .from('job_matches')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw mapSupabaseError(error, 'Loading match history');
  return (data ?? []) as JobMatchRow[];
}
