// Normalisation: raw provider records → the canonical FinatriXJob, plus the
// deterministic (no-AI) enrichment every job gets for free, and the projection
// back to the legacy wire shape the client already consumes.
//
// Deterministic enrichment only. Anything that costs an LLM call (summary,
// resume match, interview difficulty, …) is done lazily and cached elsewhere —
// running 13 AI analyses per result per search would be financially reckless.

import type { BadgeKey, FinatriXJob, WireJob } from './types.ts';
import { iso, normToken, postedDate as toPostedDate, safeUrl, str, stripHtml } from './sanitize.ts';
import { computeBadges, freshnessOf } from './badges.ts';

/** Fields a provider adapter fills; the normaliser derives the rest. */
export interface RawJob {
  externalId: string;
  title: string;
  company: string;
  description: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  salaryPeriod?: string;
  location: string;
  country: string;
  workMode: string;
  employmentType: string;
  applyUrl: string;
  companyLogo?: string | null;
  postedDate: string | null;
  closesAt?: string | null;
  industry?: string;
  /** Original posting source (LinkedIn/Indeed/company) — honest attribution. */
  via: string;
  metadata?: Record<string, unknown>;
}

const REMOTE_HINTS = /\b(remote|work from home|wfh|anywhere|distributed|telecommute)\b/i;
const HYBRID_HINTS = /\bhybrid\b/i;

const SENIORITY: Array<[RegExp, string]> = [
  [/\b(intern|internship|trainee)\b/i, 'entry'],
  [/\b(junior|entry[- ]level|graduate|associate)\b/i, 'entry'],
  [/\b(lead|principal|staff)\b/i, 'lead'],
  [/\b(head|director|vp|chief|c[te]o|cfo)\b/i, 'exec'],
  [/\b(senior|sr\.?|expert)\b/i, 'senior'],
];

/** A small, provider-agnostic skill lexicon for deterministic extraction. */
const SKILL_LEXICON = [
  'python', 'java', 'javascript', 'typescript', 'react', 'node', 'sql', 'aws',
  'azure', 'gcp', 'docker', 'kubernetes', 'excel', 'power bi', 'tableau',
  'accounting', 'financial modelling', 'financial modeling', 'risk', 'compliance',
  'aml', 'kyc', 'audit', 'ifrs', 'gaap', 'sap', 'salesforce', 'communication',
  'leadership', 'project management', 'agile', 'machine learning', 'nlp',
  'data analysis', 'go', 'rust', 'c++', 'c#', 'php', 'ruby', 'swift', 'kotlin',
];

function deriveWorkMode(raw: RawJob): string {
  if (raw.workMode) return raw.workMode;
  const hay = `${raw.title} ${raw.location} ${raw.description.slice(0, 400)}`;
  if (HYBRID_HINTS.test(hay)) return 'hybrid';
  if (REMOTE_HINTS.test(hay)) return 'remote';
  return '';
}

function remoteProbability(workMode: string, raw: RawJob): number {
  if (workMode === 'remote') return 1;
  if (workMode === 'hybrid') return 0.6;
  const hay = `${raw.title} ${raw.location} ${raw.description.slice(0, 600)}`;
  if (REMOTE_HINTS.test(hay)) return 0.7;
  if (HYBRID_HINTS.test(hay)) return 0.5;
  return 0.1;
}

function deriveExperience(raw: RawJob): string {
  const hay = `${raw.title} ${raw.description.slice(0, 300)}`;
  for (const [re, level] of SENIORITY) if (re.test(hay)) return level;
  return '';
}

function extractSkills(raw: RawJob): string[] {
  const hay = ` ${raw.title.toLowerCase()} ${raw.description.toLowerCase()} `;
  const hits = new Set<string>();
  for (const s of SKILL_LEXICON) {
    if (hay.includes(` ${s} `) || hay.includes(`${s},`) || hay.includes(`${s}.`)) hits.add(s);
  }
  return [...hits].slice(0, 12);
}

/** 0–100 completeness/quality: has salary, description depth, recency, logo. */
function qualityScore(raw: RawJob, hasSalary: boolean, freshness: string): number {
  let q = 40;
  if (hasSalary) q += 20;
  if (raw.description.length > 400) q += 15;
  else if (raw.description.length > 120) q += 7;
  if (raw.companyLogo) q += 5;
  if (raw.company) q += 5;
  if (freshness === 'today' || freshness === 'this_week') q += 10;
  else if (freshness === 'this_month') q += 5;
  return Math.max(0, Math.min(100, q));
}

/** Confidence blends source priority with record completeness. */
function confidenceScore(priority: number, quality: number): number {
  // priority is 0–100 (provider rank); quality 0–100. Weight source 60/40.
  return Math.round(Math.max(0, Math.min(100, priority * 0.6 + quality * 0.4)));
}

/**
 * Build a canonical FinatriXJob from a provider's raw record. Pure and
 * deterministic; the same raw record always yields the same job.
 */
export function normalize(
  provider: string,
  priority: number,
  input: RawJob,
  now = Date.now(),
): FinatriXJob | null {
  // Sanitise ONCE, at the trust boundary, then derive everything from the clean
  // record. Provider descriptions arrive as markup and their "posted" fields are
  // often human text ("2 days ago"); doing this here means every downstream
  // signal — skills, work mode, quality, freshness, dedupe similarity — is
  // computed on the same clean input, and nothing unclean can reach the wire.
  const raw: RawJob = {
    ...input,
    description: stripHtml(input.description, 20_000),
    postedDate: toPostedDate(input.postedDate, now),
    closesAt: iso(input.closesAt ?? null),
  };

  const applyUrl = safeUrl(raw.applyUrl);
  const title = str(raw.title, 300).trim();
  // A job with no title or no safe apply link is not usable — drop it.
  if (!title || !applyUrl) return null;

  const workMode = deriveWorkMode(raw);
  const postedDate = raw.postedDate;
  const freshness = freshnessOf(postedDate, now);
  const hasSalary = raw.salaryMin != null || raw.salaryMax != null;
  const quality = qualityScore(raw, hasSalary, freshness);
  const confidence = confidenceScore(priority, quality);
  const remoteProb = remoteProbability(workMode, raw);

  const job: FinatriXJob = {
    id: `${provider}:${str(raw.externalId, 200) || normToken(`${raw.company} ${title}`)}`,
    title,
    company: str(raw.company, 200).trim(),
    location: str(raw.location, 200).trim(),
    salary: {
      min: raw.salaryMin,
      max: raw.salaryMax,
      currency: str(raw.currency, 8),
      period: str(raw.salaryPeriod ?? '', 12),
      estimated: false,
    },
    description: raw.description,
    employmentType: str(raw.employmentType, 40).toLowerCase(),
    experience: deriveExperience(raw),
    skills: extractSkills(raw),
    applyUrl,
    companyLogo: raw.companyLogo ? safeUrl(raw.companyLogo) || null : null,
    provider,
    confidence,
    postedDate,
    freshness,
    via: str(raw.via, 80) || 'source',
    country: str(raw.country, 8),
    workMode,
    closesAt: raw.closesAt ?? null,
    industry: str(raw.industry ?? '', 120),
    quality,
    remoteProbability: remoteProb,
    badges: [],
    metadata: raw.metadata ?? {},
  };
  job.badges = computeBadges(job);
  return job;
}

/**
 * Map a legacy snake_case NormalizedJob (the existing providers' output) into a
 * RawJob so the four incumbent providers (adzuna/jsearch/jooble/remotive) run
 * unchanged under the new interface — no functionality is removed.
 */
export function fromNormalized(nj: {
  external_id?: string; title?: string; company?: string; description?: string;
  salary_min?: number | null; salary_max?: number | null; currency?: string;
  location?: string; country?: string; work_mode?: string; employment_type?: string;
  apply_url?: string; posted_at?: string | null; closes_at?: string | null;
  industry?: string; via?: string;
}): RawJob {
  return {
    externalId: nj.external_id ?? '',
    title: nj.title ?? '',
    company: nj.company ?? '',
    description: nj.description ?? '',
    salaryMin: nj.salary_min ?? null,
    salaryMax: nj.salary_max ?? null,
    currency: nj.currency ?? '',
    location: nj.location ?? '',
    country: nj.country ?? '',
    workMode: nj.work_mode ?? '',
    employmentType: nj.employment_type ?? '',
    applyUrl: nj.apply_url ?? '',
    companyLogo: null,
    postedDate: nj.posted_at ?? null,
    closesAt: nj.closes_at ?? null,
    industry: nj.industry ?? '',
    via: nj.via ?? 'source',
    metadata: {},
  };
}

/** Overlay the user's skills to (truthfully) set the skills_matched badge. */
export function applySkillMatch(job: FinatriXJob, userSkills: string[]): FinatriXJob {
  if (!userSkills.length || !job.skills.length) return job;
  const set = new Set(userSkills.map((s) => s.toLowerCase()));
  const overlap = job.skills.some((s) => set.has(s.toLowerCase()));
  if (!overlap) return job;
  const badges: BadgeKey[] = job.badges.includes('skills_matched')
    ? job.badges
    : [...job.badges, 'skills_matched'];
  return { ...job, badges };
}

/** Project a FinatriXJob to the legacy wire shape (superset — nothing lost). */
export function toWireJob(job: FinatriXJob): WireJob {
  return {
    source: job.provider,
    via: job.via,
    external_id: job.id.split(':').slice(1).join(':'),
    company: job.company,
    title: job.title,
    description: job.description,
    salary_min: job.salary.min,
    salary_max: job.salary.max,
    currency: job.salary.currency,
    location: job.location,
    country: job.country,
    work_mode: job.workMode,
    employment_type: job.employmentType,
    apply_url: job.applyUrl,
    posted_at: job.postedDate,
    closes_at: job.closesAt,
    industry: job.industry,
    company_logo: job.companyLogo,
    confidence: job.confidence,
    freshness: job.freshness,
    skills: job.skills,
    experience: job.experience,
    quality: job.quality,
    remote_probability: job.remoteProbability,
    badges: job.badges,
  };
}
