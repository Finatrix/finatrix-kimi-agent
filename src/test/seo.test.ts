import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  seoForPath,
  applySeo,
  CANONICAL_ORIGIN,
  DEFAULT_TITLE,
  DEFAULT_DESCRIPTION,
  ROUTE_SCHEMA_ID,
  structuredDataForPath,
  serialiseJsonLd,
} from '../lib/seo';
import { CANONICAL_HOST, TOOL_IDS } from '../shared/routes';

describe('seoForPath', () => {
  // The regression this exists for: every SPA route was served index.html with a
  // canonical of "/", so the seven calculator pages — the only URLs in
  // sitemap.xml and the stated organic-acquisition surface — all told search
  // engines to consolidate them into the homepage.
  it('makes every public tool page self-canonical', () => {
    for (const id of TOOL_IDS) {
      const seo = seoForPath(`/tools/${id}`);
      expect(seo.canonical).toBe(`${CANONICAL_ORIGIN}/tools/${id}`);
      expect(seo.robots).toBe('index, follow');
    }
  });

  it('self-canonicalises the other public pages', () => {
    expect(seoForPath('/').canonical).toBe(`${CANONICAL_ORIGIN}/`);
    expect(seoForPath('/privacy').canonical).toBe(`${CANONICAL_ORIGIN}/privacy`);
    expect(seoForPath('/terms').canonical).toBe(`${CANONICAL_ORIGIN}/terms`);
  });

  // `/tools` renders ToolsIndex, which always <Navigate>s to /tools/dashboard.
  // Verified live: navigating to /tools ends on /tools/dashboard. A sitemap
  // entry pointing at a pure redirect is reported "Page with redirect —
  // excluded", so the URL is neither indexable nor listed.
  it('treats /tools as a redirect, not an indexable page', () => {
    expect(seoForPath('/tools').robots).toBe('noindex, nofollow');
    expect(seoForPath('/tools').canonical).toBeNull();
    const xml = readFileSync(join(__dirname, '..', '..', 'public', 'sitemap.xml'), 'utf8');
    expect(xml).not.toContain(`<loc>${CANONICAL_ORIGIN}/tools</loc>`);
  });

  it('points the /home alias at the real homepage, not at itself', () => {
    expect(seoForPath('/home').canonical).toBe(`${CANONICAL_ORIGIN}/`);
  });

  it('ignores trailing slashes', () => {
    expect(seoForPath('/tools/budget/').canonical).toBe(`${CANONICAL_ORIGIN}/tools/budget`);
    expect(seoForPath('').canonical).toBe(`${CANONICAL_ORIGIN}/`);
  });

  // Strict allowlist: a new authenticated route must never become indexable by
  // simply existing.
  it('marks private and non-public routes noindex', () => {
    for (const p of [
      '/careers', '/careers/jobs', '/careers/admin', '/profile',
      '/login', '/signup', '/welcome', '/tools/dashboard', '/tools/not-a-tool',
      '/definitely-not-a-route',
    ]) {
      const seo = seoForPath(p);
      expect(seo.robots).toBe('noindex, nofollow');
      expect(seo.canonical).toBeNull();
    }
  });

  it('never advertises a non-production or retired origin', () => {
    expect(CANONICAL_ORIGIN).toBe(`https://${CANONICAL_HOST}`);
    expect(CANONICAL_ORIGIN).not.toMatch(/workers\.dev|localhost|127\.0\.0\.1/);
    expect(CANONICAL_ORIGIN).not.toMatch(/finatrix\.(online|space|app)/);
    expect(CANONICAL_ORIGIN).toMatch(/^https:\/\//); // never http, never protocol-relative
    expect(CANONICAL_ORIGIN).not.toMatch(/\/$/);
    // The apex, not www — www 301s here, so advertising it would canonicalise
    // to a URL that immediately redirects.
    expect(CANONICAL_ORIGIN).not.toMatch(/\/\/www\./);
  });

  // index.html is the shell every route is served from; its static tags are
  // what a crawler sees before hydration.
  it('agrees with the static tags in index.html', () => {
    const html = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8');
    expect(html).toContain(`<link rel="canonical" href="${CANONICAL_ORIGIN}/" />`);
    expect(html).toContain(`<meta property="og:url" content="${CANONICAL_ORIGIN}/" />`);

    // The shell's static copy IS the homepage's copy. If these drift, the
    // homepage ships one title/description in its bytes and a different one the
    // moment the Worker or applySeo touches it — a self-inflicted mismatch that
    // only shows up in a crawler's cache.
    expect(html).toContain(`<title>${DEFAULT_TITLE}</title>`);
    const home = seoForPath('/');
    expect(home.title).toBe(DEFAULT_TITLE);
    expect(home.description).toBe(DEFAULT_DESCRIPTION);
    for (const tag of [
      /<meta\s+name="description"\s+content="([^"]+)"/,
      /<meta\s+property="og:title"\s+content="([^"]+)"/,
      /<meta\s+name="twitter:title"\s+content="([^"]+)"/,
    ]) {
      const found = new RegExp(tag.source.replace(/\s+/g, '\\s+'), 's').exec(html)?.[1];
      expect(found, tag.source).toBeTruthy();
    }
    // Description tags are multi-line in the shell, so match on content only.
    for (const name of ['og:description', 'twitter:description']) {
      expect(html, name).toContain(DEFAULT_DESCRIPTION);
    }

    // The per-route JSON-LD block must exist to be rewritten into. Both the
    // Worker and applySeo only ever replace the contents of a node that is
    // already there; without this tag the structured data silently never ships.
    expect(html).toContain(`id="${ROUTE_SCHEMA_ID}"`);
  });

  // Every indexable page needs its own title and description, or they compete
  // for one identical snippet and no unfurl describes what was shared.
  it('gives every indexable page a distinct, well-formed title and description', () => {
    const paths = ['/', '/privacy', '/terms', ...TOOL_IDS.map((t) => `/tools/${t}`)];
    const titles = new Set<string>();
    const descriptions = new Set<string>();

    for (const p of paths) {
      const { title, description } = seoForPath(p);
      expect(title, `${p} title`).toBeTruthy();
      expect(description, `${p} description`).toBeTruthy();
      // Google truncates a SERP title around 60 chars and a description around
      // 160; past that the tail is dropped rather than shown.
      expect(title.length, `${p} title is ${title.length} chars: ${title}`).toBeLessThanOrEqual(70);
      expect(description.length, `${p} description is ${description.length} chars`)
        .toBeLessThanOrEqual(165);
      expect(description.length, `${p} description is too short to be useful`)
        .toBeGreaterThan(50);
      expect(title, `${p} must be brand-attributed`).toMatch(/FinatriX/);
      titles.add(title);
      descriptions.add(description);
    }

    expect(titles.size, 'two indexable pages share a title').toBe(paths.length);
    expect(descriptions.size, 'two indexable pages share a description').toBe(paths.length);
  });

  it('titles private routes for the tab strip without leaking them to search', () => {
    // Not an SEO surface — every one of these is noindex — but the title is the
    // first thing a screen reader announces after a navigation.
    for (const [path, expected] of [
      ['/careers/jobs', 'Job Search — FinatriX'],
      ['/tools/dashboard', 'Dashboard — FinatriX'],
      ['/login', 'Sign In — FinatriX'],
    ] as const) {
      const seo = seoForPath(path);
      expect(seo.title, path).toBe(expected);
      expect(seo.robots, path).toBe('noindex, nofollow');
    }
    // An unmapped route falls back to the brand title rather than an empty one.
    expect(seoForPath('/nope').title).toBe(DEFAULT_TITLE);
  });
});

describe('structuredDataForPath', () => {
  it('emits nothing for a page crawlers are told to ignore', () => {
    for (const p of ['/careers/jobs', '/login', '/tools/dashboard', '/nope']) {
      expect(structuredDataForPath(p), p).toBeNull();
    }
  });

  it('describes each calculator as a free SoftwareApplication under the brand', () => {
    for (const id of TOOL_IDS) {
      const url = `${CANONICAL_ORIGIN}/tools/${id}`;
      const graph = structuredDataForPath(`/tools/${id}`)!['@graph'] as Record<string, unknown>[];
      const app = graph.find((n) => n['@type'] === 'SoftwareApplication')!;
      expect(app, id).toBeTruthy();
      expect(app.url).toBe(url);
      expect(app.isAccessibleForFree).toBe(true);
      // Nodes reference the site-level entities by @id instead of restating
      // them, so a crawler resolves ONE brand across the site.
      expect(app.publisher).toEqual({ '@id': `${CANONICAL_ORIGIN}/#org` });
      expect(graph.some((n) => n['@type'] === 'BreadcrumbList'), `${id} breadcrumb`).toBe(true);
    }
  });

  it('serialises to JSON that survives embedding in a script element', () => {
    const raw = serialiseJsonLd(structuredDataForPath('/tools/budget'));
    // A literal "<" in a data block can terminate the element early.
    expect(raw).not.toContain('<');
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(serialiseJsonLd(null)).toBe('');
  });

  // Sitemap and canonical policy must not drift apart.
  it('every sitemap URL is self-canonical and indexable', () => {
    const xml = readFileSync(join(__dirname, '..', '..', 'public', 'sitemap.xml'), 'utf8');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBeGreaterThan(0);
    for (const loc of locs) {
      const path = new URL(loc).pathname;
      const seo = seoForPath(path);
      expect(seo.robots, `${path} must be indexable`).toBe('index, follow');
      expect(seo.canonical, `${path} must be self-canonical`).toBe(`${CANONICAL_ORIGIN}${path === '/' ? '/' : path.replace(/\/+$/, '')}`);
    }
  });
});

describe('applySeo', () => {
  /** The head tags index.html really ships, which are all applySeo may touch. */
  beforeEach(() => {
    document.head.innerHTML = `
      <title>${DEFAULT_TITLE}</title>
      <link rel="canonical" href="${CANONICAL_ORIGIN}/" />
      <meta name="robots" content="index, follow" />
      <meta name="description" content="${DEFAULT_DESCRIPTION}" />
      <meta property="og:url" content="${CANONICAL_ORIGIN}/" />
      <meta property="og:title" content="${DEFAULT_TITLE}" />
      <meta property="og:description" content="${DEFAULT_DESCRIPTION}" />
      <meta name="twitter:title" content="${DEFAULT_TITLE}" />
      <meta name="twitter:description" content="${DEFAULT_DESCRIPTION}" />
      <script type="application/ld+json" id="${ROUTE_SCHEMA_ID}"></script>
    `;
  });

  const content = (sel: string) => document.querySelector(sel)!.getAttribute('content');

  it('rewrites the whole head for a client-side navigation', () => {
    applySeo('/tools/lifemap');
    const { title, description } = seoForPath('/tools/lifemap');

    expect(document.title).toBe(title);
    expect(content('meta[name="description"]')).toBe(description);
    expect(content('meta[property="og:title"]')).toBe(title);
    expect(content('meta[property="og:description"]')).toBe(description);
    expect(content('meta[name="twitter:title"]')).toBe(title);
    expect(content('meta[name="twitter:description"]')).toBe(description);
  });

  it('swaps the per-route JSON-LD, and empties it on a noindex route', () => {
    applySeo('/tools/budget');
    const written = document.getElementById(ROUTE_SCHEMA_ID)!.textContent!;
    expect(JSON.parse(written)['@graph']).toBeTruthy();
    expect(written).toContain('/tools/budget');

    // Stale structured data describing the previous page is worse than none.
    applySeo('/careers/jobs');
    expect(document.getElementById(ROUTE_SCHEMA_ID)!.textContent).toBe('');
  });

  it('restores the homepage identity when navigating back to it', () => {
    applySeo('/tools/budget');
    applySeo('/');
    expect(document.title).toBe(DEFAULT_TITLE);
    expect(content('meta[name="description"]')).toBe(DEFAULT_DESCRIPTION);
  });

  it('rewrites canonical, og:url and robots for a public page', () => {
    applySeo('/tools/budget');
    expect(document.querySelector('link[rel="canonical"]')!.getAttribute('href'))
      .toBe(`${CANONICAL_ORIGIN}/tools/budget`);
    expect(document.querySelector('meta[property="og:url"]')!.getAttribute('content'))
      .toBe(`${CANONICAL_ORIGIN}/tools/budget`);
    expect(document.querySelector('meta[name="robots"]')!.getAttribute('content'))
      .toBe('index, follow');
  });

  it('marks a private page noindex without self-canonicalising it', () => {
    applySeo('/careers/jobs');
    expect(document.querySelector('meta[name="robots"]')!.getAttribute('content'))
      .toBe('noindex, nofollow');
    expect(document.querySelector('link[rel="canonical"]')!.getAttribute('href'))
      .toBe(`${CANONICAL_ORIGIN}/`);
  });

  it('restores an indexable state when navigating back to a public page', () => {
    applySeo('/careers/jobs');
    applySeo('/privacy');
    expect(document.querySelector('meta[name="robots"]')!.getAttribute('content'))
      .toBe('index, follow');
    expect(document.querySelector('link[rel="canonical"]')!.getAttribute('href'))
      .toBe(`${CANONICAL_ORIGIN}/privacy`);
  });

  it('does not inject tags that index.html does not already ship', () => {
    document.head.innerHTML = '';
    expect(() => applySeo('/tools/goals')).not.toThrow();
    expect(document.head.children.length).toBe(0);
  });
});
