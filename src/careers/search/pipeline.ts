/**
 * Phase 2.1 — Search pipeline orchestrator. The one entry point the UI calls:
 *
 *   User Search → Intent Builder → Query Expansion → Provider Query Builder
 *   (edge function) → Provider Search → Normalization → Deterministic
 *   Filtering → Resume Matching → Ranking → Business Rules → Sorting →
 *   Display
 *
 * Deterministic end-to-end: providers fan out server-side, everything after
 * normalization runs here where it is unit-testable. Results are cached by
 * search-hash + resume version so re-running an identical search is free.
 */

import type { JobSearchParams, NormalizedJob } from '../types/jobs';
import { buildIntent, type SearchIntent } from './intent';
import { filterJobs, type RejectedJob, type RejectReason } from './filter';
import type { LocationVerdict } from './locations';
import { enrichJob, type EnrichedJob } from './normalize';
import { quickMatchJob, type QuickMatch, type QuickMatchInput } from './quickMatch';
import { containsTerm } from './taxonomy';

export interface ScoredJob {
  job: EnrichedJob;
  /** Deterministic Resume Match — null only when no resume is selected. */
  match: QuickMatch | null;
  /** 0–100 query relevance (title, category, location, recency, provider). */
  relevance: number;
  locationVerdict: LocationVerdict;
  /** Human-readable "why this job" evidence. */
  why: string[];
}

export interface SearchQuality {
  returned: number;
  rejected: number;
  rejectedByReason: Partial<Record<RejectReason, number>>;
  /** provider id → ok | error | not-configured | skipped */
  providerCoverage: Record<string, string>;
  /** provider id → number of jobs returned (before filtering). */
  providerCounts: Record<string, number>;
  /** True when at least one provider ran and not all failed. */
  providersUp: boolean;
  /** Mean Resume Match % of returned jobs (null without a resume). */
  averageMatch: number | null;
  /** 0–100: how confidently the intent engine understood the query. */
  searchConfidence: number;
  /** 0–100: share of provider results that survived deterministic filtering,
   * rescaled — low values mean providers returned mostly junk. */
  filterConfidence: number;
}

export interface SearchReport {
  jobs: ScoredJob[];
  rejected: RejectedJob[];
  quality: SearchQuality;
  intent: SearchIntent;
  page: number;
}

/** Provider fan-out contract (implemented by jobsService.searchProviders). */
export type ProviderFetcher = (
  params: JobSearchParams,
  expandedTerms: string[]
) => Promise<{
  jobs: NormalizedJob[];
  status: Record<string, string>;
  counts?: Record<string, number>;
  providersUp?: boolean;
  page: number;
}>;

// ─────────────────────────── ranking ───────────────────────────

const PROVIDER_CONFIDENCE: Record<string, number> = {
  jsearch: 10, adzuna: 9, jooble: 7, remotive: 6,
};

export function relevanceScore(
  job: EnrichedJob,
  intent: SearchIntent,
  verdict: LocationVerdict
): { score: number; why: string[] } {
  const why: string[] = [];
  let score = 0;
  const title = job.title.toLowerCase();

  // Title intent match — the strongest signal (0–40).
  const titleHit = intent.priorityTitles.find((t) => containsTerm(title, t));
  if (titleHit) {
    score += 40;
    why.push(`Title matches "${titleHit}"`);
  } else if (intent.rawQuery && containsTerm(title, intent.rawQuery)) {
    score += 34;
    why.push(`Title contains "${intent.rawQuery}"`);
  } else if (intent.expandedTerms.some((t) => containsTerm(title, t))) {
    score += 26;
    why.push('Title matches an expanded search term');
  }

  // Category confidence (0–25).
  if (intent.targetCategories.has(job.classification.category)) {
    score += Math.round((job.classification.confidence / 100) * 25);
    why.push(`Classified as ${job.classification.category} (${job.classification.confidence}% confidence)`);
  } else if (job.classification.category !== 'other') {
    score += 8;
  }

  // Location (0–15).
  if (verdict === 'match') { score += 15; why.push('In your searched location'); }
  else if (verdict === 'nearby') { score += 9; why.push('Near your searched location'); }
  else if (verdict === 'remote') { score += 7; why.push('Remote — works from your location'); }
  else score += 4;

  // Recency (0–10).
  if (job.posted_at) {
    const days = (Date.now() - new Date(job.posted_at).getTime()) / 86_400_000;
    score += days <= 7 ? 10 : days <= 30 ? 6 : 2;
  } else {
    score += 4;
  }

  // Provider confidence (0–10).
  score += PROVIDER_CONFIDENCE[job.source] ?? 5;

  return { score: Math.min(100, score), why };
}

// ─────────────────────────── caching ───────────────────────────

interface CacheEntry { report: SearchReport; at: number }
const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, CacheEntry>();

function cacheKey(params: JobSearchParams, resumeKey: string): string {
  const p = { ...params, providers: [...params.providers].sort() };
  return `${JSON.stringify(p)}::${resumeKey}`;
}

/** Test hook / settings action. */
export function clearSearchCache(): void {
  cache.clear();
}

// ─────────────────────────── pipeline ───────────────────────────

export interface PipelineOptions {
  /** Identifies the resume for cache-keying (version id + sha). */
  resumeKey?: string;
  signal?: AbortSignal;
  skipCache?: boolean;
}

export async function runSearchPipeline(
  params: JobSearchParams,
  resume: QuickMatchInput | null,
  fetcher: ProviderFetcher,
  options: PipelineOptions = {}
): Promise<SearchReport> {
  const resumeKey = options.resumeKey ?? (resume ? 'resume' : 'none');
  const key = cacheKey(params, resumeKey);
  const hit = cache.get(key);
  if (!options.skipCache && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.report;

  // 1 · Intent + expansion.
  const intent = buildIntent(params.query, params.industry);

  // 2 · Provider fan-out (adapters live in the edge function).
  const out = await fetcher(params, intent.expandedTerms);
  if (options.signal?.aborted) throw new DOMException('Search aborted', 'AbortError');

  // 3 · Normalization enrichment + dedupe across pages/providers.
  const seen = new Set<string>();
  const enriched: EnrichedJob[] = [];
  for (const raw of out.jobs) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const dk = `${norm(raw.company)}::${norm(raw.title)}::${norm(raw.location).slice(0, 24)}`;
    if (seen.has(dk)) continue;
    seen.add(dk);
    enriched.push(enrichJob(raw));
  }

  // 4 · Deterministic filtering (before any AI).
  const { accepted, rejected, verdicts } = filterJobs(enriched, params, intent);

  // 5 · Resume matching — every accepted job, no exceptions.
  // 6 · Ranking + sorting: relevance and match matter equally.
  const scored: ScoredJob[] = accepted.map((job) => {
    const verdict = verdicts.get(job) ?? 'unknown';
    const { score, why } = relevanceScore(job, intent, verdict);
    const match = resume ? quickMatchJob(job, resume) : null;
    if (match?.matchedSkills.length) {
      why.push(`You bring: ${match.matchedSkills.slice(0, 4).join(', ')}`);
    }
    return { job, match, relevance: score, locationVerdict: verdict, why };
  });
  scored.sort((a, b) => {
    const av = a.match ? a.relevance * 0.5 + a.match.overall * 0.5 : a.relevance * 0.85;
    const bv = b.match ? b.relevance * 0.5 + b.match.overall * 0.5 : b.relevance * 0.85;
    return bv - av;
  });

  // 7 · Search Quality Score.
  const rejectedByReason: Partial<Record<RejectReason, number>> = {};
  for (const r of rejected) rejectedByReason[r.reason] = (rejectedByReason[r.reason] ?? 0) + 1;
  const matches = scored.filter((s) => s.match).map((s) => s.match!.overall);
  const survival = enriched.length ? scored.length / enriched.length : 1;
  const quality: SearchQuality = {
    returned: scored.length,
    rejected: rejected.length,
    rejectedByReason,
    providerCoverage: out.status,
    providerCounts: out.counts ?? {},
    providersUp: out.providersUp ?? Object.values(out.status).some((s) => s === 'ok'),
    averageMatch: matches.length ? Math.round(matches.reduce((a, b) => a + b, 0) / matches.length) : null,
    searchConfidence: intent.targetCategories.size ? 90 : params.query ? 55 : 0,
    filterConfidence: Math.round(Math.min(1, survival * 1.25) * 100),
  };

  const report: SearchReport = { jobs: scored, rejected, quality, intent, page: out.page };
  cache.set(key, { report, at: Date.now() });
  return report;
}
