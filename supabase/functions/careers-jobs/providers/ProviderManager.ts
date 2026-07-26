// The orchestrator. Implements the full search flow exactly once, in one place;
// providers only ever speak the JobProvider interface, so there is no
// provider-specific logic here or anywhere outside a provider.
//
//   validate → cache lookup → parallel fan-out (allSettled) → normalise
//   → deduplicate → rank → (deterministic enrichment already done) → return
//
// Fault isolation: Promise.allSettled means one provider's failure, timeout or
// malformed payload can never fail the search. Health-gating skips providers in
// cooldown. Metrics + health events are recorded for the admin dashboards.

import type {
  JobProvider, SearchInput, WireJob, HealthStore, MetricsStore, HealthEvent,
  MetricEvent, FinatriXJob, HealthSnapshot, QuotaObservation,
} from './types.ts';
import { TieredCache, searchKey, TTL } from './ProviderCache.ts';
import { deduplicate, type DedupeOptions } from './ProviderDeduplicator.ts';
import { rank } from './ProviderRanking.ts';
import { toWireJob, applySkillMatch } from './ProviderNormalizer.ts';
import { snapshotFor, isDisabled, classifyError, DEFAULT_HEALTH_POLICY, type HealthPolicy } from './ProviderHealth.ts';
import { ProviderError, NO_QUOTA } from './BaseProvider.ts';

export interface ManagerDeps {
  cache: TieredCache;
  health: HealthStore;
  metrics: MetricsStore;
  healthPolicy?: HealthPolicy;
  /** Optional AI hooks — off unless supplied (cost control). */
  aiSimilar?: DedupeOptions['aiSimilar'];
  now?: () => number;
}

export interface SearchResponse {
  jobs: WireJob[];
  /** provider id → ok | error | timeout | not-configured | skipped | disabled */
  status: Record<string, string>;
  counts: Record<string, number>;
  latency: Record<string, number>;
  errors: Record<string, string>;
  providersUp: boolean;
  ran: number;
  page: number;
  /** true when served from cache (no providers were called). */
  cached: boolean;
}

export interface SearchContext {
  /** Requested provider subset (ids); empty = all. */
  requestedProviders: string[];
  /** The signed-in user's skills, for the truthful skills_matched badge. */
  userSkills: string[];
}

export class ProviderManager {
  constructor(
    private readonly providers: JobProvider[],
    private readonly deps: ManagerDeps,
  ) {}

  priorityOf(providerId: string): number {
    return this.providers.find((p) => p.id === providerId)?.priority ?? 0;
  }

  /** All registered provider ids (native + legacy), for selection + kill-switch. */
  providerIds(): string[] {
    return this.providers.map((p) => p.id);
  }

  /** The whole flow. Never throws for provider failures; only for bad input. */
  async search(input: SearchInput, ctx: SearchContext): Promise<SearchResponse> {
    const now = this.deps.now ?? Date.now;

    // 1 · Select providers: requested subset ∩ supports(query) ∩ not health-disabled.
    const requested = ctx.requestedProviders.length
      ? this.providers.filter((p) => ctx.requestedProviders.includes(p.id))
      : this.providers;
    const isConfigured = (p: JobProvider) => (p.isConfigured ? p.isConfigured() : true);
    // A provider with no secrets is reported 'not-configured' and never called —
    // preserving the client's existing status semantics.
    const notConfigured = requested.filter((p) => !isConfigured(p)).map((p) => p.id);
    const configured = requested.filter(isConfigured);
    const supported = configured.filter((p) => p.supports(input));
    const skipped = configured.filter((p) => !p.supports(input)).map((p) => p.id);

    const healthSnaps = await this.deps.health.load().catch(() => [] as HealthSnapshot[]);
    const snapById = new Map(healthSnaps.map((s) => [s.provider, s]));
    const disabled = supported.filter((p) => isDisabled(snapById.get(p.id), now())).map((p) => p.id);
    const active = supported.filter((p) => !disabled.includes(p.id));

    const status: Record<string, string> = {};
    const counts: Record<string, number> = {};
    const latency: Record<string, number> = {};
    const errors: Record<string, string> = {};
    for (const id of notConfigured) { status[id] = 'not-configured'; counts[id] = 0; latency[id] = 0; }
    for (const id of skipped) { status[id] = 'skipped'; counts[id] = 0; latency[id] = 0; }
    for (const id of disabled) { status[id] = 'disabled'; counts[id] = 0; latency[id] = 0; }

    // 2 · Cache lookup (keyed on the normalised query + the active provider set).
    const key = searchKey(input, active.map((p) => p.id));
    const cachedJobs = await this.deps.cache.get<FinatriXJob[]>(key);
    if (cachedJobs) {
      const finalJobs = this.finish(cachedJobs, input, ctx);
      // Report the same shape as a live fan-out: a caller (and the UI) should not
      // have to special-case a cache hit to know how many sources contributed.
      // Counts come from the cached set, latency is 0 — because none was spent.
      const cachedByProvider = new Map<string, number>();
      for (const j of cachedJobs) {
        cachedByProvider.set(j.provider, (cachedByProvider.get(j.provider) ?? 0) + 1);
      }
      for (const p of active) {
        status[p.id] = 'ok';
        counts[p.id] = cachedByProvider.get(p.id) ?? 0;
        latency[p.id] = 0;
      }
      // One 'cache' metric row per served hit. Without this the cache hit rate is
      // unmeasurable: a hit records nothing at all, so the dashboard cannot tell
      // "cache working perfectly" from "search never used".
      await this.deps.metrics.record([{
        provider: 'cache', kind: 'search', ok: true, ms: 0,
        jobs: finalJobs.length, at: now(), costMicroUsd: 0,
      }]).catch(() => undefined);
      return {
        jobs: finalJobs, status, counts, latency, errors,
        providersUp: active.length > 0, ran: active.length, page: input.page, cached: true,
      };
    }

    // 3 · Parallel fan-out. allSettled — a rejection here can never fail the batch.
    const settled = await Promise.allSettled(active.map((p) => this.runProvider(p, input, now())));

    const healthEvents: HealthEvent[] = [];
    const metricEvents: MetricEvent[] = [];
    const collected: FinatriXJob[] = [];

    settled.forEach((res, i) => {
      const p = active[i];
      if (res.status === 'fulfilled') {
        const r = res.value;
        status[p.id] = r.error ? (r.errorKind === 'timeout' ? 'timeout' : 'error') : 'ok';
        counts[p.id] = r.jobs.length;
        latency[p.id] = r.ms;
        if (r.error) errors[p.id] = r.error;
        collected.push(...r.jobs);
        healthEvents.push({
          provider: p.id, ok: !r.error, ms: r.ms, errorKind: r.errorKind,
          quotaRemaining: r.quota.requestsRemaining, jobsRemaining: r.quota.jobsRemaining, at: now(),
        });
        metricEvents.push({ provider: p.id, kind: 'search', ok: !r.error, ms: r.ms, jobs: r.jobs.length, at: now(), costMicroUsd: p.costPerSearchMicroUsd });
      } else {
        // Defensive: runProvider is written never to reject, but honour it anyway.
        status[p.id] = 'error';
        counts[p.id] = 0; latency[p.id] = 0;
        errors[p.id] = String(res.reason).slice(0, 160);
        healthEvents.push({ provider: p.id, ok: false, ms: 0, errorKind: 'unknown', quotaRemaining: null, jobsRemaining: null, at: now() });
        metricEvents.push({ provider: p.id, kind: 'search', ok: false, ms: 0, jobs: 0, at: now(), costMicroUsd: p.costPerSearchMicroUsd });
      }
    });

    // Record health + metrics (best-effort; never blocks or fails the response).
    await Promise.allSettled([
      this.deps.health.record(healthEvents),
      this.deps.metrics.record(metricEvents),
    ]);

    // 4 · Sort by provider priority so the higher-priority record is the dedupe
    //     winner, then 5 · deduplicate (merging metadata), then cache the merged set.
    collected.sort((a, b) => this.priorityOf(b.provider) - this.priorityOf(a.provider));
    const deduped = await deduplicate(collected, { aiSimilar: this.deps.aiSimilar });
    if (deduped.length) await this.deps.cache.set(key, deduped, TTL.search);

    const providersUp = active.length > 0 && Object.values(status).some((s) => s === 'ok');
    return {
      jobs: this.finish(deduped, input, ctx),
      status, counts, latency, errors, providersUp, ran: active.length, page: input.page, cached: false,
    };
  }

  /** 6 · rank + skill-match badge + project to the wire shape. */
  private finish(jobs: FinatriXJob[], input: SearchInput, ctx: SearchContext): WireJob[] {
    const ranked = rank(jobs, input, (id) => this.priorityOf(id));
    return ranked.map((r) => toWireJob(applySkillMatch(r.job, ctx.userSkills)));
  }

  /** Run one provider, converting any failure into a value (never a rejection). */
  private async runProvider(p: JobProvider, input: SearchInput, at: number): Promise<{
    jobs: FinatriXJob[]; ms: number; error: string | null;
    errorKind: HealthEvent['errorKind']; quota: QuotaObservation;
  }> {
    const t = at;
    try {
      // Prefer the detailed form so the vendor quota is captured with the call
      // itself — no shared mutable state on a provider that may be serving
      // several concurrent searches in the same isolate.
      const { jobs, quota } = p.searchJobsDetailed
        ? await p.searchJobsDetailed(input)
        : { jobs: await p.searchJobs(input), quota: NO_QUOTA };
      return { jobs, ms: Date.now() - t, error: null, errorKind: null, quota };
    } catch (e) {
      const err = e instanceof ProviderError ? e : new ProviderError(String(e), null, classifyError(null, String(e)));
      return { jobs: [], ms: Date.now() - t, error: err.message.slice(0, 160), errorKind: err.kind, quota: NO_QUOTA };
    }
  }

  /** Compute a fresh health snapshot per provider from recent events (admin). */
  async healthReport(): Promise<HealthSnapshot[]> {
    const events = await this.deps.health.load().catch(() => [] as HealthSnapshot[]);
    // `load()` returns snapshots in production; when raw events are available a
    // richer report is produced by snapshotFor. Here we surface what we have.
    if (events.length && 'available' in (events[0] as object)) return events;
    return this.providers.map((p) => snapshotFor(p.id, [], this.deps.healthPolicy ?? DEFAULT_HEALTH_POLICY));
  }
}
