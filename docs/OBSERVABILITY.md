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
| `search_performed` | A job search runs | `count` (providers), `ok` |
| `careers_view` | A Careers page mounts | `route` |
| `web_vital` | On tab-hide / paint | `metric` (LCP/CLS/INP/TTFB/FCP), `value`, `rating` |
| `app_error` | Caught exception | `kind` (error type), `where` (route), `bucket` (source) |
| `route_not_found` | 404 page renders | — |

Allowed prop keys (global): `tool, route, action, metric, rating, value, bucket, kind, where, count, ok, step`.

**Instrumented now:** `page_view`, `tool_view`, `signup_prompt_shown`, `signup_prompt_action`,
`web_vital`, `app_error`, `route_not_found`. **Defined, ready to wire:** `tool_completed`,
`search_performed`, `careers_view` (drop a single `track(...)` at the completion/search/mount point).

---

## 4. Web Vitals

Captured dependency-free via `PerformanceObserver` (`src/lib/webVitals.ts`): **TTFB, FCP, LCP, CLS,
INP** (INP is approximated as the largest interaction latency). Each is reported once, finalised on
tab-hide, with a Google-threshold `rating` of good / needs-improvement / poor.

Suggested SLOs (p75, field): LCP ≤ 2.5s · INP ≤ 200ms · CLS ≤ 0.1.

---

## 5. Error monitoring

`errorReporting.ts` installs `window.error` + `unhandledrejection` handlers and the React
`ErrorBoundary` reports on catch. **Only the error type and route template are sent — never the
message or stack** (they can contain PII/tokens). Throttled to 20/session. For deeper debugging, a
future self-hosted error backend with server-side scrubbing can capture more; that boundary is
deliberate.

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
