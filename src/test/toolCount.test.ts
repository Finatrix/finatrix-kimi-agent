import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_COUNT, TOOL_COUNT_WORD, TOOL_COUNT_WORD_CAP, TOOL_IDS } from '../shared/toolCount';
import { TOOLS } from '../lib/tools';
import { DEFAULT_DESCRIPTION } from '../lib/seo';

/**
 * The site said "seven" in nineteen places while shipping eight tools.
 *
 * The Net Worth tracker landed, `TOOLS` and `TOOL_IDS` both grew, every nav bar
 * and the sitemap picked it up automatically — and every sentence that had
 * counted them by hand stayed wrong. One page even contradicted itself, opening
 * with "the seven money tools are free" and answering the very next question
 * with "all eight calculators".
 *
 * This is the guard that stops it happening on the ninth tool: a hand-written
 * count anywhere in the product fails the build.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('the tool count has one source', () => {
  it('is derived from the canonical id list', () => {
    expect(TOOL_COUNT).toBe(TOOL_IDS.length);
    expect(TOOL_COUNT_WORD).toBe('eight');
    expect(TOOL_COUNT_WORD_CAP).toBe('Eight');
  });

  it('agrees with the tool registry the navigation renders', () => {
    // Two lists, one truth. `TOOLS` carries the presentation (name, colour,
    // icon); `TOOL_IDS` is what the router, the sitemap and the edge Worker
    // read. They must describe the same set, in the same order.
    expect(TOOLS.map((t) => t.id)).toEqual([...TOOL_IDS]);
  });

  it('reaches the default meta description', () => {
    expect(DEFAULT_DESCRIPTION.startsWith(`${TOOL_COUNT_WORD_CAP} free`)).toBe(true);
  });
});

describe('no hand-written count survives anywhere', () => {
  /**
   * Deliberately a source scan rather than a set of per-file assertions: the
   * failure mode is a NEW sentence somewhere nobody thought to check, and only
   * a scan catches that.
   */
  const FILES = [
    'index.html',
    'src/lib/seo.ts',
    'src/shared/publicPages.ts',
    'src/content/comparisons.ts',
    'src/sections/LandingShowcase.tsx',
    'src/pages/marketing/Pricing.tsx',
    'src/pages/marketing/About.tsx',
    'src/pages/marketing/Refunds.tsx',
    'src/pages/careers/CareersLanding.tsx',
  ];

  /**
   * "seven tools", "7 calculators", "eight free money tools" — a counted claim.
   *
   * Only an adjective run is allowed between the number and the noun. An
   * earlier, looser version matched across whole clauses and flagged "different
   * from the one the calculators solve", which counts nothing. "one" is left
   * out entirely: it can never introduce a plural count, and it is the most
   * common English word that is not a number.
   */
  const HAND_COUNTED =
    /\b(two|three|four|five|six|seven|eight|nine|ten|\d{1,2})(\s+(free|money|financial|core|main|other|such))*\s+(tools|calculators)\b/i;

  for (const file of FILES) {
    it(`${file} counts the tools by reference, not by hand`, () => {
      const source = readFileSync(join(ROOT, file), 'utf8');
      const offenders = source
        .split('\n')
        .map((line, i) => ({ line: line.trim(), n: i + 1 }))
        // index.html is static and has no way to interpolate, so its meta
        // description is allowed the literal word — checked against the
        // canonical one just below instead.
        .filter(({ line }) => HAND_COUNTED.test(line))
        .filter(({ line }) => !line.includes('TOOL_COUNT'))
        .filter(({ line }) => file !== 'index.html' || !line.includes('content='));
      expect(offenders).toEqual([]);
    });
  }

  it('keeps the static index.html description in step with the canonical one', () => {
    // The crawler sees this file before any JavaScript runs, so a stale count
    // here is the one that reaches search results.
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    expect(html).toContain(DEFAULT_DESCRIPTION);
    expect(html).not.toMatch(/Seven free/);
  });
});
