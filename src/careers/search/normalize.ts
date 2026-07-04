/**
 * Phase 2.1 — Normalization enrichment (pipeline stage: Normalization).
 * Providers return one canonical NormalizedJob shape from the edge function;
 * this stage derives everything the deterministic filter and ranker need but
 * providers rarely state: taxonomy category, inferred work mode (WFH/WFO/
 * hybrid), canonical employment type, seniority and Indian salary parsing.
 */

import type { NormalizedJob } from '../types/jobs';
import { parseIndianSalary } from './locations';
import { classifyJob, containsTerm, type ClassifiedJob } from './taxonomy';

export type WorkMode = '' | 'remote' | 'hybrid' | 'onsite';
export type CanonicalEmployment = '' | 'fulltime' | 'parttime' | 'contract' | 'intern' | 'volunteer';
export type Seniority = '' | 'intern' | 'junior' | 'mid' | 'senior' | 'lead';

export interface EnrichedJob extends NormalizedJob {
  classification: ClassifiedJob;
  workMode: WorkMode;
  /** True when the posting mentions both office and remote/hybrid options. */
  flexibleWorkMode: boolean;
  employment: CanonicalEmployment;
  seniority: Seniority;
}

const REMOTE_RE = /\b(remote|work from home|wfh|fully remote|remote[- ]first|anywhere)\b/i;
const HYBRID_RE = /\bhybrid\b/i;
const ONSITE_RE = /\b(on[- ]?site|onsite|in[- ]office|work from office|wfo|office[- ]based)\b/i;

export function inferWorkMode(job: NormalizedJob): { mode: WorkMode; flexible: boolean } {
  const declared = job.work_mode.toLowerCase() as WorkMode;
  const text = `${job.title}\n${job.location}\n${job.description.slice(0, 3000)}`;
  const remote = REMOTE_RE.test(text);
  const hybrid = HYBRID_RE.test(text);
  const onsite = ONSITE_RE.test(text);
  if (declared === 'remote' || declared === 'hybrid' || declared === 'onsite') {
    return { mode: declared, flexible: hybrid || (remote && onsite) };
  }
  if (hybrid) return { mode: 'hybrid', flexible: true };
  if (remote && !onsite) return { mode: 'remote', flexible: false };
  if (onsite) return { mode: 'onsite', flexible: remote };
  return { mode: '', flexible: false };
}

export function canonicalEmployment(raw: string, title: string, description: string): CanonicalEmployment {
  const v = raw.toLowerCase();
  const text = `${title} ${description.slice(0, 1500)}`;
  if (/(full[- _]?time|permanent|fulltime)/.test(v)) return 'fulltime';
  if (/(part[- _]?time|parttime)/.test(v)) return 'parttime';
  if (/(contract|freelance|temporary|contractor)/.test(v)) return 'contract';
  if (/(intern|graduate|trainee|apprentice)/.test(v)) return 'intern';
  if (/volunteer/.test(v)) return 'volunteer';
  if (/\b(internship|intern)\b/i.test(title)) return 'intern';
  if (/\bvolunteer\b/i.test(title)) return 'volunteer';
  if (/\b(contract role|contract position|fixed[- ]term)\b/i.test(text)) return 'contract';
  return '';
}

export function inferSeniority(title: string): Seniority {
  const t = title.toLowerCase();
  if (/\b(intern|internship|graduate|fresher|trainee)\b/.test(t)) return 'intern';
  if (/\b(director|head|vp|vice president|principal|chief|lead)\b/.test(t)) return 'lead';
  if (/\b(senior|sr\.?|avp)\b/.test(t)) return 'senior';
  if (/\b(junior|jr\.?|associate|entry)\b/.test(t)) return 'junior';
  return '';
}

/** Enrich one provider job into the canonical pipeline shape. */
export function enrichJob(job: NormalizedJob): EnrichedJob {
  const classification = classifyJob(job.title, job.description, job.industry);
  const { mode, flexible } = inferWorkMode(job);
  let { salary_min, salary_max } = job;
  // Indian postings often bury "12 LPA" in the description instead of fields.
  if (!salary_min && !salary_max && containsTerm(job.description.slice(0, 3000), 'lpa')) {
    const parsed = parseIndianSalary(job.description.slice(0, 3000));
    salary_min = parsed.min;
    salary_max = parsed.max;
  }
  return {
    ...job,
    salary_min,
    salary_max,
    classification,
    workMode: mode,
    flexibleWorkMode: flexible,
    employment: canonicalEmployment(job.employment_type, job.title, job.description),
    seniority: inferSeniority(job.title),
  };
}
