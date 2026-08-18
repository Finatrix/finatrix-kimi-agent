/**
 * Server-side SEO metadata — `withSeoMetadata` in `worker/index.ts`.
 *
 * The bug this pins: every client route is served the same `index.html`, whose
 * static `<link rel="canonical">` names the homepage. `applySeo` fixed that
 * after mount, so the corrected value existed only for a client that executes
 * JavaScript. Googlebot renders and would see it; Bing and every link unfurler
 * read the raw HTML and were told that every calculator — the entire
 * organic surface — canonicalise to `/`.
 *
 * `HTMLRewriter` is a Workers runtime global and does not exist under Vitest,
 * which is exactly why `withSeoMetadata` degrades to a pass-through there. That
 * makes the guard untestable by observing the response body, so these tests
 * install a recording stub and assert the selector/attribute/value triples the
 * Worker asks for. That is the whole contract: the Worker's job is to hand
 * HTMLRewriter the right instructions, and HTMLRewriter's job — parsing HTML —
 * is Cloudflare's, not ours to re-test.
 *
 * The end-to-end proof that the served bytes are right lives in
 * `scripts/verify-production.mjs`, which reads the real origin.
 */
import { describe, it, expect, afterEach } from 'vitest';
import worker from '../../worker/index';
import { CANONICAL_HOST, TOOL_IDS } from '../shared/routes';
import { PUBLIC_PAGES, PUBLIC_PAGE_PATHS } from '../shared/publicPages';
import {
  CANONICAL_ORIGIN,
  DEFAULT_SOCIAL_DESCRIPTION,
  DEFAULT_TITLE,
  ROUTE_SCHEMA_ID,
  seoForPath,
} from '../lib/seo';

const SHELL_BODY = '<!doctype html><html><head><title>FinatriX</title></head><body></body></html>';

const BUILT_FILES: Record<string, string> = {
  '/index.html': SHELL_BODY,
  '/': SHELL_BODY,
  '/robots.txt': 'User-agent: *',
};

const env = {
  ASSETS: {
    fetch: async (input: Request | URL | string) => {
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const path = new URL(href).pathname;
      const body = BUILT_FILES[path];
      if (body === undefined) return new Response('not found', { status: 404 });
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': path.endsWith('.txt') ? 'text/plain' : 'text/html; charset=utf-8',
          // Both must be dropped once the body is rewritten: Content-Length
          // would be wrong, and a shared ETag across routes whose bodies now
          // differ is precisely what lets a cache serve one route's HTML for
          // another.
          'Content-Length': String(body.length),
          ETag: '"shell-v1"',
        },
      });
    },
  },
  CANONICAL_HOST,
};

interface Applied { selector: string; attr: string; value: string }

/** Attribute name recorded for `setInnerContent` (title / JSON-LD data block). */
const TEXT = 'innerContent';

/**
 * Minimal stand-in for the Workers `HTMLRewriter` global. `on()` invokes the
 * handler immediately against a recording element, so whatever the Worker would
 * have written into the document is captured verbatim.
 */
function withRewriterStub(): Applied[] {
  const applied: Applied[] = [];
  interface FakeElement {
    setAttribute(name: string, value: string): void;
    setInnerContent(content: string, options?: { html: boolean }): void;
  }
  class FakeRewriter {
    on(selector: string, handler: { element(el: FakeElement): void }) {
      handler.element({
        setAttribute: (attr, value) => applied.push({ selector, attr, value }),
        // `<title>` and the JSON-LD block are written as CHILDREN, not
        // attributes. Recorded under a reserved pseudo-attribute so one
        // `valueFor` lookup covers both kinds of write.
        setInnerContent: (value) => applied.push({ selector, attr: TEXT, value }),
      });
      return this;
    }
    transform(response: Response) { return response; }
  }
  (globalThis as Record<string, unknown>).HTMLRewriter = FakeRewriter;
  return applied;
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).HTMLRewriter;
});

const get = (path: string) => worker.fetch(new Request(`https://${CANONICAL_HOST}${path}`), env);

/** The value the Worker asks HTMLRewriter to write for a given selector. */
const valueFor = (applied: Applied[], selector: string) =>
  applied.find((a) => a.selector === selector)?.value;

const CANONICAL_SEL = 'link[rel="canonical"]';
const OG_URL_SEL = 'meta[property="og:url"]';
const ROBOTS_SEL = 'meta[name="robots"]';
const TITLE_SELECTOR = 'title';
const DESCRIPTION_SEL = 'meta[name="description"]';

describe('worker: server-side canonical + og:url', () => {
  // The core requirement: correct metadata in the INITIAL HTML, with no
  // JavaScript having run.
  it('self-canonicalises every public calculator page', async () => {
    for (const tool of TOOL_IDS) {
      const applied = withRewriterStub();
      await get(`/tools/${tool}`);
      const expected = `${CANONICAL_ORIGIN}/tools/${tool}`;
      expect(valueFor(applied, CANONICAL_SEL), tool).toBe(expected);
      expect(valueFor(applied, OG_URL_SEL), tool).toBe(expected);
      expect(valueFor(applied, ROBOTS_SEL), tool).toBe('index, follow');
    }
  });

  // Every registered public page, derived from the registry rather than listed,
  // so a new marketing or trust page is held to this automatically. These are
  // the URLs an anonymous visitor and a crawler arrive on; if the Worker does
  // not rewrite them, they are served the HOMEPAGE's canonical, title and
  // description in their raw bytes — which is the exact bug this file exists
  // for, reintroduced on twelve new pages at once.
  it('self-canonicalises every public page, including the new marketing surface', async () => {
    for (const p of PUBLIC_PAGE_PATHS) {
      const applied = withRewriterStub();
      await get(p);
      expect(valueFor(applied, CANONICAL_SEL), p).toBe(`${CANONICAL_ORIGIN}${p}`);
      expect(valueFor(applied, OG_URL_SEL), p).toBe(`${CANONICAL_ORIGIN}${p}`);
      expect(valueFor(applied, ROBOTS_SEL), p).toBe('index, follow');
    }
  });

  it('gives every public page its own title and description in the served bytes', async () => {
    const titles = new Set<string>();
    for (const p of PUBLIC_PAGE_PATHS) {
      const applied = withRewriterStub();
      await get(p);
      const seo = seoForPath(p);
      expect(valueFor(applied, TITLE_SELECTOR), p).toBe(seo.title);
      expect(valueFor(applied, DESCRIPTION_SEL), p).toBe(seo.description);
      titles.add(seo.title);
    }
    expect(titles.size, 'two public pages share a title').toBe(PUBLIC_PAGE_PATHS.length);
  });

  // FAQ rich results only exist if the markup is in the bytes a crawler reads.
  // The client rewrites this too, but a crawler that does not execute
  // JavaScript never sees that — for this tag the Worker is the only writer
  // that matters.
  it('writes FAQPage structured data into the bytes for pages that render one', async () => {
    const withFaq = PUBLIC_PAGES.filter((p) => p.faq?.length);
    expect(withFaq.length, 'no page declares an FAQ — has the registry changed?')
      .toBeGreaterThan(3);

    for (const page of withFaq) {
      const applied = withRewriterStub();
      await get(page.path);
      const raw = valueFor(applied, `script#${ROUTE_SCHEMA_ID}`)!;
      const graph = JSON.parse(raw)['@graph'] as Array<Record<string, unknown>>;
      const faq = graph.find((n) => n['@type'] === 'FAQPage');
      expect(faq, `${page.path} must serve FAQPage markup`).toBeTruthy();
      expect((faq!.mainEntity as unknown[]).length, page.path).toBe(page.faq!.length);
      // The answers themselves must be present, not just the question shells —
      // an FAQPage node with empty answers is markup that describes nothing.
      const first = (faq!.mainEntity as Array<Record<string, Record<string, string>>>)[0];
      expect(first.acceptedAnswer.text).toBe(page.faq![0].a);
    }
  });

  // `/` is a built file, so it is answered by the assets branch rather than the
  // SPA branch. It gets the same treatment or the most linked URL on the site
  // is the one page that skips it — the same class of bug that made
  // `run_worker_first` necessary.
  it('canonicalises the homepage, which is served as a real file', async () => {
    const applied = withRewriterStub();
    await get('/');
    expect(valueFor(applied, CANONICAL_SEL)).toBe(`${CANONICAL_ORIGIN}/`);
    expect(valueFor(applied, OG_URL_SEL)).toBe(`${CANONICAL_ORIGIN}/`);
  });

  // The regression that motivated the whole change.
  it('never advertises the homepage as the canonical of another indexable page', async () => {
    const homepage = `${CANONICAL_ORIGIN}/`;
    for (const tool of TOOL_IDS) {
      const applied = withRewriterStub();
      await get(`/tools/${tool}`);
      expect(valueFor(applied, CANONICAL_SEL), tool).not.toBe(homepage);
    }
  });

  it('marks non-public routes noindex and does not self-canonicalise them', async () => {
    for (const p of ['/tools/dashboard', '/careers/jobs', '/login', '/nope']) {
      const applied = withRewriterStub();
      await get(p);
      expect(valueFor(applied, ROBOTS_SEL), p).toBe('noindex, nofollow');
      // Deliberately the site root, matching applySeo: a self-canonical on a
      // noindex page sends contradictory signals.
      expect(valueFor(applied, CANONICAL_SEL), p).toBe(`${CANONICAL_ORIGIN}/`);
    }
  });

  // Server and client must not drift. They share `seoForPath`, and this is the
  // assertion that fails if anyone reimplements one of them.
  it('serves exactly what the client-side applySeo would compute', async () => {
    const paths = ['/', '/privacy', '/terms', '/login', ...TOOL_IDS.map((t) => `/tools/${t}`)];
    for (const p of paths) {
      const applied = withRewriterStub();
      await get(p);
      const { canonical, robots } = seoForPath(p);
      expect(valueFor(applied, CANONICAL_SEL), p).toBe(canonical ?? `${CANONICAL_ORIGIN}/`);
      expect(valueFor(applied, ROBOTS_SEL), p).toBe(robots);
    }
  });
});

/**
 * The half of the fix that only the raw bytes can prove.
 *
 * Googlebot renders, so it would eventually see whatever `applySeo` writes.
 * Bing, DuckDuckGo, and every link unfurler — WhatsApp, Slack, X, LinkedIn,
 * iMessage — read the served HTML and stop. Before this, every calculator
 * shipped the landing page's title and description to all of them, so the tools
 * competed for one identical SERP snippet and every shared tool link rendered
 * the same landing card.
 */
describe('worker: server-side title, description and structured data', () => {
  const TITLE_SEL = 'title';
  const DESC_SEL = 'meta[name="description"]';
  const OG_TITLE_SEL = 'meta[property="og:title"]';
  const OG_DESC_SEL = 'meta[property="og:description"]';
  const SCHEMA_SEL = `script#${ROUTE_SCHEMA_ID}`;

  it('gives every calculator its own title and description in the served bytes', async () => {
    const titles = new Set<string>();
    for (const tool of TOOL_IDS) {
      const applied = withRewriterStub();
      await get(`/tools/${tool}`);
      const { title, description } = seoForPath(`/tools/${tool}`);

      expect(valueFor(applied, TITLE_SEL), tool).toBe(title);
      expect(valueFor(applied, DESC_SEL), tool).toBe(description);
      expect(valueFor(applied, OG_TITLE_SEL), tool).toBe(title);

      // The regression itself: never the landing page's copy.
      expect(valueFor(applied, TITLE_SEL), tool).not.toBe(DEFAULT_TITLE);
      titles.add(title);
    }
    // One distinct title per calculator — not the landing page's, repeated.
    expect(titles.size).toBe(TOOL_IDS.length);
  });

  // The homepage is the one page whose share card deliberately differs from its
  // search snippet: a SERP listing has to name the tools to match a long-tail
  // query, a share card is read at a glance.
  it('keeps the homepage share copy distinct from its search snippet', async () => {
    const applied = withRewriterStub();
    await get('/');
    expect(valueFor(applied, TITLE_SEL)).toBe(DEFAULT_TITLE);
    expect(valueFor(applied, OG_DESC_SEL)).toBe(DEFAULT_SOCIAL_DESCRIPTION);
    expect(valueFor(applied, DESC_SEL)).not.toBe(DEFAULT_SOCIAL_DESCRIPTION);
  });

  // Every other page mirrors its meta description into the card rather than
  // maintaining a second string that has to stay true independently.
  it('mirrors the meta description into the share card on a tool page', async () => {
    const applied = withRewriterStub();
    await get('/tools/lifemap');
    const { description } = seoForPath('/tools/lifemap');
    expect(valueFor(applied, OG_DESC_SEL)).toBe(description);
  });

  it('writes parseable per-route JSON-LD naming the tool as a free app', async () => {
    const applied = withRewriterStub();
    await get('/tools/budget');
    const raw = valueFor(applied, SCHEMA_SEL);
    expect(raw).toBeTruthy();

    // Must survive embedding in a <script> data block, then parse.
    expect(raw).not.toContain('<');
    const graph = JSON.parse(raw!.replace(/\\u003c/g, '<'))['@graph'] as Record<string, unknown>[];
    const types = graph.map((n) => n['@type']);
    expect(types).toContain('SoftwareApplication');
    expect(types).toContain('BreadcrumbList');
    expect(types).toContain('WebPage');

    const app = graph.find((n) => n['@type'] === 'SoftwareApplication')!;
    expect(app.name).toBe('Budget Builder');
    expect(app.url).toBe(`${CANONICAL_ORIGIN}/tools/budget`);
    expect(app.offers).toMatchObject({ price: '0', priceCurrency: 'INR' });
  });

  // Describing a page to a crawler that has just been told to ignore it is
  // noise; for the signed-in careers workspace it would also publish the app's
  // internal structure in a machine-readable format for no benefit.
  it('empties the JSON-LD block on a noindex route', async () => {
    for (const p of ['/login', '/careers/jobs', '/tools/dashboard']) {
      const applied = withRewriterStub();
      await get(p);
      expect(valueFor(applied, SCHEMA_SEL), p).toBe('');
    }
  });

  // A private route still needs a real tab label — it is what a screen reader
  // announces after navigating — but must never carry an indexable identity.
  it('titles a private route without making it indexable', async () => {
    const applied = withRewriterStub();
    await get('/careers/jobs');
    expect(valueFor(applied, TITLE_SEL)).toBe('Job Search — FinatriX');
    expect(valueFor(applied, ROBOTS_SEL)).toBe('noindex, nofollow');
  });
});

describe('worker: rewriting does not damage the response', () => {
  it('drops Content-Length and ETag, which no longer describe the rewritten body', async () => {
    withRewriterStub();
    const res = await get('/tools/budget');
    expect(res.headers.get('Content-Length')).toBeNull();
    expect(res.headers.get('ETag')).toBeNull();
  });

  it('keeps the honest HTTP status through the rewrite', async () => {
    withRewriterStub();
    expect((await get('/tools/budget')).status).toBe(200);
    expect((await get('/nope')).status).toBe(404);
  });

  it('leaves non-HTML assets completely untouched', async () => {
    const applied = withRewriterStub();
    const res = await get('/robots.txt');
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    // Not parsed, not rewritten, and its validators survive.
    expect(applied).toHaveLength(0);
    expect(res.headers.get('ETag')).toBe('"shell-v1"');
    expect(await res.text()).toContain('User-agent');
  });

  // Outside the Workers runtime the global is absent. The shell must still be
  // served rather than the request throwing.
  it('degrades to serving the shell unmodified when HTMLRewriter is absent', async () => {
    delete (globalThis as Record<string, unknown>).HTMLRewriter;
    const res = await get('/tools/budget');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(SHELL_BODY);
  });
});

/**
 * The knowledge layer's editorial copy is lazily loaded, so `FAQPage`, the
 * `DefinedTermSet` and the article `abstract` are only in the graph when the
 * copy chunk is present. In the browser the page supplies it after its chunk
 * lands; at the edge the Worker must resolve it BEFORE writing the bytes.
 *
 * This is the assertion that makes the split safe. If the Worker ever stopped
 * awaiting the copy, every guide would still serve a valid page with a correct
 * canonical and title — and would silently lose its FAQ rich result and its
 * abstract for every consumer that does not execute JavaScript, which is most
 * of the ones that matter for a content site.
 */
describe('worker: the served bytes carry the lazily-loaded schema', () => {
  const graphFor = (applied: Applied[]) => {
    const raw = valueFor(applied, `script#${ROUTE_SCHEMA_ID}`);
    expect(raw, 'no JSON-LD written').toBeTruthy();
    // `serialiseJsonLd` escapes `<` so the block cannot terminate itself.
    return JSON.parse(raw!.replace(/\\u003c/g, '<'))['@graph'] as Array<Record<string, unknown>>;
  };

  it('emits FAQPage and DefinedTermSet on a topic hub', async () => {
    const applied = withRewriterStub();
    await get('/learn/budgeting');
    const types = graphFor(applied).map((n) => n['@type']);
    expect(types).toContain('FAQPage');
    expect(types).toContain('DefinedTermSet');
  });

  it('emits the abstract, word count and reading time on an article', async () => {
    const applied = withRewriterStub();
    await get('/learn/budgeting/50-30-20-rule');
    const article = graphFor(applied).find((n) => n['@type'] === 'Article')!;
    expect(article, 'no Article node').toBeTruthy();
    expect(String(article.abstract).length, 'abstract missing from served bytes')
      .toBeGreaterThan(200);
    expect(article.wordCount, 'wordCount missing').toBeGreaterThan(500);
    expect(article.timeRequired, 'timeRequired missing').toMatch(/^PT\d+M$/);
  });

  it('resolves no copy chunk for the hub, which needs none', async () => {
    const applied = withRewriterStub();
    await get('/learn');
    const types = graphFor(applied).map((n) => n['@type']);
    expect(types).toContain('CollectionPage');
    expect(types).toContain('ItemList');
    // The hub renders no FAQ and no vocabulary, so it must claim neither.
    expect(types).not.toContain('FAQPage');
    expect(types).not.toContain('DefinedTermSet');
  });
});
