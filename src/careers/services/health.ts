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

  // ── Offer outlook ────────────────────────────────────────────────────────
  //
  // Was: `offerRate > 0 ? 40 + offerRate * 300 : …`, which had two defects that
  // made the figure indefensible as the percentage it is rendered as:
  //
  //   • A CLIFF at the first offer. Zero offers scored ~38; a single offer
  //     jumped straight to 40 + rate*300, so one event moved the number by
  //     forty points regardless of how many applications sat behind it.
  //   • SATURATION. One offer from three applications is a rate of 0.33, giving
  //     40 + 100 = 140 → clamped to 100. The product told a user with three
  //     applications that their offer probability was 100%.
  //
  // The rate is now smoothed toward a conservative base rate, so a small sample
  // is pulled to the prior rather than believed outright, and the funnel is one
  // weighted input alongside readiness instead of an either/or branch. Same
  // 0–100 scale, monotonic, no discontinuity.
  //
  // PRIOR_STRENGTH is expressed in pseudo-applications: with none of their own,
  // a user sits exactly at PRIOR_RATE; by 20 real applications their own record
  // carries half the weight.
  const PRIOR_STRENGTH = 20;
  const PRIOR_RATE = 0.03;
  const smoothedOfferRate = (offers + PRIOR_RATE * PRIOR_STRENGTH) / (applied + PRIOR_STRENGTH);
  // A sustained 10% application-to-offer rate is an exceptional real-world
  // result, so it anchors the top of the evidence scale rather than 100%.
  const funnelEvidence = clamp((smoothedOfferRate / 0.1) * 100);
  const offerProbability = clamp(overall * 0.5 + funnelEvidence * 0.3 + conversion * 100 * 0.2);

  const suggestions: string[] = [];
  if (resume < 70) suggestions.push('Lift your Resume Score above 70 — it is the biggest single factor in your Career Health.');
  if (ats < 70) suggestions.push('Fix the highest-priority ATS issues on your latest resume version.');
  if (applied === 0) suggestions.push('Apply to your first matched job — activity drives every downstream metric.');
  if (!ctx.interviewScores.length) suggestions.push('Run one mock interview to establish your interview readiness baseline.');
  if (learning < 30) suggestions.push('Start one item from your learning plan to close your top skill gap.');

  // Module 18 — deterministic fallback readiness scores; the AI coach may
  // override both with a data-grounded read once its narrative report lands.
  const promotionReadiness = clamp(overall * 0.5 + interview * 0.3 + learning * 0.2);
  const roleReadiness = clamp(resume * 0.4 + ats * 0.3 + market * 0.3);

  return { overall, categories, offerProbability, suggestions, promotionReadiness, roleReadiness };
}
