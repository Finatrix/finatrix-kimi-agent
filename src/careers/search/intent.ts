/**
 * Phase 2.1 — Search Intent Engine (pipeline stages: Intent Builder + Query
 * Expansion). The search box is not a literal keyword search: "Risk" expands
 * into the whole risk & compliance cluster, "AML" into financial crime, and
 * the resolved target categories drive deterministic filtering downstream so
 * only jobs the user actually meant ever render.
 */

import {
  INDUSTRY_TO_CATEGORIES,
  TAXONOMY,
  containsTerm,
  relatedCategories,
  type JobCategory,
} from './taxonomy';

export interface SearchIntent {
  /** What the user typed, trimmed. */
  rawQuery: string;
  /** Categories a returned job must belong to (empty ⇒ no category gate). */
  targetCategories: Set<JobCategory>;
  /** Provider-facing expansion terms, most specific first (includes rawQuery). */
  expandedTerms: string[];
  /** Role titles to prioritise in ranking. */
  priorityTitles: string[];
  /** Detected seniority hint ('' when unknown). */
  seniority: '' | 'intern' | 'junior' | 'mid' | 'senior' | 'lead';
}

/**
 * Query concepts: canonical user intents with their category cluster,
 * expansion terms sent to providers, and titles to rank first. Trigger
 * phrases are matched against the raw query with word boundaries.
 */
interface Concept {
  triggers: string[];
  categories: JobCategory[];
  expansions: string[];
  titles: string[];
}

const CONCEPTS: Concept[] = [
  {
    triggers: ['risk', 'risk management', 'risk analyst', 'operational risk', 'enterprise risk', 'risk & compliance', 'risk and compliance', 'grc'],
    categories: ['risk', 'compliance', 'financial-crime', 'fraud', 'internal-audit', 'kyc', 'credit-risk', 'market-risk', 'model-risk', 'treasury', 'regulatory-reporting', 'esg-risk', 'cyber-risk'],
    expansions: [
      'risk analyst', 'risk management', 'operational risk', 'enterprise risk',
      'credit risk', 'market risk', 'risk and compliance', 'fraud risk',
      'aml', 'financial crime', 'compliance', 'internal audit', 'kyc',
      'control testing', 'risk assurance', 'model risk', 'regulatory reporting',
    ],
    titles: [
      'risk analyst', 'operational risk analyst', 'fraud analyst', 'aml analyst',
      'compliance analyst', 'financial crime analyst', 'kyc analyst',
      'internal audit analyst', 'market risk analyst', 'credit risk analyst',
      'model risk analyst', 'risk assurance analyst', 'enterprise risk analyst',
    ],
  },
  {
    triggers: ['aml', 'anti money laundering', 'anti-money laundering', 'financial crime', 'fincrime', 'transaction monitoring', 'sanctions'],
    categories: ['financial-crime', 'kyc', 'compliance', 'fraud', 'risk'],
    expansions: [
      'aml', 'anti money laundering', 'financial crime', 'transaction monitoring',
      'sanctions screening', 'kyc', 'cdd', 'edd', 'fraud investigation', 'compliance',
    ],
    titles: ['aml analyst', 'financial crime analyst', 'transaction monitoring analyst', 'sanctions analyst', 'kyc analyst', 'aml investigator'],
  },
  {
    triggers: ['compliance', 'regulatory compliance', 'compliance officer', 'compliance analyst'],
    categories: ['compliance', 'risk', 'financial-crime', 'kyc', 'internal-audit', 'regulatory-reporting'],
    expansions: [
      'compliance', 'regulatory compliance', 'compliance monitoring', 'compliance testing',
      'aml compliance', 'risk and compliance', 'conduct risk', 'regulatory reporting',
    ],
    titles: ['compliance analyst', 'compliance officer', 'compliance manager', 'regulatory compliance analyst', 'compliance associate'],
  },
  {
    triggers: ['fraud', 'fraud risk', 'fraud analyst', 'fraud investigation', 'loss prevention'],
    categories: ['fraud', 'financial-crime', 'risk', 'compliance'],
    expansions: [
      'fraud analyst', 'fraud risk', 'fraud investigation', 'fraud prevention',
      'fraud detection', 'transaction monitoring', 'financial crime', 'loss prevention',
    ],
    titles: ['fraud analyst', 'fraud investigator', 'fraud risk analyst', 'fraud operations analyst', 'financial crime analyst'],
  },
  {
    triggers: ['internal audit', 'audit', 'auditor', 'internal auditor', 'it audit', 'sox'],
    categories: ['internal-audit', 'risk', 'compliance', 'finance-accounting'],
    expansions: [
      'internal audit', 'internal auditor', 'audit analyst', 'it audit',
      'sox testing', 'risk assurance', 'control testing', 'statutory audit',
    ],
    titles: ['internal auditor', 'internal audit analyst', 'audit associate', 'it auditor', 'sox analyst'],
  },
  {
    triggers: ['kyc', 'cdd', 'edd', 'due diligence', 'know your customer', 'client onboarding'],
    categories: ['kyc', 'financial-crime', 'compliance', 'banking-operations'],
    expansions: ['kyc', 'cdd', 'edd', 'customer due diligence', 'enhanced due diligence', 'client onboarding', 'aml'],
    titles: ['kyc analyst', 'cdd analyst', 'edd analyst', 'due diligence analyst', 'onboarding analyst'],
  },
  {
    triggers: ['credit risk', 'credit analyst', 'credit modelling', 'credit modeling'],
    categories: ['credit-risk', 'risk', 'model-risk', 'banking-operations'],
    expansions: ['credit risk', 'credit analyst', 'credit risk modelling', 'ifrs 9', 'credit underwriting', 'credit analytics'],
    titles: ['credit risk analyst', 'credit analyst', 'credit risk manager'],
  },
  {
    triggers: ['market risk', 'trading risk'],
    categories: ['market-risk', 'risk', 'treasury', 'model-risk'],
    expansions: ['market risk', 'value at risk', 'frtb', 'trading risk', 'risk analytics'],
    titles: ['market risk analyst', 'market risk manager'],
  },
  {
    triggers: ['treasury', 'liquidity risk', 'alm'],
    categories: ['treasury', 'risk', 'market-risk', 'finance-accounting'],
    expansions: ['treasury', 'treasury analyst', 'liquidity risk', 'asset liability management', 'cash management'],
    titles: ['treasury analyst', 'treasury manager', 'liquidity risk analyst'],
  },
  {
    triggers: ['model risk', 'model validation', 'quantitative risk'],
    categories: ['model-risk', 'risk', 'credit-risk', 'market-risk', 'data'],
    expansions: ['model risk', 'model validation', 'quantitative risk', 'risk modelling', 'stress testing'],
    titles: ['model risk analyst', 'model validation analyst', 'quantitative analyst'],
  },
  {
    triggers: ['finance', 'accountant', 'accounting', 'financial analyst', 'chartered accountant', 'fp&a'],
    categories: ['finance-accounting', 'treasury', 'internal-audit', 'regulatory-reporting', 'banking-operations'],
    expansions: ['financial analyst', 'accountant', 'finance executive', 'fp&a', 'financial reporting', 'accounting'],
    titles: ['financial analyst', 'accountant', 'finance manager', 'fp&a analyst'],
  },
  {
    triggers: ['software engineer', 'software developer', 'developer', 'software', 'backend', 'frontend', 'full stack', 'fullstack', 'java developer', 'python developer', 'react developer', 'web developer', 'devops', 'sde'],
    categories: ['software', 'data', 'product'],
    expansions: ['software engineer', 'software developer', 'backend developer', 'frontend developer', 'full stack developer', 'devops engineer'],
    titles: ['software engineer', 'software developer', 'backend engineer', 'frontend engineer', 'full stack developer'],
  },
  {
    triggers: ['data scientist', 'data analyst', 'data engineer', 'machine learning', 'analytics', 'data science'],
    categories: ['data', 'software', 'model-risk'],
    expansions: ['data scientist', 'data analyst', 'data engineer', 'machine learning engineer', 'business intelligence'],
    titles: ['data scientist', 'data analyst', 'data engineer', 'ml engineer'],
  },
  {
    triggers: ['marketing', 'digital marketing', 'brand', 'seo', 'growth marketing'],
    categories: ['marketing', 'content-writing', 'sales', 'design'],
    expansions: ['marketing', 'digital marketing', 'brand manager', 'growth marketing', 'performance marketing'],
    titles: ['marketing manager', 'digital marketing specialist', 'brand manager'],
  },
  {
    triggers: ['sales', 'business development', 'account executive', 'inside sales'],
    categories: ['sales', 'marketing'],
    expansions: ['sales executive', 'business development', 'account executive', 'inside sales'],
    titles: ['sales executive', 'business development manager', 'account executive'],
  },
  {
    triggers: ['product manager', 'product management', 'product owner'],
    categories: ['product', 'software', 'data', 'project-management'],
    expansions: ['product manager', 'product owner', 'product management'],
    titles: ['product manager', 'product owner'],
  },
  {
    triggers: ['hr', 'human resources', 'talent acquisition', 'recruiter'],
    categories: ['hr'],
    expansions: ['human resources', 'hr executive', 'talent acquisition', 'recruiter'],
    titles: ['hr executive', 'talent acquisition specialist', 'hr business partner'],
  },
];

const SENIORITY_HINTS: [RegExp, SearchIntent['seniority']][] = [
  [/\b(intern|internship|graduate|fresher|trainee)\b/i, 'intern'],
  [/\b(junior|associate|entry.level)\b/i, 'junior'],
  [/\b(lead|principal|head|director|vp|chief)\b/i, 'lead'],
  [/\b(senior|sr\.?)\b/i, 'senior'],
];

/**
 * Resolve what the user meant. Concepts are matched by trigger phrase; when
 * none fires we fall back to classifying the query text against the taxonomy
 * itself so unknown queries still get a sensible category gate. The selected
 * industry filter intersects (never widens) the category gate.
 */
export function buildIntent(query: string, industry = ''): SearchIntent {
  const rawQuery = query.trim();
  const q = rawQuery.toLowerCase();
  const seniority = SENIORITY_HINTS.find(([re]) => re.test(q))?.[1] ?? '';

  // Longest trigger wins so "credit risk" beats "risk".
  let best: Concept | null = null;
  let bestLen = 0;
  for (const concept of CONCEPTS) {
    for (const trigger of concept.triggers) {
      if (trigger.length > bestLen && containsTerm(q, trigger)) {
        best = concept;
        bestLen = trigger.length;
      }
    }
  }

  let targetCategories = new Set<JobCategory>();
  let expandedTerms: string[] = [];
  let priorityTitles: string[] = [];

  if (best) {
    targetCategories = new Set(best.categories);
    expandedTerms = [...best.expansions];
    priorityTitles = [...best.titles];
  } else if (rawQuery) {
    // Unknown query — gate on whatever taxonomy categories the query text hits.
    for (const def of TAXONOMY) {
      if (def.terms.some(([phrase]) => containsTerm(q, phrase))) {
        for (const c of relatedCategories(def.id)) targetCategories.add(c);
      }
    }
  }

  // Industry filter narrows the gate when both are present.
  const industryCategories = INDUSTRY_TO_CATEGORIES[industry];
  if (industryCategories?.length) {
    if (targetCategories.size) {
      const allowed = new Set(industryCategories);
      targetCategories = new Set([...targetCategories].filter((c) => allowed.has(c)));
      // Disjoint query × industry (e.g. "Risk" + Marketing) — honour the query.
      if (!targetCategories.size) targetCategories = new Set(best?.categories ?? industryCategories);
    } else {
      targetCategories = new Set(industryCategories);
    }
  }

  // The raw query always leads the provider terms.
  if (rawQuery && !expandedTerms.some((e) => e.toLowerCase() === q)) expandedTerms.unshift(rawQuery);
  if (!expandedTerms.length && rawQuery) expandedTerms = [rawQuery];

  return { rawQuery, targetCategories, expandedTerms: expandedTerms.slice(0, 18), priorityTitles, seniority };
}
