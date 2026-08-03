import type { Theme } from '../../context/ThemeContext';
import type { CatKey } from './budget';
import { SECTION_FILL } from './sectionColors';

/**
 * Theme-aware Chart.js colours.
 *
 * Chart.js paints to <canvas>, so it can't read CSS variables — these values
 * give charts the same light/dark treatment as the rest of the UI. Pass the
 * active theme (from useTheme) and include it in the chart effect's deps so the
 * chart rebuilds on toggle. Data-series colours stay theme-constant and live at
 * the call site; only the chrome (ticks, gridlines, tooltip) flips here.
 */
export interface ChartTheme {
  tick: string;
  grid: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipTitle: string;
  tooltipBody: string;
}

const DARK: ChartTheme = {
  tick: '#9A9A94',
  grid: 'rgba(255,255,255,.06)',
  tooltipBg: '#15151A',
  tooltipBorder: '#26262B',
  tooltipTitle: '#F5F5F0',
  tooltipBody: '#9A9A94',
};

const LIGHT: ChartTheme = {
  tick: '#6B6759', // ~4.9:1 on white — AA for axis labels
  grid: 'rgba(23,21,15,.10)',
  tooltipBg: '#FFFFFF',
  tooltipBorder: 'rgba(23,21,15,.12)',
  tooltipTitle: '#17150F',
  tooltipBody: '#57534A',
};

export function getChartTheme(theme?: Theme): ChartTheme {
  const isLight =
    theme !== undefined
      ? theme === 'light'
      : typeof document !== 'undefined' &&
        document.documentElement.getAttribute('data-theme') === 'light';
  return isLight ? LIGHT : DARK;
}

/** A stacked segment's key: the three budget sections plus the leftover bucket. */
export type SectionSeriesKey = CatKey | 'unassigned';

/**
 * Literal fills for when the stylesheet cannot be read — jsdom, where vitest
 * runs with `css: false`. Dark-theme values, the app's default.
 *
 * `unassigned` has no token of its own: `--bar-none` is too dark to carry a
 * readable label (3.6:1 against the segment text colour), so the leftover
 * bucket gets a lighter neutral that clears AA like the other three.
 */
const SECTION_FILL_FALLBACK: Record<SectionSeriesKey, string> = {
  needs: '#4D9BFF',
  wants: '#F5A524',
  save: '#34D27A',
  unassigned: '#8A8A90',
};

/**
 * Resolve a `var(--token)` reference to the literal colour the browser computed.
 *
 * Canvas cannot read CSS variables, so a chart cannot reuse `SECTION_FILL` the
 * way a <div> does — but keeping a second copy of those hexes here is exactly
 * what let the section colours drift apart across five components before
 * sectionColors.ts unified them. Reading the live token keeps one source of
 * truth and follows the active theme for free.
 *
 * Resolved against `scope`, NOT the document root: `--blue-fill` and its
 * siblings are declared on `.fx-tools`, so asking <html> for them returns ''
 * and silently yields the fallback — which is how this first shipped, painting
 * the light theme in dark-theme colours. Passing the chart's own canvas gets
 * the value that element actually inherits, wherever it is mounted.
 */
function resolveCssColor(value: string, fallback: string, scope: Element): string {
  const token = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value)?.[1];
  if (!token) return value;
  const resolved = getComputedStyle(scope).getPropertyValue(token).trim();
  return resolved || fallback;
}

/**
 * Segment fills for the stacked trend charts, in the same tones the rest of the
 * UI paints Needs / Wants / Savings with. Pass the chart's canvas and call
 * inside the chart effect, so a theme toggle re-reads the tokens.
 *
 * Without an element — jsdom in unit tests, where vitest runs with `css: false`
 * and no stylesheet exists to read — the literals stand in.
 */
export function getSectionFills(scope?: Element | null): Record<SectionSeriesKey, string> {
  if (!scope || typeof getComputedStyle !== 'function') return SECTION_FILL_FALLBACK;
  return {
    needs: resolveCssColor(SECTION_FILL.needs, SECTION_FILL_FALLBACK.needs, scope),
    wants: resolveCssColor(SECTION_FILL.wants, SECTION_FILL_FALLBACK.wants, scope),
    save: resolveCssColor(SECTION_FILL.save, SECTION_FILL_FALLBACK.save, scope),
    unassigned: SECTION_FILL_FALLBACK.unassigned,
  };
}

/**
 * Colour for the amount drawn inside a segment. One value for all four fills:
 * it clears 4.5:1 against every one of them in both themes (5.31:1 at worst),
 * so a segment label never needs a per-colour branch.
 */
export const SECTION_LABEL_INK = '#17150F';
