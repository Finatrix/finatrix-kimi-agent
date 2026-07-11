/**
 * FinatriX — privacy-first, cookieless product analytics.
 *
 * Design principles (non-negotiable, per the FinatriX charter):
 *  • No cookies, no localStorage identifier, no cross-session/-device linkage.
 *  • No fingerprinting: we never read the user-agent, screen, canvas, fonts, IP,
 *    or any device signal.
 *  • Anonymous: a session id is a random UUID generated in memory at page load
 *    and is discarded when the tab closes. It groups events within one visit for
 *    funnel analysis and cannot identify or re-identify a person.
 *  • Consent by default-respect: fully disabled when Do-Not-Track or Global
 *    Privacy Control is set, or when no endpoint is configured.
 *  • No PII ever leaves the client: only an allowlist of event names, and props
 *    restricted to an allowlist of keys with primitive, length-capped values.
 *    Calculator inputs, amounts, names and free text are never collected.
 *  • Data minimisation: events carry the route *template* (`/tools/:tool`), never
 *    the raw URL/query string.
 *
 * Transport: events are batched and flushed with `navigator.sendBeacon` (falling
 * back to `fetch(..., { keepalive: true })`) to a first-party ingest endpoint.
 */

import { routeTemplate } from '../shared/routes';

/** Allowlisted event names. Adding an event = adding it here (typed taxonomy). */
export type AnalyticsEvent =
  | 'page_view'
  | 'tool_view'
  | 'tool_completed'
  | 'signup_prompt_shown'
  | 'signup_prompt_action'
  | 'search_performed'
  | 'careers_view'
  | 'web_vital'
  | 'app_error'
  | 'route_not_found';

/** Prop keys that may be sent. Anything else is dropped before it leaves the tab. */
const ALLOWED_PROP_KEYS = new Set([
  'tool', 'route', 'action', 'metric', 'rating', 'value', 'bucket',
  'kind', 'where', 'count', 'ok', 'step',
]);

export type AnalyticsProps = Record<string, string | number | boolean>;

interface QueuedEvent {
  e: AnalyticsEvent;
  p?: AnalyticsProps;
  /** ms since session start — relative, never a wall-clock that could correlate. */
  t: number;
}

const ENDPOINT = (import.meta.env.VITE_ANALYTICS_URL as string | undefined) || '';
const MAX_BATCH = 25;
const MAX_STRING = 64;

// Ephemeral, in-memory only. Never persisted, never sent to storage.
const sessionId = safeUUID();
const sessionStart = now();

let queue: QueuedEvent[] = [];
let started = false;

function now(): number {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function safeUUID(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** True unless the user opted out (DNT/GPC) or no endpoint is configured. */
export function analyticsEnabled(): boolean {
  if (!ENDPOINT) return false;
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const nav = navigator as Navigator & {
    doNotTrack?: string;
    msDoNotTrack?: string;
    globalPrivacyControl?: boolean;
  };
  const win = window as Window & { doNotTrack?: string };
  if (nav.doNotTrack === '1' || win.doNotTrack === '1' || nav.msDoNotTrack === '1') return false;
  if (nav.globalPrivacyControl === true) return false;
  return true;
}

/** Keep only allowlisted keys with primitive, length-capped values. */
function sanitize(props?: AnalyticsProps): AnalyticsProps | undefined {
  if (!props) return undefined;
  const out: AnalyticsProps = {};
  for (const [k, v] of Object.entries(props)) {
    if (!ALLOWED_PROP_KEYS.has(k)) continue;
    if (typeof v === 'number') {
      if (Number.isFinite(v)) out[k] = v;
    } else if (typeof v === 'boolean') {
      out[k] = v;
    } else if (typeof v === 'string') {
      out[k] = v.slice(0, MAX_STRING);
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/** Record an event. No-op when analytics is disabled. */
export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (!analyticsEnabled()) return;
  queue.push({ e: event, p: sanitize(props), t: Math.round(now() - sessionStart) });
  if (queue.length >= MAX_BATCH) flush();
}

/** Convenience: a page/route view, normalised to its route template. */
export function trackPageView(pathname: string): void {
  track('page_view', { route: routeTemplate(pathname) });
}

/** Serialise + send the current queue, then clear it. */
export function flush(): void {
  if (!analyticsEnabled() || queue.length === 0) return;
  const batch = queue;
  queue = [];
  const payload = JSON.stringify({
    sid: sessionId,
    // Coarse client time (whole seconds) purely to compute server clock skew.
    ts: Math.floor(Date.now() / 1000),
    events: batch,
  });
  try {
    if (navigator.sendBeacon) {
      const ok = navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }));
      if (ok) return;
    }
    // Fallback: keepalive fetch survives page unload.
    void fetch(ENDPOINT, {
      method: 'POST',
      body: payload,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      // No credentials — this is an anonymous, cookieless endpoint.
      credentials: 'omit',
      mode: 'cors',
    }).catch(() => {
      /* analytics must never affect the app */
    });
  } catch {
    /* swallow — analytics is best-effort and never throws into the app */
  }
}

/** Install flush-on-hide listeners once. Safe to call multiple times. */
export function initAnalytics(): void {
  if (started || !analyticsEnabled()) return;
  started = true;
  // Flush when the tab is backgrounded or closed — the reliable moment for beacons.
  const onHide = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', flush);
}

/** Test-only: inspect/reset internal state. Not part of the public API. */
export const __analyticsInternals = {
  sessionId,
  getQueue: () => queue,
  reset: () => {
    queue = [];
    started = false;
  },
};
