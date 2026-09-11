/**
 * Phase 2.1 — Quick Resume Match (pipeline stage: Resume Matching).
 * Every returned job gets a deterministic Resume Match % — instantly, with
 * zero AI cost — computed from the parsed resume, career DNA and profile.
 * The full 14-category AI match (matchService) still runs on demand and
 * replaces this score when available; both flow into the same hard
 * threshold, so "below 70% never shown" is real filtering, not visual.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SCORING MODEL — why this was rebuilt (2026-08-28)
 * ────────────────────────────────────────────────────────────────────────────
 * The original model scored all eight dimensions on every job and gave each a
 * generous floor when it had nothing to go on: unknown seniority scored 95,
 * an unclassifiable posting scored 50 on category, a posting with no
 * extractable keywords scored 50, and location/salary/DNA each defaulted to 60
 * whenever the user had no profile.
 *
 * The floors did not merely inflate scores — they INVERTED the ranking,
 * because a posting that says nothing trips every floor while a real posting
 * that genuinely does not fit gets correctly-low scores on the dimensions that
 * could be measured. Measured against a finance analyst's resume:
 *
 *     44%  "We are hiring. Apply now. Great culture."   ← gibberish
 *     44%  Heavy Vehicle Diesel Mechanic
 *     34%  Accounts Payable Clerk
 *     34%  Registered Nurse — ICU
 *     56%  Equity Research Associate                    ← a genuinely good fit
 *
 * A diesel mechanic outranked every real finance role, an empty posting tied
 * with it, and the one adjacent role a candidate should have seen fell below
 * the 70% threshold and was hidden. The number was worse than useless: it was
 * anti-correlated with fit.
 *
 * The rule now is that ABSENCE OF EVIDENCE IS NOT EVIDENCE OF FIT. Each
 * dimension reports a score *and whether it had anything to measure*; the
 * weighted mean is taken only over the dimensions that fired, and the share of
 * total weight that fired is reported as `confidence`. A posting we know
 * nothing about scores low with low confidence, which is the honest answer,
 * instead of scoring 44% with false authority.
 *
 * Weights are unchanged, so a job with full evidence scores as it always did.
 */

import type { CareerDNA, CareerProfileRow, ParsedResume } from '../types';
import { locationScore, parseSalaryExpectation, salaryScore } from '../services/matchEngine';
import type { EnrichedJob } from './normalize';
import { classifyJob, containsTerm, relatedCategories } from './taxonomy';

export interface QuickMatch {
  /** 0–100 weighted overall — the Resume Match % shown on every card. */
  overall: number;
  /**
   * 0–100: the share of the scoring model's total weight that had real
   * evidence behind it. A 90% match at 30% confidence is a guess; the UI
   * should not present it the way it presents a 90% match at 95%.
   */
  confidence: number;
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

type Dimension = keyof typeof WEIGHTS;

/**
 * One dimension's verdict. `measured: false` means we had nothing to compare —
 * the dimension is dropped from the weighted mean rather than defaulted, and
 * its `score` is reported only so the UI can still show a breakdown row.
 */
interface Verdict {
  score: number;
  measured: boolean;
}

const unmeasured = (score = 0): Verdict => ({ score, measured: false });
const measured = (score: number): Verdict => ({ score: clamp(score), measured: true });

export function quickMatchJob(job: EnrichedJob, input: QuickMatchInput): QuickMatch {
  const jobText = `${job.title}\n${job.description}`.toLowerCase().slice(0, 12_000);
  const skills = allSkills(input.parsed, input.profile);

  // ── Skills: share of resume skills the job text mentions (capped basket so
  // a long skill list doesn't dilute strong hits). Unmeasurable only when the
  // resume yielded no skills at all.
  const matchedSkills: string[] = [];
  for (const skill of skills) {
    if (containsTerm(jobText, skill.toLowerCase())) matchedSkills.push(skill);
  }
  const skillsV = skills.length
    ? measured((matchedSkills.length / Math.min(skills.length, 12)) * 100)
    : unmeasured();

  // ── Title: current/preferred designation overlap with the job title. A
  // non-overlapping title is a real 0, not the old 40 floor; it is only
  // unmeasurable when the candidate has no title on file.
  const myTitles = [input.parsed.currentDesignation, input.profile?.preferred_role ?? '', input.profile?.job_title ?? '']
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const jobTitle = job.title.toLowerCase();
  let titleV = unmeasured();
  if (myTitles.length && jobTitle) {
    let best = 0;
    let comparable = false;
    for (const mine of myTitles) {
      const words = mine.split(/[^a-z0-9&]+/).filter((w) => w.length > 2);
      if (!words.length) continue;
      comparable = true;
      const hits = words.filter((w) => containsTerm(jobTitle, w)).length;
      best = Math.max(best, (hits / words.length) * 100);
    }
    if (comparable) titleV = measured(best);
  }

  // ── Category: the job's taxonomy category vs the candidate's own. When
  // EITHER side is unclassifiable the comparison is meaningless — the old
  // model scored that 50, which is how an unparseable posting came to outrank
  // a posting correctly identified as a different field (25).
  const resumeClass = classifyJob(
    `${input.parsed.currentDesignation} ${input.profile?.preferred_role ?? ''} ${input.parsed.currentIndustry}`,
    `${input.parsed.summary}\n${skills.join(' ')}`.slice(0, 3000)
  );
  let categoryV = unmeasured();
  if (resumeClass.category !== 'other' && job.classification.category !== 'other') {
    if (job.classification.category === resumeClass.category) categoryV = measured(100);
    else if (relatedCategories(resumeClass.category).has(job.classification.category)) categoryV = measured(80);
    else categoryV = measured(25);
  }

  // ── Experience: years vs the job's seniority band. The old model fell back
  // to a [0,40] catch-all band when seniority was unknown, so essentially
  // EVERY job scored 95 here — 12 points of the total handed out unearned.
  const years = input.parsed.yearsOfExperience ?? input.profile?.years_experience ?? null;
  const BANDS: Record<string, [number, number]> = {
    intern: [0, 1], junior: [0, 3], mid: [2, 7], senior: [4, 30], lead: [7, 40],
  };
  const band = job.seniority ? BANDS[job.seniority] : undefined;
  let experienceV = unmeasured();
  if (years != null && band) {
    if (years >= band[0] && years <= band[1]) experienceV = measured(95);
    else if (years >= band[0] - 1 && years <= band[1] + 3) experienceV = measured(75);
    else experienceV = measured(35);
  }

  // ── Keywords: the job's own classification evidence found in the resume.
  // A posting with no extractable terms is unmeasurable, not a 50.
  const resumeText = input.rawText.toLowerCase();
  const jobTerms = job.classification.matched;
  const missingTerms: string[] = [];
  let kwHits = 0;
  for (const term of jobTerms) {
    if (containsTerm(resumeText, term)) kwHits++;
    else missingTerms.push(term);
  }
  const keywordsV = jobTerms.length ? measured((kwHits / jobTerms.length) * 100) : unmeasured();

  // ── Location: measurable when the candidate stated a preference, or when
  // the job is remote (which fits any preference). locationScore's own
  // "no preference → 60" branch is bypassed rather than changed, because the
  // AI match path still depends on that neutral default.
  const hasLocationPref = !!(input.profile?.location_preference ?? '').trim();
  const locationV = hasLocationPref || job.workMode === 'remote'
    ? measured(locationScore({ location: job.location, work_mode: job.workMode }, input.profile))
    : unmeasured();

  // ── Salary: measurable only when BOTH sides state a number.
  const expects = parseSalaryExpectation(input.profile?.salary_expectation ?? '');
  const jobPays = job.salary_max ?? job.salary_min;
  const salaryV = expects && jobPays
    ? measured(salaryScore({ salary_min: job.salary_min, salary_max: job.salary_max }, input.profile))
    : unmeasured();

  // ── Career DNA: suitable roles / recommended industries vs the job.
  const dna = input.careerDna ?? input.profile?.career_dna ?? null;
  let careerDnaV = unmeasured();
  if (dna && (dna.suitableRoles.length || dna.recommendedIndustries.length)) {
    const roleHit = dna.suitableRoles.some((r) =>
      r.split(/[^a-zA-Z0-9]+/).filter((w) => w.length > 3)
        .some((w) => containsTerm(jobTitle, w.toLowerCase())));
    const industryHit = dna.recommendedIndustries.some((ind) => containsTerm(jobText, ind.toLowerCase()));
    careerDnaV = measured(roleHit && industryHit ? 100 : roleHit ? 90 : industryHit ? 75 : 45);
  }

  const verdicts: Record<Dimension, Verdict> = {
    skills: skillsV,
    title: titleV,
    category: categoryV,
    experience: experienceV,
    keywords: keywordsV,
    location: locationV,
    salary: salaryV,
    careerDna: careerDnaV,
  };

  // Weighted mean over the dimensions that actually had evidence.
  let weighted = 0;
  let measuredWeight = 0;
  let totalWeight = 0;
  for (const [dim, w] of Object.entries(WEIGHTS) as [Dimension, number][]) {
    totalWeight += w;
    if (!verdicts[dim].measured) continue;
    weighted += verdicts[dim].score * w;
    measuredWeight += w;
  }

  return {
    // Nothing measurable at all → 0%, at 0% confidence. The old model returned
    // 44% here, which is how "We are hiring. Apply now." reached the results.
    overall: measuredWeight ? clamp(weighted / measuredWeight) : 0,
    confidence: clamp((measuredWeight / totalWeight) * 100),
    scores: {
      skills: verdicts.skills.score,
      title: verdicts.title.score,
      category: verdicts.category.score,
      experience: verdicts.experience.score,
      keywords: verdicts.keywords.score,
      location: verdicts.location.score,
      salary: verdicts.salary.score,
      careerDna: verdicts.careerDna.score,
    },
    matchedSkills: matchedSkills.slice(0, 10),
    missingTerms: missingTerms.slice(0, 6),
  };
}
