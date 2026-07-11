/**
 * Phase 4.1 — Preference-aware re-ranking (Company Intelligence signals).
 *
 * EXTENDS the existing deterministic ranking without replacing it. The search
 * pipeline already ordered jobs by relevance + resume match; here we apply a
 * small, transparent boost from Company Intelligence + the user's saved
 * preferences, then re-sort. Pure and deterministic so it is unit-testable and
 * never changes the pipeline's own scoring.
 */

import type { EnrichedScoredJob } from './enrich';

export interface RankPreferences {
  preferredIndustries: string[];
  preferredLocations: string[];
  preferredDepartments: string[];
  preferredCompanyIds: string[];
}

export const EMPTY_PREFERENCES: RankPreferences = {
  preferredIndustries: [],
  preferredLocations: [],
  preferredDepartments: [],
  preferredCompanyIds: [],
};

export interface RerankedJob extends EnrichedScoredJob {
  /** Base pipeline score (relevance + match), preserved for transparency. */
  baseScore: number;
  /** Company-Intelligence + preference boost added on top (0 when no CI match). */
  intelBoost: number;
  /** Human-readable reasons for the boost. */
  boostWhy: string[];
}

const has = (list: string[], value: string): boolean =>
  !!value && list.some((x) => x.trim().toLowerCase() === value.trim().toLowerCase());

const includesAny = (list: string[], hay: string): boolean =>
  !!hay && list.some((x) => x.trim() && hay.toLowerCase().includes(x.trim().toLowerCase()));

/** Base pipeline score, mirroring the pipeline's own sort weighting. */
export function baseScore(j: EnrichedScoredJob): number {
  return j.match ? j.relevance * 0.5 + j.match.overall * 0.5 : j.relevance * 0.85;
}

/**
 * Compute the CI/preference boost for one job. Bounded so it nudges ordering
 * without ever swamping resume/relevance signal (max ~+22).
 */
export function intelBoost(j: EnrichedScoredJob, prefs: RankPreferences): { boost: number; why: string[] } {
  const why: string[] = [];
  let boost = 0;
  const intel = j.intel;
  if (!intel) return { boost, why };

  if (has(prefs.preferredCompanyIds, intel.id)) { boost += 10; why.push('Saved company'); }
  if (has(prefs.preferredIndustries, intel.industry)) { boost += 6; why.push(`Preferred industry: ${intel.industry}`); }
  if (prefs.preferredLocations.length &&
      (includesAny(prefs.preferredLocations, intel.hqCity) ||
       intel.locations.some((l) => includesAny(prefs.preferredLocations, l.city)))) {
    boost += 4; why.push('Preferred location');
  }
  if (prefs.preferredDepartments.length &&
      intel.departments.some((d) => has(prefs.preferredDepartments, d.function_name))) {
    boost += 3; why.push('Hires in your preferred department');
  }
  // Small quality signal from the intelligence base itself.
  if (intel.confidenceScore != null) boost += Math.min(2, intel.confidenceScore / 50);
  return { boost, why };
}

/**
 * Re-rank an enriched result page. Returns a new array ordered by
 * baseScore + intelBoost (descending), stable for equal scores.
 */
export function rerankByPreferences(
  jobs: EnrichedScoredJob[],
  prefs: RankPreferences
): RerankedJob[] {
  const scored = jobs.map((j, i) => {
    const base = baseScore(j);
    const { boost, why } = intelBoost(j, prefs);
    return { ...j, baseScore: base, intelBoost: boost, boostWhy: why, _i: i };
  });
  scored.sort((a, b) => (b.baseScore + b.intelBoost) - (a.baseScore + a.intelBoost) || a._i - b._i);
  return scored.map(({ _i, ...rest }) => { void _i; return rest; });
}
