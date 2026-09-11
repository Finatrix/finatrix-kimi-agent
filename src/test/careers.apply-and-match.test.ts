/**
 * Two trust guarantees the product had been quietly breaking.
 *
 * 1. APPLY GOES WHERE IT SAYS. Every result used to render "Apply ↗" pointing
 *    at whatever `apply_url` the provider gave, including Adzuna's
 *    `redirect_url` (a tracking bounce) and Remotive's listing page. The label
 *    must now state the real destination, and a direct-employer copy must win
 *    de-duplication against an aggregator copy of the same role.
 *
 * 2. MATCH % MEANS SOMETHING. The old scorer gave every unmeasurable dimension
 *    a generous floor, so postings containing no information scored ~44% while
 *    a genuinely adjacent role scored 56% and fell below the 70% threshold.
 *    Junk outranked real jobs. These tests pin the ordering that fixes it.
 */

import { describe, it, expect } from 'vitest';
import { classifyApplyUrl, isDirectEmployerUrl } from '../careers/search/applyUrl';
import { dedupeJobs } from '../careers/search/dedupe';
import { quickMatchJob, type QuickMatchInput } from '../careers/search/quickMatch';
import { enrichJob } from '../careers/search/normalize';
import { DEFAULT_MATCH_THRESHOLD, type NormalizedJob } from '../careers/types/jobs';
import type { ParsedResume } from '../careers/types';

// ───────────────────────────── apply URLs ─────────────────────────────

describe('classifyApplyUrl', () => {
  it('treats an employer ATS posting as a real application', () => {
    // A real URL from the company registry snapshot.
    const t = classifyApplyUrl(
      'https://asx.wd105.myworkdayjobs.com/ASX_Careers/job/Sydney-Office/Net-Engineer_JR101584'
    );
    expect(t.kind).toBe('direct');
    expect(t.direct).toBe(true);
    expect(t.label).toBe('Apply');
  });

  it.each([
    ['https://boards.greenhouse.io/acme/jobs/4123', 'greenhouse'],
    ['https://jobs.lever.co/acme/2f8c', 'lever'],
    ['https://jobs.ashbyhq.com/acme/abc-123', 'ashby'],
    ['https://acme.smartrecruiters.com/Acme/744000', 'smartrecruiters'],
    ['https://apply.workable.com/acme/j/ABC/', 'workable'],
  ])('recognises %s as a direct ATS', (url) => {
    expect(isDirectEmployerUrl(url)).toBe(true);
  });

  it('never labels an aggregator redirect "Apply"', () => {
    const t = classifyApplyUrl('https://www.adzuna.in/land/ad/5142?v=ABC&r=xyz', 'Adzuna');
    expect(t.kind).toBe('aggregator');
    expect(t.direct).toBe(false);
    expect(t.label).toBe('View on Adzuna');
    expect(t.label).not.toContain('Apply');
  });

  it.each([
    ['https://remotive.com/remote-jobs/finance/analyst-123', 'Remotive'],
    ['https://jooble.org/jdp/-8812734', 'Jooble'],
    ['https://www.linkedin.com/jobs/view/4012', 'Linkedin'],
    ['https://in.indeed.com/viewjob?jk=abc', 'Indeed'],
  ])('flags %s as an aggregator', (url, expected) => {
    const t = classifyApplyUrl(url);
    expect(t.direct).toBe(false);
    expect(t.label).toBe(`View on ${expected}`);
  });

  it('names the destination, not the provider’s claimed origin board', () => {
    // Observed live: Jooble reports via="Decentrajobs.com" on a link that
    // actually goes to jooble.org. Naming the origin is just a different lie.
    const t = classifyApplyUrl('https://jooble.org/jdp/-8812734', 'Decentrajobs.com');
    expect(t.label).toBe('View on Jooble');
  });

  it('treats an unknown host as the company site without promising a form', () => {
    const t = classifyApplyUrl('https://careers.acmebank.co.in/roles/risk-analyst');
    expect(t.direct).toBe(true);
    expect(t.label).toBe('Apply on company site');
  });

  it('degrades safely on a missing or malformed URL', () => {
    for (const bad of ['', 'not a url', 'javascript:alert(1)']) {
      const t = classifyApplyUrl(bad);
      expect(t.direct).toBe(false);
      expect(t.label).toBe('View posting');
    }
  });
});

// ───────────────────────────── dedupe preference ─────────────────────────────

function dedupeRow(over: Partial<Parameters<typeof dedupeJobs>[0][number]> = {}) {
  return {
    source: 'x', external_id: '', company: 'Acme Bank', title: 'Risk Analyst',
    location: 'Mumbai', description: 'Risk analyst role covering credit risk.',
    apply_url: '', ...over,
  };
}

describe('de-duplication prefers the employer’s own posting', () => {
  it('keeps the ATS copy and drops the aggregator copy', () => {
    const { unique, removed } = dedupeJobs([
      dedupeRow({ source: 'adzuna', apply_url: 'https://www.adzuna.in/land/ad/9' }),
      dedupeRow({ source: 'registry', apply_url: 'https://boards.greenhouse.io/acme/jobs/9' }),
    ]);

    expect(removed).toBe(1);
    expect(unique).toHaveLength(1);
    // The survivor is the one a user can actually apply through.
    expect(isDirectEmployerUrl(unique[0].apply_url)).toBe(true);
    expect(unique[0].source).toBe('registry');
  });

  it('holds regardless of provider fan-out order', () => {
    const direct = dedupeRow({ source: 'registry', apply_url: 'https://jobs.lever.co/acme/1' });
    const agg = dedupeRow({ source: 'jooble', apply_url: 'https://jooble.org/jdp/-1' });

    for (const order of [[direct, agg], [agg, direct]]) {
      const { unique } = dedupeJobs(order);
      expect(unique).toHaveLength(1);
      expect(unique[0].source).toBe('registry');
    }
  });

  it('leaves a list with no direct postings in its original order', () => {
    const rows = [
      dedupeRow({ source: 'adzuna', title: 'Risk Analyst', apply_url: 'https://www.adzuna.in/land/ad/1' }),
      dedupeRow({ source: 'jooble', title: 'Credit Officer', apply_url: 'https://jooble.org/jdp/-2' }),
    ];
    const { unique } = dedupeJobs(rows);
    expect(unique.map((r) => r.source)).toEqual(['adzuna', 'jooble']);
  });
});

// ───────────────────────────── match calibration ─────────────────────────────

const resume = {
  currentDesignation: 'Investment Product Analyst',
  currentIndustry: 'Finance',
  yearsOfExperience: 3,
  summary: 'Finance professional in investment analysis and portfolio management.',
  skills: {
    technical: ['Excel', 'Python', 'Financial Modelling'],
    business: ['Portfolio Management'], tools: ['Power BI', 'Bloomberg Terminal'],
    frameworks: [], programmingLanguages: ['Python', 'SQL'],
    cloudPlatforms: [], databases: ['SQL'], soft: [],
  },
  education: [], experience: [], certifications: [],
  projects: [], achievements: [], languages: [],
} as unknown as ParsedResume;

const input: QuickMatchInput = {
  parsed: resume,
  rawText:
    'Investment Product Analyst. Portfolio management, financial modelling, Excel, Python, SQL, Power BI, Bloomberg Terminal, equity research, valuation.',
  careerDna: null,
  profile: null,
};

function job(title: string, description: string): NormalizedJob {
  return {
    source: 't', via: 'Test', external_id: title, company: 'Co', title, description,
    salary_min: null, salary_max: null, currency: '', location: 'Mumbai', country: 'IN',
    work_mode: '', employment_type: '', apply_url: 'https://x.test/j',
    posted_at: null, closes_at: null, industry: '',
  } as unknown as NormalizedJob;
}

const score = (t: string, d: string) => quickMatchJob(enrichJob(job(t, d)), input);

const PERFECT = () => score('Investment Product Analyst',
  'Investment product analyst. Portfolio management, financial modelling in Excel and Python. SQL, Power BI, Bloomberg Terminal. Equity research and valuation.');
const WRONG_FIELD = () => score('Registered Nurse — ICU',
  'Provide intensive care nursing to critically ill patients. Administer medication, monitor vitals. Nursing registration required.');
const TRADES = () => score('Heavy Vehicle Diesel Mechanic',
  'Service and repair heavy haulage trucks. Diagnose engine faults, hydraulics, air brakes. Trade certificate required.');
const EMPTY = () => score('Opportunity',
  'We are hiring. Apply now. Great culture. Competitive package.');

describe('Resume Match calibration', () => {
  it('scores a same-role posting near the top', () => {
    expect(PERFECT().overall).toBeGreaterThanOrEqual(90);
  });

  it('scores a posting containing no usable information at zero, not in the forties', () => {
    // The regression that started this: "We are hiring. Apply now." scored 44%
    // because every unmeasurable dimension had a generous default.
    const m = EMPTY();
    expect(m.overall).toBe(0);
    expect(m.confidence).toBeLessThan(50);
  });

  it('never ranks an unrelated trade above a real match', () => {
    expect(TRADES().overall).toBeLessThan(PERFECT().overall);
    // The specific inversion that shipped: a diesel mechanic scored 44 while
    // an accounts-payable role — far closer to finance — scored 34.
    expect(TRADES().overall).toBeLessThan(DEFAULT_MATCH_THRESHOLD);
  });

  it('keeps wrong-field postings below the visibility threshold', () => {
    for (const m of [WRONG_FIELD(), TRADES(), EMPTY()]) {
      expect(m.overall).toBeLessThan(DEFAULT_MATCH_THRESHOLD);
    }
  });

  it('reports low confidence when there was little to measure', () => {
    expect(EMPTY().confidence).toBeLessThan(PERFECT().confidence);
  });

  it('does not let an unknown seniority hand out free points', () => {
    // Previously every job scored 95 on experience via a [0,40] catch-all band,
    // worth 12 of the 100 weight on literally every posting.
    const m = EMPTY();
    expect(m.scores.experience).toBe(0);
  });

  it('does not reward a posting for being unclassifiable', () => {
    // Category scored 50 when the job could not be classified, which put junk
    // ABOVE a posting correctly identified as a different field (25).
    expect(EMPTY().scores.category).toBe(0);
    expect(WRONG_FIELD().scores.category).toBeGreaterThan(0);
    expect(EMPTY().overall).toBeLessThan(WRONG_FIELD().overall);
  });

  it('keeps every score within range', () => {
    for (const m of [PERFECT(), WRONG_FIELD(), TRADES(), EMPTY()]) {
      expect(m.overall).toBeGreaterThanOrEqual(0);
      expect(m.overall).toBeLessThanOrEqual(100);
      expect(m.confidence).toBeGreaterThanOrEqual(0);
      expect(m.confidence).toBeLessThanOrEqual(100);
    }
  });
});
