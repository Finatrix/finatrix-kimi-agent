/**
 * AI response validation. The model's JSON is never trusted: every payload is
 * rebuilt field-by-field into our typed shapes, with strings sanitized,
 * arrays bounded, and scores clamped to 0–100. Anything malformed simply
 * becomes an empty/default value rather than an exception deep in the UI.
 */

import type {
  ATSReport,
  AtsIssue,
  AtsSeverity,
  CareerDNA,
  CareerInsights,
  CertificationItem,
  EducationItem,
  ExperienceItem,
  ParsedResume,
  PersonalInfo,
  ProjectItem,
  ResumeScoreReport,
  ScoreCategory,
  SkillGroups,
} from '../types';
import { ATS_CHECK_CATEGORIES, RESUME_SCORE_CATEGORIES } from '../constants';
import {
  clampScore,
  sanitizeField,
  sanitizeProse,
  sanitizeStringArray,
} from '../utils/sanitize';
import { CareersError } from '../utils/errors';

type Dict = Record<string, unknown>;

function asDict(v: unknown): Dict {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Dict) : {};
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asBool(v: unknown): boolean {
  return v === true;
}

function asNumberOrNull(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

/**
 * Pull a JSON object out of a model completion. Handles raw JSON, fenced
 * ```json blocks, and stray prose around the object.
 */
export function extractJson(content: string): Dict {
  const trimmed = content.trim();
  const candidates: string[] = [trimmed];
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fence) candidates.unshift(fence[1].trim());
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1));
  for (const c of candidates) {
    try {
      const parsed: unknown = JSON.parse(c);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Dict;
    } catch {
      /* try the next candidate */
    }
  }
  throw new CareersError('ai-response', 'The AI returned an unreadable answer. Please retry the analysis.');
}

// ─────────────────────────── parsed resume ───────────────────────────

function validatePersonal(v: unknown): PersonalInfo {
  const d = asDict(v);
  return {
    name: sanitizeField(d.name, 120),
    email: sanitizeField(d.email, 200),
    phone: sanitizeField(d.phone, 40),
    location: sanitizeField(d.location, 160),
    linkedin: sanitizeField(d.linkedin, 300),
    github: sanitizeField(d.github, 300),
    portfolio: sanitizeField(d.portfolio, 300),
  };
}

function validateExperience(v: unknown): ExperienceItem[] {
  return asArray(v).slice(0, 30).map((item) => {
    const d = asDict(item);
    return {
      company: sanitizeField(d.company, 160),
      title: sanitizeField(d.title, 160),
      location: sanitizeField(d.location, 160),
      startDate: sanitizeField(d.startDate, 40),
      endDate: sanitizeField(d.endDate, 40),
      isCurrent: asBool(d.isCurrent),
      summary: sanitizeProse(d.summary, 1_000),
      highlights: sanitizeStringArray(d.highlights, 12, 400),
    };
  }).filter((e) => e.company || e.title);
}

function validateEducation(v: unknown): EducationItem[] {
  return asArray(v).slice(0, 15).map((item) => {
    const d = asDict(item);
    return {
      institution: sanitizeField(d.institution, 200),
      degree: sanitizeField(d.degree, 160),
      field: sanitizeField(d.field, 160),
      startDate: sanitizeField(d.startDate, 40),
      endDate: sanitizeField(d.endDate, 40),
      grade: sanitizeField(d.grade, 60),
    };
  }).filter((e) => e.institution || e.degree);
}

function validateProjects(v: unknown): ProjectItem[] {
  return asArray(v).slice(0, 20).map((item) => {
    const d = asDict(item);
    return {
      name: sanitizeField(d.name, 160),
      description: sanitizeProse(d.description, 800),
      technologies: sanitizeStringArray(d.technologies, 20, 80),
      url: sanitizeField(d.url, 300),
    };
  }).filter((p) => p.name);
}

function validateCertifications(v: unknown): CertificationItem[] {
  return asArray(v).slice(0, 20).map((item) => {
    const d = asDict(item);
    return {
      name: sanitizeField(d.name, 200),
      issuer: sanitizeField(d.issuer, 160),
      issueDate: sanitizeField(d.issueDate, 40),
      expiryDate: sanitizeField(d.expiryDate, 40),
      credentialId: sanitizeField(d.credentialId, 120),
    };
  }).filter((c) => c.name);
}

function validateSkills(v: unknown): SkillGroups {
  const d = asDict(v);
  return {
    technical: sanitizeStringArray(d.technical, 60, 80),
    soft: sanitizeStringArray(d.soft, 40, 80),
    business: sanitizeStringArray(d.business, 40, 80),
    leadership: sanitizeStringArray(d.leadership, 40, 80),
    tools: sanitizeStringArray(d.tools, 60, 80),
    frameworks: sanitizeStringArray(d.frameworks, 60, 80),
    programmingLanguages: sanitizeStringArray(d.programmingLanguages, 40, 60),
    cloudPlatforms: sanitizeStringArray(d.cloudPlatforms, 30, 80),
    databases: sanitizeStringArray(d.databases, 30, 80),
  };
}

function validateInsights(v: unknown): CareerInsights {
  const d = asDict(v);
  return {
    careerGaps: sanitizeStringArray(d.careerGaps, 10, 300),
    promotionHistory: sanitizeProse(d.promotionHistory, 600),
    employmentStability: sanitizeProse(d.employmentStability, 600),
    jobSwitchingPattern: sanitizeProse(d.jobSwitchingPattern, 600),
    careerProgression: sanitizeProse(d.careerProgression, 600),
  };
}

export function validateParsedResume(raw: Dict): ParsedResume {
  const parsed: ParsedResume = {
    personal: validatePersonal(raw.personal),
    summary: sanitizeProse(raw.summary, 2_000),
    careerObjective: sanitizeProse(raw.careerObjective, 1_000),
    yearsOfExperience: asNumberOrNull(raw.yearsOfExperience),
    currentDesignation: sanitizeField(raw.currentDesignation, 160),
    currentIndustry: sanitizeField(raw.currentIndustry, 120),
    experience: validateExperience(raw.experience),
    education: validateEducation(raw.education),
    skills: validateSkills(raw.skills),
    projects: validateProjects(raw.projects),
    certifications: validateCertifications(raw.certifications),
    languages: sanitizeStringArray(raw.languages, 20, 60),
    achievements: sanitizeStringArray(raw.achievements, 20, 400),
    awards: sanitizeStringArray(raw.awards, 20, 300),
    publications: sanitizeStringArray(raw.publications, 20, 400),
    volunteerWork: sanitizeStringArray(raw.volunteerWork, 15, 400),
    publicSpeaking: sanitizeStringArray(raw.publicSpeaking, 15, 400),
    research: sanitizeStringArray(raw.research, 15, 400),
    patents: sanitizeStringArray(raw.patents, 10, 400),
    insights: validateInsights(raw.insights),
  };
  const hasAnything =
    parsed.personal.name || parsed.personal.email || parsed.experience.length ||
    parsed.education.length || parsed.skills.technical.length || parsed.summary;
  if (!hasAnything) {
    throw new CareersError('ai-response', 'The AI could not find resume content in this file. Please retry, or check the file.');
  }
  return parsed;
}

// ─────────────────────────── Career DNA ───────────────────────────

export function validateCareerDNA(raw: Dict): CareerDNA {
  const traits = asArray(raw.traits).slice(0, 16).map((t) => {
    const d = asDict(t);
    return { name: sanitizeField(d.name, 60), confidence: clampScore(d.confidence) };
  }).filter((t) => t.name);
  const dna: CareerDNA = {
    traits,
    strengths: sanitizeStringArray(raw.strengths, 10, 300),
    weaknesses: sanitizeStringArray(raw.weaknesses, 10, 300),
    recommendedIndustries: sanitizeStringArray(raw.recommendedIndustries, 10, 80),
    suitableRoles: sanitizeStringArray(raw.suitableRoles, 10, 120),
    personalitySummary: sanitizeProse(raw.personalitySummary, 1_500),
  };
  if (!dna.traits.length && !dna.personalitySummary) {
    throw new CareersError('ai-response', 'The AI could not build a Career DNA profile. Please retry the analysis.');
  }
  return dna;
}

// ─────────────────────────── scores ───────────────────────────

function validateCategories(
  raw: unknown,
  expected: readonly { id: string; label: string }[]
): ScoreCategory[] {
  const byId = new Map<string, Dict>();
  for (const item of asArray(raw)) {
    const d = asDict(item);
    const id = sanitizeField(d.id, 40);
    if (id) byId.set(id, d);
  }
  // Every rubric category is always present, defaulting to 0 + no suggestion,
  // so the UI never has holes even if the model skipped one.
  return expected.map(({ id, label }) => {
    const d = byId.get(id) ?? {};
    return {
      id,
      label,
      score: clampScore(d.score),
      suggestion: sanitizeProse(d.suggestion, 500),
    };
  });
}

export function validateResumeScore(raw: Dict): ResumeScoreReport {
  const categories = validateCategories(raw.categories, RESUME_SCORE_CATEGORIES);
  const scored = categories.filter((c) => c.score > 0);
  if (!scored.length) {
    throw new CareersError('ai-response', 'The AI returned an empty score. Please retry the analysis.');
  }
  const fallbackOverall = Math.round(
    categories.reduce((sum, c) => sum + c.score, 0) / categories.length
  );
  return {
    overall: clampScore(raw.overall) || fallbackOverall,
    categories,
    improvements: sanitizeStringArray(raw.improvements, 12, 400),
  };
}

const SEVERITIES: readonly AtsSeverity[] = ['low', 'medium', 'high', 'critical'];

export function validateATSReport(raw: Dict): ATSReport {
  const checks = validateCategories(raw.checks, ATS_CHECK_CATEGORIES);
  const issues: AtsIssue[] = asArray(raw.issues).slice(0, 25).map((item, i) => {
    const d = asDict(item);
    const sev = sanitizeField(d.severity, 20).toLowerCase();
    return {
      id: sanitizeField(d.id, 60) || `issue-${i + 1}`,
      title: sanitizeField(d.title, 160),
      detail: sanitizeProse(d.detail, 600),
      severity: (SEVERITIES as readonly string[]).includes(sev) ? (sev as AtsSeverity) : 'medium',
      fix: sanitizeProse(d.fix, 600),
      priority: Math.min(99, Math.max(1, Math.round(Number(d.priority)) || i + 1)),
    };
  }).filter((iss) => iss.title);
  issues.sort((a, b) => a.priority - b.priority);
  const scored = checks.filter((c) => c.score > 0);
  if (!scored.length) {
    throw new CareersError('ai-response', 'The AI returned an empty ATS report. Please retry the analysis.');
  }
  const fallbackOverall = Math.round(checks.reduce((s, c) => s + c.score, 0) / checks.length);
  return {
    overall: clampScore(raw.overall) || fallbackOverall,
    checks,
    issues,
  };
}
