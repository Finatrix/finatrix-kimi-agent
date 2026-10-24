// Contract tests for the two official national boards, USAJOBS (US) and Reed
// (UK). Fixtures mirror each API's documented response; no network is touched.
// When an adapter is verified against a live key, replace its fixture with a
// real (redacted) payload so these assertions guard the real mapping.

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { JobProvider, ProviderRuntimeConfig, SearchInput } from './types.ts';
import { ProviderError } from './BaseProvider.ts';
import { USAJobsProvider } from './USAJobsProvider.ts';
import { ReedProvider, reedDate } from './ReedProvider.ts';
import { ProviderManager } from './ProviderManager.ts';
import { TieredCache, InMemoryCacheStore } from './ProviderCache.ts';
import { buildNativeProviders } from './factory.ts';

const cfg: ProviderRuntimeConfig = {
  secrets: { USAJOBS_API_KEY: 'usa-key', USAJOBS_EMAIL: 'ops@example.com', REED_API_KEY: 'reed-key' },
  timeoutMs: 5000, maxResultsPerProvider: 40, retries: 0,
};

const base: SearchInput = {
  query: 'data analyst', terms: ['data analyst'], location: '', country: 'us',
  remoteOnly: false, workMode: '', employmentType: '', salaryMin: null, salaryMax: null, page: 0,
};
const us: SearchInput = { ...base, location: 'Washington, DC' };
const gb: SearchInput = { ...base, location: 'London', country: 'gb' };

afterEach(() => { vi.unstubAllGlobals(); });

function stubFetch(...responses: Array<Response | Error>) {
  const spy = vi.fn(async (_url: string, _init?: RequestInit) => {
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next ?? new Response('{}', { status: 200 });
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

// ── USAJOBS ──────────────────────────────────────────────────────────────────

// Mirrors the JSON example on developer.usajobs.gov/api-reference/get-api-search:
// ApplyURI and PositionLocation as arrays, remuneration amounts as strings, and
// offset-less timestamps.
const usaFixture = {
  SearchResult: {
    SearchResultCount: 2,
    SearchResultCountAll: 2,
    SearchResultItems: [
      {
        MatchedObjectId: '812345600',
        MatchedObjectDescriptor: {
          PositionID: 'VA-26-12345',
          PositionTitle: 'Data Analyst',
          PositionURI: 'https://www.usajobs.gov:443/GetJob/ViewDetails/812345600',
          ApplyURI: ['https://www.usajobs.gov:443/GetJob/ViewDetails/812345600?PostingChannelID='],
          PositionLocationDisplay: 'Washington, District of Columbia',
          PositionLocation: [{
            LocationName: 'Washington, District of Columbia', CountryCode: 'United States',
            CountrySubDivisionCode: 'District of Columbia', CityName: 'Washington, District of Columbia',
          }],
          OrganizationName: 'Veterans Health Administration',
          DepartmentName: 'Department of Veterans Affairs',
          PositionSchedule: [{ Name: 'Full-time', Code: '1' }],
          PositionOfferingType: [{ Name: 'Permanent', Code: '15317' }],
          QualificationSummary: 'Specialized experience in data analysis.',
          PositionRemuneration: [{
            MinimumRange: '86962.0', MaximumRange: '113047.0', RateIntervalCode: 'PA', Description: 'Per Year',
          }],
          PublicationStartDate: '2026-10-20T00:00:00.0000',
          ApplicationCloseDate: '2026-11-03T23:59:59.9970',
          UserArea: {
            Details: {
              JobSummary: 'Join the VA analytics team. Use SQL and Python to support veterans.',
              WhoMayApply: { Name: 'United States Citizens', Code: '15514' },
              LowGrade: '11', HighGrade: '12',
            },
          },
        },
        RelevanceRank: 0,
      },
      {
        MatchedObjectId: '812345601',
        MatchedObjectDescriptor: {
          PositionID: 'DOD-26-9',
          PositionTitle: 'Student Trainee (Data Science)',
          PositionURI: 'https://www.usajobs.gov:443/GetJob/ViewDetails/812345601',
          ApplyURI: 'https://www.usajobs.gov:443/GetJob/ViewDetails/812345601',
          PositionLocation: { LocationName: 'Kaiserslautern, Germany', CountryCode: 'Germany' },
          OrganizationName: '',
          DepartmentName: 'Department of Defense',
          PositionSchedule: [{ Name: 'Part-time', Code: '2' }],
          PositionOfferingType: [{ Name: 'Internships', Code: '15328' }],
          PositionRemuneration: [{ MinimumRange: '0', MaximumRange: '0', RateIntervalCode: 'WC' }],
          PublicationStartDate: '2026-10-22',
          UserArea: { Details: {} },
        },
      },
    ],
  },
};

describe('USAJobsProvider', () => {
  const p = new USAJobsProvider(cfg);

  it('builds the documented search request with the three required headers', () => {
    const req = p.buildSearchRequest({ ...us, page: 1 })!;
    const url = new URL(req.url);
    expect(url.origin + url.pathname).toBe('https://data.usajobs.gov/api/search');
    expect(url.searchParams.get('Keyword')).toBe('data analyst');
    expect(url.searchParams.get('LocationName')).toBe('Washington, DC');
    expect(url.searchParams.get('ResultsPerPage')).toBe('40');
    expect(url.searchParams.get('Page')).toBe('2');                 // 1-based upstream
    expect(url.searchParams.has('RemoteIndicator')).toBe(false);
    expect(req.init!.headers).toEqual({
      Host: 'data.usajobs.gov', 'User-Agent': 'ops@example.com', 'Authorization-Key': 'usa-key',
    });
  });

  it('asks for remote roles only when the search is remote-only, and caps the page size', () => {
    const big = new USAJobsProvider({ ...cfg, maxResultsPerProvider: 900 });
    const url = new URL(big.buildSearchRequest({ ...base, remoteOnly: true })!.url);
    expect(url.searchParams.get('RemoteIndicator')).toBe('True');
    expect(url.searchParams.get('ResultsPerPage')).toBe('500');
    expect(url.searchParams.has('LocationName')).toBe(false);
  });

  it('maps the documented MatchedObjectDescriptor', () => {
    const [job] = p.parseSearch(usaFixture);
    expect(job).toMatchObject({
      externalId: '812345600',
      title: 'Data Analyst',
      company: 'Veterans Health Administration',
      description: 'Join the VA analytics team. Use SQL and Python to support veterans.',
      salaryMin: 86962,
      salaryMax: 113047,
      currency: 'USD',
      salaryPeriod: 'year',
      location: 'Washington, District of Columbia',
      country: 'US',
      employmentType: 'fulltime',
      applyUrl: 'https://www.usajobs.gov:443/GetJob/ViewDetails/812345600?PostingChannelID=',
      postedDate: '2026-10-20T00:00:00.0000Z',          // pinned to UTC, not the server's zone
      closesAt: '2026-11-03T23:59:59.9970Z',
      via: 'USAJOBS',
    });
    expect(job.metadata).toMatchObject({
      department: 'Department of Veterans Affairs', positionId: 'VA-26-12345',
      whoMayApply: 'United States Citizens', grade: '11–12', salaryInterval: 'PA',
    });
  });

  it('never invents a salary or a US location', () => {
    const [, job] = p.parseSearch(usaFixture);
    expect(job.salaryMin).toBeNull();                   // "0" (without compensation) is not a salary
    expect(job.salaryMax).toBeNull();
    expect(job.currency).toBe('');
    expect(job.salaryPeriod).toBe('');
    expect(job.country).toBe('');                       // overseas federal posting
    expect(job.company).toBe('Department of Defense');  // falls back from an empty organisation
    expect(job.location).toBe('Kaiserslautern, Germany');
    expect(job.applyUrl).toBe('https://www.usajobs.gov:443/GetJob/ViewDetails/812345601');
    expect(job.employmentType).toBe('intern');
    expect(job.description).toBe('');
    expect(job.closesAt).toBeNull();
  });

  it('keeps amounts but leaves the period empty for intervals with no FinatriX period', () => {
    const fixture = structuredClone(usaFixture);
    fixture.SearchResult.SearchResultItems[0].MatchedObjectDescriptor.PositionRemuneration = [
      { MinimumRange: '2400.5', MaximumRange: '', RateIntervalCode: 'BW', Description: 'Bi-weekly' },
    ];
    const [job] = p.parseSearch(fixture);
    expect(job.salaryMin).toBe(2401);
    expect(job.salaryMax).toBeNull();
    expect(job.salaryPeriod).toBe('');
    expect(job.metadata?.salaryInterval).toBe('BW');
  });

  it('reads an hourly rate as hourly', () => {
    const fixture = structuredClone(usaFixture);
    fixture.SearchResult.SearchResultItems[0].MatchedObjectDescriptor.PositionRemuneration = [
      { MinimumRange: '24.10', MaximumRange: '31.33', RateIntervalCode: 'PH', Description: 'Per Hour' },
    ];
    expect(p.parseSearch(fixture)[0].salaryPeriod).toBe('hour');
  });

  it('returns nothing for an unexpected payload instead of throwing', () => {
    expect(p.parseSearch(null)).toEqual([]);
    expect(p.parseSearch({ SearchResult: {} })).toEqual([]);
    expect(p.parseSearch([])).toEqual([]);
  });

  it('serves US searches only', () => {
    expect(p.supports(us)).toBe(true);
    expect(p.supports({ ...us, country: 'US' })).toBe(true);
    expect(p.supports({ ...us, country: 'gb' })).toBe(false);
    expect(p.supports({ ...us, country: 'in' })).toBe(false);
  });

  it('runs the full search → normalise pipeline', async () => {
    const spy = stubFetch(json(usaFixture));
    const jobs = await p.searchJobs(us);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      id: 'usajobs:812345600', provider: 'usajobs', via: 'USAJOBS', employmentType: 'fulltime',
      postedDate: '2026-10-20T00:00:00.000Z', closesAt: '2026-11-03T23:59:59.997Z',
      salary: { min: 86962, max: 113047, currency: 'USD', period: 'year', estimated: false },
    });
    expect(jobs[1].salary).toMatchObject({ min: null, max: null });
  });
});

// ── Reed ─────────────────────────────────────────────────────────────────────

// Reed documents the result fields only by display label; this follows the
// public camelCase shape with dd/MM/yyyy dates (unverified without a live key).
const reedFixture = {
  results: [
    {
      jobId: 51234567, employerId: 612345, employerName: 'Acme Analytics Ltd',
      employerProfileId: null, employerProfileName: null,
      jobTitle: 'Senior Data Analyst', locationName: 'London',
      minimumSalary: 55000.0, maximumSalary: 65000.0, currency: 'GBP',
      expirationDate: '05/12/2026', date: '20/10/2026',
      jobDescription: ' Senior Data Analyst, hybrid, SQL and Python... ',
      applications: 14, jobUrl: 'https://www.reed.co.uk/jobs/senior-data-analyst/51234567',
    },
    {
      jobId: 51234568, employerId: 612346, employerName: 'Temp Co',
      jobTitle: 'Data Entry Clerk', locationName: 'Leeds',
      minimumSalary: null, maximumSalary: null, currency: 'GBP',
      expirationDate: '31/02/2026', date: '21/10/2026',
      jobDescription: 'Temporary data entry.', applications: 0,
      jobUrl: 'https://www.reed.co.uk/jobs/data-entry-clerk/51234568',
    },
  ],
  ambiguousLocations: [],
  totalResults: 2,
};

describe('ReedProvider', () => {
  const p = new ReedProvider(cfg);

  it('builds the documented search request with Basic auth (key as username, empty password)', () => {
    const req = p.buildSearchRequest({ ...gb, page: 2, employmentType: 'parttime' })!;
    const url = new URL(req.url);
    expect(url.origin + url.pathname).toBe('https://www.reed.co.uk/api/1.0/search');
    expect(url.searchParams.get('keywords')).toBe('data analyst');
    expect(url.searchParams.get('locationName')).toBe('London');
    expect(url.searchParams.get('resultsToTake')).toBe('40');
    expect(url.searchParams.get('resultsToSkip')).toBe('80');
    expect(url.searchParams.get('partTime')).toBe('true');
    const auth = (req.init!.headers as Record<string, string>).Authorization;
    expect(auth).toBe(`Basic ${btoa('reed-key:')}`);
    expect(atob(auth.slice('Basic '.length))).toBe('reed-key:');
  });

  it('caps resultsToTake at the documented 100 and sends no filter it was not asked for', () => {
    const url = new URL(new ReedProvider({ ...cfg, maxResultsPerProvider: 250 }).buildSearchRequest(base)!.url);
    expect(url.searchParams.get('resultsToTake')).toBe('100');
    expect(url.searchParams.get('resultsToSkip')).toBe('0');
    for (const k of ['locationName', 'fullTime', 'partTime', 'contract']) {
      expect(url.searchParams.has(k)).toBe(false);
    }
  });

  it('maps a search result, reading dd/MM/yyyy dates day-first', () => {
    const [job] = p.parseSearch(reedFixture);
    expect(job).toMatchObject({
      externalId: '51234567',
      title: 'Senior Data Analyst',
      company: 'Acme Analytics Ltd',
      salaryMin: 55000,
      salaryMax: 65000,
      currency: 'GBP',
      salaryPeriod: '',                                  // search results carry no salary type
      location: 'London',
      country: 'GB',
      applyUrl: 'https://www.reed.co.uk/jobs/senior-data-analyst/51234567',
      postedDate: '2026-10-20T00:00:00.000Z',
      closesAt: '2026-12-05T00:00:00.000Z',              // 5 December, not 12 May
      via: 'Reed',
    });
    expect(job.metadata).toEqual({ employerId: 612345, applications: 14 });
  });

  it('never invents a salary, and drops an impossible date', () => {
    const [, job] = p.parseSearch(reedFixture);
    expect(job.salaryMin).toBeNull();
    expect(job.salaryMax).toBeNull();
    expect(job.currency).toBe('');
    expect(job.closesAt).toBeNull();                     // 31/02 does not exist
  });

  it('uses a salary type when one is present', () => {
    const row = { ...reedFixture.results[0], salaryType: 'per hour', minimumSalary: 15.5 };
    expect(p.parseSearch({ results: [row] })[0]).toMatchObject({ salaryMin: 16, salaryPeriod: 'hour' });
  });

  it('parses dates defensively', () => {
    expect(reedDate('01/02/2026')).toBe('2026-02-01T00:00:00.000Z');
    expect(reedDate('2026-10-20T09:00:00Z')).toBe('2026-10-20T09:00:00Z');  // ISO passes through
    expect(reedDate('')).toBeNull();
    expect(reedDate(null)).toBeNull();
    expect(reedDate('13/13/2026')).toBeNull();
  });

  it('returns nothing for an unexpected payload instead of throwing', () => {
    expect(p.parseSearch(null)).toEqual([]);
    expect(p.parseSearch({ results: 'nope' })).toEqual([]);
  });

  it('serves UK searches only', () => {
    expect(p.supports(gb)).toBe(true);
    expect(p.supports({ ...gb, country: 'GB' })).toBe(true);
    expect(p.supports({ ...gb, country: 'us' })).toBe(false);
    expect(p.supports({ ...gb, country: 'in' })).toBe(false);
  });

  it('runs the full search → normalise pipeline', async () => {
    const spy = stubFetch(json(reedFixture));
    const jobs = await p.searchJobs(gb);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(jobs.map((j) => j.id)).toEqual(['reed:51234567', 'reed:51234568']);
    expect(jobs[0].description).toBe('Senior Data Analyst, hybrid, SQL and Python...');
    expect(jobs[0].workMode).toBe('hybrid');            // derived by the normaliser from the text
    expect(jobs[1].salary).toMatchObject({ min: null, max: null, currency: '' });
  });
});

// ── Shared: fail closed, classify errors, never break the search ─────────────

describe('official providers fail closed', () => {
  const cases: Array<[string, (c: ProviderRuntimeConfig) => JobProvider, SearchInput, Record<string, string>]> = [
    ['usajobs without a key', (c) => new USAJobsProvider(c), us, { USAJOBS_EMAIL: 'ops@example.com' }],
    ['usajobs without an email', (c) => new USAJobsProvider(c), us, { USAJOBS_API_KEY: 'k' }],
    ['reed without a key', (c) => new ReedProvider(c), gb, {}],
  ];

  it.each(cases)('%s is not configured and makes no request', async (_name, make, input, secrets) => {
    const spy = stubFetch();
    // A shared RapidAPI key must not switch these on (BaseProvider.key() falls back to it).
    const p = make({ ...cfg, secrets: { ...secrets, RAPIDAPI_KEY: 'rapid' } });
    expect(p.isConfigured!()).toBe(false);
    expect(await p.searchJobs(input)).toEqual([]);
    expect(await p.health()).toMatchObject({ ok: false });
    expect(spy).not.toHaveBeenCalled();
  });

  it('both report configured once their secrets are set', () => {
    expect(new USAJobsProvider(cfg).isConfigured()).toBe(true);
    expect(new ReedProvider(cfg).isConfigured()).toBe(true);
  });
});

describe('official providers classify errors', () => {
  const providers: Array<[string, () => JobProvider, SearchInput]> = [
    ['usajobs', () => new USAJobsProvider(cfg), us],
    ['reed', () => new ReedProvider(cfg), gb],
  ];

  describe.each(providers)('%s', (_id, make, input) => {
    it.each([
      [401, 'client_error'],
      [403, 'client_error'],
      [429, 'rate_limited'],
      [503, 'server_error'],
    ])('HTTP %i → %s', async (status, kind) => {
      stubFetch(new Response('', { status }));
      const err = await make().searchJobs(input).catch((e) => e);
      expect(err).toBeInstanceOf(ProviderError);
      expect(err).toMatchObject({ status, kind });
    });

    it('a non-JSON body → malformed', async () => {
      stubFetch(new Response('<html>maintenance</html>', { status: 200 }));
      await expect(make().searchJobs(input)).rejects.toMatchObject({ kind: 'malformed' });
    });

    it('a network failure → network', async () => {
      stubFetch(new TypeError('fetch failed'));
      await expect(make().searchJobs(input)).rejects.toMatchObject({ kind: 'network', status: null });
    });
  });
});

describe('official providers inside the ProviderManager fan-out', () => {
  const deps = () => ({
    cache: new TieredCache(new InMemoryCacheStore()),
    health: { load: async () => [], record: async () => {} },
    metrics: { record: async () => {} },
    now: () => 1_000_000,
  });

  it('are registered between the existing natives at their priority', () => {
    const ids = buildNativeProviders(cfg).map((p) => `${p.id}:${p.priority}`);
    expect(ids).toEqual(expect.arrayContaining(['usajobs:85', 'reed:65']));
    const priorities = buildNativeProviders(cfg).map((p) => p.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
  });

  it('a failing official board never fails the search', async () => {
    stubFetch(new Response('', { status: 401 }));
    const mgr = new ProviderManager([new USAJobsProvider(cfg), new ReedProvider(cfg)], deps());
    const res = await mgr.search(us, { requestedProviders: [], userSkills: [] });
    expect(res.status).toEqual({ usajobs: 'error', reed: 'skipped' });
    expect(res.jobs).toEqual([]);
  });

  it('outside their country they are skipped without a request', async () => {
    const spy = stubFetch();
    const mgr = new ProviderManager([new USAJobsProvider(cfg), new ReedProvider(cfg)], deps());
    const res = await mgr.search({ ...base, country: 'in' }, { requestedProviders: [], userSkills: [] });
    expect(res.status).toEqual({ usajobs: 'skipped', reed: 'skipped' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('without secrets they report not-configured', async () => {
    const spy = stubFetch();
    const mgr = new ProviderManager(
      [new USAJobsProvider({ ...cfg, secrets: {} }), new ReedProvider({ ...cfg, secrets: {} })], deps(),
    );
    const res = await mgr.search(gb, { requestedProviders: [], userSkills: [] });
    expect(res.status).toEqual({ usajobs: 'not-configured', reed: 'not-configured' });
    expect(spy).not.toHaveBeenCalled();
  });
});
