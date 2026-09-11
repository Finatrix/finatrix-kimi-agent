import { describe, it, expect, afterEach } from 'vitest';
import worker from '../../worker/index';
import { crawlableBodyFor } from '../lib/crawlable';
import { buildLlmsTxt } from '../shared/llms';
import { sitemapEntries } from '../shared/sitemap';
import { CANONICAL_HOST, TOOL_IDS, isKnownRoute } from '../shared/routes';
import { ARTICLES, TOPICS, articlePath, topicPath, topicSlugForContentPath } from '../shared/content';
import { loadTopicContent } from '../content';
import { CANONICAL_ORIGIN, toolSeoFor } from '../lib/seo';

/**
 * The page, in the served bytes — for every client that does not run
 * JavaScript. See src/lib/crawlable.ts for why this exists. What matters:
 *
 *  - every indexable URL gets its real content, with one H1 and working links;
 *  - no private route gets any;
 *  - nothing a user or an editor typed can become live markup.
 */

const PATHS = sitemapEntries().map((e) => new URL(e.loc).pathname.replace(/\/$/, '') || '/');

async function bodyFor(path: string) {
  const slug = topicSlugForContentPath(path);
  return crawlableBodyFor(path, slug ? await loadTopicContent(slug) : null);
}

const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));

/** Opening and closing counts agree for every block-level tag the renderer emits. */
function balanced(html: string): boolean {
  return ['main', 'section', 'nav', 'ul', 'ol', 'li', 'p', 'h1', 'h2', 'h3', 'h4', 'table', 'dl', 'aside']
    .every((tag) => (html.match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? []).length
      === (html.match(new RegExp(`</${tag}>`, 'g')) ?? []).length);
}

describe('crawlable page bodies', () => {
  it('gives every URL in the sitemap real content', async () => {
    expect(PATHS.length).toBeGreaterThan(100);
    for (const path of PATHS) {
      const html = await bodyFor(path);
      expect(html, path).not.toBeNull();
      expect(html!.match(/<h1>/g), path).toHaveLength(1);
      expect(balanced(html!), path).toBe(true);
      expect(html!, path).not.toMatch(/<script|javascript:|on\w+=/i);
      // Enough to be read, not so much that it weighs on the document.
      expect(html!.length, path).toBeGreaterThan(1500);
      expect(html!.length, path).toBeLessThan(160_000);
    }
  });

  it('links only to real pages, so a crawler following them never meets a 404', async () => {
    for (const path of PATHS) {
      for (const href of hrefs((await bodyFor(path))!)) {
        if (href.startsWith('https://')) continue; // cited sources
        expect(isKnownRoute(href.split('#')[0]), `${path} → ${href}`).toBe(true);
      }
    }
  });

  it('links every calculator and the guide index from every page', async () => {
    const links = new Set(hrefs((await bodyFor('/pricing'))!));
    for (const id of TOOL_IDS) expect(links.has(`/tools/${id}`)).toBe(true);
    expect(links.has('/learn')).toBe(true);
  });

  it('carries a guide’s whole body, not just its summary', async () => {
    const article = ARTICLES[0];
    const copy = (await loadTopicContent(article.topic))!.articles[article.slug];
    const html = (await bodyFor(articlePath(article)))!;
    for (const section of copy.sections) expect(html).toContain(section.title.replace(/&/g, '&amp;'));
    expect(html).toContain('The short answer');
  });

  it('carries a calculator’s method and worked example', async () => {
    const html = (await bodyFor('/tools/goals'))!;
    expect(html).toContain(`<h1>${toolSeoFor('goals').name}</h1>`);
    expect(html).toContain('How it is calculated');
    expect(html).toContain('A worked example');
    expect(html).toContain('Frequently asked questions');
  });

  it('gives private routes nothing', async () => {
    for (const path of ['/tools/dashboard', '/tools/settings', '/careers/jobs', '/login', '/profile', '/welcome', '/nope']) {
      expect(await bodyFor(path), path).toBeNull();
    }
  });

  it('escapes the text it carries', () => {
    // Every topic heading and description goes through escapeHtml: a raw "&"
    // or "<" anywhere in the corpus would otherwise corrupt the markup.
    const html = crawlableBodyFor('/learn', null)!;
    expect(html).not.toMatch(/&(?![a-z]+;|#\d+;)/);
    for (const t of TOPICS) expect(html).toContain(`href="${topicPath(t)}"`);
  });
});

describe('the Worker serves it', () => {
  const SHELL = '<!doctype html><html><head><title>FinatriX</title></head><body><noscript>needs JS</noscript></body></html>';
  const env = {
    ASSETS: {
      fetch: async (input: Request | URL | string) => {
        const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const path = new URL(href).pathname;
        if (path !== '/index.html' && path !== '/') return new Response('not found', { status: 404 });
        return new Response(SHELL, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      },
    },
    CANONICAL_HOST,
  };

  function recordNoscript(): string[] {
    const written: string[] = [];
    class FakeRewriter {
      on(selector: string, handler: { element(el: unknown): void }) {
        handler.element({
          setAttribute: () => {},
          setInnerContent: (value: string) => { if (selector === 'noscript') written.push(value); },
        });
        return this;
      }
      transform(response: Response) { return response; }
    }
    (globalThis as Record<string, unknown>).HTMLRewriter = FakeRewriter;
    return written;
  }

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).HTMLRewriter;
  });

  const get = (path: string) => worker.fetch(new Request(`https://${CANONICAL_HOST}${path}`), env);

  it('writes the content into <noscript> on an indexable route', async () => {
    const written = recordNoscript();
    await get('/tools/budget');
    expect(written).toHaveLength(1);
    expect(written[0]).toContain(`<h1>${toolSeoFor('budget').name}</h1>`);
  });

  it('leaves <noscript> alone on a private route', async () => {
    const written = recordNoscript();
    await get('/tools/dashboard');
    expect(written).toHaveLength(0);
  });

  it('serves llms.txt as plain text', async () => {
    const res = await get('/llms.txt');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/^text\/plain/);
    expect(await res.text()).toBe(buildLlmsTxt());
  });
});

describe('llms.txt', () => {
  const text = buildLlmsTxt();

  it('opens with the name and a one-paragraph summary, per the convention', () => {
    const lines = text.split('\n');
    expect(lines[0]).toBe('# FinatriX');
    expect(lines[2]).toMatch(/^> /);
  });

  it('lists every calculator, topic and guide at its canonical URL', () => {
    for (const id of TOOL_IDS) expect(text).toContain(`(${CANONICAL_ORIGIN}/tools/${id})`);
    for (const t of TOPICS) expect(text).toContain(`(${CANONICAL_ORIGIN}${topicPath(t)})`);
    for (const a of ARTICLES) expect(text).toContain(`(${CANONICAL_ORIGIN}${articlePath(a)})`);
  });

  it('points only at URLs that are in the sitemap', () => {
    const sitemap = new Set(sitemapEntries().map((e) => e.loc.replace(/\/$/, '')));
    for (const m of text.matchAll(/\]\((https:\/\/[^)]+)\)/g)) {
      expect(sitemap.has(m[1].replace(/\/$/, '')), m[1]).toBe(true);
    }
  });
});
