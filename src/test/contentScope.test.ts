import { describe, it, expect } from 'vitest';
import {
  ARTICLES, SCOPE_LABEL, TOPICS, articlePath, scopeForArticle, topicFor, topicPath,
} from '../shared/content';
import {
  INDIA_LANGUAGE, SITE_LANGUAGE, alternatesForPath, languageForPath, ogLocaleForPath,
  seoForPath, structuredDataForPath,
} from '../lib/seo';

/**
 * The site told every crawler that every URL was `en-IN`. That was true of the
 * calculators when they only did India and was never true of the careers
 * library. These tests pin the replacement: a regional claim on the content
 * that earns it, and plain English everywhere else.
 */

const nodesFor = (path: string) => {
  const data = structuredDataForPath(path) as { '@graph'?: Record<string, unknown>[] } | null;
  return data?.['@graph'] ?? [];
};
const nodeOfType = (path: string, type: string) =>
  nodesFor(path).find((n) => String(n['@type']).includes(type));

describe('scope inheritance', () => {
  it('gives an article its own scope when it declares one', () => {
    // Its topic carries Indian examples; this article IS the Indian instrument
    // list, so it is narrower than the topic that holds it.
    const article = ARTICLES.find((a) => a.slug === 'where-to-park-short-term-cash')!;
    expect(article.scope).toBe('in-only');
    expect(scopeForArticle(article)).toBe('in-only');
    expect(topicFor(article.topic)?.scope).toBe('in-examples');
  });

  it('falls back to the topic when the article says nothing', () => {
    for (const article of ARTICLES) {
      if (article.scope) continue;
      expect(scopeForArticle(article)).toBe(topicFor(article.topic)?.scope);
    }
  });

  it('never marks a careers topic in-only — no country owns interview advice', () => {
    // `in-examples` is allowed and used: salary negotiation quotes rupee
    // figures. What must never happen is a careers guide claiming to describe
    // one jurisdiction's rules, because none of them do.
    const careers = TOPICS.filter((t) => t.cluster === 'careers');
    expect(careers.length).toBeGreaterThan(10);
    for (const topic of careers) {
      expect(topic.scope, `${topic.slug} is careers advice, not statute`).not.toBe('in-only');
    }
    // And most of it travels with nothing attached at all.
    expect(careers.filter((t) => !t.scope).length).toBeGreaterThan(careers.length / 2);
  });

  it('marks the guides that describe Indian statute as in-only', () => {
    // These are not "articles with rupees in them" — they are one country's
    // rulebook, and they are wrong everywhere else.
    for (const slug of ['tax', 'epf-nps', 'credit-scores', 'insurance']) {
      expect(topicFor(slug)?.scope, slug).toBe('in-only');
    }
  });

  it('gives every scope a label a reader can act on', () => {
    for (const scope of ['in-only', 'in-examples'] as const) {
      expect(SCOPE_LABEL[scope].short.length).toBeGreaterThan(3);
      expect(SCOPE_LABEL[scope].long.length).toBeGreaterThan(40);
    }
  });
});

describe('the language a route declares', () => {
  it('is plain English for the homepage, the calculators and the careers library', () => {
    for (const path of ['/', '/tools/budget', '/tools/parksmart', '/pricing', '/learn']) {
      expect(languageForPath(path).lang, path).toBe(SITE_LANGUAGE);
      expect(languageForPath(path).indiaScoped, path).toBe(false);
    }
  });

  it('is en-IN on the guides that are about Indian law', () => {
    const article = ARTICLES.find((a) => a.topic === 'tax')!;
    const path = articlePath(article);
    expect(languageForPath(path).lang).toBe(INDIA_LANGUAGE);
    expect(languageForPath(path).indiaScoped).toBe(true);
    expect(languageForPath(topicPath(topicFor('tax')!)).lang).toBe(INDIA_LANGUAGE);
  });

  it('is NOT en-IN merely because the examples are in rupees', () => {
    // The whole point of the two-value scope: portable reasoning stays
    // indexable as plain English rather than being buried as regional content.
    const article = ARTICLES.find((a) => a.slug === 'avalanche-vs-snowball')!;
    expect(scopeForArticle(article)).toBe('in-examples');
    expect(languageForPath(articlePath(article)).lang).toBe(SITE_LANGUAGE);
  });

  it('matches the og:locale it advertises', () => {
    expect(ogLocaleForPath('/')).toBe('en_US');
    const taxArticle = ARTICLES.find((a) => a.topic === 'tax')!;
    expect(ogLocaleForPath(articlePath(taxArticle))).toBe('en_IN');
  });
});

describe('hreflang', () => {
  it('self-references and names an x-default, both on the canonical', () => {
    for (const path of ['/', '/tools/budget', '/learn']) {
      const canonical = seoForPath(path).canonical;
      const alternates = alternatesForPath(path);
      expect(alternates.map((a) => a.hreflang)).toEqual([SITE_LANGUAGE, 'x-default']);
      for (const alternate of alternates) expect(alternate.href, path).toBe(canonical);
    }
  });

  it('annotates nothing on a page that is already noindex', () => {
    // A page removed from the index has no business advertising alternates.
    // `applySeo` still writes the site root into the tags rather than leaving
    // them alone, because it can only rewrite head nodes and never remove them
    // — skipping the write would strand the previous route's URL here.
    expect(seoForPath('/login').robots).toContain('noindex');
    expect(alternatesForPath('/login')).toEqual([]);
  });
});

describe('structured data', () => {
  it('declares contentLocation only where the substance is Indian', () => {
    const taxArticle = ARTICLES.find((a) => a.topic === 'tax')!;
    const indian = nodeOfType(articlePath(taxArticle), 'Article');
    expect(indian?.inLanguage).toBe(INDIA_LANGUAGE);
    expect(indian?.contentLocation).toEqual({ '@type': 'Country', name: 'India' });

    const portable = ARTICLES.find((a) => a.slug === 'avalanche-vs-snowball')!;
    const global = nodeOfType(articlePath(portable), 'Article');
    expect(global?.inLanguage).toBe(SITE_LANGUAGE);
    expect(global?.contentLocation).toBeUndefined();
  });

  it('no longer claims the calculators are for one country', () => {
    const app = nodeOfType('/tools/parksmart', 'SoftwareApplication');
    expect(app?.inLanguage).toBe(SITE_LANGUAGE);
  });

  it('keeps every WebPage node agreeing with languageForPath', () => {
    for (const article of ARTICLES) {
      const path = articlePath(article);
      const page = nodeOfType(path, 'WebPage');
      expect(page?.inLanguage, path).toBe(languageForPath(path).lang);
    }
  });
});
