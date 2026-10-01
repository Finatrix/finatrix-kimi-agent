/**
 * Regression tests for edge-function CORS — written after the
 * finatrix.online → finatrix.co migration, where a single forgotten Supabase
 * secret broke the new domain while every existing gate stayed green.
 *
 * What actually happened: each function built its allowlist as
 *
 *     Deno.env.get('CAREERS_ALLOWED_ORIGINS') ?? '<defaults naming finatrix.co>'
 *
 * `??` means the environment variable REPLACES the defaults. The secret still
 * held the retired finatrix.online list, so the correct in-repo default was
 * never evaluated and `analytics-collect` answered requests from
 * https://finatrix.co with `Access-Control-Allow-Origin: https://finatrix.online`.
 * Every analytics event, error report and web vital was rejected by the
 * browser, and the console filled with CORS errors.
 *
 * These tests pin the two properties that make that impossible to repeat:
 *   1. the canonical origins are ALWAYS allowed, whatever the environment says;
 *   2. no function reconstructs its own env-replaces-defaults allowlist.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CANONICAL_HOST } from '../shared/routes';

const ROOT = join(__dirname, '../..');
const FUNCTIONS_DIR = join(ROOT, 'supabase/functions');

/** Load `_shared/origins.ts` with a stubbed `Deno.env`, fresh each time. */
async function loadOrigins(env: Record<string, string> = {}) {
  (globalThis as { Deno?: unknown }).Deno = { env: { get: (k: string) => env[k] } };
  vi.resetModules();
  return await import('../../supabase/functions/_shared/origins.ts');
}

const req = (origin?: string) =>
  new Request('https://x.test/', { headers: origin ? { Origin: origin } : {} });

const AUTHED = { headers: 'authorization', methods: 'POST, OPTIONS', reflectAnyWebOrigin: true };
const PUBLIC = { headers: 'content-type', methods: 'POST, OPTIONS', reflectAnyWebOrigin: false };

describe('edge CORS: single source of truth', () => {
  afterEach(() => {
    delete (globalThis as { Deno?: unknown }).Deno;
  });

  it('mirrors CANONICAL_HOST from src/shared/routes', async () => {
    const origins = await loadOrigins();
    // If these drift, the edge and the app disagree about what the site IS.
    expect(origins.CANONICAL_HOST).toBe(CANONICAL_HOST);
    expect(origins.CANONICAL_ORIGIN).toBe(`https://${CANONICAL_HOST}`);
  });

  it('always allows the canonical origins, even when the secret is stale', async () => {
    // The exact production state that caused the outage.
    const { corsHeaders } = await loadOrigins({
      CAREERS_ALLOWED_ORIGINS: 'https://finatrix.online,https://www.finatrix.online',
    });
    for (const origin of [`https://${CANONICAL_HOST}`, `https://www.${CANONICAL_HOST}`]) {
      expect(corsHeaders(req(origin), PUBLIC)['Access-Control-Allow-Origin']).toBe(origin);
    }
  });

  it('treats CAREERS_ALLOWED_ORIGINS as additive, not a replacement', async () => {
    const { ALLOWED_ORIGINS } = await loadOrigins({
      CAREERS_ALLOWED_ORIGINS: 'https://staging.example.com',
    });
    expect(ALLOWED_ORIGINS).toContain('https://staging.example.com'); // granted
    expect(ALLOWED_ORIGINS).toContain(`https://${CANONICAL_HOST}`);   // never revoked
  });

  it('never advertises a retired domain when the origin is absent or malformed', async () => {
    const { corsHeaders } = await loadOrigins({
      CAREERS_ALLOWED_ORIGINS: 'https://finatrix.online',
    });
    // Previously this returned ALLOWED_ORIGINS[0] — i.e. whatever the stale
    // secret happened to list first.
    for (const bad of [undefined, 'null', 'not a url', '']) {
      expect(corsHeaders(req(bad), PUBLIC)['Access-Control-Allow-Origin'])
        .toBe(`https://${CANONICAL_HOST}`);
    }
  });

  it('reflects any web origin only for the authenticated, cookieless endpoints', async () => {
    const { corsHeaders } = await loadOrigins();
    const third = 'https://some-other-site.example';
    // careers-*: bearer-token APIs — reflection cannot enable CSRF.
    expect(corsHeaders(req(third), AUTHED)['Access-Control-Allow-Origin']).toBe(third);
    // analytics-collect: unauthenticated write — must stay strict.
    expect(corsHeaders(req(third), PUBLIC)['Access-Control-Allow-Origin'])
      .toBe(`https://${CANONICAL_HOST}`);
  });

  it('allows localhost dev origins on any port', async () => {
    const { corsHeaders } = await loadOrigins();
    for (const origin of ['http://localhost:5173', 'http://localhost:4173', 'http://127.0.0.1:3000']) {
      expect(corsHeaders(req(origin), PUBLIC)['Access-Control-Allow-Origin']).toBe(origin);
    }
  });

  it('always sets Vary: Origin so caches never cross-serve', async () => {
    const { corsHeaders } = await loadOrigins();
    expect(corsHeaders(req(`https://${CANONICAL_HOST}`), PUBLIC).Vary).toBe('Origin');
  });

  /**
   * Each app's WebView serves the bundle from a device-local origin:
   * `https://localhost` on Android, `capacitor://localhost` on iOS (WKWebView
   * refuses to let a scheme handler take `https`, so the two cannot match).
   * Before the Android origin was allow-listed, every analytics beacon from the
   * app died in CORS on the emulator — including when a stale secret replaces
   * nothing, which is the same failure this file exists for. iOS is one line
   * away from repeating it, so both are pinned here.
   */
  it('allows both app origins on the strict, credentialed analytics allowlist', async () => {
    const { corsHeaders, NATIVE_APP_ORIGIN, IOS_APP_ORIGIN, NATIVE_APP_ORIGINS } = await loadOrigins({
      CAREERS_ALLOWED_ORIGINS: 'https://finatrix.online',
    });
    expect(NATIVE_APP_ORIGIN).toBe('https://localhost');
    expect(IOS_APP_ORIGIN).toBe('capacitor://localhost');
    expect(NATIVE_APP_ORIGINS).toEqual([NATIVE_APP_ORIGIN, IOS_APP_ORIGIN]);
    for (const origin of NATIVE_APP_ORIGINS) {
      const h = corsHeaders(req(origin), { ...PUBLIC, allowCredentials: true });
      expect(h['Access-Control-Allow-Origin']).toBe(origin);
      expect(h['Access-Control-Allow-Credentials']).toBe('true');
    }
    // Only those exact origins — not another port, not a lookalike host, and not
    // some other app's custom scheme. (Plain http://localhost is the separate
    // dev-server rule, isLocalOrigin.)
    const near = [
      'https://localhost:8443',
      'https://localhost.evil.example',
      'capacitor://localhost:8443',
      'capacitor://evil.example',
      'ionic://localhost',
    ];
    for (const origin of near) {
      expect(corsHeaders(req(origin), { ...PUBLIC, allowCredentials: true })['Access-Control-Allow-Credentials'])
        .toBeUndefined();
    }
  });

  it('does not reflect a custom scheme on the authenticated endpoints either', async () => {
    const { corsHeaders } = await loadOrigins();
    // reflectAnyWebOrigin means WEB origins. A custom scheme that is not one of
    // the app origins gets the canonical fallback, not itself.
    expect(corsHeaders(req('capacitor://someone-elses-app'), AUTHED)['Access-Control-Allow-Origin'])
      .toBe(`https://${CANONICAL_HOST}`);
  });

  it('never makes an app origin a Stripe return target', async () => {
    const { isNativeAppOrigin } = await loadOrigins();
    expect(isNativeAppOrigin('https://localhost')).toBe(true);
    expect(isNativeAppOrigin('capacitor://localhost')).toBe(true);
    expect(isNativeAppOrigin(`https://${CANONICAL_HOST}`)).toBe(false);
    // Allow-listing the iOS origin for CORS would otherwise have made
    // `capacitor://localhost/careers/billing` a Stripe success_url.
    const src = readFileSync(join(FUNCTIONS_DIR, 'careers-billing-checkout', 'index.ts'), 'utf8');
    expect(src).toMatch(/const returnOrigin = !isNativeAppOrigin\(origin\) &&/);
  });
});

describe('edge CORS: no function rebuilds its own allowlist', () => {
  const allEntries = readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => ({ name: d.name, entry: join(FUNCTIONS_DIR, d.name, 'index.ts') }))
    .filter((d) => existsSync(d.entry));

  it('finds the deployed functions', () => {
    expect(allEntries.length).toBeGreaterThanOrEqual(4);
  });

  // No retired domain may appear in ANY shipped edge source — this applies
  // even to server-to-server functions that skip CORS entirely (below),
  // since a stray domain string is a drift bug regardless of caller.
  it.each(allEntries)('$name: no retired domain in shipped source', ({ entry }) => {
    const src = readFileSync(entry, 'utf8');
    for (const retired of ['finatrix.online', 'finatrix.space', 'netlify.app']) {
      expect(src).not.toContain(retired);
    }
  });

  // Webhooks (careers-billing-webhook) are called server-to-server by the
  // provider (Stripe) — no browser Origin header, no preflight, so CORS is
  // not applicable and there is no allowlist to drift. Everything else is a
  // browser-facing endpoint and must go through the shared origins module.
  const browserFacing = allEntries.filter((d) => !d.name.endsWith('-webhook'));

  it.each(browserFacing)('$name: reads the shared origins module', ({ entry }) => {
    const src = readFileSync(entry, 'utf8');
    expect(src).toContain("_shared/origins.ts");
    // The precise shape of the bug: env var `??` inline defaults.
    expect(src).not.toMatch(/Deno\.env\.get\(['"]CAREERS_ALLOWED_ORIGINS['"]\)\s*\?\?/);
  });
});

/**
 * `navigator.sendBeacon` fixes the request's credentials mode to "include" and
 * offers no way to change it, so the CORS check fails unless the response
 * carries `Access-Control-Allow-Credentials: true`. On production this dropped
 * every analytics beacon in Firefox (NS_ERROR_DOM_BAD_URI) and WebKit
 * ("Credentials flag is true, but Access-Control-Allow-Credentials is not
 * 'true'") — silently, because sendBeacon reports success on queueing and the
 * endpoint answers a server-side POST with 204.
 */
describe('edge CORS: credentialed beacons', () => {
  afterEach(() => {
    delete (globalThis as { Deno?: unknown }).Deno;
  });

  it('sends Allow-Credentials for a permitted origin', async () => {
    const { corsHeaders } = await loadOrigins();
    const h = corsHeaders(req(`https://${CANONICAL_HOST}`), { ...PUBLIC, allowCredentials: true });
    expect(h['Access-Control-Allow-Credentials']).toBe('true');
    expect(h['Access-Control-Allow-Origin']).toBe(`https://${CANONICAL_HOST}`);
  });

  it('never advertises credentials to an origin it is refusing', async () => {
    const { corsHeaders } = await loadOrigins();
    const h = corsHeaders(req('https://evil.example'), { ...PUBLIC, allowCredentials: true });
    expect(h['Access-Control-Allow-Credentials']).toBeUndefined();
  });

  it('omits the header entirely when not requested', async () => {
    const { corsHeaders } = await loadOrigins();
    const h = corsHeaders(req(`https://${CANONICAL_HOST}`), PUBLIC);
    expect(h['Access-Control-Allow-Credentials']).toBeUndefined();
  });

  /** Credentials + an arbitrarily reflected origin is a same-origin bypass. */
  it('refuses to combine credentials with open origin reflection', async () => {
    const { corsHeaders } = await loadOrigins();
    expect(() =>
      corsHeaders(req('https://evil.example'), { ...AUTHED, allowCredentials: true }),
    ).toThrow(/cannot be combined/i);
  });

  it('analytics-collect asks for credentials; no authed function does', async () => {
    const read = (slug: string) =>
      readFileSync(join(FUNCTIONS_DIR, slug, 'index.ts'), 'utf8');
    expect(read('analytics-collect')).toMatch(/allowCredentials:\s*true/);
    for (const slug of readdirSync(FUNCTIONS_DIR)) {
      if (slug === '_shared' || slug === 'analytics-collect') continue;
      if (!existsSync(join(FUNCTIONS_DIR, slug, 'index.ts'))) continue;
      expect(read(slug), `${slug} must not allow credentials`).not.toMatch(/allowCredentials:\s*true/);
    }
  });
});
