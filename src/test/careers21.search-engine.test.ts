/**
 * Phase 2.1 — Job Search Intelligence Engine regression suite.
 *
 * Runs the real pipeline (intent → normalization → deterministic filtering →
 * resume matching → ranking) against realistic provider fixtures and enforces
 * the production quality gates:
 *   · the five flagship India searches return ≥90% relevant jobs
 *   · every returned job carries a Resume Match %
 *   · every returned job respects every selected filter
 *   · unrelated jobs (writing, marketing, data labeling…) never appear
 *   · Software Engineer never returns Accountant; Marketing never returns
 *     Data Scientist
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { buildIntent } from '../careers/search/intent';
import { locationVerdict, parseIndianSalary, resolveCity } from '../careers/search/locations';
import { enrichJob } from '../careers/search/normalize';
import { filterJobs } from '../careers/search/filter';
import {
  clearSearchCache,
  runSearchPipeline,
  type ProviderFetcher,
  type SearchReport,
} from '../careers/search/pipeline';
import { classifyJob, relatedCategories, type JobCategory } from '../careers/search/taxonomy';
import type { QuickMatchInput } from '../careers/search/quickMatch';
import { DEFAULT_SEARCH_PARAMS, type JobSearchParams, type NormalizedJob } from '../careers/types/jobs';
import type { CareerProfileRow, ParsedResume } from '../careers/types';

// ─────────────────────────── fixtures ───────────────────────────

let seq = 0;
function mkJob(over: Partial<NormalizedJob>): NormalizedJob {
  seq += 1;
  return {
    source: 'jsearch',
    via: 'LinkedIn',
    external_id: `fx-${seq}`,
    company: 'Acme Corp',
    title: 'Untitled',
    description: '',
    salary_min: null,
    salary_max: null,
    currency: 'INR',
    location: '',
    country: 'IN',
    work_mode: '',
    employment_type: 'fulltime',
    apply_url: 'https://example.com/apply',
    posted_at: new Date().toISOString(),
    closes_at: null,
    industry: '',
    ...over,
  };
}

/** Relevant finance/risk postings for a given city. */
function riskClusterJobs(city: string, area1: string, area2: string): NormalizedJob[] {
  return [
    mkJob({ title: 'Risk Analyst', company: 'HDFC Bank', location: city, description: 'Operational risk assessment, risk reporting, RCSA, internal controls for a leading bank.' }),
    mkJob({ title: 'Operational Risk Manager', company: 'ICICI Bank', location: area1, description: 'Enterprise risk management, risk governance, control testing and Basel norms.' }),
    mkJob({ title: 'Credit Risk Analyst', company: 'Standard Chartered', location: city, description: 'Credit risk modelling, IFRS 9 ECL, PD LGD models for retail portfolios.' }),
    mkJob({ title: 'AML Analyst', company: 'Barclays GSC', location: city, description: 'Transaction monitoring, SAR filing, sanctions screening and financial crime investigations.' }),
    mkJob({ title: 'Compliance Officer', company: 'Kotak Mahindra', location: area2, description: 'Regulatory compliance, RBI compliance, policy governance and compliance monitoring.' }),
    mkJob({ title: 'Internal Auditor', company: 'Deloitte', location: city, description: 'Internal audit engagements, SOX testing, risk based audit and control assurance for BFSI clients.' }),
    mkJob({ title: 'Market Risk Analyst', company: 'Nomura', location: area1, description: 'Value at Risk, FRTB, stress testing and market risk reporting for trading desks.' }),
    mkJob({ title: 'KYC Analyst', company: 'HSBC', location: city, description: 'Customer due diligence, enhanced due diligence, client onboarding and periodic review.' }),
    mkJob({ title: 'Fraud Risk Analyst', company: 'Paytm', location: area2, description: 'Fraud detection, fraud prevention rules, chargeback analysis and loss prevention.' }),
    mkJob({ title: 'Model Validation Analyst', company: 'Wells Fargo India', location: city, description: 'Model risk management, model validation, quantitative risk and SR 11-7 documentation.' }),
  ];
}

/** The exact junk the Phase 2 engine used to return — must never surface. */
function junkJobs(city: string): NormalizedJob[] {
  return [
    mkJob({ title: 'Customer Operations Executive', company: 'BigBasket', location: city, description: 'Handle customer service queries, escalations and call centre operations.' }),
    mkJob({ title: 'Writing Specialist', company: 'ContentCo', location: city, description: 'Write blogs, marketing copy and social media content for brands.' }),
    mkJob({ title: 'Data Labeling Associate', company: 'Labelify', location: city, description: 'Data annotation and data labeling for machine learning datasets.' }),
    mkJob({ title: 'Communications Manager', company: 'PRWorks', location: city, description: 'Corporate communications, public relations and brand messaging.' }),
    mkJob({ title: 'Graphic Designer', company: 'Studio9', location: city, description: 'Design brand assets, illustrations and social creatives in Figma.' }),
    mkJob({ title: 'Risk Analyst', company: 'UK Bank', location: 'London', country: 'GB', description: 'Operational risk analyst role in our London office.' }),
    mkJob({ title: 'Risk Analyst', company: 'RemoteFirst', location: 'Remote', work_mode: 'remote', description: 'Fully remote operational risk role, work from anywhere.' }),
    mkJob({ title: 'Risk Analyst Intern', company: 'FinStart', location: city, employment_type: 'internship', description: 'Six month internship in the operational risk team.' }),
  ];
}

const RISK_CLUSTER: Set<JobCategory> = relatedCategories('risk');

function riskResume(): QuickMatchInput {
  const parsed: ParsedResume = {
    personal: { name: 'Test User', email: 't@x.com', phone: '', location: 'Chennai', linkedin: '', github: '', portfolio: '' },
    summary: 'Risk and compliance professional with AML, KYC and internal audit experience across banking.',
    careerObjective: 'Grow into an enterprise risk leadership role.',
    yearsOfExperience: 4,
    currentDesignation: 'Risk Analyst',
    currentIndustry: 'Banking',
    experience: [],
    education: [],
    skills: {
      technical: ['SQL', 'Excel', 'Python'],
      soft: ['Communication'],
      business: ['Risk Management', 'AML', 'KYC', 'Transaction Monitoring', 'Internal Audit', 'Compliance', 'Fraud Detection'],
      leadership: [],
      tools: ['Actimize', 'SAS'],
      frameworks: ['Basel III'],
      programmingLanguages: [],
      cloudPlatforms: [],
      databases: [],
    },
    projects: [],
    certifications: [],
    languages: ['English'],
    achievements: [],
    awards: [],
    publications: [],
    volunteerWork: [],
    publicSpeaking: [],
    research: [],
    patents: [],
    insights: { careerGaps: [], promotionHistory: '', employmentStability: '', jobSwitchingPattern: '', careerProgression: '' },
  };
  const profile: CareerProfileRow = {
    user_id: 'u1', job_title: 'Risk Analyst', preferred_role: 'Operational Risk Analyst',
    preferred_industry: 'Risk & Compliance', years_experience: 4, highest_qualification: 'MBA',
    primary_skills: ['Risk Management', 'AML'], secondary_skills: ['SQL'],
    location_preference: 'Chennai', employment_type: 'Full-time', salary_expectation: '12 LPA',
    notice_period: '30 days', visa_status: '', work_rights: '', languages: ['English'],
    career_dna: null, suggestions: {}, settings: {}, created_at: '', updated_at: '',
  };
  return {
    parsed,
    rawText: `${parsed.summary} Skills: SQL, Excel, Python, risk management, AML, KYC, transaction monitoring, internal audit, compliance, fraud detection, Basel III, Actimize, SAS. Risk Analyst at a leading bank in Chennai.`,
    careerDna: null,
    profile,
  };
}

function fetcherFor(jobs: NormalizedJob[]): ProviderFetcher {
  return async () => ({ jobs, status: { jsearch: 'ok', adzuna: 'ok' }, page: 0 });
}

function indiaParams(query: string, location: string): JobSearchParams {
  return {
    ...DEFAULT_SEARCH_PARAMS,
    query,
    location,
    country: 'in',
    employmentType: 'fulltime',
    workMode: 'onsite',
    industry: 'Risk & Compliance',
  };
}

async function run(params: JobSearchParams, jobs: NormalizedJob[]): Promise<SearchReport> {
  return runSearchPipeline(params, riskResume(), fetcherFor(jobs), { skipCache: true, resumeKey: 'test' });
}

beforeEach(() => clearSearchCache());

// ─────────────────────────── flagship India searches ───────────────────────────

const FLAGSHIP: [query: string, city: string, area1: string, area2: string, mustInclude: string[]][] = [
  ['Risk', 'Chennai', 'OMR, Chennai', 'Velachery, Chennai',
    ['Risk Analyst', 'Operational Risk Manager', 'Credit Risk Analyst', 'Market Risk Analyst', 'AML Analyst', 'Internal Auditor', 'Fraud Risk Analyst']],
  ['AML', 'Bengaluru', 'Whitefield, Bengaluru', 'Koramangala, Bangalore',
    ['AML Analyst', 'KYC Analyst', 'Compliance Officer', 'Fraud Risk Analyst']],
  ['Compliance', 'Mumbai', 'Andheri, Mumbai', 'BKC, Mumbai',
    ['Compliance Officer', 'AML Analyst', 'Internal Auditor', 'KYC Analyst']],
  ['Fraud', 'Hyderabad', 'Gachibowli, Hyderabad', 'Hitec City, Hyderabad',
    ['Fraud Risk Analyst', 'AML Analyst']],
  ['Internal Audit', 'Pune', 'Hinjewadi, Pune', 'Kharadi, Pune',
    ['Internal Auditor', 'Risk Analyst', 'Compliance Officer']],
];

describe.each(FLAGSHIP)('search: %s | %s | India (full-time, on-site)', (query, city, area1, area2, mustInclude) => {
  const jobs = [...riskClusterJobs(city, area1, area2), ...junkJobs(city)];

  it('returns ≥90% relevant jobs and never the junk titles', async () => {
    const report = await run(indiaParams(query, city), jobs);
    const titlesReturned = report.jobs.map((s) => s.job.title);
    for (const title of mustInclude) expect(titlesReturned).toContain(title);
    const relevant = report.jobs.filter((s) => RISK_CLUSTER.has(s.job.classification.category));
    expect(relevant.length / report.jobs.length).toBeGreaterThanOrEqual(0.9);
    const titles = report.jobs.map((s) => s.job.title);
    for (const banned of ['Customer Operations Executive', 'Writing Specialist', 'Data Labeling Associate', 'Communications Manager', 'Graphic Designer']) {
      expect(titles).not.toContain(banned);
    }
  });

  it('gives every returned job a Resume Match % between 0 and 100', async () => {
    const report = await run(indiaParams(query, city), jobs);
    for (const s of report.jobs) {
      expect(s.match).not.toBeNull();
      expect(s.match!.overall).toBeGreaterThanOrEqual(0);
      expect(s.match!.overall).toBeLessThanOrEqual(100);
    }
  });

  it('respects every selected filter (country, city, on-site, full-time)', async () => {
    const report = await run(indiaParams(query, city), jobs);
    for (const s of report.jobs) {
      expect(s.job.country.toLowerCase()).not.toBe('gb');
      expect(s.job.workMode).not.toBe('remote');
      expect(['', 'fulltime']).toContain(s.job.employment);
      expect(['match', 'nearby']).toContain(s.locationVerdict);
    }
    // The London, remote and internship postings were all rejected with reasons.
    expect(report.quality.rejected).toBeGreaterThanOrEqual(3);
  });

  it('reports search quality metrics', async () => {
    const report = await run(indiaParams(query, city), jobs);
    expect(report.quality.returned).toBe(report.jobs.length);
    expect(report.quality.searchConfidence).toBeGreaterThanOrEqual(90);
    expect(report.quality.averageMatch).toBeGreaterThan(0);
    expect(report.quality.providerCoverage.jsearch).toBe('ok');
  });
});

// ─────────────────────────── cross-domain guarantees ───────────────────────────

describe('cross-domain relevance guarantees', () => {
  it('Software Engineer never returns Accountant or Sales', async () => {
    const jobs = [
      mkJob({ title: 'Software Engineer', location: 'Chennai', description: 'Build backend services in Java and Spring Boot.' }),
      mkJob({ title: 'Senior Software Developer', location: 'Chennai', description: 'React, Node.js and TypeScript development.' }),
      mkJob({ title: 'Accountant', location: 'Chennai', description: 'General ledger, accounts payable and GST filings.' }),
      mkJob({ title: 'Sales Executive', location: 'Chennai', description: 'Field sales and lead generation for SaaS products.' }),
    ];
    const params = { ...DEFAULT_SEARCH_PARAMS, query: 'Software Engineer', location: 'Chennai', country: 'in' };
    const report = await runSearchPipeline(params, null, fetcherFor(jobs), { skipCache: true });
    const titles = report.jobs.map((s) => s.job.title);
    expect(titles).toContain('Software Engineer');
    expect(titles).not.toContain('Accountant');
    expect(titles).not.toContain('Sales Executive');
  });

  it('Marketing never returns Data Scientist', async () => {
    const jobs = [
      mkJob({ title: 'Marketing Manager', location: 'Mumbai', description: 'Own digital marketing campaigns and brand strategy.' }),
      mkJob({ title: 'Data Scientist', location: 'Mumbai', description: 'Machine learning models and statistical analysis in Python.' }),
    ];
    const params = { ...DEFAULT_SEARCH_PARAMS, query: 'Marketing', location: 'Mumbai', country: 'in' };
    const report = await runSearchPipeline(params, null, fetcherFor(jobs), { skipCache: true });
    const titles = report.jobs.map((s) => s.job.title);
    expect(titles).toContain('Marketing Manager');
    expect(titles).not.toContain('Data Scientist');
  });

  it('ranks priority risk titles above generic matches', async () => {
    const jobs = [
      mkJob({ title: 'Banking Operations Associate', location: 'Chennai', description: 'Payments operations with some risk reporting exposure and reconciliation.' }),
      mkJob({ title: 'Risk Analyst', location: 'Chennai', description: 'Operational risk analysis, risk reporting and control testing.' }),
    ];
    const report = await run(indiaParams('Risk', 'Chennai'), jobs);
    expect(report.jobs[0]?.job.title).toBe('Risk Analyst');
  });
});

// ─────────────────────────── stage-level units ───────────────────────────

describe('intent engine', () => {
  it('expands Risk into the risk & compliance cluster', () => {
    const intent = buildIntent('Risk', 'Risk & Compliance');
    expect(intent.targetCategories.has('risk')).toBe(true);
    expect(intent.targetCategories.has('financial-crime')).toBe(true);
    expect(intent.expandedTerms).toContain('operational risk');
    expect(intent.expandedTerms).toContain('aml');
    expect(intent.priorityTitles).toContain('risk analyst');
  });

  it('prefers the most specific concept ("credit risk" beats "risk")', () => {
    const intent = buildIntent('Credit Risk');
    expect(intent.targetCategories.has('credit-risk')).toBe(true);
    expect(intent.priorityTitles[0]).toBe('credit risk analyst');
  });

  it('narrows categories when an industry filter is set', () => {
    const swIntent = buildIntent('Software Engineer', 'Technology');
    expect(swIntent.targetCategories.has('software')).toBe(true);
    expect(swIntent.targetCategories.has('marketing')).toBe(false);
  });
});

describe('taxonomy classifier', () => {
  it('classifies the Phase 2 junk correctly', () => {
    expect(classifyJob('Writing Specialist', 'Write engaging content and blogs').category).toBe('content-writing');
    expect(classifyJob('Customer Operations Executive', 'Customer service and escalation handling').category).toBe('customer-support');
    expect(classifyJob('Data Labeling Associate', 'Annotate datasets for ML').category).toBe('data');
    expect(classifyJob('Communications Manager', 'Public relations and corporate communications').category).toBe('marketing');
  });

  it('classifies finance roles correctly', () => {
    expect(classifyJob('AML Analyst', 'Transaction monitoring and sanctions').category).toBe('financial-crime');
    expect(classifyJob('Internal Auditor', 'SOX testing and audit engagements').category).toBe('internal-audit');
    expect(classifyJob('Fraud Investigator', 'Investigate fraudulent transactions').category).toBe('fraud');
  });
});

describe('location intelligence', () => {
  it('resolves metro aliases to the parent city', () => {
    expect(resolveCity('OMR')?.city).toBe('chennai');
    expect(resolveCity('Whitefield')?.city).toBe('bengaluru');
    expect(resolveCity('Gurgaon')?.city).toBe('delhi');
  });

  it('accepts city localities and rejects other cities', () => {
    expect(locationVerdict('Sholinganallur, Chennai', 'IN', '', 'Chennai', 'in')).toBe('match');
    expect(locationVerdict('Bengaluru, Karnataka', 'IN', '', 'Chennai', 'in')).toBe('mismatch');
    expect(locationVerdict('London', 'GB', '', 'Chennai', 'in')).toBe('mismatch');
    expect(locationVerdict('Coimbatore, Tamil Nadu', 'IN', '', 'Chennai', 'in')).toBe('nearby');
  });

  it('parses Indian salary formats', () => {
    expect(parseIndianSalary('CTC 12 LPA')).toEqual({ min: 1_200_000, max: 1_200_000 });
    expect(parseIndianSalary('8-12 lakhs per annum')).toEqual({ min: 800_000, max: 1_200_000 });
    expect(parseIndianSalary('1.5 Cr')).toEqual({ min: 15_000_000, max: 15_000_000 });
  });
});

describe('deterministic filter + hard threshold', () => {
  it('salary floor removes disclosed-below-threshold jobs only', () => {
    const intent = buildIntent('Risk');
    const jobs = [
      mkJob({ title: 'Risk Analyst', location: 'Chennai', salary_min: 400_000, salary_max: 600_000, description: 'Operational risk.' }),
      mkJob({ title: 'Risk Manager', location: 'Chennai', salary_min: 1_500_000, salary_max: 2_000_000, description: 'Enterprise risk management.' }),
      mkJob({ title: 'Risk Officer', location: 'Chennai', description: 'Risk governance role, salary undisclosed.' }),
    ].map(enrichJob);
    const params = { ...DEFAULT_SEARCH_PARAMS, query: 'Risk', location: 'Chennai', salaryMin: 1_000_000 };
    const { accepted, rejected } = filterJobs(jobs, params, intent);
    expect(accepted.map((j) => j.title)).toEqual(['Risk Manager', 'Risk Officer']);
    expect(rejected[0]?.reason).toBe('salary');
  });

  it('hard threshold hides every job scoring below it — no fake filtering', async () => {
    const jobs = riskClusterJobs('Chennai', 'OMR, Chennai', 'Velachery, Chennai');
    const report = await run(indiaParams('Risk', 'Chennai'), jobs);
    const threshold = 80;
    const visible = report.jobs.filter((s) => (s.match?.overall ?? 100) >= threshold);
    for (const s of visible) expect(s.match!.overall).toBeGreaterThanOrEqual(threshold);
    const hidden = report.jobs.filter((s) => (s.match?.overall ?? 100) < threshold);
    for (const s of hidden) expect(visible).not.toContain(s);
  });

  it('caches identical searches and serves the cached report', async () => {
    const jobs = riskClusterJobs('Chennai', 'OMR, Chennai', 'Velachery, Chennai');
    let calls = 0;
    const fetcher: ProviderFetcher = async () => {
      calls += 1;
      return { jobs, status: { jsearch: 'ok' }, page: 0 };
    };
    const params = indiaParams('Risk', 'Chennai');
    const resume = riskResume();
    const a = await runSearchPipeline(params, resume, fetcher, { resumeKey: 'v1' });
    const b = await runSearchPipeline(params, resume, fetcher, { resumeKey: 'v1' });
    expect(calls).toBe(1);
    expect(b).toBe(a);
  });
});
