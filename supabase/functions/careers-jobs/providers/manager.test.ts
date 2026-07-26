import { describe, it, expect, vi } from 'vitest';
import { ProviderManager } from './ProviderManager.ts';
import { TieredCache, InMemoryCacheStore } from './ProviderCache.ts';
import { ProviderError } from './BaseProvider.ts';
import type {
  FinatriXJob, JobProvider, SearchInput, HealthStore, MetricsStore, HealthEvent, MetricEvent, HealthSnapshot,
} from './types.ts';
import { normalize, type RawJob } from './ProviderNormalizer.ts';

const input: SearchInput = {
  query: 'python engineer', terms: ['python engineer', 'python'], location: 'Bengaluru',
  country: 'in', remoteOnly: false, workMode: '', employmentType: '', salaryMin: null, salaryMax: null, page: 0,
};

function job(provider: string, priority: number, over: Partial<RawJob> = {}): FinatriXJob {
  return normalize(provider, priority, {
    externalId: over.externalId ?? Math.random().toString(36).slice(2),
    title: 'Python Engineer', company: 'Acme', description: 'Python and AWS. ' + 'x'.repeat(300),
    salaryMin: null, salaryMax: null, currency: '', location: 'Bengaluru', country: 'IN',
    workMode: '', employmentType: 'fulltime', applyUrl: 'https://acme.com/careers/py',
    postedDate: '2026-07-25T00:00:00Z', via: 'Company Site', ...over,
  }, new Date('2026-07-25T00:00:00Z').getTime())!;
}

function fakeProvider(id: string, priority: number, impl: (i: SearchInput) => Promise<FinatriXJob[]>): JobProvider {
  return {
    id, priority, secrets: [], costPerSearchMicroUsd: 1000,
    supports: () => true, searchJobs: impl,
    getJob: async () => null, getCompany: async () => null, health: async () => ({ ok: true, ms: 1, quotaRemaining: null }),
  };
}

function deps(overrides: Partial<{ health: HealthStore; snaps: HealthSnapshot[] }> = {}) {
  const healthEvents: HealthEvent[] = [];
  const metricEvents: MetricEvent[] = [];
  const health: HealthStore = overrides.health ?? {
    load: async () => overrides.snaps ?? [],
    record: async (e) => { healthEvents.push(...e); },
  };
  const metrics: MetricsStore = { record: async (e) => { metricEvents.push(...e); } };
  return { cache: new TieredCache(new InMemoryCacheStore()), health, metrics, now: () => 1_000_000, _healthEvents: healthEvents, _metricEvents: metricEvents };
}

describe('ProviderManager.search', () => {
  it('fans out in parallel and merges results', async () => {
    const d = deps();
    const mgr = new ProviderManager([
      fakeProvider('activejobs', 100, async () => [job('activejobs', 100, { externalId: 'a' })]),
      fakeProvider('glassdoor', 60, async () => [job('glassdoor', 60, { externalId: 'g', applyUrl: 'https://acme.com/careers/py2' })]),
    ], d);
    const res = await mgr.search(input, { requestedProviders: [], userSkills: [] });
    expect(res.status).toEqual({ activejobs: 'ok', glassdoor: 'ok' });
    expect(res.providersUp).toBe(true);
    expect(res.jobs.length).toBeGreaterThan(0);
  });

  it('one provider failing NEVER fails the search (allSettled fault isolation)', async () => {
    const d = deps();
    const mgr = new ProviderManager([
      fakeProvider('activejobs', 100, async () => [job('activejobs', 100, { externalId: 'a' })]),
      fakeProvider('linkedin', 90, async () => { throw new ProviderError('HTTP 503', 503, 'server_error'); }),
      fakeProvider('workday', 80, async () => { throw new ProviderError('aborted', null, 'timeout'); }),
    ], d);
    const res = await mgr.search(input, { requestedProviders: [], userSkills: [] });
    expect(res.status.activejobs).toBe('ok');
    expect(res.status.linkedin).toBe('error');
    expect(res.status.workday).toBe('timeout');
    expect(res.jobs.length).toBe(1);          // the healthy provider's result survives
    expect(res.providersUp).toBe(true);
  });

  it('de-duplicates across providers, higher priority wins and metadata merges', async () => {
    const d = deps();
    const mgr = new ProviderManager([
      fakeProvider('activejobs', 100, async () => [job('activejobs', 100, { externalId: 'a', salaryMin: null })]),
      fakeProvider('glassdoor', 60, async () => [job('glassdoor', 60, { externalId: 'g', salaryMin: 1500000, salaryMax: 2500000, currency: 'INR' })]),
    ], d);
    const res = await mgr.search(input, { requestedProviders: [], userSkills: [] });
    expect(res.jobs).toHaveLength(1);
    expect(res.jobs[0].source).toBe('activejobs');       // higher priority is canonical
    expect(res.jobs[0].salary_min).toBe(1500000);        // glassdoor salary merged in
  });

  it('serves from cache on the second identical search (no provider calls)', async () => {
    const d = deps();
    const spy = vi.fn(async () => [job('activejobs', 100, { externalId: 'a' })]);
    const mgr = new ProviderManager([fakeProvider('activejobs', 100, spy)], d);
    await mgr.search(input, { requestedProviders: [], userSkills: [] });
    const res2 = await mgr.search(input, { requestedProviders: [], userSkills: [] });
    expect(res2.cached).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);                // second search hit the cache
  });

  it('skips a health-disabled provider', async () => {
    const disabled: HealthSnapshot = {
      provider: 'linkedin', available: false, latencyMs: 0, errorRate: 1,
      quotaRemaining: null, jobsRemaining: null,
      lastSuccess: null, lastFailure: null, disabledUntil: new Date(2_000_000).toISOString(),
    };
    const d = deps({ snaps: [disabled] });
    const spy = vi.fn(async () => [job('linkedin', 90)]);
    const mgr = new ProviderManager([
      fakeProvider('activejobs', 100, async () => [job('activejobs', 100, { externalId: 'a' })]),
      fakeProvider('linkedin', 90, spy),
    ], d);
    const res = await mgr.search(input, { requestedProviders: [], userSkills: [] });
    expect(res.status.linkedin).toBe('disabled');
    expect(spy).not.toHaveBeenCalled();                  // disabled provider not called
  });

  it('adds the skills_matched badge only when the user shares a skill', async () => {
    const d = deps();
    const mgr = new ProviderManager([fakeProvider('activejobs', 100, async () => [job('activejobs', 100, { externalId: 'a' })])], d);
    const withMatch = await mgr.search(input, { requestedProviders: [], userSkills: ['python'] });
    expect(withMatch.jobs[0].badges).toContain('skills_matched');
    const noMatch = await mgr.search({ ...input, page: 1 }, { requestedProviders: [], userSkills: ['welding'] });
    expect(noMatch.jobs[0].badges ?? []).not.toContain('skills_matched');
  });

  it('reports a keyless provider as not-configured and never calls it', async () => {
    const d = deps();
    const spy = vi.fn(async () => [job('linkedin', 90)]);
    const unconfigured: JobProvider = { ...fakeProvider('linkedin', 90, spy), isConfigured: () => false };
    const mgr = new ProviderManager([
      fakeProvider('activejobs', 100, async () => [job('activejobs', 100, { externalId: 'a' })]),
      unconfigured,
    ], d);
    const res = await mgr.search(input, { requestedProviders: [], userSkills: [] });
    expect(res.status.linkedin).toBe('not-configured');
    expect(spy).not.toHaveBeenCalled();
    expect(res.status.activejobs).toBe('ok');
  });

  it('records health + metrics events for the admin dashboards', async () => {
    const d = deps();
    const mgr = new ProviderManager([fakeProvider('activejobs', 100, async () => [job('activejobs', 100)])], d);
    await mgr.search(input, { requestedProviders: [], userSkills: [] });
    expect(d._healthEvents.length).toBe(1);
    expect(d._metricEvents[0].costMicroUsd).toBe(1000);
  });

  // A cache hit used to record nothing at all and report empty counts, so the
  // dashboard could not distinguish "cache working" from "search never used",
  // and the UI showed 0 results per source on an otherwise perfect response.
  it('a cache hit reports per-provider counts and records a cache metric', async () => {
    const d = deps();
    const mgr = new ProviderManager([
      fakeProvider('activejobs', 100, async () => [
        job('activejobs', 100, { externalId: 'a' }),
        // Genuinely distinct — different company AND description, so dedupe
        // (which collapses same-company near-identical descriptions) keeps both.
        job('activejobs', 100, {
          externalId: 'b', company: 'Globex', title: 'Data Engineer',
          description: 'ETL pipelines and Tableau reporting. ' + 'y'.repeat(300),
          applyUrl: 'https://globex.com/careers/de',
        }),
      ]),
    ], d);
    await mgr.search(input, { requestedProviders: [], userSkills: [] });
    const before = d._metricEvents.length;

    const hit = await mgr.search(input, { requestedProviders: [], userSkills: [] });
    expect(hit.cached).toBe(true);
    expect(hit.counts.activejobs).toBe(2);        // not silently 0/undefined
    expect(hit.latency.activejobs).toBe(0);       // honest: no time was spent
    const cacheMetric = d._metricEvents.slice(before).find((e) => e.provider === 'cache');
    expect(cacheMetric).toBeDefined();
    expect(cacheMetric!.ok).toBe(true);
    expect(cacheMetric!.costMicroUsd).toBe(0);
  });

  // Quota headers are the only warning before a paid vendor cuts a provider off.
  it('propagates observed vendor quota into health events', async () => {
    const d = deps();
    const detailed: JobProvider = {
      ...fakeProvider('activejobs', 100, async () => [job('activejobs', 100, { externalId: 'a' })]),
      searchJobsDetailed: async () => ({
        jobs: [job('activejobs', 100, { externalId: 'a' })],
        quota: { requestsRemaining: 24_500, jobsRemaining: 198_000 },
      }),
    };
    const mgr = new ProviderManager([detailed], d);
    await mgr.search(input, { requestedProviders: [], userSkills: [] });
    expect(d._healthEvents[0].quotaRemaining).toBe(24_500);
    expect(d._healthEvents[0].jobsRemaining).toBe(198_000);
  });

  it('falls back to searchJobs for providers that cannot observe quota', async () => {
    const d = deps();
    const mgr = new ProviderManager([fakeProvider('adzuna', 40, async () => [job('adzuna', 40, { externalId: 'a' })])], d);
    const res = await mgr.search(input, { requestedProviders: [], userSkills: [] });
    expect(res.status.adzuna).toBe('ok');
    expect(d._healthEvents[0].quotaRemaining).toBeNull();
  });
});
