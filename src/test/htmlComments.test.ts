import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripHtmlComments } from '../../scripts/strip-html-comments';

/**
 * The build strips HTML comments from `index.html`. This is the guard on that
 * transform, and it exists because the file it edits is the one file where a
 * mistake is invisible locally and total in production.
 *
 * Two things in that document are byte-sensitive. The inline theme-boot script
 * is allowed by a `sha256` in the Content-Security-Policy, so a single
 * character changed inside it is a blocked script — a flash of the wrong theme
 * on every load, reported by nothing. And the JSON-LD block is strict JSON: a
 * stray `<!--` or a dropped brace makes the whole site-level graph unparseable
 * to every crawler, again silently.
 *
 * So the transform is asserted against the REAL document rather than a fixture.
 */

const html = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8');
const stripped = stripHtmlComments(html);

/** Every `<script>…</script>` body, in order. */
function scriptBodies(src: string): string[] {
  return [...src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

describe('index.html comment stripping', () => {
  it('has comments to strip in the first place', () => {
    // Without this the rest is vacuous: a document with no comments passes
    // every assertion below whether or not the transform works at all.
    expect(html).toContain('<!--');
    expect(stripped.length).toBeLessThan(html.length);
  });

  it('removes every comment, including the internal TODOs', () => {
    expect(stripped).not.toContain('<!--');
    expect(stripped).not.toContain('TODO(brand)');
  });

  it('leaves every script body byte-identical', () => {
    // The CSP hash is computed over these exact bytes.
    expect(scriptBodies(stripped)).toEqual(scriptBodies(html));
  });

  it('keeps the theme-boot script allowed by the shipped CSP', () => {
    const boot = scriptBodies(stripped).find((b) => b.includes("setAttribute('data-theme'"));
    expect(boot).toBeTruthy();
    const digest = createHash('sha256').update(boot!, 'utf8').digest('base64');
    expect(stripped).toContain(`'sha256-${digest}'`);
  });

  it('keeps the site-level JSON-LD parseable', () => {
    const graph = scriptBodies(stripped).find((b) => b.includes('"@graph"'));
    expect(graph).toBeTruthy();
    expect(() => JSON.parse(graph!)).not.toThrow();
  });

  it('keeps every head node the edge Worker rewrites', () => {
    // `withSeoMetadata` only ever replaces the VALUE of nodes that already
    // exist; one removed here is one route's canonical, title or card silently
    // left at the homepage default in the served bytes.
    for (const selector of [
      '<link rel="canonical"',
      'property="og:url"',
      'name="robots"',
      '<title>',
      'name="description"',
      'property="og:title"',
      'property="og:description"',
      'name="twitter:title"',
      'name="twitter:description"',
      'property="og:image"',
      'property="og:image:alt"',
      'name="twitter:image"',
      'name="twitter:image:alt"',
      'id="fx-route-schema"',
    ]) {
      expect(stripped, `${selector} must survive comment stripping`).toContain(selector);
    }
  });

  it('leaves the document structurally intact', () => {
    expect(stripped.startsWith('<!doctype html>')).toBe(true);
    expect(stripped).toContain('<html lang="en-IN">');
    expect(stripped).toContain('<div id="root"></div>');
    expect(stripped.trimEnd().endsWith('</html>')).toBe(true);
    // Tag count is unchanged — only comment nodes were removed.
    const tags = (s: string) => (s.match(/<[a-zA-Z/!][^>]*>/g) ?? []).length;
    expect(tags(stripped)).toBe(tags(html) - (html.match(/<!--/g) ?? []).length);
  });

  it('never touches a "<!--" that is data inside a script', () => {
    const withData = '<head><script>var s = "<!-- not a comment -->";</script><!-- real --></head>';
    expect(stripHtmlComments(withData)).toBe('<head><script>var s = "<!-- not a comment -->";</script></head>');
  });

  it('leaves an unterminated comment alone rather than truncating the document', () => {
    const broken = '<head><!-- never closed <title>x</title></head>';
    expect(stripHtmlComments(broken)).toBe(broken);
  });
});
