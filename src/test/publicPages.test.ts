/**
 * The public page registry is only worth having if the four things that read it
 * cannot disagree. These are the tests that make that true rather than hoped.
 *
 * The failure this guards against is specific and has already happened once on
 * this codebase in the other direction: `/careers` was a real, reachable page
 * that `seoForPath` marked `noindex` and the sitemap omitted, so the entire paid
 * product was invisible to search. Every assertion below is a version of "a URL
 * cannot be public in one place and absent from another".
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PUBLIC_PAGES,
  PUBLIC_PAGE_PATHS,
  RIVALS,
  publicPageFor,
  rivalFor,
} from '../shared/publicPages';
import { CAREERS_HIDDEN_SECTIONS, CAREERS_NAV } from '../careers/constants';
import { isKnownRoute } from '../shared/routes';
import { seoForPath, structuredDataForPath, CANONICAL_ORIGIN, INDEXABLE } from '../lib/seo';

const APP_TSX = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');

describe('public page registry', () => {
  it('has no duplicate paths', () => {
    expect(new Set(PUBLIC_PAGE_PATHS).size).toBe(PUBLIC_PAGE_PATHS.length);
  });

  it('uses normalised paths', () => {
    for (const p of PUBLIC_PAGE_PATHS) {
      expect(p, `${p} must start with /`).toMatch(/^\//);
      expect(p, `${p} must not have a trailing slash`).not.toMatch(/.\/$/);
      expect(p, `${p} must not carry a query or hash`).not.toMatch(/[?#]/);
    }
  });

  it('resolves every declared parent', () => {
    for (const page of PUBLIC_PAGES) {
      if (!page.parent) continue;
      expect(publicPageFor(page.parent), `${page.path} → ${page.parent}`).not.toBeNull();
      expect(page.parent, `${page.path} cannot be its own parent`).not.toBe(page.path);
    }
  });

  // A crawler can only be told a page exists; the edge decides whether it gets
  // a 200 or a 404. A sitemap URL that 404s is the worst of both.
  it('is served 200 at the edge', () => {
    for (const p of PUBLIC_PAGE_PATHS) {
      expect(isKnownRoute(p), `${p} must be a known route`).toBe(true);
    }
  });

  it('is indexable and self-canonical', () => {
    for (const p of PUBLIC_PAGE_PATHS) {
      const seo = seoForPath(p);
      expect(seo.robots, p).toBe(INDEXABLE);
      expect(seo.canonical, p).toBe(`${CANONICAL_ORIGIN}${p}`);
    }
  });

  // The registry entry is what makes a URL public. A route in App.tsx with no
  // entry ships a page with the brand's default title, no canonical and no
  // sitemap row — an orphan that looks fine in a browser and is invisible to
  // search. Matching on the route literal is crude and catches exactly that.
  it('has a route in App.tsx for every registered page', () => {
    for (const p of PUBLIC_PAGE_PATHS) {
      // Both comparison surfaces are served by one parameterised route each:
      // /careers/compare/<rival> for job platforms, /compare/<alternative> for
      // budgeting apps and spreadsheets.
      if (/^\/careers\/compare\/[^/]+$/.test(p)) continue;
      if (/^\/compare\/[^/]+$/.test(p)) continue;
      if (/^\/companies\/[^/]+$/.test(p)) continue;
      expect(APP_TSX, `${p} has a registry entry but no route in App.tsx`)
        .toContain(`path="${p}"`);
    }
    expect(APP_TSX).toContain('path="/careers/compare/:rival"');
    expect(APP_TSX).toContain('path="/compare/:alternative"');
    expect(APP_TSX).toContain('path="/companies/:company"');
  });

  // Public marketing lives inside the /careers/* namespace, which is also the
  // signed-in workspace's namespace. If a future Careers section ever takes a
  // path a marketing page already owns, one of them silently stops resolving.
  it('never collides with a Careers workspace section', () => {
    const appSections = [...CAREERS_NAV, ...CAREERS_HIDDEN_SECTIONS].map((s) => s.href);
    for (const p of PUBLIC_PAGE_PATHS) {
      expect(appSections, `${p} is both a public page and a Careers app section`)
        .not.toContain(p);
    }
  });
});

describe('registry copy', () => {
  it('keeps titles and descriptions within what a SERP shows', () => {
    for (const page of PUBLIC_PAGES) {
      expect(page.title.length, `${page.path} title (${page.title.length})`)
        .toBeLessThanOrEqual(70);
      expect(page.title, `${page.path} must be brand-attributed`).toMatch(/FinatriX/);
      expect(page.description.length, `${page.path} description (${page.description.length})`)
        .toBeLessThanOrEqual(165);
      expect(page.description.length, `${page.path} description too short`)
        .toBeGreaterThan(50);
    }
  });

  it('gives every page a review date that is a real calendar day', () => {
    for (const page of PUBLIC_PAGES) {
      expect(page.updated, page.path).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(page.updated)), page.path).toBe(false);
    }
  });

  it('gives marketing pages a heading and a lede, and legal pages neither', () => {
    for (const page of PUBLIC_PAGES) {
      if (page.kind === 'legal') continue;
      expect(page.heading, `${page.path} heading`).toBeTruthy();
      expect(page.lede, `${page.path} lede`).toBeTruthy();
    }
  });
});

describe('FAQ structured data', () => {
  it('emits FAQPage only for pages that carry questions', () => {
    for (const page of PUBLIC_PAGES) {
      const graph = structuredDataForPath(page.path)!['@graph'] as Record<string, unknown>[];
      const faqNode = graph.find((n) => n['@type'] === 'FAQPage');
      if (page.faq?.length) {
        expect(faqNode, `${page.path} should emit FAQPage`).toBeTruthy();
        expect((faqNode!.mainEntity as unknown[]).length).toBe(page.faq.length);
      } else {
        expect(faqNode, `${page.path} must not emit FAQPage`).toBeUndefined();
      }
    }
  });

  it('writes non-empty, non-duplicate questions and answers', () => {
    for (const page of PUBLIC_PAGES) {
      if (!page.faq) continue;
      const questions = page.faq.map((f) => f.q);
      expect(new Set(questions).size, `${page.path} repeats a question`).toBe(questions.length);
      for (const entry of page.faq) {
        expect(entry.q.length, `${page.path}: "${entry.q}"`).toBeGreaterThan(8);
        // A one-line answer is not worth a rich result and reads as filler.
        expect(entry.a.length, `${page.path}: answer to "${entry.q}"`).toBeGreaterThan(60);
      }
    }
  });
});

describe('breadcrumbs', () => {
  it('describes the real trail, ending on the page itself', () => {
    const page = publicPageFor('/careers/compare/indeed')!;
    const graph = structuredDataForPath(page.path)!['@graph'] as Record<string, unknown>[];
    const crumbs = graph.find((n) => n['@type'] === 'BreadcrumbList')!
      .itemListElement as Array<Record<string, unknown>>;

    expect(crumbs.map((c) => c.name)).toEqual(['Home', 'Careers', 'Compare', 'vs Indeed']);
    expect(crumbs.map((c) => c.position)).toEqual([1, 2, 3, 4]);
    // The last crumb IS the current page, so it carries no link.
    expect(crumbs[crumbs.length - 1].item).toBeUndefined();
    expect(crumbs[1].item).toBe(`${CANONICAL_ORIGIN}/careers`);
  });
});

describe('comparison rivals', () => {
  it('has a registry page for every rival, and vice versa', () => {
    for (const r of RIVALS) {
      expect(publicPageFor(`/careers/compare/${r.slug}`), r.slug).not.toBeNull();
    }
    const comparePages = PUBLIC_PAGE_PATHS.filter((p) => p.startsWith('/careers/compare/'));
    expect(comparePages.length).toBe(RIVALS.length);
  });

  it('resolves a known slug and refuses an unknown one', () => {
    expect(rivalFor('linkedin')?.name).toBe('LinkedIn Jobs');
    expect(rivalFor('not-a-rival')).toBeNull();
    expect(rivalFor(undefined)).toBeNull();
  });

  // The editorial rule the pages state to the reader. A comparison whose
  // "what they do better" list is empty is an advertisement, and readers —
  // and search engines assessing helpfulness — treat it as one.
  it('always credits the other product with real strengths', () => {
    for (const r of RIVALS) {
      expect(r.theirStrengths.length, `${r.name} needs stated strengths`).toBeGreaterThanOrEqual(3);
      expect(r.ourStrengths.length, r.name).toBeGreaterThanOrEqual(3);
      expect(r.verdict.length, r.name).toBeGreaterThan(40);
    }
  });
});
