/**
 * FinatriX Careers Phase 2 — shared types for the Job Intelligence Platform:
 * jobs + search, AI job analysis, resume↔job matching, applications CRM,
 * companies, cover letters, interview prep and the career coach. Database
 * row shapes mirror supabase/careers_phase2_schema.sql.
 */

import type { CareerDNA } from './index';

// ─────────────────────────── search ───────────────────────────

export interface JobSearchParams {
  query: string;
  location: string;
  country: string;
  remoteOnly: boolean;
  workMode: '' | 'remote' | 'hybrid' | 'onsite';
  employmentType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  industry: string;
  experience: string;
  visaSponsorship: boolean;
  freshersOnly: boolean;
  providers: string[];
  page: number;
}

export const DEFAULT_SEARCH_PARAMS: JobSearchParams = {
  query: '',
  location: '',
  country: 'in',
  remoteOnly: false,
  workMode: '',
  employmentType: '',
  salaryMin: null,
  salaryMax: null,
  industry: '',
  experience: '',
  visaSponsorship: false,
  freshersOnly: false,
  providers: [],
  page: 0,
};

/** Canonical job shape returned by the careers-jobs edge function. */
export interface NormalizedJob {
  source: string;
  via: string;
  external_id: string;
  company: string;
  title: string;
  description: string;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  location: string;
  country: string;
  work_mode: string;
  employment_type: string;
  apply_url: string;
  posted_at: string | null;
  closes_at: string | null;
  industry: string;
  // ── Additive enrichment from the multi-provider search backend. Every field
  //    is optional so this remains a strict superset of the original contract:
  //    older code ignores them, newer code (badges, logo) uses them. ──
  /** Truthful, earned badge keys (see FRESHNESS_BADGES). Never asserts unverified trust. */
  badges?: string[];
  /** 0–100 source confidence (provider priority + record completeness). */
  confidence?: number;
  /** today | this_week | this_month | older | unknown */
  freshness?: string;
  /** Deterministically extracted skills. */
  skills?: string[];
  /** '' | entry | mid | senior | lead | exec */
  experience?: string;
  /** 0–100 completeness/quality score. */
  quality?: number;
  /** 0–1 heuristic remote-friendliness. */
  remote_probability?: number;
  /** Safe https company logo, or null. */
  company_logo?: string | null;
}

// ─────────────────────────── job rows ───────────────────────────

export interface JobRow extends NormalizedJob {
  id: string;
  user_id: string;
  responsibilities: string[];
  benefits: string[];
  skills: string[];
  experience: string;
  education: string;
  visa_sponsorship: string;
  is_saved: boolean;
  sha256: string;
  raw: Record<string, unknown> | null;
  analysis: JobAnalysis | null;
  keywords: JobKeywordReport | null;
  created_at: string;
  updated_at: string;
}

export interface JobDescriptionRow {
  id: string;
  user_id: string;
  title: string;
  company: string;
  raw_text: string;
  sha256: string;
  analysis: JobAnalysis | null;
  keywords: JobKeywordReport | null;
  job_id: string | null;
  created_at: string;
}

// ─────────────────────────── AI job analysis ───────────────────────────

export interface CategorizedSkill {
  name: string;
  category: string;   // programming | finance | risk | compliance | leadership | …
  required: boolean;
  /** 0–100 importance in this job. */
  weight: number;
}

export interface JobExtraction {
  company: string;
  title: string;
  industry: string;
  department: string;
  employmentType: string;
  experienceRequired: string;
  education: string;
  certifications: string[];
  responsibilities: string[];
  dailyActivities: string[];
  leadership: string;
  communication: string;
  compliance: string;
  reportingTo: string;
  kpis: string[];
  preferredCandidate: string;
  niceToHave: string[];
  salaryInfo: string;
  benefits: string[];
  workMode: string;
  visaSponsorship: string;
  travel: string;
  location: string;
  careerProgression: string;
}

export interface JobIntelligence {
  /** 0–100: how hard this role is to land and to do. */
  difficulty: number;
  suitsGraduates: boolean;
  suitsExperienced: boolean;
  workload: string;
  workLifeBalance: string;
  learningOpportunities: string;
  promotionOpportunities: string;
  careerStability: string;
  interviewDifficulty: string;
  competition: string;
  atsCompetitiveness: string;
  summary: string;
}

export interface JobAnalysis {
  extraction: JobExtraction;
  intelligence: JobIntelligence;
  skills: CategorizedSkill[];
}

export const KEYWORD_TIERS = ['primary', 'secondary', 'hidden', 'industry', 'recruiter', 'role'] as const;
export type KeywordTier = (typeof KEYWORD_TIERS)[number];

export interface WeightedKeyword {
  keyword: string;
  tier: KeywordTier;
  /** 0–100 importance. */
  weight: number;
  frequency: number;
}

export interface JobKeywordReport {
  keywords: WeightedKeyword[];
}

// ─────────────────────────── matching ───────────────────────────

export const MATCH_CATEGORIES = [
  { id: 'technical', label: 'Technical Match', ai: true },
  { id: 'experience', label: 'Experience Match', ai: true },
  { id: 'education', label: 'Education Match', ai: true },
  { id: 'certifications', label: 'Certification Match', ai: true },
  { id: 'ats', label: 'ATS Match', ai: true },
  { id: 'careerDna', label: 'Career DNA Match', ai: true },
  { id: 'culture', label: 'Culture Match', ai: true },
  { id: 'leadership', label: 'Leadership Match', ai: true },
  { id: 'communication', label: 'Communication Match', ai: true },
  { id: 'projects', label: 'Project Match', ai: true },
  { id: 'keywords', label: 'Keyword Match', ai: false },   // deterministic
  { id: 'industry', label: 'Industry Match', ai: false },  // deterministic
  { id: 'location', label: 'Location Match', ai: false },  // deterministic
  { id: 'salary', label: 'Salary Match', ai: false },      // deterministic
] as const;
export type MatchCategoryId = (typeof MATCH_CATEGORIES)[number]['id'];

export type MatchScores = Record<MatchCategoryId, number>;

export type InsightPriority = 'high' | 'medium' | 'low';

export interface PrioritizedItem {
  text: string;
  priority: InsightPriority;
}

export interface MatchRecommendation {
  action: 'add' | 'remove' | 'rewrite' | 'improve' | 'highlight';
  target: string;   // what to change
  detail: string;   // how
  reason: string;   // WHY — always populated
  priority: InsightPriority;
}

export interface MatchInsights {
  strengths: PrioritizedItem[];
  weaknesses: PrioritizedItem[];
  missingSkills: PrioritizedItem[];
  missingKeywords: PrioritizedItem[];
  missingCertifications: PrioritizedItem[];
  missingProjects: PrioritizedItem[];
  missingLeadership: PrioritizedItem[];
  missingQuantifiedResults: PrioritizedItem[];
  missingAtsSections: PrioritizedItem[];
  recommendations: MatchRecommendation[];
  bestResumeVersion: string;
}

export interface MatchReport {
  overall: number;
  scores: MatchScores;
  insights: MatchInsights;
}

export interface JobMatchRow {
  id: string;
  user_id: string;
  job_id: string | null;
  description_id: string | null;
  resume_version_id: string | null;
  overall: number;
  scores: MatchScores;
  insights: MatchInsights;
  input_sha256: string;
  created_at: string;
}

/** Traffic-light band for a 0–100 match/score value. */
export function matchBand(score: number): 'green' | 'yellow' | 'red' {
  if (score >= 70) return 'green';
  if (score >= 40) return 'yellow';
  return 'red';
}

export const DEFAULT_MATCH_THRESHOLD = 70;

// ─────────────────────────── resume tailoring ───────────────────────────

export interface TailoredSection {
  section: string;      // summary | experience | skills | projects | …
  original: string;
  improved: string;
  addedKeywords: string[];
  reason: string;
}

export interface TailoringReport {
  summary: string;
  sections: TailoredSection[];
  addedKeywords: string[];
  formattingSuggestions: string[];
}

// ─────────────────────────── applications ───────────────────────────

export const APPLICATION_STAGES = [
  'saved',
  'preparing_resume',
  'preparing_cover_letter',
  'ready_to_apply',
  'applied',
  'application_viewed',
  'recruiter_contacted',
  'phone_screening',
  'technical_assessment',
  'online_assessment',
  'behavioural_interview',
  'technical_interview',
  'panel_interview',
  'final_interview',
  'reference_check',
  'offer_received',
  'negotiating',
  'offer_accepted',
  'offer_declined',
  'rejected',
  'withdrawn',
  'archived',
] as const;
export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

export const STAGE_LABELS: Record<ApplicationStage, string> = {
  saved: 'Saved',
  preparing_resume: 'Preparing Resume',
  preparing_cover_letter: 'Preparing Cover Letter',
  ready_to_apply: 'Ready to Apply',
  applied: 'Applied',
  application_viewed: 'Application Viewed',
  recruiter_contacted: 'Recruiter Contacted',
  phone_screening: 'Phone Screening',
  technical_assessment: 'Technical Assessment',
  online_assessment: 'Online Assessment',
  behavioural_interview: 'Behavioural Interview',
  technical_interview: 'Technical Interview',
  panel_interview: 'Panel Interview',
  final_interview: 'Final Interview',
  reference_check: 'Reference Check',
  offer_received: 'Offer Received',
  negotiating: 'Negotiating',
  offer_accepted: 'Offer Accepted',
  offer_declined: 'Offer Declined',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  archived: 'Archived',
};

/** Stages that count as "in play" for analytics. */
export const ACTIVE_STAGES: readonly ApplicationStage[] = APPLICATION_STAGES.filter(
  (s) => !['offer_accepted', 'offer_declined', 'rejected', 'withdrawn', 'archived'].includes(s)
);

export const INTERVIEW_STAGES: readonly ApplicationStage[] = [
  'phone_screening', 'behavioural_interview', 'technical_interview',
  'panel_interview', 'final_interview',
];

export interface ApplicationRow {
  id: string;
  user_id: string;
  job_id: string | null;
  company_id: string | null;
  contact_id: string | null;
  resume_version_id: string | null;
  cover_letter_id: string | null;
  company_name: string;
  job_title: string;
  department: string;
  salary_text: string;
  employment_type: string;
  location: string;
  work_mode: string;
  visa_sponsorship: string;
  source: string;
  job_url: string;
  stage: ApplicationStage;
  priority: 'low' | 'medium' | 'high';
  tags: string[];
  notes: string;
  match_score: number | null;
  ats_score: number | null;
  applied_at: string | null;
  closes_at: string | null;
  interview_at: string | null;
  offer_expires_at: string | null;
  next_action_at: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApplicationHistoryRow {
  id: string;
  user_id: string;
  application_id: string;
  event: string;
  from_stage: string;
  to_stage: string;
  body: string;
  meta: Record<string, unknown>;
  created_at: string;
}

/** A derived reminder (not stored — computed from application dates). */
export interface Reminder {
  id: string;
  /** Empty string for reminders not tied to one application (e.g. resume_outdated). */
  applicationId: string;
  kind: 'deadline' | 'interview' | 'offer_expiry' | 'follow_up' | 'inactive' | 'assessment_due' | 'resume_outdated';
  title: string;
  dueAt: string;
  overdue: boolean;
}

// ─────────────────────────── companies ───────────────────────────

export interface CompanyRow {
  id: string;
  user_id: string;
  name: string;
  industry: string;
  headquarters: string;
  locations: string[];
  company_size: string;
  founded_year: number | null;
  website: string;
  linkedin_url: string;
  glassdoor_rating: number | null;
  ambitionbox_rating: number | null;
  funding_stage: string;
  revenue_range: string;
  visa_history: string;
  graduate_hiring: boolean | null;
  internship_hiring: boolean | null;
  preferred_skills: string[];
  notes: string;
  ai_summary: CompanyInsights | null;
  sha256: string;
  created_at: string;
  updated_at: string;
}

export interface CompanyInsights {
  overview: string;
  products: string[];
  businessModel: string;
  growthPotential: string;
  financialHealth: string;
  technologyStack: string[];
  culture: string;
  careerGrowth: string;
  learningOpportunities: string;
  workLifeBalance: string;
  interviewDifficulty: string;
}

export interface CompanyContactRow {
  id: string;
  user_id: string;
  company_id: string | null;
  name: string;
  email: string;
  linkedin_url: string;
  position: string;
  notes: string;
  follow_up_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────── cover letters ───────────────────────────

export const COVER_LETTER_TONES = [
  'graduate', 'experienced', 'professional', 'executive', 'formal', 'friendly',
  'big4', 'banking', 'technology', 'finance', 'risk', 'compliance', 'consulting',
  'government', 'academic', 'healthcare',
] as const;
export type CoverLetterTone = (typeof COVER_LETTER_TONES)[number] | string;

export const COVER_LETTER_LENGTHS = ['short', 'standard', 'detailed'] as const;
export type CoverLetterLength = (typeof COVER_LETTER_LENGTHS)[number];

export interface CoverLetterSections {
  opening: string;
  introduction: string;
  whyCompany: string;
  whyRole: string;
  relevantExperience: string;
  achievements: string;
  closing: string;
  callToAction: string;
  signature: string;
}

export interface CoverLetterRow {
  id: string;
  user_id: string;
  application_id: string | null;
  job_id: string | null;
  resume_version_id: string | null;
  name: string;
  company: string;
  job_title: string;
  tone: string;
  sections: CoverLetterSections;
  content_text: string;
  match_score: number | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────── interviews ───────────────────────────

export const QUESTION_CATEGORIES = [
  'behavioural', 'technical', 'role', 'company', 'industry',
  'situational', 'leadership', 'case', 'star', 'followup',
  'finance', 'risk', 'aml', 'compliance',
] as const;
export type QuestionCategory = (typeof QUESTION_CATEGORIES)[number];

export const QUESTION_DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const;
export type QuestionDifficulty = (typeof QUESTION_DIFFICULTIES)[number];

export interface InterviewQuestion {
  id: string;
  category: QuestionCategory;
  question: string;
  guidance: string;
  /** A model answer sketch, STAR-shaped where the category calls for it. */
  modelAnswer: string;
  difficulty: QuestionDifficulty;
}

export interface StarAnswer {
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection: string;
  confidence: number;   // 0–100
  improvements: string[];
}

export interface InterviewAnswer {
  questionId: string;
  text: string;
  star: StarAnswer | null;
}

export interface InterviewFeedback {
  overall: number;
  scores: {
    confidence: number;
    communication: number;
    technical: number;
    leadership: number;
    star: number;
    behavioural: number;
    structure: number;
    problemSolving: number;
    grammar: number;
    fluency: number;
  };
  strongAreas: string[];
  weakAreas: string[];
  suggestions: string[];
  practicePlan: string[];
}

export const INTERVIEW_TYPES = ['phone', 'video', 'onsite', 'technical', 'panel', 'final'] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number] | '';

export const INTERVIEW_OUTCOMES = ['pending', 'passed', 'failed', 'no_show', 'cancelled'] as const;
export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number];

export interface Interviewer {
  name: string;
  role: string;
}

export interface InterviewSessionRow {
  id: string;
  user_id: string;
  application_id: string | null;
  job_id: string | null;
  kind: 'prep' | 'mock';
  role_title: string;
  difficulty: string;
  questions: InterviewQuestion[];
  answers: InterviewAnswer[];
  feedback: InterviewFeedback | null;
  score: number | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Module 8 — Interview Workspace.
  round: string;
  interview_type: InterviewType;
  scheduled_at: string | null;
  location: string;
  meeting_link: string;
  interviewers: Interviewer[];
  recording_links: string[];
  outcome: InterviewOutcome | '';
}

// ─────────────────────────── career coach ───────────────────────────

export const HEALTH_CATEGORIES = [
  { id: 'resume', label: 'Resume Readiness' },
  { id: 'ats', label: 'ATS Readiness' },
  { id: 'activity', label: 'Job Search Progress' },
  { id: 'interview', label: 'Interview Readiness' },
  { id: 'learning', label: 'Learning Progress' },
  { id: 'market', label: 'Market Readiness' },
] as const;
export type HealthCategoryId = (typeof HEALTH_CATEGORIES)[number]['id'];

export interface CareerHealth {
  overall: number;
  categories: { id: HealthCategoryId; label: string; score: number }[];
  offerProbability: number;
  suggestions: string[];
  /** 0-100: how ready the candidate looks for a promotion / the next role up. */
  promotionReadiness: number;
  /** 0-100: how ready they look for their stated target role. */
  roleReadiness: number;
}

export interface RoadmapStep {
  title: string;
  months: number;
  skills: string[];
  certifications: string[];
  projects: string[];
  courses: string[];
  salaryRange: string;
  demand: string;
}

export interface CareerRoadmap {
  title: string;
  targetRole: string;
  timeline: string;
  steps: RoadmapStep[];
}

export interface LearningItem {
  name: string;
  kind: 'course' | 'certification' | 'book' | 'video' | 'docs' | 'practice';
  provider: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  hours: number;
  priority: InsightPriority;
  impact: string;
  done: boolean;
}

export interface CertificationRec {
  name: string;
  difficulty: string;
  cost: string;
  duration: string;
  recognition: string;
  salaryImpact: string;
  demand: string;
  priority: InsightPriority;
  reason: string;
}

export interface CoachInsight {
  text: string;
  priority: InsightPriority;
}

export interface CoachReport {
  health: CareerHealth;
  insights: CoachInsight[];
  roadmap: CareerRoadmap | null;
  learning: LearningItem[];
  certifications: CertificationRec[];
  /** Market trends and a directional salary forecast, grounded in the user's data. */
  marketTrends: string;
  salaryForecast: string;
}

/** Compact, data-only snapshot of the user handed to coach/assistant prompts. */
export interface CoachContext {
  profile: Record<string, unknown>;
  careerDna: CareerDNA | null;
  resumeScore: number | null;
  atsScore: number | null;
  topSkills: string[];
  applicationStats: Record<string, number>;
  recentApplications: { company: string; title: string; stage: string; matchScore: number | null }[];
  interviewScores: number[];
  learningProgress: number;
}

// ─────────────────────────── notifications & alerts ───────────────────────────

export interface NotificationRow {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  dedupe_key: string;
  read: boolean;
  created_at: string;
}

export interface AlertRow {
  id: string;
  user_id: string;
  kind: string;
  enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SavedSearchRow {
  id: string;
  user_id: string;
  name: string;
  params: JobSearchParams;
  alert_enabled: boolean;
  last_run_at: string | null;
  created_at: string;
}

export interface FeatureFlagRow {
  flag: string;
  enabled: boolean;
  free_limit: number | null;
  notes: string;
}
