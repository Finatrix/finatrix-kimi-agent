/**
 * sitemap.xml is generated (`npm run sitemap`) and committed. These tests are
 * what make "generated" mean something: the committed bytes must equal what the
 * generator produces today, so adding a public page and forgetting to re-run it
 * fails here instead of shipping a sitemap that omits the new page.
 *
 * The previous version of this file could only check that the URLs already
 * listed were indexable — it had no way to notice a public page that was simply
 * missing, which is the failure that actually costs traffic.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSitemap } from '../shared/sitemap';
import { PUBLIC_PAGE_PATHS } from '../shared/publicPages';
import { TOOL_IDS } from '../shared/routes';
import { CANONICAL_ORIGIN, seoForPath, INDEXABLE } from '../lib/seo';

const COMMITTED = readFileSync(join(__dirname, '..', '..', 'public', 'sitemap.xml'), 'utf8');
const locs = () => [...COMMITTED.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

describe('sitemap.xml', () => {
  it('matches what the generator produces — run `npm run sitemap`', () => {
    expect(COMMITTED).toBe(buildSitemap());
  });

  it('lists the homepage, every calculator and every public page', () => {
    const listed = new Set(locs().map((l) => new URL(l).pathname.replace(/\/$/, '') || '/'));
    expect(listed.has('/')).toBe(true);
    for (const id of TOOL_IDS) expect(listed.has(`/tools/${id}`), id).toBe(true);
    for (const p of PUBLIC_PAGE_PATHS) expect(listed.has(p), p).toBe(true);
  });

  it('lists nothing that is noindex or not self-canonical', () => {
    for (const loc of locs()) {
      const path = new URL(loc).pathname;
      const seo = seoForPath(path);
      expect(seo.robots, `${path} must be indexable`).toBe(INDEXABLE);
      const expected = path === '/' ? `${CANONICAL_ORIGIN}/` : `${CANONICAL_ORIGIN}${path.replace(/\/+$/, '')}`;
      expect(seo.canonical, `${path} must be self-canonical`).toBe(expected);
    }
  });

  it('omits /tools, which only ever redirects', () => {
    expect(locs()).not.toContain(`${CANONICAL_ORIGIN}/tools`);
  });

  it('uses the canonical apex for every URL', () => {
    for (const loc of locs()) {
      expect(loc.startsWith(`${CANONICAL_ORIGIN}/`), loc).toBe(true);
    }
  });

  it('has no duplicate entries', () => {
    const all = locs();
    expect(new Set(all).size).toBe(all.length);
  });

  it('is pointed at by robots.txt', () => {
    const robots = readFileSync(join(__dirname, '..', '..', 'public', 'robots.txt'), 'utf8');
    expect(robots).toContain(`Sitemap: ${CANONICAL_ORIGIN}/sitemap.xml`);
  });
});
