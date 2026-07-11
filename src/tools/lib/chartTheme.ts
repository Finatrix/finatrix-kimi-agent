import type { Theme } from '../../context/ThemeContext';

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
