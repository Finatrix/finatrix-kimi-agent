import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  seoForPath,
  applySeo,
  CANONICAL_ORIGIN,
  DEFAULT_TITLE,
  DEFAULT_DESCRIPTION,
  DEFAULT_SOCIAL_DESCRIPTION,
  ROUTE_SCHEMA_ID,
  structuredDataForPath,
  serialiseJsonLd,
  INDEXABLE,
} from '../lib/seo';
import { existsSync } from 'node:fs';
import { CANONICAL_HOST, TOOL_COUNT_WORD, TOOL_COUNT_WORD_CAP, TOOL_IDS } from '../shared/routes';
import { PUBLIC_PAGES as PUBLIC_PAGES_JSON, PUBLIC_PAGE_PATHS } from '../shared/publicPages';
import { CONTENT_PATHS } from '../shared/content';

/** Every count word the copy could plausibly carry, for the drift check below. */
const NUMBER_WORDS_FOR_TEST = [
  'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
];

/**
 * Every indexable URL on the site, for the assertions that must hold across all
 * of them rather than across one registry's worth.
 */
const ALL_INDEXABLE = ['/', ...TOOL_IDS.map((id) => `/tools/${id}`), ...PUBLIC_PAGE_PATHS, ...CONTENT_PATHS];

describe('share cards', () => {
  /**
   * The rule `ogImageFor` states in a comment and nothing enforced until now:
   * never point at a file that does not exist. A 404 og:image unfurls as a
   * BLANK card in WhatsApp, Slack and LinkedIn — strictly worse than the
   * generic cover — and it is invisible in every other test, because the
   * metadata is perfectly well-formed. The only way to catch it is to look on
   * disk.
   */
  it('resolves every referenced og:image to a file that exists', () => {
    const root = join(__dirname, '..', '..', 'public');
    const missing: string[] = [];
    for (const path of ALL_INDEXABLE) {
      const url = seoForPath(path).image;
      const file = join(root, new URL(url).pathname);
      if (!existsSync(file)) missing.push(`${path} → ${new URL(url).pathname}`);
    }
    expect(missing, `og:image files missing from public/:\n${missing.join('\n')}`).toEqual([]);
  });

  it('gives every indexable page a versioned, absolute card with alt text', () => {
    for (const path of ALL_INDEXABLE) {
      const { image, imageAlt } = seoForPath(path);
      expect(image, path).toMatch(new RegExp(`^${CANONICAL_ORIGIN}/images/.*\\?v=\\d+$`));
      // A large share image needs alt text for the same reason an <img> does.
      expect(imageAlt.length, `${path} imageAlt`).toBeGreaterThan(3);
    }
  });

  /**
   * A knowledge-layer URL must not fall back to the generic cover: the whole
   * point of the per-topic cards is that a shared guide unfurls as that guide.
   */
  it('gives every knowledge-layer URL its own topic card', () => {
    for (const path of CONTENT_PATHS) {
      expect(seoForPath(path).image, path).toMatch(/\/images\/og\/learn(-[a-z0-9-]+)?\.jpg/);
    }
  });
});

/**
 * The `max-*` directives, pinned by their literal text.
 *
 * Every other assertion in this file compares against `INDEXABLE`, which is
 * exactly what makes them blind to this: shortening the constant back to a bare
 * `index, follow` would keep all of them green while quietly handing Google
 * back its default ceilings on image size and snippet length. So this one test
 * spells the directives out. It is the only place in the suite that should.
 */
describe('the indexable robots directive', () => {
  it('grants the large image preview and the uncapped snippet', () => {
    expect(INDEXABLE).toContain('index, follow');
    expect(INDEXABLE).toContain('max-image-preview:large');
    expect(INDEXABLE).toContain('max-snippet:-1');
    expect(INDEXABLE).toContain('max-video-preview:-1');
  });

  /**
   * The shell's static tag is what a crawler sees before any JavaScript runs,
   * and on a route the edge Worker's rewrite does not reach it is the ONLY
   * value that is ever read. It has to be the same grant.
   */
  it('is what index.html ships statically', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    const content = /<meta name="robots" content="([^"]+)"/.exec(html)?.[1];
    expect(
      content,
      'index.html\'s robots meta must be byte-identical to INDEXABLE in src/lib/seo.ts',
    ).toBe(INDEXABLE);
  });
});

/**
 * The homepage copy that names how many calculators there are.
 *
 * `DEFAULT_TITLE` and `DEFAULT_DESCRIPTION` carried a comment claiming this
 * file already asserted they matched `index.html`. It did not — only the robots
 * meta was checked — and in that gap the shell shipped "Seven free … money
 * tools" across the meta description, both social cards, the `ItemList` JSON-LD
 * and the "What is FinatriX?" answer, while `TOOL_IDS` held eight and the hero
 * rendered eight cards. These are the assertions that comment described.
 */
describe('homepage copy agrees with itself and with TOOL_IDS', () => {
  const html = () => readFileSync(join(process.cwd(), 'index.html'), 'utf8');

  it('index.html ships the same title as DEFAULT_TITLE', () => {
    expect(/<title>([^<]+)<\/title>/.exec(html())?.[1]).toBe(DEFAULT_TITLE);
  });

  it('index.html ships DEFAULT_DESCRIPTION in the meta, og and twitter tags', () => {
    const doc = html();
    const found = [
      /<meta\s+name="description"\s+content="([^"]+)"/s.exec(doc)?.[1],
      /<meta\s+property="og:description"\s+content="([^"]+)"/s.exec(doc)?.[1],
      /<meta\s+name="twitter:description"\s+content="([^"]+)"/s.exec(doc)?.[1],
      // The multi-line form Prettier produces for the long values.
      ...[...doc.matchAll(/content="([^"]*education-first money tools[^"]*)"/g)].map((m) => m[1]),
    ].filter(Boolean);
    expect(found.length, 'expected the shell to carry the homepage description').toBeGreaterThan(0);
    for (const value of found) expect(value).toBe(DEFAULT_DESCRIPTION);
  });

  it('spells the tool count from TOOL_IDS rather than hardcoding it', () => {
    expect(TOOL_COUNT_WORD_CAP.toLowerCase()).toBe(TOOL_COUNT_WORD);
    expect(DEFAULT_DESCRIPTION.startsWith(`${TOOL_COUNT_WORD_CAP} free`)).toBe(true);
    expect(html()).toContain(`${TOOL_COUNT_WORD_CAP} free`);
  });

  /**
   * The failure this catches is drift, not a typo: any registry string that
   * spells a count which is no longer `TOOL_IDS.length`.
   */
  it('no registry string names a stale tool count', () => {
    const stale = NUMBER_WORDS_FOR_TEST.filter((w) => w !== TOOL_COUNT_WORD);
    const surfaces: [string, string][] = [
      ['index.html', html()],
      ['DEFAULT_DESCRIPTION', DEFAULT_DESCRIPTION],
      ['DEFAULT_SOCIAL_DESCRIPTION', DEFAULT_SOCIAL_DESCRIPTION],
      ['publicPages FAQ', JSON.stringify(PUBLIC_PAGES_JSON)],
      ['tools JSON-LD', JSON.stringify(structuredDataForPath('/'))],
    ];
    for (const [name, text] of surfaces) {
      for (const word of stale) {
        const re = new RegExp(`\\b${word} free\\b`, 'i');
        expect(re.test(text), `${name} claims "${word} free" but there are ${TOOL_IDS.length} tools`).toBe(false);
      }
    }
  });
});

describe('seoForPath', () => {
  // The regression this exists for: every SPA route was served index.html with a
  // canonical of "/", so the calculator pages — the only URLs in
  // sitemap.xml and the stated organic-acquisition surface — all told search
  // engines to consolidate them into the homepage.
  it('makes every public tool page self-canonical', () => {
    for (const id of TOOL_IDS) {
      const seo = seoForPath(`/tools/${id}`);
      expect(seo.canonical).toBe(`${CANONICAL_ORIGIN}/tools/${id}`);
      expect(seo.robots).toBe(INDEXABLE);
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
      // '/careers' itself is NOT here: it is now the public marketing landing
      // page. The signed-in workspace moved to '/careers/dashboard', which is.
      '/careers/dashboard', '/careers/jobs', '/careers/admin', '/profile',
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
  //
  // The list is DERIVED from the registry rather than written out, so a new
  // public page is held to the same standard automatically. Writing it by hand
  // was fine when there were ten URLs; at twenty-four, the page most likely to
  // be missed is the one nobody remembered to add here.
  it('gives every indexable page a distinct, well-formed title and description', () => {
    const paths = [
      '/',
      ...TOOL_IDS.map((t) => `/tools/${t}`),
      ...PUBLIC_PAGE_PATHS,
    ];
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

  /**
   * The homepage list of tools.
   *
   * It exists to teach a crawler the site's seven principal entry points from
   * its most authoritative URL — the input Google uses to pick sitelinks. That
   * only holds while the list matches the tools, so an eighth calculator that
   * never reaches this markup should fail here rather than quietly leave the
   * homepage describing a six-sevenths version of the product.
   */
  it('names every calculator in the homepage ItemList, in order', () => {
    const graph = structuredDataForPath('/')!['@graph'] as Array<Record<string, unknown>>;
    const list = graph.find((n) => n['@type'] === 'ItemList') as
      | { numberOfItems: number; itemListElement: Array<{ position: number; url: string }> }
      | undefined;

    expect(list, 'the homepage graph must carry an ItemList of the tools').toBeTruthy();
    expect(list!.numberOfItems).toBe(TOOL_IDS.length);
    expect(list!.itemListElement.map((i) => i.url)).toEqual(
      TOOL_IDS.map((id) => `${CANONICAL_ORIGIN}/tools/${id}`),
    );
    // Positions are 1-based and dense — a gap makes the ordering meaningless.
    expect(list!.itemListElement.map((i) => i.position)).toEqual(
      TOOL_IDS.map((_, i) => i + 1),
    );
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
      expect(seo.robots, `${path} must be indexable`).toBe(INDEXABLE);
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
      .toBe(INDEXABLE);
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
      .toBe(INDEXABLE);
    expect(document.querySelector('link[rel="canonical"]')!.getAttribute('href'))
      .toBe(`${CANONICAL_ORIGIN}/privacy`);
  });

  it('does not inject tags that index.html does not already ship', () => {
    document.head.innerHTML = '';
    expect(() => applySeo('/tools/goals')).not.toThrow();
    expect(document.head.children.length).toBe(0);
  });
});
