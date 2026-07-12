/**
 * Deploy-configuration regression tests.
 *
 * These guard launch-critical config that no runtime test would ever touch:
 * the fiantrix.online domain typo that shipped in three files (P1 audit
 * blocker), the Cloudflare security headers, and the SPA fallback without
 * which every deep link 404s in production.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TOOL_IDS } from '../shared/routes';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

function textFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, dir))) {
    const rel = join(dir, name);
    if (statSync(join(root, rel)).isDirectory()) out.push(...textFilesUnder(rel));
    else if (/\.(html|xml|txt|webmanifest|json|jsonc|md)$/.test(name)) out.push(rel);
  }
  return out;
}

describe('deploy configuration', () => {
  it('contains no occurrence of the fiantrix.online domain typo anywhere public-facing', () => {
    for (const f of ['index.html', ...textFilesUnder('public')]) {
      expect(read(f), `${f} contains the fiantrix typo`).not.toMatch(/fiantrix/i);
    }
  });

  it('canonical, sitemap and robots all agree on https://finatrix.online', () => {
    expect(read('index.html')).toContain('<link rel="canonical" href="https://finatrix.online/" />');
    expect(read('public/robots.txt')).toContain('Sitemap: https://finatrix.online/sitemap.xml');
    expect(read('public/sitemap.xml')).toContain('<loc>https://finatrix.online/</loc>');
  });

  it('sitemap lists every public calculator route (the acquisition surface)', () => {
    const sitemap = read('public/sitemap.xml');
    for (const t of TOOL_IDS) {
      expect(sitemap, `sitemap is missing /tools/${t}`).toContain(
        `<loc>https://finatrix.online/tools/${t}</loc>`,
      );
    }
  });

  it('ships the Cloudflare security headers', () => {
    const headers = read('public/_headers');
    for (const h of [
      'X-Content-Type-Options: nosniff',
      'X-Frame-Options: SAMEORIGIN',
      'Referrer-Policy: strict-origin-when-cross-origin',
      'Strict-Transport-Security:',
      'Permissions-Policy:',
    ]) {
      expect(headers).toContain(h);
    }
    expect(headers).toContain('Cache-Control: public, max-age=31536000, immutable');
  });

  it('wrangler serves dist through a Worker that returns real 404s for unknown routes', () => {
    const wrangler = read('wrangler.jsonc');
    expect(wrangler).toContain('"directory": "./dist"');
    expect(wrangler).toContain('"main": "worker/index.ts"');
    expect(wrangler).toContain('"binding": "ASSETS"');
    // The soft-404 SPA fallback must be gone — the Worker owns status codes now.
    expect(wrangler).toContain('"not_found_handling": "none"');
    expect(wrangler).not.toContain('single-page-application');
  });

  it('delivers the production CSP header on document responses, in sync with the meta CSP', () => {
    const html = read('index.html');
    expect(html).toMatch(/http-equiv="Content-Security-Policy"/);
    const metaPolicy = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1];
    expect(metaPolicy).toBeTruthy();

    const headers = read('public/_headers');
    const headerPolicies = [...headers.matchAll(/^\s*Content-Security-Policy: (.+)$/gm)].map((m) => m[1]);
    // One header per document path ("/" and "/index.html"; the SPA Worker
    // copies /index.html's headers onto every client-route navigation).
    expect(headerPolicies).toHaveLength(2);
    for (const policy of headerPolicies) {
      // Byte-identical to the meta policy (differing CSPs enforce their
      // intersection), plus frame-ancestors, which meta CSP cannot express.
      expect(policy).toBe(`${metaPolicy}; frame-ancestors 'self'`);
    }
    // CSP must never apply to /* — it would break WASM inside the
    // self-hosted OCR worker (workers read CSP from their own response).
    const starBlock = headers.split(/^\/(?:\S*)$/m)[1] ?? '';
    expect(starBlock).not.toContain('Content-Security-Policy');
  });
});

describe('observability wiring', () => {
  it('the edge Worker exposes a /healthz liveness probe', () => {
    expect(read('worker/index.ts')).toContain("'/healthz'");
  });

  it('the analytics table denies client writes and restricts reads to admins', () => {
    const sql = read('supabase/analytics_schema.sql');
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('analytics_events_admin_select');
    // No insert/update/delete policy → PostgREST denies direct client writes.
    expect(sql).not.toMatch(/for insert/i);
    // Retention function must be present.
    expect(sql).toContain('prune_analytics_events');
  });

  it('the analytics ingest re-validates the event allowlist and never stores IP', () => {
    const fn = read('supabase/functions/analytics-collect/index.ts');
    expect(fn).toContain('ALLOWED_EVENTS'); // server-side re-validation (never trust client)
    expect(fn).toContain('CF-Connecting-IP'); // IP read for rate-limiting…
    // …but the inserted row object has no `ip` field (session_id/event/props/client_t only).
    expect(fn).not.toContain('ip:');
  });
});
