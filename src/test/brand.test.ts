/**
 * Brand-consistency regression tests (Phase 6 — brand authority).
 *
 * Public brand facts — the contact address, the official social profiles, the
 * canonical URL — appear on surfaces that cannot import each other: React
 * components, the static `index.html`, its JSON-LD block, and
 * `.well-known/security.txt`. `src/shared/brand.ts` is the source of truth for
 * the importable half; these tests bind the static half to it, so the set moves
 * together or CI fails.
 *
 * The regression that motivated the file: the site published
 * `https://twitter.com/finatrix_` in three places at once — the footer's only
 * outbound link, `twitter:site`/`twitter:creator`, and the Organization node's
 * `sameAs`. The handle is not registered (x.com/finatrix_ answers HTTP 404), so
 * the one link meant to prove the brand is real led to an error page, and
 * `sameAs` — whose whole job is to let a search engine CONFIRM that a brand and
 * a profile are the same organisation — pointed at nothing to confirm. Nothing
 * in the build, the type-checker or an SEO crawl notices a link that resolves to
 * a 404 on someone else's domain.
 *
 * These tests cannot check that a profile is OWNED by FinatriX — that needs a
 * human to open it. What they can and do enforce is that nothing gets published
 * as an official profile except by adding it to `SOCIAL_PROFILES` deliberately.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SUPPORT_EMAIL, SUPPORT_MAILTO, BRAND_URL, SOCIAL_PROFILES } from '../shared/brand';
import { CANONICAL_HOST } from '../shared/routes';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/**
 * Every shipped source file, EXCEPT `brand.ts` itself.
 *
 * `brand.ts` is the declaration site: it necessarily contains the `mailto:`
 * template and, in its comments, the dead handle it exists to keep out. Scanning
 * it would flag the definition as a violation of itself.
 */
function shippedSources(dir = join(root, 'src'), out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'test' || entry === '__fixtures__' || entry === 'fixtures') continue;
      shippedSources(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) && entry !== 'brand.ts') {
      out.push(full);
    }
  }
  return out;
}

/**
 * Strip comments, so these tests read what SHIPS rather than what is documented.
 *
 * The distinction matters here more than usual: the most useful thing the
 * codebase can say about the dead `@finatrix_` handle is a comment explaining
 * why it must not come back. A scanner that cannot tell a warning from a
 * violation punishes exactly the documentation that prevents the regression.
 *
 * Line comments are matched only when `//` is not preceded by `:`, so a real
 * `https://…` link is never mistaken for a comment and stripped out of view —
 * which would hide a genuine violation instead of surfacing it.
 */
function codeOnly(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** The Organization node from index.html's JSON-LD graph. */
function organizationNode(): Record<string, unknown> {
  const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(read('index.html'))?.[1];
  expect(block, 'index.html has no JSON-LD block').toBeTruthy();
  const parsed = JSON.parse(block!);
  const graph: Record<string, unknown>[] = parsed['@graph'] ?? [parsed];
  const org = graph.find((n) => n['@type'] === 'Organization');
  expect(org, 'JSON-LD graph has no Organization node').toBeTruthy();
  return org!;
}

describe('contact address', () => {
  it('is the only email address any shipped page links to', () => {
    const wrong: string[] = [];
    for (const file of shippedSources()) {
      const src = codeOnly(readFileSync(file, 'utf8'));
      for (const m of src.matchAll(/mailto:([^"'`?\s)$]+)/g)) {
        // `exports.ts` builds a recipient-less `mailto:?subject=…` for the user's
        // own mail client — there is no FinatriX address in it to get wrong.
        if (m[1] === '' || m[1].startsWith('?')) continue;
        if (m[1] !== SUPPORT_EMAIL) wrong.push(`${file.replace(root + '/', '')}: ${m[1]}`);
      }
    }
    expect(wrong, `mailto: links not using SUPPORT_EMAIL:\n${wrong.join('\n')}`).toEqual([]);
  });

  it('is what security.txt publishes, with an unexpired lifetime', () => {
    const txt = read('public/.well-known/security.txt');
    expect(txt).toContain(`Contact: ${SUPPORT_MAILTO}`);
    expect(txt).toContain(`Canonical: https://${CANONICAL_HOST}/.well-known/security.txt`);

    // RFC 9116 §2.5.5: a security.txt past its Expires is INVALID and should be
    // ignored outright, so a lapsed date silently retires the site's whole
    // vulnerability-disclosure channel. Nothing else in the repo would notice.
    const expires = /^Expires:\s*(.+)$/m.exec(txt)?.[1]?.trim();
    expect(expires, 'security.txt has no Expires field (required by RFC 9116)').toBeTruthy();
    const remainingDays = (Date.parse(expires!) - Date.now()) / 86_400_000;
    expect(Number.isNaN(remainingDays), `unparseable Expires: ${expires}`).toBe(false);
    expect(remainingDays, `security.txt expires in ${Math.round(remainingDays)} days — renew it`)
      .toBeGreaterThan(30);
  });

  it('is what the Organization node publishes', () => {
    expect(organizationNode().email).toBe(SUPPORT_EMAIL);
  });
});

describe('social profiles', () => {
  // The core guard. A profile URL reaches production only by being added to
  // SOCIAL_PROFILES, which is the one place whose comment demands the URL be
  // opened and confirmed first.
  it('appear nowhere in shipped source unless declared official', () => {
    const PLATFORMS = /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com|linkedin\.com\/(?:company|in)|instagram\.com|facebook\.com|youtube\.com|github\.com|threads\.net|mastodon\.[a-z]+)\/[^"'`\s<)]+/gi;
    const found: string[] = [];
    for (const file of [...shippedSources(), join(root, 'index.html')]) {
      const src = codeOnly(readFileSync(file, 'utf8'));
      for (const m of src.matchAll(PLATFORMS)) {
        const url = m[0].replace(/[.,)]+$/, '');
        if (!SOCIAL_PROFILES.includes(url)) found.push(`${file.replace(root + '/', '')}: ${url}`);
      }
    }
    expect(
      found,
      `social URLs not in SOCIAL_PROFILES (open each one, confirm FinatriX owns it, then declare it):\n${found.join('\n')}`,
    ).toEqual([]);
  });

  it('never claims an X handle without an official profile to back it', () => {
    const html = codeOnly(read('index.html'));
    // `twitter:site`/`twitter:creator` render an attribution line linking to
    // x.com/<handle>. With no confirmed account that link is a 404 on every
    // card the brand has ever been shared in.
    if (SOCIAL_PROFILES.length === 0) {
      expect(html).not.toMatch(/name="twitter:(site|creator)"/);
    }
    // The specific dead handle, in any form, must never come back.
    expect(html).not.toMatch(/finatrix_/);
  });

  it('keeps sameAs in step with the declared profiles', () => {
    const sameAs = organizationNode().sameAs as string[] | undefined;
    if (SOCIAL_PROFILES.length === 0) {
      // Absent is correct: an empty array is a claim of "no profiles" rather
      // than no claim, and a dead URL is worse than either.
      expect(sameAs).toBeUndefined();
    } else {
      expect(sameAs).toEqual([...SOCIAL_PROFILES]);
    }
  });
});

describe('brand identity', () => {
  it('names the canonical origin in the Organization node', () => {
    const org = organizationNode();
    expect(org.url).toBe(BRAND_URL);
    expect(org['@id']).toBe(`${BRAND_URL}#org`);
    expect(org.name).toBe('FinatriX');
  });

  it('offers a machine-readable contact point for the brand', () => {
    const cp = organizationNode().contactPoint as Record<string, unknown> | undefined;
    expect(cp, 'Organization has no contactPoint').toBeTruthy();
    expect(cp!['@type']).toBe('ContactPoint');
    expect(cp!.email).toBe(SUPPORT_EMAIL);
  });

  it('opens every external link safely', () => {
    // An external `target="_blank"` without `rel="noopener"` hands the opened
    // page a live `window.opener` handle back into this origin.
    const offenders: string[] = [];
    for (const file of shippedSources()) {
      const src = codeOnly(readFileSync(file, 'utf8'));
      for (const m of src.matchAll(/<a\b[^>]*target=["{']?_blank[^>]*>/g)) {
        if (!/rel=\{?["']?[^"'}]*noopener/.test(m[0])) {
          offenders.push(`${file.replace(root + '/', '')}: ${m[0].slice(0, 90)}`);
        }
      }
    }
    expect(offenders, `target="_blank" without rel="noopener":\n${offenders.join('\n')}`).toEqual([]);
  });
});
