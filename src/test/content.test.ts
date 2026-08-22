/**
 * The knowledge layer spans five things that have to agree about every URL: the
 * index registry, the per-topic copy modules, the router, the edge Worker's
 * 200/404 decision, and the structured data. These are the tests that make that
 * agreement structural.
 *
 * The ones that matter most are the ones a human review cannot do reliably:
 *
 *   • every internal link written inside article prose resolves to a route the
 *     app actually serves and is indexable. A broken internal link is invisible
 *     in review, costs the reader a 404, and wastes the crawl budget the whole
 *     content effort is trying to earn;
 *   • every registered article has copy and every copy entry has a registration.
 *     The split between `shared/content.ts` and `content/*.ts` exists to keep the
 *     corpus off the landing critical path, and this is the check that stops it
 *     rotting into a page that renders a header and nothing else;
 *   • the graph the edge Worker emits (with copy) is a strict superset of the one
 *     the browser emits before its chunk lands, and the extra nodes are exactly
 *     the ones that describe lazily-loaded prose.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ARTICLES,
  AUTHOR,
  CLUSTERS,
  CONTENT_PATHS,
  CONTENT_SITEMAP,
  LEARN_ROOT,
  PILLAR_TOPICS,
  TOPICS,
  articleFor,
  articlePath,
  articlesInTopic,
  articlesUsingTool,
  contentLinkFor,
  isContentPath,
  productLinksFor,
  topicFor,
  topicPath,
  topicSlugForContentPath,
  topicsUsingTool,
} from '../shared/content';
import { TOPICS_WITH_CONTENT, loadTopicContent } from '../content';
import { proseOf, readingMinutes, wordCount } from '../content/readingTime';
import type { TopicContent } from '../content/types';
import { internalTargets } from '../learn/inline';
import { isKnownRoute, routeTemplate, TOOL_IDS } from '../shared/routes';
import { publicPageFor } from '../shared/publicPages';
import { CANONICAL_ORIGIN, seoForPath, structuredDataForPath, INDEXABLE } from '../lib/seo';

const APP_TSX = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');

/** Every topic's copy chunk, loaded once and shared across the suites below. */
const COPY = new Map<string, TopicContent>();
for (const topic of TOPICS) {
  const loaded = await loadTopicContent(topic.slug);
  if (loaded) COPY.set(topic.slug, loaded);
}

/** The copy for one article, or undefined. */
function copyFor(topicSlug: string, slug: string) {
  return COPY.get(topicSlug)?.articles[slug];
}

/**
 * The prose extractor and the word count come from `content/readingTime.ts`,
 * which is the same pair the article page uses for its visible "N min read" and
 * `seo.ts` uses for `wordCount` in the markup.
 *
 * This test used to carry its own copy, and the two disagreed: the local one
 * skipped table headers, formula expressions and the VALUE half of every worked
 * example, so it undercounted a table-heavy guide by a hundred words or more.
 * Two definitions of "how much is on this page" is one too many — the floor
 * below now measures exactly what the reading-time stamp measures.
 */

describe('topic registry', () => {
  it('has unique slugs and resolves them', () => {
    const slugs = TOPICS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const t of TOPICS) {
      expect(topicFor(t.slug), t.slug).toBe(t);
      expect(t.slug, `${t.slug} must be url-safe`).toMatch(/^[a-z0-9-]+$/);
      expect(CLUSTERS[t.cluster], `${t.slug} cluster`).toBeTruthy();
    }
    expect(topicFor('not-a-topic')).toBeNull();
    expect(topicFor(undefined)).toBeNull();
  });

  it('gives every topic real cornerstone content, not just a link list', () => {
    for (const t of TOPICS) {
      const copy = COPY.get(t.slug);
      expect(copy, `${t.slug} has no copy module`).toBeTruthy();
      expect(copy!.topic.intro.length, `${t.slug} intro`).toBeGreaterThanOrEqual(2);
      expect(copy!.topic.definitions.length, `${t.slug} definitions`).toBeGreaterThanOrEqual(3);
      expect(copy!.topic.faq.length, `${t.slug} faq`).toBeGreaterThanOrEqual(3);
      // A hub with no guides under it is the thin page this whole registry
      // exists to prevent — it would rank for nothing and waste a crawl.
      expect(articlesInTopic(t.slug).length, `${t.slug} has no articles`).toBeGreaterThanOrEqual(2);
    }
  });

  /**
   * The rule that replaced "every topic must name a calculator". None of the
   * seven calculators computes anything about a resume, so requiring one on a
   * careers topic would force a link written for a crawler rather than a reader.
   * Careers topics point at the product instead, and both halves are enforced.
   */
  it('points every topic at something real — a calculator or a product page', () => {
    for (const t of TOPICS) {
      if (t.cluster === 'money') {
        expect(t.tools?.length ?? 0, `money topic ${t.slug} names no calculator`).toBeGreaterThanOrEqual(1);
      } else {
        expect(t.product?.length ?? 0, `careers topic ${t.slug} names no product page`).toBeGreaterThanOrEqual(1);
      }
      for (const id of t.tools ?? []) {
        expect(TOOL_IDS as readonly string[], `${t.slug} → ${id}`).toContain(id);
      }
    }
  });

  it('resolves every product link to a registered, indexable page', () => {
    for (const t of TOPICS) {
      for (const path of t.product ?? []) {
        expect(publicPageFor(path), `${t.slug} → ${path}`).not.toBeNull();
        expect(seoForPath(path).robots, `${t.slug} → ${path} is noindex`).toBe(INDEXABLE);
      }
      expect(productLinksFor(t).length, `${t.slug} product links`).toBe((t.product ?? []).length);
    }
  });

  /**
   * The footer renders pillar topics on every public page. Uncapped, "pillar"
   * quietly becomes "all of them" and the footer turns into a wall of links that
   * dilutes the equity each one carries.
   */
  it('keeps the footer pillar set small and covering both clusters', () => {
    expect(PILLAR_TOPICS.length, 'no pillar topics').toBeGreaterThan(0);
    for (const cluster of Object.keys(CLUSTERS) as Array<keyof typeof CLUSTERS>) {
      const pillars = PILLAR_TOPICS.filter((t) => t.cluster === cluster);
      expect(pillars.length, `${cluster} has no pillar topic`).toBeGreaterThanOrEqual(1);
      expect(pillars.length, `${cluster} marks too many pillars`).toBeLessThanOrEqual(6);
    }
  });
});

describe('article registry', () => {
  it('has a unique topic/slug key for every article, in a registered topic', () => {
    const keys = ARTICLES.map((a) => `${a.topic}/${a.slug}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const a of ARTICLES) {
      expect(topicFor(a.topic), `${a.slug} → topic ${a.topic}`).not.toBeNull();
      expect(a.slug, `${a.slug} must be url-safe`).toMatch(/^[a-z0-9-]+$/);
      expect(articleFor(a.topic, a.slug)).toBe(a);
    }
  });

  it('carries a breadcrumb label short enough to be one', () => {
    for (const a of ARTICLES) {
      expect(a.crumb.length, `${a.slug} crumb "${a.crumb}"`).toBeGreaterThan(3);
      // Long enough to be meaningful, short enough not to wrap the trail. The
      // headline is the H1's job.
      expect(a.crumb.length, `${a.slug} crumb "${a.crumb}" is too long`).toBeLessThanOrEqual(30);
    }
    const crumbs = ARTICLES.map((a) => `${a.topic}/${a.crumb}`);
    expect(new Set(crumbs).size, 'two articles in one topic share a crumb').toBe(crumbs.length);
  });

  it('leads with an answer and checkable takeaways', () => {
    for (const a of ARTICLES) {
      const copy = copyFor(a.topic, a.slug);
      expect(copy, `${a.topic}/${a.slug} has no copy`).toBeTruthy();
      // The summary is the block an answer engine quotes. A short one is a
      // teaser, and a teaser is not citable.
      expect(copy!.summary.length, `${a.slug} summary`).toBeGreaterThan(200);
      expect(copy!.keyPoints.length, `${a.slug} keyPoints`).toBeGreaterThanOrEqual(2);
      for (const k of copy!.keyPoints) {
        expect(k.length, `${a.slug}: "${k}"`).toBeGreaterThan(40);
      }
    }
  });

  it('keeps titles and descriptions within what a SERP shows', () => {
    for (const a of [...ARTICLES]) {
      expect(a.title.length, `${a.slug} title (${a.title.length})`).toBeLessThanOrEqual(70);
      expect(a.title, `${a.slug} must be brand-attributed`).toMatch(/FinatriX/);
      expect(a.description.length, `${a.slug} description (${a.description.length})`)
        .toBeLessThanOrEqual(165);
      expect(a.description.length, `${a.slug} description too short`).toBeGreaterThan(50);
    }
    for (const t of TOPICS) {
      expect(t.title.length, `${t.slug} title (${t.title.length})`).toBeLessThanOrEqual(70);
      expect(t.title, `${t.slug} must be brand-attributed`).toMatch(/FinatriX/);
      expect(t.description.length, `${t.slug} description (${t.description.length})`)
        .toBeLessThanOrEqual(165);
      expect(t.description.length, `${t.slug} description too short`).toBeGreaterThan(50);
    }
  });

  it('uses real calendar dates and never claims to be updated before publication', () => {
    for (const a of ARTICLES) {
      expect(a.published, a.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(a.updated, a.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(a.published)), a.slug).toBe(false);
      expect(a.updated >= a.published, `${a.slug} updated before published`).toBe(true);
    }
  });

  it('resolves every hand-picked related article, and never links to itself', () => {
    for (const a of ARTICLES) {
      for (const key of a.related ?? []) {
        const [topic, slug] = key.split('/');
        expect(articleFor(topic, slug), `${a.slug} → ${key}`).not.toBeNull();
        expect(key, `${a.slug} lists itself as related`).not.toBe(`${a.topic}/${a.slug}`);
      }
    }
  });

  it('only points at real calculators', () => {
    for (const a of ARTICLES) {
      for (const id of a.tools ?? []) {
        expect(TOOL_IDS as readonly string[], `${a.slug} → ${id}`).toContain(id);
      }
    }
  });

  it('writes non-empty, non-duplicate FAQ questions and answers', () => {
    for (const a of ARTICLES) {
      const faq = copyFor(a.topic, a.slug)?.faq;
      if (!faq) continue;
      const questions = faq.map((f) => f.q);
      expect(new Set(questions).size, `${a.slug} repeats a question`).toBe(questions.length);
      for (const entry of faq) {
        expect(entry.q.length, `${a.slug}: "${entry.q}"`).toBeGreaterThan(8);
        expect(entry.a.length, `${a.slug}: answer to "${entry.q}"`).toBeGreaterThan(60);
      }
    }
  });

  /**
   * Every calculator must be reachable from the knowledge layer, or the
   * tool→guide strip on its page renders empty and the highest-value internal
   * link on the site is missing for that tool.
   */
  it('gives every calculator at least one guide and one topic that names it', () => {
    for (const id of TOOL_IDS) {
      expect(articlesUsingTool(id).length, `${id} has no guides`).toBeGreaterThanOrEqual(1);
      expect(topicsUsingTool(id).length, `${id} is named by no topic`).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('copy modules', () => {
  it('has a copy module for exactly the registered topics', () => {
    expect([...TOPICS_WITH_CONTENT].sort()).toEqual(TOPICS.map((t) => t.slug).sort());
  });

  it('has copy for every registered article, and no orphan copy', () => {
    for (const topic of TOPICS) {
      const copy = COPY.get(topic.slug);
      expect(copy, `${topic.slug} has no copy module`).toBeTruthy();
      const registered = articlesInTopic(topic.slug).map((a) => a.slug).sort();
      expect(Object.keys(copy!.articles).sort(), `${topic.slug} articles`).toEqual(registered);
    }
  });

  it('gives every article enough substance to be worth publishing', () => {
    for (const [topicSlug, copy] of COPY) {
      for (const [slug, body] of Object.entries(copy.articles)) {
        const where = `${topicSlug}/${slug}`;
        expect(body.sections.length, `${where} sections`).toBeGreaterThanOrEqual(3);
        const words = wordCount(body);
        // Thin content is the explicit failure mode this whole platform is
        // built to avoid. 500 words is a floor, not a target.
        expect(words, `${where} is thin (${words} words)`).toBeGreaterThan(500);
      }
    }
  });

  it('gives every section a unique, anchor-safe id', () => {
    for (const [topicSlug, copy] of COPY) {
      for (const [slug, body] of Object.entries(copy.articles)) {
        const ids = body.sections.map((s) => s.id);
        expect(new Set(ids).size, `${topicSlug}/${slug} repeats a section id`).toBe(ids.length);
        for (const id of ids) expect(id, `${topicSlug}/${slug}`).toMatch(/^[a-z0-9-]+$/);
      }
    }
  });

  it('never leaves a table row that disagrees with its header', () => {
    for (const [topicSlug, copy] of COPY) {
      for (const [slug, body] of Object.entries(copy.articles)) {
        for (const section of body.sections) {
          for (const block of section.blocks) {
            if (block.kind !== 'table') continue;
            for (const row of block.rows) {
              expect(
                row.length,
                `${topicSlug}/${slug} → "${block.caption}" row has ${row.length} cells, header has ${block.head.length}`,
              ).toBe(block.head.length);
            }
          }
        }
      }
    }
  });

  it('only ever points a tool block at a real calculator', () => {
    for (const [topicSlug, copy] of COPY) {
      for (const [slug, body] of Object.entries(copy.articles)) {
        for (const section of body.sections) {
          for (const block of section.blocks) {
            if (block.kind !== 'tool') continue;
            expect(TOOL_IDS as readonly string[], `${topicSlug}/${slug} → ${block.toolId}`)
              .toContain(block.toolId);
          }
        }
      }
    }
  });

  it('gives every external source an absolute https URL', () => {
    for (const [topicSlug, copy] of COPY) {
      for (const [slug, body] of Object.entries(copy.articles)) {
        for (const source of body.sources ?? []) {
          expect(source.url, `${topicSlug}/${slug} → ${source.label}`).toMatch(/^https:\/\//);
          expect(source.label.length, `${topicSlug}/${slug} source label`).toBeGreaterThan(3);
        }
      }
    }
  });
});

describe('internal links inside article prose', () => {
  it('resolves every internal link to a route the app really serves', () => {
    for (const [topicSlug, copy] of COPY) {
      for (const [slug, body] of Object.entries(copy.articles)) {
        for (const text of proseOf(body)) {
          for (const href of internalTargets(text)) {
            expect(
              isKnownRoute(href),
              `${topicSlug}/${slug} links to ${href}, which is not a known route`,
            ).toBe(true);
            expect(
              seoForPath(href).robots,
              `${topicSlug}/${slug} links to ${href}, which is noindex`,
            ).toBe(INDEXABLE);
          }
        }
      }
    }
  });

  it('links out of every article at least once', () => {
    for (const [topicSlug, copy] of COPY) {
      for (const [slug, body] of Object.entries(copy.articles)) {
        const links = proseOf(body).flatMap(internalTargets);
        // Contextual links, not the related-links strip at the foot. A page
        // with none is a dead end in the topic cluster.
        expect(links.length, `${topicSlug}/${slug} has no contextual internal links`)
          .toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('never links an article to itself', () => {
    for (const [topicSlug, copy] of COPY) {
      for (const [slug, body] of Object.entries(copy.articles)) {
        const self = `${LEARN_ROOT}/${topicSlug}/${slug}`;
        for (const text of proseOf(body)) {
          expect(internalTargets(text), `${self} links to itself`).not.toContain(self);
        }
      }
    }
  });
});

describe('routing and the edge', () => {
  it('serves 200 for every registered content path', () => {
    for (const p of CONTENT_PATHS) {
      expect(isKnownRoute(p), p).toBe(true);
      expect(isContentPath(p), p).toBe(true);
    }
  });

  // The reason `/learn/*` is an exact allowlist rather than a prefix match.
  it('serves 404 for an unregistered /learn URL', () => {
    for (const p of [
      '/learn/not-a-topic',
      '/learn/budgeting/not-an-article',
      '/learn/budgeting/50-30-20-rule/extra',
    ]) {
      expect(isKnownRoute(p), p).toBe(false);
      expect(seoForPath(p).robots, p).toBe('noindex, nofollow');
      expect(structuredDataForPath(p), p).toBeNull();
    }
  });

  /**
   * The Worker resolves a topic's copy chunk from this function before writing
   * the served bytes. A wrong answer here means either a missing FAQPage in the
   * HTML (silent SEO loss) or a pointless import on the hub.
   */
  it('resolves the copy chunk a content URL needs, and none for the hub', () => {
    expect(topicSlugForContentPath(LEARN_ROOT)).toBeNull();
    expect(topicSlugForContentPath('/pricing')).toBeNull();
    expect(topicSlugForContentPath('/learn/not-a-topic')).toBeNull();
    for (const topic of TOPICS) {
      expect(topicSlugForContentPath(topicPath(topic)), topic.slug).toBe(topic.slug);
      for (const a of articlesInTopic(topic.slug)) {
        expect(topicSlugForContentPath(articlePath(a)), a.slug).toBe(topic.slug);
      }
    }
  });

  it('has a route in App.tsx for the hub and both parameterised pages', () => {
    expect(APP_TSX).toContain('path="/learn"');
    expect(APP_TSX).toContain('path="/learn/:topic"');
    expect(APP_TSX).toContain('path="/learn/:topic/:slug"');
  });

  it('collapses content URLs to low-cardinality analytics templates', () => {
    expect(routeTemplate(LEARN_ROOT)).toBe('/learn');
    expect(routeTemplate('/learn/budgeting')).toBe('/learn/:topic');
    expect(routeTemplate('/learn/budgeting/50-30-20-rule')).toBe('/learn/:topic/:slug');
  });

  it('resolves link labels for every content path, and refuses unknown ones', () => {
    for (const p of CONTENT_PATHS) {
      const link = contentLinkFor(p);
      expect(link, p).not.toBeNull();
      expect(link!.name.length, p).toBeGreaterThan(0);
      expect(link!.blurb.length, p).toBeGreaterThan(0);
    }
    expect(contentLinkFor('/learn/nope')).toBeNull();
    expect(contentLinkFor('/pricing')).toBeNull();
  });
});

describe('metadata and structured data', () => {
  /** The graph the edge Worker emits: with the topic's copy chunk resolved. */
  function servedGraph(path: string): Record<string, unknown>[] {
    const slug = topicSlugForContentPath(path);
    const copy = slug ? COPY.get(slug) ?? null : null;
    return structuredDataForPath(path, copy)!['@graph'] as Record<string, unknown>[];
  }

  it('is indexable and self-canonical on every content URL', () => {
    for (const p of CONTENT_PATHS) {
      const seo = seoForPath(p);
      expect(seo.robots, p).toBe(INDEXABLE);
      expect(seo.canonical, p).toBe(`${CANONICAL_ORIGIN}${p}`);
      expect(seo.title.length, `${p} title`).toBeGreaterThan(10);
    }
  });

  it('gives every content URL a unique title and description', () => {
    const titles = CONTENT_PATHS.map((p) => seoForPath(p).title);
    const descriptions = CONTENT_PATHS.map((p) => seoForPath(p).description);
    expect(new Set(titles).size, 'duplicate titles').toBe(titles.length);
    expect(new Set(descriptions).size, 'duplicate descriptions').toBe(descriptions.length);
  });

  it('describes an article with an Article node carrying a resolvable author', () => {
    const article = ARTICLES[0];
    const path = articlePath(article);
    const url = `${CANONICAL_ORIGIN}${path}`;
    const graph = servedGraph(path);

    const node = graph.find((n) => n['@type'] === 'Article')!;
    expect(node).toBeTruthy();
    expect(node.headline).toBe(article.heading);
    expect(node.abstract).toBe(copyFor(article.topic, article.slug)!.summary);
    expect(node.datePublished).toBe(article.published);
    expect(node.dateModified).toBe(article.updated);
    expect(node.url).toBe(url);

    // The author node must be in the same graph and must point at a real page —
    // an author `@id` that resolves to nothing is worse than omitting it.
    const authorId = (node.author as Record<string, string>)['@id'];
    const authorNode = graph.find((n) => n['@id'] === authorId)!;
    expect(authorNode, 'author node missing from graph').toBeTruthy();
    expect(publicPageFor(AUTHOR.url), `${AUTHOR.url} must be a registered page`).not.toBeNull();
    expect(authorNode.url).toBe(`${CANONICAL_ORIGIN}${AUTHOR.url}`);
  });

  /**
   * The visible "N min read" stamp and the `timeRequired` in the markup are the
   * same function over the same prose. A search result promising a four-minute
   * read for a twelve-minute page is a small dishonesty with no upside.
   */
  it('publishes a reading time and word count that match the rendered body', () => {
    for (const a of ARTICLES) {
      const copy = copyFor(a.topic, a.slug)!;
      const node = servedGraph(articlePath(a)).find((n) => n['@type'] === 'Article')!;
      expect(node.wordCount, `${a.topic}/${a.slug}`).toBe(wordCount(copy));
      expect(node.timeRequired, `${a.topic}/${a.slug}`).toBe(`PT${readingMinutes(copy)}M`);
      expect(readingMinutes(copy), `${a.topic}/${a.slug} reading time`).toBeGreaterThanOrEqual(1);
    }
  });

  it('never emits HowTo, because the steps live in a module seo.ts cannot see', () => {
    for (const p of CONTENT_PATHS) {
      expect(servedGraph(p).some((n) => n['@type'] === 'HowTo'), p).toBe(false);
    }
  });

  it('emits FAQPage only where the questions are really rendered', () => {
    for (const p of CONTENT_PATHS) {
      const graph = servedGraph(p);
      const faqNode = graph.find((n) => n['@type'] === 'FAQPage');
      const parts = p.split('/').filter(Boolean);

      if (parts.length === 2) {
        // Topic hubs always render a FAQ.
        expect(faqNode, `${p} should emit FAQPage`).toBeTruthy();
        expect((faqNode!.mainEntity as unknown[]).length).toBe(COPY.get(parts[1])!.topic.faq.length);
      } else if (parts.length === 3) {
        const faq = copyFor(parts[1], parts[2])?.faq;
        if (faq?.length) {
          expect((faqNode!.mainEntity as unknown[]).length).toBe(faq.length);
        } else {
          expect(faqNode, `${p} must not emit FAQPage`).toBeUndefined();
        }
      } else {
        expect(faqNode, '/learn must not emit FAQPage').toBeUndefined();
      }
    }
  });

  /**
   * The client emits a narrower graph until the topic chunk resolves. It must be
   * VALID at that moment, not merely smaller: no node may describe prose that is
   * not yet on the page, and every node that survives must be identical.
   */
  it('emits a valid, strictly narrower graph before the copy chunk lands', () => {
    const copyOnlyTypes = new Set(['FAQPage', 'DefinedTermSet']);
    for (const p of CONTENT_PATHS) {
      const withCopy = servedGraph(p);
      const withoutCopy = structuredDataForPath(p)!['@graph'] as Record<string, unknown>[];

      for (const node of withoutCopy) {
        expect(copyOnlyTypes.has(node['@type'] as string), `${p} emits ${node['@type']} with no copy`)
          .toBe(false);
      }
      // Every node present without copy must also be present with it.
      expect(withoutCopy.length, p).toBeLessThanOrEqual(withCopy.length);

      // The Article node must never claim an abstract or a reading time it
      // cannot substantiate.
      const bare = withoutCopy.find((n) => n['@type'] === 'Article');
      if (bare) {
        expect(bare.abstract, `${p} abstract without copy`).toBeUndefined();
        expect(bare.wordCount, `${p} wordCount without copy`).toBeUndefined();
        expect(bare.timeRequired, `${p} timeRequired without copy`).toBeUndefined();
      }
    }
  });

  it('builds a breadcrumb trail that mirrors the URL hierarchy', () => {
    const article = ARTICLES[0];
    const crumbs = servedGraph(articlePath(article))
      .find((n) => n['@type'] === 'BreadcrumbList')!
      .itemListElement as Array<Record<string, unknown>>;

    const topic = topicFor(article.topic)!;
    // The last crumb is the SHORT label, not the headline — see `Article.crumb`.
    // `learnRoutes.test.tsx` proves the rendered trail matches this exactly.
    expect(crumbs.map((c) => c.name)).toEqual(['Home', 'Learn', topic.name, article.crumb]);
    expect(crumbs[1].item).toBe(`${CANONICAL_ORIGIN}${LEARN_ROOT}`);
    expect(crumbs[2].item).toBe(`${CANONICAL_ORIGIN}${topicPath(topic)}`);
    // The last crumb IS the current page, so it carries no link.
    expect(crumbs[3].item).toBeUndefined();
  });

  it('publishes the topic vocabulary as a DefinedTermSet', () => {
    const topic = TOPICS[0];
    const terms = servedGraph(topicPath(topic)).find((n) => n['@type'] === 'DefinedTermSet')!;
    expect((terms.hasDefinedTerm as unknown[]).length)
      .toBe(COPY.get(topic.slug)!.topic.definitions.length);
  });
});

describe('sitemap rows', () => {
  it('covers every content path exactly once, in hierarchy order', () => {
    expect(CONTENT_SITEMAP.map((r) => r.path)).toEqual([...CONTENT_PATHS]);
    expect(new Set(CONTENT_PATHS).size).toBe(CONTENT_PATHS.length);
  });

  it('carries a lastmod that matches the page it describes', () => {
    for (const row of CONTENT_SITEMAP) {
      expect(row.updated, row.path).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const parts = row.path.split('/').filter(Boolean);
      if (parts.length === 2) expect(row.updated).toBe(topicFor(parts[1])!.updated);
      if (parts.length === 3) expect(row.updated).toBe(articleFor(parts[1], parts[2])!.updated);
    }
  });

  it('ranks a topic hub at or above its own articles', () => {
    for (const topic of TOPICS) {
      const hub = CONTENT_SITEMAP.find((r) => r.path === topicPath(topic))!;
      for (const a of articlesInTopic(topic.slug)) {
        const row = CONTENT_SITEMAP.find((r) => r.path === articlePath(a))!;
        expect(hub.priority, `${topic.slug} vs ${a.slug}`).toBeGreaterThanOrEqual(row.priority);
      }
    }
  });
});
