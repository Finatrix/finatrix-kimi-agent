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

/** RGBA helpers for text that sits on a translucent tint rather than a surface. */
interface Rgba { r: number; g: number; b: number; a: number }

function hexToRgb(hex: string): Rgba {
  const c = hex.replace('#', '');
  return { r: parseInt(c.slice(0, 2), 16), g: parseInt(c.slice(2, 4), 16), b: parseInt(c.slice(4, 6), 16), a: 1 };
}
function parseRgba(v: string): Rgba {
  const n = (v.match(/[\d.]+/g) ?? []).map(Number);
  return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
}
/** Source-over alpha compositing of `fg` onto an opaque `bg`. */
function compositeOver(fg: Rgba, bg: Rgba): Rgba {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}
function luminanceRgb(c: Rgba): number {
  const chan = [c.r, c.g, c.b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
}
function ratioRgb(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminanceRgb(a), luminanceRgb(b)].sort((x, y) => y - x);
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

  /**
   * Every token that is EVER used as a text colour must be asserted here — the
   * first version of this guard covered ink and the four status colours but not
   * the data colours, so `--data-teal`, `--data-purple` and the Wants amber sat
   * at their vivid dark-theme values on light paper (2.06:1, 2.97:1 and 1.92:1)
   * while the suite stayed green. They are used as text in ParkSmart's
   * effective-rate figure, the PeerCompare/LifeMap KPI values and the Budget
   * band labels respectively.
   */
  it('light theme: data colours used as text clear AA on paper/white', () => {
    const white = tokenIn(lightBlock, 'surface-2');
    const paper = tokenIn(lightBlock, 'surface-base');
    const canvas = tokenIn(lightBlock, 'surface-1');   // the tools canvas
    for (const token of ['data-purple', 'data-teal', 'data-wants']) {
      const fg = tokenIn(lightBlock, token);
      for (const [bgName, bg] of [['white', white], ['paper', paper], ['canvas', canvas]] as const) {
        expect(ratio(fg, bg), `${token}/${bgName} = ${ratio(fg, bg).toFixed(2)}:1`)
          .toBeGreaterThanOrEqual(AA);
      }
    }
  });

  // `--surface-1` is darker than white, so a token can clear AA on white and
  // still fail on the canvas most tool pages actually render against.
  it('light theme: status colours clear AA on the tools canvas too', () => {
    const canvas = tokenIn(lightBlock, 'surface-1');
    for (const token of ['status-info', 'status-success', 'status-warn', 'status-danger', 'accent-text']) {
      const fg = tokenIn(lightBlock, token);
      expect(ratio(fg, canvas), `${token}/canvas = ${ratio(fg, canvas).toFixed(2)}:1`)
        .toBeGreaterThanOrEqual(AA);
    }
  });

  /**
   * Coloured text very often sits on a translucent tint of its own hue (badges,
   * pills, chips). The tint darkens the effective background, so a token that
   * clears AA against the bare canvas can still fail inside its own badge —
   * ParkSmart's "Best Match" pill measured 4.41:1 that way while every
   * canvas-based assertion above passed. Composite the tint and check the real
   * rendered pair.
   */
  it('light theme: coloured text clears AA on its own tinted badge', () => {
    const canvas = hexToRgb(tokenIn(lightBlock, 'surface-1'));
    // [token, tint actually used behind it in the CSS, where it appears]
    const cases: Array<[string, string, string]> = [
      ['data-teal', 'rgba(12,128,121,.12)', 'ParkSmart “Best Match” pill'],
      ['data-teal', 'rgba(12,128,121,.09)', 'ParkSmart page chip'],
      ['status-info', 'rgba(77,155,255,.12)', 'careers .badge-blue'],
      ['status-info', 'rgba(77,155,255,.14)', 'careers .cal-ev'],
      ['data-purple', 'rgba(110,59,212,.09)', 'PeerCompare / LifeMap chip'],
      ['accent-text', 'rgba(212,175,55,.14)', 'careers .badge-gold'],
      ['accent-text', 'rgba(212,175,55,.15)', 'careers .cal-ev.interview'],
    ];
    for (const [token, tint, where] of cases) {
      const fg = hexToRgb(tokenIn(lightBlock, token));
      const bg = compositeOver(parseRgba(tint), canvas);
      const r = ratioRgb(fg, bg);
      expect(r, `${token} on ${tint} (${where}) = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
    }
  });

  /**
   * The -fill tokens exist so charts stay vivid without dragging text below AA.
   * They answer to WCAG 1.4.11 (3:1 for a graphical object against its adjacent
   * surface) rather than 1.4.3, because a bar segment is a shape, not a label.
   * Guarding the weaker bound is what stops a future "let's make the charts
   * pop" edit from quietly producing a bar nobody can see on white.
   */
  const NON_TEXT = 3;
  const FILL_TOKENS = [
    'status-info-fill', 'status-success-fill', 'status-warn-fill',
    'status-danger-fill', 'data-purple-fill', 'data-teal-fill', 'data-wants-fill',
  ];

  it('light theme: chart fills clear the 3:1 non-text bound on every surface', () => {
    const surfaces = {
      white: tokenIn(lightBlock, 'surface-2'),
      paper: tokenIn(lightBlock, 'surface-base'),
      canvas: tokenIn(lightBlock, 'surface-1'),
    };
    for (const token of FILL_TOKENS) {
      const fg = tokenIn(lightBlock, token);
      for (const [name, bg] of Object.entries(surfaces)) {
        expect(ratio(fg, bg), `${token}/${name} = ${ratio(fg, bg).toFixed(2)}:1`)
          .toBeGreaterThanOrEqual(NON_TEXT);
      }
    }
  });

  it('dark theme: chart fills clear the 3:1 non-text bound on card + canvas', () => {
    for (const token of FILL_TOKENS) {
      const fg = tokenIn(darkBlock, token);
      for (const surface of ['surface-1', 'surface-2'] as const) {
        const bg = tokenIn(darkBlock, surface);
        expect(ratio(fg, bg), `${token}/${surface} = ${ratio(fg, bg).toFixed(2)}:1`)
          .toBeGreaterThanOrEqual(NON_TEXT);
      }
    }
  });

  /**
   * The whole point of the split: a fill must be visibly more saturated than
   * the AA-deepened text value it was extracted from, otherwise the two tokens
   * are just a more expensive way to have one. On light, every fill should sit
   * clearly brighter than its text counterpart.
   */
  it('light theme: each fill is brighter than the text token it split from', () => {
    const pairs: Array<[string, string]> = [
      ['status-info', 'status-info-fill'],
      ['status-success', 'status-success-fill'],
      ['status-warn', 'status-warn-fill'],
      ['status-danger', 'status-danger-fill'],
      ['data-purple', 'data-purple-fill'],
      ['data-teal', 'data-teal-fill'],
      ['data-wants', 'data-wants-fill'],
    ];
    for (const [text, fill] of pairs) {
      const lt = luminance(tokenIn(lightBlock, text));
      const lf = luminance(tokenIn(lightBlock, fill));
      expect(lf, `${fill} (${lf.toFixed(3)}) should out-shine ${text} (${lt.toFixed(3)})`)
        .toBeGreaterThan(lt);
    }
  });

  /**
   * WCAG 2.2 §1.4.11 Non-text Contrast — the guard the split was made for.
   *
   * Splitting each colour into a text token and a `-fill` token is justified in
   * budgetStatus.ts and sectionColors.ts on the grounds that "a bar segment only
   * needs the 3:1 WCAG asks of a graphic". Everything above tests the 4.5:1 half
   * of that claim; the 3:1 half was asserted in prose and by nothing else.
   *
   * It is currently true, but only just: the light fills land between 3.01 and
   * 3.44 against the three surfaces they are drawn on, because they were tuned
   * to be as vivid as the rule permits. A one-hex nudge for aesthetic reasons
   * would drop a progress bar below the threshold, and — like every contrast
   * regression — it would look completely fine to whoever made the change.
   */
  it('both themes: every fill clears 3:1 as a graphic on every surface', () => {
    const AA_GRAPHIC = 3;
    const fills = [
      'status-info-fill', 'status-success-fill', 'status-warn-fill',
      'status-danger-fill', 'data-purple-fill', 'data-teal-fill', 'data-wants-fill',
    ];
    for (const [themeName, block] of [['dark', darkBlock], ['light', lightBlock]] as const) {
      // The three surfaces a bar, donut or swatch is ever drawn on.
      const surfaces: Array<[string, string]> = [
        ['page', tokenIn(block, 'surface-base')],
        ['canvas', tokenIn(block, 'surface-1')],
        ['card', tokenIn(block, 'surface-2')],
      ];
      for (const fill of fills) {
        const fg = tokenIn(block, fill);
        for (const [surfaceName, bg] of surfaces) {
          const r = ratio(fg, bg);
          expect(r, `${themeName} ${fill} on ${surfaceName} = ${r.toFixed(2)}:1`)
            .toBeGreaterThanOrEqual(AA_GRAPHIC);
        }
      }
    }
  });

  /**
   * The unfunded-category bar is grey on purpose (never black — see
   * budgetStatus.ts), and grey is the easiest value to drift into invisibility.
   * It lives in tools.css rather than tokens.css, so it is read from there.
   */
  it('both themes: the no-budget bar is still visible as a graphic', () => {
    const toolsCss = readFileSync(resolve(process.cwd(), 'src/tools/tools.css'), 'utf8');
    const barNone = [...toolsCss.matchAll(/--bar-none:\s*(#[0-9A-Fa-f]{6})/g)].map((m) => m[1]);
    expect(barNone.length, 'expected a --bar-none for each theme').toBe(2);
    const [darkBar, lightBar] = barNone;
    expect(ratio(darkBar, tokenIn(darkBlock, 'surface-2')), `dark --bar-none = ${darkBar}`)
      .toBeGreaterThanOrEqual(3);
    expect(ratio(lightBar, tokenIn(lightBlock, 'surface-2')), `light --bar-none = ${lightBar}`)
      .toBeGreaterThanOrEqual(3);
  });

  // The dark theme must keep its vivid originals — the light fix must not have
  // leaked upward into the default :root block.
  it('dark theme keeps the vivid data colours', () => {
    expect(tokenIn(darkBlock, 'data-purple')).toBe('#9B7BFF');
    expect(tokenIn(darkBlock, 'data-teal')).toBe('#2BC4B0');
    expect(tokenIn(darkBlock, 'data-wants')).toBe('#F5A524');
  });
});
