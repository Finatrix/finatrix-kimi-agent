/**
 * Provider Operations — read-only admin data for the internal dashboard.
 *
 * Reads the rolling 24h aggregate views created by
 * supabase/careers_provider_infrastructure.sql. Access is gated by the views'
 * underlying RLS (platform admins only); a non-admin simply gets empty arrays.
 * Nothing here is shown to end users — provider identities live only in this
 * internal surface, never in the job-seeker UI.
 */

import { supabase } from '../../lib/supabase';

export interface ProviderOpsHealth {
  provider: string;
  calls: number;
  successRate: number;   // 0–1
  avgLatencyMs: number;
  jobsReturned: number;
  estCostUsd: number;
  lastCall: string | null;
}

export interface TopSearchTerm {
  term: string;
  searches: number;
  lastSearched: string | null;
}

/** Live availability + quota for one provider (rolling 24h). */
export interface ProviderStatus {
  provider: string;
  events: number;
  errorRate: number;            // 0–1
  lastSeen: string | null;
  lastSuccess: string | null;
  lastFailure: string | null;
  lastErrorKind: string | null;
  /** Vendor request budget remaining, or null if the vendor reports none. */
  quotaRemaining: number | null;
  /** Vendor job-credit budget — the binding constraint where it exists. */
  jobsRemaining: number | null;
}

export interface ProviderOpsSummary {
  health: ProviderOpsHealth[];
  status: ProviderStatus[];
  topTerms: TopSearchTerm[];
  totalSearches24h: number;
  totalJobs24h: number;
  estCost24hUsd: number;
  mostSuccessfulProvider: string | null;
  /** Share of searches served from cache, 0–1, or null when nothing recorded. */
  cacheHitRate: number | null;
}

export async function loadProviderOps(): Promise<ProviderOpsSummary> {
  const [{ data: healthRows }, { data: termRows }, { data: volumeRows }, { data: statusRows }] =
    await Promise.all([
      supabase.from('provider_ops_health').select('*'),
      supabase.from('provider_ops_top_terms').select('*'),
      // Added after the first release of this dashboard — tolerate their absence
      // so an older migration still renders everything else.
      supabase.from('provider_ops_search_volume').select('*').maybeSingle(),
      supabase.from('provider_ops_status').select('*'),
    ]);

  const health: ProviderOpsHealth[] = (healthRows ?? []).map((r: Record<string, unknown>) => ({
    provider: String(r.provider ?? ''),
    calls: Number(r.calls ?? 0),
    successRate: Number(r.success_rate ?? 0),
    avgLatencyMs: Number(r.avg_latency_ms ?? 0),
    jobsReturned: Number(r.jobs_returned ?? 0),
    estCostUsd: Number(r.est_cost_usd ?? 0),
    lastCall: (r.last_call as string | null) ?? null,
  }));

  const topTerms: TopSearchTerm[] = (termRows ?? []).map((r: Record<string, unknown>) => ({
    term: String(r.term ?? ''),
    searches: Number(r.searches ?? 0),
    lastSearched: (r.last_searched as string | null) ?? null,
  }));

  // `provider_ops_top_terms` is capped at 25 rows, so its sum is the volume of
  // the top terms only — never the true total. Prefer the dedicated volume view;
  // fall back to the (under-reporting) sum when that view is not migrated yet.
  const topTermsVolume = topTerms.reduce((s, t) => s + t.searches, 0);
  const volume = volumeRows as { searches?: number } | null;
  const totalSearches24h = Number(volume?.searches ?? topTermsVolume);

  const status: ProviderStatus[] = (statusRows ?? []).map((r: Record<string, unknown>) => ({
    provider: String(r.provider ?? ''),
    events: Number(r.events ?? 0),
    errorRate: Number(r.error_rate ?? 0),
    lastSeen: (r.last_seen as string | null) ?? null,
    lastSuccess: (r.last_success as string | null) ?? null,
    lastFailure: (r.last_failure as string | null) ?? null,
    lastErrorKind: (r.last_error_kind as string | null) ?? null,
    quotaRemaining: r.quota_remaining == null ? null : Number(r.quota_remaining),
    jobsRemaining: r.jobs_remaining == null ? null : Number(r.jobs_remaining),
  }));

  // `cache` is a synthetic provider row the manager records once per served
  // cache hit, so hit rate = cache rows ÷ (cache rows + real searches).
  const cacheRow = health.find((h) => h.provider === 'cache');
  const cacheHits = cacheRow?.calls ?? 0;
  const denominator = cacheHits + totalSearches24h;
  const cacheHitRate = denominator > 0 ? Math.round((cacheHits / denominator) * 1000) / 1000 : null;

  // The synthetic cache row is not a provider — keep it out of provider tables
  // and out of cost/jobs totals.
  const providerHealth = health.filter((h) => h.provider !== 'cache');
  const totalJobs24h = providerHealth.reduce((s, h) => s + h.jobsReturned, 0);
  const estCost24hUsd = Math.round(providerHealth.reduce((s, h) => s + h.estCostUsd, 0) * 10000) / 10000;
  const mostSuccessfulProvider = [...providerHealth]
    .sort((a, b) => (b.successRate * b.jobsReturned) - (a.successRate * a.jobsReturned))[0]?.provider ?? null;

  return {
    health: providerHealth, status, topTerms, totalSearches24h, totalJobs24h,
    estCost24hUsd, mostSuccessfulProvider, cacheHitRate,
  };
}
