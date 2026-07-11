/**
 * Core Web Vitals capture — dependency-free (no `web-vitals` package), using
 * PerformanceObserver directly to keep the bundle lean.
 *
 * Metrics: TTFB, FCP, LCP, CLS, and an INP approximation (largest event
 * latency). Each is reported once, finalised on tab-hide, through the
 * privacy-first analytics pipeline as a `web_vital` event carrying only the
 * metric name, a numeric value and a good/needs-improvement/poor rating — no
 * URLs, no device data.
 *
 * All observers are wrapped defensively: if a browser lacks an entry type (or
 * we're under jsdom in tests), that metric is silently skipped and never throws.
 */
import { track } from './analytics';

type Rating = 'good' | 'needs-improvement' | 'poor';

// Google's Core Web Vitals thresholds: [good ≤, poor >].
const THRESHOLDS: Record<string, [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  TTFB: [800, 1800],
  FCP: [1800, 3000],
};

function rate(metric: string, value: number): Rating {
  const t = THRESHOLDS[metric];
  if (!t) return 'needs-improvement';
  if (value <= t[0]) return 'good';
  if (value > t[1]) return 'poor';
  return 'needs-improvement';
}

function report(metric: string, value: number): void {
  const rounded = metric === 'CLS' ? Math.round(value * 1000) / 1000 : Math.round(value);
  track('web_vital', { metric, value: rounded, rating: rate(metric, rounded) });
}

function observe(type: string, cb: (entries: PerformanceEntry[]) => void): PerformanceObserver | null {
  try {
    const po = new PerformanceObserver((list) => cb(list.getEntries()));
    po.observe({ type, buffered: true } as PerformanceObserverInit);
    return po;
  } catch {
    return null; // unsupported entry type or non-browser env
  }
}

/** Begin collecting Web Vitals. Safe no-op where PerformanceObserver is absent. */
export function initWebVitals(): void {
  if (typeof PerformanceObserver === 'undefined' || typeof document === 'undefined') return;

  // TTFB + FCP from paint/navigation timing.
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav && nav.responseStart > 0) report('TTFB', nav.responseStart);
  } catch {
    /* ignore */
  }
  observe('paint', (entries) => {
    for (const e of entries) if (e.name === 'first-contentful-paint') report('FCP', e.startTime);
  });

  // LCP — keep the latest; finalise on hide.
  let lcp = 0;
  observe('largest-contentful-paint', (entries) => {
    const last = entries[entries.length - 1];
    if (last) lcp = last.startTime;
  });

  // CLS — sum layout shifts excluding those following recent input.
  let cls = 0;
  observe('layout-shift', (entries) => {
    for (const e of entries as (PerformanceEntry & { value?: number; hadRecentInput?: boolean })[]) {
      if (!e.hadRecentInput && typeof e.value === 'number') cls += e.value;
    }
  });

  // INP approximation — the largest interaction latency observed.
  let inp = 0;
  observe('event', (entries) => {
    for (const e of entries as (PerformanceEntry & { duration: number })[]) {
      if (e.duration > inp) inp = e.duration;
    }
  });

  let finalised = false;
  const finalise = () => {
    if (finalised || document.visibilityState !== 'hidden') return;
    finalised = true;
    if (lcp > 0) report('LCP', lcp);
    report('CLS', cls);
    if (inp > 0) report('INP', inp);
  };
  document.addEventListener('visibilitychange', finalise);
  window.addEventListener('pagehide', finalise);
}
