/**
 * FinatriX Careers — shared types.
 *
 * Three families live here:
 *  1. AI output shapes (ParsedResume, CareerDNA, ResumeScoreReport, ATSReport)
 *     — everything the AI returns is validated into these before use.
 *  2. Database row shapes mirroring supabase/careers_schema.sql.
 *  3. Processing-pipeline state shared by the upload flow and the UI.
 */

// ─────────────────────────── AI: parsed resume ───────────────────────────

export interface PersonalInfo {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  portfolio: string;
}

export interface ExperienceItem {
  company: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  summary: string;
  highlights: string[];
}

export interface EducationItem {
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  grade: string;
}

export interface ProjectItem {
  name: string;
  description: string;
  technologies: string[];
  url: string;
}

export interface CertificationItem {
  name: string;
  issuer: string;
  issueDate: string;
  expiryDate: string;
  credentialId: string;
}

export interface SkillGroups {
  technical: string[];
  soft: string[];
  business: string[];
  leadership: string[];
  tools: string[];
  frameworks: string[];
  programmingLanguages: string[];
  cloudPlatforms: string[];
  databases: string[];
}

export interface CareerInsights {
  careerGaps: string[];
  promotionHistory: string;
  employmentStability: string;
  jobSwitchingPattern: string;
  careerProgression: string;
}

export interface ParsedResume {
  personal: PersonalInfo;
  summary: string;
  careerObjective: string;
  yearsOfExperience: number | null;
  currentDesignation: string;
  currentIndustry: string;
  experience: ExperienceItem[];
  education: EducationItem[];
  skills: SkillGroups;
  projects: ProjectItem[];
  certifications: CertificationItem[];
  languages: string[];
  achievements: string[];
  awards: string[];
  publications: string[];
  volunteerWork: string[];
  publicSpeaking: string[];
  research: string[];
  patents: string[];
  insights: CareerInsights;
}

// ─────────────────────────── AI: Career DNA ───────────────────────────

export interface DnaTrait {
  name: string;
  /** 0–100 confidence that this trait describes the candidate. */
  confidence: number;
}

export interface CareerDNA {
  traits: DnaTrait[];
  strengths: string[];
  weaknesses: string[];
  recommendedIndustries: string[];
  suitableRoles: string[];
  personalitySummary: string;
}

// ─────────────────────────── AI: scores ───────────────────────────

export interface ScoreCategory {
  id: string;
  label: string;
  /** 0–100 */
  score: number;
  suggestion: string;
}

export interface ResumeScoreReport {
  overall: number;
  categories: ScoreCategory[];
  improvements: string[];
}

export type AtsSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AtsIssue {
  id: string;
  title: string;
  detail: string;
  severity: AtsSeverity;
  fix: string;
  /** 1 = fix first. */
  priority: number;
}

export interface ATSReport {
  overall: number;
  checks: ScoreCategory[];
  issues: AtsIssue[];
}

// ─────────────────────────── database rows ───────────────────────────

export interface CareersSettings {
  /** Preferred AI model id; empty = server default chain. */
  model: string;
  /** Whether the OCR fallback may run on image-only PDFs. */
  ocrEnabled: boolean;
  /** Whether anonymous product analytics are recorded. */
  analyticsEnabled: boolean;
}

export interface CareerProfileRow {
  user_id: string;
  current_role: string;
  preferred_role: string;
  preferred_industry: string;
  years_experience: number | null;
  highest_qualification: string;
  primary_skills: string[];
  secondary_skills: string[];
  location_preference: string;
  employment_type: string;
  salary_expectation: string;
  notice_period: string;
  visa_status: string;
  work_rights: string;
  languages: string[];
  career_dna: CareerDNA | null;
  suggestions: Partial<Record<keyof CareerProfileFields, string>>;
  settings: Partial<CareersSettings>;
  created_at: string;
  updated_at: string;
}

/** The editable profile fields (everything except ids, DNA and settings). */
export type CareerProfileFields = Omit<
  CareerProfileRow,
  'user_id' | 'career_dna' | 'suggestions' | 'settings' | 'created_at' | 'updated_at'
>;

export interface ResumeRow {
  id: string;
  user_id: string;
  name: string;
  industry: string;
  notes: string;
  is_favorite: boolean;
  is_archived: boolean;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Pipeline stages persisted on a version row; the order is meaningful. */
export const VERSION_STAGES = [
  'uploaded',
  'extracted',
  'parsed',
  'dna',
  'scored',
  'ats',
  'complete',
] as const;
export type VersionStage = (typeof VERSION_STAGES)[number];

export type VersionStatus = 'processing' | 'complete' | 'failed';

export interface ResumeVersionRow {
  id: string;
  resume_id: string;
  user_id: string;
  version_number: number;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  sha256: string;
  stage: VersionStage;
  status: VersionStatus;
  error: string;
  extraction_method: string;
  raw_text: string;
  parsed: ParsedResume | null;
  resume_score: number | null;
  score_breakdown: ResumeScoreReport | null;
  ats_score: number | null;
  ats_report: ATSReport | null;
  career_dna: CareerDNA | null;
  parse_ms: number | null;
  ai_ms: number | null;
  created_at: string;
  updated_at: string;
}

/** A resume family joined with its versions (library view). */
export interface ResumeWithVersions extends ResumeRow {
  versions: ResumeVersionRow[];
}

// ─────────────────────────── extraction ───────────────────────────

export type ExtractionMethod = 'pdf-text' | 'docx' | 'doc' | 'ocr';

export interface ExtractionResult {
  text: string;
  method: ExtractionMethod;
  /** Page count where the format has pages (PDF). */
  pages: number | null;
}

// ─────────────────────────── pipeline ───────────────────────────

export const PIPELINE_STEPS = [
  { id: 'uploading', label: 'Uploading' },
  { id: 'extracting', label: 'Extracting text' },
  { id: 'parsing', label: 'AI analysis' },
  { id: 'dna', label: 'Building Career DNA' },
  { id: 'scoring', label: 'Calculating Resume Score' },
  { id: 'ats', label: 'Calculating ATS Score' },
  { id: 'saving', label: 'Saving results' },
  { id: 'complete', label: 'Completed' },
] as const;

export type PipelineStepId = (typeof PIPELINE_STEPS)[number]['id'];

export interface PipelineProgress {
  step: PipelineStepId;
  /** 0–100 within the current step where known (upload/OCR), else null. */
  pct: number | null;
}
