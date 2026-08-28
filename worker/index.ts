/**
 * FinatriX edge Worker. Three jobs:
 *
 * 1. Canonical host + HTTPS. Everything that is not `https://finatrix.co` —
 *    `www`, the retired finatrix.online / finatrix.space domains, any plain
 *    HTTP request — is 301'd here in a single hop.
 *
 * 2. Per-route SEO metadata in the SERVED HTML (see `withSeoMetadata`).
 *
 * 3. An honest HTTP status for SPA navigations:
 *      • real client routes (`/tools/budget`, `/privacy`, …)  → 200
 *      • genuinely unknown URLs (`/nope`, `/tools/not-a-tool`) → 404
 *    This replaces Cloudflare's `single-page-application` fallback, which
 *    returned 200 for every unmatched path — a soft-404 that dilutes search
 *    indexing and fools uptime monitors.
 *
 * Ordering matters, and is the reason `run_worker_first` is set in
 * wrangler.jsonc for document paths. By default the static-assets runtime
 * answers any request that matches a built file BEFORE the Worker is invoked,
 * so `https://www.finatrix.co/` was served the homepage directly and the
 * canonical redirect never ran on the single most important URL on the site —
 * while `/tools/budget`, which matches no file, redirected correctly. The
 * inconsistency is invisible in any test that only exercises deep links.
 *
 * With the Worker running first, it must hand real files back to the assets
 * runtime itself (`serveAsset` below), which keeps `public/_headers` — CSP,
 * HSTS, immutable caching — applied exactly as before. The high-volume
 * fingerprinted paths (`/assets/*`, `/fonts/*`, …) are excluded from
 * `run_worker_first`, so they still bypass the Worker entirely: they are only
 * ever requested by a document that has already been canonicalised, so
 * redirecting them would cost an invocation per asset and change nothing.
 */
import { CANONICAL_HOST, isKnownRoute, canonicalRedirect } from '../src/shared/routes';
import { topicSlugForContentPath } from '../src/shared/content';
import { loadTopicContent } from '../src/content';
import type { TopicContent } from '../src/content/types';
import {
  CANONICAL_ORIGIN,
  ROUTE_SCHEMA_ID,
  seoForPath,
  serialiseJsonLd,
  structuredDataForPath,
} from '../src/lib/seo';

interface Env {
  ASSETS: { fetch: (input: Request | URL | string) => Promise<Response> };
  /** Canonical production apex. Defaults to `CANONICAL_HOST` from
   *  src/shared/routes so a deploy is correct with no vars set at all; the
   *  Worker var stays as an override (set it to "" to make redirects inert,
   *  e.g. while a new domain's DNS is still propagating). */
  CANONICAL_HOST?: string;
}

/**
 * Security headers for responses the Worker generates itself. Asset responses
 * get theirs from `public/_headers`, but redirects and `/healthz` never touch
 * the assets runtime, so without this they would ship bare — including the
 * 301 that every visitor to a legacy domain receives, which is precisely the
 * response that most needs to carry HSTS.
 */
const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

/**
 * Minimal local typing for the Workers `HTMLRewriter` global.
 *
 * Declared here rather than pulled in via `@cloudflare/workers-types` on
 * purpose: this is the only Workers-specific global the file touches, and a
 * dependency whose whole job is to type one constructor is not worth the
 * install and version-drift cost. Typed as possibly-undefined because it really
 * is absent outside the Workers runtime — Vitest imports this module — and that
 * makes the guard in `withSeoMetadata` type-checked rather than defensive
 * folklore.
 */
interface RewriterElement {
  setAttribute(name: string, value: string): void;
  /** Replaces the element's children. `html: false` escapes the value as text. */
  setInnerContent(content: string, options?: { html: boolean }): void;
}
interface RewriterInstance {
  on(selector: string, handler: { element(element: RewriterElement): void }): RewriterInstance;
  transform(response: Response): Response;
}
declare const HTMLRewriter: (new () => RewriterInstance) | undefined;

/**
 * Sets one attribute on every element a selector matches. Deliberately dumb:
 * the tags it targets already exist in `index.html`, so this only ever rewrites
 * a value and never changes the document's structure — the served markup and
 * the hydrated markup stay identical, which is what keeps React from having to
 * reconcile a difference it did not create.
 *
 * Written with explicit fields rather than constructor parameter properties:
 * `erasableSyntaxOnly` is on, and parameter properties are not erasable.
 */
class SetAttribute {
  private readonly attr: string;
  private readonly value: string;

  constructor(attr: string, value: string) {
    this.attr = attr;
    this.value = value;
  }

  element(element: RewriterElement): void {
    element.setAttribute(this.attr, this.value);
  }
}

/**
 * Replaces an element's text content. Used for the two head nodes whose value
 * is their CHILDREN rather than an attribute: `<title>` and the per-route
 * JSON-LD data block.
 */
class SetText {
  private readonly value: string;
  /** JSON-LD is pre-escaped by `serialiseJsonLd`; `<title>` must be escaped here. */
  private readonly asHtml: boolean;

  constructor(value: string, asHtml = false) {
    this.value = value;
    this.asHtml = asHtml;
  }

  element(element: RewriterElement): void {
    element.setInnerContent(this.value, { html: this.asHtml });
  }
}

/** Is this a response we should be parsing as an HTML document? */
function isHtmlDocument(response: Response): boolean {
  return (response.headers.get('Content-Type') ?? '').toLowerCase().includes('text/html');
}

/**
 * Rewrite the SEO-critical metadata of the SPA shell for the route being served.
 *
 * Every client route is served the same `index.html`, whose static
 * `<link rel="canonical">` names the HOMEPAGE. `applySeo` in src/lib/seo.ts
 * corrects that after mount — but only for a client that executes JavaScript.
 * Googlebot renders and would see the corrected value; Bing, Slack/WhatsApp
 * link unfurlers, and every other consumer of the raw HTML would not, and were
 * being told that all seven calculator pages — the entire organic surface, and
 * the only URLs in sitemap.xml — canonicalise to `/`. That is an explicit
 * instruction to consolidate them, which is precisely what the client-side fix
 * was written to prevent.
 *
 * The values come from `seoForPath`, the SAME pure function the client calls,
 * so the two can never disagree; the client-side pass remains in place and is
 * now a no-op reapplication on first load, plus the only thing that updates the
 * tags on a client-side navigation (where no new document is ever served).
 *
 * `HTMLRewriter` is a Workers runtime global. Under Vitest it does not exist,
 * so this degrades to returning the response untouched rather than throwing —
 * the shell is still served, exactly as it was before this function existed.
 */
function withSeoMetadata(
  response: Response,
  pathname: string,
  copy: TopicContent | null = null,
): Response {
  if (typeof HTMLRewriter === 'undefined') return response;

  const {
    canonical, robots, title, description, socialDescription, image, imageAlt,
  } = seoForPath(pathname);
  // Mirrors applySeo: a non-indexable route points at the site root rather than
  // at itself, because a self-canonical on a noindex page is contradictory.
  const href = canonical ?? `${CANONICAL_ORIGIN}/`;
  const schema = serialiseJsonLd(structuredDataForPath(pathname, copy));

  // The body is about to change, so the validator that described the ORIGINAL
  // index.html no longer describes it. Content-Length would be plain wrong;
  // ETag would be worse — identical across routes whose bodies now differ,
  // which is exactly the input a cache needs to serve one route's HTML for
  // another. Dropping both leaves Cache-Control from _headers in charge.
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.delete('ETag');

  return new HTMLRewriter()
    .on('link[rel="canonical"]', new SetAttribute('href', href))
    .on('meta[property="og:url"]', new SetAttribute('content', href))
    .on('meta[name="robots"]', new SetAttribute('content', robots))
    // Title + description. Without these every one of the calculators
    // was served the landing page's title and description in its raw bytes, so
    // they competed with each other for one identical snippet in the SERP and
    // every WhatsApp/Slack/X unfurl of a tool link rendered the landing card.
    .on('title', new SetText(title))
    .on('meta[name="description"]', new SetAttribute('content', description))
    .on('meta[property="og:title"]', new SetAttribute('content', title))
    .on('meta[property="og:description"]', new SetAttribute('content', socialDescription))
    .on('meta[name="twitter:title"]', new SetAttribute('content', title))
    .on('meta[name="twitter:description"]', new SetAttribute('content', socialDescription))
    // The card image. Link unfurlers read the raw bytes and never execute the
    // client-side pass, so for THIS tag the Worker is not a belt-and-braces
    // duplicate of applySeo — it is the only thing that ever runs.
    .on('meta[property="og:image"]', new SetAttribute('content', image))
    .on('meta[property="og:image:alt"]', new SetAttribute('content', imageAlt))
    .on('meta[name="twitter:image"]', new SetAttribute('content', image))
    .on('meta[name="twitter:image:alt"]', new SetAttribute('content', imageAlt))
    // Per-route structured data. `html: true` because the JSON has already been
    // escaped by `serialiseJsonLd` and must not be entity-encoded a second time
    // — that would leave `&quot;` inside the block and make it unparseable.
    .on(`script#${ROUTE_SCHEMA_ID}`, new SetText(schema, true))
    .transform(new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const canonicalHost = env.CANONICAL_HOST ?? CANONICAL_HOST;

    // Liveness probe first — must answer 200 on ANY host, even mid-cutover, so
    // uptime monitors work regardless of domain state.
    if (url.pathname === '/healthz') {
      return new Response(JSON.stringify({ status: 'ok', host: url.host, ts: Date.now() }), {
        status: 200,
        headers: {
          ...SECURITY_HEADERS,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    }

    // Canonical host + HTTPS enforcement: 301 www / legacy domains / plain HTTP
    // → https://<canonical>. Preserves path + query so link equity and deep
    // links survive the hop.
    const redirect = canonicalRedirect(
      url.host,
      url.pathname + url.search,
      canonicalHost,
      url.protocol,
    );
    if (redirect) {
      return new Response(null, {
        status: 301,
        headers: {
          ...SECURITY_HEADERS,
          Location: redirect,
          // A permanent redirect is cacheable, but keep it short enough that a
          // mistake is recoverable within a day rather than a browser lifetime.
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // Because the Worker now runs BEFORE the assets runtime on document paths,
    // it has to hand real files back to it. `not_found_handling: "none"` makes
    // the binding answer 404 for anything that is not a built file, which is
    // exactly the signal needed to tell "this is /robots.txt" apart from "this
    // is a client route". Returning the asset response untouched is what keeps
    // public/_headers (CSP, HSTS, immutable caching) intact.
    /**
     * The knowledge layer's editorial chunk for this URL, if it needs one.
     *
     * Resolved through the SAME `LOADERS` map the browser uses, rather than a
     * second list of module paths for the edge — one registry, two bundlers. In
     * the browser this is real code-splitting; the Workers build inlines the
     * dynamic imports into one module, so at the edge it is a memory lookup
     * after the first request.
     *
     * This is what puts `FAQPage`, `DefinedTermSet` and the article `abstract`
     * into the SERVED bytes, for the consumers that never run JavaScript: link
     * unfurlers, Bing, and most AI answer engines. See `structuredDataForPath`.
     */
    const topicSlug = topicSlugForContentPath(url.pathname);
    const copy = topicSlug ? await loadTopicContent(topicSlug) : null;

    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) {
      // `/` and `/index.html` match a built file, so they are served from here
      // rather than by the SPA branch below — they need the same per-route
      // metadata treatment. Everything else (robots.txt, sitemap.xml, images)
      // is not an HTML document and is handed back byte-for-byte, which is what
      // keeps its _headers content-type and immutable caching intact.
      return asset.status === 200 && isHtmlDocument(asset)
        ? withSeoMetadata(asset, url.pathname, copy)
        : asset;
    }

    const known = isKnownRoute(url.pathname);

    // No file matched: this is an SPA navigation. Serve the shell with a status
    // that tells the truth about whether the route exists, and with the
    // canonical/og:url/robots of the route actually requested rather than
    // index.html's homepage defaults.
    const shell = await env.ASSETS.fetch(new URL('/index.html', url.origin));
    return withSeoMetadata(
      new Response(shell.body, {
        status: known ? 200 : 404,
        statusText: known ? 'OK' : 'Not Found',
        headers: new Headers(shell.headers),
      }),
      url.pathname,
      copy,
    );
  },
};
