import { describe, expect, it } from 'vitest';
import { buildTitleFilter, createRegistry, scanEmployers } from './index.ts';
import type { EmployerEntry, FetchContext, Provider, RequestOptions } from '../types.ts';
import { silentLogger } from '../types.ts';
import { chooseSplitFacet, flattenFacets, isMarketFacetValue, isMultiLocationPlaceholder, planMarketFacet, planMarketSlices, parsePostedOn, stripWorkdayRepostSuffix, trueTotalFromFacets, workdayDedupKey, workdayProvider } from './providers/workday.ts';
import { oracleCloudProvider, resolveSite } from './providers/oraclecloud.ts';
import { pageUpProvider, parsePageupListing, resolveConfig as resolvePageUp } from './providers/pageup.ts';
import { ashbyProvider, greenhouseProvider, leverProvider, parseAshbyCompensation, parseRecruiteeResponse, parseWorkableWidget, recruiteeProvider, smartRecruitersProvider, workableProvider } from './providers/atsApis.ts';

// ── a context whose network is a function ───────────────────────────────────────

type Handler = (url: string, init?: RequestOptions) => unknown | Promise<unknown>;
function mockCtx(handler: Handler, over: Partial<FetchContext> = {}): FetchContext & { calls: Array<{ url: string; body?: string | null }>; warnings: string[] } {
  const calls: Array<{ url: string; body?: string | null }> = [];
  const warnings: string[] = [];
  return {
    calls,
    warnings,
    log: { info() {}, warn: (m: string) => void warnings.push(m) },
    sleep: async () => {},
    fetchJson: (async (url: string, init?: RequestOptions) => {
      calls.push({ url, body: init?.body });
      return handler(url, init);
    }) as FetchContext['fetchJson'],
    fetchText: (async (url: string, init?: RequestOptions) => {
      calls.push({ url, body: init?.body });
      return handler(url, init) as string;
    }) as FetchContext['fetchText'],
    ...over,
  };
}

describe('title filter', () => {
  const f = buildTitleFilter({ positive: ['aml', 'kyc', 'compliance', 'word:risk'], negative: ['senior', 'stem:manag', 'director'] });
  it('matches acronyms on word boundaries only', () => {
    expect(f.test('AML Analyst')).toBe(true);
    expect(f.test('Hamlet Production Analyst')).toBe(false);
    expect(f.test('Compliance Analyst')).toBe(true);
    expect(f.test('Operational Risk Analyst')).toBe(true);
    expect(f.test('Brisket Chef')).toBe(false);
  });
  it('negative keywords reject, with a reason', () => {
    expect(f.test('Senior Compliance Analyst')).toBe(false);
    expect(f.test('Compliance Manager')).toBe(false);
    expect(f.explain('Senior KYC Analyst')).toEqual({ accepted: false, reason: 'negative', keyword: 'senior' });
    expect(f.explain('Barista')).toEqual({ accepted: false, reason: 'no-positive' });
  });
});

describe('registry', () => {
  const registry = createRegistry();
  const route = (e: EmployerEntry) => {
    const r = registry.resolve(e);
    return r && 'provider' in r ? r.provider.id : r;
  };
  it('detects providers from careers URLs', () => {
    expect(route({ name: 'A', careers_url: 'https://boards.greenhouse.io/acme' })).toBe('greenhouse');
    expect(route({ name: 'B', careers_url: 'https://jobs.lever.co/acme' })).toBe('lever');
    expect(route({ name: 'C', careers_url: 'https://westpac.wd3.myworkdayjobs.com/en-US/Westpac_Careers' })).toBe('workday');
    expect(route({ name: 'D', careers_url: 'https://careers.pageuppeople.com/123/cw/en-us/listing/' })).toBe('pageup');
    expect(route({ name: 'E', careers_url: 'https://ecbq.fa.ap1.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/jobs' })).toBe('oraclecloud');
    expect(route({ name: 'F', careers_url: 'https://jobs.ashbyhq.com/acme' })).toBe('ashby');
    expect(route({ name: 'G', careers_url: 'https://apply.workable.com/acme/' })).toBe('workable');
    expect(route({ name: 'H', careers_url: 'https://acme.recruitee.com/' })).toBe('recruitee');
    expect(route({ name: 'I', careers_url: 'https://careers.smartrecruiters.com/Acme' })).toBe('smartrecruiters');
    expect(route({ name: 'J', careers_url: 'https://example.com/careers' })).toBeNull();
  });
  it('explicit provider wins; SEEK is not registered at all', () => {
    expect(route({ name: 'A', provider: 'lever', careers_url: 'https://boards.greenhouse.io/acme' })).toBe('lever');
    expect(registry.get('seek')).toBeUndefined();
    expect(route({ name: 'S', provider: 'seek' })).toEqual({ error: 'unknown or disabled provider: seek' });
    expect(registry.resolve({ name: 'x', careers_url: 'https://www.seek.com.au/' })).toBeNull();
  });
  it('rejects duplicate provider ids', () => {
    expect(() => createRegistry({ extra: [{ ...workdayProvider }] })).toThrow(/duplicate/);
  });
});

describe('scanEmployers', () => {
  const fake = (id: string, impl: Provider['fetch']): Provider => ({ id, detect: (e) => (e.careers_url?.includes(id) ? { url: e.careers_url } : null), fetch: impl });
  const job = (title: string, url: string) => ({ title, url, company: 'X', location: 'Sydney NSW' });

  it('isolates failures, filters titles, de-duplicates and labels every employer', async () => {
    const registry = createRegistry({
      extra: [
        fake('okboard', async () => ({ jobs: [job('KYC Analyst', 'https://x/1'), job('KYC Analyst', 'https://x/1'), job('Senior Chef', 'https://x/2')] })),
        fake('boom', async () => { throw new Error('HTTP 500'); }),
        fake('partial', async () => ({ jobs: [job('Risk Analyst', 'https://x/3')], truncation: { reason: 'cap', transient: false } })),
      ],
    });
    const done: string[] = [];
    const out = await scanEmployers(
      [
        { name: 'Ok', careers_url: 'https://okboard.example' },
        { name: 'Boom', careers_url: 'https://boom.example' },
        { name: 'Partial', careers_url: 'https://partial.example' },
        { name: 'Nobody', careers_url: 'https://nothing.example' },
      ],
      { registry, ctx: mockCtx(() => ({})), titleFilter: buildTitleFilter({ positive: ['kyc', 'risk'] }), onEmployerDone: (r) => void done.push(r.employer) },
    );
    const by = Object.fromEntries(out.employers.map((e) => [e.employer, e]));
    expect(by.Ok).toMatchObject({ status: 'ok', fetched: 3, kept: 1, droppedByTitle: 1, duplicatesInScan: 1, provider: 'okboard' });
    expect(by.Boom).toMatchObject({ status: 'error', error: 'HTTP 500' });
    expect(by.Partial).toMatchObject({ status: 'truncated', kept: 1 });
    expect(by.Nobody!.status).toBe('no-provider');
    expect(out.jobs.map((j) => j.url).sort()).toEqual(['https://x/1', 'https://x/3']);
    expect(out.jobs.every((j) => typeof j.source === 'string')).toBe(true);
    expect(done.sort()).toEqual(['Boom', 'Nobody', 'Ok', 'Partial']);
  });

  it('caps a runaway board and says so', async () => {
    const registry = createRegistry({ extra: [fake('big', async () => ({ jobs: Array.from({ length: 50 }, (_, i) => job(`Analyst ${i}`, `https://x/${i}`)) }))] });
    const out = await scanEmployers([{ name: 'Big', careers_url: 'https://big.example' }], { registry, ctx: mockCtx(() => ({})), maxJobsPerEmployer: 10 });
    expect(out.jobs).toHaveLength(10);
    expect(out.employers[0]).toMatchObject({ status: 'truncated', truncation: { reason: 'cap' } });
  });
});

// ── providers against fixtures ──────────────────────────────────────────────────

describe('Greenhouse', () => {
  const entry: EmployerEntry = { name: 'Acme', careers_url: 'https://boards.greenhouse.io/acme' };
  it('maps jobs, identity and descriptions; resolves work-model-only locations from offices', async () => {
    const ctx = mockCtx((url) => {
      if (url.includes('/offices')) return { offices: [{ name: 'Sydney', departments: [{ jobs: [{ id: 11 }] }] }] };
      return { jobs: [{ id: 11, title: 'Risk Analyst', absolute_url: 'https://boards.greenhouse.io/acme/jobs/11', location: { name: 'Hybrid' }, content: '&lt;p&gt;Assess risk&lt;/p&gt;', first_published: '2026-10-01T00:00:00Z', requisition_id: 'R-9' }, { id: 12, title: 'No Url' }] };
    });
    const { jobs } = await greenhouseProvider.fetch(entry, ctx);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ title: 'Risk Analyst', location: 'Hybrid · Sydney', requisitionId: 'R-9', externalId: '11', listingIdentity: { ats_provider: 'greenhouse', board_slug: 'acme', posting_id: '11' } });
    expect(jobs[0]!.description).toContain('Assess risk');
    expect(ctx.calls[0]!.url).toContain('content=true');
  });
  it('refuses a foreign API host', () => {
    expect(greenhouseProvider.detect({ name: 'x', api: 'https://evil.example/v1/boards/acme/jobs' })).toBeNull();
  });
});

describe('Lever', () => {
  it('maps postings and merges locations', async () => {
    const ctx = mockCtx(() => [{ id: 'abc-1', text: 'Fraud Analyst', hostedUrl: 'https://jobs.lever.co/acme/abc-1', categories: { location: 'Sydney', allLocations: ['Sydney', 'Melbourne'] }, descriptionPlain: 'Investigate fraud', lists: [{ text: 'You have', content: '<li>KYC</li>' }], createdAt: 1_760_000_000_000 }]);
    const { jobs } = await leverProvider.fetch({ name: 'Acme', careers_url: 'https://jobs.lever.co/acme' }, ctx);
    expect(jobs[0]).toMatchObject({ title: 'Fraud Analyst', location: 'Sydney; Melbourne', postedAt: 1_760_000_000_000, listingIdentity: { ats_provider: 'lever', board_slug: 'acme', posting_id: 'abc-1' } });
    expect(jobs[0]!.description).toMatch(/Investigate fraud[\s\S]*KYC/);
  });
  it('returns no jobs when the board answers with a non-array', async () => {
    expect((await leverProvider.fetch({ name: 'Acme', careers_url: 'https://jobs.lever.co/acme' }, mockCtx(() => ({ ok: false })))).jobs).toEqual([]);
  });
});

describe('SmartRecruiters, Ashby, Workable, Recruitee', () => {
  it('SmartRecruiters: one page, canonical job URLs, optional details', async () => {
    const ctx = mockCtx((url) => (url.includes('/postings/') && !url.includes('?') ? { jobAd: { sections: { jobDescription: { text: '<p>Do KYC</p>' } } } } : { content: [{ id: '743', name: 'KYC Analyst', refNumber: 'REF1', ref: 'https://api.smartrecruiters.com/v1/companies/acme/postings/743', location: { fullLocation: 'Sydney, NSW, Australia', remote: false }, language: { code: 'en' } }] }));
    const { jobs } = await smartRecruitersProvider.fetch({ name: 'Acme', careers_url: 'https://careers.smartrecruiters.com/acme', smartrecruiters: { fetchDetails: true } }, ctx);
    expect(jobs[0]).toMatchObject({ title: 'KYC Analyst', url: 'https://jobs.smartrecruiters.com/acme/743-kyc-analyst', requisitionId: 'REF1', externalId: '743', location: 'Sydney, NSW, Australia' });
    expect(jobs[0]!.description).toContain('Do KYC');
  });

  it('Ashby: skips unlisted jobs and annualises compensation', async () => {
    const ctx = mockCtx(() => ({ jobs: [
      { id: 'a1', title: 'Analyst', jobUrl: 'https://jobs.ashbyhq.com/acme/a1', location: 'Sydney', descriptionPlain: 'Do work', publishedAt: '2026-10-01', compensation: { compensationTiers: [{ components: [{ compensationType: 'Salary', interval: '1 YEAR', minValue: 80000, maxValue: 90000, currencyCode: 'AUD' }] }] } },
      { id: 'a2', title: 'Hidden', jobUrl: 'https://jobs.ashbyhq.com/acme/a2', isListed: false },
    ] }));
    const { jobs } = await ashbyProvider.fetch({ name: 'Acme', careers_url: 'https://jobs.ashbyhq.com/acme' }, ctx);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ salaryText: 'AUD 80000-90000 per year', listingIdentity: { ats_provider: 'ashby', board_slug: 'acme', posting_id: 'a1' } });
    expect(parseAshbyCompensation({ compensation: { compensationTiers: [{ components: [{ compensationType: 'Salary', interval: 'weird', minValue: 1 }] }] } })).toBeNull();
    expect(parseAshbyCompensation({ compensation: { compensationTiers: [{ components: [{ compensationType: 'Salary', interval: '1 HOUR', minValue: 50, maxValue: 60, currencyCode: 'aud' }] }] } })).toMatchObject({ min: 104000, max: 124800, currency: 'AUD' });
  });

  it('Workable: only vendor-hosted https URLs', () => {
    const jobs = parseWorkableWidget({ jobs: [
      { title: 'Analyst', url: 'https://apply.workable.com/acme/j/ABC123/', city: 'Sydney', state: 'NSW', country: 'Australia', shortcode: 'ABC123' },
      { title: 'Evil', url: 'https://evil.example/j/1' },
      { title: 'Remote', url: 'https://apply.workable.com/acme/j/DEF456/', telecommuting: true },
    ] }, 'Acme');
    expect(jobs.map((j) => j.title)).toEqual(['Analyst', 'Remote']);
    expect(jobs[0]!.location).toBe('Sydney, NSW, Australia');
    expect(jobs[1]!.location).toBe('Remote');
    expect(workableProvider.detect({ name: 'x', careers_url: 'http://apply.workable.com/acme' })).toBeNull();
  });

  it('Recruitee: drops sample and unpublished offers', () => {
    const jobs = parseRecruiteeResponse({ offers: [
      { id: 1, title: 'Analyst', status: 'published', careers_url: 'https://acme.recruitee.com/o/analyst', locations: [{ name: 'Sydney' }, { name: 'Sydney' }], description: '<p>Hi</p>' },
      { id: 2, title: 'Dummy (sample)', status: 'published', careers_url: 'https://acme.recruitee.com/o/dummy' },
      { id: 3, title: 'Draft', status: 'draft', careers_url: 'https://acme.recruitee.com/o/draft' },
    ] }, 'Acme');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.location).toBe('Sydney');
    expect(recruiteeProvider.detect({ name: 'x', careers_url: 'https://acme.recruitee.com/' })?.url).toBe('https://acme.recruitee.com/api/offers/');
  });
});

describe('Workday', () => {
  const entry: EmployerEntry = { name: 'Big Bank', careers_url: 'https://bigbank.wd3.myworkdayjobs.com/en-US/BigBank_Careers' };
  const posting = (n: number, extra: Record<string, unknown> = {}) => ({ title: `Analyst ${n}`, externalPath: `/job/Sydney-NSW/Analyst-${n}_JR-10${n}`, locationsText: 'Sydney, NSW', postedOn: 'Posted 3 Days Ago', ...extra });

  it('helpers: repost suffixes, dedup keys, posted-on labels, placeholders', () => {
    expect(stripWorkdayRepostSuffix('JR-1234-2')).toBe('jr-1234');
    expect(stripWorkdayRepostSuffix('JR-1234')).toBe('jr-1234');
    expect(workdayDedupKey({ url: 'https://bigbank.wd3.myworkdayjobs.com/BigBank_Careers/job/Sydney/Analyst_JR-1234-2' })).toBe(workdayDedupKey({ url: 'https://bigbank.wd3.myworkdayjobs.com/BigBank_Careers/job/Melbourne/Analyst_JR-1234' }));
    expect(workdayDedupKey({ url: 'https://example.com/job/x_JR-1' })).toBeNull();
    const now = Date.parse('2026-10-24T00:00:00Z');
    expect(parsePostedOn('Posted Today', now)).toBe(now);
    expect(parsePostedOn('Posted 3 Days Ago', now)).toBe(now - 3 * 86_400_000);
    expect(parsePostedOn('Posted 30+ Days Ago', now)).toBeUndefined();
    expect(isMultiLocationPlaceholder('2 Locations')).toBe(true);
    expect(isMultiLocationPlaceholder('Sydney')).toBe(false);
  });

  it('single page: builds URLs, requisition ids and a POST body', async () => {
    const ctx = mockCtx(() => ({ total: 2, jobPostings: [posting(1), posting(2)], facets: [] }));
    const { jobs, truncation } = await workdayProvider.fetch(entry, ctx);
    expect(truncation).toBeUndefined();
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ url: 'https://bigbank.wd3.myworkdayjobs.com/BigBank_Careers/job/Sydney-NSW/Analyst-1_JR-101', requisitionId: 'JR-101', location: 'Sydney, NSW' });
    expect(JSON.parse(ctx.calls[0]!.body!)).toMatchObject({ limit: 20, offset: 0 });
    expect(ctx.calls[0]!.url).toBe('https://bigbank.wd3.myworkdayjobs.com/wday/cxs/bigbank/BigBank_Careers/jobs');
  });

  it('resolves "N Locations" from the detail document', async () => {
    const ctx = mockCtx((url) => (url.endsWith('/jobs') ? { total: 1, jobPostings: [posting(1, { locationsText: '2 Locations' })], facets: [] } : { jobPostingInfo: { location: 'Sydney, NSW', additionalLocations: ['Melbourne, VIC'], startDate: '2026-10-01' } }));
    const { jobs } = await workdayProvider.fetch(entry, ctx);
    expect(jobs[0]!.location).toBe('Sydney, NSW · Melbourne, VIC');
    expect(jobs[0]!.postedAt).toBe(Date.parse('2026-10-01'));
  });

  it('pages through results and reports a truncation at max_pages', async () => {
    const ctx = mockCtx((_url, init) => {
      const { offset } = JSON.parse(init!.body!) as { offset: number };
      return { total: 100, jobPostings: Array.from({ length: 20 }, (_, i) => posting(offset + i)), facets: [] };
    });
    const out = await workdayProvider.fetch({ ...entry, max_pages: 2 }, ctx);
    expect(out.jobs).toHaveLength(40);
    expect(out.truncation).toMatchObject({ reason: 'cap', transient: false });
  });

  it('a mid-run failure keeps the pages already read and flags a transient fetch-error', async () => {
    let n = 0;
    const ctx = mockCtx((_url, init) => {
      if (n++ === 1) throw new Error('HTTP 503');
      const { offset } = JSON.parse(init!.body!) as { offset: number };
      return { total: 60, jobPostings: Array.from({ length: 20 }, (_, i) => posting(offset + i)), facets: [] };
    });
    const out = await workdayProvider.fetch(entry, ctx);
    expect(out.jobs).toHaveLength(20);
    expect(out.truncation).toMatchObject({ reason: 'fetch-error', transient: true });
    expect(ctx.warnings.join(' ')).toMatch(/truncated at 2 of 3 pages/);
  });

  it('recovers past the 2000 offset ceiling by splitting on a facet', async () => {
    const facets = [{ facetParameter: 'locations', descriptor: 'Location', values: [{ id: 'syd', descriptor: 'Sydney', count: 1500 }, { id: 'mel', descriptor: 'Melbourne', count: 1000 }] }];
    expect(trueTotalFromFacets(facets)).toBe(2500);
    expect(chooseSplitFacet(facets)?.facetParameter).toBe('locations');

    const ctx = mockCtx((_url, init) => {
      const body = JSON.parse(init!.body!) as { offset: number; appliedFacets: Record<string, string[]> };
      const slice = body.appliedFacets.locations?.[0];
      if (!slice) return { total: 2000, jobPostings: Array.from({ length: 20 }, (_, i) => posting(body.offset + i)), facets };
      const base = slice === 'syd' ? 10_000 : 20_000;
      const count = slice === 'syd' ? 40 : 20;
      return { total: count, jobPostings: Array.from({ length: Math.min(20, count - body.offset) }, (_, i) => posting(base + body.offset + i)), facets: [] };
    });
    const out = await workdayProvider.fetch({ ...entry, max_pages: 100 }, ctx);
    // root pages (2000/20=100, capped by max_pages) + slices; slices must have run and added jobs the root could not reach
    expect(out.jobs.some((j) => j.url.includes('Analyst-10000_'))).toBe(true);
    expect(out.jobs.some((j) => j.url.includes('Analyst-20000_'))).toBe(true);
    expect(ctx.warnings.join(' ')).toMatch(/offset-clamped at 2000/);
  });

  it('stops early once a page is older than sinceMs', async () => {
    const now = Date.now();
    const ctx = mockCtx(() => ({ total: 200, jobPostings: Array.from({ length: 20 }, (_, i) => posting(i, { postedOn: 'Posted 20 Days Ago' })), facets: [] }), { sinceMs: now - 5 * 86_400_000 });
    await workdayProvider.fetch(entry, ctx);
    expect(ctx.calls).toHaveLength(1);
  });

  it('stops paging at the deadline, keeps what it read and reports the scan as cut short', async () => {
    const handler = (_url: string, init?: RequestOptions) => {
      const { offset } = JSON.parse(init!.body!) as { offset: number };
      return { total: 100, jobPostings: Array.from({ length: 20 }, (_, i) => posting(offset + i)), facets: [] };
    };
    const late = mockCtx(handler, { deadline: Date.now() - 1 });
    const cut = await workdayProvider.fetch(entry, late);
    expect(late.calls).toHaveLength(1);
    expect(cut.jobs).toHaveLength(20);
    expect(cut.truncation).toEqual({ reason: 'budget', transient: false, detail: 'time budget reached; 20 jobs recovered' });

    const inTime = mockCtx(handler, { deadline: Date.now() + 60_000 });
    const full = await workdayProvider.fetch(entry, inTime);
    expect(full.jobs).toHaveLength(100);
    expect(full.truncation).toBeUndefined();
  });

  it('makes no "N Locations" detail request past the deadline, and says so', async () => {
    const ctx = mockCtx(
      (url) => (url.endsWith('/jobs') ? { total: 1, jobPostings: [posting(1, { locationsText: '2 Locations' })], facets: [] } : { jobPostingInfo: { location: 'Sydney, NSW' } }),
      { deadline: Date.now() - 1 },
    );
    const out = await workdayProvider.fetch(entry, ctx);
    expect(ctx.calls).toHaveLength(1);
    expect(out.jobs[0]!.location).toBe('2 Locations');
    expect(out.truncation).toMatchObject({ reason: 'budget', transient: false });
  });

  it('refuses a tenant it cannot derive', async () => {
    await expect(workdayProvider.fetch({ name: 'x', careers_url: 'https://example.com' }, mockCtx(() => ({})))).rejects.toThrow(/cannot derive/);
  });
});

describe('Workday: market-only mode and nested facets', () => {
  const entry: EmployerEntry = { name: 'Global Co', careers_url: 'https://globalco.wd5.myworkdayjobs.com/en-US/External', workday: { marketOnly: 'au' } };
  const posting = (n: number) => ({ title: `Compliance Analyst ${n}`, externalPath: `/job/Sydney/Compliance-Analyst-${n}_JR-${n}`, locationsText: 'Australia, Sydney', postedOn: 'Posted Today' });
  // Shape observed on a live multinational tenant: location facets sit inside a `locationMainGroup` container.
  const nestedFacets = (opts: { au?: boolean } = {}) => [
    { facetParameter: 'jobFamilyGroup', descriptor: 'Job Family Group', values: [{ id: 'jf1', descriptor: 'Engineering', count: 80 }, { id: 'jf2', descriptor: 'Finance', count: 20 }] },
    {
      facetParameter: 'locationMainGroup',
      descriptor: 'Location',
      values: [
        { facetParameter: 'locationHierarchy2', descriptor: 'Location Type', values: [{ id: 'office', descriptor: 'Office', count: 90 }, { id: 'remote', descriptor: 'Remote', count: 10 }] },
        { facetParameter: 'locationHierarchy1', descriptor: 'Locations', values: [...(opts.au === false ? [] : [{ id: 'au-id', descriptor: 'Australia', count: 3 }]), { id: 'us-id', descriptor: 'United States', count: 90 }, { id: 'in-id', descriptor: 'India', count: 7 }] },
        { facetParameter: 'locations', descriptor: 'Sites', values: [...(opts.au === false ? [] : [{ id: 's1', descriptor: 'Australia, Sydney', count: 2 }, { id: 's2', descriptor: 'Australia, Remote', count: 1 }]), { id: 's3', descriptor: 'Melbourne, Florida', count: 2 }, { id: 's4', descriptor: 'US, CA, Santa Clara', count: 88 }] },
      ],
    },
  ];

  it('lifts nested facet groups so each leaf is addressable', () => {
    expect(flattenFacets(nestedFacets()).map((f) => f.facetParameter)).toEqual(['jobFamilyGroup', 'locationHierarchy2', 'locationHierarchy1', 'locations']);
    expect(trueTotalFromFacets(nestedFacets())).toBe(100);
    const big = [{ facetParameter: 'grp', values: [{ facetParameter: 'a', values: [{ id: '1', count: 1500 }, { id: '2', count: 1000 }] }] }];
    expect(trueTotalFromFacets(big)).toBe(2500);
    expect(chooseSplitFacet(big)?.facetParameter).toBe('a');
  });

  it('picks the country-level facet and never an overseas namesake', () => {
    expect(planMarketFacet(nestedFacets(), 'au')).toEqual({ kind: 'slices', facetParameter: 'locationHierarchy1', values: [{ id: 'au-id', count: 3, descriptor: 'Australia' }] });
    expect(planMarketFacet(nestedFacets({ au: false }), 'au')).toEqual({ kind: 'no-match' });
    expect(planMarketFacet([nestedFacets()[0]], 'au')).toEqual({ kind: 'no-location-facet' });
    expect(isMarketFacetValue('Melbourne, Florida', 'au')).toBe(false);
    expect(isMarketFacetValue('Australia, Sydney', 'au')).toBe(true);
    expect(isMarketFacetValue('Sydney NSW', 'au')).toBe(true);
  });

  it('slices the same board for any market', () => {
    expect(planMarketFacet(nestedFacets(), 'in')).toEqual({ kind: 'slices', facetParameter: 'locationHierarchy1', values: [{ id: 'in-id', count: 7, descriptor: 'India' }] });
    expect(planMarketFacet(nestedFacets(), 'us')).toEqual({ kind: 'slices', facetParameter: 'locationHierarchy1', values: [{ id: 'us-id', count: 90, descriptor: 'United States' }] });
    expect(planMarketFacet(nestedFacets(), 'nz')).toEqual({ kind: 'no-match' });
    expect(isMarketFacetValue('Melbourne, Florida', 'us')).toBe(true);
  });

  it('crawls only the Australian slice and never the whole board', async () => {
    const ctx = mockCtx((_url, init) => {
      const body = JSON.parse(init!.body!) as { limit: number; appliedFacets: Record<string, string[]> };
      if (body.limit === 1) return { total: 100, jobPostings: [posting(0)], facets: nestedFacets() };
      if (body.appliedFacets.locationHierarchy1?.[0] === 'au-id') return { total: 3, jobPostings: [posting(1), posting(2), posting(3)], facets: [] };
      throw new Error('unfiltered crawl attempted');
    });
    const { jobs, truncation } = await workdayProvider.fetch(entry, ctx);
    expect(jobs.map((j) => j.title)).toEqual(['Compliance Analyst 1', 'Compliance Analyst 2', 'Compliance Analyst 3']);
    expect(truncation).toBeUndefined();
    expect(ctx.calls).toHaveLength(2);
  });

  it('does not mistake an applied facet\'s unfiltered counts for a clamped result', async () => {
    // Observed live: a 12-posting slice still reports 2,806 on the very facet it was sliced by.
    const sliceFacets = [{ facetParameter: 'locationHierarchy1', descriptor: 'Locations', values: [{ id: 'au-id', descriptor: 'Australia', count: 12 }, { id: 'x', descriptor: 'Elsewhere', count: 2794 }] }, { facetParameter: 'timeType', values: [{ id: 'ft', count: 12 }] }];
    expect(trueTotalFromFacets(sliceFacets)).toBe(2806);
    expect(trueTotalFromFacets(sliceFacets, ['locationHierarchy1'])).toBe(12);
    const ctx = mockCtx((_url, init) => {
      const body = JSON.parse(init!.body!) as { limit: number };
      return body.limit === 1 ? { total: 3000, jobPostings: [posting(0)], facets: nestedFacets() } : { total: 12, jobPostings: Array.from({ length: 12 }, (_, i) => posting(i + 1)).slice(0, 12), facets: sliceFacets };
    });
    const out = await workdayProvider.fetch(entry, ctx);
    expect(out.truncation).toBeUndefined();
    expect(ctx.warnings.join(' ')).not.toMatch(/offset-clamped/);
  });

  it('a tenant with no Australian postings returns nothing after a single request', async () => {
    const ctx = mockCtx(() => ({ total: 100, jobPostings: [posting(0)], facets: nestedFacets({ au: false }) }));
    const out = await workdayProvider.fetch(entry, ctx);
    expect(out).toEqual({ jobs: [] });
    expect(ctx.calls).toHaveLength(1);
  });

  it('falls back to a full crawl, with a warning, when the tenant has no location facet', async () => {
    const ctx = mockCtx((_url, init) => {
      const body = JSON.parse(init!.body!) as { limit: number };
      const facets = [nestedFacets()[0]];
      return body.limit === 1 ? { total: 2, jobPostings: [posting(0)], facets } : { total: 2, jobPostings: [posting(1), posting(2)], facets };
    });
    const { jobs } = await workdayProvider.fetch(entry, ctx);
    expect(jobs).toHaveLength(2);
    expect(ctx.warnings.join(' ')).toMatch(/no location facet/);
  });

  it('reports a failed Australian slice as a truncation instead of silently dropping it', async () => {
    const ctx = mockCtx((_url, init) => {
      const body = JSON.parse(init!.body!) as { limit: number };
      if (body.limit === 1) return { total: 100, jobPostings: [posting(0)], facets: nestedFacets() };
      throw new Error('HTTP 503');
    });
    const out = await workdayProvider.fetch(entry, ctx);
    expect(out.jobs).toEqual([]);
    expect(out.truncation).toMatchObject({ reason: 'fetch-error', transient: true });
  });

  it('passes searchText and fixed facets to every request', async () => {
    const ctx = mockCtx(() => ({ total: 1, jobPostings: [posting(1)], facets: [] }));
    await workdayProvider.fetch({ ...entry, workday: { searchText: ' compliance ', appliedFacets: { timeType: ['ft'], junk: [] as string[] } } }, ctx);
    expect(JSON.parse(ctx.calls[0]!.body!)).toMatchObject({ searchText: 'compliance', appliedFacets: { timeType: ['ft'] } });
    expect(JSON.parse(ctx.calls[0]!.body!).appliedFacets).not.toHaveProperty('junk');
  });
});

describe('Workday: resuming a board across calls', () => {
  const entry: EmployerEntry = { name: 'Big Bank', careers_url: 'https://bigbank.wd3.myworkdayjobs.com/en-US/BigBank_Careers' };
  const posting = (n: number, extra: Record<string, unknown> = {}) => ({ title: `Analyst ${n}`, externalPath: `/job/Sydney-NSW/Analyst-${n}_JR-10${n}`, locationsText: 'Sydney, NSW', postedOn: 'Posted 3 Days Ago', ...extra });
  type Body = { limit: number; offset: number; appliedFacets: Record<string, string[]> };
  const body = (raw?: string | null) => JSON.parse(raw!) as Body;
  const flat = (total: number): Handler => (_url, init) => {
    const { offset } = body(init?.body);
    return { total, jobPostings: Array.from({ length: Math.max(0, Math.min(20, total - offset)) }, (_, i) => posting(offset + i)), facets: [] };
  };

  /** Call until the provider stops returning a cursor; every call's result, in order. */
  async function pass(handler: Handler, maxJobs: number, target: EmployerEntry = entry) {
    const calls: Array<{ jobs: string[]; cursor?: unknown; truncation?: unknown; requests: Body[] }> = [];
    let cursor: unknown = null;
    do {
      const ctx = mockCtx(handler, { resume: { cursor, maxJobs } });
      const out = await workdayProvider.fetch(target, ctx);
      calls.push({ jobs: out.jobs.map((j) => j.url), cursor: out.cursor, truncation: out.truncation, requests: ctx.calls.map((c) => body(c.body)) });
      cursor = out.cursor;
    } while (cursor !== undefined && calls.length < 20);
    return calls;
  }

  it('reads a board too big for one call over several, carrying on one page before where it stopped', async () => {
    const calls = await pass(flat(100), 60);
    expect(calls.map((c) => c.jobs.length)).toEqual([60, 60, 60]);
    expect(calls.map((c) => c.cursor === undefined)).toEqual([false, false, true]);
    expect(new Set(calls.flatMap((c) => c.jobs)).size).toBe(100);
    // The first page (totals and facets) again, then the overlap page, then new pages.
    expect(calls[1]!.requests.map((r) => r.offset)).toEqual([0, 40, 60]);
    expect(calls.every((c) => c.truncation === undefined)).toBe(true);
  });

  it('pauses at the deadline with a cursor instead of reporting the scan cut short', async () => {
    const ctx = mockCtx(flat(100), { deadline: Date.now() - 1, resume: { cursor: null, maxJobs: 800 } });
    const out = await workdayProvider.fetch(entry, ctx);
    expect(ctx.calls).toHaveLength(1);
    expect(out.jobs).toHaveLength(20);
    expect(out.truncation).toBeUndefined();
    expect(out.cursor).toEqual({ v: 1, next: { '': 20 }, done: [], splitOn: {} });
  });

  it('always reads something new, even when re-reading takes the whole allowance', async () => {
    const calls = await pass(flat(100), 20);
    expect(calls.at(-1)!.cursor).toBeUndefined();
    expect(new Set(calls.flatMap((c) => c.jobs)).size).toBe(100);
  });

  it('starts a new pass from a cursor it did not write, or one for a finished crawl', async () => {
    for (const cursor of ['garbage', { v: 2 }, { v: 1, next: { '': 80 }, done: [''], splitOn: {} }]) {
      const ctx = mockCtx(flat(40), { resume: { cursor, maxJobs: 800 } });
      const out = await workdayProvider.fetch(entry, ctx);
      expect(out.jobs).toHaveLength(40);
      expect(ctx.calls.map((c) => body(c.body).offset)).toEqual([0, 20]);
    }
  });

  it('never keeps half a page: a pause while resolving "N Locations" reads the page again next call', async () => {
    let detailCalls = 0;
    let ctx: FetchContext | null = null;
    const handler: Handler = (url) => {
      if (url.endsWith('/jobs')) return { total: 2, jobPostings: [posting(1, { locationsText: '2 Locations' }), posting(2, { locationsText: '3 Locations' })], facets: [] };
      // The run's time runs out after the first detail document.
      if (++detailCalls === 1) ctx!.deadline = Date.now() - 1;
      return { jobPostingInfo: { location: 'Sydney, NSW', additionalLocations: ['Melbourne, VIC'] } };
    };
    const call = (cursor: unknown) => workdayProvider.fetch(entry, (ctx = mockCtx(handler, { resume: { cursor, maxJobs: 800 }, deadline: Date.now() + 60_000 })));
    const first = await call(null);
    expect(first.jobs).toEqual([]);
    expect(first.cursor).toBeDefined();
    const second = await call(first.cursor);
    expect(second.cursor).toBeUndefined();
    expect(second.jobs.map((j) => j.location)).toEqual(['Sydney, NSW · Melbourne, VIC', 'Sydney, NSW · Melbourne, VIC']);
  });

  it('resumes a split board slice by slice, never reading a finished slice again', async () => {
    const facets = [{ facetParameter: 'locations', descriptor: 'Location', values: [{ id: 'syd', descriptor: 'Sydney', count: 1500 }, { id: 'mel', descriptor: 'Melbourne', count: 1000 }] }];
    const handler: Handler = (_url, init) => {
      const { offset, appliedFacets } = body(init?.body);
      const slice = appliedFacets.locations?.[0];
      if (!slice) return { total: 2000, jobPostings: Array.from({ length: 20 }, (_, i) => posting(offset + i)), facets };
      const base = slice === 'syd' ? 10_000 : 20_000;
      const count = slice === 'syd' ? 40 : 20;
      return { total: count, jobPostings: Array.from({ length: Math.min(20, count - offset) }, (_, i) => posting(base + offset + i)), facets: [] };
    };
    const calls = await pass(handler, 60, { ...entry, max_pages: 3 });
    expect(calls.map((c) => c.requests.map((r) => r.appliedFacets.locations?.[0] ?? 'board'))).toEqual([['board', 'board', 'board'], ['board', 'syd', 'syd'], ['board', 'mel']]);
    expect(calls[0]!.cursor).toEqual({ v: 1, next: { '': -1 }, done: [], splitOn: { '': 'locations' } });
    expect(calls[1]!.cursor).toEqual({ v: 1, next: { '': -1 }, done: ['locations=syd'], splitOn: { '': 'locations' } });
    expect(calls[2]!.cursor).toBeUndefined();
    expect(new Set(calls.flatMap((c) => c.jobs)).size).toBe(60 + 40 + 20);
    expect(calls.every((c) => c.truncation === undefined)).toBe(true);
  });

  it('keeps splitting on the facet a resumed crawl began with while Workday still offers it', () => {
    const facets = [
      { facetParameter: 'locations', values: [{ id: 'a', count: 1500 }, { id: 'b', count: 1000 }] },
      { facetParameter: 'jobFamily', values: [{ id: 'x', count: 1300 }, { id: 'y', count: 1200 }] },
    ];
    expect(chooseSplitFacet(facets)?.facetParameter).toBe('jobFamily');
    expect(chooseSplitFacet(facets, { prefer: 'locations' })?.facetParameter).toBe('locations');
    expect(chooseSplitFacet(facets, { prefer: 'gone' })?.facetParameter).toBe('jobFamily');
  });
});

describe('Workday: several markets on one board', () => {
  const entry: EmployerEntry = { name: 'Global Co', careers_url: 'https://globalco.wd5.myworkdayjobs.com/en-US/External', workday: { marketOnly: ['au', 'in'] } };
  const posting = (n: number) => ({ title: `Analyst ${n}`, externalPath: `/job/x/Analyst-${n}_JR-${n}`, locationsText: 'Somewhere', postedOn: 'Posted Today' });
  const countries = (us = 90) => [
    { facetParameter: 'locationCountry', descriptor: 'Country', values: [{ id: 'au-id', descriptor: 'Australia', count: 3 }, { id: 'in-id', descriptor: 'India', count: 5 }, { id: 'us-id', descriptor: 'United States of America', count: us }] },
  ];
  type Body = { limit: number; offset: number; appliedFacets: Record<string, string[]> };

  it("plans the union of each market's slices, once each", () => {
    const au = { facetParameter: 'locationCountry', id: 'au-id', descriptor: 'Australia', count: 3 };
    const india = { facetParameter: 'locationCountry', id: 'in-id', descriptor: 'India', count: 5 };
    expect(planMarketSlices(countries(), ['au', 'in'])).toEqual({ kind: 'slices', slices: [au, india] });
    expect(planMarketSlices(countries(), ['au', 'au'])).toEqual({ kind: 'slices', slices: [au] });
    expect(planMarketSlices(countries(), ['nz', 'gb'])).toEqual({ kind: 'no-match' });
    expect(planMarketSlices([{ facetParameter: 'jobFamily', values: [{ id: 'x', count: 3 }] }], ['au', 'in'])).toEqual({ kind: 'no-location-facet' });
    expect(planMarketFacet(countries(), 'in')).toEqual({ kind: 'slices', facetParameter: 'locationCountry', values: [{ id: 'in-id', descriptor: 'India', count: 5 }] });
  });

  it("crawls only the slices in the employer's markets", async () => {
    const ctx = mockCtx((_url, init) => {
      const b = JSON.parse(init!.body!) as Body;
      if (b.limit === 1) return { total: 98, jobPostings: [posting(0)], facets: countries() };
      const slice = b.appliedFacets.locationCountry?.[0];
      if (slice === 'au-id') return { total: 3, jobPostings: [1, 2, 3].map(posting), facets: [] };
      if (slice === 'in-id') return { total: 5, jobPostings: [4, 5, 6, 7, 8].map(posting), facets: [] };
      throw new Error("crawled outside the employer's markets");
    });
    const out = await workdayProvider.fetch(entry, ctx);
    expect(out.jobs).toHaveLength(8);
    expect(out.truncation).toBeUndefined();
    expect(ctx.calls).toHaveLength(3);
  });

  it('splits a market slice past the offset ceiling instead of stopping at 2,000', async () => {
    const sliceFacets = [
      { facetParameter: 'locationCountry', values: [{ id: 'us-id', count: 2500 }] },
      { facetParameter: 'state', descriptor: 'State', values: [{ id: 'ca', count: 1300 }, { id: 'ny', count: 1200 }] },
    ];
    const ctx = mockCtx((_url, init) => {
      const b = JSON.parse(init!.body!) as Body;
      if (b.limit === 1) return { total: 2000, jobPostings: [posting(0)], facets: countries(2500) };
      const state = b.appliedFacets.state?.[0];
      if (!state) return { total: 2000, jobPostings: Array.from({ length: 20 }, (_, i) => posting(b.offset + i)), facets: sliceFacets };
      return { total: 20, jobPostings: Array.from({ length: 20 }, (_, i) => posting((state === 'ca' ? 10_000 : 20_000) + i)), facets: [] };
    });
    const out = await workdayProvider.fetch({ ...entry, max_pages: 2, workday: { marketOnly: 'us' } }, ctx);
    const asked = ctx.calls.map((c) => (JSON.parse(c.body!) as Body).appliedFacets).filter((f) => f.state);
    expect(asked).toEqual([{ locationCountry: ['us-id'], state: ['ca'] }, { locationCountry: ['us-id'], state: ['ny'] }]);
    expect(out.jobs).toHaveLength(40 + 20 + 20);
    expect(out.truncation).toBeUndefined();
  });
});

describe('Oracle Recruiting Cloud', () => {
  const entry: EmployerEntry = { name: 'Uni', careers_url: 'https://ekbl.fa.ap1.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_5001/jobs' };
  it('derives the site and reads requisitions', async () => {
    expect(resolveSite(entry)).toMatchObject({ host: 'ekbl.fa.ap1.oraclecloud.com', siteNumber: 'CX_5001', lang: 'en' });
    const ctx = mockCtx(() => ({ items: [{ TotalJobsCount: 1, requisitionList: [{ Id: '4021', Title: 'Compliance Officer', PrimaryLocation: 'Melbourne, VIC', WorkplaceTypeCode: 'ORA_HYBRID', PostedDate: '2026-10-02', ShortDescriptionStr: 'Support &amp; assure' }] }] }));
    const { jobs, truncation } = await oracleCloudProvider.fetch(entry, ctx);
    expect(truncation).toBeUndefined();
    expect(jobs[0]).toMatchObject({ title: 'Compliance Officer', location: 'Melbourne, VIC · Hybrid', externalId: '4021', url: 'https://ekbl.fa.ap1.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_5001/job/4021', description: 'Support & assure' });
  });
  it('stops after the first page once the deadline has passed', async () => {
    const requisitions = Array.from({ length: 200 }, (_, i) => ({ Id: String(i), Title: `Role ${i}`, PrimaryLocation: 'Melbourne, VIC' }));
    const ctx = mockCtx(() => ({ items: [{ TotalJobsCount: 450, requisitionList: requisitions }] }), { deadline: Date.now() - 1 });
    const { jobs, truncation } = await oracleCloudProvider.fetch(entry, ctx);
    expect(ctx.calls).toHaveLength(1);
    expect(jobs).toHaveLength(200);
    expect(truncation).toEqual({ reason: 'budget', transient: false, detail: 'time budget reached; 200 of 450 jobs' });
  });
  it('rejects a non-Oracle host', () => {
    expect(resolveSite({ name: 'x', careers_url: 'https://evil.example/hcmUI/CandidateExperience/en/sites/CX_1/jobs' })).toBeNull();
  });
});

describe('PageUp', () => {
  const cfg = { tenant: '123', site: 'cw', lang: 'en-us' };
  const page = (links: string[], more = false) => `<table><tbody id="search-results-content">${links.join('')}</tbody></table>${more ? '<a class="more-link" href="?page=2">More</a>' : ''}`;
  const link = (id: number, title = `Role ${id}`) => `<tr><td><a class="job-link" href="/123/cw/en-us/job/${id}/role-${id}?utm_source=x">${title}</a></td></tr>`;
  it('parses job links and rebuilds clean URLs', () => {
    const r = parsePageupListing(page([link(1), link(2, 'Compliance &amp; Risk Analyst')]), cfg, 'Uni');
    expect(r.valid).toBe(true);
    expect(r.jobs.map((j) => j.title)).toEqual(['Role 1', 'Compliance & Risk Analyst']);
    expect(r.jobs[0]!.url).toBe('https://careers.pageuppeople.com/123/cw/en-us/job/1');
  });
  it('treats a login page as invalid, not as zero jobs', () => {
    expect(parsePageupListing('<html>Please sign in</html>', cfg, 'Uni')).toMatchObject({ valid: false, reason: 'no-table' });
    expect(parsePageupListing(page(['<a class="job-link" href="/999/other/en/job/1">x</a>']), cfg, 'Uni')).toMatchObject({ valid: false, reason: 'no-jobs-parsed' });
  });
  it('stops when a page adds nothing new; throws when the first page is not a listing', async () => {
    const entry: EmployerEntry = { name: 'Uni', careers_url: 'https://careers.pageuppeople.com/123/cw/en-us/listing/' };
    const { jobs, truncation } = await pageUpProvider.fetch(entry, mockCtx(() => page([link(1)])));
    expect(jobs).toHaveLength(1);
    expect(truncation).toBeUndefined();
    await expect(pageUpProvider.fetch(entry, mockCtx(() => '<html>blocked</html>'))).rejects.toThrow(/not zero postings/);
  });
  it('stops after the first page once the deadline has passed', async () => {
    const entry: EmployerEntry = { name: 'Uni', careers_url: 'https://careers.pageuppeople.com/123/cw/en-us/listing/' };
    const ctx = mockCtx(() => page([link(1)], true), { deadline: Date.now() - 1 });
    const { jobs, truncation } = await pageUpProvider.fetch(entry, ctx);
    expect(ctx.calls).toHaveLength(1);
    expect(jobs).toHaveLength(1);
    expect(truncation).toEqual({ reason: 'budget', transient: false, detail: 'time budget reached at page 2' });
  });
});

describe('PageUp on a branded host', () => {
  const cfg = { tenant: '', site: 'cw', lang: 'en', host: 'external-jobs.example.edu.au' };
  const page = (hrefs: string[]) => `<table><tbody id="search-results-content">${hrefs.map((h, i) => `<tr><td><a class="job-link" href="${h}">Role ${i}</a></td></tr>`).join('')}</tbody></table>`;

  it('needs an explicit provider, and only accepts a clean https hostname', () => {
    const url = 'https://external-jobs.example.edu.au/cw/en/listing/';
    expect(resolvePageUp({ name: 'U', careers_url: url })).toBeNull();
    expect(resolvePageUp({ name: 'U', provider: 'pageup', careers_url: url })).toEqual(cfg);
    expect(resolvePageUp({ name: 'U', provider: 'pageup', careers_url: 'https://external-jobs.example.edu.au/en/listing/' })).toEqual({ ...cfg, site: '' });
    for (const bad of ['http://external-jobs.example.edu.au/cw/en/listing/', 'https://127.0.0.1/cw/en/listing/', 'https://localhost/cw/en/listing/', 'https://external-jobs.example.edu.au:8443/cw/en/listing/', 'https://external-jobs.example.edu.au/cw/en/job/12345']) {
      expect(resolvePageUp({ name: 'U', provider: 'pageup', careers_url: bad }), bad).toBeNull();
    }
    expect(createRegistry().resolve({ name: 'U', careers_url: url })).toBeNull();
    expect(createRegistry().resolve({ name: 'U', provider: 'pageup', careers_url: url })).toMatchObject({ provider: { id: 'pageup' } });
  });

  it('reads relative job links and rebuilds canonical URLs on the same host', () => {
    const r = parsePageupListing(page(['/cw/en/job/499165/postdoc-fellow?utm=x', '/cw/en/job/499206/chief-financial-officer', 'https://evil.example/cw/en/job/1/x']), cfg, 'Uni');
    expect(r.valid).toBe(true);
    expect(r.jobs.map((j) => j.url)).toEqual(['https://external-jobs.example.edu.au/cw/en/job/499165', 'https://external-jobs.example.edu.au/cw/en/job/499206']);
    expect(r.jobs[0]!.externalId).toBe('499165');
    const noSite = parsePageupListing(page(['/en/job/55/analyst']), { ...cfg, site: '' }, 'Uni');
    expect(noSite.jobs[0]!.url).toBe('https://external-jobs.example.edu.au/en/job/55');
  });

  it('fetches the branded listing URL', async () => {
    const ctx = mockCtx(() => page(['/cw/en/job/7/compliance-officer']));
    const { jobs } = await pageUpProvider.fetch({ name: 'Uni', provider: 'pageup', careers_url: 'https://external-jobs.example.edu.au/cw/en/listing/' }, ctx);
    expect(ctx.calls[0]!.url).toBe('https://external-jobs.example.edu.au/cw/en/listing/?page=1&page-items=100');
    expect(jobs[0]).toMatchObject({ title: 'Role 0', url: 'https://external-jobs.example.edu.au/cw/en/job/7' });
  });
});

describe('silentLogger', () => {
  it('does nothing', () => {
    expect(() => silentLogger.warn('x')).not.toThrow();
  });
});
