// Truthful trust/quality badges.
//
// DESIGN NOTE (deliberate, please read before "adding a Verified badge"):
// Every badge here is derived from an observable fact — a real posting date, a
// real salary range, a real confidence score, an enrichment that actually ran.
// We intentionally do NOT emit a generic "Verified by FinatriX" / "Verified
// today" badge on aggregated third-party listings, because FinatriX has not
// verified those jobs (that the role is real, still open, and not a scam). In a
// domain where fake/scam postings are a genuine harm, stamping "verified" on an
// unverified listing would mislead users. If a real verification signal is added
// later (apply-link reachability + scam heuristics), THAT can earn a badge here.

import type { BadgeKey, FinatriXJob, Freshness } from './types.ts';

/** Human-facing copy for each earned badge. No vendor/provider names appear. */
export const BADGE_LABELS: Record<BadgeKey, string> = {
  posted_today: 'Posted today',
  fresh_this_week: 'Fresh listing',
  updated_recently: 'Updated recently',
  salary_listed: 'Salary listed',
  remote_friendly: 'Remote-friendly',
  high_confidence: 'High-confidence match',
  ai_summary: 'AI summary',
  skills_matched: 'Matches your skills',
};

export function freshnessOf(postedIso: string | null, now = Date.now()): Freshness {
  if (!postedIso) return 'unknown';
  const t = new Date(postedIso).getTime();
  if (Number.isNaN(t)) return 'unknown';
  const days = (now - t) / 86_400_000;
  if (days < 0) return 'today';       // future/clock skew → treat as fresh, not "older"
  if (days < 1) return 'today';
  if (days < 7) return 'this_week';
  if (days < 31) return 'this_month';
  return 'older';
}

/**
 * Compute the earned badges for a job. `aiSummarised` and `skillOverlap` are
 * passed by the enrichment layer so a badge is only shown when the thing it
 * claims actually happened.
 */
export function computeBadges(
  job: Pick<FinatriXJob, 'freshness' | 'salary' | 'workMode' | 'remoteProbability' | 'confidence'>,
  opts: { aiSummarised?: boolean; skillOverlap?: boolean } = {},
): BadgeKey[] {
  const out: BadgeKey[] = [];
  if (job.freshness === 'today') out.push('posted_today');
  else if (job.freshness === 'this_week') out.push('fresh_this_week');
  else if (job.freshness === 'this_month') out.push('updated_recently');

  if (job.salary.min != null || job.salary.max != null) out.push('salary_listed');
  if (job.workMode === 'remote' || job.remoteProbability >= 0.6) out.push('remote_friendly');
  if (job.confidence >= 80) out.push('high_confidence');
  if (opts.aiSummarised) out.push('ai_summary');
  if (opts.skillOverlap) out.push('skills_matched');
  return out;
}
