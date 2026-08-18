/**
 * The public, indexable marketing/trust surface — one registry, read by four
 * consumers that previously had no way to agree with each other:
 *
 *   1. `src/lib/seo.ts`      — title, description, canonical, robots, JSON-LD
 *   2. `src/shared/routes.ts` — whether the edge Worker answers 200 or 404
 *   3. `scripts/generate-sitemap.mjs` — public/sitemap.xml
 *   4. the page components themselves — the visible H1, lede, "last reviewed"
 *      stamp and FAQ list
 *
 * That fourth consumer is the reason the FAQ prose lives here rather than in
 * each page file. Google's FAQ guidance is explicit that the markup must
 * describe question-and-answer content actually VISIBLE on the page; the only
 * way to guarantee that without a manual audit is for the rendered list and the
 * `FAQPage` node to be the same array. `seo.ts` says as much in its own comment
 * about why FAQ markup was deliberately absent until now — this module is what
 * makes it correct rather than a manual-action risk.
 *
 * Pure data. No DOM, no React, no imports — so the edge Worker, the app, the
 * sitemap generator and Vitest can all read it.
 *
 * ADDING A PAGE: add an entry here, add the route to `App.tsx`, and write the
 * component. `publicPages.test.ts` fails if the registry, the router and the
 * sitemap disagree, so there is no way to ship half of it.
 */

import { ALTERNATIVES, COMPARE_ROOT, alternativePath } from './comparisons';
import { COMPANIES, COMPANIES_ROOT, companyPath } from './companies';

/** A question-and-answer pair. Rendered on the page AND emitted as FAQPage JSON-LD. */
export interface FaqEntry {
  q: string;
  /** Plain prose. Kept free of markup so it is valid both as JSX text and as a schema `text` value. */
  a: string;
}

export interface PublicPage {
  /** Absolute path, no trailing slash. Must match the route in App.tsx exactly. */
  path: string;
  /** Short label — breadcrumb crumb, related-links label, sitemap grouping. */
  name: string;
  /** Full `<title>`, brand-suffixed. Kept ≤ 70 chars so the SERP does not truncate it. */
  title: string;
  /** `<meta name="description">`. 50–165 chars. */
  description: string;
  /**
   * Visible H1. Differs from `title` on purpose: one is a SERP listing, the
   * other a page heading. Absent on the legal pages, whose shared chrome
   * (`LegalPage`) renders `name` as its own heading.
   */
  heading?: string;
  /** The one-sentence lede under the H1. Marketing pages only. */
  lede?: string;
  /**
   * Which shell renders it. Defaults to the marketing chrome; the two legal
   * pages use the narrower `LegalPage` shell and set this explicitly.
   */
  kind?: 'legal';
  /**
   * Share-card key under `/images/og/`. Omitted means the default cover card.
   * Never point this at a file that does not exist — a 404 og:image unfurls as
   * a blank card, which is worse than the generic one.
   */
  ogKey?: string;
  /** ISO date the copy was last reviewed. Drives both `dateModified` and the visible stamp. */
  updated: string;
  /** sitemap.xml hints. */
  priority: number;
  changefreq: 'weekly' | 'monthly' | 'yearly';
  /** Visible FAQ, if the page renders one. Presence here is what emits FAQPage markup. */
  faq?: FaqEntry[];
  /**
   * Parent path for the breadcrumb trail. Omitted means the page sits directly
   * under the site root.
   */
  parent?: string;
}

/* ------------------------------------------------------------------------- *
 * Shared copy
 * ------------------------------------------------------------------------- */

/**
 * The billing facts, stated once.
 *
 * Every one of these is checked against what the code actually does
 * (`supabase/functions/careers-billing-checkout`): the session is created in
 * Stripe's `mode: 'payment'`, so it is a single charge for one period with no
 * saved mandate, no auto-renewal and no trial. Pricing, refunds, terms and the
 * FAQ all read from here rather than restating it, because a billing page that
 * describes a renewal model the checkout does not implement is the kind of
 * mistake that becomes a chargeback.
 */
export const BILLING_FACTS = {
  /** Days from payment in which a first purchase can be refunded. */
  refundWindowDays: 7,
  provider: 'Stripe',
  currency: 'INR',
} as const;

/* ------------------------------------------------------------------------- *
 * Careers comparison pages
 * ------------------------------------------------------------------------- */

/**
 * Comparison pages, generated from one shape.
 *
 * Deliberately conservative about the other side. Every claim about a rival
 * here is a description of its CATEGORY — a professional network, a national
 * job board, a global aggregator — not a claim about a specific feature, price
 * or number, because those change without notice and a stale comparison is a
 * trust problem long before it is an SEO one. Each page says so in as many
 * words and links out so a reader can check.
 */
export interface Rival {
  slug: string;
  /** Display name of the other product. */
  name: string;
  /** What it fundamentally is. One sentence, category-level, verifiable. */
  category: string;
  /** Where the rival is genuinely stronger. Written first, on purpose. */
  theirStrengths: string[];
  /** Where FinatriX Careers is genuinely different. Only claims the product actually delivers. */
  ourStrengths: string[];
  /** The honest one-line answer to "which should I use?". */
  verdict: string;
}

export const RIVALS: readonly Rival[] = [
  {
    slug: 'linkedin',
    name: 'LinkedIn Jobs',
    category: 'a professional network with a job board attached to it',
    theirStrengths: [
      'A real social graph — referrals, warm intros and recruiter InMail have no equivalent here.',
      'Employers post directly, so listings arrive at source rather than through an aggregator.',
      'A public profile that doubles as a professional identity recruiters search on their own.',
    ],
    ourStrengths: [
      'A deterministic match score you can inspect, rather than a ranked feed you cannot.',
      'Resume-to-role matching against your own uploaded resume, scored per requirement.',
      'An application tracker that keeps every stage, task and follow-up in one place.',
      'No employer is a customer here, so nothing is promoted for commercial reasons.',
    ],
    verdict:
      'Use LinkedIn to be found and to reach people. Use FinatriX Careers to decide what to apply to and to run the process after you do.',
  },
  {
    slug: 'naukri',
    name: 'Naukri',
    category: "India's largest general-purpose job board",
    theirStrengths: [
      'Volume and reach across Indian employers, especially outside the metros.',
      'Recruiters actively search its resume database, so a listed profile generates inbound.',
      'Decades of employer relationships in sectors that never moved to newer platforms.',
    ],
    ourStrengths: [
      'Search across multiple providers at once, de-duplicated, instead of one index.',
      'Every match is scored against your resume with the reasoning shown, not just keyword-filtered.',
      'Interview prep, offer analysis and company research live beside the search.',
      'Your resume is never listed in a searchable database — nothing is shared with employers.',
    ],
    verdict:
      'Naukri is where the largest number of Indian roles are listed. FinatriX Careers is where you work out which of them are worth your time.',
  },
  {
    slug: 'indeed',
    name: 'Indeed',
    category: 'a global job aggregator that indexes listings from across the web',
    theirStrengths: [
      'Breadth — it indexes far more sources than any single platform, including small employers.',
      'A simple, fast search that needs no account to use.',
      'Company reviews and salary data contributed at a scale no new product can match.',
    ],
    ourStrengths: [
      'Matching, not just filtering — roles are scored against your actual resume.',
      'A tracked pipeline from saved role to offer, rather than a search you repeat by hand.',
      'Tailoring, cover-letter drafting and interview prep against the specific job description.',
      'Built around Indian roles, salaries and the finance-career path in particular.',
    ],
    verdict:
      'Indeed is the widest net. FinatriX Careers is the layer that decides what to keep out of it and what to do next.',
  },
] as const;

/* ------------------------------------------------------------------------- *
 * The registry
 * ------------------------------------------------------------------------- */

const REVIEWED = '2026-08-01';

/**
 * The money-side comparison hub and one page per alternative, derived from
 * `comparisons.ts` exactly as the careers ones are derived from `RIVALS`.
 *
 * Two comparison surfaces rather than one, because they answer different
 * questions for different visitors: `/careers/compare` is about job platforms
 * and sits under the paid product, while `/compare` is about budgeting apps and
 * spreadsheets and sits at the root because the calculators it compares are the
 * free half of the site. Folding them together would put a resume tool next to
 * a spreadsheet on the same page.
 */
const ALTERNATIVE_PAGES: PublicPage[] = [
  {
    path: COMPARE_ROOT,
    name: 'Compare',
    title: 'FinatriX vs Budgeting Apps and Spreadsheets | FinatriX',
    description:
      'How the free FinatriX calculators compare with YNAB, Monarch Money, Copilot, PocketSmith, Excel and Google Sheets — on price, privacy and what each is for.',
    heading: 'How FinatriX compares',
    lede: 'An honest read on where budgeting apps and spreadsheets are stronger, and where a free, education-first calculator is the better tool.',
    ogKey: 'compare',
    updated: REVIEWED,
    priority: 0.6,
    changefreq: 'monthly',
  },
  ...ALTERNATIVES.map<PublicPage>((a) => ({
    path: alternativePath(a),
    name: `vs ${a.name}`,
    title: `FinatriX vs ${a.name} — An Honest Comparison | FinatriX`,
    description: `How the free FinatriX calculators compare with ${a.name}: what each is built for, where ${a.name} is genuinely stronger, and which suits your question.`,
    heading: `FinatriX vs ${a.name}`,
    lede: `${a.name} is ${a.category}. The FinatriX calculators are free, education-first models. They solve different problems, and this page says which is which.`,
    ogKey: 'compare',
    updated: REVIEWED,
    priority: 0.5,
    changefreq: 'monthly',
    parent: COMPARE_ROOT,
  })),
];

/**
 * The company hub and one page per employer, derived from `companies.ts`.
 *
 * At the site root rather than under `/careers`, for one structural reason:
 * `/careers/*` below the marketing pages is the signed-in workspace's namespace,
 * and `/careers/companies` is already an app section behind the paywall. A
 * public page at that URL would collide with it — `publicPages.test.ts` has an
 * assertion for exactly this class of mistake.
 */
const COMPANY_PAGES: PublicPage[] = [
  {
    path: COMPANIES_ROOT,
    name: 'Companies',
    title: 'Company Guides — Banks, Firms and How They Hire | FinatriX',
    description:
      'How major banks and professional-services firms are organised, what their graduate programmes look like, and how their hiring processes are actually structured.',
    heading: 'Company guides',
    lede: 'What each employer is, how it is organised, and what shape its hiring takes — without the deadlines and salary figures that go stale.',
    ogKey: 'companies',
    updated: REVIEWED,
    priority: 0.6,
    changefreq: 'monthly',
  },
  ...COMPANIES.map<PublicPage>((c) => ({
    path: companyPath(c),
    name: c.name,
    title: `${c.name} Careers — Divisions, Programmes, Hiring | FinatriX`,
    description: `How ${c.name} is organised, what its graduate programmes cover, the stages of its hiring process, and what to prepare before applying.`,
    heading: `Careers at ${c.name}`,
    lede: c.overview,
    ogKey: 'companies',
    updated: REVIEWED,
    priority: 0.5,
    changefreq: 'monthly',
    parent: COMPANIES_ROOT,
  })),
];

/** The comparison hub + one page per rival, derived so the two can never diverge. */
const COMPARISON_PAGES: PublicPage[] = [
  {
    path: '/careers/compare',
    name: 'Compare',
    title: 'Compare FinatriX Careers With Job Platforms | FinatriX',
    description:
      'How FinatriX Careers differs from LinkedIn Jobs, Naukri and Indeed — what each does best, and where a match-scored job search is the better tool.',
    heading: 'How FinatriX Careers compares',
    lede: 'An honest read on where other job platforms are stronger, and where a resume-matched, tracked search is the better tool.',
    updated: REVIEWED,
    priority: 0.6,
    changefreq: 'monthly',
    parent: '/careers',
  },
  ...RIVALS.map<PublicPage>((r) => ({
    path: `/careers/compare/${r.slug}`,
    name: `vs ${r.name}`,
    title: `FinatriX Careers vs ${r.name} — Compared | FinatriX`,
    description: `An honest comparison of FinatriX Careers and ${r.name}: what each is built for, where ${r.name} is stronger, and when resume-matched search wins.`,
    heading: `FinatriX Careers vs ${r.name}`,
    lede: `${r.name} is ${r.category}. FinatriX Careers is a match-scored search and application workspace. They solve different halves of the same problem.`,
    updated: REVIEWED,
    priority: 0.5,
    changefreq: 'monthly',
    parent: '/careers/compare',
  })),
];

export const PUBLIC_PAGES: readonly PublicPage[] = [
  /* ── Product ─────────────────────────────────────────────────────────── */
  {
    path: '/pricing',
    name: 'Pricing',
    title: 'Pricing — Free Money Tools, Paid Careers Plans | FinatriX',
    description:
      'Every FinatriX money tool is free, forever. Careers plans start at ₹199/month, billed once per period with no auto-renewal. See what each plan includes.',
    heading: 'Simple, honest pricing',
    lede: 'The seven money tools are free and always will be. FinatriX Careers is the paid product, and you are charged once per period — never automatically.',
    updated: REVIEWED,
    priority: 0.9,
    changefreq: 'monthly',
    faq: [
      {
        q: 'Are the money tools really free?',
        a: 'Yes. All eight calculators — Budget Builder, Expense Tracker, InvestMatch, ParkSmart, PeerCompare, Reverse Goal Planner, LifeMap and the Net Worth tracker — are free with no usage limit and no card required. You can use them signed out; an account only adds sync across your devices.',
      },
      {
        q: 'What do I actually pay for?',
        a: 'FinatriX Careers: multi-provider job search, resume-to-role match scoring, application tracking, interview preparation, company research and the AI features that support them. It is the only paid part of FinatriX.',
      },
      {
        q: 'Does my plan renew automatically?',
        a: 'No. Each purchase is a single payment covering one billing period. Nothing is charged again unless you choose to buy another period, and no payment mandate is stored against your card.',
      },
      {
        q: 'What happens when my period ends?',
        a: 'Your account returns to the free tier and Careers features lock. Nothing you created is deleted — your resumes, applications and notes are still there when you buy another period.',
      },
      {
        q: 'Is there a free trial of Careers?',
        a: 'Not at the moment. Because plans do not auto-renew, the shortest commitment is one month, and a monthly purchase that simply stops is the closest thing to a risk-free trial we can offer honestly.',
      },
      {
        q: 'Is the price I see the price I pay?',
        a: 'Yes. The amount shown is the total charged at checkout in Indian rupees, with nothing added at the payment step. A payment receipt is issued for every purchase and is available from your Billing page.',
      },
      {
        q: 'Can I change plans?',
        a: 'Yes. Buy the plan you want and it applies from that purchase. Because each purchase covers a discrete period rather than a running subscription, there is no mid-cycle proration to work out.',
      },
      {
        q: 'How do refunds work?',
        a: 'A first purchase of a paid period can be refunded within 7 days if the paid Careers features have not been substantially used. Full detail, including what is not refundable, is on the Refunds and Cancellations page.',
      },
    ],
  },
  {
    path: '/about',
    name: 'About',
    title: 'About FinatriX — Education-First Money Tools for India',
    description:
      'Why FinatriX exists, how it makes money, what it will never do with your data, and the principles behind every calculator and career tool on the site.',
    heading: 'Financial clarity, without the sales pitch',
    lede: 'FinatriX is an education-first toolkit for money and careers in India. No ads, no lead generation, no product recommendations that pay us a commission.',
    updated: REVIEWED,
    priority: 0.7,
    changefreq: 'monthly',
  },

  {
    path: '/editorial-standards',
    name: 'Editorial Standards',
    title: 'Editorial Standards — How FinatriX Guides Are Written',
    description:
      'How FinatriX writes and reviews its guides: where the numbers come from, what we refuse to publish, how often pages are reviewed and how to report an error.',
    heading: 'Editorial standards',
    lede: 'Every guide on this site is written by the people who build the calculators. This is the standard that work is held to, published so you can hold us to it.',
    updated: REVIEWED,
    priority: 0.5,
    changefreq: 'yearly',
    parent: '/about',
    faq: [
      {
        q: 'Who writes the guides on FinatriX?',
        a: 'The same team that builds the calculators. There are no guest posts, no sponsored articles and no invented author personas — where an article describes a calculation, it is written against the code that runs it, which is only possible because the writer and the engineer are the same people.',
      },
      {
        q: 'Does FinatriX accept sponsored content or affiliate links?',
        a: 'No. There are no affiliate links, no sponsored placements and no paid reviews anywhere on the site, and no product is ever named as a recommendation. The Careers subscription is the only revenue source, which is what makes that answer sustainable rather than aspirational.',
      },
      {
        q: 'Where do the numbers in FinatriX guides come from?',
        a: 'Every figure is either arithmetic reproduced from inputs shown on the same page, or a rule set by an external authority that the page links to. FinatriX publishes no proprietary market data, and does not present estimates as measurements.',
      },
      {
        q: 'How often are guides reviewed?',
        a: 'Each page carries a visible review date, and that date drives the machine-readable one in its structured data. Pages that state a tax rule or statutory limit are reviewed when those change; everything else is reviewed at least annually.',
      },
      {
        q: 'How do I report an error in a guide?',
        a: 'Email support with the page and the specific claim. Corrections to anything that affects a calculation are made directly and the review date is updated. We would rather be corrected than be consistent.',
      },
    ],
  },

  /* ── Help & support ──────────────────────────────────────────────────── */
  {
    path: '/help',
    name: 'Help Centre',
    title: 'Help Centre — Guides for Every FinatriX Tool | FinatriX',
    description:
      'Step-by-step guides for every FinatriX tool: budgeting, expense tracking, investing, goals, the life simulation, and the Careers job-search workspace.',
    heading: 'Help Centre',
    lede: 'Short, practical guides for getting a real answer out of each tool — and what to do when something is not working.',
    updated: REVIEWED,
    priority: 0.7,
    changefreq: 'monthly',
  },
  {
    path: '/faq',
    name: 'FAQ',
    title: 'Frequently Asked Questions | FinatriX',
    description:
      'Answers to the questions people ask most about FinatriX: what the tools do, where your data lives, whether any of it is financial advice, and what costs money.',
    heading: 'Frequently asked questions',
    lede: 'The questions we are asked most, answered plainly. If yours is not here, the Support page tells you exactly how to reach a human.',
    updated: REVIEWED,
    priority: 0.7,
    changefreq: 'monthly',
    faq: [
      {
        q: 'What is FinatriX?',
        a: 'An education-first personal finance and careers platform built for India. It has seven free money calculators and a paid Careers workspace for finding and tracking jobs. It is a set of tools for thinking clearly about money, not a bank, broker or adviser.',
      },
      {
        q: 'Is FinatriX financial advice?',
        a: 'No. Every calculator is an educational model. Outputs are illustrative, based on assumptions stated on each tool, and are not a recommendation to buy, sell or hold anything. FinatriX is not a SEBI-registered investment adviser and does not manage money.',
      },
      {
        q: 'Do I need an account to use the tools?',
        a: 'No. Every money tool works signed out, with your figures kept in your own browser. Creating a free account adds encrypted sync so the same numbers appear on your phone and laptop.',
      },
      {
        q: 'Where is my data stored?',
        a: 'Signed out, entirely in your browser — it never leaves your device. Signed in, in your account on our managed Postgres database, protected by row-level security so no other account can read it. The Privacy Policy lists exactly what is stored.',
      },
      {
        q: 'Do you sell my data or show ads?',
        a: 'No, and we never will. There are no advertising networks, no data brokers and no affiliate links on FinatriX. The Careers subscription is the only revenue source, which is what makes that promise sustainable rather than aspirational.',
      },
      {
        q: 'Do you use cookies or track me?',
        a: 'There are no advertising or tracking cookies. Product analytics are cookieless and anonymous: no identifier is persisted, nothing is linked across sessions or devices, and the whole system switches off automatically if your browser sends Do Not Track or Global Privacy Control.',
      },
      {
        q: 'What does FinatriX cost?',
        a: 'All seven money tools are free with no limits. FinatriX Careers is paid, starting at ₹199 per month, charged once per billing period with no auto-renewal. Full detail is on the Pricing page.',
      },
      {
        q: 'Are the tax and return assumptions up to date?',
        a: 'Each tool states the assumptions it uses on the page itself, including tax treatment and any modelled return. Tax rules change; we review the assumptions when they do, and the review date is shown on each page. Always confirm anything that affects a real decision.',
      },
      {
        q: 'Can I export my data?',
        a: 'Yes. Reports export to PDF, Excel and Word, and expense data exports to a spreadsheet. Your data is yours — export or delete it at any time from your profile.',
      },
      {
        q: 'How do I delete my account?',
        a: 'Ask from your profile page or email support, and the account and everything in it is deleted. Deletion is permanent and is not a soft flag on a row we keep.',
      },
      {
        q: 'Which currencies and countries does FinatriX support?',
        a: 'The tools are calibrated for India — rupee formatting in lakh and crore, Indian tax slabs, SIPs and Indian instruments — and display in 40 currencies. The tax and instrument logic is India-specific and should not be relied on elsewhere.',
      },
      {
        q: 'Does FinatriX connect to my bank?',
        a: 'No. There is no bank connection, no account aggregation and no read access to any financial account. Everything you see is calculated from figures you enter yourself, which is also why nothing here can move money.',
      },
    ],
  },
  {
    path: '/support',
    name: 'Support',
    title: 'Support — Get Help With FinatriX',
    description:
      'How to reach FinatriX support, what to include so we can help on the first reply, how quickly we respond, and how billing and data requests are handled.',
    heading: 'Support',
    lede: 'One inbox, answered by the people who build the product. Here is how to reach it and what to expect back.',
    updated: REVIEWED,
    priority: 0.6,
    changefreq: 'monthly',
    faq: [
      {
        q: 'How quickly does FinatriX respond to support requests?',
        a: 'We aim to reply to every email within two working days, and to billing or account-access problems within one. These are targets we hold ourselves to, not a contractual service level.',
      },
      {
        q: 'What should I include in a support email?',
        a: 'The page or tool you were on, what you expected to happen, what actually happened, and the device and browser you were using. A screenshot helps. Never include your password — no one at FinatriX will ever ask for it.',
      },
      {
        q: 'How do I report a security issue?',
        a: 'Email the same support address with "Security" in the subject line and it is triaged ahead of the queue. Please give us a reasonable window to fix an issue before disclosing it publicly.',
      },
      {
        q: 'How do I request a copy or deletion of my data?',
        a: 'Email support from the address on your account and say which you want. Export and deletion are both handled directly; deletion is permanent and covers everything associated with the account.',
      },
    ],
  },
  {
    path: '/contact',
    name: 'Contact',
    title: 'Contact FinatriX — Support, Privacy and Security',
    description:
      'How to contact FinatriX for product support, billing questions, privacy and data requests, security reports, or press and partnership enquiries.',
    heading: 'Contact FinatriX',
    lede: 'One address, read by the team that builds FinatriX. Use the subject line that matches your reason and it reaches the right person faster.',
    updated: REVIEWED,
    priority: 0.6,
    changefreq: 'yearly',
  },

  /* ── Trust ───────────────────────────────────────────────────────────── */
  {
    path: '/security',
    name: 'Trust & Security',
    title: 'Trust & Security — How FinatriX Protects Your Data',
    description:
      'The security controls behind FinatriX: row-level database isolation, encrypted transport, no card data on our servers, and what we deliberately never collect.',
    heading: 'Trust & security',
    lede: 'What actually protects your data, described concretely enough to check — and an honest list of what we have not done yet.',
    updated: REVIEWED,
    priority: 0.6,
    changefreq: 'monthly',
    faq: [
      {
        q: 'Does FinatriX store my card details?',
        a: 'No. Card details are entered on a payment page hosted by Stripe and never reach a FinatriX server. We store only the outcome of a payment — amount, status and a receipt link.',
      },
      {
        q: 'Can another user see my data?',
        a: 'No. Every table carrying user data is protected by database-level row security keyed to your account, and uploaded files live in a storage folder owned by your account id. The check runs in the database, so it holds even if application code has a bug.',
      },
      {
        q: 'Is my data encrypted?',
        a: 'All traffic is HTTPS-only and forced at the edge, and data is encrypted at rest by our database and storage providers. Data you enter while signed out never leaves your browser at all.',
      },
      {
        q: 'What does FinatriX deliberately not collect?',
        a: 'No advertising or tracking cookies, no device fingerprinting, no reading of your browser history, no bank connection and no third-party ad networks. Analytics carry a route template such as /tools/:tool, never the amounts you enter.',
      },
    ],
  },
  {
    path: '/refunds',
    name: 'Refunds & Cancellations',
    title: 'Refunds & Cancellations — FinatriX Billing Policy',
    description:
      'FinatriX refund and cancellation policy: the 7-day refund window on a first purchase, how to cancel, what is not refundable, and how to raise a billing dispute.',
    heading: 'Refunds & cancellations',
    lede: 'Plans are charged once per period and never auto-renew, so cancelling is simply not buying another period. Here is the rest of it in plain terms.',
    updated: REVIEWED,
    priority: 0.5,
    changefreq: 'yearly',
    faq: [
      {
        q: 'How do I cancel my FinatriX Careers plan?',
        a: 'There is nothing to cancel. Each purchase covers one billing period and no recurring mandate is created, so your plan simply ends at the end of the period you paid for unless you buy another one.',
      },
      {
        q: 'Can I get a refund?',
        a: 'A first purchase of a paid period can be refunded within 7 days of payment, provided the paid Careers features have not been substantially used. Email support from the address on your account and the refund is issued to the original payment method.',
      },
      {
        q: 'How long does a refund take to arrive?',
        a: 'We process approved refunds within two working days. Your bank or card issuer then takes its own time to post it — typically five to ten working days in India.',
      },
      {
        q: 'What is not refundable?',
        a: 'Periods that have already been used substantially, renewals of a period you previously used, and accounts suspended for breaching the Terms. This does not affect statutory rights you have under Indian consumer law.',
      },
    ],
  },

  /* ── Careers (public surface) ────────────────────────────────────────── */
  {
    path: '/careers',
    name: 'Careers',
    title: 'FinatriX Careers — AI Job Search & Resume Matching',
    description:
      'Search jobs across multiple sources at once, score every role against your own resume, and track each application to offer. Built for careers in India.',
    heading: 'Stop scrolling job boards. Start matching.',
    lede: 'FinatriX Careers searches several job sources at once, scores every role against your actual resume, and tracks the whole process from saved role to signed offer.',
    updated: REVIEWED,
    priority: 0.9,
    changefreq: 'weekly',
    faq: [
      {
        q: 'What is FinatriX Careers?',
        a: 'A job-search workspace: it searches several job providers at once and de-duplicates the results, scores each role against a resume you upload, and tracks every application through its stages, tasks and interviews in one place.',
      },
      {
        q: 'How does the match score work?',
        a: 'Your resume is parsed into skills, titles and experience, then compared with the requirements the job description actually states. The score is deterministic — the same resume and the same job always produce the same number — and each page shows which requirements matched and which did not.',
      },
      {
        q: 'Is my resume shared with employers or recruiters?',
        a: 'No. Your resume is stored in your own account, is never listed in a searchable database, and is never sent to an employer, a recruiter or a job board. It is used to score roles for you and nothing else.',
      },
      {
        q: 'Does FinatriX apply to jobs on my behalf?',
        a: 'No. FinatriX prepares the application — tailoring, cover-letter drafts, interview prep and the tracker — and you apply on the employer’s own site. Nothing is submitted automatically in your name.',
      },
      {
        q: 'What does FinatriX Careers cost?',
        a: 'Plans start at ₹199 per month, charged once per billing period with no auto-renewal. The seven FinatriX money tools stay free regardless of whether you use Careers.',
      },
      {
        q: 'Do I need to use the money tools to use Careers?',
        a: 'No. They share one account and one sign-in, but each works on its own. Many people use only one side of FinatriX.',
      },
    ],
  },
  {
    path: '/careers/features',
    name: 'Features',
    title: 'Careers Features — Search, Match, Track, Prepare | FinatriX',
    description:
      'Everything in the FinatriX Careers workspace: multi-source job search, resume match scoring, application tracking, interview prep and company research.',
    heading: 'Everything in the Careers workspace',
    lede: 'A tour of what you get, what each part is for, and where the honest limits of it are.',
    updated: REVIEWED,
    priority: 0.7,
    changefreq: 'monthly',
    parent: '/careers',
  },
  ...COMPARISON_PAGES,

  /* ── Money-tool comparisons ──────────────────────────────────────────── */
  ...ALTERNATIVE_PAGES,

  /* ── Company intelligence ────────────────────────────────────────────── */
  ...COMPANY_PAGES,

  /* ── Legal ───────────────────────────────────────────────────────────── */
  // Rendered by the narrower `LegalPage` shell rather than the marketing one.
  // Listed here anyway so there is exactly ONE place that knows a URL is public:
  // their titles, descriptions, share cards, sitemap entries and the visible
  // "last updated" stamp all resolve from this entry.
  {
    path: '/privacy',
    name: 'Privacy Policy',
    kind: 'legal',
    title: 'Privacy Policy | FinatriX',
    description:
      'How FinatriX handles your data: what is stored locally in your browser, what syncs to your account, what is never collected, and how to delete it all.',
    ogKey: 'privacy',
    updated: '2026-07-11',
    priority: 0.3,
    changefreq: 'yearly',
  },
  {
    path: '/terms',
    name: 'Terms & Conditions',
    kind: 'legal',
    // Matches the page's own H1. The two disagreed before ("Terms of Use" in the
    // head, "Terms & Conditions" on the page), which is a small thing that reads
    // as carelessness on the one page whose whole job is to be precise.
    title: 'Terms & Conditions — Billing, Use, Disclaimers | FinatriX',
    description:
      'The terms covering your use of FinatriX, including billing for Careers plans and the educational nature of every calculator. FinatriX is not financial advice.',
    ogKey: 'terms',
    updated: REVIEWED,
    priority: 0.3,
    changefreq: 'yearly',
  },
] as const;

/** Fast lookup by exact, normalised path. */
const BY_PATH = new Map(PUBLIC_PAGES.map((p) => [p.path, p]));

/** The registry entry for a path, or null. Trailing slashes are ignored. */
export function publicPageFor(pathname: string): PublicPage | null {
  const p = pathname.replace(/\/+$/, '') || '/';
  return BY_PATH.get(p) ?? null;
}

/** Every registered public path. Used by the router allowlist and the sitemap. */
export const PUBLIC_PAGE_PATHS: readonly string[] = PUBLIC_PAGES.map((p) => p.path);

/** The rival behind a `/careers/compare/<slug>` path, when there is one. */
export function rivalFor(slug: string | undefined): Rival | null {
  if (!slug) return null;
  return RIVALS.find((r) => r.slug === slug) ?? null;
}
