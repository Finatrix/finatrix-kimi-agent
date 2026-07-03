/** FinatriX Careers — module-wide constants. */

/** Careers brand accent (matches the gold-forward FinatriX palette). */
export const CAREERS_COLOR = '#D4AF37';

export const CAREERS_ROUTES = {
  root: '/careers',
  dashboard: '/careers/dashboard',
  upload: '/careers/upload',
  resumes: '/careers/resumes',
  profile: '/careers/profile',
  settings: '/careers/settings',
} as const;

export const CAREERS_NAV = [
  { id: 'dashboard', name: 'Dashboard', href: CAREERS_ROUTES.dashboard },
  { id: 'upload', name: 'Upload', href: CAREERS_ROUTES.upload },
  { id: 'resumes', name: 'Resume Library', href: CAREERS_ROUTES.resumes },
  { id: 'profile', name: 'Career Profile', href: CAREERS_ROUTES.profile },
  { id: 'settings', name: 'Settings', href: CAREERS_ROUTES.settings },
] as const;

// ─────────────────────────── uploads ───────────────────────────

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export const ACCEPTED_EXTENSIONS = ['pdf', 'docx', 'doc'] as const;

export const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
] as const;

/** value for <input accept> / dropzone hint. */
export const ACCEPT_ATTR = '.pdf,.docx,.doc';

export const STORAGE_BUCKET = 'resumes';

// ─────────────────────────── AI models ───────────────────────────

/**
 * Models the user can pick in Settings. Must stay a subset of the edge
 * function's allowlist (CAREERS_AI_MODELS); empty id = server default chain.
 */
export const AI_MODEL_OPTIONS = [
  { id: '', label: 'Automatic (recommended)' },
  { id: 'google/gemini-2.5-flash', label: 'Google Gemini Flash' },
  { id: 'deepseek/deepseek-chat-v3.1', label: 'DeepSeek Chat' },
  { id: 'qwen/qwen3-235b-a22b-instruct-2507', label: 'Qwen 3' },
] as const;

/** Resume text is clamped to this many characters before it is sent to AI. */
export const MAX_AI_INPUT_CHARS = 60_000;

// ─────────────────────────── scoring rubric ───────────────────────────

export const RESUME_SCORE_CATEGORIES = [
  { id: 'structure', label: 'Resume Structure' },
  { id: 'readability', label: 'Readability' },
  { id: 'experience', label: 'Experience Quality' },
  { id: 'skills', label: 'Skills' },
  { id: 'projects', label: 'Projects' },
  { id: 'education', label: 'Education' },
  { id: 'certifications', label: 'Certifications' },
  { id: 'achievements', label: 'Achievements' },
  { id: 'leadership', label: 'Leadership' },
  { id: 'formatting', label: 'Formatting' },
  { id: 'completeness', label: 'Completeness' },
  { id: 'grammar', label: 'Grammar' },
  { id: 'keywords', label: 'Keyword Quality' },
  { id: 'impact', label: 'Impact Statements' },
  { id: 'actionVerbs', label: 'Action Verbs' },
] as const;

export const ATS_CHECK_CATEGORIES = [
  { id: 'headings', label: 'Heading Structure' },
  { id: 'keywords', label: 'Keyword Coverage' },
  { id: 'skills', label: 'Skills' },
  { id: 'formatting', label: 'Formatting' },
  { id: 'tables', label: 'Tables' },
  { id: 'columns', label: 'Columns' },
  { id: 'fonts', label: 'Fonts' },
  { id: 'icons', label: 'Icons' },
  { id: 'images', label: 'Images' },
  { id: 'headerFooter', label: 'Header / Footer' },
  { id: 'contact', label: 'Contact Information' },
  { id: 'fileNaming', label: 'File Naming' },
  { id: 'bullets', label: 'Bullet Quality' },
  { id: 'sectionOrder', label: 'Section Order' },
  { id: 'whitespace', label: 'Whitespace' },
] as const;

// ─────────────────────────── misc ───────────────────────────

export const INDUSTRY_OPTIONS = [
  'Finance', 'Banking', 'Risk & Compliance', 'Technology', 'Data & Analytics',
  'Consulting', 'Operations', 'Marketing', 'Sales', 'Human Resources',
  'Healthcare', 'Education', 'Legal', 'Manufacturing', 'Retail', 'Other',
] as const;

export const EMPLOYMENT_TYPES = [
  'Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship',
] as const;

export const DEFAULT_SETTINGS = {
  model: '',
  ocrEnabled: true,
  analyticsEnabled: true,
} as const;
