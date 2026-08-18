/**
 * Edge route classification — the logic behind honest HTTP 404s.
 *
 * `isKnownRoute` is what the Cloudflare Worker uses to decide whether an
 * unmatched path should serve the SPA shell as 200 (a real client route) or 404
 * (a genuinely unknown URL). These tests pin that contract so a future routing
 * change can't silently reintroduce the soft-404 the audit flagged (FX-05).
 */
import { describe, it, expect } from 'vitest';
import {
  isKnownRoute,
  TOOL_IDS,
  canonicalRedirect,
  CANONICAL_HOST,
  RESET_PASSWORD_PATH,
} from '../shared/routes';

describe('isKnownRoute', () => {
  it('treats landing, tools index, careers and legal pages as known (→ 200)', () => {
    for (const p of ['/', '/home', '/tools', '/careers', '/login', '/signup', '/welcome', '/profile', '/privacy', '/terms', '/dashboard']) {
      expect(isKnownRoute(p), p).toBe(true);
    }
  });

  // Regression: these four render real pages and are linked from the tools
  // nav, but were absent from the edge allowlist, so every one of them was
  // served HTTP 404 with the page rendered behind it.
  it('treats the signed-in tools screens as known (→ 200), not 404', () => {
    for (const p of ['/tools/dashboard', '/tools/reports', '/tools/calendar', '/tools/settings']) {
      expect(isKnownRoute(p), p).toBe(true);
    }
  });

  /**
   * The destination of every password-recovery email. It is `noindex`, so it is
   * absent from sitemap.xml and from every SEO check — nothing else in the
   * suite would notice it 404-ing. A 404 here strands someone holding a valid,
   * single-use recovery grant that expires whether or not they see a form.
   */
  it('serves the password-recovery landing 200, not 404', () => {
    expect(isKnownRoute(RESET_PASSWORD_PATH)).toBe(true);
    expect(isKnownRoute(`${RESET_PASSWORD_PATH}/`)).toBe(true);
  });

  it('matches the tool segment case-insensitively, as ToolRoute does', () => {
    expect(isKnownRoute('/tools/Budget')).toBe(true);
    expect(isKnownRoute('/tools/DASHBOARD')).toBe(true);
  });

  // Every internal link the app can render must resolve to a 200 at the edge.
  it('covers every internal link target in the source tree', () => {
    for (const p of [
      '/', '/careers', '/login', '/privacy', '/profile', '/signup', '/terms',
      '/tools', '/tools/budget', '/tools/calendar', '/tools/dashboard',
      '/tools/expenses', '/tools/goals', '/tools/investmatch', '/tools/reports',
      '/tools/settings', '/welcome',
    ]) {
      expect(isKnownRoute(p), `${p} is linked in-app but served 404`).toBe(true);
    }
  });

  it('treats every real calculator deep link as known (→ 200)', () => {
    for (const id of TOOL_IDS) {
      expect(isKnownRoute(`/tools/${id}`), id).toBe(true);
    }
  });

  it('ignores a trailing slash', () => {
    expect(isKnownRoute('/tools/budget/')).toBe(true);
    expect(isKnownRoute('/privacy/')).toBe(true);
    expect(isKnownRoute('/')).toBe(true);
  });

  it('treats careers sub-routes as known', () => {
    expect(isKnownRoute('/careers/jobs')).toBe(true);
    expect(isKnownRoute('/careers/interviews')).toBe(true);
  });

  it('returns false (→ HTTP 404) for genuinely unknown routes', () => {
    for (const p of [
      '/nope',
      '/tools/not-a-tool',
      '/tools/budget/extra',
      '/random/path',
      '/careerz',
      '/tool',
    ]) {
      expect(isKnownRoute(p), p).toBe(false);
    }
  });
});

describe('canonicalRedirect (canonical host + HTTPS enforcement)', () => {
  const TO = CANONICAL_HOST;

  it('targets finatrix.co — the one production domain', () => {
    expect(CANONICAL_HOST).toBe('finatrix.co');
  });

  it('is inert until a canonical host is configured', () => {
    expect(canonicalRedirect('finatrix.online', '/tools/budget', undefined)).toBeNull();
    expect(canonicalRedirect('finatrix.online', '/tools/budget', '')).toBeNull();
  });

  it('301s every retired domain to the canonical apex, preserving path + query', () => {
    for (const legacy of ['finatrix.online', 'www.finatrix.online', 'finatrix.space', 'www.finatrix.space']) {
      expect(canonicalRedirect(legacy, '/tools/budget?ref=x', TO), legacy)
        .toBe(`https://${TO}/tools/budget?ref=x`);
    }
  });

  it('301s www to the apex', () => {
    expect(canonicalRedirect(`www.${TO}`, '/privacy', TO)).toBe(`https://${TO}/privacy`);
    expect(canonicalRedirect(`www.${TO}`, '/', TO)).toBe(`https://${TO}/`);
  });

  it('is case-insensitive about the host', () => {
    expect(canonicalRedirect(TO.toUpperCase(), '/', TO)).toBeNull();
    expect(canonicalRedirect(`WWW.${TO.toUpperCase()}`, '/', TO)).toBe(`https://${TO}/`);
  });

  // TLS enforced in the app, not only by a dashboard toggle no test can see.
  it('upgrades plain HTTP on the canonical host to HTTPS', () => {
    expect(canonicalRedirect(TO, '/tools/goals?a=1', TO, 'http:')).toBe(`https://${TO}/tools/goals?a=1`);
    expect(canonicalRedirect(TO, '/', TO, 'https:')).toBeNull();
    expect(canonicalRedirect(TO, '/', TO)).toBeNull(); // defaults to https
  });

  // One hop, never two: http://www → https://apex directly. A chained
  // redirect leaks link equity and doubles latency on every legacy visit.
  it('resolves host and scheme in a single redirect', () => {
    const target = canonicalRedirect(`www.${TO}`, '/terms', TO, 'http:');
    expect(target).toBe(`https://${TO}/terms`);
    // Feeding the result back in must terminate immediately.
    const url = new URL(target!);
    expect(canonicalRedirect(url.host, url.pathname, TO, url.protocol)).toBeNull();
  });

  it('never redirects the canonical host, previews, or localhost', () => {
    expect(canonicalRedirect(TO, '/tools/budget', TO)).toBeNull();
    expect(canonicalRedirect('finatrix.finatrix-hub.workers.dev', '/', TO)).toBeNull();
    expect(canonicalRedirect('localhost:5173', '/', TO)).toBeNull();
    // Local dev is http by design — the HTTPS rule must not break `vite dev`.
    expect(canonicalRedirect('localhost:5173', '/', TO, 'http:')).toBeNull();
    expect(canonicalRedirect('127.0.0.1:4173', '/', TO, 'http:')).toBeNull();
  });
});
