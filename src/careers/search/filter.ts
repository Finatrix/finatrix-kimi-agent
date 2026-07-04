/**
 * Phase 2.1 — Deterministic Filtering (pipeline stage 5). Runs BEFORE any AI:
 * hard gates on country, location, work mode, employment type, salary and
 * taxonomy category. Every rejection carries a reason so the Search Quality
 * panel can report exactly what was dropped and why — no silent filtering,
 * no fake filtering.
 */

import type { JobSearchParams } from '../types/jobs';
import type { SearchIntent } from './intent';
import { locationVerdict, type LocationVerdict } from './locations';
import type { EnrichedJob } from './normalize';
import { containsTerm, type JobCategory } from './taxonomy';

export type RejectReason =
  | 'country'
  | 'location'
  | 'work-mode'
  | 'employment-type'
  | 'salary'
  | 'category'
  | 'seniority';

export interface RejectedJob {
  job: EnrichedJob;
  reason: RejectReason;
  detail: string;
}

export interface FilterOutcome {
  accepted: EnrichedJob[];
  rejected: RejectedJob[];
  /** Location verdict per accepted job (for ranking + display). */
  verdicts: Map<EnrichedJob, LocationVerdict>;
}

/**
 * Job categories the intent accepts. The intent's target set is already the
 * full concept cluster — do NOT close over `related` again here, or second-
 * degree neighbours leak in (risk → model-risk → data would admit Data
 * Labeling jobs into a Risk search).
 */
export function allowedCategories(intent: SearchIntent): Set<JobCategory> {
  return new Set(intent.targetCategories);
}

/**
 * Category gate: a job passes when its best category is in the allowed set,
 * or a lower-ranked allowed category still carries meaningful evidence, or
 * the job title literally contains the user's query / an expansion term.
 */
export function categoryAccepts(job: EnrichedJob, intent: SearchIntent, allowed: Set<JobCategory>): boolean {
  if (!allowed.size) return true; // no gate resolvable — keyword search only
  const { scores, category } = job.classification;
  if (allowed.has(category)) return true;
  // Secondary evidence: an allowed category scored ≥ 60% of the top score.
  const top = scores[0]?.score ?? 0;
  for (const s of scores) {
    if (allowed.has(s.category) && top > 0 && s.score >= top * 0.6) return true;
  }
  // Literal title match on the query or a priority title keeps recall honest.
  const title = job.title.toLowerCase();
  if (intent.rawQuery && containsTerm(title, intent.rawQuery)) return true;
  return intent.priorityTitles.some((t) => containsTerm(title, t));
}

export function filterJobs(
  jobs: EnrichedJob[],
  params: JobSearchParams,
  intent: SearchIntent
): FilterOutcome {
  const accepted: EnrichedJob[] = [];
  const rejected: RejectedJob[] = [];
  const verdicts = new Map<EnrichedJob, LocationVerdict>();
  const allowed = allowedCategories(intent);
  const country = params.country.trim().toLowerCase();

  for (const job of jobs) {
    // 1 · Country + city gate.
    const verdict = locationVerdict(job.location, job.country, job.workMode, params.location, country);
    if (verdict === 'mismatch') {
      rejected.push({ job, reason: params.location ? 'location' : 'country', detail: job.location || job.country });
      continue;
    }
    // Remote jobs only satisfy a location search when remote is acceptable.
    if (verdict === 'remote' && params.workMode === 'onsite') {
      rejected.push({ job, reason: 'work-mode', detail: 'remote posting, on-site requested' });
      continue;
    }

    // 2 · Work mode gate (flexible postings pass either way).
    if (params.workMode && !job.flexibleWorkMode) {
      if (params.workMode === 'remote' && job.workMode && job.workMode !== 'remote') {
        rejected.push({ job, reason: 'work-mode', detail: job.workMode });
        continue;
      }
      if (params.workMode === 'onsite' && job.workMode === 'remote') {
        rejected.push({ job, reason: 'work-mode', detail: 'remote' });
        continue;
      }
      if (params.workMode === 'hybrid' && job.workMode && job.workMode !== 'hybrid') {
        rejected.push({ job, reason: 'work-mode', detail: job.workMode });
        continue;
      }
    }
    if (params.remoteOnly && job.workMode && job.workMode !== 'remote' && !job.flexibleWorkMode) {
      rejected.push({ job, reason: 'work-mode', detail: job.workMode });
      continue;
    }

    // 3 · Employment type gate. Unknown employment ('') passes — providers
    // frequently omit it and full-time is the overwhelming default.
    if (params.employmentType) {
      const want = params.employmentType === 'intern' ? 'intern' : params.employmentType;
      if (job.employment && job.employment !== want) {
        rejected.push({ job, reason: 'employment-type', detail: job.employment });
        continue;
      }
      if (want === 'fulltime' && job.employment === '' && job.seniority === 'intern') {
        rejected.push({ job, reason: 'employment-type', detail: 'internship posting' });
        continue;
      }
    }

    // 4 · Salary gate — only when the job discloses salary.
    if (params.salaryMin && (job.salary_max ?? job.salary_min)) {
      const jobTop = job.salary_max ?? job.salary_min!;
      if (jobTop < params.salaryMin) {
        rejected.push({ job, reason: 'salary', detail: `${jobTop} < ${params.salaryMin}` });
        continue;
      }
    }
    if (params.salaryMax && job.salary_min && job.salary_min > params.salaryMax) {
      rejected.push({ job, reason: 'salary', detail: `${job.salary_min} > ${params.salaryMax}` });
      continue;
    }

    // 5 · Freshers gate.
    if (params.freshersOnly && (job.seniority === 'senior' || job.seniority === 'lead')) {
      rejected.push({ job, reason: 'seniority', detail: job.seniority });
      continue;
    }

    // 6 · Category / relevance gate — the core "Risk never shows Writing
    // Specialist" guarantee.
    if (!categoryAccepts(job, intent, allowed)) {
      rejected.push({
        job,
        reason: 'category',
        detail: job.classification.category,
      });
      continue;
    }

    verdicts.set(job, verdict);
    accepted.push(job);
  }

  return { accepted, rejected, verdicts };
}
