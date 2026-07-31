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
