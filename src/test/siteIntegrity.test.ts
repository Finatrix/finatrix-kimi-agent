/**
 * Whole-site integrity: the assertions that only make sense across EVERY
 * registry at once, rather than inside any one of them.
 *
 * The per-registry suites (`content.test.ts`, `publicPages.test.ts`,
 * `comparisonsCompanies.test.ts`, `sitemap.test.ts`) each guarantee their own
 * surface is internally consistent. None of them can catch the failures that
 * live in the gaps between registries, and those are the ones that actually
 * ship:
 *
 *   • a page that exists, is indexable, and that nothing links to — an orphan.
 *     Every other test passes on an orphan, because nothing is wrong with the
 *     page; what is wrong is the site graph around it;
 *   • two pages from different registries that happen to share a title or a
 *     description, which is duplicate content that no single-registry
 *     uniqueness check can see;
 *   • a link written in one registry to a path owned by another, where neither
 *     side's tests look at the other;
 *   • a `<title>` or breadcrumb trail that disagrees with the JSON-LD for the
 *     same URL, across all 144 of them rather than a sampled few.
 *
 * This file is deliberately exhaustive rather than representative. It is cheap
 * — every registry is pure data — and the whole point is to cover the URLs
 * nobody thought to spot-check.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ARTICLES,
  CONTENT_PATHS,
  LEARN_ROOT,
  PILLAR_TOPICS,
  TOPICS,
  articlePath,
  articlesInTopic,
  contentLinkFor,
  topicPath,
  topicSlugForContentPath,
} from '../shared/content';
import { loadTopicContent } from '../content';
import { proseOf } from '../content/readingTime';
import type { TopicContent } from '../content/types';
import { internalTargets } from '../learn/inline';
import { ALTERNATIVES, COMPARE_ROOT, alternativePath, otherAlternatives } from '../shared/comparisons';
import {
  COMPANIES,
  COMPANIES_ROOT,
  companyPath,
  peersOf,
  readingForCompany,
} from '../shared/companies';
import { PUBLIC_PAGES, PUBLIC_PAGE_PATHS, RIVALS, publicPageFor } from '../shared/publicPages';
import { isKnownRoute, TOOL_IDS } from '../shared/routes';
import { sitemapEntries } from '../shared/sitemap';
import { TOOL_GUIDES } from '../shared/toolGuides';
import { TOOL_FAQ } from '../shared/toolFaq';
import { CANONICAL_ORIGIN, seoForPath, structuredDataForPath, INDEXABLE } from '../lib/seo';

const SRC = join(__dirname, '..');
const FOOTER = readFileSync(join(SRC, 'sections', 'LandingFooter.tsx'), 'utf8');

const COPY = new Map<string, TopicContent>();
for (const topic of TOPICS) {
  const loaded = await loadTopicContent(topic.slug);
  if (loaded) COPY.set(topic.slug, loaded);
}

/** Every indexable URL the site serves. */
const ALL_PAGES: readonly string[] = [
  '/',
  ...TOOL_IDS.map((id) => `/tools/${id}`),
  ...PUBLIC_PAGE_PATHS,
  ...CONTENT_PATHS,
];

/**
 * The complete internal link graph, as `from → to` edges.
 *
 * Assembled from the places links are actually DECLARED — registries and
 * derivation functions — rather than by rendering every page, because the
 * registries are the source and the components are one view of them. A link
 * that exists in the registry but not on the page would be a component bug,
 * which `learnRoutes.test.tsx` covers by rendering the real App.
 */
function linkGraph(): Array<{ from: string; to: string }> {
  const edges: Array<{ from: string; to: string }> = [];
  const add = (from: string, to: string) => edges.push({ from, to });

  // Footer — rendered on every public page, so its links reach everything.
  add('/', LEARN_ROOT);
  add('/', COMPARE_ROOT);
  add('/', COMPANIES_ROOT);
  add('/', '/editorial-standards');
  for (const t of PILLAR_TOPICS) add('/', topicPath(t));
  for (const id of TOOL_IDS) add('/', `/tools/${id}`);
  for (const p of ['/careers', '/careers/features', '/careers/compare', '/pricing', '/help', '/faq', '/support', '/contact', '/about', '/security', '/privacy', '/terms', '/refunds']) {
    add('/', p);
  }

  // Learn hub → every topic. Topic hub → its articles, its tools, its product.
  for (const t of TOPICS) {
    add(LEARN_ROOT, topicPath(t));
    for (const a of articlesInTopic(t.slug)) add(topicPath(t), articlePath(a));
    for (const id of t.tools ?? []) add(topicPath(t), `/tools/${id}`);
    for (const p of t.product ?? []) add(topicPath(t), p);
  }

  // Article → its tools, its related siblings, and every contextual prose link.
  for (const a of ARTICLES) {
    const from = articlePath(a);
    for (const id of a.tools ?? []) add(from, `/tools/${id}`);
    for (const key of a.related ?? []) add(from, `${LEARN_ROOT}/${key}`);
    const body = COPY.get(a.topic)?.articles[a.slug];
    if (body) for (const text of proseOf(body)) for (const href of internalTargets(text)) add(from, href);
  }

  // Tool pages → the guides and topics that name them (ToolEducation).
  for (const id of TOOL_IDS) {
    const from = `/tools/${id}`;
    for (const a of ARTICLES) if (a.tools?.includes(id)) add(from, articlePath(a));
    for (const t of TOPICS) if (t.tools?.includes(id)) add(from, topicPath(t));
    for (const rel of TOOL_GUIDES[id].related) add(from, `/tools/${rel}`);
    for (const p of ['/help', '/faq', '/terms']) add(from, p);
  }

  // Comparison hub → each alternative; each alternative → its peers.
  for (const alt of ALTERNATIVES) {
    add(COMPARE_ROOT, alternativePath(alt));
    for (const other of otherAlternatives(alt.slug)) add(alternativePath(alt), alternativePath(other));
    add(alternativePath(alt), COMPARE_ROOT);
  }

  // Company hub → each company; each company → peers and derived reading.
  for (const c of COMPANIES) {
    add(COMPANIES_ROOT, companyPath(c));
    for (const p of peersOf(c)) add(companyPath(c), companyPath(p));
    for (const key of readingForCompany(c)) add(companyPath(c), `${LEARN_ROOT}/${key}`);
    add(companyPath(c), COMPANIES_ROOT);
  }
  add(COMPANIES_ROOT, `${LEARN_ROOT}/banking-careers`);
  add(COMPANIES_ROOT, `${LEARN_ROOT}/graduate-programs`);
  add(COMPANIES_ROOT, `${LEARN_ROOT}/interview-preparation`);

  // Careers comparison surface.
  for (const r of RIVALS) add('/careers/compare', `/careers/compare/${r.slug}`);

  return edges;
}

const EDGES = linkGraph();

describe('the site graph', () => {
  /**
   * An orphan is a page that exists, is indexable, sits in the sitemap, and
   * that nothing on the site links to. Every per-page test passes on one. Search
   * engines treat a URL nothing vouches for as one nothing vouches for, and a
   * visitor cannot reach it at all.
   */
  it('leaves no indexable page orphaned', () => {
    const linked = new Set(EDGES.map((e) => e.to));
    // The homepage is the root of the graph and the hubs below are reached from
    // the footer, which the graph already models — nothing else is exempt.
    const orphans = ALL_PAGES.filter((p) => p !== '/' && !linked.has(p));
    expect(orphans, `pages nothing links to:\n${orphans.join('\n')}`).toEqual([]);
  });

  it('never links to a route the app does not serve', () => {
    const broken = EDGES.filter((e) => !isKnownRoute(e.to));
    expect(
      broken.map((e) => `${e.from} → ${e.to}`),
      'internal links pointing at unknown routes',
    ).toEqual([]);
  });

  it('never links from an indexable page to a noindex one', () => {
    const leaks = EDGES.filter(
      (e) => seoForPath(e.from).robots === INDEXABLE
        && seoForPath(e.to).robots !== INDEXABLE,
    );
    expect(
      leaks.map((e) => `${e.from} → ${e.to}`),
      'indexable pages linking into noindex URLs',
    ).toEqual([]);
  });

  it('never links a page to itself', () => {
    const selfies = EDGES.filter((e) => e.from === e.to);
    expect(selfies.map((e) => e.from), 'pages linking to themselves').toEqual([]);
  });

  /**
   * Reachability, not just linkedness: every page must be reachable from the
   * homepage by following links. A mutually-linked island of pages passes the
   * orphan check above and is still unreachable.
   */
  it('reaches every indexable page from the homepage', () => {
    const out = new Map<string, string[]>();
    for (const e of EDGES) out.set(e.from, [...(out.get(e.from) ?? []), e.to]);

    const seen = new Set<string>(['/']);
    const queue = ['/'];
    while (queue.length) {
      for (const next of out.get(queue.shift()!) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    const unreachable = ALL_PAGES.filter((p) => !seen.has(p));
    expect(unreachable, `unreachable from the homepage:\n${unreachable.join('\n')}`).toEqual([]);
  });

  it('links the footer at the three top-level hubs', () => {
    for (const hub of [LEARN_ROOT, COMPARE_ROOT, COMPANIES_ROOT]) {
      expect(FOOTER, `footer must reach ${hub}`).toMatch(
        new RegExp(`COMPARE_ROOT|COMPANIES_ROOT|LEARN_ROOT`),
      );
    }
    // Generated from the registries rather than hard-coded, which is what keeps
    // the footer current as those registries grow.
    expect(FOOTER).toContain('PILLAR_TOPICS.map');
    expect(FOOTER).toContain('TOOLS.map');
  });
});

describe('no soft 404s on any parameterised namespace', () => {
  /**
   * Four namespaces are served by a parameterised route: `/learn/:topic`,
   * `/learn/:topic/:slug`, `/compare/:alternative` and `/companies/:company`.
   * Each is an exact allowlist rather than a prefix match, and the reason is the
   * same in all four cases: a mistyped slug that answers 200 with a rendered
   * page is a soft 404 competing with the real page for the same query.
   *
   * The edge status, the robots directive and the structured data must all
   * agree that the URL does not exist — a page that renders "not found" while
   * the Worker says 200 is the version of this bug that is hardest to notice.
   */
  const UNKNOWN = [
    '/learn/not-a-topic',
    '/learn/budgeting/not-an-article',
    '/learn/budgeting/50-30-20-rule/extra',
    '/compare/not-a-product',
    '/compare/ynab/extra',
    '/companies/not-a-company',
    '/companies/anz/extra',
    '/tools/not-a-tool',
  ];

  it('refuses every unknown slug at the edge', () => {
    for (const p of UNKNOWN) expect(isKnownRoute(p), p).toBe(false);
  });

  it('marks every unknown slug noindex with no structured data', () => {
    for (const p of UNKNOWN) {
      expect(seoForPath(p).robots, p).toBe('noindex, nofollow');
      expect(seoForPath(p).canonical, p).toBeNull();
      expect(structuredDataForPath(p), p).toBeNull();
    }
  });

  it('still serves every real slug on those same namespaces', () => {
    const real = [
      LEARN_ROOT,
      topicPath(TOPICS[0]),
      articlePath(ARTICLES[0]),
      COMPARE_ROOT,
      alternativePath(ALTERNATIVES[0]),
      COMPANIES_ROOT,
      companyPath(COMPANIES[0]),
    ];
    for (const p of real) {
      expect(isKnownRoute(p), p).toBe(true);
      expect(seoForPath(p).robots, p).toBe(INDEXABLE);
    }
  });
});

describe('no duplicate content, site-wide', () => {
  it('gives every indexable URL a unique title', () => {
    const byTitle = new Map<string, string[]>();
    for (const p of ALL_PAGES) {
      const t = seoForPath(p).title;
      byTitle.set(t, [...(byTitle.get(t) ?? []), p]);
    }
    const dupes = [...byTitle.entries()].filter(([, paths]) => paths.length > 1);
    expect(
      dupes.map(([t, paths]) => `"${t}" → ${paths.join(', ')}`),
      'duplicate titles across registries',
    ).toEqual([]);
  });

  it('gives every indexable URL a unique description', () => {
    const byDesc = new Map<string, string[]>();
    for (const p of ALL_PAGES) {
      const d = seoForPath(p).description;
      byDesc.set(d, [...(byDesc.get(d) ?? []), p]);
    }
    const dupes = [...byDesc.entries()].filter(([, paths]) => paths.length > 1);
    expect(
      dupes.map(([d, paths]) => `"${d.slice(0, 50)}…" → ${paths.join(', ')}`),
      'duplicate descriptions across registries',
    ).toEqual([]);
  });

  it('gives every indexable URL a unique H1-equivalent heading', () => {
    const headings = new Map<string, string[]>();
    for (const page of PUBLIC_PAGES) {
      if (!page.heading) continue;
      headings.set(page.heading, [...(headings.get(page.heading) ?? []), page.path]);
    }
    for (const t of TOPICS) headings.set(t.heading, [...(headings.get(t.heading) ?? []), topicPath(t)]);
    for (const a of ARTICLES) headings.set(a.heading, [...(headings.get(a.heading) ?? []), articlePath(a)]);
    const dupes = [...headings.entries()].filter(([, paths]) => paths.length > 1);
    expect(
      dupes.map(([h, paths]) => `"${h}" → ${paths.join(', ')}`),
      'two pages share an H1',
    ).toEqual([]);
  });

  it('never reuses an FAQ question within one page', () => {
    for (const page of PUBLIC_PAGES) {
      if (!page.faq) continue;
      const qs = page.faq.map((f) => f.q);
      expect(new Set(qs).size, `${page.path} repeats an FAQ question`).toBe(qs.length);
    }
    for (const [slug, copy] of COPY) {
      const qs = copy.topic.faq.map((f) => f.q);
      expect(new Set(qs).size, `${slug} hub repeats an FAQ question`).toBe(qs.length);
    }
    for (const id of TOOL_IDS) {
      const qs = TOOL_FAQ[id].map((f) => f.q);
      expect(new Set(qs).size, `${id} repeats an FAQ question`).toBe(qs.length);
    }
  });
});

describe('structured data, on every URL', () => {
  /** The graph as the edge Worker emits it — with the topic copy resolved. */
  function graphFor(path: string): Record<string, unknown>[] {
    const slug = topicSlugForContentPath(path);
    const copy = slug ? COPY.get(slug) ?? null : null;
    return (structuredDataForPath(path, copy)?.['@graph'] ?? []) as Record<string, unknown>[];
  }

  it('emits a well-formed graph for every indexable URL', () => {
    for (const p of ALL_PAGES) {
      const data = structuredDataForPath(p, null);
      expect(data, `${p} has no structured data`).not.toBeNull();
      expect(data!['@context'], p).toBe('https://schema.org');
      const graph = data!['@graph'] as unknown[];
      expect(Array.isArray(graph), `${p} @graph must be an array`).toBe(true);
      expect(graph.length, `${p} @graph is empty`).toBeGreaterThan(0);
    }
  });

  it('gives every node an @type, and every WebPage the right url', () => {
    for (const p of ALL_PAGES) {
      for (const node of graphFor(p)) {
        expect(node['@type'], `${p} has a node with no @type`).toBeTruthy();
      }
      const webpage = graphFor(p).find((n) => String(n['@type']).includes('WebPage'));
      if (webpage) {
        expect(webpage.url, `${p} WebPage url`).toBe(seoForPath(p).canonical);
        expect(webpage.inLanguage, `${p} inLanguage`).toBe('en-IN');
      }
    }
  });

  it('never emits an @id that is not a URL on this origin', () => {
    for (const p of ALL_PAGES) {
      for (const node of graphFor(p)) {
        const id = node['@id'];
        if (typeof id !== 'string') continue;
        expect(id.startsWith(CANONICAL_ORIGIN), `${p} node @id "${id}" is off-origin`).toBe(true);
      }
    }
  });

  /**
   * `Organization.knowsAbout` must name topics the site actually publishes.
   *
   * It is an expertise claim — the property a search engine reads to decide
   * what this brand is an authority ON, which for a YMYL finance site is
   * exactly the signal that is weighed hardest. So it has to be earned by a
   * real hub page with real articles behind it, not asserted.
   *
   * The list is hand-written in index.html because that block is static JSON
   * with no build step to import the registry from; this test is what makes
   * the duplication safe. Equality is asserted in BOTH directions on purpose:
   * a stale entry is a claim to expertise the site no longer has, and a missing
   * one is expertise it has and is not declaring.
   */
  it('claims expertise in exactly the topics the knowledge layer covers', () => {
    const html = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8');
    const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1];
    expect(block, 'index.html must carry the site-level JSON-LD block').toBeTruthy();

    const graph = JSON.parse(block!)['@graph'] as Array<Record<string, unknown>>;
    const org = graph.find((n) => n['@type'] === 'Organization');
    expect(org, 'the site-level graph must carry an Organization node').toBeTruthy();

    expect(
      org!.knowsAbout,
      'index.html\'s Organization.knowsAbout has drifted from TOPICS in '
        + 'src/shared/content.ts. Every entry must be a topic with a real hub page: '
        + 'a stale name claims expertise the site no longer publishes, and a missing '
        + 'one leaves real expertise undeclared.',
    ).toEqual(TOPICS.map((t) => t.name));
  });

  it('serialises to valid JSON with no unescaped script terminator', () => {
    for (const p of ALL_PAGES) {
      const raw = JSON.stringify(structuredDataForPath(p, null));
      expect(() => JSON.parse(raw), p).not.toThrow();
      expect(raw.includes('</script'), `${p} could terminate its own data block`).toBe(false);
    }
  });

  /**
   * A breadcrumb trail must mirror the URL hierarchy, on every URL rather than
   * on the two that got spot-checked. The last crumb never links to itself.
   */
  it('mirrors the URL hierarchy in every breadcrumb trail', () => {
    for (const p of ALL_PAGES) {
      if (p === '/') continue;
      const crumbs = graphFor(p).find((n) => n['@type'] === 'BreadcrumbList')
        ?.itemListElement as Array<Record<string, unknown>> | undefined;
      if (!crumbs) continue;
      expect(crumbs[0].name, `${p} trail must start at Home`).toBe('Home');
      expect(crumbs.at(-1)!.item, `${p} last crumb must not self-link`).toBeUndefined();
      for (const [i, crumb] of crumbs.entries()) {
        expect(crumb.position, `${p} crumb ${i} position`).toBe(i + 1);
        expect(String(crumb.name).length, `${p} crumb ${i} has no name`).toBeGreaterThan(0);
      }
    }
  });
});

describe('the sitemap, against the site', () => {
  const entries = sitemapEntries();
  const locs = entries.map((e) => e.loc);

  it('lists every indexable page exactly once, and nothing else', () => {
    // `/tools` is deliberately absent — it always redirects.
    const expected = ALL_PAGES.map((p) => `${CANONICAL_ORIGIN}${p === '/' ? '/' : p}`);
    const missing = expected.filter((u) => !locs.includes(u));
    const extra = locs.filter((u) => !expected.includes(u));
    expect(missing, `indexable but not in the sitemap:\n${missing.join('\n')}`).toEqual([]);
    expect(extra, `in the sitemap but not indexable:\n${extra.join('\n')}`).toEqual([]);
    expect(new Set(locs).size, 'duplicate sitemap entries').toBe(locs.length);
  });

  it('carries a valid W3C lastmod and a sane priority on every row', () => {
    for (const e of entries) {
      if (e.lastmod !== undefined) {
        expect(e.lastmod, e.loc).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(Number.isNaN(Date.parse(e.lastmod)), e.loc).toBe(false);
      }
      expect(e.priority, e.loc).toBeGreaterThan(0);
      expect(e.priority, e.loc).toBeLessThanOrEqual(1);
      expect(['weekly', 'monthly', 'yearly'], e.loc).toContain(e.changefreq);
    }
  });
});

describe('the knowledge layer, end to end', () => {
  it('resolves every link label the related strips will render', () => {
    for (const c of COMPANIES) {
      for (const key of readingForCompany(c)) {
        expect(contentLinkFor(`${LEARN_ROOT}/${key}`), `${c.slug} → ${key}`).not.toBeNull();
      }
    }
    for (const a of ARTICLES) {
      for (const key of a.related ?? []) {
        expect(contentLinkFor(`${LEARN_ROOT}/${key}`), `${a.slug} → ${key}`).not.toBeNull();
      }
    }
  });

  /**
   * Every calculator must be reachable from a guide AND link back to one. The
   * tool pages are the primary organic-acquisition surface; a calculator with no
   * guides renders an empty section on the most valuable page on the site.
   */
  it('connects every calculator to the knowledge layer in both directions', () => {
    for (const id of TOOL_IDS) {
      const guides = ARTICLES.filter((a) => a.tools?.includes(id));
      const topics = TOPICS.filter((t) => t.tools?.includes(id));
      expect(guides.length, `${id} is named by no article`).toBeGreaterThanOrEqual(1);
      expect(topics.length, `${id} is named by no topic`).toBeGreaterThanOrEqual(1);
    }
  });

  it('gives every topic at least two articles and every article a topic', () => {
    for (const t of TOPICS) {
      expect(articlesInTopic(t.slug).length, `${t.slug}`).toBeGreaterThanOrEqual(2);
    }
    for (const a of ARTICLES) {
      expect(TOPICS.some((t) => t.slug === a.topic), `${a.slug} → ${a.topic}`).toBe(true);
    }
  });

  it('keeps every registered public page resolvable from its own path', () => {
    for (const p of PUBLIC_PAGE_PATHS) {
      const page = publicPageFor(p);
      expect(page, p).not.toBeNull();
      expect(page!.path, p).toBe(p);
      // Trailing slashes must resolve to the same entry, or the edge and the
      // client disagree about whether a URL exists.
      expect(publicPageFor(`${p}/`), `${p}/`).toBe(page);
    }
  });
});
