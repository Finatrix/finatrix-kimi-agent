/** FinatriX Careers — module-wide constants. */

/**
 * Every in-app destination. The workspace has six areas (Home, Resume, Jobs,
 * Applications, Interviews, Companies) plus Settings; what used to be separate
 * pages are now tabs inside those areas, addressed with `?tab=`. The old paths
 * still resolve — App.tsx redirects each one here — because they live on in
 * bookmarks, emails and stored notification links.
 */
export const CAREERS_ROUTES = {
  /**
   * The PUBLIC Careers landing page — marketing, indexable, no auth. It is not
   * an entry point into the workspace: in-app navigation must use `dashboard`.
   */
  root: '/careers',
  /** Home — the workspace entry point. Every in-app link to "Careers" belongs here. */
  dashboard: '/careers/dashboard',
  coach: '/careers/dashboard?tab=coach',
  resume: '/careers/resume',
  resumes: '/careers/resume',
  upload: '/careers/resume?tab=upload',
  profile: '/careers/resume?tab=profile',
  jobs: '/careers/jobs',
  /** One scored role at a time. */
  queue: '/careers/jobs?tab=review',
  applications: '/careers/applications',
  tasks: '/careers/applications?tab=tasks',
  assessments: '/careers/applications?tab=assessments',
  offers: '/careers/applications?tab=offers',
  interviews: '/careers/interviews',
  knowledge: '/careers/interviews?tab=stories',
  /** The company directory (intelligence search). */
  intelligence: '/careers/companies',
  /** Your own tracked companies. */
  companies: '/careers/companies?tab=yours',
  companyProfile: '/careers/companies/profile',
  recruiters: '/careers/companies?tab=people',
  network: '/careers/companies?tab=people',
  settings: '/careers/settings',
  billing: '/careers/settings?tab=plan',
  admin: '/careers/admin',
} as const;

/** The six areas, in the order a job search runs. Settings sits apart, in the rail footer. */
export const CAREERS_NAV = [
  { id: 'dashboard', name: 'Home', href: CAREERS_ROUTES.dashboard, icon: 'home' },
  { id: 'resume', name: 'Resume', href: CAREERS_ROUTES.resume, icon: 'resume' },
  { id: 'jobs', name: 'Jobs', href: CAREERS_ROUTES.jobs, icon: 'jobs' },
  { id: 'applications', name: 'Applications', href: CAREERS_ROUTES.applications, icon: 'applications' },
  { id: 'interviews', name: 'Interviews', href: CAREERS_ROUTES.interviews, icon: 'interviews' },
  { id: 'companies', name: 'Companies', href: CAREERS_ROUTES.intelligence, icon: 'companies' },
] as const;

export type CareersAreaId = (typeof CAREERS_NAV)[number]['id'] | 'settings' | 'admin';

/**
 * Places inside the areas, for the command palette and anything else that
 * wants to jump straight to a sub-view. Names are what the user is doing,
 * not what the page used to be called.
 */
export const CAREERS_HIDDEN_SECTIONS = [
  { id: 'upload', name: 'Upload a resume', href: CAREERS_ROUTES.upload },
  { id: 'profile', name: 'Career profile', href: CAREERS_ROUTES.profile },
  { id: 'queue', name: 'Review jobs one by one', href: CAREERS_ROUTES.queue },
  { id: 'tasks', name: 'Tasks', href: CAREERS_ROUTES.tasks },
  { id: 'assessments', name: 'Assessments', href: CAREERS_ROUTES.assessments },
  { id: 'offers', name: 'Offers', href: CAREERS_ROUTES.offers },
  { id: 'knowledge', name: 'Story bank', href: CAREERS_ROUTES.knowledge },
  { id: 'yourCompanies', name: 'Your companies', href: CAREERS_ROUTES.companies },
  { id: 'people', name: 'Recruiters and contacts', href: CAREERS_ROUTES.recruiters },
  { id: 'coach', name: 'Career coach', href: CAREERS_ROUTES.coach },
  { id: 'settings', name: 'Careers settings', href: CAREERS_ROUTES.settings },
  { id: 'billing', name: 'Plan', href: CAREERS_ROUTES.billing },
  // Admin is additionally RBAC-gated (shown only to admins).
  { id: 'admin', name: 'Admin', href: CAREERS_ROUTES.admin },
] as const;

/** Area name for a pathname, used for the document title and the current-place marker. */
export function careersAreaFor(pathname: string): { id: CareersAreaId; name: string } {
  const seg = /^\/careers\/([a-z]+)/i.exec(pathname)?.[1]?.toLowerCase() ?? 'dashboard';
  if (seg === 'settings') return { id: 'settings', name: 'Settings' };
  if (seg === 'admin') return { id: 'admin', name: 'Admin' };
  const area = CAREERS_NAV.find((n) => n.id === seg);
  return area ? { id: area.id, name: area.name } : { id: 'dashboard', name: 'Home' };
}

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
  { id: 'google/gemini-3.8-flash', label: 'Google Gemini Flash' },
  { id: 'anthropic/claude-sonnet-5.5', label: 'Claude Sonnet 5.5' },
  { id: 'openai/gpt-6.1-sol', label: 'ChatGPT 6.1' },
  { id: 'moonshotai/kimi-k3', label: 'Kimi AI' },
  { id: 'deepseek/deepseek-v4.1-flash', label: 'DeepSeek V4.1' },
  { id: 'qwen/qwen3.8-flash', label: 'Qwen 3.8' },
] as const;

/**
 * Models this app used to offer, and the one that replaced each. The choice is
 * saved in the user's profile, so without this a saved "Claude Sonnet 5" would
 * match no option: the picker would show "Automatic" while the stored id still
 * steered requests. Read through `resolveSettings`. The edge function keeps the
 * same mapping for app builds already installed on phones.
 */
export const RETIRED_MODEL_IDS: Readonly<Record<string, string>> = {
  'google/gemini-2.5-flash': 'google/gemini-3.8-flash',
  'anthropic/claude-sonnet-5': 'anthropic/claude-sonnet-5.5',
  'openai/gpt-5.5': 'openai/gpt-6.1-sol',
  'moonshotai/kimi-k2': 'moonshotai/kimi-k3',
  'deepseek/deepseek-chat-v3.1': 'deepseek/deepseek-v4.1-flash',
  'qwen/qwen3-235b-a22b-2507': 'qwen/qwen3.8-flash',
};

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
  preferredIndustries: [] as string[],
  preferredLocations: [] as string[],
  preferredDepartments: [] as string[],
  preferredAts: [] as string[],
} as const;
