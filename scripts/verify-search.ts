/**
 * Phase 2.1 — manual search verification harness.
 *
 * Runs the REAL search pipeline (intent → providers via the careers-jobs
 * edge function → normalization → deterministic filtering → resume matching
 * → ranking) against LIVE provider data and enforces the release gates:
 *
 *   · ≥90% of returned jobs are relevant to the query's category cluster
 *   · every returned job carries a Resume Match %
 *   · every returned job respects country / city / work-mode / employment
 *   · junk categories (writing, marketing, design, support…) never appear
 *
 * Usage:
 *   npx vite-node scripts/verify-search.ts
 *
 * Auth: set SEARCH_VERIFY_EMAIL / SEARCH_VERIFY_PASSWORD, or the script
 * creates a throwaway verification account (email confirmation must be off).
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { runSearchPipeline, type ProviderFetcher } from '../src/careers/search/pipeline';
import { relatedCategories, type JobCategory } from '../src/careers/search/taxonomy';
import type { QuickMatchInput } from '../src/careers/search/quickMatch';
import { DEFAULT_SEARCH_PARAMS, type JobSearchParams } from '../src/careers/types/jobs';
import type { CareerProfileRow, ParsedResume } from '../src/careers/types';

// ─────────────────────────── env + auth ───────────────────────────

function readEnv(): { url: string; anon: string } {
  const text = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const get = (k: string) => text.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim() ?? '';
  return { url: get('VITE_SUPABASE_URL'), anon: get('VITE_SUPABASE_ANON_KEY') };
}

async function getAccessToken(url: string, anon: string): Promise<string> {
  const supabase = createClient(url, anon);
  const email = process.env.SEARCH_VERIFY_EMAIL ?? 'finatrix.hub+search-verify@gmail.com';
  const password = process.env.SEARCH_VERIFY_PASSWORD ?? 'Phase21-Verify!x9';
  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (signIn.data.session) return signIn.data.session.access_token;
  const signUp = await supabase.auth.signUp({ email, password });
  if (signUp.data.session) return signUp.data.session.access_token;
  throw new Error(
    `Cannot obtain a session (sign-in: ${signIn.error?.message}; sign-up: ${signUp.error?.message}). ` +
    'Set SEARCH_VERIFY_EMAIL / SEARCH_VERIFY_PASSWORD to an existing account.'
  );
}

// ─────────────────────────── fixtures (mirror the test suite) ───────────────────────────

function riskResume(): QuickMatchInput {
  const parsed: ParsedResume = {
    personal: { name: 'Verify User', email: 'v@x.com', phone: '', location: 'Chennai', linkedin: '', github: '', portfolio: '' },
    summary: 'Risk and compliance professional with AML, KYC and internal audit experience across banking.',
    careerObjective: 'Enterprise risk leadership.',
    yearsOfExperience: 4,
    currentDesignation: 'Risk Analyst',
    currentIndustry: 'Banking',
    experience: [], education: [],
    skills: {
      technical: ['SQL', 'Excel', 'Python'], soft: ['Communication'],
      business: ['Risk Management', 'AML', 'KYC', 'Transaction Monitoring', 'Internal Audit', 'Compliance', 'Fraud Detection'],
      leadership: [], tools: ['Actimize', 'SAS'], frameworks: ['Basel III'],
      programmingLanguages: [], cloudPlatforms: [], databases: [],
    },
    projects: [], certifications: [], languages: ['English'], achievements: [], awards: [],
    publications: [], volunteerWork: [], publicSpeaking: [], research: [], patents: [],
    insights: { careerGaps: [], promotionHistory: '', employmentStability: '', jobSwitchingPattern: '', careerProgression: '' },
  };
  const profile: CareerProfileRow = {
    user_id: 'verify', job_title: 'Risk Analyst', preferred_role: 'Operational Risk Analyst',
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

// ─────────────────────────── verification ───────────────────────────

const RISK_CLUSTER: Set<JobCategory> = relatedCategories('risk');
const JUNK_CATEGORIES: JobCategory[] = ['content-writing', 'marketing', 'design', 'customer-support', 'sales', 'hr', 'logistics', 'healthcare', 'education'];

const SEARCHES: { query: string; location: string }[] = [
  { query: 'Risk', location: 'Chennai' },
  { query: 'AML', location: 'Bengaluru' },
  { query: 'Compliance', location: 'Mumbai' },
  { query: 'Fraud', location: 'Hyderabad' },
  { query: 'Internal Audit', location: 'Pune' },
];

async function main(): Promise<void> {
  const { url, anon } = readEnv();
  if (!url || !anon) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env');
  const token = await getAccessToken(url, anon);
  console.log('✓ authenticated');

  const fetcher: ProviderFetcher = async (params, terms) => {
    const res = await fetch(`${url}/functions/v1/careers-jobs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: params.query,
        terms,
        location: params.location,
        country: params.country,
        remoteOnly: params.remoteOnly || params.workMode === 'remote',
        workMode: params.workMode,
        employmentType: params.employmentType,
        salaryMin: params.salaryMin,
        salaryMax: params.salaryMax,
        page: params.page,
      }),
    });
    if (!res.ok) throw new Error(`careers-jobs HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return await res.json();
  };

  const resume = riskResume();
  let failures = 0;

  for (const { query, location } of SEARCHES) {
    const params: JobSearchParams = {
      ...DEFAULT_SEARCH_PARAMS,
      query, location, country: 'in',
      employmentType: 'fulltime', workMode: 'onsite', industry: 'Risk & Compliance',
    };
    const report = await runSearchPipeline(params, resume, fetcher, { skipCache: true, resumeKey: 'verify' });
    const jobs = report.jobs;
    const relevant = jobs.filter((s) => RISK_CLUSTER.has(s.job.classification.category));
    const relevance = jobs.length ? relevant.length / jobs.length : 1;
    const junk = jobs.filter((s) => JUNK_CATEGORIES.includes(s.job.classification.category));
    const noMatch = jobs.filter((s) => s.match == null);
    const badFilter = jobs.filter((s) =>
      (s.job.country && s.job.country.length === 2 && s.job.country.toLowerCase() !== 'in') ||
      s.job.workMode === 'remote' ||
      (s.job.employment && s.job.employment !== 'fulltime') ||
      s.locationVerdict === 'mismatch'
    );

    const ok = relevance >= 0.9 && junk.length === 0 && noMatch.length === 0 && badFilter.length === 0;
    if (!ok) failures += 1;

    console.log(`\n${ok ? '✅' : '❌'} ${query} | ${location} | India  (full-time · on-site · Risk & Compliance)`);
    console.log(`   providers: ${JSON.stringify(report.quality.providerCoverage)}`);
    console.log(`   returned ${jobs.length} · rejected ${report.quality.rejected} ${JSON.stringify(report.quality.rejectedByReason)}`);
    console.log(`   relevance ${(relevance * 100).toFixed(0)}% · avg match ${report.quality.averageMatch}% · junk ${junk.length} · missing-match ${noMatch.length} · filter-violations ${badFilter.length}`);
    for (const s of jobs.slice(0, 8)) {
      console.log(`     · [${s.match?.overall}%] ${s.job.title} — ${s.job.company} (${s.job.location || s.job.country}) [${s.job.classification.category}] via ${s.job.via}`);
    }
    if (junk.length) for (const s of junk) console.log(`     ✗ JUNK LEAKED: ${s.job.title} [${s.job.classification.category}]`);
    if (badFilter.length) for (const s of badFilter) console.log(`     ✗ FILTER VIOLATION: ${s.job.title} (${s.job.country}/${s.job.workMode}/${s.job.employment}/${s.locationVerdict})`);
  }

  console.log(failures === 0 ? '\n✅ All live search gates passed.' : `\n❌ ${failures} search(es) failed their gates.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('verify-search failed:', e instanceof Error ? e.message : e);
  process.exit(2);
});
