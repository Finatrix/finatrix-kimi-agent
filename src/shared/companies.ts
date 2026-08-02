/**
 * Company intelligence: structured public pages for the financial institutions
 * and professional-services firms this platform's careers users target.
 *
 * WHAT IS AND IS NOT PUBLISHED HERE, and why the line is drawn where it is.
 *
 * These pages describe what a firm IS and how its hiring is SHAPED. They do not
 * publish headcounts, revenue, salary bands, current application deadlines,
 * office locations we cannot verify, or anything else that changes on a cycle
 * shorter than this page's review period. Three reasons, and the third is the
 * one that matters most:
 *
 *   1. It dates. A graduate deadline is wrong within a year and keeps ranking.
 *   2. It is unverifiable at our scale. We have no proprietary data on any of
 *      these employers, so any specific number would be borrowed from a source
 *      we cannot stand behind.
 *   3. It is the kind of claim a reader ACTS on. Someone who plans a campaign
 *      around a deadline we got wrong misses a cycle, which costs them a year.
 *      That is a materially worse failure than a vague page.
 *
 * So every page links to the employer's own careers site for anything current,
 * says so in as many words, and spends its own words on the parts that are
 * stable: how the firm is organised, what its divisions actually do, what shape
 * its graduate process takes, and where a career inside it tends to go.
 *
 * The related-reading links are DERIVED from `sector` rather than listed per
 * company. Twelve hand-maintained lists of article slugs would be twelve things
 * to update whenever a guide is added; one map from three sectors is one.
 *
 * Pure data. No DOM, no React.
 */

/**
 * What kind of employer this is. Drives the related-reading set and nothing
 * else — it is a hiring-shape classification, not a judgement about the firm.
 */
export type Sector = 'universal-bank' | 'investment-bank' | 'professional-services';

export const SECTORS: Record<Sector, { name: string; blurb: string }> = {
  'universal-bank': {
    name: 'Universal banks',
    blurb:
      'Retail, business and institutional banking under one group. The widest range of entry routes of any employer type here, and the largest non-front-office intakes.',
  },
  'investment-bank': {
    name: 'Investment banks',
    blurb:
      'Advisory, markets and asset management, plus the large technology, risk and operations functions that support them. Structured graduate hiring on a fixed annual calendar.',
  },
  'professional-services': {
    name: 'Professional services',
    blurb:
      'Audit, tax, consulting and advisory. The largest graduate intakes of any employer type, and the widest range of first-role work.',
  },
};

/**
 * Which guides matter for each sector, by `<topic>/<slug>`.
 *
 * One map instead of twelve per-company lists. `companies.test.ts` asserts every
 * key resolves to a registered article, so a renamed guide fails a test rather
 * than rendering a dead link on twelve pages at once.
 */
const READING_BY_SECTOR: Record<Sector, readonly string[]> = {
  'universal-bank': [
    'banking-careers/banking-divisions',
    'banking-careers/first-ten-years',
    'risk-compliance-careers/risk-career-paths',
    'aml-financial-crime/aml-analyst-role',
    'graduate-programs/application-stages',
  ],
  'investment-bank': [
    'banking-careers/banking-divisions',
    'technical-interviews/finance-technical-questions',
    'technical-interviews/modelling-tests',
    'graduate-programs/graduate-timeline',
    'assessment-centres/assessment-centre-format',
  ],
  'professional-services': [
    'consulting-careers/consulting-ladder',
    'consulting-careers/case-interviews',
    'graduate-programs/application-stages',
    'assessment-centres/group-exercises',
    'behavioural-interviews/competency-frameworks',
  ],
};

export interface Company {
  slug: string;
  /** Display name, as the firm writes it. */
  name: string;
  sector: Sector;
  /** One sentence on what the firm fundamentally is. Category-level, stable. */
  overview: string;
  /** The firm's own careers site — the only current source for anything specific. */
  careersSite: string;
}

export const COMPANIES: readonly Company[] = [
  /* ── Australian universal banks ──────────────────────────────────────── */
  {
    slug: 'anz',
    name: 'ANZ',
    sector: 'universal-bank',
    overview:
      'One of Australia’s major banks, operating retail and commercial banking domestically alongside an institutional business with a significant presence across Asia-Pacific.',
    careersSite: 'https://www.anz.com/careers/',
  },
  {
    slug: 'commonwealth-bank',
    name: 'Commonwealth Bank',
    sector: 'universal-bank',
    overview:
      'Australia’s largest bank by customer base, weighted heavily toward retail and business banking, with a long-standing emphasis on technology and digital channels.',
    careersSite: 'https://www.commbank.com.au/about-us/careers.html',
  },
  {
    slug: 'westpac',
    name: 'Westpac',
    sector: 'universal-bank',
    overview:
      'One of Australia’s major banks, operating consumer, business and institutional divisions alongside a group of long-established regional banking brands.',
    careersSite: 'https://www.westpac.com.au/about-westpac/careers/',
  },
  {
    slug: 'nab',
    name: 'NAB',
    sector: 'universal-bank',
    overview:
      'One of Australia’s major banks with a particularly strong position in business and commercial banking, alongside consumer and corporate divisions.',
    careersSite: 'https://www.nab.com.au/about-us/careers',
  },

  /* ── Investment banks and global financial groups ────────────────────── */
  {
    slug: 'macquarie',
    name: 'Macquarie Group',
    sector: 'investment-bank',
    overview:
      'A global financial group spanning asset management, banking, commodities and markets, and infrastructure and green investment — structurally unlike a conventional retail bank.',
    careersSite: 'https://www.macquarie.com/au/en/about/careers.html',
  },
  {
    slug: 'goldman-sachs',
    name: 'Goldman Sachs',
    sector: 'investment-bank',
    overview:
      'A global investment bank and asset manager, best known for advisory and markets, with very large engineering, risk and operations divisions that hire in far greater numbers.',
    careersSite: 'https://www.goldmansachs.com/careers/',
  },
  {
    slug: 'jp-morgan',
    name: 'J.P. Morgan',
    sector: 'investment-bank',
    overview:
      'One of the largest global financial institutions, combining a major investment bank with substantial commercial, consumer and asset-management businesses — and one of the largest technology employers in the sector.',
    careersSite: 'https://careers.jpmorgan.com/',
  },
  {
    slug: 'morgan-stanley',
    name: 'Morgan Stanley',
    sector: 'investment-bank',
    overview:
      'A global investment bank with a distinctive weighting toward wealth and investment management alongside its institutional securities business.',
    careersSite: 'https://www.morganstanley.com/careers',
  },

  /* ── Professional services ───────────────────────────────────────────── */
  {
    slug: 'deloitte',
    name: 'Deloitte',
    sector: 'professional-services',
    overview:
      'One of the four largest professional-services networks, spanning audit and assurance, consulting, financial advisory, risk advisory and tax, organised as member firms by country.',
    careersSite: 'https://www.deloitte.com/global/en/careers.html',
  },
  {
    slug: 'pwc',
    name: 'PwC',
    sector: 'professional-services',
    overview:
      'One of the four largest professional-services networks, structured around assurance, tax and advisory, and organised as a network of member firms by territory.',
    careersSite: 'https://www.pwc.com/gx/en/careers.html',
  },
  {
    slug: 'ey',
    name: 'EY',
    sector: 'professional-services',
    overview:
      'One of the four largest professional-services networks, organised around assurance, consulting, strategy and transactions, and tax, operating as member firms by region.',
    careersSite: 'https://www.ey.com/en_gl/careers',
  },
  {
    slug: 'kpmg',
    name: 'KPMG',
    sector: 'professional-services',
    overview:
      'One of the four largest professional-services networks, organised around audit, tax and advisory, and operating as member firms by country.',
    careersSite: 'https://kpmg.com/xx/en/careers.html',
  },
];

/** Fast lookup by slug. */
const BY_SLUG = new Map(COMPANIES.map((c) => [c.slug, c]));

export function companyFor(slug: string | undefined): Company | null {
  if (!slug) return null;
  return BY_SLUG.get(slug) ?? null;
}

/** The company hub's path. Every company sits one level under it. */
export const COMPANIES_ROOT = '/companies';

export function companyPath(company: Pick<Company, 'slug'>): string {
  return `${COMPANIES_ROOT}/${company.slug}`;
}

export function companiesInSector(sector: Sector): readonly Company[] {
  return COMPANIES.filter((c) => c.sector === sector);
}

/**
 * The guides worth reading before applying to this company, derived from its
 * sector rather than listed per company. Returns `<topic>/<slug>` keys, which
 * the page resolves through `contentLinkFor`.
 */
export function readingForCompany(company: Company): readonly string[] {
  return READING_BY_SECTOR[company.sector];
}

/**
 * Peers in the same sector, for the cross-link strip. Derived, so a new company
 * is linked from the others the day it is added.
 */
export function peersOf(company: Company): readonly Company[] {
  return companiesInSector(company.sector).filter((c) => c.slug !== company.slug);
}

