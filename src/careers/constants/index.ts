/** FinatriX Careers — module-wide constants. */

export const CAREERS_ROUTES = {
  /**
   * The PUBLIC Careers landing page — marketing, indexable, no auth. It is not
   * an entry point into the workspace: in-app navigation must use `dashboard`
   * below. (`root` used to render the dashboard behind the auth gate, which is
   * why the whole paid product was invisible to anyone who had not bought it.)
   */
  root: '/careers',
  /** The workspace entry point. Every in-app link to "Careers" belongs here. */
  dashboard: '/careers/dashboard',
  upload: '/careers/upload',
  resumes: '/careers/resumes',
  jobs: '/careers/jobs',
  /** Match Queue — one scored role at a time (reached from Job Search). */
  queue: '/careers/queue',
  applications: '/careers/applications',
  companies: '/careers/companies',
  // Phase 4.1 — Company Intelligence search + profiles.
  intelligence: '/careers/intelligence',
  companyProfile: '/careers/intelligence/company',
  interviews: '/careers/interviews',
  coach: '/careers/coach',
  profile: '/careers/profile',
  settings: '/careers/settings',
  // Phase 3 — Application Intelligence Engine.
  tasks: '/careers/tasks',
  recruiters: '/careers/recruiters',
  network: '/careers/network',
  assessments: '/careers/assessments',
  offers: '/careers/offers',
  knowledge: '/careers/knowledge',
  // Phase 4 — Enterprise Platform.
  billing: '/careers/billing',
  admin: '/careers/admin',
} as const;

/**
 * Primary tab bar — intentionally kept to 7 items (master context, 2026-07-04):
 * the platform should focus on one thing, getting users interviews and jobs.
 * Every other routable section still exists and works; it's just not in the
 * main nav. See CAREERS_HIDDEN_SECTIONS.
 */
export const CAREERS_NAV = [
  { id: 'dashboard', name: 'Dashboard', href: CAREERS_ROUTES.dashboard },
  { id: 'resumes', name: 'Resume Library', href: CAREERS_ROUTES.resumes },
  { id: 'jobs', name: 'Job Search', href: CAREERS_ROUTES.jobs },
  { id: 'applications', name: 'Applications', href: CAREERS_ROUTES.applications },
  { id: 'interviews', name: 'Interview Prep', href: CAREERS_ROUTES.interviews },
  { id: 'coach', name: 'Career Coach', href: CAREERS_ROUTES.coach },
  { id: 'settings', name: 'Settings', href: CAREERS_ROUTES.settings },
] as const;

/**
 * Routable sections not shown in the tab bar (breadcrumb/back-link names).
 * Still fully functional — reachable by direct URL and linked from Settings
 * ("More tools") — just decluttered from primary navigation.
 */
export const CAREERS_HIDDEN_SECTIONS = [
  { id: 'upload', name: 'Upload', href: CAREERS_ROUTES.upload },
  { id: 'profile', name: 'Career Profile', href: CAREERS_ROUTES.profile },
  // Kept out of the 7-item tab bar per the focus decision above; entered from
  // Job Search and the dashboard rather than by URL.
  { id: 'queue', name: 'Match Queue', href: CAREERS_ROUTES.queue },
  { id: 'tasks', name: 'Tasks', href: CAREERS_ROUTES.tasks },
  { id: 'companies', name: 'Companies', href: CAREERS_ROUTES.companies },
  { id: 'intelligence', name: 'Company Intelligence', href: CAREERS_ROUTES.intelligence },
  { id: 'companyProfile', name: 'Company Intelligence', href: CAREERS_ROUTES.companyProfile },
  { id: 'recruiters', name: 'Recruiters', href: CAREERS_ROUTES.recruiters },
  { id: 'network', name: 'Network', href: CAREERS_ROUTES.network },
  { id: 'assessments', name: 'Assessments', href: CAREERS_ROUTES.assessments },
  { id: 'offers', name: 'Offers', href: CAREERS_ROUTES.offers },
  { id: 'knowledge', name: 'Knowledge Base', href: CAREERS_ROUTES.knowledge },
  { id: 'billing', name: 'Billing', href: CAREERS_ROUTES.billing },
  // Admin is additionally RBAC-gated (shown conditionally in the nav for admins only).
  { id: 'admin', name: 'Admin Dashboard', href: CAREERS_ROUTES.admin },
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
  { id: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5' },
  { id: 'openai/gpt-5.5', label: 'ChatGPT 5.5' },
  { id: 'moonshotai/kimi-k2', label: 'Kimi AI' },
  { id: 'deepseek/deepseek-chat-v3.1', label: 'DeepSeek Chat' },
  { id: 'qwen/qwen3-235b-a22b-2507', label: 'Qwen 3' },
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
  preferredIndustries: [] as string[],
  preferredLocations: [] as string[],
  preferredDepartments: [] as string[],
  preferredAts: [] as string[],
} as const;
