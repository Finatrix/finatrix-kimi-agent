/**
 * sitemap.xml, built from the same registries the app and the edge Worker read.
 *
 * The file used to be hand-maintained, which meant every new public page had to
 * be remembered in three places — the router, `seoForPath` and this XML — and
 * the only thing enforcing agreement was a test that checked the URLs already
 * listed were indexable. It could not catch the failure that actually matters:
 * a public page that exists, is indexable, and is simply MISSING from the
 * sitemap. Generating the file from `TOOL_IDS` + `PUBLIC_PAGES` makes that
 * impossible by construction, and `sitemap.test.ts` fails if the committed file
 * has drifted from what this function produces.
 *
 * Pure string building — no fs, no DOM — so the test can compare against it
 * directly and `scripts/generate-sitemap.mjs` can write it.
 */

import { CONTENT_SITEMAP } from './content';
import { PUBLIC_PAGES } from './publicPages';
import { CANONICAL_HOST, TOOL_IDS } from './routes';

const ORIGIN = `https://${CANONICAL_HOST}`;

interface SitemapEntry {
  loc: string;
  changefreq: string;
  priority: number;
  /** W3C date (YYYY-MM-DD). Omitted where we have no honest value for it. */
  lastmod?: string;
}

/**
 * Every URL that belongs in the sitemap, in the order it is written.
 *
 * `/tools` is deliberately absent: it renders `ToolsIndex`, which always
 * redirects to `/tools/dashboard`, and a sitemap entry pointing at a pure
 * redirect is reported "Page with redirect — excluded". Nothing that is
 * `noindex` appears either; `sitemap.test.ts` asserts both directions.
 */
export function sitemapEntries(): SitemapEntry[] {
  return [
    { loc: `${ORIGIN}/`, changefreq: 'weekly', priority: 1.0 },
    ...TOOL_IDS.map((id) => ({
      loc: `${ORIGIN}/tools/${id}`,
      changefreq: 'monthly',
      priority: 0.8,
    })),
    ...PUBLIC_PAGES.map((page) => ({
      loc: `${ORIGIN}${page.path}`,
      changefreq: page.changefreq,
      priority: page.priority,
      lastmod: page.updated,
    })),
    // The knowledge layer, in hierarchy order — hub, then each topic followed
    // by its own articles. See the note on `CONTENT_SITEMAP`.
    ...CONTENT_SITEMAP.map((row) => ({
      loc: `${ORIGIN}${row.path}`,
      changefreq: row.changefreq,
      priority: row.priority,
      lastmod: row.updated,
    })),
  ];
}

/** The full sitemap.xml document, byte-for-byte as it is committed. */
export function buildSitemap(): string {
  const urls = sitemapEntries()
    .map((entry) => {
      const lines = [
        '  <url>',
        `    <loc>${entry.loc}</loc>`,
        entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>` : null,
        `    <changefreq>${entry.changefreq}</changefreq>`,
        `    <priority>${entry.priority.toFixed(1)}</priority>`,
        '  </url>',
      ].filter((l): l is string => l !== null);
      return lines.join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- GENERATED FILE — do not edit by hand.',
    '     Source: src/shared/sitemap.ts (reads TOOL_IDS + PUBLIC_PAGES).',
    '     Regenerate: npm run sitemap                                    -->',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
    '',
  ].join('\n');
}
