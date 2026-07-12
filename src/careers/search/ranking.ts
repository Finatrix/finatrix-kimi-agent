/**
 * Phase 2.2 — Weighted ranking.
 *
 * Extends (does not replace) the pipeline's deterministic `relevanceScore`.
 * `relevance` already folds in title match, category confidence, location,
 * recency and provider quality. This layer blends it with Resume Match and adds
 * the remaining explicit signals — salary fit, remote preference, graduate
 * suitability and Company-Intelligence score — under documented, tunable
 * weights, and emits a per-signal breakdown for explainability.
 *
 * Pure & deterministic → unit-testable and identical run-to-run.
 */

export interface RankingSignals {
  /** 0–100 query relevance from relevanceScore(). */
  relevance: number;
  /** 0–100 Resume Match, or null when no resume is selected. */
  resumeMatch: number | null;
  /** true when the seeker asked for remote and the job is remote. */
  remotePreferred: boolean;
  /** true when a freshers/graduate search matched an intern/graduate role. */
  graduateSuitable: boolean;
  /** 0–1 salary fit against the requested band (1 = fully inside). */
  salaryFit: number;
  /** 0–100 Company-Intelligence confidence for the employer, or null. */
  companyIntel: number | null;
}

/** Documented weights — sum of the blended core is 1.0; bonuses are additive. */
export const RANK_WEIGHTS = {
  relevanceWithResume: 0.45,
  resumeMatch: 0.55,
  relevanceNoResume: 0.85,
  bonusSalary: 8,
  bonusRemote: 5,
  bonusGraduate: 6,
  bonusCompanyIntel: 8,
} as const;

export interface RankedScore {
  score: number;
  breakdown: {
    relevance: number;
    resumeMatch: number;
    salary: number;
    remote: number;
    graduate: number;
    companyIntel: number;
  };
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Weighted 0–100 score from the signals, with a per-component breakdown. */
export function weightedScore(s: RankingSignals): RankedScore {
  const core = s.resumeMatch != null
    ? s.relevance * RANK_WEIGHTS.relevanceWithResume + s.resumeMatch * RANK_WEIGHTS.resumeMatch
    : s.relevance * RANK_WEIGHTS.relevanceNoResume;

  const salary = s.salaryFit * RANK_WEIGHTS.bonusSalary;
  const remote = s.remotePreferred ? RANK_WEIGHTS.bonusRemote : 0;
  const graduate = s.graduateSuitable ? RANK_WEIGHTS.bonusGraduate : 0;
  const intel = s.companyIntel != null ? (s.companyIntel / 100) * RANK_WEIGHTS.bonusCompanyIntel : 0;

  return {
    score: clamp(core + salary + remote + graduate + intel),
    breakdown: {
      relevance: Math.round(s.resumeMatch != null ? s.relevance * RANK_WEIGHTS.relevanceWithResume : s.relevance * RANK_WEIGHTS.relevanceNoResume),
      resumeMatch: Math.round(s.resumeMatch != null ? s.resumeMatch * RANK_WEIGHTS.resumeMatch : 0),
      salary: Math.round(salary),
      remote,
      graduate,
      companyIntel: Math.round(intel),
    },
  };
}

/** 0–1 salary fit: 1 fully inside the requested band, tapering to 0 outside. */
export function salaryFit(
  jobMin: number | null,
  jobMax: number | null,
  wantMin: number | null,
  wantMax: number | null
): number {
  if (wantMin == null && wantMax == null) return 0; // no preference → no bonus
  const lo = jobMin ?? jobMax;
  const hi = jobMax ?? jobMin;
  if (lo == null || hi == null) return 0; // job has no salary → no bonus
  const reqLo = wantMin ?? 0;
  const reqHi = wantMax ?? Number.MAX_SAFE_INTEGER;
  // Overlap ratio of [lo,hi] with [reqLo,reqHi].
  const overlap = Math.max(0, Math.min(hi, reqHi) - Math.max(lo, reqLo));
  const span = Math.max(1, hi - lo);
  return Math.max(0, Math.min(1, overlap / span));
}
