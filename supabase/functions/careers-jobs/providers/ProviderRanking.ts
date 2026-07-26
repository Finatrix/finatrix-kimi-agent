// Deterministic ranking. Ordering is explainable and reproducible: no ML, no
// per-request randomness. The score blends five signals; provider priority is
// one of them AND is the tie-breaker, so higher-priority sources win conflicts
// exactly as specified.

import type { FinatriXJob, SearchInput } from './types.ts';
import { normToken } from './sanitize.ts';

export interface RankWeights {
  priority: number;    // source priority (0–100, scaled)
  freshness: number;
  relevance: number;   // query term overlap with title/company
  quality: number;
  confidence: number;
}

export const DEFAULT_WEIGHTS: RankWeights = {
  priority: 0.30,
  freshness: 0.20,
  relevance: 0.30,
  quality: 0.10,
  confidence: 0.10,
};

const FRESHNESS_SCORE: Record<FinatriXJob['freshness'], number> = {
  today: 100, this_week: 80, this_month: 55, older: 25, unknown: 40,
};

/** 0–100 overlap of query terms with the job title (weighted) and company. */
export function relevanceScore(job: FinatriXJob, input: SearchInput): number {
  const terms = (input.terms.length ? input.terms : [input.query])
    .map(normToken).filter(Boolean);
  if (!terms.length) return 50;
  const title = normToken(job.title);
  const company = normToken(job.company);
  let hit = 0;
  for (const t of terms) {
    if (!t) continue;
    if (title.includes(t)) hit += 2;         // title match weighs double
    else if (company.includes(t) || normToken(job.description.slice(0, 400)).includes(t)) hit += 1;
  }
  const max = terms.length * 2;
  return Math.round(Math.min(100, (hit / max) * 100));
}

export interface RankedJob {
  job: FinatriXJob;
  score: number;
  breakdown: Record<keyof RankWeights, number>;
}

/**
 * Rank a deduped list. `priorityOf` maps provider id → 0–100 priority. Ordering
 * is stable: equal scores keep input order (which the manager pre-sorts by
 * provider priority), so higher-priority providers deterministically win ties.
 */
export function rank(
  jobs: FinatriXJob[],
  input: SearchInput,
  priorityOf: (provider: string) => number,
  weights: RankWeights = DEFAULT_WEIGHTS,
): RankedJob[] {
  const scored = jobs.map((job, i) => {
    const breakdown = {
      priority: priorityOf(job.provider),
      freshness: FRESHNESS_SCORE[job.freshness],
      relevance: relevanceScore(job, input),
      quality: job.quality,
      confidence: job.confidence,
    };
    const score =
      breakdown.priority * weights.priority +
      breakdown.freshness * weights.freshness +
      breakdown.relevance * weights.relevance +
      breakdown.quality * weights.quality +
      breakdown.confidence * weights.confidence;
    return { job, score: Math.round(score * 100) / 100, breakdown, _i: i };
  });
  scored.sort((a, b) => (b.score - a.score) || (a._i - b._i));
  return scored.map(({ job, score, breakdown }) => ({ job, score, breakdown }));
}
