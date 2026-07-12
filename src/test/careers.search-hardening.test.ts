import { describe, it, expect } from 'vitest';
import {
  canonicalUrl,
  normalizeTitle,
  jaccard,
  dedupeJobs,
  type DedupeInput,
} from '../careers/search/dedupe';
import { weightedScore, salaryFit, RANK_WEIGHTS } from '../careers/search/ranking';
import { runSearchPipeline } from '../careers/search/pipeline';
import { DEFAULT_SEARCH_PARAMS, type NormalizedJob } from '../careers/types/jobs';

function job(over: Partial<DedupeInput> = {}): DedupeInput {
  return {
    source: 'adzuna', external_id: '', company: 'HDFC Bank', title: 'Risk Analyst',
    location: 'Mumbai', description: 'Risk role with SQL and Basel III', apply_url: '', ...over,
  };
}

describe('dedupe helpers', () => {
  it('canonicalUrl strips query, hash and trailing slash', () => {
    expect(canonicalUrl('https://Jobs.Example.com/apply/123/?utm=x#a'))
      .toBe('jobs.example.com/apply/123');
    expect(canonicalUrl('https://x.com/a/')).toBe(canonicalUrl('https://x.com/a'));
  });
  it('normalizeTitle drops parentheticals and work-mode noise', () => {
    expect(normalizeTitle('Risk Analyst (Remote)')).toBe('risk analyst');
    expect(normalizeTitle('Risk  Analyst - Hybrid')).toBe('risk analyst');
  });
  it('jaccard is 1 for identical sets, 0 for disjoint', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
    expect(jaccard(new Set(['a']), new Set(['b']))).toBe(0);
  });
});

describe('dedupeJobs multi-signal', () => {
  it('collapses by canonical apply URL across providers', () => {
    const { unique, removed } = dedupeJobs([
      job({ source: 'adzuna', apply_url: 'https://co.com/j/1?ref=a' }),
      job({ source: 'jsearch', apply_url: 'https://co.com/j/1?ref=b', title: 'Risk Analyst II' }),
    ]);
    expect(unique.length).toBe(1);
    expect(removed).toBe(1);
  });
  it('collapses by external id within a provider', () => {
    const { unique } = dedupeJobs([
      job({ external_id: 'X1', location: 'Mumbai' }),
      job({ external_id: 'X1', location: 'Bengaluru' }),
    ]);
    expect(unique.length).toBe(1);
  });
  it('collapses alias-normalized company + title (Ltd suffix)', () => {
    const { unique } = dedupeJobs([
      job({ company: 'HDFC Bank' }),
      job({ company: 'HDFC Bank Ltd' }),
    ]);
    expect(unique.length).toBe(1);
  });
  it('collapses near-identical descriptions for same company+title', () => {
    const base = 'Senior risk analyst responsible for Basel III capital modelling using SQL and Python across the group';
    const { unique, removed } = dedupeJobs([
      job({ apply_url: 'https://a.com/1', description: base }),
      job({ apply_url: 'https://b.com/2', description: base + ' and Power BI dashboards' }),
    ]);
    expect(unique.length).toBe(1);
    expect(removed).toBe(1);
  });
  it('keeps genuinely different roles', () => {
    const { unique } = dedupeJobs([
      job({ apply_url: 'https://a.com/1', title: 'Risk Analyst', description: 'risk aaa bbb ccc' }),
      job({ apply_url: 'https://a.com/2', title: 'Data Engineer', description: 'spark kafka etl ddd eee' }),
    ]);
    expect(unique.length).toBe(2);
  });
});

describe('weighted ranking', () => {
  it('blends relevance and resume match under documented weights', () => {
    const withResume = weightedScore({ relevance: 80, resumeMatch: 60, remotePreferred: false, graduateSuitable: false, salaryFit: 0, companyIntel: null });
    const expected = Math.round(80 * RANK_WEIGHTS.relevanceWithResume + 60 * RANK_WEIGHTS.resumeMatch);
    expect(withResume.score).toBe(expected);
  });
  it('uses the no-resume weight when there is no match', () => {
    const noResume = weightedScore({ relevance: 80, resumeMatch: null, remotePreferred: false, graduateSuitable: false, salaryFit: 0, companyIntel: null });
    expect(noResume.score).toBe(Math.round(80 * RANK_WEIGHTS.relevanceNoResume));
  });
  it('adds bounded bonuses for salary/remote/graduate/CI', () => {
    const base = weightedScore({ relevance: 50, resumeMatch: 50, remotePreferred: false, graduateSuitable: false, salaryFit: 0, companyIntel: null }).score;
    const boosted = weightedScore({ relevance: 50, resumeMatch: 50, remotePreferred: true, graduateSuitable: true, salaryFit: 1, companyIntel: 100 }).score;
    expect(boosted).toBeGreaterThan(base);
    expect(boosted).toBeLessThanOrEqual(100);
  });
  it('salaryFit measures band overlap', () => {
    expect(salaryFit(1000000, 2000000, 1500000, 2500000)).toBeGreaterThan(0);
    expect(salaryFit(1000000, 2000000, 3000000, 4000000)).toBe(0); // no overlap
    expect(salaryFit(null, null, 1000000, 2000000)).toBe(0);       // job has no salary
    expect(salaryFit(1000000, 2000000, null, null)).toBe(0);       // no preference
  });
});

describe('pipeline hardening (dedupe + timings + confidence + latency)', () => {
  function normalized(over: Partial<NormalizedJob>): NormalizedJob {
    return {
      source: 'adzuna', via: 'Adzuna', external_id: '', company: 'HDFC Bank', title: 'Risk Analyst',
      description: 'Basel III risk role', salary_min: null, salary_max: null, currency: 'INR',
      location: 'Mumbai', country: 'IN', work_mode: '', employment_type: '', apply_url: 'https://co.com/1',
      posted_at: null, closes_at: null, industry: '', ...over,
    };
  }

  it('removes duplicates, records timings, exposes confidence breakdown + latency', async () => {
    const report = await runSearchPipeline(
      { ...DEFAULT_SEARCH_PARAMS, query: 'risk analyst', country: 'in' },
      null,
      async () => ({
        jobs: [
          normalized({ apply_url: 'https://co.com/1?ref=a' }),
          normalized({ apply_url: 'https://co.com/1?ref=b' }), // duplicate URL
        ],
        status: { adzuna: 'ok', jsearch: 'timeout' },
        counts: { adzuna: 2, jsearch: 0 },
        latency: { adzuna: 210, jsearch: 12000 },
        providersUp: true,
        page: 0,
      }),
      { skipCache: true },
    );
    expect(report.quality.duplicatesRemoved).toBe(1);
    expect(report.quality.timings.totalMs).toBeGreaterThanOrEqual(0);
    expect(report.quality.providerLatency.adzuna).toBe(210);
    expect(report.quality.providerCoverage.jsearch).toBe('timeout');
    // Composite confidence = coverage(50) *.35 + resume(0)*.25 + query(90)*.25 + classification*.15
    expect(report.quality.confidenceBreakdown.providerCoverage).toBe(50);
    expect(report.quality.searchConfidence).toBeGreaterThan(0);
  });
});
