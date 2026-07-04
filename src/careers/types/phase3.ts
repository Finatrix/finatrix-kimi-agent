/**
 * FinatriX Careers Phase 3 — Application Intelligence Engine. Row shapes
 * mirror supabase/careers_phase3_schema.sql. Everything here composes with
 * Phase 1/2 types (ParsedResume, CareerDNA, JobRow, ApplicationRow…) rather
 * than duplicating them.
 */

import type { TailoringReport } from './jobs';

// ─────────────────────────── tasks (Module 14) ───────────────────────────

export const TASK_KINDS = [
  'apply', 'email', 'interview_prep', 'research', 'star_practice', 'assessment', 'follow_up', 'general',
] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export type TaskStatus = 'open' | 'done' | 'dismissed';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface TaskRow {
  id: string;
  user_id: string;
  application_id: string | null;
  title: string;
  detail: string;
  kind: TaskKind;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────── resume tailoring (Module 3) ───────────────────────────

export interface ResumeTailoredVersionRow {
  id: string;
  user_id: string;
  resume_version_id: string;
  application_id: string | null;
  job_id: string | null;
  job_text_sha256: string;
  report: TailoringReport;
  accepted_sections: string[];
  created_at: string;
  updated_at: string;
}

// ─────────────────────────── AI email generator (Module 5) ───────────────────────────

export const EMAIL_KINDS = [
  'application', 'follow_up', 'interview_confirm', 'thank_you', 'offer_negotiation',
  'salary_negotiation', 'withdrawal', 'referral_request', 'networking', 'linkedin_connect', 'cold_outreach',
] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export const EMAIL_KIND_LABELS: Record<EmailKind, string> = {
  application: 'Application Email',
  follow_up: 'Recruiter Follow-up',
  interview_confirm: 'Interview Confirmation',
  thank_you: 'Interview Thank You',
  offer_negotiation: 'Offer Negotiation',
  salary_negotiation: 'Salary Negotiation',
  withdrawal: 'Application Withdrawal',
  referral_request: 'Referral Request',
  networking: 'Networking Message',
  linkedin_connect: 'LinkedIn Connection Request',
  cold_outreach: 'Cold Outreach',
};

export interface GeneratedEmailRow {
  id: string;
  user_id: string;
  application_id: string | null;
  recruiter_id: string | null;
  kind: EmailKind;
  subject: string;
  body: string;
  tone: string;
  sent: boolean;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GeneratedEmailContent {
  subject: string;
  body: string;
}

// ─────────────────────────── recruiter CRM (Module 6) ───────────────────────────

export interface RecruiterRow {
  id: string;
  user_id: string;
  company_id: string | null;
  name: string;
  role: string;
  company_name: string;
  email: string;
  phone: string;
  linkedin_url: string;
  notes: string;
  relationship_score: number;
  last_contact_at: string | null;
  created_at: string;
  updated_at: string;
}

export type InteractionKind = 'note' | 'email' | 'call' | 'meeting' | 'message';

export interface RecruiterInteractionRow {
  id: string;
  user_id: string;
  recruiter_id: string;
  kind: InteractionKind;
  body: string;
  occurred_at: string;
  created_at: string;
}

// ─────────────────────────── networking CRM (Module 7) ───────────────────────────

export const NETWORK_RELATIONSHIPS = [
  'connection', 'mentor', 'hiring_manager', 'employee', 'referral', 'alumni', 'event_contact',
] as const;
export type NetworkRelationship = (typeof NETWORK_RELATIONSHIPS)[number];

export interface NetworkContactRow {
  id: string;
  user_id: string;
  name: string;
  relationship: NetworkRelationship;
  company_name: string;
  university: string;
  event_name: string;
  email: string;
  linkedin_url: string;
  notes: string;
  follow_up_at: string | null;
  last_contact_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NetworkInteractionRow {
  id: string;
  user_id: string;
  contact_id: string;
  body: string;
  occurred_at: string;
  created_at: string;
}

// ─────────────────────────── assessment center (Module 11) ───────────────────────────

export const ASSESSMENT_KINDS = [
  'online', 'case_study', 'psychometric', 'numerical', 'logical', 'coding', 'video_interview',
] as const;
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];

export type AssessmentResult = 'pass' | 'fail' | 'pending' | '';

export interface AssessmentResource {
  title: string;
  url: string;
}

export interface AssessmentRow {
  id: string;
  user_id: string;
  application_id: string | null;
  kind: AssessmentKind;
  title: string;
  provider: string;
  link: string;
  due_at: string | null;
  completed_at: string | null;
  score: number | null;
  result: AssessmentResult;
  notes: string;
  resources: AssessmentResource[];
  created_at: string;
  updated_at: string;
}

// ─────────────────────────── offer management (Module 12/13) ───────────────────────────

export type OfferStatus = 'received' | 'negotiating' | 'accepted' | 'declined' | 'expired';

export interface OfferAnalysis {
  marketSalaryComparison: string;
  pros: string[];
  cons: string[];
  negotiationSuggestions: string[];
  riskAssessment: string;
  longTermCareerValue: string;
  recommendation: string;
  /** 0–100 confidence in the recommendation. */
  score: number;
}

export interface OfferRow {
  id: string;
  user_id: string;
  application_id: string | null;
  company_name: string;
  job_title: string;
  base_salary: number | null;
  bonus: number | null;
  equity: string;
  currency: string;
  visa_sponsorship: string;
  relocation: string;
  benefits: string[];
  leave_days: number | null;
  insurance: string;
  work_mode: string;
  work_hours: string;
  probation_months: number | null;
  notice_period: string;
  status: OfferStatus;
  received_at: string;
  expires_at: string | null;
  decided_at: string | null;
  ai_analysis: OfferAnalysis | null;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────── AI knowledge base (Module 19) ───────────────────────────

export const KNOWLEDGE_KINDS = [
  'star_story', 'note', 'achievement', 'leadership', 'failure', 'success', 'project',
] as const;
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

export interface KnowledgeItemRow {
  id: string;
  user_id: string;
  kind: KnowledgeKind;
  title: string;
  body: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

// ─────────────────────────── calendar (Module 15) ───────────────────────────

export type CalendarEventKind = 'interview' | 'deadline' | 'assessment' | 'follow_up';

export interface CalendarEvent {
  id: string;
  kind: CalendarEventKind;
  title: string;
  description: string;
  at: string;         // ISO start
  location: string;
  url: string;
}
