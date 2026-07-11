/**
 * Phase 4.1 — Company Enrichment stage.
 *
 * Runs AFTER the existing search pipeline (runSearchPipeline) and never touches
 * the original job source. For every scored job we identify the employer and
 * attach the matched Company Intelligence record, if any. This is a pure
 * decoration step — jobs with no CI match pass through unchanged, so the
 * existing search behaviour is fully preserved.
 *
 *   Search Jobs (as before) → identify employer → match CI → merge metadata
 *
 * The CI store is memoized, so enriching a page of results is O(jobs) map
 * lookups; the 804-company dataset has negligible impact.
 */

import type { ScoredJob } from './pipeline';
import { matchCompany, type CompanyIndex } from './companyMatch';
import { getCompanyStore } from '../services/companyIntelligence';
import type { CompanyIntel } from '../types/companyIntel';

export type IntelVia = 'exact' | 'normalized' | 'alias' | 'fuzzy';

export interface EnrichedScoredJob extends ScoredJob {
  /** Matched Company Intelligence record, or null when the employer is unknown. */
  intel: CompanyIntel | null;
  /** How the employer was matched — surfaced for transparency, never faked. */
  intelVia: IntelVia | null;
}

/** Decorate one job with CI metadata using a prebuilt index (sync, testable). */
export function enrichOne(job: ScoredJob, index: CompanyIndex): EnrichedScoredJob {
  const match = matchCompany(job.job.company, index);
  return { ...job, intel: match?.company ?? null, intelVia: match?.via ?? null };
}

/** Decorate a page of scored jobs. Loads (memoized) the CI store once. */
export async function enrichScoredJobs(jobs: ScoredJob[]): Promise<EnrichedScoredJob[]> {
  if (jobs.length === 0) return [];
  const store = await getCompanyStore();
  return jobs.map((j) => enrichOne(j, store.index));
}

/**
 * A concise, human-readable set of enrichment badges for a job card. Only
 * includes facts the dataset actually has — missing data is omitted.
 */
export function intelBadges(intel: CompanyIntel | null): string[] {
  if (!intel) return [];
  const badges: string[] = [];
  if (intel.industry) badges.push(intel.industry);
  if (intel.graduateFriendly || intel.graduatePrograms.length) badges.push('Graduate program');
  if (intel.internFriendly || intel.internships.length) badges.push('Internships');
  const ats = intel.ats.find((a) => a.detected_ats && a.detected_ats !== 'Unknown');
  if (ats) badges.push(`ATS: ${ats.detected_ats}`);
  if (intel.confidenceScore != null) badges.push(`Intel ${intel.confidenceScore}%`);
  return badges;
}
