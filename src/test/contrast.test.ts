import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Automated WCAG 2.1 contrast guard for the design tokens.
 *
 * Parses styles/tokens.css, reads the real text/surface colour values for both
 * themes, and asserts every text-on-surface pair clears AA (4.5:1 for normal
 * text). This locks in the light-theme status-colour deepening and fails CI if
 * any future token change reintroduces an unreadable pair.
 */

const CSS = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');

/** Relative luminance + contrast ratio per WCAG. */
function luminance(hex: string): number {
  const c = hex.replace('#', '');
  const chan = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Extract a `--name: #hex;` value from a specific `:root…{ }` block. */
function tokenIn(block: string, name: string): string {
  const m = block.match(new RegExp(`--${name}\\s*:\\s*(#[0-9A-Fa-f]{6})`));
  if (!m) throw new Error(`token --${name} not found in block`);
  return m[1];
}

// The default (dark) :root block is everything up to the first close-brace.
const darkBlock = CSS.slice(0, CSS.indexOf('\n}'));
// The light block begins at the braced selector (not the comment that names it).
const lightStart = CSS.indexOf(':root[data-theme="light"] {');
const lightBlock = CSS.slice(lightStart, CSS.indexOf('\n}', lightStart));

const AA = 4.5;

describe('design tokens — WCAG AA text contrast', () => {
  it('dark theme: all text tokens clear AA on their surfaces', () => {
    const ink = tokenIn(darkBlock, 'ink');
    const ink2 = tokenIn(darkBlock, 'ink-2');
    const ink3 = tokenIn(darkBlock, 'ink-3');
    const s1 = tokenIn(darkBlock, 'surface-1');
    const s2 = tokenIn(darkBlock, 'surface-2');
    const pairs: Array<[string, string, string]> = [
      ['ink/surface-1', ink, s1],
      ['ink/surface-2', ink, s2],
      ['ink-2/surface-2', ink2, s2],
      ['ink-3/surface-2', ink3, s2],
      ['ink-3/surface-1', ink3, s1],
      ['danger/surface-2', tokenIn(darkBlock, 'status-danger'), s2],
      ['success/surface-2', tokenIn(darkBlock, 'status-success'), s2],
      ['warn/surface-2', tokenIn(darkBlock, 'status-warn'), s2],
      ['info/surface-2', tokenIn(darkBlock, 'status-info'), s2],
    ];
    for (const [name, fg, bg] of pairs) {
      expect(ratio(fg, bg), `${name} = ${ratio(fg, bg).toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
    }
  });

  it('light theme: ink + deepened status colours clear AA on paper/white', () => {
    // Light overrides these; anything it doesn't override falls back to dark.
    const ink = tokenIn(lightBlock, 'ink');
    const ink2 = tokenIn(lightBlock, 'ink-2');
    const ink3 = tokenIn(lightBlock, 'ink-3');
    const white = tokenIn(lightBlock, 'surface-2'); // #FFFFFF
    const paper = tokenIn(lightBlock, 'surface-base');
    const pairs: Array<[string, string, string]> = [
      ['ink/white', ink, white],
      ['ink-2/white', ink2, white],
      ['ink-3/white', ink3, white],
      ['ink-3/paper', ink3, paper],
      ['danger/white', tokenIn(lightBlock, 'status-danger'), white],
      ['danger/paper', tokenIn(lightBlock, 'status-danger'), paper],
      ['success/white', tokenIn(lightBlock, 'status-success'), white],
      ['warn/white', tokenIn(lightBlock, 'status-warn'), white],
      ['info/white', tokenIn(lightBlock, 'status-info'), white],
      ['accent-text/white', tokenIn(lightBlock, 'accent-text'), white],
      ['accent-text/paper', tokenIn(lightBlock, 'accent-text'), paper],
    ];
    for (const [name, fg, bg] of pairs) {
      expect(ratio(fg, bg), `${name} = ${ratio(fg, bg).toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
    }
  });
});
