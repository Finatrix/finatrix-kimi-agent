/**
 * Deterministic half of the job match engine. Four categories are computed
 * from data we already have — no AI cost, fully explainable — and merged
 * with the ten AI-scored categories into the final report:
 *
 *   keywords  — job's weighted ATS keywords found in the resume text
 *   industry  — job industry vs the user's current/preferred industry
 *   location  — job location/work-mode vs the user's location preference
 *   salary    — job salary range vs the user's expectation
 */

import type { CareerProfileRow, ParsedResume } from '../types';
import type {
  JobKeywordReport,
  JobRow,
  MatchScores,
  MatchCategoryId,
} from '../types/jobs';
import { MATCH_CATEGORIES } from '../types/jobs';

/** Weighted keyword coverage of the resume text, 0–100. */
export function keywordCoverageScore(keywords: JobKeywordReport | null, resumeText: string): number {
  const list = keywords?.keywords ?? [];
  if (!list.length) return 50; // nothing to measure → neutral
  const haystack = resumeText.toLowerCase();
  let hit = 0;
  let total = 0;
  for (const k of list) {
    total += k.weight;
    if (haystack.includes(k.keyword.toLowerCase())) hit += k.weight;
  }
  return total ? Math.round((hit / total) * 100) : 50;
}

/** Which job keywords are absent from the resume text (for gap display). */
export function missingKeywords(keywords: JobKeywordReport | null, resumeText: string): string[] {
  const haystack = resumeText.toLowerCase();
  return (keywords?.keywords ?? [])
    .filter((k) => !haystack.includes(k.keyword.toLowerCase()))
    .map((k) => k.keyword);
}

/** True when two tokens share a word stem ("finance" ↔ "financial"). */
function stemMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5) return false;
  const stem = Math.min(a.length, b.length, 6);
  return a.slice(0, stem) === b.slice(0, stem);
}

function tokenOverlap(a: string, b: string): number {
  const tokens = (s: string) =>
    [...new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2))];
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  let shared = 0;
  for (const t of ta) if (tb.some((u) => stemMatch(t, u))) shared++;
  return shared / Math.min(ta.length, tb.length);
}

export function industryScore(
  jobIndustry: string,
  parsed: ParsedResume | null,
  profile: CareerProfileRow | null
): number {
  if (!jobIndustry) return 60; // unknown → mildly positive neutral
  const mine = [profile?.preferred_industry ?? '', parsed?.currentIndustry ?? ''].filter(Boolean);
  if (!mine.length) return 60;
  const best = Math.max(...mine.map((m) => tokenOverlap(jobIndustry, m)));
  if (best >= 0.99) return 100;
  if (best >= 0.5) return 85;
  if (best > 0) return 65;
  return 35;
}

export function locationScore(job: Pick<JobRow, 'location' | 'work_mode'>, profile: CareerProfileRow | null): number {
  const pref = (profile?.location_preference ?? '').toLowerCase();
  if (job.work_mode === 'remote') return 100; // remote works from anywhere
  if (!pref) return 60;
  if (/remote|anywhere/.test(pref)) return job.work_mode === 'hybrid' ? 70 : 40;
  if (!job.location) return 60;
  const overlap = tokenOverlap(job.location, pref);
  if (overlap >= 0.5) return 100;
  if (overlap > 0) return 80;
  return job.work_mode === 'hybrid' ? 45 : 30;
}

/** Parse a number like "24", "24L", "2400000", "24 LPA" out of expectation text. */
export function parseSalaryExpectation(text: string): number | null {
  const m = /([\d,.]+)\s*(lpa|l|lakh|lakhs|cr|k)?/i.exec(text.replace(/[₹$€£\s]/g, ' '));
  if (!m) return null;
  const base = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(base) || base <= 0) return null;
  const unit = (m[2] ?? '').toLowerCase();
  if (unit === 'cr') return base * 10_000_000;
  if (unit === 'k') return base * 1_000;
  if (unit === 'lpa' || unit === 'l' || unit.startsWith('lakh')) return base * 100_000;
  // Bare small numbers ("24") in an Indian context almost always mean LPA.
  return base < 1_000 ? base * 100_000 : base;
}

export function salaryScore(
  job: Pick<JobRow, 'salary_min' | 'salary_max'>,
  profile: CareerProfileRow | null
): number {
  const expected = parseSalaryExpectation(profile?.salary_expectation ?? '');
  const jobMax = job.salary_max ?? job.salary_min;
  if (!expected || !jobMax) return 60; // unknown either side → neutral
  const ratio = jobMax / expected;
  if (ratio >= 1) return 100;
  if (ratio >= 0.85) return 80;
  if (ratio >= 0.7) return 55;
  return 30;
}

export interface DeterministicInput {
  job: Pick<JobRow, 'industry' | 'location' | 'work_mode' | 'salary_min' | 'salary_max'>;
  keywords: JobKeywordReport | null;
  resumeText: string;
  parsed: ParsedResume | null;
  profile: CareerProfileRow | null;
}

export function deterministicScores(input: DeterministicInput): Pick<MatchScores, 'keywords' | 'industry' | 'location' | 'salary'> {
  return {
    keywords: keywordCoverageScore(input.keywords, input.resumeText),
    industry: industryScore(input.job.industry, input.parsed, input.profile),
    location: locationScore(input.job, input.profile),
    salary: salaryScore(input.job, input.profile),
  };
}

/** Category weights for the overall score (sums to 100). */
const WEIGHTS: Record<MatchCategoryId, number> = {
  technical: 18, experience: 14, education: 6, certifications: 5, ats: 8,
  careerDna: 8, culture: 3, leadership: 4, communication: 3, projects: 5,
  keywords: 12, industry: 6, location: 5, salary: 3,
};

export function combineScores(
  ai: Record<string, number>,
  deterministic: Pick<MatchScores, 'keywords' | 'industry' | 'location' | 'salary'>
): { overall: number; scores: MatchScores } {
  const scores = {} as MatchScores;
  for (const { id } of MATCH_CATEGORIES) {
    scores[id] = id in deterministic
      ? deterministic[id as keyof typeof deterministic]
      : Math.min(100, Math.max(0, Math.round(ai[id] ?? 0)));
  }
  let weighted = 0;
  let totalWeight = 0;
  for (const { id } of MATCH_CATEGORIES) {
    weighted += scores[id] * WEIGHTS[id];
    totalWeight += WEIGHTS[id];
  }
  return { overall: Math.round(weighted / totalWeight), scores };
}
