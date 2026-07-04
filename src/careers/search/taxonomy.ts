/**
 * Phase 2.1 — Finance Taxonomy Engine (search pipeline stage: classification).
 *
 * Every job is classified into a canonical category from the taxonomy below by
 * scoring weighted term hits (title hits count far more than description
 * hits). The classifier is fully deterministic — no AI cost — and is the
 * ground truth that deterministic filtering, intent expansion and ranking all
 * share, so a "Risk" search can never surface a Writing Specialist.
 */

export type JobCategory =
  | 'risk'
  | 'compliance'
  | 'financial-crime'
  | 'fraud'
  | 'internal-audit'
  | 'kyc'
  | 'treasury'
  | 'credit-risk'
  | 'market-risk'
  | 'model-risk'
  | 'regulatory-reporting'
  | 'esg-risk'
  | 'cyber-risk'
  | 'finance-accounting'
  | 'banking-operations'
  | 'insurance'
  | 'software'
  | 'data'
  | 'product'
  | 'project-management'
  | 'consulting'
  | 'marketing'
  | 'sales'
  | 'content-writing'
  | 'customer-support'
  | 'design'
  | 'hr'
  | 'legal'
  | 'operations'
  | 'logistics'
  | 'healthcare'
  | 'education'
  | 'other';

/** Term weight inside a category: how strongly the phrase signals it. */
interface CategoryDef {
  id: JobCategory;
  label: string;
  /** Phrases that identify the category. Weight 1–10. */
  terms: [phrase: string, weight: number][];
  /** Categories close enough to satisfy a search targeting this one. */
  related: JobCategory[];
}

// Shorthand builders keep the table readable.
const t = (phrase: string, weight = 5): [string, number] => [phrase, weight];

export const TAXONOMY: CategoryDef[] = [
  {
    id: 'risk',
    label: 'Risk Management',
    related: ['compliance', 'financial-crime', 'fraud', 'internal-audit', 'kyc', 'credit-risk', 'market-risk', 'model-risk', 'treasury', 'regulatory-reporting', 'esg-risk', 'cyber-risk'],
    terms: [
      t('risk analyst', 10), t('risk management', 9), t('risk manager', 9),
      t('operational risk', 10), t('enterprise risk', 10), t('risk officer', 9),
      t('risk assurance', 9), t('risk governance', 9), t('risk reporting', 8),
      t('risk analytics', 8), t('risk strategy', 7), t('risk operations', 7),
      t('risk consultant', 8), t('risk advisory', 8), t('risk assessment', 6),
      t('risk and compliance', 10), t('risk & compliance', 10),
      t('governance risk', 9), t('grc', 8), t('risk framework', 6),
      t('control testing', 8), t('control assurance', 8), t('internal controls', 7),
      t('operational controls', 8), t('controls analyst', 8), t('stress testing', 7),
      t('basel', 8), t('icaap', 8), t('risk appetite', 7), t('third party risk', 8),
      t('vendor risk', 8), t('technology risk', 8), t('risk specialist', 8),
    ],
  },
  {
    id: 'compliance',
    label: 'Compliance',
    related: ['risk', 'financial-crime', 'kyc', 'internal-audit', 'regulatory-reporting', 'legal'],
    terms: [
      t('compliance analyst', 10), t('compliance officer', 10), t('compliance manager', 10),
      t('compliance associate', 9), t('regulatory compliance', 10), t('compliance testing', 9),
      t('compliance monitoring', 9), t('compliance advisory', 9), t('compliance', 6),
      t('regulatory affairs', 8), t('conduct risk', 8), t('surveillance', 6),
      t('code of conduct', 5), t('policy governance', 6), t('sox', 8), t('mifid', 8),
      t('fatca', 8), t('crs reporting', 7), t('sebi', 7), t('rbi compliance', 9),
    ],
  },
  {
    id: 'financial-crime',
    label: 'AML & Financial Crime',
    related: ['risk', 'compliance', 'fraud', 'kyc'],
    terms: [
      t('aml', 10), t('anti-money laundering', 10), t('anti money laundering', 10),
      t('financial crime', 10), t('transaction monitoring', 10), t('sanctions', 9),
      t('ctf', 8), t('counter terrorist financing', 9), t('counter-terrorist financing', 9),
      t('pep screening', 9), t('name screening', 8), t('fincrime', 9),
      t('sar filing', 9), t('suspicious activity', 8), t('fiu', 7),
      t('ofac', 8), t('fatf', 8), t('money laundering', 9),
    ],
  },
  {
    id: 'fraud',
    label: 'Fraud',
    related: ['risk', 'financial-crime', 'compliance'],
    terms: [
      t('fraud analyst', 10), t('fraud investigator', 10), t('fraud risk', 10),
      t('fraud prevention', 10), t('fraud detection', 10), t('fraud operations', 9),
      t('fraud examiner', 9), t('anti-fraud', 9), t('anti fraud', 9),
      t('loss prevention', 8), t('chargeback', 7), t('fraud strategy', 9),
      t('fraud investigation', 10), t('fraud', 6), t('disputes analyst', 6),
    ],
  },
  {
    id: 'internal-audit',
    label: 'Internal Audit',
    related: ['risk', 'compliance', 'finance-accounting'],
    terms: [
      t('internal audit', 10), t('internal auditor', 10), t('audit analyst', 9),
      t('audit associate', 8), t('audit manager', 8), t('it audit', 9),
      t('audit senior', 8), t('statutory audit', 8), t('external audit', 8),
      t('auditor', 7), t('audit', 5), t('sox testing', 9), t('sox compliance', 9),
      t('cisa', 7), t('assurance associate', 7), t('risk based audit', 9),
    ],
  },
  {
    id: 'kyc',
    label: 'KYC / CDD',
    related: ['financial-crime', 'compliance', 'risk', 'banking-operations'],
    terms: [
      t('kyc', 10), t('know your customer', 10), t('cdd', 9), t('edd', 9),
      t('customer due diligence', 10), t('enhanced due diligence', 10),
      t('client onboarding', 8), t('kyc analyst', 10), t('kyc remediation', 9),
      t('periodic review', 6), t('due diligence analyst', 8),
    ],
  },
  {
    id: 'treasury',
    label: 'Treasury',
    related: ['risk', 'market-risk', 'finance-accounting'],
    terms: [
      t('treasury', 8), t('treasury analyst', 10), t('treasury risk', 10),
      t('liquidity risk', 10), t('alm', 8), t('asset liability management', 9),
      t('cash management', 7), t('funding and liquidity', 9), t('ftp', 6),
    ],
  },
  {
    id: 'credit-risk',
    label: 'Credit Risk',
    related: ['risk', 'model-risk', 'banking-operations'],
    terms: [
      t('credit risk', 10), t('credit analyst', 9), t('credit modelling', 9),
      t('credit modeling', 9), t('credit underwriting', 8), t('collections risk', 9),
      t('ifrs 9', 8), t('ecl', 7), t('pd lgd', 8), t('credit policy', 8),
      t('credit analytics', 9), t('counterparty risk', 9), t('credit officer', 8),
    ],
  },
  {
    id: 'market-risk',
    label: 'Market Risk',
    related: ['risk', 'treasury', 'model-risk'],
    terms: [
      t('market risk', 10), t('var', 5), t('value at risk', 9), t('frtb', 9),
      t('trading risk', 9), t('pnl attribution', 8), t('greeks', 6),
      t('market risk analyst', 10), t('commodity risk', 8),
    ],
  },
  {
    id: 'model-risk',
    label: 'Model Risk & Validation',
    related: ['risk', 'credit-risk', 'market-risk', 'data'],
    terms: [
      t('model risk', 10), t('model validation', 10), t('model governance', 9),
      t('quantitative risk', 9), t('sr 11-7', 8), t('model monitoring', 8),
      t('quant analyst', 7), t('risk modelling', 9), t('risk modeling', 9),
    ],
  },
  {
    id: 'regulatory-reporting',
    label: 'Regulatory Reporting',
    related: ['risk', 'compliance', 'finance-accounting'],
    terms: [
      t('regulatory reporting', 10), t('finrep', 8), t('corep', 8),
      t('rbi returns', 9), t('prudential reporting', 9), t('liquidity reporting', 8),
      t('capital reporting', 8), t('basel reporting', 9),
    ],
  },
  {
    id: 'esg-risk',
    label: 'ESG Risk',
    related: ['risk', 'compliance'],
    terms: [
      t('esg risk', 10), t('climate risk', 10), t('sustainability risk', 9),
      t('esg reporting', 8), t('esg analyst', 8),
    ],
  },
  {
    id: 'cyber-risk',
    label: 'Cyber / Technology Risk',
    related: ['risk', 'software'],
    terms: [
      t('cyber risk', 10), t('information security risk', 10), t('it risk', 9),
      t('technology risk', 9), t('cyber security analyst', 8), t('iso 27001', 7),
      t('security compliance', 8), t('infosec', 6),
    ],
  },
  {
    id: 'finance-accounting',
    label: 'Finance & Accounting',
    related: ['internal-audit', 'treasury', 'regulatory-reporting', 'banking-operations'],
    terms: [
      t('accountant', 10), t('chartered accountant', 10), t('accounts payable', 9),
      t('accounts receivable', 9), t('financial analyst', 9), t('fp&a', 9),
      t('financial reporting', 8), t('bookkeeping', 8), t('general ledger', 8),
      t('taxation', 7), t('gst', 6), t('accounting', 7), t('finance executive', 8),
      t('finance manager', 8), t('controller', 6), t('financial controller', 9),
      t('investment banking', 8), t('equity research', 8), t('valuation', 6),
    ],
  },
  {
    id: 'banking-operations',
    label: 'Banking Operations',
    related: ['kyc', 'finance-accounting', 'operations'],
    terms: [
      t('banking operations', 10), t('branch banking', 9), t('relationship manager', 7),
      t('trade finance', 9), t('payments operations', 9), t('settlements', 7),
      t('reconciliation', 6), t('nbfc', 7), t('retail banking', 8), t('bfsi', 6),
    ],
  },
  {
    id: 'insurance',
    label: 'Insurance',
    related: ['risk', 'finance-accounting'],
    terms: [
      t('actuarial', 10), t('actuary', 10), t('underwriter', 9), t('underwriting', 8),
      t('claims analyst', 9), t('insurance', 6), t('reinsurance', 9),
    ],
  },
  {
    id: 'software',
    label: 'Software Engineering',
    related: ['data', 'product', 'cyber-risk'],
    terms: [
      t('software engineer', 10), t('software developer', 10), t('backend engineer', 10),
      t('frontend engineer', 10), t('full stack', 10), t('fullstack', 10),
      t('web developer', 9), t('mobile developer', 9), t('android developer', 9),
      t('ios developer', 9), t('devops', 9), t('site reliability', 9),
      t('java developer', 10), t('python developer', 10), t('react developer', 10),
      t('node js', 8), t('golang', 8), t('developer', 6), t('programmer', 7),
      t('sdet', 8), t('qa engineer', 8), t('test engineer', 7), t('cloud engineer', 9),
      t('platform engineer', 9), t('embedded engineer', 8), t('engineering manager', 7),
    ],
  },
  {
    id: 'data',
    label: 'Data & Analytics',
    related: ['software', 'model-risk', 'product'],
    terms: [
      t('data scientist', 10), t('data analyst', 10), t('data engineer', 10),
      t('machine learning', 9), t('ml engineer', 10), t('business intelligence', 9),
      t('analytics', 6), t('big data', 8), t('data labeling', 8), t('data labelling', 8),
      t('data annotation', 8), t('statistician', 8), t('ai engineer', 9),
    ],
  },
  {
    id: 'product',
    label: 'Product',
    related: ['software', 'data', 'project-management'],
    terms: [
      t('product manager', 10), t('product owner', 10), t('product analyst', 8),
      t('product management', 9), t('scrum master', 7),
    ],
  },
  {
    id: 'project-management',
    label: 'Project Management',
    related: ['product', 'operations', 'consulting'],
    terms: [
      t('project manager', 10), t('program manager', 9), t('pmo', 9),
      t('delivery manager', 8), t('project coordinator', 8),
    ],
  },
  {
    id: 'consulting',
    label: 'Consulting',
    related: ['risk', 'finance-accounting', 'project-management'],
    terms: [
      t('consultant', 6), t('management consulting', 9), t('advisory', 5),
      t('strategy consultant', 9),
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    related: ['sales', 'content-writing', 'design'],
    terms: [
      t('marketing', 8), t('digital marketing', 10), t('seo', 8), t('sem', 7),
      t('brand manager', 9), t('growth marketing', 9), t('social media', 8),
      t('performance marketing', 9), t('marketing manager', 10), t('campaign manager', 8),
      t('communications manager', 9), t('public relations', 9), t('communications specialist', 9),
      t('corporate communications', 9),
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    related: ['marketing', 'customer-support'],
    terms: [
      t('sales executive', 10), t('sales manager', 10), t('business development', 9),
      t('account executive', 9), t('inside sales', 9), t('field sales', 9),
      t('sales representative', 10), t('telesales', 9), t('sales', 6),
      t('lead generation', 8), t('presales', 7),
    ],
  },
  {
    id: 'content-writing',
    label: 'Content & Writing',
    related: ['marketing', 'design'],
    terms: [
      t('content writer', 10), t('copywriter', 10), t('writing specialist', 10),
      t('technical writer', 9), t('content specialist', 9), t('editor', 7),
      t('content marketing', 9), t('blogger', 8), t('proofreader', 9),
      t('content creator', 9), t('scriptwriter', 9), t('writer', 7),
    ],
  },
  {
    id: 'customer-support',
    label: 'Customer Support',
    related: ['operations', 'sales'],
    terms: [
      t('customer support', 10), t('customer service', 10), t('customer success', 10),
      t('customer operations', 10), t('call center', 9), t('call centre', 9),
      t('help desk', 9), t('technical support', 8), t('support executive', 9),
      t('customer care', 9), t('bpo', 8), t('voice process', 9),
    ],
  },
  {
    id: 'design',
    label: 'Design',
    related: ['marketing', 'product', 'content-writing'],
    terms: [
      t('graphic designer', 10), t('ui designer', 10), t('ux designer', 10),
      t('product designer', 9), t('visual designer', 9), t('illustrator', 8),
      t('motion designer', 9), t('design', 4),
    ],
  },
  {
    id: 'hr',
    label: 'Human Resources',
    related: ['operations'],
    terms: [
      t('human resources', 10), t('hr executive', 10), t('hr manager', 10),
      t('talent acquisition', 10), t('recruiter', 9), t('recruitment', 8),
      t('hr business partner', 10), t('payroll', 7), t('hrbp', 9),
    ],
  },
  {
    id: 'legal',
    label: 'Legal',
    related: ['compliance'],
    terms: [
      t('lawyer', 10), t('legal counsel', 10), t('paralegal', 9), t('advocate', 7),
      t('contracts manager', 8), t('legal associate', 9), t('company secretary', 8),
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    related: ['banking-operations', 'customer-support', 'logistics'],
    terms: [
      t('operations manager', 9), t('operations executive', 6), t('operations analyst', 7),
      t('back office', 7), t('process associate', 7), t('operations', 3),
    ],
  },
  {
    id: 'logistics',
    label: 'Logistics & Supply Chain',
    related: ['operations'],
    terms: [
      t('supply chain', 10), t('logistics', 9), t('warehouse', 9), t('procurement', 9),
      t('delivery executive', 9), t('fleet', 7),
    ],
  },
  {
    id: 'healthcare',
    label: 'Healthcare',
    related: [],
    terms: [
      t('nurse', 10), t('doctor', 9), t('physician', 10), t('pharmacist', 10),
      t('medical representative', 9), t('clinical', 7), t('healthcare', 7),
    ],
  },
  {
    id: 'education',
    label: 'Education',
    related: [],
    terms: [
      t('teacher', 10), t('tutor', 9), t('professor', 9), t('lecturer', 9),
      t('academic counselor', 9), t('trainer', 6), t('curriculum', 7),
    ],
  },
];

const BY_ID = new Map(TAXONOMY.map((c) => [c.id, c]));

export function categoryLabel(id: JobCategory): string {
  return BY_ID.get(id)?.label ?? 'Other';
}

/** Categories that satisfy a search for `id` (itself + related). */
export function relatedCategories(id: JobCategory): Set<JobCategory> {
  const def = BY_ID.get(id);
  return new Set<JobCategory>(def ? [def.id, ...def.related] : [id]);
}

// Word-boundary matcher; phrases match across whitespace/punctuation.
const matcherCache = new Map<string, RegExp>();
function termRegex(phrase: string): RegExp {
  let re = matcherCache.get(phrase);
  if (!re) {
    const escaped = phrase
      .split(/\s+/)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[\\s\\-/&,]+');
    re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
    matcherCache.set(phrase, re);
  }
  return re;
}

export function containsTerm(text: string, phrase: string): boolean {
  return termRegex(phrase).test(text);
}

export interface CategoryScore {
  category: JobCategory;
  /** Raw evidence weight (unbounded). */
  score: number;
  /** 0–100 share of total evidence — how sure we are. */
  confidence: number;
  /** Terms that fired (for "Why this job?"). */
  matched: string[];
}

export interface ClassifiedJob {
  /** Best category, 'other' when nothing fired. */
  category: JobCategory;
  confidence: number;
  /** All scoring categories, best first. */
  scores: CategoryScore[];
  matched: string[];
}

const TITLE_MULTIPLIER = 4;

/**
 * Classify a job by weighted taxonomy term hits. The title dominates: a
 * "Fraud Analyst" title outweighs a marketing description boilerplate.
 */
export function classifyJob(title: string, description: string, industry = ''): ClassifiedJob {
  const titleText = `${title} ${industry}`;
  // Cap description influence — long JDs mention everything.
  const descText = description.slice(0, 4000);
  const scores: CategoryScore[] = [];
  for (const def of TAXONOMY) {
    let score = 0;
    const matched: string[] = [];
    for (const [phrase, weight] of def.terms) {
      const inTitle = containsTerm(titleText, phrase);
      const inDesc = !inTitle && containsTerm(descText, phrase);
      if (inTitle) {
        score += weight * TITLE_MULTIPLIER;
        matched.push(phrase);
      } else if (inDesc) {
        score += weight;
        matched.push(phrase);
      }
    }
    if (score > 0) scores.push({ category: def.id, score, confidence: 0, matched });
  }
  scores.sort((a, b) => b.score - a.score);
  const total = scores.reduce((s, c) => s + c.score, 0);
  for (const c of scores) c.confidence = total ? Math.round((c.score / total) * 100) : 0;
  const best = scores[0];
  return {
    category: best?.category ?? 'other',
    confidence: best?.confidence ?? 0,
    scores,
    matched: best?.matched ?? [],
  };
}

/** Map a UI industry option (INDUSTRY_OPTIONS) to taxonomy categories. */
export const INDUSTRY_TO_CATEGORIES: Record<string, JobCategory[]> = {
  'Finance': ['finance-accounting', 'treasury', 'banking-operations', 'insurance', 'credit-risk', 'regulatory-reporting'],
  'Banking': ['banking-operations', 'kyc', 'credit-risk', 'treasury', 'finance-accounting'],
  'Risk & Compliance': ['risk', 'compliance', 'financial-crime', 'fraud', 'internal-audit', 'kyc', 'credit-risk', 'market-risk', 'model-risk', 'treasury', 'regulatory-reporting', 'esg-risk', 'cyber-risk'],
  'Technology': ['software', 'data', 'product', 'cyber-risk'],
  'Data & Analytics': ['data', 'model-risk', 'software'],
  'Consulting': ['consulting', 'risk', 'finance-accounting', 'project-management'],
  'Operations': ['operations', 'banking-operations', 'logistics', 'project-management'],
  'Marketing': ['marketing', 'content-writing', 'design'],
  'Sales': ['sales', 'marketing'],
  'Human Resources': ['hr'],
  'Healthcare': ['healthcare'],
  'Education': ['education'],
  'Legal': ['legal', 'compliance'],
  'Manufacturing': ['operations', 'logistics'],
  'Retail': ['sales', 'operations', 'logistics'],
};
