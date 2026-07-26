# FinatriX — Observability & Analytics

Privacy-first product analytics, Web Vitals, and error monitoring — built to the FinatriX
principles: **no ads, no behavioural tracking, no fingerprinting, no selling data, no unnecessary
cookies, privacy by design** (GDPR / DPDP aligned).

---

## 1. Privacy model (read this first)

| Guarantee | How |
|---|---|
| No cookies | Nothing is ever written to `document.cookie`. |
| No fingerprinting | We never read user-agent, screen, canvas, fonts, language, or IP. |
| No cross-session identity | `session_id` is a random UUID created **in memory** at page load and discarded on tab close. It cannot re-identify a person or link sessions/devices. |
| No PII | Events are an allowlist of names; props are an allowlist of keys with primitive, length-capped values. Calculator inputs, amounts, names, and free text are never collected. |
| No raw URLs | Only the route **template** is recorded (`/tools/:tool`, `/careers/:section`, `/*`). |
| Opt-out respected | Fully disabled when **Do-Not-Track** or **Global Privacy Control** is set. |
| Off by default | Disabled entirely unless `VITE_ANALYTICS_URL` is configured. |
| No IP storage | The ingest function reads the IP only for in-memory rate-limiting, then discards it. |
| Retention-limited | Raw events auto-pruned after 90 days (configurable). |

**Design trade-off (documented on purpose):** events are **anonymous and session-scoped**. We do
*not* attach `user_id`. This maximises privacy at the cost of cross-session cohort funnels; those can
be added later behind explicit consent if ever needed. Session-scoped funnels (within one visit) work
today.

---

## 2. Architecture

```
Browser (src/lib/*)                         Edge                         Postgres (Supabase)
──────────────────                          ────                         ───────────────────
analytics.ts   ─ track(event, props) ─┐
webVitals.ts   ─ web_vital ────────────┤ batch
errorReporting ─ app_error ────────────┘  │  navigator.sendBeacon
                                          ▼
                              analytics-collect (edge fn)
                              • CORS allowlist   • per-IP rate limit (IP not stored)
                              • event + prop allowlist re-validation (never trust client)
                              • service-role insert
                                          │
                                          ▼
                              analytics_events  (RLS: no client writes; admin-only reads)
                              prune_analytics_events(days)  • analytics_event_counts_daily (view)
```

Client modules: `src/lib/analytics.ts`, `src/lib/webVitals.ts`, `src/lib/errorReporting.ts`.
Server: `supabase/functions/analytics-collect/index.ts`, `supabase/analytics_schema.sql`.
Health probe: `GET /healthz` (served by `worker/index.ts`).

---

## 3. Event taxonomy

Every event and its allowed props. Adding an event means updating **both** the client
(`AnalyticsEvent` union) and the edge function's `ALLOWED_EVENTS` set.

| Event | When | Props (allowlisted) |
|---|---|---|
| `page_view` | Every route change | `route` (template) |
| `tool_view` | A calculator page mounts | `tool` (id) |
| `tool_completed` | A calculator produces a meaningful result | `tool` |
| `signup_prompt_shown` | Guest account modal appears | — |
| `signup_prompt_action` | User acts on the modal | `action` = signup \| login \| dismiss |
| `web_vital` | On tab-hide / paint | `metric` (LCP/CLS/INP/TTFB/FCP), `value`, `rating` |
| `app_error` | Caught exception | `kind` (error type), `where` (route), `bucket` (source) |
| `route_not_found` | 404 page renders | — |

Allowed prop keys (global): `tool, route, action, metric, rating, value, bucket, kind, where, count, ok, step`.

**Every event in this table is instrumented.** That is enforced, not asserted: `analytics.test.ts`
fails if a name in the `AnalyticsEvent` union has no emitter anywhere in `src/`, and separately if the
edge function's `ALLOWED_EVENTS` would drop one the client can send.

`tool_completed` was previously *declared and allowlisted but never emitted*, so the product's primary
conversion metric read zero and was indistinguishable from a product nobody finished using. It now
fires at each calculator's real completion point:

| Tool | Completion |
|---|---|
| Budget Builder | an income plus ≥1 allocated category (no submit button exists — derived from state, once per mount) |
| Expense Tracker | a spend is successfully logged (a tracker has no result screen to reach) |
| InvestMatch | the allocation renders, *after* the minimum-investment guard |
| ParkSmart / PeerCompare / Reverse Goal Planner | the result view renders |
| LifeMap | the simulated profile is built |

`search_performed` and `careers_view` were removed rather than wired. Both were already covered:
careers routes emit a `page_view` like any other route, and the careers workspace has its own
opt-out-able pipeline (`src/careers/services/analytics.ts`) for domain events. A declared event that
nothing sends is not a gap waiting to be filled — it is a zero that looks like a measurement.

---

## 4. Web Vitals

Captured dependency-free via `PerformanceObserver` (`src/lib/webVitals.ts`): **TTFB, FCP, LCP, CLS,
INP** (INP is approximated as the largest interaction latency). Each is reported once, finalised on
tab-hide, with a Google-threshold `rating` of good / needs-improvement / poor.

Suggested SLOs (p75, field): LCP ≤ 2.5s · INP ≤ 200ms · CLS ≤ 0.1.

---

## 4a. Delivery guarantees

Beacons are fire-and-forget by design, so a batch that is dropped, duplicated or rejected raises
nothing anywhere — the only symptom is a dashboard that is wrong by an unknown amount, which reads
exactly like a quiet week. `src/lib/analytics.ts` therefore guarantees:

| Property | Behaviour |
|---|---|
| **Batching** | Up to 25 events per request; flushed at that size, on tab-hide, and every 30s. |
| **Retry** | The queue is cleared only once the transport *accepts* the batch. `sendBeacon` returning `false`, a network error, or a 5xx puts the events back at the front of the queue, in order. |
| **No retry loop** | A 4xx is dropped — it would fail identically forever. |
| **Offline queue** | While `navigator.onLine === false` nothing is sent (every attempt would be a guaranteed failure); an `online` listener drains the queue on reconnect. |
| **Bounded** | Max 200 retained events; past that the *oldest* are dropped, keeping the most recent picture of the session. |
| **Deduplication** | Identical event+props within 1s collapse to one — React 19 StrictMode double-invokes effects, so `page_view` and `tool_view` genuinely arrive in pairs. A doubled `page_view` silently halves every rate computed from it. |
| **Never blocks rendering** | No `await`, no synchronous work on the render path; every failure path is swallowed. |
| **Silent failure** | No analytics error ever reaches the app or the console. |

**The offline queue is memory-only, deliberately.** Persisting it to `localStorage` — the usual way to
build one — would put a session identifier and a behavioural trail in durable storage, which is
exactly the cross-session linkage §1 forbids. Events that cannot be delivered before the tab closes
are lost, and that is the correct trade: a durable analytics queue is a tracking cookie by another
name.

**Ordering note.** LCP, CLS and INP only exist at tab-hide — the same moment the queue is flushed. If
`initAnalytics` registered its listener first, its flush ran *before* the vitals were recorded and a
closing tab could take them with it. `webVitals.ts` therefore flushes for itself immediately after
finalising, so correctness does not depend on initialiser order in `main.tsx`.

---

## 5. Error monitoring

`errorReporting.ts` installs `window.error` + `unhandledrejection` handlers and the React
`ErrorBoundary` reports on catch. **Only the error type and route template are sent — never the
message or stack** (they can contain PII/tokens). Throttled to 20/session. For deeper debugging, a
future self-hosted error backend with server-side scrubbing can capture more; that boundary is
deliberate.

### 5a. Third-party error monitoring — integration plan (NOT installed)

No Sentry, and no SDK of any kind, is installed. This is a decision, not an omission, and it should
stay that way until someone consciously accepts the trade below. What exists today —
error *type* + route template, throttled to 20/session — answers "what is breaking, and where" but
not "why". The gap is real; so is the cost of closing it badly.

**Why it is not installed by default**

- The Sentry browser SDK is ~25-30 KB gzipped on top of a landing bundle held to a **185 KB budget**
  by `vite.config.ts`. It would consume roughly three-quarters of the current headroom.
- Its default configuration captures messages, stack traces, breadcrumbs (including DOM text and
  input names) and URLs with query strings. For a *personal-finance* product that is a PII pipeline
  pointed at a third party — a direct conflict with §1, and a DPDP/GDPR processor relationship that
  must be disclosed in the Privacy Policy before a single event is sent.
- It requires a `connect-src` CSP relaxation to `*.ingest.sentry.io`, widening a policy that is
  currently first-party plus Supabase.

**If it is adopted, this is the shape it must take**

1. **Consent + opt-out parity.** Initialise only when analytics is enabled — same DNT/GPC checks as
   `analyticsEnabled()`. A user who has opted out of analytics has opted out of this too.
2. **Lazy, non-blocking.** `await import('@sentry/browser')` inside an idle callback after first
   paint, never in the critical path. Do not add it to the landing chunk; assert the budget guard
   still passes.
3. **Scrub before send, not after.** `beforeSend` must strip `request.url` to the route template
   (reuse `routeTemplate`), drop `request.query_string`, `user`, `cookies` and every breadcrumb of
   category `ui.input`. `sendDefaultPii: false`. Deny-list DOM breadcrumbs entirely — a finance app's
   input values must never leave the tab.
4. **Bounded.** `sampleRate` ≤ 0.25, `tracesSampleRate: 0`, `replaysSessionSampleRate: 0`. Session
   Replay stays off: it records the screen of a page showing someone's salary.
5. **CSP.** Add the ingest origin to `connect-src` in **both** `public/_headers` and the meta CSP in
   `index.html` — they must stay byte-identical or the browser enforces the intersection.
6. **Config.** `VITE_SENTRY_DSN`, absent by default so an unconfigured build is inert (same pattern as
   `VITE_ANALYTICS_URL`); add it to `.env.example` and the deploy workflow's secret list.
7. **Legal.** Add Sentry to the Privacy Policy's processor list **in the same change** that enables it.
8. **Verify.** Extend `analytics.test.ts` with a `beforeSend` scrubbing test — feed it an event
   carrying a query string, a stack frame with a file path and a DOM breadcrumb, and assert none
   survives. Do not rely on Sentry's own defaults.

**Cheaper alternative worth costing first.** `app_error` already gives error-rate-by-type-and-route.
Adding a `kind`-scoped alert on the existing pipeline (§8) covers most of "is something broken right
now" at zero bundle cost and zero new processor. Reach for Sentry when the missing piece is genuinely
*stack traces*, not alerting.

---

## 6. Structured logging, health & monitoring

- **Health probe:** `GET /healthz` → `{ status: "ok", ts }`, `no-store`, unauthenticated. Point uptime
  monitors here (and at a real route like `/` to confirm 200, and a junk path to confirm 404).
- **Edge logs:** the Supabase functions log failures to `console.error` (structured message, no PII);
  view with `supabase functions logs analytics-collect`.
- **DB monitoring:** Supabase dashboard (query performance, connections). The
  `analytics_event_counts_daily` view backs admin dashboards.

---

## 7. Retention policy

Raw `analytics_events` are pruned after **90 days** by `prune_analytics_events(p_days)`. Schedule daily
with pg_cron in the SQL editor:

```sql
select cron.schedule('prune-analytics', '0 3 * * *', $$ select public.prune_analytics_events(90); $$);
```

(or hit an RPC from an external scheduler). Aggregations for long-term trends should be materialised
before pruning if longer history is ever required.

---

## 8. Alerting & incident readiness (recommended thresholds)

| Signal | Warning | Page |
|---|---|---|
| `app_error` rate | > 1% of `page_view` (15 min) | > 5% |
| `web_vital` LCP p75 | > 2.5s | > 4s |
| `/healthz` | non-200 once | non-200 3× / 3 min |
| analytics-collect 5xx | > 2% | > 10% |

Wire via Supabase log-based alerts or an external uptime monitor (e.g. self-hosted Uptime Kuma).

---

## 9. Operational runbook (starter)

- **Spike in `app_error`:** group by `kind` + `where` in `analytics_event_counts_daily`; correlate with
  the latest deploy; roll back the Worker/app if a single route dominates.
- **LCP regression:** check recent bundle-size / image changes; confirm fonts still preloaded; verify
  the branded route fallback isn't masking a slow chunk.
- **`/healthz` failing:** check Cloudflare Worker status and the assets deployment; the SPA shell path
  is independent of Supabase, so a Supabase outage should NOT fail `/healthz`.
- **Ingest 5xx:** check `analytics-collect` logs and the service-role secret; analytics failure must
  never affect the app (client is best-effort and swallows errors).

---

## 10. Scaling notes (tens of millions of users)

- The ingest is stateless and horizontally scalable; batching + `sendBeacon` keeps request volume low
  (one flush per visit + on-hide).
- `analytics_events` is append-only with time-based indexes; partition by month (pg_partman) before
  volume is large, and prune/rollup aggressively.
- Move to Cloudflare Analytics Engine or a columnar store (ClickHouse) if event volume outgrows
  Postgres; the client taxonomy and edge contract stay the same — only the sink changes.
