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

/**
 * Allowlisted event names. Adding an event = adding it here (typed taxonomy).
 *
 * The rule this list is maintained by: **every name here is emitted by real
 * code**. A declared-but-unsent event is not a placeholder waiting to be filled
 * in — it is a metric that reads zero and is indistinguishable from a real one
 * that has flatlined. `analytics.test.ts` asserts the union and the emitting
 * call sites agree in both directions.
 *
 * `finance_tool_used` is deliberately absent. It is what `tool_completed`
 * already measures, and more precisely: it fires when a calculator produces a
 * RESULT, not merely when its route is opened (that is `tool_view`). Two names
 * for one action would split the metric and make both wrong.
 */
export type AnalyticsEvent =
  | 'page_view'
  | 'tool_view'
  | 'tool_completed'
  | 'signup_prompt_shown'
  | 'signup_prompt_action'
  // ── Acquisition ──────────────────────────────────────────────────────────
  // The funnel the launch review named as unmeasurable: without these, a
  // sign-up page view and a created account could not be told apart, so no
  // conversion rate on the site's own front door could be computed at all.
  | 'signup_started'
  | 'signup_completed'
  // `search_performed` and `careers_view` were declared here and emitted by
  // nothing. Both were already covered elsewhere: careers routes produce a
  // `page_view` like every other route, and the careers workspace has its own
  // opt-out-able pipeline (src/careers/services/analytics.ts) for its
  // domain events. A name in this union that nothing sends is not a gap waiting
  // to be filled — it is a metric that reads zero and looks like a real one.
  | 'web_vital'
  | 'app_error'
  | 'route_not_found'
  // Careers paywall (CareersPaywallGate / CareersProPaywall) — the entry
  // gate shown to signed-in users without a paid Careers plan.
  | 'careers_paywall_view'
  | 'careers_checkout_clicked'
  | 'careers_paywall_closed'
  // ── Revenue ──────────────────────────────────────────────────────────────
  // `checkout_*` describe the payment attempt; `subscription_*` describe what
  // happened to ACCESS as a result. They are not duplicates: a completed
  // checkout whose webhook never lands produces `checkout_completed` with no
  // `subscription_started`, and that gap is precisely the failure the review
  // called out as invisible — money taken, access not granted.
  | 'checkout_started'
  | 'checkout_completed'
  | 'checkout_failed'
  | 'subscription_started'
  | 'subscription_renewed'
  | 'subscription_expired'
  // ── Feature engagement ───────────────────────────────────────────────────
  | 'ai_message_sent'
  | 'report_exported'
  | 'resume_uploaded'
  | 'job_search_completed';

/**
 * Prop keys that may be sent. Anything else is dropped before it leaves the tab.
 *
 * Every key is an enum WE choose the values for — a tool id, a route template, a
 * plan id, a billing period. None of them may ever carry free text, a monetary
 * amount, a filename or anything the user typed. The server keeps the same list
 * (`supabase/functions/analytics-collect`) and drops the rest again, so this is
 * defence in depth rather than the only gate.
 */
const ALLOWED_PROP_KEYS = new Set([
  'tool', 'route', 'action', 'metric', 'rating', 'value', 'bucket',
  'kind', 'where', 'count', 'ok', 'step', 'plan', 'period',
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

/**
 * Ceiling on the retained queue. Reached only when delivery is impossible
 * (offline, or the ingest is down); past it the oldest events are dropped so a
 * long offline stretch cannot grow the tab's memory without bound.
 */
const MAX_QUEUE = 200;

/** Collapse identical events repeated inside this window. */
const DEDUPE_WINDOW_MS = 1_000;
/** Distinct event+props keys remembered for deduplication. */
const DEDUPE_KEYS = 64;

/** Periodic drain, so a long session does not ride entirely on an unload beacon. */
const FLUSH_INTERVAL_MS = 30_000;

/**
 * Ephemeral, in-memory only. Never persisted, never sent to storage.
 *
 * The queue survives an offline stretch in MEMORY and nowhere else. Persisting
 * it — the usual way to build an "offline queue" — would put a session
 * identifier and a behavioural trail in localStorage, which is exactly the
 * cross-session linkage this module's privacy contract forbids. Events that
 * cannot be delivered before the tab closes are lost, and that is the correct
 * trade: a durable analytics queue is a tracking cookie by another name.
 */
const sessionId = safeUUID();
const sessionStart = now();

let queue: QueuedEvent[] = [];
let started = false;
/** event+props key → timestamp of the last one recorded, for deduplication. */
const recent = new Map<string, number>();

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

/**
 * Drop an event that repeats one already recorded within `DEDUPE_WINDOW_MS`.
 *
 * The duplicates are real, not hypothetical. React 19 runs effects twice under
 * StrictMode, so `page_view` and `tool_view` fire in pairs; a route that
 * re-renders on a state change re-runs its effect; and an error loop reports the
 * same `app_error` on every frame. All of it lands in one table, where a doubled
 * `page_view` silently halves every conversion rate computed from it.
 *
 * The window is deliberately short. Two identical events a second apart are one
 * event observed twice; two identical events a minute apart are a person doing
 * something twice, and collapsing those would be a different lie.
 */
function isDuplicate(key: string, at: number): boolean {
  const last = recent.get(key);
  if (last !== undefined && at - last < DEDUPE_WINDOW_MS) return true;
  recent.set(key, at);
  // Bounded: without this an unbounded map of every event a long session ever
  // produced would be a slow leak in a tab left open all day.
  if (recent.size > DEDUPE_KEYS) {
    for (const k of recent.keys()) {
      recent.delete(k);
      if (recent.size <= DEDUPE_KEYS) break;
    }
  }
  return false;
}

/** Record an event. No-op when analytics is disabled. */
export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (!analyticsEnabled()) return;
  const p = sanitize(props);
  const at = now();
  if (isDuplicate(`${event}|${JSON.stringify(p ?? {})}`, at)) return;

  queue.push({ e: event, p, t: Math.round(at - sessionStart) });

  // Cap the queue. It only grows this far while sending is impossible (offline,
  // or the endpoint is down), and at that point the OLDEST events are the ones
  // least worth keeping — dropping from the front preserves the most recent
  // picture of the session rather than freezing it at the moment connectivity
  // was lost.
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);

  if (queue.length >= MAX_BATCH) flush();
}

/** Convenience: a page/route view, normalised to its route template. */
export function trackPageView(pathname: string): void {
  track('page_view', { route: routeTemplate(pathname) });
}

/** Are we knowingly offline? `navigator.onLine` is only trustworthy when false. */
function offline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Put a failed batch back at the FRONT of the queue, preserving order.
 *
 * Without this, a flush that failed — offline, endpoint down, a 502 from the
 * ingest — destroyed its events: the queue was cleared before the send was known
 * to have succeeded. The failure is completely silent (beacons are
 * fire-and-forget by design), so the only visible symptom is a dashboard that
 * under-reports by an unknown amount.
 */
function requeue(batch: QueuedEvent[]): void {
  queue = [...batch, ...queue];
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
}

/**
 * Serialise + send the current queue.
 *
 * The queue is only cleared once the transport has ACCEPTED the batch:
 * `sendBeacon` returning true means it is queued by the browser and will survive
 * unload, and a `fetch` is only trusted on a 2xx response. Anything else puts
 * the events back.
 */
export function flush(): void {
  if (!analyticsEnabled() || queue.length === 0) return;

  // Nothing can be delivered while offline, and trying costs a guaranteed
  // failed request on every event. Hold, and let the `online` listener drain it.
  if (offline()) return;

  const batch = queue.slice(0, MAX_BATCH);
  queue = queue.slice(batch.length);

  const payload = JSON.stringify({
    sid: sessionId,
    // Coarse client time (whole seconds) purely to compute server clock skew.
    ts: Math.floor(Date.now() / 1000),
    events: batch,
  });

  try {
    if (navigator.sendBeacon) {
      // False means the browser refused to queue it (payload over the beacon
      // size limit, or a policy block) — the events are NOT in flight.
      if (navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }))) return;
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
    })
      .then((res) => {
        // 4xx is the client's own fault (malformed or rejected batch) and would
        // fail identically forever — retrying it is a loop, so it is dropped.
        // 5xx and network errors are transient and worth another attempt.
        if (!res.ok && res.status >= 500) requeue(batch);
      })
      .catch(() => {
        requeue(batch); // network error — keep them for the next flush
      });
  } catch {
    // Swallow — analytics is best-effort and never throws into the app — but
    // keep the events rather than losing them to a transport that never ran.
    requeue(batch);
  }
}

/** Install flush + connectivity listeners once. Safe to call multiple times. */
export function initAnalytics(): void {
  if (started || !analyticsEnabled()) return;
  started = true;

  // Flush when the tab is backgrounded or closed — the reliable moment for beacons.
  const onHide = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', flush);

  // Coming back online is the one moment a previously undeliverable queue can
  // definitely be sent. Without it, everything recorded during a tunnel, a lift
  // or a dropped connection sat in memory until the tab closed and then went out
  // as a single beacon that the browser frequently never gets to send.
  window.addEventListener('online', flush);

  // A steady drain for long sessions. A visitor who keeps one tab open for an
  // hour, then closes the laptop lid, previously had the whole hour riding on a
  // single unload beacon; mobile browsers routinely never fire that.
  const timer = setInterval(flush, FLUSH_INTERVAL_MS);
  // Never hold the process open in Node/jsdom, where this would keep a test
  // runner alive after the suite finishes.
  (timer as unknown as { unref?: () => void }).unref?.();
}

/** Test-only: inspect/reset internal state. Not part of the public API. */
export const __analyticsInternals = {
  sessionId,
  getQueue: () => queue,
  reset: () => {
    queue = [];
    started = false;
    recent.clear();
  },
};
