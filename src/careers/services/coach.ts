/**
 * AI Career Coach: builds a compact context from the user's stored data
 * (never anything external), computes the deterministic Career Health Score,
 * and asks the AI only for narrative — insights, roadmap, learning and
 * certification recommendations — cached daily.
 */

import { supabase } from '../../lib/supabase';
import { assistantAnswerWithAI, coachReportWithAI } from '../ai/tasks-jobs';
import type { CareerProfileRow, ResumeVersionRow, ResumeWithVersions } from '../types';
import type {
  ApplicationRow,
  CoachContext,
  CoachReport,
  InterviewSessionRow,
  LearningItem,
} from '../types/jobs';
import { mapSupabaseError, withRetry } from '../utils/errors';
import { sha256OfText } from '../utils/hash';
import { getCachedAnalysis, saveAnalysis } from './analysisCache';
import { computeApplicationStats } from './applications';
import { computeCareerHealth } from './health';
import { sessionScores } from './interviews';
import type { CoachAiPart } from '../ai/validate-jobs';

function latestCompleteVersion(resumes: ResumeWithVersions[]): ResumeVersionRow | null {
  let best: ResumeVersionRow | null = null;
  for (const r of resumes) {
    for (const v of r.versions) {
      if (v.status !== 'complete') continue;
      if (!best || v.updated_at > best.updated_at) best = v;
    }
  }
  return best;
}

export function buildCoachContext(input: {
  profile: CareerProfileRow | null;
  resumes: ResumeWithVersions[];
  applications: ApplicationRow[];
  sessions: InterviewSessionRow[];
  learningProgress: number;
}): CoachContext {
  const latest = latestCompleteVersion(input.resumes);
  const stats = computeApplicationStats(input.applications);
  const parsed = latest?.parsed ?? null;
  const p = input.profile;
  return {
    profile: {
      jobTitle: p?.job_title ?? '',
      preferredRole: p?.preferred_role ?? '',
      preferredIndustry: p?.preferred_industry ?? '',
      years: p?.years_experience ?? null,
      qualification: p?.highest_qualification ?? '',
      location: p?.location_preference ?? '',
      salaryExpectation: p?.salary_expectation ?? '',
    },
    careerDna: latest?.career_dna ?? p?.career_dna ?? null,
    resumeScore: latest?.resume_score ?? null,
    atsScore: latest?.ats_score ?? null,
    topSkills: parsed
      ? [...parsed.skills.technical, ...parsed.skills.tools, ...parsed.skills.frameworks].slice(0, 20)
      : (p?.primary_skills ?? []),
    applicationStats: {
      total: stats.total,
      applied: stats.applied,
      interviews: stats.interviews,
      offers: stats.offers,
      rejections: stats.rejections,
      interviewRate: stats.interviewRate,
      successRate: stats.successRate,
    },
    recentApplications: input.applications.slice(0, 10).map((a) => ({
      company: a.company_name,
      title: a.job_title,
      stage: a.stage,
      matchScore: a.match_score,
    })),
    interviewScores: sessionScores(input.sessions),
    learningProgress: input.learningProgress,
  };
}

/** Full coach report: deterministic health + cached AI narrative. */
export async function getCoachReport(
  userId: string,
  context: CoachContext,
  focus: string,
  model = ''
): Promise<CoachReport> {
  const health = computeCareerHealth(context);
  // Cache key includes the calendar date: the coach refreshes at most daily
  // for unchanged data.
  const sha = await sha256OfText(
    `${new Date().toISOString().slice(0, 10)}::${focus}::${JSON.stringify(context)}`
  );
  let ai = await getCachedAnalysis<CoachAiPart>(userId, sha, 'coach').catch(() => null);
  if (!ai) {
    const { result, model: usedModel, ms } = await withRetry(
      () => coachReportWithAI(context, focus, model),
      { attempts: 2 }
    );
    ai = result;
    await saveAnalysis(userId, null, sha, 'coach', usedModel, result, ms).catch(() => undefined);
  }
  health.suggestions = [...new Set([...health.suggestions, ...ai.healthSuggestions])].slice(0, 8);
  // AI readiness reads override the deterministic fallback once available.
  if (ai.promotionReadiness > 0) health.promotionReadiness = ai.promotionReadiness;
  if (ai.roleReadiness > 0) health.roleReadiness = ai.roleReadiness;
  return {
    health,
    insights: ai.insights,
    roadmap: ai.roadmap,
    learning: ai.learning,
    certifications: ai.certifications,
    marketTrends: ai.marketTrends,
    salaryForecast: ai.salaryForecast,
  };
}

/** Data-grounded Q&A ("Which application needs follow-up?"). Not cached — questions vary. */
export async function askAssistant(
  context: CoachContext,
  question: string,
  model = ''
): Promise<{ answer: string; references: string[] }> {
  const { result } = await withRetry(() => assistantAnswerWithAI(context, question, model), { attempts: 2 });
  return result;
}

// ─────────────────────────── learning paths ───────────────────────────

export interface LearningPathRow {
  id: string;
  user_id: string;
  title: string;
  target_role: string;
  items: LearningItem[];
  progress: number;
  created_at: string;
  updated_at: string;
}

export async function listLearningPaths(userId: string): Promise<LearningPathRow[]> {
  const { data, error } = await supabase
    .from('learning_paths')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw mapSupabaseError(error, 'Loading learning paths');
  return (data ?? []) as LearningPathRow[];
}

export async function saveLearningPath(
  userId: string,
  fields: { id?: string; title: string; targetRole: string; items: LearningItem[] }
): Promise<LearningPathRow> {
  const progress = fields.items.length
    ? Math.round((fields.items.filter((i) => i.done).length / fields.items.length) * 100)
    : 0;
  if (fields.id) {
    const { data, error } = await supabase
      .from('learning_paths')
      .update({ title: fields.title, target_role: fields.targetRole, items: fields.items, progress })
      .eq('user_id', userId)
      .eq('id', fields.id)
      .select()
      .single();
    if (error) throw mapSupabaseError(error, 'Saving the learning path');
    return data as LearningPathRow;
  }
  const { data, error } = await supabase
    .from('learning_paths')
    .insert({ user_id: userId, title: fields.title, target_role: fields.targetRole, items: fields.items, progress })
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Saving the learning path');
  return data as LearningPathRow;
}

/** Average learning-path progress (career health input). */
export function overallLearningProgress(paths: LearningPathRow[]): number {
  if (!paths.length) return 0;
  return Math.round(paths.reduce((sum, p) => sum + p.progress, 0) / paths.length);
}
