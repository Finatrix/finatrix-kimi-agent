/**
 * Per-route SEO metadata for a single-page app.
 *
 * Every client route is served the same `index.html`, so its static head tags
 * described the HOMEPAGE on every URL — canonical, title, description, Open
 * Graph and Twitter alike. For the seven calculator pages, which are the primary
 * organic-acquisition surface and the only URLs in `sitemap.xml`, that meant:
 *
 *   • a canonical instructing search engines to consolidate them into `/`;
 *   • one identical title and description across all seven, so they compete for
 *     the same query and none describes what it actually does;
 *   • link unfurls (WhatsApp, Slack, X, LinkedIn) that render the landing card
 *     no matter which tool was shared.
 *
 * This module is the single source of truth for what any given path should
 * advertise:
 *   • the canonical URL (or none, for non-public pages),
 *   • whether the page should be indexed,
 *   • its title and description, and
 *   • its per-page JSON-LD (`structuredDataForPath`).
 *
 * It is consumed twice, and that is deliberate: `applySeo` applies it in the
 * browser on client-side navigation, and `withSeoMetadata` in `worker/index.ts`
 * applies the SAME values at the edge so the metadata is correct in the raw
 * bytes, before any JavaScript runs. Sharing one pure function is what stops the
 * two from drifting.
 *
 * Pure and DOM-free apart from `applySeo`, which is the only place that touches
 * the document.
 */

import { CANONICAL_HOST, TOOL_IDS, type ToolId } from '../shared/routes';
import { publicPageFor, type PublicPage } from '../shared/publicPages';
import { TOOL_FAQ } from '../shared/toolFaq';
import { readingMinutes, wordCount } from '../content/readingTime';
import type { TopicContent } from '../content/types';
import {
  AUTHOR,
  LEARN_ROOT,
  TOPICS,
  articleFor,
  articlesInTopic,
  topicFor,
  type Article,
  type Topic,
} from '../shared/content';

/**
 * The origin to advertise in canonical/OG URLs. NEVER `location.origin`: the app
 * is reachable on `www`, on legacy domains during their redirect window and on
 * `*.workers.dev` previews; advertising any of those as canonical would fragment
 * or misdirect indexing. `VITE_CANONICAL_ORIGIN` exists only as an escape hatch —
 * the default is the real production apex, so a build with no env at all is
 * still correct.
 */
export const CANONICAL_ORIGIN = (
  (import.meta.env?.VITE_CANONICAL_ORIGIN as string | undefined) || `https://${CANONICAL_HOST}`
).replace(/\/+$/, '');

export const SITE_NAME = 'FinatriX';

/**
 * Homepage title/description. Must stay byte-identical to the static tags in
 * `index.html` — that file is the shell every route is served from, and
 * `seo.test.ts` asserts the two agree, so a change here without a change there
 * fails the build rather than silently shipping two different homepages.
 */
export const DEFAULT_TITLE = 'FinatriX — Smart Money Tools for India';
export const DEFAULT_DESCRIPTION =
  'Seven free, education-first money tools for India: budgeting, expenses, investing, benchmarking and a lifelong wealth simulation. Not financial advice.';

/**
 * The homepage's social-card description, which is deliberately NOT the meta
 * description: a search snippet has to name the tools so the listing matches a
 * long-tail query, whereas a share card is read at a glance and does better with
 * the one-line pitch. Every other page mirrors its meta description into the
 * card, because writing a second variant per tool would be two strings to keep
 * true rather than one.
 */
export const DEFAULT_SOCIAL_DESCRIPTION =
  'Seven free, education-first money tools for India — budgeting, investing, benchmarking and a full life-long wealth simulation.';

/**
 * Cache-busting token for the share cards.
 *
 * Unfurl caches (Facebook, X, WhatsApp, LinkedIn, Slack) key on the image URL
 * and hold it for months — a filename whose BYTES changed keeps unfurling the
 * previous artwork long after the site has moved on, and there is no way to
 * purge it short of each platform's own debugger. Bump this whenever
 * `scripts/generate-og-images.py` is re-run with a visual change.
 */
export const OG_VERSION = '3';

/**
 * Share card for a route. Absolute, because no OG consumer resolves a relative
 * URL — a path-only `og:image` is simply dropped.
 *
 * Every page had ONE card before this: the wordmark on a black field, which told
 * a reader nothing about the link they had actually been sent. The seven
 * calculators now each get their own, generated from this module's own copy by
 * `scripts/generate-og-images.py` so the card and the page's description cannot
 * disagree.
 */
function ogImageFor(key: string | null): string {
  const file = key ? `og/${key}.jpg` : 'og-cover.jpg';
  return `${CANONICAL_ORIGIN}/images/${file}?v=${OG_VERSION}`;
}

/** The default/homepage card, also used by every route without one of its own. */
export const OG_IMAGE = ogImageFor(null);

export interface RouteSeo {
  /** Absolute canonical URL, or null when the page must not be indexed. */
  canonical: string | null;
  /** Value for `<meta name="robots">`. */
  robots: 'index, follow' | 'noindex, nofollow';
  /** Full `<title>` text, already suffixed with the brand. */
  title: string;
  /** `<meta name="description">` — the search-result snippet. */
  description: string;
  /** Copy for og:description / twitter:description. Defaults to `description`. */
  socialDescription: string;
  /** Absolute URL of the og:image / twitter:image for this route. */
  image: string;
  /** Alt text for the card — a large image needs it for the same reason an `<img>` does. */
  imageAlt: string;
}

/** Normalise a pathname: strip trailing slashes, collapse to '/' when empty. */
function normalisePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

/**
 * SEO copy for the seven public calculators.
 *
 * Descriptions are written against what each tool ACTUALLY does — the inputs,
 * outputs and instrument coverage in `src/tools/pages/*` — not against what
 * would rank best. A description that oversells a calculator is both a
 * trust problem and, for a finance product, a compliance one: every one of these
 * is an educational model, and none of them is advice.
 *
 * Titles stay under ~60 characters so they survive Google's SERP truncation
 * intact, and lead with the tool's own name because that is the brand+ query
 * people actually return with. Descriptions sit at ~150 characters for the
 * same reason.
 */
interface ToolSeo {
  /** Display name — mirrors `src/lib/tools.ts`. */
  name: string;
  title: string;
  description: string;
  /** schema.org applicationSubCategory, for the per-page SoftwareApplication node. */
  category: string;
}

const TOOL_SEO: Record<ToolId, ToolSeo> = {
  budget: {
    name: 'Budget Builder',
    title: 'Budget Builder — 50/30/20 Budget Calculator | FinatriX',
    description:
      'Split your monthly income the 50/30/20 way across needs, wants and savings. A free, education-first budget calculator built for Indian salaries.',
    category: 'Budgeting',
  },
  expenses: {
    name: 'Expense Tracker',
    title: 'Expense Tracker — Log & Categorise Spending | FinatriX',
    description:
      'Log daily spending, categorise it and spot the patterns behind your monthly outflow. A free, private expense tracker for India — your data stays yours.',
    category: 'Expense tracking',
  },
  investmatch: {
    name: 'InvestMatch',
    title: 'InvestMatch — Risk-Matched Portfolio Allocation | FinatriX',
    description:
      'Answer a short risk and horizon questionnaire to see an illustrative portfolio allocation and how a monthly SIP could grow. Educational, not advice.',
    category: 'Investing',
  },
  parksmart: {
    name: 'ParkSmart',
    title: 'ParkSmart — Where to Park Idle Cash, Post-Tax | FinatriX',
    description:
      'Compare savings accounts, liquid funds, fixed deposits and arbitrage funds on a post-tax basis, and see where short-term idle cash actually works hardest.',
    category: 'Cash management',
  },
  peercompare: {
    name: 'PeerCompare',
    title: 'PeerCompare — Benchmark Your Money Against Peers | FinatriX',
    description:
      'See how your savings rate, expenses, investments and emergency buffer compare with peers at a similar income in India. An educational benchmarking tool.',
    category: 'Benchmarking',
  },
  goals: {
    name: 'Reverse Goal Planner',
    title: 'Reverse Goal Planner — Work Back to Your SIP | FinatriX',
    description:
      'Start from the goal, not the instalment. Enter a target in today’s money and a horizon to see the monthly SIP it takes — with a 10% step-up option.',
    category: 'Goal planning',
  },
  lifemap: {
    name: 'LifeMap',
    title: 'LifeMap — Simulate Your Whole Financial Life | FinatriX',
    description:
      'Project income, investments, debt and major life decisions across decades, and see how one choice today reshapes your net worth and financial health.',
    category: 'Financial planning',
  },
};

/**
 * Titles for routes that are NOT indexable — the signed-in app, the careers
 * workspace and the auth pages.
 *
 * They carry no SEO weight (every one of them is `noindex`), but the document
 * title is also an accessibility surface: it is the first thing a screen reader
 * announces after a navigation, and the only label distinguishing one entry in
 * the browser's history and tab strip from another. Previously these lived in
 * `App.tsx` and, for the tool pages, a second copy in `ToolRoute.tsx` — three
 * maps that had to agree and had no test forcing them to.
 */
const PRIVATE_TITLES: Record<string, string> = {
  '/tools': 'Money Tools',
  '/tools/dashboard': 'Dashboard',
  '/tools/reports': 'Reports',
  '/tools/calendar': 'Calendar',
  '/tools/settings': 'Settings',
  '/dashboard': 'Dashboard',
  // '/careers' is NOT here any more: it is now the public, indexable Careers
  // landing page (see src/shared/publicPages.ts) rather than an alias for the
  // signed-in dashboard, which lives at '/careers/dashboard'.
  '/careers/dashboard': 'Careers Dashboard',
  '/careers/upload': 'Upload Resume',
  '/careers/resumes': 'Resume Library',
  '/careers/jobs': 'Job Search',
  '/careers/applications': 'Applications',
  '/careers/tasks': 'Tasks',
  '/careers/companies': 'Companies',
  '/careers/intelligence': 'Company Intelligence',
  '/careers/intelligence/company': 'Company Intelligence',
  '/careers/recruiters': 'Recruiters',
  '/careers/network': 'Network',
  '/careers/interviews': 'Interview Prep',
  '/careers/assessments': 'Assessments',
  '/careers/offers': 'Offers',
  '/careers/knowledge': 'Knowledge Base',
  '/careers/coach': 'Career Coach',
  '/careers/billing': 'Billing',
  '/careers/admin': 'Admin',
  '/careers/profile': 'Career Profile',
  '/careers/settings': 'Careers Settings',
  '/login': 'Sign In',
  '/signup': 'Create Account',
  '/welcome': 'Welcome',
  '/profile': 'Your Profile',
};

/* ------------------------------------------------------------------------- *
 * Knowledge layer
 * ------------------------------------------------------------------------- */

/**
 * The `/learn` hub's own copy. Held here rather than in `content.ts` for the
 * same reason the tool copy is: `content.ts` describes topics and articles, and
 * the hub is neither.
 */
const LEARN_HUB = {
  title: 'Learn — Money and Career Guides for India | FinatriX',
  description:
    'Guides to budgeting, saving, investing and careers in India — with every formula printed and every assumption stated, so you can check the numbers yourself.',
  name: 'Learn',
} as const;

/**
 * Resolve a `/learn/*` path to what it is.
 *
 * One parse, used by both `seoForPath` and `structuredDataForPath`, so the head
 * and the JSON-LD can never describe different pages for the same URL.
 */
type LearnRoute =
  | { kind: 'hub' }
  | { kind: 'topic'; topic: Topic }
  | { kind: 'article'; topic: Topic; article: Article };

function learnRouteFor(path: string): LearnRoute | null {
  if (path === LEARN_ROOT) return { kind: 'hub' };
  const parts = path.split('/').filter(Boolean);
  if (parts[0] !== 'learn') return null;

  if (parts.length === 2) {
    const topic = topicFor(parts[1]);
    return topic ? { kind: 'topic', topic } : null;
  }
  if (parts.length === 3) {
    const topic = topicFor(parts[1]);
    const article = articleFor(parts[1], parts[2]);
    return topic && article ? { kind: 'article', topic, article } : null;
  }
  return null;
}

/** The tool id for a `/tools/<id>` path, when it is one of the seven public ones. */
function publicToolId(path: string): ToolId | null {
  const m = path.match(/^\/tools\/([^/]+)$/);
  if (!m) return null;
  const id = m[1];
  return (TOOL_IDS as readonly string[]).includes(id) ? (id as ToolId) : null;
}

/**
 * Public, indexable routes. Deliberately a strict allowlist rather than a
 * denylist: a new authenticated route must not become indexable by default.
 * Mirrors `public/sitemap.xml` — if a URL is in the sitemap it must be
 * self-canonical here, and vice versa.
 */
export function seoForPath(pathname: string): RouteSeo {
  const p = normalisePath(pathname);

  // `/home` renders a redirect to `/`; both must point at one canonical URL so
  // they are never treated as duplicate content.
  if (p === '/' || p === '/home') {
    return {
      canonical: `${CANONICAL_ORIGIN}/`,
      robots: 'index, follow',
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      socialDescription: DEFAULT_SOCIAL_DESCRIPTION,
      image: OG_IMAGE,
      imageAlt: `${SITE_NAME} — smart money tools for India`,
    };
  }

  // The registered public surface: pricing, careers marketing, help, trust and
  // the legal pages. One entry per URL in `src/shared/publicPages.ts` supplies
  // the copy here, the visible page copy, the sitemap row and the edge Worker's
  // 200 — so a page cannot be indexable in one of those and absent from another.
  const page = publicPageFor(p);
  if (page) {
    return {
      canonical: `${CANONICAL_ORIGIN}${p}`,
      robots: 'index, follow',
      title: page.title,
      description: page.description,
      socialDescription: page.description,
      image: ogImageFor(page.ogKey ?? null),
      imageAlt: `${page.name} — ${SITE_NAME}`,
    };
  }

  // The knowledge layer. Every one of these URLs is indexable and self-
  // canonical; anything under /learn that does NOT resolve here falls through
  // to the noindex default below and is served 404 by the edge, so a mistyped
  // slug can never become a soft 404 competing with the real article.
  const learn = learnRouteFor(p);
  if (learn) {
    const copy =
      learn.kind === 'hub'
        ? { title: LEARN_HUB.title, description: LEARN_HUB.description, name: LEARN_HUB.name }
        : learn.kind === 'topic'
          ? { title: learn.topic.title, description: learn.topic.description, name: learn.topic.name }
          : {
              title: learn.article.title,
              description: learn.article.description,
              name: learn.article.heading,
            };
    return {
      canonical: `${CANONICAL_ORIGIN}${p}`,
      robots: 'index, follow',
      title: copy.title,
      description: copy.description,
      socialDescription: copy.description,
      // One card per TOPIC, inherited by its articles. Not one per article:
      // sixty-odd near-identical JPEGs is real weight in the repository for a
      // marginal gain, and a card naming the topic and its description is an
      // accurate description of any article inside it. `seo.test.ts` asserts
      // every key here resolves to a file that actually exists — a missing one
      // unfurls as a blank card, which is worse than the generic cover.
      image: ogImageFor(learn.kind === 'hub' ? 'learn' : `learn-${learn.topic.slug}`),
      imageAlt: `${copy.name} — ${SITE_NAME}`,
    };
  }

  // `/tools` is NOT indexable: ToolsIndex always redirects to /tools/dashboard
  // (or the visitor's last-used tool), so the URL never renders a page of its
  // own. Marking it indexable advertised a destination that immediately
  // noindexes itself. It is omitted from sitemap.xml for the same reason.

  const tool = publicToolId(p);
  if (tool) {
    return {
      canonical: `${CANONICAL_ORIGIN}${p}`,
      robots: 'index, follow',
      title: TOOL_SEO[tool].title,
      description: TOOL_SEO[tool].description,
      socialDescription: TOOL_SEO[tool].description,
      image: ogImageFor(tool),
      imageAlt: `${TOOL_SEO[tool].name} — ${SITE_NAME}`,
    };
  }

  // Everything else — the signed-in careers app, auth pages, the tools
  // dashboard, unknown URLs — is private or has no standalone search value.
  // No canonical is advertised, and crawlers are told to skip it.
  const label = PRIVATE_TITLES[p];
  return {
    canonical: null,
    robots: 'noindex, nofollow',
    title: label ? `${label} — ${SITE_NAME}` : DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    socialDescription: DEFAULT_SOCIAL_DESCRIPTION,
    image: OG_IMAGE,
    imageAlt: `${SITE_NAME} — smart money tools for India`,
  };
}

/* ------------------------------------------------------------------------- *
 * Structured data
 * ------------------------------------------------------------------------- */

/**
 * Per-page JSON-LD, as a `@graph` that complements — rather than repeats — the
 * site-level Organization / WebSite / WebApplication graph that ships statically
 * in `index.html`. Every node references those by `@id` instead of restating
 * them, which is what lets a crawler resolve one brand entity across the site
 * rather than re-learning it per URL.
 *
 * Emitted only for indexable pages. A `noindex` URL gets `null`: describing a
 * page to a crawler that has just been told to ignore it is noise at best, and
 * for the signed-in careers workspace it would leak the app's internal structure
 * into a machine-readable format for no benefit.
 *
 * `FAQPage` IS now emitted — but only where the page really renders the
 * questions. Google requires FAQ markup to describe question-and-answer content
 * visible on the page, and emitting it otherwise invites a structured-data
 * manual action. That rule is enforced structurally rather than by review: the
 * markup is generated from the same array the component maps over — `TOOL_FAQ`
 * for the seven calculators, `PublicPage.faq` for the marketing pages — so
 * markup without a visible FAQ is not a mistake anyone can make here.
 *
 * Still deliberately absent: `aggregateRating`, which needs real reviews to be
 * honest, and `JobPosting`, which describes a vacancy an employer is offering.
 * FinatriX Careers is a tool for searching other people's vacancies and is not
 * itself hiring, so marking any of its pages as a JobPosting would be a false
 * claim to a search engine about an open role that does not exist.
 */
export type JsonLd = Record<string, unknown>;

const ORG_ID = `${CANONICAL_ORIGIN}/#org`;
const WEBSITE_ID = `${CANONICAL_ORIGIN}/#website`;

/**
 * `BreadcrumbList` for a page, given the trail of ancestor crumbs between Home
 * and it. `trail` is ordered outermost-first and excludes both Home (always
 * prepended) and the page itself (always appended).
 */
function breadcrumb(
  name: string,
  url: string,
  trail: ReadonlyArray<{ name: string; path: string }> = [],
): JsonLd {
  const items: JsonLd[] = [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${CANONICAL_ORIGIN}/` },
  ];
  for (const crumb of trail) {
    items.push({
      '@type': 'ListItem',
      position: items.length + 1,
      name: crumb.name,
      item: `${CANONICAL_ORIGIN}${crumb.path}`,
    });
  }
  // The last crumb intentionally carries no `item`: it IS the current page,
  // and a self-link is the one thing Google's breadcrumb guidance calls out
  // as unnecessary.
  items.push({ '@type': 'ListItem', position: items.length + 1, name });
  return {
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: items,
  };
}

/**
 * The ancestor chain of a registered page, outermost first.
 *
 * Walks `parent` links rather than splitting the path, because the two are not
 * the same thing: `/careers/compare/indeed` sits under `/careers/compare`, but
 * `/careers/features` sits under `/careers`, and only the registry knows which.
 * Bounded by the registry's own depth — a cycle would otherwise hang the edge
 * Worker, so the loop is capped rather than trusted.
 */
export function ancestorsOf(page: PublicPage): Array<{ name: string; path: string }> {
  const trail: Array<{ name: string; path: string }> = [];
  let cursor = page.parent ? publicPageFor(page.parent) : null;
  for (let depth = 0; cursor && depth < 8; depth += 1) {
    trail.unshift({ name: cursor.name, path: cursor.path });
    cursor = cursor.parent ? publicPageFor(cursor.parent) : null;
  }
  return trail;
}

/**
 * `FAQPage` for a page that really renders the questions.
 *
 * Emitted ONLY from `page.faq`, which is the same array the component maps over
 * — Google's guidance requires the marked-up Q&A to be visible on the page, and
 * a manual action for FAQ markup that describes nothing is a far worse outcome
 * than no rich result. Tying both to one array is what makes that structural
 * rather than a review checklist item.
 */
function faqPage(url: string, faq: ReadonlyArray<{ q: string; a: string }>): JsonLd {
  return {
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    mainEntity: faq.map((entry) => ({
      '@type': 'Question',
      name: entry.q,
      acceptedAnswer: { '@type': 'Answer', text: entry.a },
    })),
  };
}

/** The `WebPage` node every indexable URL gets. */
function webPage(url: string, seo: RouteSeo, extra: JsonLd = {}): JsonLd {
  return {
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: seo.title,
    description: seo.description,
    inLanguage: 'en-IN',
    isPartOf: { '@id': WEBSITE_ID },
    about: { '@id': ORG_ID },
    primaryImageOfPage: seo.image,
    ...extra,
  };
}

/** The shared author node. Referenced by `@id` from every article rather than restated. */
const AUTHOR_ID = `${CANONICAL_ORIGIN}${AUTHOR.url}#author`;

function authorNode(): JsonLd {
  return {
    '@type': 'Organization',
    '@id': AUTHOR_ID,
    name: AUTHOR.name,
    url: `${CANONICAL_ORIGIN}${AUTHOR.url}`,
    description: AUTHOR.description,
    parentOrganization: { '@id': ORG_ID },
  };
}

/**
 * JSON-LD for a knowledge-layer URL.
 *
 * Three shapes, and the differences between them are claims about the page, not
 * decoration:
 *
 *   • the hub gets a `CollectionPage` with an `ItemList` of its topics, which is
 *     what it is — a page whose content is an organised set of other pages;
 *   • a topic hub gets `CollectionPage` + `FAQPage`, because it renders both a
 *     list of guides and a visible FAQ;
 *   • an article gets `Article`, and deliberately NOT `HowTo` even where `kind`
 *     is `howto`. A valid `HowTo` node has to enumerate the actual steps, and
 *     those live in the body module this file must not import — emitting one
 *     with the steps omitted or invented would describe a procedure the page
 *     does not contain, which is exactly the kind of claim that earns a
 *     structured-data manual action.
 *
 * `FAQPage` is emitted from the same array the component renders, exactly as it
 * is for the marketing pages — see the note on `faqPage`.
 *
 * `copy` is the topic's lazily-loaded editorial chunk, and everything that
 * depends on it is conditional for a reason worth stating: those nodes describe
 * content that is only on the page once that chunk has arrived. Emitting an
 * `abstract`, a `FAQPage` or a `DefinedTermSet` without it would be markup
 * describing prose the document does not yet contain — the exact failure the
 * "must be visible on the page" rule exists to prevent. The edge Worker always
 * has the copy (it is a server bundle, so it imports every topic eagerly), so
 * the SERVED bytes always carry the complete graph; the browser upgrades to it
 * when the chunk resolves.
 */
function learnGraph(
  url: string,
  seo: RouteSeo,
  learn: LearnRoute,
  copy?: TopicContent | null,
): JsonLd {
  const graph: JsonLd[] = [];

  if (learn.kind === 'hub') {
    graph.push(
      webPage(url, seo, { '@type': 'CollectionPage', breadcrumb: { '@id': `${url}#breadcrumb` } }),
      breadcrumb(LEARN_HUB.name, url),
      {
        '@type': 'ItemList',
        '@id': `${url}#topics`,
        itemListElement: TOPICS.map((t, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: t.name,
          url: `${CANONICAL_ORIGIN}${LEARN_ROOT}/${t.slug}`,
        })),
      },
    );
    return { '@context': 'https://schema.org', '@graph': graph };
  }

  if (learn.kind === 'topic') {
    const { topic } = learn;
    const articles = articlesInTopic(topic.slug);
    graph.push(
      webPage(url, seo, {
        '@type': 'CollectionPage',
        breadcrumb: { '@id': `${url}#breadcrumb` },
        dateModified: topic.updated,
      }),
      breadcrumb(topic.name, url, [{ name: LEARN_HUB.name, path: LEARN_ROOT }]),
      {
        '@type': 'ItemList',
        '@id': `${url}#guides`,
        itemListElement: articles.map((a, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: a.heading,
          url: `${CANONICAL_ORIGIN}${LEARN_ROOT}/${a.topic}/${a.slug}`,
        })),
      },
    );
    if (copy) {
      graph.push(
        faqPage(url, copy.topic.faq),
        // `DefinedTermSet` is what the visible vocabulary block actually is, and
        // it is the node an answer engine reads to learn which entity this topic
        // is about. Emitted only because those definitions are on the page.
        {
          '@type': 'DefinedTermSet',
          '@id': `${url}#terms`,
          name: `${topic.name} terms`,
          hasDefinedTerm: copy.topic.definitions.map((d) => ({
            '@type': 'DefinedTerm',
            name: d.term,
            description: d.definition,
            inDefinedTermSet: { '@id': `${url}#terms` },
          })),
        },
      );
    }
    return { '@context': 'https://schema.org', '@graph': graph };
  }

  const { topic, article } = learn;
  const articleCopy = copy?.articles[article.slug];
  graph.push(
    webPage(url, seo, {
      breadcrumb: { '@id': `${url}#breadcrumb` },
      dateModified: article.updated,
    }),
    // `article.crumb`, not `article.heading` — the same short label the visible
    // trail renders. Breadcrumb markup has to describe the breadcrumb the page
    // shows, and the two previously disagreed.
    breadcrumb(article.crumb, url, [
      { name: LEARN_HUB.name, path: LEARN_ROOT },
      { name: topic.name, path: `${LEARN_ROOT}/${topic.slug}` },
    ]),
    authorNode(),
    {
      '@type': 'Article',
      '@id': `${url}#article`,
      headline: article.heading,
      description: article.description,
      // The visible "In short" block. Publishing it as `abstract` is what lets
      // an answer engine quote the conclusion rather than reconstruct one.
      ...(articleCopy
        ? {
            abstract: articleCopy.summary,
            // Both derived from the body by the same function the visible
            // "N min read" stamp uses, so the markup cannot promise a shorter
            // read than the page delivers. ISO 8601 duration, as schema.org
            // requires.
            wordCount: wordCount(articleCopy),
            timeRequired: `PT${readingMinutes(articleCopy)}M`,
          }
        : {}),
      url,
      inLanguage: 'en-IN',
      datePublished: article.published,
      dateModified: article.updated,
      author: { '@id': AUTHOR_ID },
      publisher: { '@id': ORG_ID },
      isPartOf: { '@id': WEBSITE_ID },
      mainEntityOfPage: { '@id': `${url}#webpage` },
      about: { '@type': 'Thing', name: topic.name },
      articleSection: topic.name,
      image: seo.image,
    },
  );

  if (articleCopy?.faq?.length) graph.push(faqPage(url, articleCopy.faq));

  return { '@context': 'https://schema.org', '@graph': graph };
}

/**
 * Per-page JSON-LD.
 *
 * `copy` is only ever consulted for a `/learn/*` URL, and only to add the nodes
 * that describe lazily-loaded prose — see `learnGraph`. Callers:
 *
 *   • `worker/index.ts` passes it from `src/content/all.ts`, a static aggregate
 *     that exists solely for the edge. The Worker is a server bundle, so the
 *     size of that import costs a visitor nothing, and it is what guarantees the
 *     complete graph is in the raw bytes for the consumers that never run
 *     JavaScript — link unfurlers, Bing, and most AI answer engines.
 *   • `applySeo` passes nothing on a navigation, then the topic and article
 *     pages call `applyContentSchema` with their own loaded chunk. The graph is
 *     therefore always valid and never stale: complete on arrival, briefly
 *     narrower on a client-side navigation, complete again a moment later.
 */
export function structuredDataForPath(
  pathname: string,
  copy?: TopicContent | null,
): JsonLd | null {
  const p = normalisePath(pathname);
  const seo = seoForPath(p);
  if (seo.robots !== 'index, follow' || !seo.canonical) return null;

  const url = seo.canonical;

  // The homepage: a WebPage plus the SearchAction that lets Google offer a
  // sitelinks search box. The target is the tools hub because that is the only
  // place a query can currently land — there is no site-wide search endpoint to
  // point at, and inventing one would advertise a 404.
  if (p === '/' || p === '/home') {
    return {
      '@context': 'https://schema.org',
      '@graph': [webPage(url, seo, { '@id': `${CANONICAL_ORIGIN}/#webpage` })],
    };
  }

  const learn = learnRouteFor(p);
  if (learn) return learnGraph(url, seo, learn, copy);

  const tool = publicToolId(p);
  if (tool) {
    const meta = TOOL_SEO[tool];
    return {
      '@context': 'https://schema.org',
      '@graph': [
        webPage(url, seo, { breadcrumb: { '@id': `${url}#breadcrumb` } }),
        breadcrumb(meta.name, url),
        // The tool page renders these same questions below the calculator
        // (`ToolEducation`), which is what makes the markup legitimate — see
        // the note on `faqPage`.
        faqPage(url, TOOL_FAQ[tool]),
        {
          '@type': 'SoftwareApplication',
          '@id': `${url}#app`,
          name: meta.name,
          url,
          description: meta.description,
          applicationCategory: 'FinanceApplication',
          applicationSubCategory: meta.category,
          operatingSystem: 'Web',
          browserRequirements: 'Requires JavaScript',
          inLanguage: 'en-IN',
          isAccessibleForFree: true,
          isPartOf: { '@id': WEBSITE_ID },
          publisher: { '@id': ORG_ID },
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
        },
      ],
    };
  }

  // Every other indexable URL is a registered public page. `seoForPath` already
  // returned `index, follow` for it, so the lookup cannot miss — but a `null`
  // here would be a silent empty data block rather than a crash, which is worse
  // than being explicit about the invariant.
  const page = publicPageFor(p);
  if (!page) return null;

  const graph: JsonLd[] = [
    webPage(url, seo, {
      breadcrumb: { '@id': `${url}#breadcrumb` },
      // `dateModified` is what lets a search engine — and an AI answer engine
      // citing the page — say how current the answer is. It comes from the same
      // field that renders the visible "last reviewed" stamp, so the machine-
      // readable date and the human-readable one cannot disagree.
      dateModified: page.updated,
    }),
    breadcrumb(page.name, url, ancestorsOf(page)),
  ];

  if (page.faq?.length) graph.push(faqPage(url, page.faq));

  return { '@context': 'https://schema.org', '@graph': graph };
}

/**
 * Serialise JSON-LD for embedding in a `<script>` data block.
 *
 * `<` is escaped to its unicode form so the string can never terminate the
 * enclosing element early. Every value here is a compile-time constant today, so
 * this is defence in depth rather than a live fix — but it is the kind of
 * guarantee that has to be in place BEFORE the first dynamic value is
 * interpolated, not after.
 */
export function serialiseJsonLd(data: JsonLd | null): string {
  if (!data) return '';
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/* ------------------------------------------------------------------------- *
 * DOM application
 * ------------------------------------------------------------------------- */

function setMeta(selector: string, attr: 'content' | 'href', value: string): void {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

/**
 * The id of the per-route JSON-LD data block in `index.html`. The tag always
 * exists in the shell; both the edge Worker and `applySeo` only ever replace its
 * CONTENTS. Nothing injects or removes head nodes, so the served markup and the
 * hydrated markup stay structurally identical.
 */
export const ROUTE_SCHEMA_ID = 'fx-route-schema';

/**
 * Apply the computed metadata to the document. Only ever UPDATES tags that
 * already exist in `index.html` — it never injects new ones, so the served HTML
 * and the hydrated HTML stay structurally identical.
 *
 * On first load this is a no-op reapplication of what the Worker already wrote
 * into the bytes; on a client-side navigation, where no new document is ever
 * served, it is the only thing that updates any of it.
 */
export function applySeo(pathname: string): void {
  if (typeof document === 'undefined') return;
  const seo = seoForPath(pathname);

  // Assigning `document.title` directly would CREATE a `<title>` element when
  // the document has none — jsdom and every browser do this — which breaks the
  // "only ever update tags the shell already ships" invariant this function is
  // built on. Writing through the existing node keeps it honest.
  const titleEl = document.head.querySelector('title');
  if (titleEl) titleEl.textContent = seo.title;

  setMeta('meta[name="robots"]', 'content', seo.robots);
  setMeta('meta[name="description"]', 'content', seo.description);

  // Social cards. og: and twitter: carry identical copy — X falls back to the
  // og: tags anyway, so a third variant would only be a third string to keep
  // true. The homepage is the one page whose card copy differs from its search
  // snippet; see DEFAULT_SOCIAL_DESCRIPTION.
  setMeta('meta[property="og:title"]', 'content', seo.title);
  setMeta('meta[property="og:description"]', 'content', seo.socialDescription);
  setMeta('meta[name="twitter:title"]', 'content', seo.title);
  setMeta('meta[name="twitter:description"]', 'content', seo.socialDescription);

  // The card image. Each public page has its own, so a shared calculator link
  // unfurls as that calculator rather than as an anonymous logo card.
  setMeta('meta[property="og:image"]', 'content', seo.image);
  setMeta('meta[property="og:image:alt"]', 'content', seo.imageAlt);
  setMeta('meta[name="twitter:image"]', 'content', seo.image);
  setMeta('meta[name="twitter:image:alt"]', 'content', seo.imageAlt);

  // A non-indexable page keeps the canonical tag pointing at the site root
  // rather than at itself: `noindex` already removes it from the index, and a
  // self-canonical on a noindex page sends contradictory signals.
  const href = seo.canonical ?? `${CANONICAL_ORIGIN}/`;
  setMeta('link[rel="canonical"]', 'href', href);
  setMeta('meta[property="og:url"]', 'content', href);

  // Per-route JSON-LD. Emptied rather than removed on a noindex route, so the
  // node stays put and the next navigation has somewhere to write.
  const schema = document.getElementById(ROUTE_SCHEMA_ID);
  if (schema) schema.textContent = serialiseJsonLd(structuredDataForPath(pathname));
}

/**
 * Rewrite the JSON-LD block for a knowledge-layer URL once its editorial chunk
 * has loaded, adding the nodes that describe copy which is only now on the page.
 *
 * Called by the topic and article pages, not by the router: they are the only
 * things that hold the chunk, and tying the upgrade to the component that
 * renders the prose is what keeps the markup and the visible content from ever
 * describing different pages. A no-op when the path is not indexable.
 */
export function applyContentSchema(pathname: string, copy: TopicContent | null): void {
  if (typeof document === 'undefined') return;
  const schema = document.getElementById(ROUTE_SCHEMA_ID);
  if (!schema) return;
  schema.textContent = serialiseJsonLd(structuredDataForPath(pathname, copy));
}
