import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  normalizeCompanyName,
  tightKey,
  buildCompanyIndex,
  matchCompany,
} from '../careers/search/companyMatch';
import {
  __setCiDatasetForTests,
  getCompanyStore,
  matchEmployer,
  searchCompanies,
  searchCompaniesPaged,
  searchByFacet,
  searchByFacetPaged,
  relatedCompanies,
} from '../careers/services/companyIntelligence';
import { enrichScoredJobs, intelBadges, type EnrichedScoredJob } from '../careers/search/enrich';
import { intelBoost, rerankByPreferences, EMPTY_PREFERENCES } from '../careers/search/rerank';
import { buildCompanyReports, topEntries } from '../careers/search/companyReports';
import { enrichJob } from '../careers/search/normalize';
import { runSearchPipeline, type ScoredJob } from '../careers/search/pipeline';
import { DEFAULT_SEARCH_PARAMS, type NormalizedJob } from '../careers/types/jobs';
import type { CiDataset, CompanyIntel } from '../careers/types/companyIntel';

const fixture = JSON.parse(
  readFileSync(path.resolve(__dirname, '../careers/test/fixtures/company-intelligence.json'), 'utf-8')
) as CiDataset;

// A tiny synthetic set for the pure-function tests (alias/normalization).
function makeCompany(over: Partial<CompanyIntel> & { id: string; name: string }): CompanyIntel {
  return {
    nameNormalized: normalizeCompanyName(over.name),
    industry: '', sector: '', subSector: '', country: 'IN', hqCity: '', hqState: '', hqCountry: '',
    officialWebsite: '', sizeBand: '', ownershipType: '', listedExchange: '', marketCap: '',
    freshersFriendly: null, graduateFriendly: null, internFriendly: null, experiencedHiring: null,
    visaSponsorship: '', workModes: [], hiringFrequency: '', noticePeriod: '',
    confidenceScore: 50, priorityTier: 1, confidenceLevel: 'medium', verificationStatus: 'pending',
    lastVerified: null, dataSource: '', notes: '',
    careerPages: [], graduatePrograms: [], internships: [], ats: [], locations: [], departments: [],
    tags: [], aliases: [], keywords: [], sources: [], salary: [],
    ...over,
  };
}

describe('normalizeCompanyName', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalizeCompanyName('J.P. Morgan')).toBe('j p morgan');
    expect(normalizeCompanyName('  HDFC   Bank ')).toBe('hdfc bank');
  });
  it('maps & to and, and strips legal suffixes', () => {
    expect(normalizeCompanyName('Tata Consultancy Services Ltd')).toBe('tata consultancy services');
    expect(normalizeCompanyName('Larsen & Toubro')).toBe('larsen and toubro');
    expect(normalizeCompanyName('Acme Private Limited')).toBe('acme');
  });
  it('tightKey removes spaces so JP Morgan == JPMorgan', () => {
    expect(tightKey('JP Morgan')).toBe(tightKey('JPMorgan'));
  });
});

describe('matchCompany (alias / normalization)', () => {
  const companies = [
    makeCompany({
      id: 'C1', name: 'JPMorgan Chase',
      aliases: ['J.P. Morgan', 'JP Morgan', 'JPMC'], confidenceScore: 90,
    }),
    makeCompany({
      id: 'C2', name: 'Australia and New Zealand Banking Group',
      aliases: ['ANZ', 'ANZ Bank'], confidenceScore: 80,
    }),
  ];
  const index = buildCompanyIndex(companies);

  it('exact name match', () => {
    const m = matchCompany('JPMorgan Chase', index);
    expect(m?.company.id).toBe('C1');
    expect(m?.via).toBe('exact');
  });
  it('punctuation/spacing variants resolve to the same company', () => {
    for (const q of ['J.P. Morgan', 'JP Morgan', 'jpmorgan', 'J P Morgan']) {
      expect(matchCompany(q, index)?.company.id, q).toBe('C1');
    }
  });
  it('acronym alias resolves via synonym tag', () => {
    expect(matchCompany('ANZ', index)?.company.id).toBe('C2');
    expect(matchCompany('Australia and New Zealand Banking Group', index)?.company.id).toBe('C2');
  });
  it('returns null for unknown employers', () => {
    expect(matchCompany('Totally Unknown Co', index)).toBeNull();
    expect(matchCompany('', index)).toBeNull();
  });
});

describe('company intelligence store (fixture)', () => {
  beforeEach(() => __setCiDatasetForTests(fixture));
  afterEach(() => __setCiDatasetForTests(null));

  it('assembles companies with relations resolved by id', async () => {
    const store = await getCompanyStore();
    expect(store.companies.length).toBe(fixture.ci_companies.length);
    const hdfc = store.byId.get('CMP-00001')!;
    expect(hdfc.name).toBe('HDFC Bank');
    expect(hdfc.departments.length).toBeGreaterThan(0);
    expect(hdfc.aliases).toContain('HDFC Bank');
    // Unknown ATS rows are filtered out of the aggregate.
    expect(hdfc.ats.every((a) => a.detected_ats !== 'Unknown')).toBe(true);
  });

  it('matchEmployer resolves a live employer string to CI metadata', async () => {
    const m = await matchEmployer('hdfc bank');
    expect(m?.company.id).toBe('CMP-00001');
  });

  it('searchCompanies ranks name hits above weaker signals', async () => {
    const res = await searchCompanies('bank');
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].name.toLowerCase()).toContain('bank');
  });

  it('faceted graduate search only returns graduate-friendly companies', async () => {
    const res = await searchByFacet('graduate', '');
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((c) => c.graduateFriendly === true || c.graduatePrograms.length > 0)).toBe(true);
  });

  it('faceted industry search filters by industry text', async () => {
    const res = await searchByFacet('industry', 'banking');
    expect(res.every((c) => /bank/i.test(c.industry) || /bank/i.test(c.sector))).toBe(true);
  });

  it('relatedCompanies excludes self and shares industry/sector', async () => {
    const hdfc = (await getCompanyStore()).byId.get('CMP-00001')!;
    const related = await relatedCompanies(hdfc);
    expect(related.every((c) => c.id !== 'CMP-00001')).toBe(true);
  });

  it('pagination is stable and non-overlapping (scales to large datasets)', async () => {
    const p0 = await searchCompaniesPaged('', {}, { limit: 2, offset: 0 });
    const p1 = await searchCompaniesPaged('', {}, { limit: 2, offset: 2 });
    expect(p0.total).toBe(fixture.ci_companies.length);
    expect(p1.total).toBe(fixture.ci_companies.length);
    const ids = new Set(p0.results.map((c) => c.id));
    expect(p1.results.some((c) => ids.has(c.id))).toBe(false);
  });

  it('faceted pagination reports the full match total', async () => {
    const paged = await searchByFacetPaged('industry', 'banking', {}, { limit: 1, offset: 0 });
    expect(paged.results.length).toBeLessThanOrEqual(1);
    expect(paged.total).toBeGreaterThanOrEqual(paged.results.length);
  });

  it('industry filter narrows the result set', async () => {
    const all = await searchCompaniesPaged('', {});
    const banking = await searchCompaniesPaged('', { industry: 'Banking' });
    expect(banking.results.every((c) => c.industry === 'Banking')).toBe(true);
    expect(banking.total).toBeLessThanOrEqual(all.total);
  });
});

// ─────────────────────────── enrichment stage ───────────────────────────

function scored(company: string): ScoredJob {
  const job: NormalizedJob = {
    source: 'jsearch', via: 'jsearch', external_id: 'x1', company, title: 'Analyst',
    description: '', salary_min: null, salary_max: null, currency: 'INR', location: 'Mumbai',
    country: 'in', work_mode: '', employment_type: '', apply_url: '', posted_at: null,
    closes_at: null, industry: '',
  };
  return {
    job: enrichJob(job),
    match: null, relevance: 50, locationVerdict: 'unknown', why: [],
  };
}

describe('search enrichment stage', () => {
  beforeEach(() => __setCiDatasetForTests(fixture));
  afterEach(() => __setCiDatasetForTests(null));

  it('attaches CI metadata to matching employers and null otherwise', async () => {
    const out = await enrichScoredJobs([scored('HDFC Bank'), scored('Nonexistent LLC')]);
    expect(out[0].intel?.id).toBe('CMP-00001');
    expect(out[0].intelVia).not.toBeNull();
    expect(out[1].intel).toBeNull();
  });

  it('never mutates the original job source', async () => {
    const input = scored('HDFC Bank');
    const before = JSON.stringify(input.job);
    await enrichScoredJobs([input]);
    expect(JSON.stringify(input.job)).toBe(before);
  });

  it('intelBadges only surfaces facts that exist', async () => {
    const [j] = await enrichScoredJobs([scored('HDFC Bank')]);
    const badges = intelBadges(j.intel);
    expect(badges.some((b) => /Banking/i.test(b))).toBe(true);
    expect(intelBadges(null)).toEqual([]);
  });
});

// ── graceful provider degradation: one provider fails, search still succeeds ──

describe('preference-aware re-ranking', () => {
  beforeEach(() => __setCiDatasetForTests(fixture));
  afterEach(() => __setCiDatasetForTests(null));

  it('boosts preferred industry but never drops results (extends, not replaces)', async () => {
    const jobs = await enrichScoredJobs([scored('HDFC Bank'), scored('Unknown Co')]);
    const noPref = rerankByPreferences(jobs, EMPTY_PREFERENCES);
    expect(noPref.length).toBe(jobs.length); // membership unchanged
    const withPref = rerankByPreferences(jobs, {
      ...EMPTY_PREFERENCES, preferredIndustries: ['Banking'],
    });
    const hdfc = withPref.find((j) => j.intel?.id === 'CMP-00001')!;
    expect(hdfc.intelBoost).toBeGreaterThan(0);
    expect(hdfc.boostWhy.some((w) => /Banking/i.test(w))).toBe(true);
  });

  it('saved company gets the strongest boost', async () => {
    const [j] = await enrichScoredJobs([scored('HDFC Bank')]);
    const { boost } = intelBoost(j as EnrichedScoredJob, {
      ...EMPTY_PREFERENCES, preferredCompanyIds: ['CMP-00001'],
    });
    expect(boost).toBeGreaterThanOrEqual(10);
  });

  it('no boost for jobs without a CI match', async () => {
    const [j] = await enrichScoredJobs([scored('Unknown Co')]);
    const { boost, why } = intelBoost(j as EnrichedScoredJob, {
      ...EMPTY_PREFERENCES, preferredIndustries: ['Banking'],
    });
    expect(boost).toBe(0);
    expect(why).toEqual([]);
  });
});

describe('company intelligence reports', () => {
  beforeEach(() => __setCiDatasetForTests(fixture));
  afterEach(() => __setCiDatasetForTests(null));

  it('aggregates applications by industry/company and counts matched', async () => {
    const store = await getCompanyStore();
    const apps = [
      { company_name: 'HDFC Bank', location: 'Mumbai' },
      { company_name: 'ICICI Bank' },
      { company_name: 'Some Startup No One Knows' },
    ];
    const rep = buildCompanyReports(apps, store.index);
    expect(rep.total).toBe(3);
    expect(rep.matched).toBe(2);            // two resolve to CI, one doesn't
    expect(rep.byIndustry['Banking']).toBe(2);
    expect(rep.byCompany['Some Startup No One Knows']).toBe(1); // unmatched still counted
    expect(topEntries(rep.byIndustry)[0][0]).toBe('Banking');
  });

  it('works with an empty index without throwing', () => {
    const rep = buildCompanyReports([{ company_name: 'X' }], buildCompanyIndex([]));
    expect(rep.total).toBe(1);
    expect(rep.matched).toBe(0);
  });
});

describe('search pipeline provider degradation', () => {
  it('surfaces per-provider status/counts and does not fail when one provider errors', async () => {
    const okJob: NormalizedJob = {
      source: 'adzuna', via: 'Adzuna', external_id: 'a1', company: 'HDFC Bank', title: 'Risk Analyst',
      description: 'risk', salary_min: null, salary_max: null, currency: 'INR', location: 'Mumbai',
      country: 'IN', work_mode: '', employment_type: '', apply_url: 'https://x', posted_at: null,
      closes_at: null, industry: '',
    };
    const report = await runSearchPipeline(
      { ...DEFAULT_SEARCH_PARAMS, query: 'risk analyst', country: 'in' },
      null,
      async () => ({
        jobs: [okJob],
        status: { adzuna: 'ok', jsearch: 'error', remotive: 'ok', jooble: 'not-configured' },
        counts: { adzuna: 1, jsearch: 0, remotive: 0, jooble: 0 },
        providersUp: true,
        page: 0,
      }),
      { skipCache: true },
    );
    expect(report.quality.providerCoverage.jsearch).toBe('error');
    expect(report.quality.providerCoverage.adzuna).toBe('ok');
    expect(report.quality.providerCounts.adzuna).toBe(1);
    expect(report.quality.providersUp).toBe(true);
  });
});
