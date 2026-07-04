/**
 * Validators for Phase 2 AI responses. Same contract as Phase 1 validate.ts:
 * nothing from the model is trusted — every payload is rebuilt field-by-field
 * with sanitized strings, bounded arrays and clamped scores, and an unusable
 * payload throws a retryable CareersError instead of leaking downstream.
 */

import type {
  CareerRoadmap,
  CategorizedSkill,
  CertificationRec,
  CoachInsight,
  CoverLetterSections,
  InsightPriority,
  InterviewFeedback,
  InterviewQuestion,
  JobAnalysis,
  JobExtraction,
  JobIntelligence,
  JobKeywordReport,
  KeywordTier,
  LearningItem,
  MatchInsights,
  MatchRecommendation,
  PrioritizedItem,
  StarAnswer,
  TailoringReport,
  WeightedKeyword,
} from '../types/jobs';
import { KEYWORD_TIERS, QUESTION_CATEGORIES, QUESTION_DIFFICULTIES } from '../types/jobs';
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

const PRIORITIES: readonly InsightPriority[] = ['high', 'medium', 'low'];

function asPriority(v: unknown): InsightPriority {
  const s = sanitizeField(v, 12).toLowerCase();
  return (PRIORITIES as readonly string[]).includes(s) ? (s as InsightPriority) : 'medium';
}

function prioritized(v: unknown, max = 8): PrioritizedItem[] {
  return asArray(v).slice(0, max).map((item) => {
    const d = asDict(item);
    // Tolerate the model returning bare strings instead of objects.
    const text = typeof item === 'string' ? sanitizeField(item, 300) : sanitizeField(d.text, 300);
    return { text, priority: asPriority(d.priority) };
  }).filter((p) => p.text);
}

// ─────────────────────────── job analysis ───────────────────────────

function validateExtraction(v: unknown): JobExtraction {
  const d = asDict(v);
  return {
    company: sanitizeField(d.company, 200),
    title: sanitizeField(d.title, 200),
    industry: sanitizeField(d.industry, 120),
    department: sanitizeField(d.department, 120),
    employmentType: sanitizeField(d.employmentType, 60),
    experienceRequired: sanitizeField(d.experienceRequired, 160),
    education: sanitizeField(d.education, 200),
    certifications: sanitizeStringArray(d.certifications, 15, 120),
    responsibilities: sanitizeStringArray(d.responsibilities, 15, 300),
    dailyActivities: sanitizeStringArray(d.dailyActivities, 12, 300),
    leadership: sanitizeProse(d.leadership, 400),
    communication: sanitizeProse(d.communication, 400),
    compliance: sanitizeProse(d.compliance, 400),
    reportingTo: sanitizeField(d.reportingTo, 120),
    kpis: sanitizeStringArray(d.kpis, 10, 200),
    preferredCandidate: sanitizeProse(d.preferredCandidate, 500),
    niceToHave: sanitizeStringArray(d.niceToHave, 12, 160),
    salaryInfo: sanitizeField(d.salaryInfo, 160),
    benefits: sanitizeStringArray(d.benefits, 15, 160),
    workMode: sanitizeField(d.workMode, 40).toLowerCase(),
    visaSponsorship: sanitizeField(d.visaSponsorship, 60),
    travel: sanitizeField(d.travel, 120),
    location: sanitizeField(d.location, 160),
    careerProgression: sanitizeProse(d.careerProgression, 400),
  };
}

function validateIntelligence(v: unknown): JobIntelligence {
  const d = asDict(v);
  return {
    difficulty: clampScore(d.difficulty),
    suitsGraduates: d.suitsGraduates === true,
    suitsExperienced: d.suitsExperienced !== false,
    workload: sanitizeField(d.workload, 200),
    workLifeBalance: sanitizeField(d.workLifeBalance, 200),
    learningOpportunities: sanitizeField(d.learningOpportunities, 200),
    promotionOpportunities: sanitizeField(d.promotionOpportunities, 200),
    careerStability: sanitizeField(d.careerStability, 200),
    interviewDifficulty: sanitizeField(d.interviewDifficulty, 200),
    competition: sanitizeField(d.competition, 200),
    atsCompetitiveness: sanitizeField(d.atsCompetitiveness, 200),
    summary: sanitizeProse(d.summary, 600),
  };
}

function validateSkillList(v: unknown): CategorizedSkill[] {
  return asArray(v).slice(0, 60).map((item) => {
    const d = asDict(item);
    return {
      name: sanitizeField(d.name, 80),
      category: sanitizeField(d.category, 40).toLowerCase() || 'other',
      required: d.required !== false,
      weight: clampScore(d.weight) || 50,
    };
  }).filter((s) => s.name);
}

export function validateKeywords(v: unknown): JobKeywordReport {
  const keywords: WeightedKeyword[] = asArray(v).slice(0, 40).map((item) => {
    const d = asDict(item);
    const tier = sanitizeField(d.tier, 20).toLowerCase();
    return {
      keyword: sanitizeField(d.keyword, 80),
      tier: (KEYWORD_TIERS as readonly string[]).includes(tier) ? (tier as KeywordTier) : 'secondary',
      weight: clampScore(d.weight) || 50,
      frequency: Math.max(1, Math.min(99, Math.round(Number(d.frequency)) || 1)),
    };
  }).filter((k) => k.keyword);
  keywords.sort((a, b) => b.weight - a.weight);
  return { keywords };
}

export function validateJobAnalysis(raw: Dict): { analysis: JobAnalysis; keywords: JobKeywordReport } {
  const analysis: JobAnalysis = {
    extraction: validateExtraction(raw.extraction),
    intelligence: validateIntelligence(raw.intelligence),
    skills: validateSkillList(raw.skills),
  };
  if (!analysis.extraction.title && !analysis.skills.length && !analysis.intelligence.summary) {
    throw new CareersError('ai-response', 'The AI could not analyse this job description. Please retry.');
  }
  return { analysis, keywords: validateKeywords(raw.keywords) };
}

// ─────────────────────────── match ───────────────────────────

/** The AI half of the match scores; deterministic categories merge in later. */
export interface AiMatchPart {
  scores: Record<string, number>;
  insights: MatchInsights;
}

export function validateAiMatch(raw: Dict): AiMatchPart {
  const s = asDict(raw.scores);
  const scores: Record<string, number> = {};
  for (const id of ['technical', 'experience', 'education', 'certifications', 'ats',
    'careerDna', 'culture', 'leadership', 'communication', 'projects']) {
    scores[id] = clampScore(s[id]);
  }
  const anyScore = Object.values(scores).some((v) => v > 0);
  if (!anyScore) {
    throw new CareersError('ai-response', 'The AI returned an empty match report. Please retry.');
  }
  const i = asDict(raw.insights);
  const recommendations: MatchRecommendation[] = asArray(i.recommendations).slice(0, 10).map((item) => {
    const d = asDict(item);
    const action = sanitizeField(d.action, 12).toLowerCase();
    return {
      action: (['add', 'remove', 'rewrite', 'improve', 'highlight'] as const).includes(
        action as 'add') ? (action as MatchRecommendation['action']) : 'improve',
      target: sanitizeField(d.target, 200),
      detail: sanitizeProse(d.detail, 400),
      reason: sanitizeProse(d.reason, 400),
      priority: asPriority(d.priority),
    };
  }).filter((r) => r.target || r.detail);
  const insights: MatchInsights = {
    strengths: prioritized(i.strengths),
    weaknesses: prioritized(i.weaknesses),
    missingSkills: prioritized(i.missingSkills),
    missingKeywords: prioritized(i.missingKeywords),
    missingCertifications: prioritized(i.missingCertifications),
    missingProjects: prioritized(i.missingProjects),
    missingLeadership: prioritized(i.missingLeadership),
    missingQuantifiedResults: prioritized(i.missingQuantifiedResults),
    missingAtsSections: prioritized(i.missingAtsSections),
    recommendations,
    bestResumeVersion: sanitizeField(i.bestResumeVersion, 120),
  };
  return { scores, insights };
}

// ─────────────────────────── tailoring ───────────────────────────

export function validateTailoring(raw: Dict): TailoringReport {
  const sections = asArray(raw.sections).slice(0, 12).map((item) => {
    const d = asDict(item);
    return {
      section: sanitizeField(d.section, 40).toLowerCase() || 'summary',
      original: sanitizeProse(d.original, 1_500),
      improved: sanitizeProse(d.improved, 2_000),
      addedKeywords: sanitizeStringArray(d.addedKeywords, 15, 60),
      reason: sanitizeProse(d.reason, 400),
    };
  }).filter((sec) => sec.improved);
  if (!sections.length) {
    throw new CareersError('ai-response', 'The AI returned no tailoring suggestions. Please retry.');
  }
  return {
    summary: sanitizeProse(raw.summary, 1_200),
    sections,
    addedKeywords: sanitizeStringArray(raw.addedKeywords, 30, 60),
    formattingSuggestions: sanitizeStringArray(raw.formattingSuggestions, 10, 300),
  };
}

// ─────────────────────────── cover letters ───────────────────────────

export function validateCoverLetter(raw: Dict): CoverLetterSections {
  const sections: CoverLetterSections = {
    opening: sanitizeProse(raw.opening, 500),
    introduction: sanitizeProse(raw.introduction, 700),
    whyCompany: sanitizeProse(raw.whyCompany, 700),
    whyRole: sanitizeProse(raw.whyRole, 700),
    relevantExperience: sanitizeProse(raw.relevantExperience, 1_200),
    achievements: sanitizeProse(raw.achievements, 900),
    closing: sanitizeProse(raw.closing, 500),
    callToAction: sanitizeProse(raw.callToAction, 400),
    signature: sanitizeField(raw.signature, 120),
  };
  const filled = Object.values(sections).filter(Boolean).length;
  if (filled < 4) {
    throw new CareersError('ai-response', 'The AI returned an incomplete cover letter. Please retry.');
  }
  return sections;
}

/** Flatten sections to the editable plain-text letter body. */
export function coverLetterText(sections: CoverLetterSections): string {
  return [
    sections.opening, sections.introduction, sections.whyCompany, sections.whyRole,
    sections.relevantExperience, sections.achievements, sections.closing,
    sections.callToAction, sections.signature,
  ].filter(Boolean).join('\n\n');
}

// ─────────────────────────── interviews ───────────────────────────

export function validateQuestions(raw: Dict): InterviewQuestion[] {
  const questions = asArray(raw.questions).slice(0, 25).map((item, idx) => {
    const d = asDict(item);
    const category = sanitizeField(d.category, 20).toLowerCase();
    const difficulty = sanitizeField(d.difficulty, 10).toLowerCase();
    return {
      id: `q-${idx + 1}`,
      category: (QUESTION_CATEGORIES as readonly string[]).includes(category)
        ? (category as InterviewQuestion['category']) : 'behavioural',
      question: sanitizeProse(d.question, 500),
      guidance: sanitizeProse(d.guidance, 600),
      modelAnswer: sanitizeProse(d.modelAnswer, 1_200),
      difficulty: (QUESTION_DIFFICULTIES as readonly string[]).includes(difficulty)
        ? (difficulty as InterviewQuestion['difficulty']) : 'medium',
    };
  }).filter((q) => q.question);
  if (questions.length < 3) {
    throw new CareersError('ai-response', 'The AI returned too few interview questions. Please retry.');
  }
  return questions;
}

export function validateStar(raw: Dict): StarAnswer {
  const star: StarAnswer = {
    situation: sanitizeProse(raw.situation, 800),
    task: sanitizeProse(raw.task, 600),
    action: sanitizeProse(raw.action, 1_000),
    result: sanitizeProse(raw.result, 800),
    reflection: sanitizeProse(raw.reflection, 600),
    confidence: clampScore(raw.confidence),
    improvements: sanitizeStringArray(raw.improvements, 8, 300),
  };
  if (!star.situation && !star.action) {
    throw new CareersError('ai-response', 'The AI could not build a STAR answer. Please retry.');
  }
  return star;
}

export function validateInterviewFeedback(raw: Dict): InterviewFeedback {
  const s = asDict(raw.scores);
  const feedback: InterviewFeedback = {
    overall: clampScore(raw.overall),
    scores: {
      confidence: clampScore(s.confidence),
      communication: clampScore(s.communication),
      technical: clampScore(s.technical),
      leadership: clampScore(s.leadership),
      star: clampScore(s.star),
      behavioural: clampScore(s.behavioural),
      structure: clampScore(s.structure),
      problemSolving: clampScore(s.problemSolving),
      grammar: clampScore(s.grammar),
      fluency: clampScore(s.fluency),
    },
    strongAreas: sanitizeStringArray(raw.strongAreas, 8, 300),
    weakAreas: sanitizeStringArray(raw.weakAreas, 8, 300),
    suggestions: sanitizeStringArray(raw.suggestions, 10, 400),
    practicePlan: sanitizeStringArray(raw.practicePlan, 8, 300),
  };
  if (!feedback.overall && !Object.values(feedback.scores).some((v) => v > 0)) {
    throw new CareersError('ai-response', 'The AI returned empty interview feedback. Please retry.');
  }
  if (!feedback.overall) {
    const vals = Object.values(feedback.scores);
    feedback.overall = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  return feedback;
}

// ─────────────────────────── coach ───────────────────────────

export interface CoachAiPart {
  healthSuggestions: string[];
  insights: CoachInsight[];
  roadmap: CareerRoadmap | null;
  learning: LearningItem[];
  certifications: CertificationRec[];
  promotionReadiness: number;
  roleReadiness: number;
  marketTrends: string;
  salaryForecast: string;
}

const LEARNING_KINDS = ['course', 'certification', 'book', 'video', 'docs', 'practice'] as const;
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;

export function validateCoach(raw: Dict): CoachAiPart {
  const r = asDict(raw.roadmap);
  const steps = asArray(r.steps).slice(0, 6).map((item) => {
    const d = asDict(item);
    return {
      title: sanitizeField(d.title, 160),
      months: Math.max(0, Math.min(60, Math.round(Number(d.months)) || 0)),
      skills: sanitizeStringArray(d.skills, 10, 80),
      certifications: sanitizeStringArray(d.certifications, 6, 120),
      projects: sanitizeStringArray(d.projects, 6, 200),
      courses: sanitizeStringArray(d.courses, 6, 160),
      salaryRange: sanitizeField(d.salaryRange, 80),
      demand: sanitizeField(d.demand, 120),
    };
  }).filter((step) => step.title);
  const roadmap: CareerRoadmap | null = steps.length
    ? {
        title: sanitizeField(r.title, 160),
        targetRole: sanitizeField(r.targetRole, 120),
        timeline: sanitizeField(r.timeline, 80),
        steps,
      }
    : null;

  const learning: LearningItem[] = asArray(raw.learning).slice(0, 10).map((item) => {
    const d = asDict(item);
    const kind = sanitizeField(d.kind, 20).toLowerCase();
    const diff = sanitizeField(d.difficulty, 20).toLowerCase();
    return {
      name: sanitizeField(d.name, 160),
      kind: (LEARNING_KINDS as readonly string[]).includes(kind) ? (kind as LearningItem['kind']) : 'course',
      provider: sanitizeField(d.provider, 80),
      difficulty: (DIFFICULTIES as readonly string[]).includes(diff) ? (diff as LearningItem['difficulty']) : 'intermediate',
      hours: Math.max(0, Math.min(2_000, Math.round(Number(d.hours)) || 0)),
      priority: asPriority(d.priority),
      impact: sanitizeProse(d.impact, 300),
      done: false,
    };
  }).filter((l) => l.name);

  const certifications: CertificationRec[] = asArray(raw.certifications).slice(0, 8).map((item) => {
    const d = asDict(item);
    return {
      name: sanitizeField(d.name, 120),
      difficulty: sanitizeField(d.difficulty, 60),
      cost: sanitizeField(d.cost, 60),
      duration: sanitizeField(d.duration, 60),
      recognition: sanitizeField(d.recognition, 160),
      salaryImpact: sanitizeField(d.salaryImpact, 120),
      demand: sanitizeField(d.demand, 120),
      priority: asPriority(d.priority),
      reason: sanitizeProse(d.reason, 400),
    };
  }).filter((c) => c.name);

  const insights = asArray(raw.insights).slice(0, 10).map((item) => {
    const d = asDict(item);
    const text = typeof item === 'string' ? sanitizeProse(item, 400) : sanitizeProse(d.text, 400);
    return { text, priority: asPriority(d.priority) };
  }).filter((ins) => ins.text);

  if (!insights.length && !roadmap && !learning.length) {
    throw new CareersError('ai-response', 'The AI coach returned an empty report. Please retry.');
  }

  return {
    healthSuggestions: sanitizeStringArray(raw.healthSuggestions, 8, 300),
    insights,
    roadmap,
    learning,
    certifications,
    promotionReadiness: clampScore(raw.promotionReadiness),
    roleReadiness: clampScore(raw.roleReadiness),
    marketTrends: sanitizeProse(raw.marketTrends, 800),
    salaryForecast: sanitizeProse(raw.salaryForecast, 500),
  };
}

export function validateAssistantAnswer(raw: Dict): { answer: string; references: string[] } {
  const answer = sanitizeProse(raw.answer, 2_000);
  if (!answer) {
    throw new CareersError('ai-response', 'The assistant returned an empty answer. Please retry.');
  }
  return { answer, references: sanitizeStringArray(raw.references, 10, 200) };
}
