#!/usr/bin/env node
/**
 * Regenerate public/sitemap.xml from src/shared/sitemap.ts.
 *
 *     npm run sitemap
 *
 * The builder lives in TypeScript because it reads the same two registries the
 * app and the edge Worker read (`TOOL_IDS`, `PUBLIC_PAGES`) — duplicating them
 * in a .mjs script is exactly the drift this replaces. Node cannot import .ts
 * directly, so the module is bundled in memory with the esbuild that Vite
 * already installs and imported from a data URL. Nothing is written to disk
 * except the sitemap itself.
 *
 * `sitemap.test.ts` compares the committed file against the same function, so
 * forgetting to run this fails the suite rather than shipping a stale sitemap.
 */

import { build } from 'esbuild';
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'sitemap.xml');

const bundle = await build({
  entryPoints: [join(ROOT, 'src', 'shared', 'sitemap.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  write: false,
  logLevel: 'warning',
});

const { buildSitemap } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

const xml = buildSitemap();
const previous = (() => {
  try {
    return readFileSync(OUT, 'utf8');
  } catch {
    return '';
  }
})();

if (previous === xml) {
  console.log('sitemap.xml already up to date');
} else {
  writeFileSync(OUT, xml, 'utf8');
  const count = (xml.match(/<loc>/g) ?? []).length;
  console.log(`sitemap.xml written — ${count} URLs`);
}
