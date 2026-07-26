// Contract tests for every adapter's parse/normalise path, driven by fixtures
// that mirror each API's documented response shape. These do NOT hit the
// network. When you verify an adapter against a live key, replace the matching
// fixture with a real (redacted) payload and this test becomes the regression
// guard for that provider's mapping.

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ProviderRuntimeConfig, SearchInput } from './types.ts';
import { ActiveJobsProvider } from './ActiveJobsProvider.ts';
import { LinkedInProvider } from './LinkedInProvider.ts';
import { JobPostingFeedProvider } from './JobPostingFeedProvider.ts';
import { GoogleJobsProvider } from './GoogleJobsProvider.ts';
import { GlassdoorProvider } from './GlassdoorProvider.ts';
import { WorkdayProvider } from './WorkdayProvider.ts';
import { LegacyProvider } from './LegacyProvider.ts';

const cfg: ProviderRuntimeConfig = {
  secrets: {
    RAPIDAPI_KEY: 'k', GOOGLE_JOBS_KEY: 'k', GLASSDOOR_KEY: 'k',
    WORKDAY_KEY: 'k', WORKDAY_HOST: 'workday-agg.example.com',
  },
  timeoutMs: 5000, maxResultsPerProvider: 40,
};

const input: SearchInput = {
  query: 'python engineer', terms: ['python engineer', 'python'], location: 'Bengaluru',
  country: 'in', remoteOnly: false, workMode: '', employmentType: '', salaryMin: null, salaryMax: null, page: 0,
};

describe('Fantastic-Jobs family (ActiveJobs / LinkedIn / JobPostingFeed)', () => {
  // Mirrors the vendor-documented v4 record (developer.fantastic.jobs/api/new-jobs):
  // flat `ai_salary_*`, `date_valid_through`, `org_linkedin_industry`,
  // `ai_work_arrangement`. Replace with a real redacted payload once a live key
  // is available — the assertions below are the mapping's regression guard.
  const fixture = [{
    id: 'aj-1', title: 'Senior Python Engineer', organization: 'Acme',
    description_text: 'Build with Python and AWS. ' + 'x'.repeat(300),
    locations_derived: ['Bengaluru, India'], ai_work_arrangement: 'Remote Solely',
    employment_type: ['FULL_TIME'], url: 'https://acme.com/careers/py-1',
    organization_logo: 'https://cdn.acme.com/logo.png', date_posted: '2026-07-24T10:00:00Z',
    date_valid_through: '2026-08-24T10:00:00Z', org_linkedin_industry: 'Software Development',
    ai_salary_min_value: 2000000, ai_salary_max_value: 3500000,
    ai_salary_currency: 'INR', ai_salary_unit_text: 'YEAR',
    countries_derived: ['IN'], source: 'Acme Careers',
  }];

  it('ActiveJobs calls the verified /active-ats endpoint with documented params', () => {
    const p = new ActiveJobsProvider(cfg);
    const req = p.buildSearchRequest(input)!;
    const url = new URL(req.url);
    expect(url.host).toBe('active-jobs-db.p.rapidapi.com');
    expect(url.pathname).toBe('/active-ats');
    expect(url.searchParams.get('title')).toBe('python engineer python');
    expect(url.searchParams.get('location')).toBe('Bengaluru');
    expect(url.searchParams.get('description_format')).toBe('text');
    expect(url.searchParams.get('time_frame')).toBe('7d');
    expect(url.searchParams.get('limit')).toBe('40');   // == maxResultsPerProvider, so no wasted job credits
    // The retired v2 spelling must never come back.
    expect(req.url).not.toContain('title_filter');
    expect(req.url).not.toContain('description_type');
    expect((req.init!.headers as Record<string, string>)['X-RapidAPI-Key']).toBe('k');
  });

  it('maps the documented v4 record', () => {
    const jobs = new ActiveJobsProvider(cfg).parseSearch(fixture);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe('Senior Python Engineer');
    expect(jobs[0].company).toBe('Acme');
    expect(jobs[0].salaryMin).toBe(2000000);
    expect(jobs[0].salaryMax).toBe(3500000);
    expect(jobs[0].currency).toBe('INR');
    expect(jobs[0].salaryPeriod).toBe('year');
    expect(jobs[0].workMode).toBe('remote');            // from ai_work_arrangement
    expect(jobs[0].closesAt).toBe('2026-08-24T10:00:00Z');
    expect(jobs[0].industry).toBe('Software Development');
    expect(jobs[0].country).toBe('IN');
    expect(jobs[0].via).toBe('Acme Careers');           // original source attribution preserved
  });

  it('still reads the legacy nested MonetaryAmount salary shape', () => {
    const legacy = [{
      ...fixture[0],
      ai_salary_min_value: undefined, ai_salary_max_value: undefined,
      ai_salary_currency: undefined, ai_salary_unit_text: undefined,
      salary_raw: { '@type': 'MonetaryAmount', currency: 'INR', value: { minValue: 1500000, maxValue: 2500000, unitText: 'YEAR' } },
    }];
    const jobs = new ActiveJobsProvider(cfg).parseSearch(legacy);
    expect(jobs[0].salaryMin).toBe(1500000);
    expect(jobs[0].currency).toBe('INR');
  });

  it('derives remote from the schema.org TELECOMMUTE location_type', () => {
    const t = [{ ...fixture[0], ai_work_arrangement: undefined, location_type: 'TELECOMMUTE' }];
    expect(new ActiveJobsProvider(cfg).parseSearch(t)[0].workMode).toBe('remote');
  });

  it('LinkedIn uses /active-jb and attributes via=LinkedIn when source is absent', () => {
    const p = new LinkedInProvider(cfg);
    const noSource = [{ ...fixture[0], source: undefined }];
    expect(p.parseSearch(noSource)[0].via).toBe('LinkedIn');
    const url = new URL(p.buildSearchRequest(input)!.url);
    expect(url.host).toBe('linkedin-job-search-api.p.rapidapi.com');
    expect(url.pathname).toBe('/active-jb');
  });

  it('JobPostingFeed shares the schema and pages by the requested page size', () => {
    const p = new JobPostingFeedProvider(cfg);
    expect(p.parseSearch(fixture)).toHaveLength(1);
    expect(new URL(p.buildSearchRequest(input)!.url).pathname).toBe('/active-ats');
    // page 2 at limit 40 must skip 80 records, not 20.
    const url = new URL(p.buildSearchRequest({ ...input, page: 2 })!.url);
    expect(url.searchParams.get('offset')).toBe('80');
    expect(url.searchParams.get('limit')).toBe('40');
  });

  it('returns [] on an unexpected shape (fails closed)', () => {
    expect(new ActiveJobsProvider(cfg).parseSearch({ nope: true })).toEqual([]);
    expect(new ActiveJobsProvider(cfg).parseSearch(null)).toEqual([]);
  });

  it('is disabled without a key', () => {
    const p = new ActiveJobsProvider({ ...cfg, secrets: {} });
    expect(p.buildSearchRequest(input)).toBeNull();
  });
});

describe('GoogleJobs adapter', () => {
  const fixture = {
    jobs_results: [{
      job_id: 'g-1', title: 'Data Engineer', company_name: 'Globex', location: 'Remote, India',
      via: 'via LinkedIn', description: 'ETL and SQL. ' + 'y'.repeat(200),
      detected_extensions: { posted_at: '2 days ago', schedule_type: 'Full-time', work_from_home: true },
      apply_options: [{ title: 'Apply on company site', link: 'https://globex.com/jobs/de' }],
      thumbnail: 'https://cdn.globex.com/t.png',
    }],
  };
  it('maps apply_options and detected_extensions', () => {
    const p = new GoogleJobsProvider(cfg);
    const jobs = p.parseSearch(fixture);
    expect(jobs[0].applyUrl).toBe('https://globex.com/jobs/de');
    expect(jobs[0].workMode).toBe('remote');
    expect(jobs[0].via).toBe('LinkedIn');               // "via " prefix stripped
    expect(p.buildSearchRequest(input)!.url).toContain('google-jobs.p.rapidapi.com');
  });
});

describe('Glassdoor adapter', () => {
  const fixture = { jobs: [{
    jobId: 'gd-1', jobTitle: 'Risk Analyst', employer: 'Initech', location: 'Mumbai',
    jobDescription: 'AML and risk. ' + 'z'.repeat(200), jobLink: 'https://glassdoor.com/job/gd-1',
    rating: 4.2, salaryMin: 1200000, salaryMax: 1800000, currency: 'INR',
  }] };
  it('maps jobs with employer rating in metadata', () => {
    const jobs = new GlassdoorProvider(cfg).parseSearch(fixture);
    expect(jobs[0].title).toBe('Risk Analyst');
    expect(jobs[0].salaryMin).toBe(1200000);
    expect(jobs[0].via).toBe('Glassdoor');
    expect(jobs[0].metadata!.employerRating).toBe(4.2);
  });
});

describe('Workday adapter', () => {
  const fixture = { jobPostings: [{
    id: 'wd-1', title: 'Backend Engineer', company: 'Umbrella',
    locationsText: 'Remote - India', postedOn: 'Posted 3 Days Ago',
    externalPath: '/job/Backend-Engineer_wd-1', timeType: 'Full time',
  }] };
  it('absolute-ises the externalPath against WORKDAY_HOST', () => {
    const jobs = new WorkdayProvider(cfg).parseSearch(fixture);
    expect(jobs[0].applyUrl).toBe('https://workday-agg.example.com/job/Backend-Engineer_wd-1');
    expect(jobs[0].workMode).toBe('remote');
    expect(jobs[0].via).toContain('Workday');
  });
  it('is disabled without WORKDAY_HOST', () => {
    const p = new WorkdayProvider({ ...cfg, secrets: { WORKDAY_KEY: 'k' } });
    expect(p.buildSearchRequest(input)).toBeNull();
  });
});

// ── BaseProvider transport: retries, backoff policy, quota headers ──
// These drive the real fetch path through a stubbed global fetch, so the retry
// count, the never-retry-4xx rule and the quota parsing are all covered.
describe('BaseProvider transport', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  const ok = (headers: Record<string, string> = {}) =>
    new Response(JSON.stringify([]), { status: 200, headers });

  function stubFetch(...responses: Array<Response | Error>) {
    const spy = vi.fn(async () => {
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next ?? ok();
    });
    vi.stubGlobal('fetch', spy);
    return spy;
  }

  it('retries a transient 5xx and succeeds on the second attempt', async () => {
    const spy = stubFetch(new Response('', { status: 503 }), ok());
    const jobs = await new ActiveJobsProvider(cfg).searchJobs(input);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(jobs).toEqual([]);
  });

  // A 429 means "stop". Retrying it burns paid quota to earn another 429.
  it('never retries a 429', async () => {
    const spy = stubFetch(new Response('', { status: 429 }), ok());
    await expect(new ActiveJobsProvider(cfg).searchJobs(input)).rejects.toThrow(/429/);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('never retries a 4xx auth failure', async () => {
    const spy = stubFetch(new Response('', { status: 401 }), ok());
    await expect(new ActiveJobsProvider(cfg).searchJobs(input)).rejects.toThrow(/401/);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  // CAREERS_PROVIDER_RETRIES was documented as tunable but BaseProvider ignored
  // it and always retried once. It is now honoured end to end.
  it('honours retries: 0 — one attempt, no retry', async () => {
    const spy = stubFetch(new Response('', { status: 503 }), ok());
    const p = new ActiveJobsProvider({ ...cfg, retries: 0 });
    await expect(p.searchJobs(input)).rejects.toThrow(/503/);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('honours retries: 2 — three attempts total', async () => {
    const spy = stubFetch(
      new Response('', { status: 503 }),
      new Response('', { status: 503 }),
      new Response('', { status: 503 }),
    );
    const p = new ActiveJobsProvider({ ...cfg, retries: 2 });
    await expect(p.searchJobs(input)).rejects.toThrow(/503/);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('reads BOTH quota dimensions, jobs credits included', async () => {
    stubFetch(ok({
      'x-ratelimit-requests-remaining': '24500',
      'x-ratelimit-jobs-remaining': '198000',
    }));
    const { quota } = await new ActiveJobsProvider(cfg).searchJobsDetailed(input);
    expect(quota.requestsRemaining).toBe(24_500);
    expect(quota.jobsRemaining).toBe(198_000);
  });

  it('reports null quota when the vendor sends no headers', async () => {
    stubFetch(ok());
    const { quota } = await new ActiveJobsProvider(cfg).searchJobsDetailed(input);
    expect(quota).toEqual({ requestsRemaining: null, jobsRemaining: null });
  });

  it('classifies a malformed body rather than crashing', async () => {
    stubFetch(new Response('not json', { status: 200 }));
    await expect(new ActiveJobsProvider({ ...cfg, retries: 0 }).searchJobs(input))
      .rejects.toThrow(/bad JSON/);
  });
});

describe('LegacyProvider wrapper', () => {
  it('runs an incumbent search unchanged under the new interface', async () => {
    const legacy = new LegacyProvider({
      id: 'adzuna', priority: 40, secrets: ['ADZUNA_APP_ID'], costPerSearchMicroUsd: 0,
      search: async () => [{
        external_id: 'a-1', title: 'QA Engineer', company: 'Hooli', description: 'Testing. ' + 'q'.repeat(200),
        salary_min: 900000, salary_max: null, currency: 'INR', location: 'Pune', country: 'IN',
        work_mode: '', employment_type: 'fulltime', apply_url: 'https://hooli.com/jobs/qa',
        posted_at: '2026-07-23T00:00:00Z', closes_at: null, industry: 'IT', via: 'Adzuna',
      }],
    });
    const jobs = await legacy.searchJobs(input);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].provider).toBe('adzuna');
    expect(jobs[0].title).toBe('QA Engineer');
    expect(jobs[0].via).toBe('Adzuna');
  });
});
