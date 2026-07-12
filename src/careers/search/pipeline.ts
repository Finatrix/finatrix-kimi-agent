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
import { dedupeJobs } from './dedupe';
import { weightedScore, salaryFit } from './ranking';

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
  /** provider id → response time in ms (provider health display). */
  providerLatency: Record<string, number>;
  /** True when at least one provider ran and not all failed. */
  providersUp: boolean;
  /** Mean Resume Match % of returned jobs (null without a resume). */
  averageMatch: number | null;
  /** 0–100 composite: provider coverage + resume + query + classification. */
  searchConfidence: number;
  /** The four components that make up searchConfidence (each 0–100). */
  confidenceBreakdown: {
    providerCoverage: number;
    resume: number;
    query: number;
    classification: number;
  };
  /** 0–100: share of provider results that survived deterministic filtering,
   * rescaled — low values mean providers returned mostly junk. */
  filterConfidence: number;
  /** Duplicate postings collapsed across providers/pages. */
  duplicatesRemoved: number;
  /** Stage timings in ms (observability; never blocks). */
  timings: { dedupeMs: number; matchMs: number; rankMs: number; totalMs: number };
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
  latency?: Record<string, number>;
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

  const t0 = now();

  // 3 · Multi-signal de-duplication across pages/providers (apply URL, external
  // id, alias-normalized company + normalized title, near-identical description).
  const { unique, removed: duplicatesRemoved } = dedupeJobs(out.jobs);
  const enriched: EnrichedJob[] = unique.map(enrichJob);
  const dedupeMs = now() - t0;

  // 4 · Deterministic filtering (before any AI).
  const { accepted, rejected, verdicts } = filterJobs(enriched, params, intent);

  // 5 · Resume matching — every accepted job, no exceptions.
  const t1 = now();
  const prelim = accepted.map((job) => {
    const verdict = verdicts.get(job) ?? 'unknown';
    const { score, why } = relevanceScore(job, intent, verdict);
    const match = resume ? quickMatchJob(job, resume) : null;
    return { job, verdict, relevance: score, why, match };
  });
  const matchMs = now() - t1;

  // 6 · Weighted ranking + explainability + sort.
  const t2 = now();
  const scored: ScoredJob[] = prelim.map((p) => {
    const why = [...p.why];
    if (p.match?.matchedSkills.length) {
      why.push(`You bring: ${p.match.matchedSkills.slice(0, 4).join(', ')}`);
    }
    const remotePreferred = (params.remoteOnly || params.workMode === 'remote') && p.job.workMode === 'remote';
    if (remotePreferred) why.push('Remote — as you preferred');
    const graduateSuitable = params.freshersOnly && (p.job.seniority === 'intern' || p.job.employment === 'intern');
    if (graduateSuitable) why.push('Graduate / entry-level role');
    const fit = salaryFit(p.job.salary_min, p.job.salary_max, params.salaryMin, params.salaryMax);
    if (fit > 0.5) why.push('Salary fits your range');
    const { score } = weightedScore({
      relevance: p.relevance,
      resumeMatch: p.match ? p.match.overall : null,
      remotePreferred,
      graduateSuitable,
      salaryFit: fit,
      companyIntel: null, // CI score is layered on post-enrichment (search/rerank).
    });
    return { job: p.job, match: p.match, relevance: score, locationVerdict: p.verdict, why };
  });
  scored.sort((a, b) => b.relevance - a.relevance);
  const rankMs = now() - t2;

  // 7 · Search Quality Score + composite confidence.
  const rejectedByReason: Partial<Record<RejectReason, number>> = {};
  for (const r of rejected) rejectedByReason[r.reason] = (rejectedByReason[r.reason] ?? 0) + 1;
  const matches = scored.filter((s) => s.match).map((s) => s.match!.overall);
  const survival = enriched.length ? scored.length / enriched.length : 1;

  // Composite search confidence: provider coverage + resume + query + classification.
  const providerIds = Object.keys(out.status);
  const okProviders = providerIds.filter((id) => out.status[id] === 'ok').length;
  const coverageConf = providerIds.length ? Math.round((okProviders / providerIds.length) * 100) : 0;
  const resumeConf = matches.length ? Math.round(matches.reduce((a, b) => a + b, 0) / matches.length) : 0;
  const queryConf = intent.targetCategories.size ? 90 : params.query.trim() ? 55 : 0;
  const classified = scored.filter((s) => s.job.classification.category !== 'other');
  const classificationConf = classified.length
    ? Math.round(classified.reduce((a, s) => a + s.job.classification.confidence, 0) / classified.length)
    : 0;
  const searchConfidence = Math.round(
    coverageConf * 0.35 + resumeConf * 0.25 + queryConf * 0.25 + classificationConf * 0.15
  );

  const quality: SearchQuality = {
    returned: scored.length,
    rejected: rejected.length,
    rejectedByReason,
    providerCoverage: out.status,
    providerCounts: out.counts ?? {},
    providerLatency: out.latency ?? {},
    providersUp: out.providersUp ?? Object.values(out.status).some((s) => s === 'ok'),
    averageMatch: matches.length ? resumeConf : null,
    searchConfidence,
    confidenceBreakdown: {
      providerCoverage: coverageConf, resume: resumeConf, query: queryConf, classification: classificationConf,
    },
    filterConfidence: Math.round(Math.min(1, survival * 1.25) * 100),
    duplicatesRemoved,
    timings: { dedupeMs, matchMs, rankMs, totalMs: now() - t0 },
  };

  // Structured, secret-free observability log.
  logSearch({
    query: params.query.slice(0, 60),
    providers: out.status,
    jobsBeforeFilter: enriched.length,
    jobsAfterFilter: scored.length,
    duplicatesRemoved,
    timings: quality.timings,
    searchConfidence,
  });

  const report: SearchReport = { jobs: scored, rejected, quality, intent, page: out.page };
  cache.set(key, { report, at: Date.now() });
  return report;
}

/** Monotonic clock when available; falls back to Date.now in non-DOM envs. */
function now(): number {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

/** Structured search log — never includes tokens, keys, or PII. */
function logSearch(entry: Record<string, unknown>): void {
  if (typeof console === 'undefined') return;
  try {
    console.info('[careers-search]', JSON.stringify(entry));
  } catch {
    /* logging must never throw */
  }
}
