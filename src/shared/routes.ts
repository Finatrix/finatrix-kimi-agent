/**
 * Canonical route knowledge shared between the React app, the edge Worker and
 * the test-suite. Keeping this in ONE place is what lets the Cloudflare Worker
 * return an honest HTTP status (200 for real routes, 404 for unknown URLs)
 * without drifting from the client-side router.
 *
 * Pure and framework-agnostic on purpose — no DOM, no React, no Node — so it can
 * be bundled into the edge Worker and imported by Vitest alike.
 */

/** The seven public calculators. Source of truth for the sitemap + edge 404s. */
export const TOOL_IDS = [
  'budget',
  'expenses',
  'investmatch',
  'parksmart',
  'peercompare',
  'goals',
  'lifemap',
] as const;

export type ToolId = (typeof TOOL_IDS)[number];

/** Top-level routes that resolve to a real page (mirrors App.tsx). */
const EXACT_ROUTES = new Set<string>([
  '/',
  '/home',
  '/tools',
  '/careers',
  '/login',
  '/signup',
  '/profile',
  '/privacy',
  '/terms',
]);

/**
 * Does `pathname` correspond to a real client route?
 *
 * Used at the edge to decide the HTTP status of the SPA shell. Anything that
 * returns `false` is served as a genuine 404 so search engines and uptime
 * monitors are never fooled by a soft-404.
 */
export function isKnownRoute(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (EXACT_ROUTES.has(p)) return true;

  // Individual calculator pages: only the seven real tools are valid.
  const toolMatch = p.match(/^\/tools\/([^/]+)$/);
  if (toolMatch) return (TOOL_IDS as readonly string[]).includes(toolMatch[1]);

  // Careers is a sign-in-gated app section with many sub-routes; the whole
  // subtree is "known" (the SPA renders auth / not-found within it).
  if (p === '/careers' || p.startsWith('/careers/')) return true;

  return false;
}

/**
 * Domain-migration redirect (finatrix.online → finatrix.space).
 *
 * Returns the absolute URL to 301-redirect to, or `null` to serve normally.
 * Gated on `canonicalHost`: when unset the redirect is INERT, so this can ship
 * ahead of the DNS cutover and be activated by setting the Worker's
 * `CANONICAL_HOST` var. Preview (`*.workers.dev`) and localhost are never
 * redirected, so staging and dev keep working.
 */
export function canonicalRedirect(
  host: string,
  pathAndQuery: string,
  canonicalHost: string | undefined,
): string | null {
  if (!canonicalHost) return null; // migration not activated
  const h = (host || '').toLowerCase();
  if (!h || h === canonicalHost) return null; // already canonical
  if (h.endsWith('.workers.dev') || h.startsWith('localhost') || h.startsWith('127.0.0.1')) return null;
  return `https://${canonicalHost}${pathAndQuery}`;
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
  return '/*';
}
