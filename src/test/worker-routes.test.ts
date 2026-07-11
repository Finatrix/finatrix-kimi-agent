/**
 * Edge route classification — the logic behind honest HTTP 404s.
 *
 * `isKnownRoute` is what the Cloudflare Worker uses to decide whether an
 * unmatched path should serve the SPA shell as 200 (a real client route) or 404
 * (a genuinely unknown URL). These tests pin that contract so a future routing
 * change can't silently reintroduce the soft-404 the audit flagged (FX-05).
 */
import { describe, it, expect } from 'vitest';
import { isKnownRoute, TOOL_IDS, canonicalRedirect } from '../shared/routes';

describe('isKnownRoute', () => {
  it('treats landing, tools index, careers and legal pages as known (→ 200)', () => {
    for (const p of ['/', '/home', '/tools', '/careers', '/login', '/signup', '/profile', '/privacy', '/terms']) {
      expect(isKnownRoute(p), p).toBe(true);
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

describe('canonicalRedirect (domain migration)', () => {
  const TO = 'finatrix.space';

  it('is inert until a canonical host is configured', () => {
    expect(canonicalRedirect('finatrix.online', '/tools/budget', undefined)).toBeNull();
    expect(canonicalRedirect('finatrix.online', '/tools/budget', '')).toBeNull();
  });

  it('301s legacy + www hosts to the canonical apex, preserving path + query', () => {
    expect(canonicalRedirect('finatrix.online', '/tools/budget?ref=x', TO))
      .toBe('https://finatrix.space/tools/budget?ref=x');
    expect(canonicalRedirect('www.finatrix.online', '/privacy', TO))
      .toBe('https://finatrix.space/privacy');
    expect(canonicalRedirect('www.finatrix.space', '/', TO)).toBe('https://finatrix.space/');
  });

  it('never redirects the canonical host, previews, or localhost', () => {
    expect(canonicalRedirect('finatrix.space', '/tools/budget', TO)).toBeNull();
    expect(canonicalRedirect('finatrix.finatrix-hub.workers.dev', '/', TO)).toBeNull();
    expect(canonicalRedirect('localhost:5173', '/', TO)).toBeNull();
  });
});
