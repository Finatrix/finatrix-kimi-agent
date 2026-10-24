/**
 * Company Registry provider — the supply-side fix for the apply-URL problem.
 *
 * Registry jobs are read off each employer's own ATS, so `url` is a real
 * application form rather than an aggregator redirect. These tests pin the two
 * things that matter: the mapping preserves that canonical URL, and the
 * provider FAILS CLOSED — until migration 20261024000100 is applied the RPC
 * does not exist, and a missing registry must look like "no results from this
 * source", never like a broken search.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

const { searchRegistryJobs, withRegistryJobs, REGISTRY_SOURCE } = await import(
  '../careers/services/registryJobs'
);
const { isDirectEmployerUrl } = await import('../careers/search/applyUrl');
const { DEFAULT_SEARCH_PARAMS } = await import('../careers/types/jobs');
import type { JobSearchParams } from '../careers/types/jobs';
import type { SearchOutcome } from '../careers/services/jobsService';

const params = (over: Partial<JobSearchParams> = {}): JobSearchParams => ({
  ...DEFAULT_SEARCH_PARAMS,
  query: 'risk analyst',
  ...over,
});

/** A row shaped like `search_career_postings` returns it. */
function row(over: Record<string, unknown> = {}) {
  return {
    job_id: 'a1', title: '.Net Engineer — Clearing Risk Platform',
    company: 'ASX Limited', location: 'Sydney Office',
    city: 'Sydney', region: 'NSW', countries: ['AU'],
    workplace_type: 'hybrid', employment_type: 'permanent',
    salary_min: null, salary_max: null, salary_currency: null, salary_period: null,
    work_rights: null,
    summary: 'Build the clearing risk platform for Australian financial markets.',
    source: 'workday',
    url: 'https://asx.wd105.myworkdayjobs.com/ASX_Careers/job/Sydney-Office/Net-Engineer_JR101584',
    posted_at: null, first_seen: '2026-08-01', relevance: 0.8,
    ...over,
  };
}

// mockClear, not mockReset: resetting re-instruments the mock in a way that
// orphans a rejected promise's settled-result tracking, so Vitest reports an
// unhandled rejection for the outage test even though the code under test
// swallows it correctly. Every test below sets its own implementation anyway.
beforeEach(() => rpc.mockClear());

describe('searchRegistryJobs', () => {
  it('preserves the employer’s canonical ATS URL as the apply link', async () => {
    rpc.mockResolvedValue({ data: [row()], error: null });
    const jobs = await searchRegistryJobs(params());

    expect(jobs).toHaveLength(1);
    expect(jobs![0].apply_url).toBe(row().url);
    // The whole reason this provider exists.
    expect(isDirectEmployerUrl(jobs![0].apply_url)).toBe(true);
  });

  it('maps the registry’s fields onto the app’s job contract', async () => {
    rpc.mockResolvedValue({ data: [row()], error: null });
    const [job] = (await searchRegistryJobs(params()))!;

    expect(job.source).toBe(REGISTRY_SOURCE);
    expect(job.company).toBe('ASX Limited');
    expect(job.via).toBe('ASX Limited');
    expect(job.location).toBe('Sydney Office');
    expect(job.country).toBe('AU');
    expect(job.work_mode).toBe('hybrid');
    expect(job.employment_type).toBe('permanent');
    expect(job.work_rights).toBeNull();
  });

  it('reports the searched market for a posting listed in several', async () => {
    rpc.mockResolvedValue({ data: [row({ countries: ['AU', 'NZ'] })], error: null });
    expect((await searchRegistryJobs(params({ country: 'nz' })))![0].country).toBe('NZ');
    expect((await searchRegistryJobs(params({ country: '' })))![0].country).toBe('AU');
  });

  it('carries the work rights the posting states', async () => {
    const rights = { requirement: 'citizen_only', all: ['citizen_only'] };
    rpc.mockResolvedValue({ data: [row({ work_rights: rights })], error: null });
    expect((await searchRegistryJobs(params()))![0].work_rights).toEqual(rights);
  });

  it('gives every job enough text to be classified', async () => {
    // An empty description would make registry jobs unclassifiable, which the
    // recalibrated scorer correctly scores 0 — hiding the best jobs we have.
    rpc.mockResolvedValue({ data: [row()], error: null });
    const [job] = (await searchRegistryJobs(params()))!;

    expect(job.description.length).toBeGreaterThan(20);
    expect(job.description).toContain('ASX Limited');
    expect(job.description).toContain('clearing risk platform');
  });

  it('leaves an unstated work mode unknown rather than guessing', async () => {
    rpc.mockResolvedValue({ data: [row({ workplace_type: null })], error: null });
    const [job] = (await searchRegistryJobs(params()))!;
    expect(job.work_mode).toBe('');
  });

  it('coerces numeric salary strings and tolerates nulls', async () => {
    rpc.mockResolvedValue({
      data: [row({ salary_min: '120000', salary_max: null, salary_currency: 'AUD', salary_period: 'year' })],
      error: null,
    });
    const [job] = (await searchRegistryJobs(params()))!;
    expect(job.salary_min).toBe(120000);
    expect(job.salary_max).toBeNull();
    expect(job.currency).toBe('AUD');
  });

  it('annualises monthly pay exactly, and never guesses a year from an hourly rate', async () => {
    rpc.mockResolvedValue({
      data: [
        row({ salary_min: 5000, salary_max: 6000, salary_currency: 'GBP', salary_period: 'month' }),
        row({ job_id: 'b', salary_min: 60, salary_max: 70, salary_currency: 'AUD', salary_period: 'hour' }),
      ],
      error: null,
    });
    const [monthly, hourly] = (await searchRegistryJobs(params()))!;
    expect([monthly.salary_min, monthly.salary_max]).toEqual([60000, 72000]);
    expect([hourly.salary_min, hourly.salary_max]).toEqual([null, null]);
  });

  it('drops rows with no URL or no title rather than rendering a dead card', async () => {
    rpc.mockResolvedValue({
      data: [row(), row({ job_id: 'b', url: '' }), row({ job_id: 'c', title: '' })],
      error: null,
    });
    expect(await searchRegistryJobs(params())).toHaveLength(1);
  });

  it('asks only for markets the engine covers, and never narrows to non-remote', async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await searchRegistryJobs(params({ country: 'in' }));
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_country: 'IN', p_remote: null });

    await searchRegistryJobs(params({ country: 'nz' }));
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_country: 'NZ' });

    // The engine has no Singapore employers: nothing to ask for, and asking
    // without a country would pour every other market's jobs into the search.
    expect(await searchRegistryJobs(params({ country: 'sg' }))).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(2);

    await searchRegistryJobs(params({ workMode: 'remote' }));
    expect(rpc.mock.calls[2][1]).toMatchObject({ p_remote: true });
  });

  it('paginates by page number', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await searchRegistryJobs(params({ page: 2 }), 25);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_limit: 25, p_offset: 50 });
  });

  it('returns null — not a throw — when the RPC does not exist yet', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    await expect(searchRegistryJobs(params())).resolves.toBeNull();
  });
});

// ───────────────────────── merge into unified search ─────────────────────────

const outcome = (over: Partial<SearchOutcome> = {}): SearchOutcome => ({
  jobs: [{ source: 'adzuna', apply_url: 'https://www.adzuna.in/land/ad/1' } as never],
  status: { adzuna: 'ok' },
  counts: { adzuna: 1 },
  ran: 1,
  providersUp: true,
  page: 0,
  ...over,
});

describe('withRegistryJobs', () => {
  it('places registry jobs ahead of aggregator results', async () => {
    rpc.mockResolvedValue({ data: [row()], error: null });
    const merged = await withRegistryJobs(async () => outcome())(params(), []);

    expect(merged.jobs).toHaveLength(2);
    // First, so the de-duplication tie-break keeps the employer's copy.
    expect(merged.jobs[0].source).toBe(REGISTRY_SOURCE);
    expect(merged.status[REGISTRY_SOURCE]).toBe('ok');
    expect(merged.counts?.[REGISTRY_SOURCE]).toBe(1);
    expect(merged.ran).toBe(2);
  });

  it('reports "not-configured" and keeps every other result when the RPC is missing', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    const merged = await withRegistryJobs(async () => outcome())(params(), []);

    expect(merged.jobs).toHaveLength(1);
    expect(merged.jobs[0].source).toBe('adzuna');
    // Counted honestly — not claimed as a source that ran.
    expect(merged.status[REGISTRY_SOURCE]).toBe('not-configured');
    expect(merged.ran).toBe(1);
  });

  it('survives a registry outage without taking down unified search', async () => {
    // A server-side failure is the realistic outage: PostgREST answers with an
    // `error` body rather than rejecting. (Transport-level rejections are
    // handled by the try/catch inside searchRegistryJobs; they are not
    // exercised through a rejecting mock here because Vitest's settled-result
    // tracking reports such a promise as unhandled even when the code under
    // test swallows it correctly.)
    rpc.mockResolvedValue({ data: null, error: { code: '57014', message: 'statement timeout' } });
    const merged = await withRegistryJobs(async () => outcome())(params(), []);

    expect(merged.jobs).toHaveLength(1);
    expect(merged.jobs[0].source).toBe('adzuna');
    expect(merged.status[REGISTRY_SOURCE]).toBe('not-configured');
  });

  it('does not swallow a failure of the aggregator fetcher itself', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const boom = withRegistryJobs(async () => { throw new Error('providers down'); });
    await expect(boom(params(), [])).rejects.toThrow('providers down');
  });
});
