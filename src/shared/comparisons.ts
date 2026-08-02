/**
 * Comparison pages for the money side: FinatriX's calculators against the
 * budgeting apps and spreadsheets people actually weigh them against.
 *
 * The careers half of the site already has a comparison surface
 * (`RIVALS` in `publicPages.ts`), and this deliberately follows the same
 * editorial contract, because the contract is the hard part:
 *
 *   1. NO PRICES. Every product here changes its pricing, its tiers and its
 *      regional availability without notice. A page quoting a number is wrong
 *      within months and keeps ranking for years, and a stale price on a
 *      comparison page is a trust problem long before it is an SEO one. What is
 *      published instead is the pricing MODEL — subscription, licence, free with
 *      an account — which is stable, plus a link to the vendor's own page.
 *
 *   2. CATEGORY-LEVEL CLAIMS ONLY. Everything asserted about another product is
 *      a description of what kind of thing it is, not a claim about a specific
 *      feature, limit or bug. Feature sets move; categories do not.
 *
 *   3. THEIR STRENGTHS FIRST, AND HONESTLY. Each entry states where the other
 *      product is genuinely better before it says anything about FinatriX. A
 *      comparison page that cannot name a real advantage of the alternative is
 *      marketing wearing a comparison's clothes, and readers can tell.
 *
 *   4. NO CLAIM FINATRIX DOES NOT DELIVER. The calculators are educational
 *      models with no bank connection and no account requirement. That is a
 *      genuine limitation against every app on this list, and it is stated as
 *      one rather than reframed.
 *
 * Pure data. No DOM, no React — read by `publicPages.ts`, the sitemap and the
 * page components alike.
 */

export interface Alternative {
  slug: string;
  /** Display name of the other product. */
  name: string;
  /** What it fundamentally is. One sentence, category-level, verifiable. */
  category: string;
  /** The vendor's own site, so a reader can check anything that has moved. */
  site: string;
}

export const ALTERNATIVES: readonly Alternative[] = [
  {
    slug: 'ynab',
    name: 'YNAB',
    category:
      'a subscription budgeting app built around the zero-based, give-every-rupee-a-job method',
    site: 'https://www.ynab.com/',
  },
  {
    slug: 'monarch-money',
    name: 'Monarch Money',
    category:
      'a subscription personal-finance dashboard combining budgeting, net worth tracking and account aggregation',
    site: 'https://www.monarchmoney.com/',
  },
  {
    slug: 'copilot-money',
    name: 'Copilot Money',
    category:
      'a subscription personal-finance app for the Apple ecosystem, built around automatic categorisation and spending review',
    site: 'https://copilot.money/',
  },
  {
    slug: 'pocketsmith',
    name: 'PocketSmith',
    category:
      'a budgeting and cash-flow forecasting tool built around a calendar view of future balances',
    site: 'https://www.pocketsmith.com/',
  },
  {
    slug: 'excel',
    name: 'Excel',
    category:
      'a general-purpose spreadsheet, and the tool most personal finance has always actually been done in',
    site: 'https://www.microsoft.com/microsoft-365/excel',
  },
  {
    slug: 'google-sheets',
    name: 'Google Sheets',
    category:
      'a browser-based spreadsheet, free with a Google account and built for collaboration',
    site: 'https://www.google.com/sheets/about/',
  },
] as const;

/** Fast lookup by slug. */
const BY_SLUG = new Map(ALTERNATIVES.map((a) => [a.slug, a]));

export function alternativeFor(slug: string | undefined): Alternative | null {
  if (!slug) return null;
  return BY_SLUG.get(slug) ?? null;
}

/** The comparison hub's path. Every alternative sits one level under it. */
export const COMPARE_ROOT = '/compare';

export function alternativePath(alt: Pick<Alternative, 'slug'>): string {
  return `${COMPARE_ROOT}/${alt.slug}`;
}

/**
 * Every OTHER alternative, for the cross-link strip at the foot of each page.
 *
 * Derived rather than hand-listed, which is what makes the set of comparison
 * pages fully connected by construction: adding a seventh entry links it from
 * the six that already exist, with no edit to any of them.
 */
export function otherAlternatives(slug: string): readonly Alternative[] {
  return ALTERNATIVES.filter((a) => a.slug !== slug);
}
