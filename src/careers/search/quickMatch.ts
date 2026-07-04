/**
 * Phase 2.1 — Quick Resume Match (pipeline stage: Resume Matching).
 * Every returned job gets a deterministic Resume Match % — instantly, with
 * zero AI cost — computed from the parsed resume, career DNA and profile.
 * The full 14-category AI match (matchService) still runs on demand and
 * replaces this score when available; both flow into the same hard
 * threshold, so "below 80% never shown" is real filtering, not visual.
 */

import type { CareerDNA, CareerProfileRow, ParsedResume } from '../types';
import { locationScore, salaryScore } from '../services/matchEngine';
import type { EnrichedJob } from './normalize';
import { classifyJob, containsTerm, relatedCategories } from './taxonomy';

export interface QuickMatch {
  /** 0–100 weighted overall — the Resume Match % shown on every card. */
  overall: number;
  scores: {
    skills: number;
    title: number;
    category: number;
    experience: number;
    keywords: number;
    location: number;
    salary: number;
    careerDna: number;
  };
  /** Resume skills found in the job text (for "Why this job?"). */
  matchedSkills: string[];
  /** Top job-demanded terms absent from the resume. */
  missingTerms: string[];
}

export interface QuickMatchInput {
  parsed: ParsedResume;
  rawText: string;
  careerDna: CareerDNA | null;
  profile: CareerProfileRow | null;
}

function allSkills(parsed: ParsedResume, profile: CareerProfileRow | null): string[] {
  const s = parsed.skills;
  const list = [
    ...s.technical, ...s.business, ...s.tools, ...s.frameworks,
    ...s.programmingLanguages, ...s.cloudPlatforms, ...s.databases,
    ...(profile?.primary_skills ?? []), ...(profile?.secondary_skills ?? []),
  ];
  return [...new Set(list.map((x) => x.trim()).filter((x) => x.length > 1))];
}

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

const WEIGHTS = {
  skills: 24, title: 16, category: 16, experience: 12,
  keywords: 12, location: 8, salary: 4, careerDna: 8,
} as const;

export function quickMatchJob(job: EnrichedJob, input: QuickMatchInput): QuickMatch {
  const jobText = `${job.title}\n${job.description}`.toLowerCase().slice(0, 12_000);
  const skills = allSkills(input.parsed, input.profile);

  // Skills: share of resume skills the job text mentions (capped basket so a
  // long skill list doesn't dilute strong hits).
  const matchedSkills: string[] = [];
  for (const skill of skills) {
    if (containsTerm(jobText, skill.toLowerCase())) matchedSkills.push(skill);
  }
  const skillsScore = skills.length
    ? clamp((matchedSkills.length / Math.min(skills.length, 12)) * 100)
    : 50;

  // Title: current/preferred designation overlap with the job title.
  const myTitles = [input.parsed.currentDesignation, input.profile?.preferred_role ?? '', input.profile?.job_title ?? '']
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  let titleScore = 40;
  const jobTitle = job.title.toLowerCase();
  for (const mine of myTitles) {
    const words = mine.split(/[^a-z0-9&]+/).filter((w) => w.length > 2);
    if (!words.length) continue;
    const hits = words.filter((w) => containsTerm(jobTitle, w)).length;
    titleScore = Math.max(titleScore, clamp((hits / words.length) * 100));
  }

  // Category: the job's taxonomy category vs the candidate's own.
  const resumeClass = classifyJob(
    `${input.parsed.currentDesignation} ${input.profile?.preferred_role ?? ''} ${input.parsed.currentIndustry}`,
    `${input.parsed.summary}\n${skills.join(' ')}`.slice(0, 3000)
  );
  let categoryScore = 50;
  if (resumeClass.category !== 'other' && job.classification.category !== 'other') {
    if (job.classification.category === resumeClass.category) categoryScore = 100;
    else if (relatedCategories(resumeClass.category).has(job.classification.category)) categoryScore = 80;
    else categoryScore = 25;
  }

  // Experience: years of experience vs the job's seniority band.
  const years = input.parsed.yearsOfExperience ?? input.profile?.years_experience ?? null;
  let experienceScore = 60;
  if (years != null) {
    const bands: Record<string, [number, number]> = {
      intern: [0, 1], junior: [0, 3], mid: [2, 7], senior: [4, 30], lead: [7, 40],
    };
    const band = job.seniority ? bands[job.seniority] : [0, 40];
    if (years >= band[0] && years <= band[1]) experienceScore = 95;
    else if (years >= band[0] - 1 && years <= band[1] + 3) experienceScore = 75;
    else experienceScore = 35;
  }

  // Keywords: the job's own classification evidence found in the resume.
  const resumeText = input.rawText.toLowerCase();
  const jobTerms = job.classification.matched;
  const missingTerms: string[] = [];
  let kwHits = 0;
  for (const term of jobTerms) {
    if (containsTerm(resumeText, term)) kwHits++;
    else missingTerms.push(term);
  }
  const keywordsScore = jobTerms.length ? clamp((kwHits / jobTerms.length) * 100) : 50;

  // Location & salary reuse the Phase 2 deterministic scorers.
  const locScore = locationScore({ location: job.location, work_mode: job.workMode }, input.profile);
  const salScore = salaryScore({ salary_min: job.salary_min, salary_max: job.salary_max }, input.profile);

  // Career DNA: suitable roles / recommended industries vs the job.
  let dnaScore = 60;
  const dna = input.careerDna ?? input.profile?.career_dna ?? null;
  if (dna) {
    const roleHit = dna.suitableRoles.some((r) =>
      r.split(/[^a-zA-Z0-9]+/).filter((w) => w.length > 3)
        .some((w) => containsTerm(jobTitle, w.toLowerCase())));
    const industryHit = dna.recommendedIndustries.some((ind) => containsTerm(jobText, ind.toLowerCase()));
    dnaScore = roleHit && industryHit ? 100 : roleHit ? 90 : industryHit ? 75 : 45;
  }

  const scores = {
    skills: skillsScore,
    title: titleScore,
    category: categoryScore,
    experience: experienceScore,
    keywords: keywordsScore,
    location: locScore,
    salary: salScore,
    careerDna: dnaScore,
  };
  let weighted = 0;
  let total = 0;
  for (const [k, w] of Object.entries(WEIGHTS) as [keyof typeof WEIGHTS, number][]) {
    weighted += scores[k] * w;
    total += w;
  }
  return {
    overall: clamp(weighted / total),
    scores,
    matchedSkills: matchedSkills.slice(0, 10),
    missingTerms: missingTerms.slice(0, 6),
  };
}
