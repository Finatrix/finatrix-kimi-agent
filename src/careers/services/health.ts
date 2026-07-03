/**
 * Career Health Score — a deterministic, explainable formula over the user's
 * stored data (the AI coach adds narrative on top, never the number itself).
 * Every category is 0–100; the overall is a weighted mean.
 */

import type { CareerHealth, CoachContext } from '../types/jobs';
import { HEALTH_CATEGORIES } from '../types/jobs';

function clamp(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function computeCareerHealth(ctx: CoachContext): CareerHealth {
  const stats = ctx.applicationStats;
  const applied = stats.applied ?? 0;
  const interviews = stats.interviews ?? 0;
  const offers = stats.offers ?? 0;
  const total = stats.total ?? 0;

  const resume = clamp(ctx.resumeScore ?? 0);
  const ats = clamp(ctx.atsScore ?? 0);

  // Activity: applications submitted recently, capped — 10+ in play = full marks.
  const activity = clamp((total ? 20 : 0) + Math.min(80, applied * 8));

  // Interview readiness: practice scores + real interview conversion.
  const practiceAvg = ctx.interviewScores.length
    ? ctx.interviewScores.reduce((a, b) => a + b, 0) / ctx.interviewScores.length
    : 0;
  const conversion = applied ? Math.min(1, interviews / Math.max(1, applied)) : 0;
  const interview = clamp(
    ctx.interviewScores.length ? practiceAvg * 0.7 + conversion * 100 * 0.3 : conversion * 100 * 0.6 + (total ? 20 : 0)
  );

  const learning = clamp(ctx.learningProgress);

  // Market readiness: breadth of demonstrable skills + credentials on file.
  const market = clamp(Math.min(60, ctx.topSkills.length * 6) + (ctx.careerDna ? 20 : 0) + (resume >= 70 ? 20 : resume >= 50 ? 10 : 0));

  const byId: Record<string, number> = { resume, ats, activity, interview, learning, market };
  const categories = HEALTH_CATEGORIES.map(({ id, label }) => ({ id, label, score: byId[id] }));

  const WEIGHTS: Record<string, number> = { resume: 25, ats: 20, activity: 15, interview: 15, learning: 10, market: 15 };
  const overall = clamp(
    categories.reduce((sum, c) => sum + c.score * WEIGHTS[c.id], 0) /
      categories.reduce((sum, c) => sum + WEIGHTS[c.id], 0)
  );

  // Offer probability: base rates shaped by funnel performance and readiness.
  const offerRate = applied ? offers / applied : 0;
  const offerProbability = clamp(
    offerRate > 0 ? 40 + offerRate * 300 : overall * 0.55 + conversion * 100 * 0.25
  );

  const suggestions: string[] = [];
  if (resume < 70) suggestions.push('Lift your Resume Score above 70 — it is the biggest single factor in your Career Health.');
  if (ats < 70) suggestions.push('Fix the highest-priority ATS issues on your latest resume version.');
  if (applied === 0) suggestions.push('Apply to your first matched job — activity drives every downstream metric.');
  if (!ctx.interviewScores.length) suggestions.push('Run one mock interview to establish your interview readiness baseline.');
  if (learning < 30) suggestions.push('Start one item from your learning plan to close your top skill gap.');

  return { overall, categories, offerProbability, suggestions };
}
