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

  it('wrangler serves dist with SPA fallback so deep links resolve', () => {
    const wrangler = read('wrangler.jsonc');
    expect(wrangler).toContain('"not_found_handling": "single-page-application"');
    expect(wrangler).toContain('"directory": "./dist"');
  });

  it('has a CSP meta tag in index.html (headers file intentionally omits CSP)', () => {
    expect(read('index.html')).toMatch(/http-equiv="Content-Security-Policy"/);
    expect(read('public/_headers')).not.toMatch(/^\s*Content-Security-Policy:/m);
  });
});
