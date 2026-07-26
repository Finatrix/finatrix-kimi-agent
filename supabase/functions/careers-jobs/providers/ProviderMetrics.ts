// Metrics aggregation for the admin dashboards: search volume, per-provider
// success rate and latency, rough API cost estimate, and top search terms.
// Pure aggregation over event rows; the durable store is injected.

import type { MetricEvent } from './types.ts';

export interface ProviderRollup {
  provider: string;
  calls: number;
  successRate: number;    // 0–1
  avgLatencyMs: number;
  jobsReturned: number;
  costUsd: number;        // estimated
}

export interface MetricsSummary {
  totalSearches: number;
  totalJobs: number;
  estCostUsd: number;
  byProvider: ProviderRollup[];
  /** Most successful provider = highest (successRate × jobsReturned). */
  mostSuccessfulProvider: string | null;
}

export function rollup(events: MetricEvent[]): MetricsSummary {
  const byId = new Map<string, MetricEvent[]>();
  for (const e of events) {
    const arr = byId.get(e.provider) ?? [];
    arr.push(e); byId.set(e.provider, arr);
  }
  const byProvider: ProviderRollup[] = [];
  let totalJobs = 0, estCostMicro = 0;
  for (const [provider, evs] of byId) {
    const calls = evs.length;
    const ok = evs.filter((e) => e.ok).length;
    const jobs = evs.reduce((s, e) => s + e.jobs, 0);
    const cost = evs.reduce((s, e) => s + e.costMicroUsd, 0);
    totalJobs += jobs; estCostMicro += cost;
    byProvider.push({
      provider,
      calls,
      successRate: calls ? Math.round((ok / calls) * 100) / 100 : 0,
      avgLatencyMs: calls ? Math.round(evs.reduce((s, e) => s + e.ms, 0) / calls) : 0,
      jobsReturned: jobs,
      costUsd: Math.round((cost / 1_000_000) * 10000) / 10000,
    });
  }
  byProvider.sort((a, b) => b.jobsReturned - a.jobsReturned);
  const mostSuccessful = [...byProvider].sort(
    (a, b) => (b.successRate * b.jobsReturned) - (a.successRate * a.jobsReturned),
  )[0]?.provider ?? null;

  return {
    totalSearches: events.filter((e) => e.kind === 'search').length,
    totalJobs,
    estCostUsd: Math.round((estCostMicro / 1_000_000) * 10000) / 10000,
    byProvider,
    mostSuccessfulProvider: mostSuccessful,
  };
}

/** Top-N search terms from recorded query strings. */
export function topTerms(queries: string[], n = 10): Array<{ term: string; count: number }> {
  const counts = new Map<string, number>();
  for (const q of queries) {
    const key = q.toLowerCase().trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}
