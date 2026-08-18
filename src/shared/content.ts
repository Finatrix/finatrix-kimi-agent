/**
 * The knowledge layer's INDEX: which URLs exist, what they are called, and how
 * they relate to each other.
 *
 * One registry, read by every consumer that needs to agree about a URL:
 *
 *   1. `src/lib/seo.ts`               — title, description, canonical, JSON-LD
 *   2. `src/shared/routes.ts`         — whether the edge Worker answers 200
 *   3. `src/shared/sitemap.ts`        — sitemap.xml
 *   4. `src/learn/*`                  — the rendered hub, topic and article pages
 *   5. `src/sections/LandingFooter`   — site-wide discovery
 *
 * WHY THE COPY IS NOT HERE. This module is EAGER — `seo.ts` sits on the landing
 * critical path, `routes.ts` is bundled into the Cloudflare Worker, and the
 * footer renders on every public page. So it carries only what a URL needs in
 * order to exist: slug, title, description, dates and relationships. Roughly
 * 250 bytes an entry.
 *
 * Everything long-form — a topic's cornerstone intro, its vocabulary and its
 * FAQ; an article's summary, key points, FAQ and body — lives in
 * `src/content/<topic>.ts` and is reached through a dynamic import, one chunk
 * per topic. That split is not stylistic: measured on the first three topics,
 * the editorial copy was already the largest single contributor to the entry
 * chunk, and at this registry's full size it would have added ~65 kB gzipped to
 * a 94 kB landing bundle — to ship prose the landing page never renders. See
 * the long note in `src/content/types.ts`.
 *
 * `content.test.ts` fails if an index entry has no copy, if copy has no entry,
 * or if any internal link in the prose points at a URL the router does not
 * serve — so the split cannot rot into a 404 or a header with nothing under it.
 *
 * Pure data. No DOM, no React, no Node.
 */

import { publicPageFor } from './publicPages';
import type { ToolId } from './routes';

/* ------------------------------------------------------------------------- *
 * Editorial identity
 * ------------------------------------------------------------------------- */

/**
 * The author entity behind every article.
 *
 * Deliberately ONE editorial entity rather than invented bylines. E-E-A-T
 * guidance rewards a named, accountable author, and the honest version of that
 * for a small team is to say so and to publish the standards the work is held
 * to — which is what `/editorial-standards` does. Inventing personas to satisfy
 * a schema field would be the exact opposite of the trust the rest of this site
 * is built on.
 */
export const AUTHOR = {
  name: 'The FinatriX Editorial Team',
  /**
   * Where the methodology, review cadence and correction policy are published.
   *
   * Registered in `publicPages.ts` rather than here: it is a statement about how
   * the whole site is written, not a guide. `content.test.ts` asserts this path
   * resolves, because an author node whose `url` 404s is worse than no author
   * node.
   */
  url: '/editorial-standards',
  description:
    'FinatriX is written and reviewed by the people who build its calculators. Every figure in an article is one the tools themselves compute.',
} as const;

/* ------------------------------------------------------------------------- *
 * Topics
 * ------------------------------------------------------------------------- */

/**
 * The two halves of the platform. A cluster is a grouping on the hub, not a URL
 * segment — `/learn/budgeting` rather than `/learn/money/budgeting`, because an
 * extra segment adds depth without adding meaning.
 */
export type Cluster = 'money' | 'careers';

export const CLUSTERS: Record<Cluster, { name: string; blurb: string }> = {
  money: {
    name: 'Money',
    blurb:
      'How budgeting, saving, investing, debt, tax and retirement actually work in India — with the arithmetic shown, not asserted.',
  },
  careers: {
    name: 'Careers',
    blurb:
      'Resumes that survive an ATS, interviews you can prepare for, and a job search run as a process rather than a scroll.',
  },
};

export interface Topic {
  /** URL segment. `/learn/<slug>`. */
  slug: string;
  cluster: Cluster;
  /** Short label — breadcrumbs, cards, related strips. */
  name: string;
  /** Full `<title>`, brand-suffixed, ≤ 70 chars. */
  title: string;
  /** `<meta name="description">`, 50–165 chars. */
  description: string;
  /** Visible H1. */
  heading: string;
  /** The one-sentence lede under the H1. */
  lede: string;
  /**
   * Calculators that do this topic's arithmetic. Rendered as a related-tools
   * strip.
   *
   * Optional, and empty on most careers topics for an honest reason: none of the
   * calculators computes anything about a resume or an interview, and
   * pointing a reader at one that does not would be a link written for a crawler
   * rather than for them. `content.test.ts` requires every MONEY topic to name
   * at least one, and every careers topic to name at least one product page
   * instead.
   */
  tools?: readonly ToolId[];
  /**
   * Public product pages this topic's reader should see next — the careers
   * cluster's equivalent of `tools`.
   *
   * Paths, not labels, resolved through `publicPageFor` so a strip can never
   * name a page something the page does not call itself, and a path that stops
   * being registered fails a test rather than rendering a link into a 404.
   */
  product?: readonly string[];
  /**
   * Surface this topic in the site footer.
   *
   * The footer is the site-wide discovery surface, and it is the one place where
   * "link everything" stops being free: thirty-one topic links on every page
   * dilutes the signal each one carries and adds a wall of text below every
   * article. Pillar topics are the entry points; every other topic is one click
   * away via `/learn`, which the footer always links. `content.test.ts` caps how
   * many a cluster may mark, so this cannot quietly become "all of them".
   */
  pillar?: boolean;
  /** ISO date the hub copy was last reviewed. */
  updated: string;
}

const REVIEWED = '2026-08-01';

export const TOPICS: readonly Topic[] = [
  /* ── Money ───────────────────────────────────────────────────────────── */
  {
    slug: 'budgeting',
    cluster: 'money',
    name: 'Budgeting',
    title: 'Budgeting Guides — Plans That Survive a Real Month | FinatriX',
    description:
      'How to build a budget that holds up in an Indian city: the 50/30/20 frame, why it breaks on metro rent, and what to do about the categories that overshoot.',
    heading: 'Budgeting',
    lede: 'A budget is a hypothesis about next month. These guides are about making one you will still be following in week three.',
    tools: ['budget', 'expenses', 'peercompare'],
    pillar: true,
    updated: REVIEWED,
  },
  {
    slug: 'saving',
    cluster: 'money',
    name: 'Saving',
    title: 'Saving & Emergency Funds — How Much and Where | FinatriX',
    description:
      'How large an emergency fund should be in India, where to keep it so it stays available, and how to reach a savings target without guessing at the instalment.',
    heading: 'Saving',
    lede: 'Saving is two separate problems — how much, and where it sits until you need it. They have different answers.',
    tools: ['parksmart', 'goals', 'budget'],
    pillar: true,
    updated: REVIEWED,
  },
  {
    slug: 'investing',
    cluster: 'money',
    name: 'Investing',
    title: 'Investing Guides — SIPs, Allocation and Risk | FinatriX',
    description:
      'How SIPs, asset allocation and risk actually work, with the formulas shown. Education-first investing guides for India — never a recommendation to buy anything.',
    heading: 'Investing',
    lede: 'The arithmetic of investing is simple and public. These guides show it, so you can check the numbers anyone quotes you.',
    tools: ['investmatch', 'goals', 'lifemap'],
    pillar: true,
    updated: REVIEWED,
  },
  {
    slug: 'tax',
    cluster: 'money',
    name: 'Tax',
    title: 'Tax Guides — Regimes, Slabs and Capital Gains | FinatriX',
    description:
      'How income tax actually reaches your bank account in India: the two regimes, what each deduction is worth, and how investment gains are taxed differently.',
    heading: 'Tax',
    lede: 'Tax is the largest deduction most people never model. These guides show where it lands and what genuinely changes it.',
    tools: ['parksmart', 'budget'],
    pillar: true,
    updated: REVIEWED,
  },
  {
    slug: 'debt',
    cluster: 'money',
    name: 'Debt',
    title: 'Debt Guides — Payoff Order and What Interest Costs | FinatriX',
    description:
      'Which debt to clear first and why, what a revolving credit card balance really costs per month, and when clearing a balance beats any investment.',
    heading: 'Debt',
    lede: 'Debt is arithmetic with a deadline. These guides show the order to clear it in — which is rarely the order that feels best.',
    tools: ['budget', 'expenses'],
    updated: REVIEWED,
  },
  {
    slug: 'loans',
    cluster: 'money',
    name: 'Loans',
    title: 'Loan Guides — EMI Maths, Tenure and Prepayment | FinatriX',
    description:
      'The EMI formula every loan calculator runs, what tenure does to total interest, and how to decide between prepaying a loan and investing the same rupee.',
    heading: 'Loans',
    lede: 'A loan is one formula and three decisions: how much, how long, and what to do with a surplus.',
    tools: ['budget', 'goals'],
    updated: REVIEWED,
  },
  {
    slug: 'credit-scores',
    cluster: 'money',
    name: 'Credit scores',
    title: 'Credit Scores — What Moves Them, What Does Not | FinatriX',
    description:
      'What a credit score is built from in India, which habits move it and how quickly, and how to find and correct an error on your own credit report.',
    heading: 'Credit scores',
    lede: 'A credit score summarises how you have handled borrowed money. Most of what people believe moves it does not.',
    tools: ['budget'],
    updated: REVIEWED,
  },
  {
    slug: 'insurance',
    cluster: 'money',
    name: 'Insurance',
    title: 'Insurance Guides — Sizing Term and Health Cover | FinatriX',
    description:
      'How much term cover a household actually needs, how health cover works in India, and which policies are protection rather than investment in disguise.',
    heading: 'Insurance',
    lede: 'Insurance is the cheapest way to stop one bad event undoing a decade of saving — and the most oversold category in the country.',
    tools: ['lifemap', 'budget'],
    updated: REVIEWED,
  },
  {
    slug: 'retirement',
    cluster: 'money',
    name: 'Retirement',
    title: 'Retirement Guides — Corpus Size and Withdrawals | FinatriX',
    description:
      'How large a retirement corpus needs to be, what a sustainable withdrawal rate looks like in India, and why the target moves every year with inflation.',
    heading: 'Retirement',
    lede: 'Retirement planning is two numbers: what the corpus has to be, and what you can safely take out of it each year.',
    tools: ['lifemap', 'goals', 'investmatch'],
    pillar: true,
    updated: REVIEWED,
  },
  {
    slug: 'epf-nps',
    cluster: 'money',
    name: 'EPF & NPS',
    title: 'EPF and NPS — India’s Retirement Accounts, Compared | FinatriX',
    description:
      'How EPF and NPS work, what each keeps after tax, and how India’s retirement accounts compare with an Australian-style superannuation system.',
    heading: 'EPF & NPS',
    lede: 'The two accounts most Indian salaries already pay into — what they actually return, and how they compare with super abroad.',
    tools: ['goals', 'lifemap'],
    updated: REVIEWED,
  },
  {
    slug: 'inflation',
    cluster: 'money',
    name: 'Inflation',
    title: 'Inflation Guides — Real Returns and Goal Planning | FinatriX',
    description:
      'What inflation does to a savings balance, how to convert a nominal return into a real one, and why a goal set in today’s money is systematically under-funded.',
    heading: 'Inflation',
    lede: 'Inflation is the quiet term in every calculation. Leave it out and every long-horizon number is wrong in the same direction.',
    tools: ['goals', 'parksmart', 'lifemap'],
    updated: REVIEWED,
  },
  {
    slug: 'behavioural-finance',
    cluster: 'money',
    name: 'Behavioural finance',
    title: 'Behavioural Finance — Why Good Plans Get Abandoned | FinatriX',
    description:
      'The behaviour that decides most financial outcomes: selling at the bottom, lifestyle creep, and the biases that make both feel entirely reasonable at the time.',
    heading: 'Behavioural finance',
    lede: 'The arithmetic of investing is easy. Staying with it through a bad year is the part that actually decides the outcome.',
    tools: ['expenses', 'investmatch'],
    updated: REVIEWED,
  },
  {
    slug: 'cash-flow',
    cluster: 'money',
    name: 'Cash flow',
    title: 'Cash Flow Guides — Timing, Gaps and Annual Lumps | FinatriX',
    description:
      'Why a solvent household still runs out of money mid-month, how to close the timing gap for good, and how to spread annual bills across twelve months.',
    heading: 'Cash flow',
    lede: 'Most money problems that feel like income problems are timing problems, and timing problems have a cheaper fix.',
    tools: ['expenses', 'budget'],
    updated: REVIEWED,
  },
  {
    slug: 'net-worth',
    cluster: 'money',
    name: 'Net worth',
    title: 'Net Worth — How to Calculate and Track It Honestly | FinatriX',
    description:
      'What counts as an asset, what counts as a liability, how to calculate net worth without flattering it, and what a reasonable trajectory looks like by decade.',
    heading: 'Net worth',
    lede: 'Net worth is the one number that summarises every financial decision you have made. It is also the easiest one to flatter.',
    tools: ['networth', 'lifemap', 'peercompare'],
    updated: REVIEWED,
  },
  {
    slug: 'financial-independence',
    cluster: 'money',
    name: 'Financial independence',
    title: 'Financial Independence — The FI Number, Worked | FinatriX',
    description:
      'What financial independence actually requires: the arithmetic behind an FI number, what each savings rate implies for the timeline, and what Coast FI changes.',
    heading: 'Financial independence',
    lede: 'Financial independence is a savings-rate problem long before it is an investment-return problem.',
    tools: ['lifemap', 'goals', 'investmatch'],
    updated: REVIEWED,
  },

  /* ── Careers ─────────────────────────────────────────────────────────── */
  {
    slug: 'resume',
    cluster: 'careers',
    name: 'Resume',
    title: 'Resume Guides — Structure, Evidence and Length | FinatriX',
    description:
      'How to structure a resume a human will actually read, how to turn a list of responsibilities into evidence, and what length suits your years of experience.',
    heading: 'Resume',
    lede: 'A resume has one job: to make a stranger confident enough to spend thirty minutes with you.',
    product: ['/careers/features', '/careers'],
    pillar: true,
    updated: REVIEWED,
  },
  {
    slug: 'ats',
    cluster: 'careers',
    name: 'ATS',
    title: 'ATS Guides — How Applicant Tracking Really Works | FinatriX',
    description:
      'What an applicant tracking system does and does not do, which formatting choices genuinely break parsing, and how to test your own resume against one.',
    heading: 'ATS',
    lede: 'Most ATS advice is folklore. This is what the software actually does with your file, and what it never does.',
    product: ['/careers/features', '/careers'],
    pillar: true,
    updated: REVIEWED,
  },
  {
    slug: 'cover-letters',
    cluster: 'careers',
    name: 'Cover letters',
    title: 'Cover Letters — Structure and When They Count | FinatriX',
    description:
      'A four-paragraph structure that works, how to find the one specific thing worth saying about an employer, and when a cover letter changes nothing at all.',
    heading: 'Cover letters',
    lede: 'Most cover letters go unread. The ones that are read are read for one reason, and it is not enthusiasm.',
    product: ['/careers/features'],
    updated: REVIEWED,
  },
  {
    slug: 'interview-preparation',
    cluster: 'careers',
    name: 'Interview preparation',
    title: 'Interview Preparation — A System, Not a Script | FinatriX',
    description:
      'How to prepare for interviews as a repeatable process: the evidence bank, the company research that actually matters, and the questions worth asking back.',
    heading: 'Interview preparation',
    lede: 'Interview preparation is a system you build once and reuse, not a script you memorise for each company.',
    product: ['/careers/features', '/careers'],
    pillar: true,
    updated: REVIEWED,
  },
  {
    slug: 'behavioural-interviews',
    cluster: 'careers',
    name: 'Behavioural interviews',
    title: 'Behavioural Interviews — STAR and Competencies | FinatriX',
    description:
      'How behavioural interviews are actually scored, how to build STAR answers that survive follow-up questions, and what a competency framework is looking for.',
    heading: 'Behavioural interviews',
    lede: 'A behavioural interview is a scoring exercise against a written framework. Knowing the framework changes how you prepare.',
    product: ['/careers/features'],
    updated: REVIEWED,
  },
  {
    slug: 'technical-interviews',
    cluster: 'careers',
    name: 'Technical interviews',
    title: 'Technical Interviews for Finance and Risk Roles | FinatriX',
    description:
      'What technical interviews test in finance and risk roles, how modelling and case tests are marked, and how to prepare without memorising trivia lists.',
    heading: 'Technical interviews',
    lede: 'A technical interview is not a quiz. It is a check that you can reason out loud under mild pressure.',
    product: ['/careers/features'],
    updated: REVIEWED,
  },
  {
    slug: 'graduate-programs',
    cluster: 'careers',
    name: 'Graduate programs',
    title: 'Graduate Programs — Timeline, Stages and Odds | FinatriX',
    description:
      'How graduate hiring cycles work, what each application stage is really filtering for, and how to run a campaign across several employers without burning out.',
    heading: 'Graduate programs',
    lede: 'A graduate program is a hiring pipeline with a fixed calendar. Missing the calendar costs a year.',
    product: ['/careers/features', '/careers'],
    updated: REVIEWED,
  },
  {
    slug: 'banking-careers',
    cluster: 'careers',
    name: 'Banking careers',
    title: 'Banking Careers — Divisions, Paths and Entry Points | FinatriX',
    description:
      'What each division of a bank actually does, which roles are realistic entry points, and how a banking career progresses over its first ten years.',
    heading: 'Banking careers',
    lede: 'A bank is a dozen different businesses under one brand. Choosing between them matters more than choosing the bank.',
    product: ['/careers/features', '/careers'],
    pillar: true,
    updated: REVIEWED,
  },
  {
    slug: 'risk-compliance-careers',
    cluster: 'careers',
    name: 'Risk & compliance',
    title: 'Risk and Compliance Careers — Roles and Paths | FinatriX',
    description:
      'How risk and compliance functions are organised, what credit, market and operational risk analysts actually do, and what the career ladder looks like.',
    heading: 'Risk & compliance careers',
    lede: 'Risk and compliance are the two functions that grow whenever regulation does — which is most of the time.',
    product: ['/careers/features', '/careers'],
    updated: REVIEWED,
  },
  {
    slug: 'aml-financial-crime',
    cluster: 'careers',
    name: 'AML & financial crime',
    title: 'AML and Financial Crime Careers — Roles and Entry | FinatriX',
    description:
      'What an AML analyst does day to day, how transaction monitoring and KYC teams are structured, and which certifications employers genuinely ask for.',
    heading: 'AML & financial crime careers',
    lede: 'Financial crime is one of the largest entry-level hiring pools in banking, and the least understood from outside it.',
    product: ['/careers/features', '/careers'],
    updated: REVIEWED,
  },
  {
    slug: 'consulting-careers',
    cluster: 'careers',
    name: 'Consulting careers',
    title: 'Consulting Careers — Firms, Ladders and Case Prep | FinatriX',
    description:
      'How consulting firms are structured, what the analyst-to-partner ladder actually involves, and how to prepare for a case interview from a standing start.',
    heading: 'Consulting careers',
    lede: 'Consulting hires for one specific way of thinking, and it tests for it in a format you can practise.',
    product: ['/careers/features'],
    updated: REVIEWED,
  },
  {
    slug: 'networking',
    cluster: 'careers',
    name: 'Networking',
    title: 'Networking Guides — For People Who Know Nobody | FinatriX',
    description:
      'How to run an informational interview that leads somewhere, what to say when you have no contacts at all, and why referrals outperform cold applications.',
    heading: 'Networking',
    lede: 'Networking is not a personality trait. It is a small number of specific, repeatable actions.',
    product: ['/careers/features'],
    updated: REVIEWED,
  },
  {
    slug: 'linkedin',
    cluster: 'careers',
    name: 'LinkedIn',
    title: 'LinkedIn Guides — Profiles Recruiters Actually Find | FinatriX',
    description:
      'How recruiters really search LinkedIn, which profile fields carry weight in that search, and how to write outreach a stranger will answer.',
    heading: 'LinkedIn',
    lede: 'LinkedIn is a search engine recruiters query. A profile either matches those queries or it does not.',
    product: ['/careers/compare', '/careers/features'],
    updated: REVIEWED,
  },
  {
    slug: 'assessment-centres',
    cluster: 'careers',
    name: 'Assessment centres',
    title: 'Assessment Centres — Format, Exercises, Scoring | FinatriX',
    description:
      'What happens in an assessment centre, how each exercise is scored separately, and how to handle a group exercise without dominating it or disappearing.',
    heading: 'Assessment centres',
    lede: 'An assessment centre is several tests in one day, each scored separately against a published framework.',
    product: ['/careers/features'],
    updated: REVIEWED,
  },
  {
    slug: 'salary-negotiation',
    cluster: 'careers',
    name: 'Salary negotiation',
    title: 'Salary Negotiation — Offers, Bands and Packages | FinatriX',
    description:
      'How to negotiate an offer without putting it at risk, how salary bands are actually set, and how to compare two packages that are not directly comparable.',
    heading: 'Salary negotiation',
    lede: 'The salary you negotiate once compounds through every percentage raise that follows it.',
    tools: ['budget', 'lifemap'],
    product: ['/careers/features'],
    updated: REVIEWED,
  },
  {
    slug: 'international-students',
    cluster: 'careers',
    name: 'International students',
    title: 'International Students — Visas, Timing, Job Search | FinatriX',
    description:
      'How to run a job search on a study visa, when employers actually ask about sponsorship, and how to answer a visa question without losing the room.',
    heading: 'International students',
    lede: 'A visa is a constraint on timing and on employer choice, not a disqualification. Planning around it early is what makes it manageable.',
    product: ['/careers/features', '/careers'],
    updated: REVIEWED,
  },
];

/** Fast lookup by slug. */
const TOPIC_BY_SLUG = new Map(TOPICS.map((t) => [t.slug, t]));

export function topicFor(slug: string | undefined): Topic | null {
  if (!slug) return null;
  return TOPIC_BY_SLUG.get(slug) ?? null;
}

/** Topics surfaced in the site footer, in registry order. See `Topic.pillar`. */
export const PILLAR_TOPICS: readonly Topic[] = TOPICS.filter((t) => t.pillar);

/**
 * A topic's product strip, resolved against the public-page registry.
 *
 * Returns only paths that are still registered, so removing a marketing page
 * drops the link rather than rendering one into a 404 — the same contract
 * `contentLinkFor` and `RelatedPages` already follow.
 */
export function productLinksFor(
  topic: Topic,
): Array<{ path: string; name: string; blurb: string }> {
  return (topic.product ?? [])
    .map((path) => {
      const page = publicPageFor(path);
      return page ? { path: page.path, name: page.name, blurb: page.lede ?? page.description } : null;
    })
    .filter((p) => p !== null);
}

/* ------------------------------------------------------------------------- *
 * Articles
 * ------------------------------------------------------------------------- */

/**
 * What kind of thing the article is. Chooses the schema.org type and nothing
 * else: a `howto` really does describe an ordered procedure, and marking an
 * explainer as one would be a false claim about the page's shape.
 */
export type ArticleKind = 'explainer' | 'howto' | 'comparison';

export interface Article {
  /** URL segment within the topic. `/learn/<topic>/<slug>`. */
  slug: string;
  /** Owning topic slug. One topic per article — the breadcrumb has to be a tree. */
  topic: string;
  kind: ArticleKind;
  /** Full `<title>`, brand-suffixed, ≤ 70 chars. */
  title: string;
  /** Visible H1. Longer and more natural than the title. */
  heading: string;
  /**
   * Short label for the last breadcrumb.
   *
   * Separate from `heading` because a breadcrumb is a navigational label, not a
   * headline — "The formula behind every SIP calculator, worked through" wraps
   * to three lines in a crumb strip. Read by BOTH the visible trail and the
   * `BreadcrumbList` JSON-LD, so the markup always describes the crumb the page
   * really shows; `content.test.ts` pins that.
   */
  crumb: string;
  /** `<meta name="description">`, 50–165 chars. */
  description: string;
  published: string;
  updated: string;
  /** Calculators that do this article's arithmetic. */
  tools?: readonly ToolId[];
  /** Hand-picked sibling articles, by `<topic>/<slug>`. Never "every other article". */
  related?: readonly string[];
}

export const ARTICLES: readonly Article[] = [
  /* ── Budgeting ───────────────────────────────────────────────────────── */
  {
    slug: '50-30-20-rule',
    topic: 'budgeting',
    kind: 'explainer',
    title: 'The 50/30/20 Rule, Tested Against Indian Rents | FinatriX',
    description:
      'What the 50/30/20 budget rule is, the arithmetic behind it, and why it breaks in Mumbai and Bengaluru — plus what to hold constant when it does.',
    heading: 'The 50/30/20 rule, and what to do when your rent breaks it',
    crumb: 'The 50/30/20 rule',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['budget', 'expenses'],
    related: ['budgeting/track-expenses-that-stick', 'saving/emergency-fund-size'],
  },
  {
    slug: 'track-expenses-that-stick',
    topic: 'budgeting',
    kind: 'howto',
    title: 'How to Track Expenses Without Giving Up in Week Two | FinatriX',
    description:
      'A four-week method for tracking spending that survives contact with a real month, and how to read the result for the one category that is actually the problem.',
    heading: 'How to track expenses in a way that survives week two',
    crumb: 'Tracking expenses',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['expenses', 'budget'],
    related: ['budgeting/50-30-20-rule', 'budgeting/cut-spending-without-misery'],
  },
  {
    slug: 'cut-spending-without-misery',
    topic: 'budgeting',
    kind: 'explainer',
    title: 'Cutting Spending: Fixed Costs Beat Daily Discipline | FinatriX',
    description:
      'Why cutting one fixed cost usually beats a year of daily restraint, how to find the ones worth attacking, and the arithmetic that shows the difference.',
    heading: 'Cut one fixed cost, not a hundred small pleasures',
    crumb: 'Cutting spending',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['expenses', 'budget', 'peercompare'],
    related: ['budgeting/track-expenses-that-stick', 'saving/where-to-park-short-term-cash'],
  },
  {
    slug: 'zero-based-budgeting',
    topic: 'budgeting',
    kind: 'howto',
    title: 'Zero-Based Budgeting: Give Every Rupee a Job | FinatriX',
    description:
      'How zero-based budgeting works, when it beats a percentage frame like 50/30/20, and the two failure modes that make people abandon it in month two.',
    heading: 'Zero-based budgeting, and when it is worth the extra work',
    crumb: 'Zero-based budgeting',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['budget', 'expenses'],
    related: ['budgeting/50-30-20-rule', 'cash-flow/annual-lumps'],
  },

  /* ── Saving ──────────────────────────────────────────────────────────── */
  {
    slug: 'emergency-fund-size',
    topic: 'saving',
    kind: 'explainer',
    title: 'How Big Should Your Emergency Fund Be? | FinatriX',
    description:
      'How to size an emergency fund on essential expenses rather than income, what changes the number, and why three months is the wrong answer for many households.',
    heading: 'How big should an emergency fund actually be?',
    crumb: 'Emergency fund size',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['parksmart', 'budget', 'peercompare'],
    related: ['saving/where-to-park-short-term-cash', 'budgeting/50-30-20-rule'],
  },
  {
    slug: 'where-to-park-short-term-cash',
    topic: 'saving',
    kind: 'comparison',
    title: 'Where to Park Short-Term Cash in India, Post-Tax | FinatriX',
    description:
      'Savings accounts, liquid funds, FDs, T-bills and arbitrage funds compared on what you keep after tax — and why the ranking changes with your slab.',
    heading: 'Where to park cash you need back within three years',
    crumb: 'Parking short-term cash',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['parksmart', 'goals'],
    related: ['saving/emergency-fund-size', 'investing/sip-maths'],
  },
  {
    slug: 'sinking-funds',
    topic: 'saving',
    kind: 'howto',
    title: 'Sinking Funds: Save for the Bills You Know Are Coming | FinatriX',
    description:
      'How to turn insurance renewals, festivals, travel and school fees into a flat monthly number, so the predictable expenses stop feeling like emergencies.',
    heading: 'Sinking funds, or how to stop annual bills ambushing you',
    crumb: 'Sinking funds',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['budget', 'goals'],
    related: ['cash-flow/annual-lumps', 'saving/emergency-fund-size'],
  },

  /* ── Investing ───────────────────────────────────────────────────────── */
  {
    slug: 'sip-maths',
    topic: 'investing',
    kind: 'explainer',
    title: 'SIP Maths: The Formula Behind Every SIP Calculator | FinatriX',
    description:
      'The annuity-due formula every SIP calculator runs, worked through with real numbers — plus why a step-up SIP lowers the instalment so sharply.',
    heading: 'The formula behind every SIP calculator, worked through',
    crumb: 'SIP maths',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['goals', 'investmatch'],
    related: ['investing/asset-allocation-basics', 'saving/where-to-park-short-term-cash'],
  },
  {
    slug: 'asset-allocation-basics',
    topic: 'investing',
    kind: 'explainer',
    title: 'Asset Allocation: Why Horizon Beats Risk Appetite | FinatriX',
    description:
      'What asset allocation is, why it explains most of a portfolio’s behaviour, and why a short horizon should override a high stated risk appetite every time.',
    heading: 'Asset allocation, and why your horizon outranks your risk appetite',
    crumb: 'Asset allocation',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['investmatch', 'lifemap', 'goals'],
    related: ['investing/sip-maths', 'saving/emergency-fund-size'],
  },
  {
    slug: 'expense-ratios',
    topic: 'investing',
    kind: 'explainer',
    title: 'What an Expense Ratio Costs Over Twenty Years | FinatriX',
    description:
      'How a fund’s expense ratio is charged, what one percentage point costs across a twenty-year SIP, and why the fee is the only input you can actually control.',
    heading: 'What one percentage point of fees costs over twenty years',
    crumb: 'Expense ratios',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['goals', 'investmatch'],
    related: ['investing/sip-maths', 'inflation/real-returns'],
  },

  /* ── Tax ─────────────────────────────────────────────────────────────── */
  {
    slug: 'old-vs-new-regime',
    topic: 'tax',
    kind: 'comparison',
    title: 'Old vs New Tax Regime: How to Decide, With Maths | FinatriX',
    description:
      'How the two Indian income tax regimes differ, the deduction total at which the old regime wins, and how to work out which one costs you less this year.',
    heading: 'Old regime or new: the deduction total where it flips',
    crumb: 'Old vs new regime',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['budget'],
    related: ['tax/salary-structure', 'epf-nps/epf-vs-nps'],
  },
  {
    slug: 'capital-gains-basics',
    topic: 'tax',
    kind: 'explainer',
    title: 'Capital Gains Tax on Investments in India | FinatriX',
    description:
      'How equity, debt and gold gains are taxed differently, what the holding period does to the rate, and why post-tax return is the only number worth comparing.',
    heading: 'How investment gains are taxed, and why the label matters',
    crumb: 'Capital gains',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['parksmart', 'investmatch'],
    related: ['saving/where-to-park-short-term-cash', 'tax/old-vs-new-regime'],
  },
  {
    slug: 'salary-structure',
    topic: 'tax',
    kind: 'explainer',
    title: 'CTC vs Take-Home: Where the Rest of It Goes | FinatriX',
    description:
      'How a CTC becomes a bank credit: employer PF, gratuity, professional tax and TDS, and which components of a salary structure you can actually influence.',
    heading: 'CTC, gross, net: where the rest of your salary goes',
    crumb: 'CTC vs take-home',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['budget', 'peercompare'],
    related: ['tax/old-vs-new-regime', 'salary-negotiation/evaluating-a-package'],
  },

  /* ── Debt ────────────────────────────────────────────────────────────── */
  {
    slug: 'avalanche-vs-snowball',
    topic: 'debt',
    kind: 'comparison',
    title: 'Avalanche vs Snowball: Which Debt to Clear First | FinatriX',
    description:
      'The two payoff orders compared on total interest and on completion rate, and an honest answer about when the mathematically worse method is the right one.',
    heading: 'Highest rate or smallest balance: which debt to clear first',
    crumb: 'Avalanche vs snowball',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['budget', 'expenses'],
    related: ['debt/credit-card-interest', 'loans/prepay-or-invest'],
  },
  {
    slug: 'credit-card-interest',
    topic: 'debt',
    kind: 'explainer',
    title: 'What a Revolving Credit Card Balance Really Costs | FinatriX',
    description:
      'How credit card interest is charged in India, why paying the minimum keeps the balance almost still, and what losing the interest-free period actually costs.',
    heading: 'What a credit card balance really costs once you revolve',
    crumb: 'Credit card interest',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['expenses', 'budget'],
    related: ['debt/avalanche-vs-snowball', 'credit-scores/what-moves-a-score'],
  },

  /* ── Loans ───────────────────────────────────────────────────────────── */
  {
    slug: 'emi-formula',
    topic: 'loans',
    kind: 'explainer',
    title: 'The EMI Formula, Worked Through Line by Line | FinatriX',
    description:
      'The formula every EMI calculator runs, what each term does, and how a longer tenure lowers the instalment while raising the total interest sharply.',
    heading: 'The EMI formula, and what tenure really costs you',
    crumb: 'The EMI formula',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['budget', 'goals'],
    related: ['loans/prepay-or-invest', 'debt/avalanche-vs-snowball'],
  },
  {
    slug: 'prepay-or-invest',
    topic: 'loans',
    kind: 'comparison',
    title: 'Prepay the Loan or Invest the Surplus? | FinatriX',
    description:
      'The comparison that decides it — loan rate against expected post-tax return — plus the two non-financial reasons prepayment often wins anyway.',
    heading: 'Prepay the home loan, or invest the same money?',
    crumb: 'Prepay or invest',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['goals', 'investmatch', 'lifemap'],
    related: ['loans/emi-formula', 'investing/asset-allocation-basics'],
  },

  /* ── Credit scores ───────────────────────────────────────────────────── */
  {
    slug: 'what-moves-a-score',
    topic: 'credit-scores',
    kind: 'explainer',
    title: 'What Actually Moves an Indian Credit Score | FinatriX',
    description:
      'The factors a credit bureau really weighs, how fast each one moves your score, and the widely repeated advice that changes nothing at all.',
    heading: 'What actually moves a credit score, and how fast',
    crumb: 'What moves a score',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['budget'],
    related: ['credit-scores/credit-report-errors', 'debt/credit-card-interest'],
  },
  {
    slug: 'credit-report-errors',
    topic: 'credit-scores',
    kind: 'howto',
    title: 'How to Find and Fix a Credit Report Error | FinatriX',
    description:
      'How to read a credit report, the four errors that appear most often on Indian reports, and the dispute process that gets them corrected.',
    heading: 'How to read your credit report and dispute what is wrong',
    crumb: 'Credit report errors',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['credit-scores/what-moves-a-score', 'loans/emi-formula'],
  },

  /* ── Insurance ───────────────────────────────────────────────────────── */
  {
    slug: 'term-cover-amount',
    topic: 'insurance',
    kind: 'howto',
    title: 'How Much Term Insurance Cover Do You Need? | FinatriX',
    description:
      'Three methods for sizing term cover, worked with numbers, and why the income-multiple rule of thumb is a starting point rather than an answer.',
    heading: 'How much term cover a household actually needs',
    crumb: 'Term cover amount',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['lifemap', 'budget'],
    related: ['insurance/health-cover-basics', 'net-worth/calculate-net-worth'],
  },
  {
    slug: 'health-cover-basics',
    topic: 'insurance',
    kind: 'explainer',
    title: 'Health Insurance in India: What the Terms Mean | FinatriX',
    description:
      'Sum insured, room rent limits, co-pay, waiting periods and sub-limits — what each one does to a claim, and why employer cover alone is usually thin.',
    heading: 'Health cover: the clauses that decide what you get paid',
    crumb: 'Health cover basics',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['budget'],
    related: ['insurance/term-cover-amount', 'saving/emergency-fund-size'],
  },

  /* ── Retirement ──────────────────────────────────────────────────────── */
  {
    slug: 'retirement-corpus',
    topic: 'retirement',
    kind: 'howto',
    title: 'How to Work Out the Retirement Corpus You Need | FinatriX',
    description:
      'How to size a retirement corpus from your own expenses rather than a multiple of income, and why inflation makes the target move every single year.',
    heading: 'Working out the retirement corpus you actually need',
    crumb: 'Retirement corpus',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['lifemap', 'goals'],
    related: ['retirement/withdrawal-rate', 'inflation/inflation-and-goals'],
  },
  {
    slug: 'withdrawal-rate',
    topic: 'retirement',
    kind: 'explainer',
    title: 'Safe Withdrawal Rates, and the 4% Rule in India | FinatriX',
    description:
      'Where the 4% rule came from, why it does not transfer cleanly to Indian inflation and tax, and how to think about a withdrawal rate you can live on.',
    heading: 'The 4% rule, and what it becomes under Indian inflation',
    crumb: 'Withdrawal rates',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['lifemap', 'investmatch'],
    related: ['retirement/retirement-corpus', 'financial-independence/fi-number'],
  },

  /* ── EPF & NPS ───────────────────────────────────────────────────────── */
  {
    slug: 'epf-vs-nps',
    topic: 'epf-nps',
    kind: 'comparison',
    title: 'EPF vs NPS: Returns, Lock-In and Tax Compared | FinatriX',
    description:
      'How EPF and NPS differ on contribution, return, lock-in and tax at withdrawal, and why most salaried savers end up holding both rather than choosing.',
    heading: 'EPF or NPS: what each one is actually for',
    crumb: 'EPF vs NPS',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['goals', 'lifemap'],
    related: ['epf-nps/moving-between-systems', 'retirement/retirement-corpus'],
  },
  {
    slug: 'moving-between-systems',
    topic: 'epf-nps',
    kind: 'comparison',
    title: 'Superannuation vs EPF: Moving Between Systems | FinatriX',
    description:
      'How an Australian-style superannuation system compares with EPF and NPS, and what happens to each pot if you move countries mid-career.',
    heading: 'Superannuation, EPF and NPS when you move countries',
    crumb: 'Super vs EPF',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['lifemap'],
    related: ['epf-nps/epf-vs-nps', 'international-students/visa-questions'],
  },

  /* ── Inflation ───────────────────────────────────────────────────────── */
  {
    slug: 'real-returns',
    topic: 'inflation',
    kind: 'explainer',
    title: 'Real vs Nominal Returns: The Only One That Counts | FinatriX',
    description:
      'How to convert a headline return into a real, post-inflation one, why the exact formula differs from simple subtraction, and where that gap matters.',
    heading: 'Nominal return, real return, and the gap between them',
    crumb: 'Real vs nominal',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['parksmart', 'goals'],
    related: ['inflation/inflation-and-goals', 'investing/expense-ratios'],
  },
  {
    slug: 'inflation-and-goals',
    topic: 'inflation',
    kind: 'howto',
    title: 'Why Your Goal Amount Is Already Out of Date | FinatriX',
    description:
      'How to inflate a goal set in today’s money to what it will actually cost, and how much the instalment changes when you do it properly.',
    heading: 'Setting a goal amount that will still be right in ten years',
    crumb: 'Inflating a goal',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['goals', 'lifemap'],
    related: ['inflation/real-returns', 'retirement/retirement-corpus'],
  },

  /* ── Behavioural finance ─────────────────────────────────────────────── */
  {
    slug: 'selling-at-the-bottom',
    topic: 'behavioural-finance',
    kind: 'explainer',
    title: 'Why Investors Sell at the Bottom, and How to Not | FinatriX',
    description:
      'What loss aversion does to a portfolio during a drawdown, what selling and re-entering actually costs, and the rules that make holding easier.',
    heading: 'Why sensible people sell at the bottom',
    crumb: 'Selling at the bottom',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['investmatch', 'lifemap'],
    related: ['behavioural-finance/lifestyle-creep', 'investing/asset-allocation-basics'],
  },
  {
    slug: 'lifestyle-creep',
    topic: 'behavioural-finance',
    kind: 'explainer',
    title: 'Lifestyle Creep: Why a Raise Never Shows Up | FinatriX',
    description:
      'How spending absorbs each raise, the arithmetic of splitting an increment before it reaches your account, and what that split is worth over a career.',
    heading: 'Lifestyle creep, and the raise you never felt',
    crumb: 'Lifestyle creep',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['budget', 'expenses', 'peercompare'],
    related: ['behavioural-finance/selling-at-the-bottom', 'net-worth/calculate-net-worth'],
  },

  /* ── Cash flow ───────────────────────────────────────────────────────── */
  {
    slug: 'the-monthly-gap',
    topic: 'cash-flow',
    kind: 'explainer',
    title: 'Why You Run Out of Money Before the Salary Lands | FinatriX',
    description:
      'The difference between being solvent and being liquid, why the last week of the month is always the tight one, and the two fixes that actually work.',
    heading: 'Solvent but broke: the timing gap in a monthly salary',
    crumb: 'The monthly gap',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['expenses', 'budget'],
    related: ['cash-flow/annual-lumps', 'budgeting/zero-based-budgeting'],
  },
  {
    slug: 'annual-lumps',
    topic: 'cash-flow',
    kind: 'howto',
    title: 'Spreading Annual Bills Across Twelve Months | FinatriX',
    description:
      'How to find every annual and quarterly bill you pay, convert the total into one monthly figure, and stop insurance renewals arriving as a shock.',
    heading: 'Turning annual bills into a flat monthly number',
    crumb: 'Annual lumps',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['budget', 'expenses'],
    related: ['saving/sinking-funds', 'cash-flow/the-monthly-gap'],
  },

  /* ── Net worth ───────────────────────────────────────────────────────── */
  {
    slug: 'calculate-net-worth',
    topic: 'net-worth',
    kind: 'howto',
    title: 'How to Calculate Net Worth Without Flattering It | FinatriX',
    description:
      'What belongs on each side of the statement, how to value a home, a car and an EPF balance honestly, and the three items people quietly leave out.',
    heading: 'Calculating net worth, honestly',
    crumb: 'Calculating net worth',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['networth', 'lifemap'],
    related: ['net-worth/net-worth-milestones', 'financial-independence/fi-number'],
  },
  {
    slug: 'net-worth-milestones',
    topic: 'net-worth',
    kind: 'explainer',
    title: 'Net Worth Milestones, and Why Rank Is a Poor Goal | FinatriX',
    description:
      'What a reasonable net-worth trajectory looks like by decade, why the first milestone is the slowest, and the limits of comparing yourself to a benchmark.',
    heading: 'What a reasonable net-worth trajectory looks like',
    crumb: 'Net worth milestones',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['networth', 'peercompare'],
    related: ['net-worth/calculate-net-worth', 'behavioural-finance/lifestyle-creep'],
  },

  /* ── Financial independence ──────────────────────────────────────────── */
  {
    slug: 'fi-number',
    topic: 'financial-independence',
    kind: 'howto',
    title: 'Your FI Number, and What Savings Rate It Implies | FinatriX',
    description:
      'How to calculate a financial-independence number from annual expenses, and the table that turns a savings rate directly into years remaining.',
    heading: 'The FI number, and the savings rate that gets you there',
    crumb: 'The FI number',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['lifemap', 'goals'],
    related: ['financial-independence/coast-fi', 'retirement/withdrawal-rate'],
  },
  {
    slug: 'coast-fi',
    topic: 'financial-independence',
    kind: 'explainer',
    title: 'Coast FI: When You Can Stop Adding and Still Arrive | FinatriX',
    description:
      'What Coast FI means, how to calculate the balance that gets you to retirement with no further contributions, and why it arrives sooner than full FI.',
    heading: 'Coast FI: the point where compounding takes over',
    crumb: 'Coast FI',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['goals', 'lifemap'],
    related: ['financial-independence/fi-number', 'investing/sip-maths'],
  },

  /* ── Resume ──────────────────────────────────────────────────────────── */
  {
    slug: 'resume-structure',
    topic: 'resume',
    kind: 'howto',
    title: 'Resume Structure: What Goes Where, and Why | FinatriX',
    description:
      'The section order that matches how a resume is actually read, how long each section should be, and what to cut when you are over a page.',
    heading: 'Resume structure: the order a reader actually uses',
    crumb: 'Resume structure',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['resume/quantifying-achievements', 'ats/how-ats-works'],
  },
  {
    slug: 'quantifying-achievements',
    topic: 'resume',
    kind: 'howto',
    title: 'Turning Responsibilities Into Evidence on a Resume | FinatriX',
    description:
      'How to rewrite a duty as an outcome, where to find numbers when your work was not measured, and the three quantities that convince a reader fastest.',
    heading: 'From “responsible for” to evidence a stranger believes',
    crumb: 'Quantifying achievements',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['resume/resume-structure', 'behavioural-interviews/star-method'],
  },

  /* ── ATS ─────────────────────────────────────────────────────────────── */
  {
    slug: 'how-ats-works',
    topic: 'ats',
    kind: 'explainer',
    title: 'How an Applicant Tracking System Actually Works | FinatriX',
    description:
      'What an ATS parses, what it stores, how recruiters search it, and why the popular idea that it silently scores and rejects you is mostly wrong.',
    heading: 'What an ATS really does with your resume',
    crumb: 'How an ATS works',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['ats/ats-formatting', 'resume/resume-structure'],
  },
  {
    slug: 'ats-formatting',
    topic: 'ats',
    kind: 'howto',
    title: 'ATS Formatting: What Breaks Parsing, What Does Not | FinatriX',
    description:
      'The formatting choices that genuinely break resume parsing, the ones that are harmless myths, and how to test your own file in under five minutes.',
    heading: 'The formatting that breaks parsing — and the myths that do not',
    crumb: 'ATS formatting',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['ats/how-ats-works', 'resume/resume-structure'],
  },

  /* ── Cover letters ───────────────────────────────────────────────────── */
  {
    slug: 'cover-letter-structure',
    topic: 'cover-letters',
    kind: 'howto',
    title: 'A Cover Letter Structure That Gets Read | FinatriX',
    description:
      'Four paragraphs, each with one job: why this employer, what you bring, the evidence for it, and the close. With the openings that waste the first one.',
    heading: 'Four paragraphs, each with exactly one job',
    crumb: 'Cover letter structure',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['cover-letters/when-it-matters', 'resume/quantifying-achievements'],
  },
  {
    slug: 'when-it-matters',
    topic: 'cover-letters',
    kind: 'explainer',
    title: 'When a Cover Letter Changes the Outcome | FinatriX',
    description:
      'The application types where a cover letter is read and weighted, the ones where it is never opened, and how to allocate your time accordingly.',
    heading: 'When a cover letter is read, and when it is not',
    crumb: 'When it matters',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['cover-letters/cover-letter-structure', 'networking/informational-interviews'],
  },

  /* ── Interview preparation ───────────────────────────────────────────── */
  {
    slug: 'preparation-system',
    topic: 'interview-preparation',
    kind: 'howto',
    title: 'An Interview Preparation System You Reuse | FinatriX',
    description:
      'Build an evidence bank once, then prepare for any interview in ninety minutes: the four research questions, the story index, and the rehearsal that works.',
    heading: 'Prepare once, reuse everywhere: an interview system',
    crumb: 'Preparation system',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['interview-preparation/questions-to-ask', 'behavioural-interviews/star-method'],
  },
  {
    slug: 'questions-to-ask',
    topic: 'interview-preparation',
    kind: 'explainer',
    title: 'Questions to Ask an Interviewer That Are Not Filler | FinatriX',
    description:
      'What your questions signal, the four categories worth drawing from, and the common questions that quietly cost you marks at the end of an interview.',
    heading: 'The questions you ask are also being scored',
    crumb: 'Questions to ask',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['interview-preparation/preparation-system', 'salary-negotiation/negotiating-an-offer'],
  },

  /* ── Behavioural interviews ──────────────────────────────────────────── */
  {
    slug: 'star-method',
    topic: 'behavioural-interviews',
    kind: 'howto',
    title: 'The STAR Method, and Surviving the Follow-Up | FinatriX',
    description:
      'How to build a STAR answer with the right amount in each part, and how to handle the probing questions that come after the story is finished.',
    heading: 'STAR answers that survive the second and third question',
    crumb: 'The STAR method',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['behavioural-interviews/competency-frameworks', 'interview-preparation/preparation-system'],
  },
  {
    slug: 'competency-frameworks',
    topic: 'behavioural-interviews',
    kind: 'explainer',
    title: 'How Competency Frameworks Score Your Answers | FinatriX',
    description:
      'What a competency framework is, how interviewers mark against one, and how to work out which competencies a given job description is testing for.',
    heading: 'The scoring sheet behind a behavioural interview',
    crumb: 'Competency frameworks',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['behavioural-interviews/star-method', 'assessment-centres/assessment-centre-format'],
  },

  /* ── Technical interviews ────────────────────────────────────────────── */
  {
    slug: 'finance-technical-questions',
    topic: 'technical-interviews',
    kind: 'explainer',
    title: 'What Finance Technical Interviews Actually Test | FinatriX',
    description:
      'The four question types that recur across finance and risk interviews, what a good answer sounds like, and how to recover when you do not know.',
    heading: 'What a finance technical interview is really checking',
    crumb: 'Technical questions',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['technical-interviews/modelling-tests', 'banking-careers/banking-divisions'],
  },
  {
    slug: 'modelling-tests',
    topic: 'technical-interviews',
    kind: 'howto',
    title: 'Modelling and Case Tests: How They Are Marked | FinatriX',
    description:
      'What an interviewer looks for in a timed modelling or case test, how marks are usually split, and the habits that lose points before you start.',
    heading: 'Timed modelling tests, and where the marks actually are',
    crumb: 'Modelling tests',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['technical-interviews/finance-technical-questions', 'consulting-careers/case-interviews'],
  },

  /* ── Graduate programs ───────────────────────────────────────────────── */
  {
    slug: 'graduate-timeline',
    topic: 'graduate-programs',
    kind: 'explainer',
    title: 'The Graduate Hiring Calendar, and Why It Rules You | FinatriX',
    description:
      'How graduate recruitment cycles run, why rolling assessment means early applications win, and how to plan a campaign backwards from the deadlines.',
    heading: 'The graduate hiring calendar, and how to plan against it',
    crumb: 'Graduate timeline',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['graduate-programs/application-stages', 'assessment-centres/assessment-centre-format'],
  },
  {
    slug: 'application-stages',
    topic: 'graduate-programs',
    kind: 'explainer',
    title: 'Every Graduate Application Stage, and Its Filter | FinatriX',
    description:
      'What each stage of a graduate application is really screening for — form, tests, video interview, assessment centre — and how to prepare for each one.',
    heading: 'What each graduate application stage is filtering for',
    crumb: 'Application stages',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['graduate-programs/graduate-timeline', 'behavioural-interviews/competency-frameworks'],
  },

  /* ── Banking careers ─────────────────────────────────────────────────── */
  {
    slug: 'banking-divisions',
    topic: 'banking-careers',
    kind: 'explainer',
    title: 'The Divisions of a Bank, and What Each One Does | FinatriX',
    description:
      'Retail, corporate, markets, investment banking, operations, technology and risk — what each division does, who it serves, and how the work really differs.',
    heading: 'A bank is a dozen businesses: which one are you applying to?',
    crumb: 'Banking divisions',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['banking-careers/first-ten-years', 'risk-compliance-careers/risk-career-paths'],
  },
  {
    slug: 'first-ten-years',
    topic: 'banking-careers',
    kind: 'explainer',
    title: 'A Banking Career’s First Ten Years, Stage by Stage | FinatriX',
    description:
      'How the analyst-to-VP ladder works, what changes at each promotion, and the two points where most people move between divisions or leave entirely.',
    heading: 'The first ten years of a banking career',
    crumb: 'First ten years',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['lifemap'],
    related: ['banking-careers/banking-divisions', 'salary-negotiation/evaluating-a-package'],
  },

  /* ── Risk & compliance ───────────────────────────────────────────────── */
  {
    slug: 'risk-career-paths',
    topic: 'risk-compliance-careers',
    kind: 'explainer',
    title: 'Credit, Market and Operational Risk Careers | FinatriX',
    description:
      'What each of the three risk disciplines does day to day, which skills transfer between them, and how the three lines of defence shape every risk job.',
    heading: 'The three risk disciplines, and which one suits you',
    crumb: 'Risk career paths',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['risk-compliance-careers/compliance-roles', 'banking-careers/banking-divisions'],
  },
  {
    slug: 'compliance-roles',
    topic: 'risk-compliance-careers',
    kind: 'explainer',
    title: 'Compliance Roles: What the Job Is Actually Like | FinatriX',
    description:
      'How compliance is organised, the difference between advisory, monitoring and regulatory-change work, and what makes someone good at it.',
    heading: 'What a compliance job actually involves',
    crumb: 'Compliance roles',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['risk-compliance-careers/risk-career-paths', 'aml-financial-crime/aml-analyst-role'],
  },

  /* ── AML & financial crime ───────────────────────────────────────────── */
  {
    slug: 'aml-analyst-role',
    topic: 'aml-financial-crime',
    kind: 'explainer',
    title: 'What an AML Analyst Does All Day | FinatriX',
    description:
      'Transaction monitoring, KYC refresh, sanctions screening and case escalation — what each team does, and which is the most common way in.',
    heading: 'Inside an AML team: the four functions and the way in',
    crumb: 'The AML analyst role',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['aml-financial-crime/aml-certifications', 'risk-compliance-careers/compliance-roles'],
  },
  {
    slug: 'aml-certifications',
    topic: 'aml-financial-crime',
    kind: 'explainer',
    title: 'Which AML Certifications Employers Actually Ask For | FinatriX',
    description:
      'What the recognised financial-crime certifications cover, at what career stage each one is worth taking, and when experience beats another qualification.',
    heading: 'Financial-crime certifications, and when they are worth it',
    crumb: 'AML certifications',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['aml-financial-crime/aml-analyst-role', 'networking/informational-interviews'],
  },

  /* ── Consulting ──────────────────────────────────────────────────────── */
  {
    slug: 'consulting-ladder',
    topic: 'consulting-careers',
    kind: 'explainer',
    title: 'The Consulting Ladder, From Analyst to Partner | FinatriX',
    description:
      'What changes at each grade in a consulting firm, how up-or-out really works, and what consultants actually exit into after two to five years.',
    heading: 'Analyst to partner: what changes at each grade',
    crumb: 'The consulting ladder',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['consulting-careers/case-interviews', 'banking-careers/first-ten-years'],
  },
  {
    slug: 'case-interviews',
    topic: 'consulting-careers',
    kind: 'howto',
    title: 'Case Interview Preparation From a Standing Start | FinatriX',
    description:
      'A structured way into case interviews: the four case types, how to build a structure out loud, and the arithmetic drill that removes most of the pressure.',
    heading: 'Case interviews: a preparation plan that starts from zero',
    crumb: 'Case interviews',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['consulting-careers/consulting-ladder', 'technical-interviews/modelling-tests'],
  },

  /* ── Networking ──────────────────────────────────────────────────────── */
  {
    slug: 'informational-interviews',
    topic: 'networking',
    kind: 'howto',
    title: 'Informational Interviews That Lead Somewhere | FinatriX',
    description:
      'How to ask for a conversation, what to actually ask in twenty minutes, and the follow-up that turns one conversation into a referral months later.',
    heading: 'The informational interview, done properly',
    crumb: 'Informational interviews',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['networking/starting-with-no-contacts', 'linkedin/linkedin-outreach'],
  },
  {
    slug: 'starting-with-no-contacts',
    topic: 'networking',
    kind: 'howto',
    title: 'Networking When You Genuinely Know Nobody | FinatriX',
    description:
      'Four sources of first contacts that cost nothing, the message that gets answered, and why a referral beats a strong application at almost every employer.',
    heading: 'Building a network from zero contacts',
    crumb: 'Starting from zero',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['networking/informational-interviews', 'international-students/job-search-on-a-visa'],
  },

  /* ── LinkedIn ────────────────────────────────────────────────────────── */
  {
    slug: 'linkedin-profile',
    topic: 'linkedin',
    kind: 'howto',
    title: 'A LinkedIn Profile Recruiters Can Actually Find | FinatriX',
    description:
      'Which profile fields the recruiter search actually matches on, how to write a headline that carries search terms, and what the About section is for.',
    heading: 'Writing a LinkedIn profile for the search that finds it',
    crumb: 'LinkedIn profile',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['linkedin/linkedin-outreach', 'resume/resume-structure'],
  },
  {
    slug: 'linkedin-outreach',
    topic: 'linkedin',
    kind: 'howto',
    title: 'LinkedIn Outreach a Stranger Will Actually Answer | FinatriX',
    description:
      'What to put in a connection note, the message structure that gets replies, and the three openings that guarantee you are ignored.',
    heading: 'Cold outreach on LinkedIn that gets a reply',
    crumb: 'LinkedIn outreach',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['linkedin/linkedin-profile', 'networking/informational-interviews'],
  },

  /* ── Assessment centres ──────────────────────────────────────────────── */
  {
    slug: 'assessment-centre-format',
    topic: 'assessment-centres',
    kind: 'explainer',
    title: 'What Happens in an Assessment Centre | FinatriX',
    description:
      'The five exercises that make up most assessment centres, how each is scored independently, and why a bad hour does not sink the whole day.',
    heading: 'The assessment centre, exercise by exercise',
    crumb: 'The format',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['assessment-centres/group-exercises', 'graduate-programs/application-stages'],
  },
  {
    slug: 'group-exercises',
    topic: 'assessment-centres',
    kind: 'howto',
    title: 'Group Exercises: How to Score Without Dominating | FinatriX',
    description:
      'What assessors write down during a group exercise, the four contributions that score, and why talking most is consistently marked down.',
    heading: 'Group exercises, and what the assessor is writing down',
    crumb: 'Group exercises',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['assessment-centres/assessment-centre-format', 'behavioural-interviews/competency-frameworks'],
  },

  /* ── Salary negotiation ──────────────────────────────────────────────── */
  {
    slug: 'negotiating-an-offer',
    topic: 'salary-negotiation',
    kind: 'howto',
    title: 'How to Negotiate an Offer Without Risking It | FinatriX',
    description:
      'When to negotiate, the sentence that opens it safely, what employers can and cannot move, and the one situation where you should simply accept.',
    heading: 'Negotiating an offer without putting it at risk',
    crumb: 'Negotiating an offer',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['budget', 'lifemap'],
    related: ['salary-negotiation/evaluating-a-package', 'interview-preparation/questions-to-ask'],
  },
  {
    slug: 'evaluating-a-package',
    topic: 'salary-negotiation',
    kind: 'howto',
    title: 'Comparing Two Offers That Are Not Comparable | FinatriX',
    description:
      'How to reduce base, bonus, equity, provident fund and benefits to one honest annual figure, and which non-cash terms are worth more than they look.',
    heading: 'Reducing two very different offers to one number',
    crumb: 'Evaluating a package',
    published: REVIEWED,
    updated: REVIEWED,
    tools: ['budget', 'lifemap', 'peercompare'],
    related: ['salary-negotiation/negotiating-an-offer', 'tax/salary-structure'],
  },

  /* ── International students ──────────────────────────────────────────── */
  {
    slug: 'job-search-on-a-visa',
    topic: 'international-students',
    kind: 'howto',
    title: 'Running a Job Search on a Study Visa | FinatriX',
    description:
      'How to plan a job search around visa deadlines, which employers realistically sponsor, and how to sequence applications so the timing works out.',
    heading: 'A job search planned backwards from your visa dates',
    crumb: 'Job search on a visa',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['international-students/visa-questions', 'graduate-programs/graduate-timeline'],
  },
  {
    slug: 'visa-questions',
    topic: 'international-students',
    kind: 'howto',
    title: 'Answering Visa Questions Without Losing the Room | FinatriX',
    description:
      'When sponsorship comes up, how to answer the question factually and briefly, and why volunteering your visa status early usually costs you interviews.',
    heading: 'The visa question, and how to answer it in one sentence',
    crumb: 'Visa questions',
    published: REVIEWED,
    updated: REVIEWED,
    related: ['international-students/job-search-on-a-visa', 'networking/starting-with-no-contacts'],
  },
];

/** Fast lookup by `<topic>/<slug>`. */
const ARTICLE_BY_KEY = new Map(ARTICLES.map((a) => [`${a.topic}/${a.slug}`, a]));

/** The article at `<topic>/<slug>`, or null. */
export function articleFor(topic: string | undefined, slug: string | undefined): Article | null {
  if (!topic || !slug) return null;
  return ARTICLE_BY_KEY.get(`${topic}/${slug}`) ?? null;
}

/** Every article in a topic, in registry order. */
export function articlesInTopic(topicSlug: string): readonly Article[] {
  return ARTICLES.filter((a) => a.topic === topicSlug);
}

/**
 * Guides that use a given calculator.
 *
 * Derived from each article's own `tools` list rather than curated separately,
 * which is what makes the tool→guide and guide→tool links two views of one
 * relationship instead of two lists to keep in sync. This is the link that
 * matters most in the whole knowledge layer: the calculator pages are the
 * primary organic-acquisition surface, and without it the articles would be
 * reachable only from the footer and the hub.
 */
export function articlesUsingTool(toolId: ToolId): readonly Article[] {
  return ARTICLES.filter((a) => a.tools?.includes(toolId));
}

/**
 * Topics that name a given calculator, for the same reason as above — the tool
 * page can offer the cornerstone hub as well as the individual guides.
 */
export function topicsUsingTool(toolId: ToolId): readonly Topic[] {
  return TOPICS.filter((t) => t.tools?.includes(toolId));
}

/* ------------------------------------------------------------------------- *
 * Paths
 * ------------------------------------------------------------------------- */

/** The knowledge layer's root. */
export const LEARN_ROOT = '/learn';

export function topicPath(topic: Pick<Topic, 'slug'>): string {
  return `${LEARN_ROOT}/${topic.slug}`;
}

export function articlePath(article: Pick<Article, 'topic' | 'slug'>): string {
  return `${LEARN_ROOT}/${article.topic}/${article.slug}`;
}

/**
 * Every URL the knowledge layer serves, in sitemap order: the hub, then each
 * topic followed by its own articles.
 *
 * Grouping articles under their topic rather than listing all topics and then
 * all articles is not cosmetic — a sitemap that mirrors the site's real
 * hierarchy is the cheapest possible signal of that hierarchy to a crawler that
 * has not yet followed a single internal link.
 */
export interface ContentSitemapRow {
  path: string;
  /** W3C date for `<lastmod>`. */
  updated: string;
  priority: number;
  changefreq: 'weekly' | 'monthly' | 'yearly';
}

/**
 * Sitemap rows for the knowledge layer, in hierarchy order.
 *
 * Priorities are relative to the rest of the site rather than absolute claims:
 * the hub sits with the marketing pages at 0.7, a topic hub above its articles
 * because it is the page that should rank for the broad query, and articles at
 * 0.6 because each targets one specific question.
 *
 * `lastmod` is the article's own `updated` field — the same one that renders the
 * visible date stamp and fills `dateModified` in the JSON-LD. A sitemap date
 * that disagrees with the page is a signal search engines learn to ignore.
 */
export const CONTENT_SITEMAP: readonly ContentSitemapRow[] = [
  {
    path: LEARN_ROOT,
    // The hub changes whenever any topic gains a guide, so it carries the most
    // recent date in the corpus rather than a hand-maintained one.
    updated: [...TOPICS.map((t) => t.updated), ...ARTICLES.map((a) => a.updated)]
      .sort()
      .at(-1) as string,
    priority: 0.7,
    changefreq: 'weekly',
  },
  ...TOPICS.flatMap<ContentSitemapRow>((t) => [
    { path: topicPath(t), updated: t.updated, priority: 0.7, changefreq: 'monthly' },
    ...articlesInTopic(t.slug).map<ContentSitemapRow>((a) => ({
      path: articlePath(a),
      updated: a.updated,
      priority: 0.6,
      changefreq: 'monthly',
    })),
  ]),
];

export const CONTENT_PATHS: readonly string[] = CONTENT_SITEMAP.map((r) => r.path);

const CONTENT_PATH_SET = new Set<string>(CONTENT_PATHS);

/** Does `pathname` belong to the knowledge layer? Used by the edge for its 200/404 decision. */
export function isContentPath(pathname: string): boolean {
  return CONTENT_PATH_SET.has(pathname.replace(/\/+$/, '') || '/');
}

/**
 * Which topic's editorial chunk a knowledge-layer URL needs, or null.
 *
 * Null for `/learn` itself and for anything outside the layer: the hub renders
 * entirely from this index and needs no chunk at all. Lives here rather than in
 * the Worker or in `seo.ts` because this module already owns the shape of these
 * URLs, and a second parser for them is a second thing to keep true.
 */
export function topicSlugForContentPath(pathname: string): string | null {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (!isContentPath(p) || p === LEARN_ROOT) return null;
  return p.split('/').filter(Boolean)[1] ?? null;
}

/**
 * A link target's label and blurb, for any knowledge-layer path.
 *
 * Mirrors `publicPageFor` so the shared `RelatedPages` strip can resolve a path
 * from either registry. Returning `null` for an unknown path is what lets that
 * component drop a bad link rather than render one into a 404.
 */
export function contentLinkFor(pathname: string): { path: string; name: string; blurb: string } | null {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === LEARN_ROOT) {
    return {
      path: LEARN_ROOT,
      name: 'Learn',
      blurb: 'Guides to money and careers, with the arithmetic shown.',
    };
  }
  const parts = p.split('/').filter(Boolean); // ['learn', topic, slug?]
  if (parts[0] !== 'learn') return null;

  if (parts.length === 2) {
    const topic = topicFor(parts[1]);
    return topic ? { path: p, name: topic.name, blurb: topic.lede } : null;
  }
  if (parts.length === 3) {
    const article = articleFor(parts[1], parts[2]);
    return article ? { path: p, name: article.heading, blurb: article.description } : null;
  }
  return null;
}
