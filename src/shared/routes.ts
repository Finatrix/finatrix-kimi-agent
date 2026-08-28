/**
 * Canonical route knowledge shared between the React app, the edge Worker and
 * the test-suite. Keeping this in ONE place is what lets the Cloudflare Worker
 * return an honest HTTP status (200 for real routes, 404 for unknown URLs)
 * without drifting from the client-side router.
 *
 * Pure and framework-agnostic on purpose — no DOM, no React, no Node — so it can
 * be bundled into the edge Worker and imported by Vitest alike.
 */

import { LEARN_ROOT, isContentPath } from './content';
import { TOOL_IDS } from './toolCount';
import { PUBLIC_PAGE_PATHS } from './publicPages';

/**
 * The one canonical production host. Everything else — `www`, the retired
 * finatrix.online / finatrix.space domains, and any plain-HTTP request — is
 * 301'd here by the edge Worker, and this is the origin the client advertises
 * in `<link rel="canonical">` / `og:url`.
 *
 * Single source of truth on purpose: the previous migration kept the host in
 * the Worker var, the SEO module, the sitemap and four edge functions
 * independently, and they drifted.
 */
export const CANONICAL_HOST = 'finatrix.co';

/**
 * The public calculators. Source of truth for the sitemap + edge 404s.
 *
 * The list itself lives in `toolCount.ts` and is re-exported here unchanged, so
 * every existing importer keeps working. It moved because the marketing copy
 * needs the COUNT and cannot import this module (`routes.ts` imports
 * `publicPages.ts`, which is where much of that copy lives) — and a count
 * written into prose by hand is a count that goes stale, which is exactly what
 * had happened: nineteen sentences still said "seven".
 */
export { TOOL_IDS, TOOL_COUNT, TOOL_COUNT_WORD, TOOL_COUNT_WORD_CAP } from './toolCount';
export type { ToolId } from './toolCount';

/**
 * Signed-in `/tools/*` pages that are NOT public calculators: the personalised
 * hub and the three workspace screens (`ToolRoute.tsx`). They render real pages
 * and are linked from the tools nav, so the edge must answer 200 — but they are
 * deliberately absent from TOOL_IDS, which stays the indexable/sitemap
 * allowlist, so `seoForPath` keeps returning `noindex` for every one of them.
 *
 * They were previously missing here, so every one of them was served HTTP 404
 * with the page rendered behind it — a broken status on a link the app's own
 * navigation offers.
 */
const APP_TOOL_ROUTES = ['dashboard', 'reports', 'calendar', 'settings'] as const;

/**
 * Where a Supabase password-recovery link lands.
 *
 * A constant rather than a literal because three places have to agree on it and
 * two of them are invisible from the third: `AuthContext.resetPassword` puts it
 * in the `redirectTo` GoTrue is asked to honour, `App.tsx` routes it, and this
 * module is what makes the edge Worker answer 200 for it. A mismatch between
 * the first and the last is the worst of the three — the link works, GoTrue
 * establishes the session, and the user is served a 404 while holding a valid
 * recovery grant.
 */
export const RESET_PASSWORD_PATH = '/reset-password';

/**
 * Top-level routes that resolve to a real page (mirrors App.tsx).
 *
 * The public marketing/trust/legal surface is folded in from `publicPages.ts`
 * rather than restated: those URLs are indexable and sit in sitemap.xml, so
 * serving any of them a 404 from the edge would be the most damaging possible
 * version of this list being out of date.
 */
const EXACT_ROUTES = new Set<string>([
  '/',
  '/home',
  '/tools',
  '/login',
  '/signup',
  RESET_PASSWORD_PATH,
  '/welcome',
  '/profile',
  '/dashboard', // redirects to /tools/dashboard
  ...PUBLIC_PAGE_PATHS,
]);

/**
 * Does `pathname` correspond to a real client route?
 *
 * Used at the edge to decide the HTTP status of the SPA shell. Anything that
 * returns `false` is served as a genuine 404 so search engines and uptime
 * monitors are never fooled by a soft-404. The inverse matters just as much:
 * a route the app really renders must never be served 404, or bookmarks,
 * monitors and link checkers all report a live page as dead.
 */
export function isKnownRoute(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (EXACT_ROUTES.has(p)) return true;

  // /tools/<id>: the public calculators plus the signed-in app screens.
  const toolMatch = p.match(/^\/tools\/([^/]+)$/);
  if (toolMatch) {
    const id = toolMatch[1].toLowerCase(); // ToolRoute lower-cases the param
    return (TOOL_IDS as readonly string[]).includes(id)
      || (APP_TOOL_ROUTES as readonly string[]).includes(id);
  }

  // Careers is a sign-in-gated app section with many sub-routes; the whole
  // subtree is "known" (the SPA renders auth / not-found within it).
  if (p === '/careers' || p.startsWith('/careers/')) return true;

  // The knowledge layer is an EXACT allowlist, unlike /careers above, and the
  // difference is deliberate. Careers renders a real app behind a gate for any
  // sub-path, so 200 is honest there. `/learn/*` is a finite set of published
  // URLs: anything outside it — a mistyped slug, a link to a guide that was
  // never written, a crawler probing for a pattern — has no page behind it and
  // must answer 404, or every typo becomes a soft 404 competing with the real
  // article for the same query.
  if (isContentPath(p)) return true;

  return false;
}

/**
 * Canonical-host + HTTPS enforcement, evaluated at the edge.
 *
 * Returns the absolute URL to 301-redirect to, or `null` to serve normally.
 * Two things force a redirect:
 *
 *   1. a non-canonical host — `www.finatrix.co`, or either retired domain
 *      (finatrix.online / finatrix.space) while its DNS still points here;
 *   2. a plain-HTTP request on the canonical host, so TLS is enforced in the
 *      application itself and not only by a Cloudflare dashboard toggle that
 *      no test can see.
 *
 * Path and query are always preserved, so link equity and deep links survive
 * the hop. Exactly ONE redirect ever occurs: http://www.finatrix.co/x goes
 * straight to https://finatrix.co/x, never via an intermediate.
 *
 * Gated on `canonicalHost`: when unset the whole thing is INERT, which is what
 * lets the code ship ahead of a DNS cutover. Preview (`*.workers.dev`) and
 * localhost are never touched, so staging and `vite dev` keep working — and
 * localhost is exempt from the HTTPS rule for the same reason.
 */
export function canonicalRedirect(
  host: string,
  pathAndQuery: string,
  canonicalHost: string | undefined,
  protocol: string = 'https:',
): string | null {
  if (!canonicalHost) return null; // migration not activated
  const h = (host || '').toLowerCase();
  if (!h) return null;
  if (h.endsWith('.workers.dev') || h.startsWith('localhost') || h.startsWith('127.0.0.1')) return null;

  const target = `https://${canonicalHost}${pathAndQuery}`;
  if (h !== canonicalHost.toLowerCase()) return target;      // wrong host
  if (protocol.replace(/:$/, '') !== 'https') return target;  // right host, no TLS
  return null;
}

/**
 * Normalise a pathname to a low-cardinality route *template* for analytics —
 * e.g. `/tools/budget` → `/tools/:tool`, `/careers/jobs` → `/careers/:section`.
 * Individual IDs are collapsed and any unknown path becomes `/*`, so no raw URL
 * or query string is ever recorded. Never returns PII.
 */
export function routeTemplate(pathname: string): string {
  const p = (pathname || '/').split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  if (EXACT_ROUTES.has(p)) return p;
  if (/^\/tools\/[^/]+$/.test(p)) return '/tools/:tool';
  if (/^\/careers\/[^/]+$/.test(p)) return '/careers/:section';
  // `/learn` is not in EXACT_ROUTES on purpose: `content.ts` is the single
  // owner of which knowledge-layer URLs exist, and restating the root here
  // would give it a second one.
  if (p === LEARN_ROOT) return LEARN_ROOT;
  // Two templates, not one: a topic hub and an article behave differently
  // enough — entry point versus destination — that collapsing them would hide
  // the only thing the knowledge layer's analytics need to answer.
  if (/^\/learn\/[^/]+$/.test(p)) return '/learn/:topic';
  if (/^\/learn\/[^/]+\/[^/]+$/.test(p)) return '/learn/:topic/:slug';
  return '/*';
}
