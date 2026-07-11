/**
 * FinatriX edge Worker.
 *
 * Runs ONLY for requests that don't match a built static file — i.e. SPA
 * navigations. Its single job is to serve the app shell (`index.html`) with an
 * honest HTTP status:
 *
 *   • real client routes (`/tools/budget`, `/privacy`, …)  → 200
 *   • genuinely unknown URLs (`/nope`, `/tools/not-a-tool`) → 404
 *
 * This replaces Cloudflare's `single-page-application` fallback, which returned
 * 200 for every unmatched path (a soft-404 that dilutes search indexing and
 * fools uptime monitors). Static assets are still served directly by the assets
 * runtime with their `_headers` caching/security rules intact.
 */
import { isKnownRoute, canonicalRedirect } from '../src/shared/routes';

interface Env {
  ASSETS: { fetch: (input: Request | URL | string) => Promise<Response> };
  /** Set to the production apex (e.g. "finatrix.space") at DNS cutover to
   *  activate the 301 from legacy/www hosts. Unset = redirect inert. */
  CANONICAL_HOST?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Liveness probe first — must answer 200 on ANY host, even pre-cutover, so
    // uptime monitors work regardless of domain state.
    if (url.pathname === '/healthz') {
      return new Response(JSON.stringify({ status: 'ok', ts: Date.now() }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    // Domain migration: 301 legacy/www hosts → the canonical apex (inert until
    // CANONICAL_HOST is set). Preserves path + query for SEO equity.
    const redirect = canonicalRedirect(url.host, url.pathname + url.search, env.CANONICAL_HOST);
    if (redirect) return Response.redirect(redirect, 301);

    const known = isKnownRoute(url.pathname);

    // Fetch the SPA shell from the assets runtime (preserves its headers).
    const shell = await env.ASSETS.fetch(new URL('/index.html', url.origin));
    const headers = new Headers(shell.headers);

    return new Response(shell.body, {
      status: known ? 200 : 404,
      statusText: known ? 'OK' : 'Not Found',
      headers,
    });
  },
};
