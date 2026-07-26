# FinatriX — Production Release Assessment

**Date:** 2026-07-25 · **Engagement:** final pre-launch verification and hardening
**Scope:** whole platform, with emphasis on the multi-provider careers job search
**Verdict:** 🔴 **DO NOT RELEASE.** Three P0s. Two are fixed in this session; one is a
deployment-state failure that no code change can close.

Every claim below is marked ✓ VERIFIED · ✓ FIXED · ⚠ BLOCKED · ❌ FAILED, and carries the evidence
that produced it. Where something could not be verified, it is BLOCKED with the reason — nothing is
assumed working.

---

## 1 · Executive Summary

The repository is in good shape. The **deployed system is not the repository**, and that gap is the
release blocker.

Three findings dominate:

1. **The live job-search function is running last-generation code.** Deployed `careers-jobs` v29
   (2026-07-24T23:14Z) still issues requests to `/active-jb-7d` with `title_filter` /
   `description_type`. That contract was corrected in the repo — but never shipped. The three
   highest-priority providers (Active Jobs DB, LinkedIn, Job Posting Feed — priorities 100/90/50)
   are returning nothing in production, on every search, right now.
2. **The AI function has been logging users' résumés.** A leftover debug block in `careers-ai`
   printed the full model completion on every call. For the `parse` task that completion is the
   user's résumé as structured JSON — name, email, phone, employers, credential IDs — written into
   edge-function logs, which carry none of the RLS protection or retention policy the careers
   tables do. Fixed this session.
3. **No backing infrastructure exists in the database.** Not one of the five provider tables, and
   not `analytics_events`, exists in the live project. Every store degrades silently, so production
   search runs with **no cache, no health gating, no quota enforcement, and no metrics** — and
   nothing surfaces that fact.

Underneath those, the engineering is genuinely strong: fault isolation is real, the trust boundary
is well-placed, RLS is on every table, secrets never leave the composition root, and the truthful-
badge design is a deliberate, defensible product decision. The problems are release-management
problems, not architecture problems.

A previous readiness report concluded that **no provider credentials existed**. That conclusion was
drawn from the local shell and `.env` only. Querying the live project shows credentials **do**
exist — with a naming defect (§5.2). The blocker was real; its stated cause was wrong.

### Release-blocking items

| # | Item | Severity | State |
|---|---|:--:|---|
| B1 | Deployed function runs the broken v2 provider contract | P0 | ❌ FAILED — repo fix exists, **must be deployed** |
| B2 | `careers-ai` logged résumé PII to edge logs | P0 | ✓ FIXED — **must be deployed** |
| B3 | Provider + analytics migrations never applied | P0 | ❌ FAILED — **must be applied** |
| B4 | Provider secrets misnamed; `WORKDAY_HOST` absent | P1 | ❌ FAILED — ops fix |
| B5 | Branded domains do not resolve (NXDOMAIN) | P1 | ❌ FAILED — DNS |
| B6 | Live provider response verification never performed | — | ⚠ BLOCKED — needs a test user session |

---

## 2 · Engineering Summary

### Local gate — all green ✓ VERIFIED

```
tsc -b                    PASS
eslint . --max-warnings 0 PASS
vitest run                PASS — 73 files, 1006 tests (999 → 1006, +7 added this session)
npm run build             PASS
```

### Changes made this session

Minimal and production-safe. No financial formula, calculation, educational logic or calculator
behaviour was touched. No architecture was rewritten and no abstraction was replaced.

| File | Change | Finding |
|---|---|---|
| `supabase/functions/careers-ai/index.ts` | Removed the debug block that logged the raw model completion; replaced with a PII-free structured log (task, model, ms, token counts) | F2 · P0 |
| `supabase/analytics_schema.sql` | `security_invoker = true` on `analytics_event_counts_daily` + `revoke all … from anon` | F4 · P1 |
| `providers/sanitize.ts` | New `postedDate()` — coerces absolute **and** relative provider dates to ISO 8601, or null | F6 · P1 |
| `providers/ProviderNormalizer.ts` | Sanitise once at the trust boundary: `stripHtml` the description, `postedDate()`/`iso()` the dates, then derive every signal from the clean record | F6 · F7 |
| `providers/sanitize.test.ts` · `ProviderNormalizer.test.ts` | +7 regression tests pinning both contracts | — |
| `careers_provider_infrastructure.sql` | `revoke execute` on both `prune_*` functions; new `provider_ops_search_volume` view | F14 · F13 |
| `src/careers/services/providerOps.ts` | Headline search volume reads the true-total view, falls back gracefully when unmigrated | F13 |
| `src/careers/pages/AdminDashboard.tsx` | Top-terms bars scale to the busiest term, not to total volume; `scope="col"` on the provider table | F13 · A11y |
| `vite.config.ts` | Vitest excludes `**/e2e/**`, `dist-verify/**`, `.claude/**` | F15 |
| `.github/workflows/ci.yml` | Documented the full assessed accepted-risk set for `npm audit` | F11 |

---

## 3 · Security Review

### F2 — `careers-ai` wrote users' résumé PII to edge-function logs · **P0** · ✓ FIXED

**Evidence.** `supabase/functions/careers-ai/index.ts:221-231` (before the fix):

```js
const { content, model: used, usage: tokenUsage } = await callModel(...);
console.log("================================");
console.log("MODEL:", used);
console.log("RAW RESPONSE:");
console.log(content);          // ← the entire model completion
console.log("================================");
```

`content` is the model's JSON. For `task: 'parse'` the contract in
`src/careers/ai/prompts.ts:31-38` requires exactly:
`personal:{name,email,phone,location,linkedin,github,portfolio}`, full `experience[]`,
`education[]`, and `certifications[{…,credentialId}]`. Formatting confirms this was accidental —
stray blank lines and a `return json(200, {` left dangling mid-line at 232.

**Root cause.** Debug instrumentation committed and deployed (function version 25,
2026-07-12T17:46Z). No log-content review step exists in the release process.

**Business impact.** Personal data of every résumé-uploading user written to a system with
different access control and retention than the RLS-protected careers tables. For a product whose
core asset is résumés, this is a privacy-commitment failure and a plausible data-protection
exposure.
**Engineering impact.** Log volume and cost proportional to AI usage; completions can reach 8k
tokens.
**Risk.** High before fix; residual risk is whatever is already retained in Supabase logs.

**Recommendation.** Deploy the fix. Separately: purge or expire existing `careers-ai` logs, and add
a "no request/response bodies in logs" item to the release checklist.
**Owner:** Backend · **Effort:** S (fix done; log purge ~1h)
**Acceptance criteria.** A `parse` call emits exactly one log line containing no field from the
completion; `grep`ing edge logs for a known résumé email returns nothing.

### F4 — `analytics_event_counts_daily` bypasses RLS · **P1** · ✓ FIXED

**Evidence.** `supabase/analytics_schema.sql:66` created the view with no `security_invoker`, under
a comment asserting the opposite ("Inherits the table's admin-only RLS"). Postgres defaults
`security_invoker` to **false** — the view runs with the owner's rights, and the owner also owns
`analytics_events`, so RLS does not apply. Supabase grants `SELECT` on new `public` objects to
`anon` and `authenticated` by default.

**Mitigating fact, verified.** The table does not exist in the live project, so this was never
exposed:

```
GET /rest/v1/analytics_events → PGRST205 "Could not find the table 'public.analytics_events'"
GET /rest/v1/jobs             → 200 []      ← control: an existing RLS-protected table
```

**Root cause.** Same class as the already-fixed `provider_ops_*` defect. It was recorded as
follow-up work (`docs/audit/VOL3-TECHNICAL-SECURITY.md` T-8) and not carried out.
**Recommendation.** Apply the corrected file **before** first use.
**Owner:** Backend · **Effort:** S
**Acceptance criteria.** As a non-admin authenticated user,
`select * from analytics_event_counts_daily` returns 0 rows; as `anon` it is denied.

### F8 — No rate limit applies to unauthenticated requests · **P2** · ❌ FAILED

**Evidence.** `careers-jobs/index.ts:512-518` authenticates *before* limiting, and the limiter is
keyed on `user.id`:

```ts
const { data: userData, error: userErr } = await supabase.auth.getUser();
if (userErr || !userData?.user) return json(401, …);   // ← unauthenticated exits here
if (rateLimited(userData.user.id, RATE_PER_MINUTE)) …  // ← only reached when authenticated
```

The function is deployed with `verify_jwt: false` (verified via `supabase functions list`), so it
is openly invocable. Confirmed reachable and correctly rejecting:
`POST /functions/v1/careers-jobs` with no token → `401 {"error":"Sign in to search jobs."}`.

**Root cause.** Limiter placed after the auth gate; nothing bounds pre-auth work.
**Business impact.** Billed edge invocations and unbounded GoTrue load from an anonymous flood.
**Engineering impact.** Every junk request costs a network round-trip to the auth service.
**Risk.** Medium — cost and availability, not data.
**Recommendation.** Add a cheap pre-auth burst check keyed on the platform-supplied client IP,
before `getUser()`. Keep the existing per-user limit unchanged.
**Owner:** Backend · **Effort:** S
**Acceptance criteria.** 200 unauthenticated requests in 60s from one IP yield 429s without
200 calls to `getUser()`.

### Verified sound ✓

| Area | Finding | Evidence |
|---|---|---|
| Authentication | ✓ VERIFIED | Unauthenticated → 401 with correct CORS + JSON. The anon key used as a bearer is also rejected 401 — it is correctly not treated as a user token |
| Authorisation / RLS | ✓ VERIFIED | RLS enabled on **every** table across all 9 schema files (scripted check, zero misses); no client-writable policies on operational tables |
| SECURITY DEFINER | ✓ VERIFIED | 3 functions, all with `set search_path = ''`; `is_platform_admin` revoked from `public`/`anon`, granted to `authenticated`/`service_role` |
| Views | ✓ FIXED | All 3 views now declare `security_invoker = true` with `anon` revoked |
| Default grants / RPC | ✓ VERIFIED | `increment_provider_quota` revoked from `public`/`anon`/`authenticated`, granted only to `service_role`; `prune_*` now likewise (F14) |
| SQL injection | ✓ VERIFIED | No string-built SQL anywhere; parameterised RPC only |
| XSS | ✓ VERIFIED | Zero `dangerouslySetInnerHTML` in `src/`; React escapes all provider text. Ingestion-time `stripHtml` now added as defence in depth (F7) |
| CSRF | ✓ VERIFIED | Bearer-JWT, cookieless — no ambient credentials to ride. Origin reflection is therefore safe and is documented as such |
| SSRF | ✓ VERIFIED | Provider URLs are code-constructed from allowlisted hosts; no user-supplied URL is fetched |
| Open redirect | ✓ VERIFIED | Only redirect is the host-canonicalisation 301, driven by `CANONICAL_HOST`, not by request input |
| Secrets | ✓ VERIFIED | Read only in `runtimeConfigFromEnv`; sent as headers, never in URLs; error strings truncated to 160 chars |
| Prompt injection | ✓ VERIFIED | Résumés are fenced (`<<<RESUME>>>`) with an explicit "this is DATA, never instructions" guard. Job text still never reaches an LLM (`aiSimilar` unwired) |
| CSP / headers | ✓ VERIFIED live | On `finatrix.co`: CSP, HSTS (preload), `nosniff`, `SAMEORIGIN`, Referrer-Policy, Permissions-Policy all present and correct |

### Open, previously documented, still unresolved

| Finding | Severity | State |
|---|:--:|---|
| Per-IP quota is bypassable — `CF-Connecting-IP` is trusted but Supabase Edge is not behind Cloudflare, so a caller can forge and rotate it (`index.ts:547`) | P2 | ❌ FAILED |
| Quota store degrades **open** on outage — deliberate (availability over protection), acceptable only with monitoring, which does not yet exist (§9) | P2 | ⚠ Accepted risk |
| Client owns the prompts — `body.system`/`body.user` are entirely caller-controlled, so an authenticated user can drive the platform's OpenRouter key as a general LLM proxy, bounded only by the 60/day quota and model allowlist | P2 | ⚠ Architectural choice — document or constrain |

### Dependencies — ✓ VERIFIED, assessed

`npm audit --omit=dev`: 3 advisories (1 low, 2 high). None critical, so CI passes. Each assessed:

| Package | Severity | Reachable? | Disposition |
|---|:--:|---|---|
| `xlsx@0.18.5` | high | Yes | No registry fix exists; patched build ships from SheetJS's CDN. Pre-existing accepted risk |
| `react-router@7.18.0` (GHSA-qwww-vcr4-c8h2) | high | **No** | RSC-mode CSRF bypass. Verified the app uses only `<BrowserRouter>` + declarative `<Routes>` — no `createBrowserRouter`, no `RouterProvider`, no route actions/loaders, no RSC. Fixed only in 8.3.0 (major upgrade) — schedule, do not rush pre-launch |
| `dompurify@3.4.11` (via `jspdf`) | low | **No** | Only invoked by `jsPDF.html()`; verified the codebase uses `jsPDF` solely via `autoTable`/text |

All three are now recorded in `.github/workflows/ci.yml` so the accepted-risk set is explicit.

---

## 4 · Performance Review

**⚠ BLOCKED — benchmarking at 50 / 100 / 500 / 1000 users could not be performed.** No load-testing
harness exists in the repo, and driving real load requires an authenticated user session plus live
provider quota. P50/P95/P99, provider latency, cache hit rate, DB utilisation, memory, CPU, API
cost and connection pooling are therefore all **⚠ BLOCKED**, not estimated.

What *was* measured:

| Item | Result |
|---|---|
| Cloudflare cache | ✓ VERIFIED not applicable — job search is a Supabase Edge (Deno) function; Cloudflare fronts only static assets. `/assets/*` and `/fonts/*` are immutable-cached for 1y |
| Background refresh | ❌ Not implemented — every search is on-demand |
| Bundle budget | ✓ VERIFIED — build succeeds; heavy vendors (`xlsx`, `pdf`, `jspdf`, `html2canvas`) are lazy chunks, never in the initial payload. `JobsPage` 88.9 kB / 27.3 kB gz |
| Effective cache hit rate **in production** | ❌ **0%** — see F3. `provider_cache` does not exist, so `TieredCache` falls through to a per-isolate LRU that dies with the isolate |

**F3 has a direct cost consequence.** The Fantastic-Jobs vendor bills a *job credit per returned
record* on top of a request credit. With the durable cache absent, the 15-minute search TTL never
takes effect across isolates, so repeat searches re-burn credits against the smaller of the two
budgets. This is the single highest-value fix for API spend.

**One code-level performance note (P3).** `ProviderDeduplicator.deduplicate` recomputes
`normToken(job.company)` inside the inner loop for every candidate pair — O(n²) on short strings.
At the current ceiling (10 providers × 40 results = 400 jobs) this is tens of milliseconds and not
worth changing now; hoisting the token is a one-line improvement if the per-provider cap ever rises.

---

## 5 · Provider Verification Report

### 5.1 — Deployed code is not the fixed code · **P0** · ❌ FAILED

**This is the most serious finding of the engagement.**

**Evidence.** Downloaded the live function source (`supabase functions download careers-jobs`,
project `uspbsgbggurggsfsontq`, version 29, ACTIVE, updated 2026-07-24T23:14:15Z) and diffed it
against the repository. The deployed `providers/fantasticJobs.ts` reads:

```ts
const q = new URLSearchParams({
  title_filter: title,
  description_type: 'text',
});
if (location) q.set('location_filter', location);
if (input.remoteOnly) q.set('remote', 'true');
if (input.page > 0) q.set('offset', String(input.page * 10));
return { url: `https://${host}/active-jb-7d?${q.toString()}`, … };
```

Every one of those is the v2-era contract the repo already corrected: wrong path
(`/active-jb-7d` vs `/active-ats` and `/active-jb`), wrong parameter names (`title_filter`,
`location_filter`, `description_type`), a `remote` parameter that does not exist, missing required
`time_frame`, and pagination hard-coded to tens regardless of page size. The deployed
`ActiveJobsProvider` correspondingly calls `buildFantasticRequest(HOST, key, input)` — the old
three-argument signature, with no `PATH` constant at all.

**Root cause.** The correction was made in the repository and never deployed. There is no gate that
compares deployed function state to `main`, and `supabase functions deploy` is a manual step absent
from CI (`.github/workflows/deploy.yml` ships only the Cloudflare Worker).

**Business impact.** In production **right now**, the three highest-priority providers
(Active Jobs DB · 100, LinkedIn · 90, Job Posting Feed · 50) fail on every search. Result quality,
coverage and freshness are materially worse than the product claims, and users see a degraded
search with no indication anything is wrong.
**Engineering impact.** All local evidence about provider behaviour describes code that is not
running. Every failure is silent by design (fail-closed → empty list → provider marked unhealthy).
**Risk.** Critical. Launching in this state ships a knowingly broken core feature.

**Recommendation.** Deploy `careers-jobs` before anything else, then re-verify. Add a deploy step
for edge functions to CI so repo and production cannot drift again.
**Owner:** DevOps + Backend · **Effort:** S to deploy; M to add the CI gate
**Acceptance criteria.** `supabase functions download careers-jobs` diffs clean against `main`; one
live search returns non-zero counts for `activejobs` and `linkedin`.

### 5.2 — Provider secrets are misnamed; Workday is unconfigurable · **P1** · ❌ FAILED

**Evidence.** `supabase secrets list` on the live project. (The API returns SHA-256 digests, not
values — no secret was exposed. Digests are used below only to compare which entries hold the same
value.)

| Secret name in Supabase | Name the code reads | Read? |
|---|---|:--:|
| `RAPIDAPI_KEY` · `ADZUNA_APP_ID` · `ADZUNA_APP_KEY` · `JOOBLE_KEY` · `OPENROUTER_API_KEY` | same | ✓ |
| `Active Jobs DB` | `ACTIVE_JOBS_KEY` | ✗ |
| `Linkedin Job search` | `LINKEDIN_JOBS_KEY` | ✗ |
| `Job Posting Feed API` | `JOB_POSTING_FEED_KEY` | ✗ |
| `Google Jobs` | `GOOGLE_JOBS_KEY` | ✗ |
| `Glassdoor Jobs` | `GLASSDOOR_KEY` | ✗ |
| `Workday Jobs` | `WORKDAY_KEY` | ✗ |
| *(absent)* | `WORKDAY_HOST` | — |

`runtimeConfigFromEnv` (`factory.ts:57-60`) reads exactly eight canonical names. The six
label-named entries — with spaces, so not valid environment identifiers — are never consulted.

Two distinct consequences follow:

1. **Five providers silently run on the shared key.** `BaseProvider.key()` falls back to
   `RAPIDAPI_KEY`, and five of the six labels carry the *same* digest as `RAPIDAPI_KEY`
   (`548e9fc2…`), so Active Jobs, LinkedIn, Google Jobs, Glassdoor and Workday would use the right
   value by accident.
2. **Job Posting Feed will always fail.** `Job Posting Feed API` carries a **different** digest
   (`800ed517…`). Because `JOB_POSTING_FEED_KEY` is unset, the provider falls back to
   `RAPIDAPI_KEY` — the wrong key. Every call 401/403s, the breaker trips, and the provider is
   auto-disabled.
3. **Workday is dead.** `WORKDAY_HOST` is absent, so `buildSearchRequest` returns `null`,
   `isConfigured()` is false, and the provider is reported `not-configured` and never called. This
   is correct fail-safe behaviour — but the provider contributes nothing.

**Root cause.** Secrets were entered under human-readable marketplace labels rather than the
documented env-var names. Nothing validates secret names against what the code expects.
**Business impact.** One paid subscription entirely unused; one provider permanently dark.
**Risk.** Medium — silent, and invisible until per-provider metrics exist (which they do not, §9).

**Recommendation.** Re-set the six secrets under their canonical names, add `WORKDAY_HOST`, and
delete the label-named duplicates. Add a startup log line naming which providers resolved a key.
**Owner:** DevOps · **Effort:** S
**Acceptance criteria.** `supabase secrets list` shows only canonical names; a live search reports
`ok` for `jobpostingfeed`; `workday` is no longer `not-configured`.

### 5.3 — Non-ISO `posted_at` reached the client and the database · **P1** · ✓ FIXED

**Evidence.** Reproduced directly against the adapters (temporary test, output captured):

```
GoogleJobs   RAW postedDate = "2 days ago"
             WIRE posted_at = "2 days ago"        freshness = unknown
             new Date(posted_at) → Invalid Date
Workday      WIRE posted_at = "Posted 3 Days Ago" freshness = unknown
```

Both values come straight from the adapters' own documented fixtures
(`detected_extensions.posted_at`, `postedOn`). The contract states ISO 8601 or null
(`types.ts:37`, `WireJob.posted_at`).

**Root cause.** `sanitize.iso()` existed and was unit-tested but was never called by any adapter or
by the normaliser; `normalize()` assigned `raw.postedDate` verbatim.

**Business impact.** Three compounding failures:
- `public.jobs.posted_at` is `timestamptz` and `saveJob` inserts the value unmodified
  (`jobsService.ts:161`) — **saving a Google Jobs or Workday result fails with a PostgREST 400**.
- `freshness` collapses to `unknown`, which is 20% of the ranking weight (`DEFAULT_WEIGHTS`), so
  these providers' results are systematically mis-ranked.
- No freshness badge is ever earned, and the UI renders "—" for the date.

**Fix.** New `sanitize.postedDate()` parses absolute dates first, then the relative forms real
providers emit (`2 days ago`, `Posted 3 Days Ago`, `30+ days ago`, `5 hours ago`, `1 week ago`,
`Just posted`, `Yesterday`), and returns **null** for anything it cannot read — never an invented
date. Applied in `normalize()` alongside `iso()` for `closesAt`.
**Acceptance criteria** (now enforced by tests). Every `postedDate`/`closesAt` leaving `normalize`
either parses via `new Date()` or is `null`; `"2 days ago"` yields `freshness: 'this_week'`.

### 5.4 — Provider HTML was never stripped · **P2** · ✓ FIXED

**Evidence.** `stripHtml()` exists in `sanitize.ts`, has 4 unit tests, and — verified by grep — was
**called from nowhere**. Reproduced:

```
DESCRIPTION ON WIRE = "<p>Great <b>role</b></p><script>alert(1)</script><img src=x onerror=alert(1)>"
```

**Root cause.** Helper written, never wired into the normalisation path.
**Business impact.** Not XSS — React escapes it and there is no `dangerouslySetInnerHTML`. But the
markup was persisted to `public.jobs.description`, rendered to users as literal tags, fed into
`jobContentSha` (weakening dedupe), and forwarded into the AI prompt as `jobText`
(`JobsPage.tsx:582`) — inflating token cost and widening the prompt-injection surface on
attacker-authored text.
**Fix.** `normalize()` now sanitises once at the trust boundary and derives every downstream signal
(skills, work mode, quality, similarity) from the clean record.
**Acceptance criteria** (enforced). No `<` survives into `WireJob.description`; skill extraction
still finds `python`/`aws` in stripped text.

### 5.5 — Per-provider verification status

| Provider | Endpoint | Auth | Request schema | Response schema | Pagination | Live call |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Active Jobs DB | ✓ docs | ✓ | ✓ fixed | ✓ fixed | ✓ fixed | ⚠ BLOCKED |
| LinkedIn Job Search | ✓ docs | ✓ | ✓ fixed | ✓ fixed | ✓ fixed | ⚠ BLOCKED |
| Job Posting Feed | ✓ docs | ❌ wrong key (§5.2) | ✓ fixed | ✓ fixed | ✓ fixed | ⚠ BLOCKED |
| Google Jobs | ⚠ BLOCKED | ✓ | ⚠ BLOCKED | ⚠ BLOCKED | ⚠ BLOCKED | ⚠ BLOCKED |
| Glassdoor | ⚠ BLOCKED | ✓ | ⚠ BLOCKED | ⚠ BLOCKED | ⚠ BLOCKED | ⚠ BLOCKED |
| Workday | ⚠ by design | ❌ no `WORKDAY_HOST` | ⚠ BLOCKED | ⚠ BLOCKED | ⚠ BLOCKED | ⚠ BLOCKED |
| Adzuna · JSearch · Jooble · Remotive | ✓ | ✓ | ✓ | ✓ | ✓ | ⚠ BLOCKED |

All ten fail **closed**: a wrong shape yields `[]` and marks the provider unhealthy. None can
corrupt results — but three may silently contribute nothing.

### 5.6 — Live searches · ⚠ BLOCKED

The five required searches — *Risk Analyst Melbourne*, *Financial Crime Analyst Sydney*,
*Compliance Analyst Brisbane*, *Software Engineer Melbourne*, *Data Analyst Perth* — **could not be
run**. `careers-jobs` requires a user JWT; only the public anon key is available, and it is
correctly rejected (verified: 401). Search quality, duplicate removal, ranking, pagination,
enrichment and provider prioritisation are therefore **⚠ BLOCKED** end-to-end, though each is
✓ VERIFIED in isolation by the 64-test provider suite.

**To unblock:** supply a test account, or run the searches from a signed-in browser session and
capture the `status`/`counts`/`latency` map the function already returns.

*Note:* these five queries are all Australian. Provider routing defaults to `country: 'in'`
(`DEFAULT_SEARCH_PARAMS`), so they must be issued with `country: 'au'` or Adzuna will hit the India
endpoint and the Fantastic-Jobs family will send `location: 'India'`.

---

## 6 · Accessibility Report (WCAG 2.2 AA)

Assessed the code changed in this workstream. The existing platform-wide audit
(`docs/audit/VOL2-UX-DESIGN-ACCESSIBILITY.md`) remains the authority for the rest.

| Item | Status | Evidence |
|---|:--:|---|
| Landmarks · focus order · focus visibility | ✓ VERIFIED unchanged | No landmark or focus-management code touched |
| Colour contrast | ✓ VERIFIED | `src/test/contrast.test.ts` passes; new badges reuse the existing `badge-green` token |
| Labels · forms | ✓ VERIFIED | `a11yFormLabels.test.ts` passes; no new form controls added |
| Tables | ✓ FIXED | New provider-health table had bare `<th>`; added `scope="col"`, matching `CompanyProfilePage.tsx:259` |
| Screen-reader support for new content | ✓ VERIFIED | Trust badges are plain text in `<span>`; the search-status region already carries `role="status"` |
| Dialogs · keyboard nav · mobile | ✓ VERIFIED unchanged | Covered by `MobileNav`/`MobileDrawer`/`Tabs` suites, all passing |

**One observation, not a defect.** The trust chips are colour-coded green but carry a text label, so
they do not rely on colour alone (1.4.1 satisfied). Capping the display at 4 badges is a sensible
cognitive-load choice.

---

## 7 · SEO Report

### F9 — Neither branded domain resolves · **P1** · ❌ FAILED

**Evidence.**

```
finatrix.co      → NXDOMAIN
www.finatrix.co  → NXDOMAIN
finatrix.co       → NXDOMAIN
finatrix.co → 104.21.56.138
```

The application is live and correct **only** on the workers.dev host:

```
/healthz → 200 · / → 200 · /nope → 404      ← true 404, not a soft-404 ✓ VERIFIED
```

Every SEO asset points at the dead domain: `<link rel="canonical" href="https://finatrix.co/">`,
`og:url`, `og:image`, the JSON-LD `@id`/`url`/`logo`, all 12 `sitemap.xml` entries, and the
`Sitemap:` line in `robots.txt`. Confirmed live: `https://finatrix.co/images/finatrix-wordmark.jpg`
→ unresolvable, while the same path on workers.dev → 200.

**Business impact.** Zero organic discoverability. Google cannot fetch the sitemap; every social
share renders without an image; the canonical points at a host that does not exist. The entire SEO
investment — and the sitemap's stated "primary long-tail acquisition surface" — is inert.
**Recommendation.** Complete DNS + SSL for the chosen apex, bind the Worker to it, then set
`CANONICAL_HOST` (the 301 logic is built, tested and inert until then).
**Owner:** DevOps · **Effort:** S (plus DNS propagation)
**Acceptance criteria.** Apex resolves and serves 200; `/sitemap.xml` and the OG image return 200
on the branded host; Search Console fetches the sitemap without error.

### F10 — Canonical and Open Graph tags are static across all SPA routes · **P2** · ❌ FAILED

**Evidence.** `index.html:33` hard-codes `canonical` to `/`. Every client route serves that same
shell (the Worker copies `/index.html`'s headers and body). Verified against the deployed site: the
markup on `/` is byte-identical to what `/tools/budget` receives. Per-route `document.title` **is**
handled (`App.tsx:88`), but `canonical`, `og:url`, `og:title`, `og:description` are not.

**Business impact.** Every tool page declares the homepage as its canonical, inviting Google to
consolidate them into `/` — directly defeating the long-tail strategy the sitemap encodes. All
social shares of tool pages show homepage copy.
**Risk.** Medium. **Deliberately not fixed here:** this changes indexing behaviour and touches an
existing assertion (`src/test/deploy-config.test.ts:35`); it warrants explicit sign-off, not a
drive-by edit during a hardening pass.
**Recommendation.** Extend the existing per-route title effect to also set `canonical`/`og:*` from
one route-metadata map. Update `deploy-config.test.ts` to assert the *default* rather than a
global invariant.
**Owner:** Frontend · **Effort:** M
**Acceptance criteria.** `/tools/budget` renders `canonical` = `<apex>/tools/budget`; each sitemap
URL is self-canonical.

### Verified sound ✓

| Item | Status |
|---|:--:|
| `robots.txt` present, permissive, `/profile` disallowed | ✓ VERIFIED |
| `sitemap.xml` well-formed, 12 URLs, priorities sane | ✓ VERIFIED (wrong host) |
| Structured data (Organization + WebApplication `@graph`) | ✓ VERIFIED |
| Twitter card `summary_large_image` | ✓ VERIFIED |
| 404 handling — genuine 404, no soft-404 | ✓ VERIFIED live |
| Redirects — host canonicalisation built and unit-tested, inert until `CANONICAL_HOST` | ✓ VERIFIED |
| hreflang | ❌ Absent — single-locale product; not required today |
| Careers routes in sitemap | ❌ Absent — correct: they sit behind auth |

---

## 8 · Infrastructure Review

### F3 — No provider or analytics infrastructure exists in the database · **P0** · ❌ FAILED

**Evidence.** PostgREST probe of the live project. `PGRST205` means the relation does not exist —
the control shows existing-but-RLS-protected tables return `200 []` instead:

| Relation | Result |
|---|---|
| `provider_cache`, `provider_health_events`, `provider_metric_events`, `job_search_history`, `provider_quota` | **404 PGRST205** |
| `provider_ops_health`, `provider_ops_top_terms`, `provider_ops_search_volume` | **404 PGRST205** |
| `analytics_events`, `analytics_event_counts_daily` | **404 PGRST205** |
| `jobs`, `platform_roles`, `resume_skills` *(control)* | **200 `[]`** ✓ |

**Root cause.** `careers_provider_infrastructure.sql` and `analytics_schema.sql` were authored but
never applied. Migrations are manual (`psql -f`) with no applied-state tracking.

**Runtime consequence, traced.** In `getManager()`, `createClient` succeeds (URL + service-role key
both exist), so the `try` block does **not** throw and the Supabase-backed stores are installed —
pointed at tables that do not exist. Every method then swallows its error and returns a safe
default. Net effect in production:

- **Cache:** always misses → every search fans out to every provider → full API cost, every time.
- **Health:** `load()` returns `[]` → no provider is ever gated → a dead provider is retried on
  every single search.
- **Quota:** `hit()` returns `0` on error → **degrades open** → the only real limit is the
  per-isolate burst counter.
- **Metrics + search history:** dropped → the admin dashboard is permanently empty.

All of it silent. The graceful degradation that makes the system robust is also what hides this.

**Business impact.** Direct, ongoing API overspend; no operational visibility at launch.
**Risk.** Critical for launch readiness.
**Recommendation.** Apply both SQL files (with this session's fixes) before release. Adopt
`supabase/migrations/` with tracked filenames so applied state is knowable.
**Owner:** Backend/DevOps · **Effort:** S to apply; M to adopt tracked migrations
**Acceptance criteria.** All 5 tables + 3 views exist; after one search, `provider_metric_events`
has rows and the admin Job Providers tab renders real data.

### Verified sound ✓

| Item | Status | Evidence |
|---|:--:|---|
| Edge functions deployed and ACTIVE | ✓ VERIFIED | 4 functions: `careers-jobs` v29, `careers-ai` v25, `careers-email` v13, `analytics-collect` v4 |
| Cloudflare Worker | ✓ VERIFIED live | `/healthz` 200 · known route 200 · unknown route true 404 |
| Static asset caching | ✓ VERIFIED | `/assets/*`, `/fonts/*` immutable, 1 year |
| CSP scoped to documents only | ✓ VERIFIED | Not under `/*` — deliberate, so the self-hosted OCR worker's WASM still compiles |
| CI gates | ✓ VERIFIED | tsc → eslint → test → build → audit, on every branch and PR |
| Deploy pipeline | ⚠ Partial | `deploy.yml` ships the Worker only. **Edge functions and SQL are entirely manual** — the direct cause of F1 and F3 |
| Rollback | ✓ VERIFIED documented | `wrangler rollback`; SQL is `create or replace`/idempotent |
| Backups / restore | ✓ VERIFIED documented | Supabase daily backups; PITR needs Pro (flagged before public beta). Storage bucket not covered — résumé *text* survives in `resume_versions.raw_text`, original files do not |

---

## 9 · Monitoring Review

| Item | Status | Evidence |
|---|:--:|---|
| Sentry | ❌ Not integrated | Explicitly deferred (`docs/PROJECT-HANDOFF.md` §15). No DSN, no SDK |
| Structured logging | ✓ VERIFIED | `careers-jobs` emits one PII-free JSON line per search; `careers-ai` now does too (F2) |
| Client error capture | ✓ VERIFIED | `ErrorBoundary` + `unhandledrejection` handler in `src/lib/errorReporting.ts` |
| Provider health | ❌ FAILED in production | Logic ✓ VERIFIED by 13 tests, but `provider_health_events` does not exist (F3) → always empty |
| Latency / failure / analytics dashboards | ❌ FAILED in production | Admin UI ✓ wired, but reads views that do not exist (F3) |
| Provider metrics · cost metrics | ❌ FAILED in production | Same cause |
| **Quota dashboards** | ❌ **FAILED by design** | See below |
| Alerts | ❌ None | No alerting on provider failure rate, quota exhaustion or error budget |
| Uptime | ✓ VERIFIED available | `/healthz` answers 200 on any host; no monitor is configured against it |

### F12 — Quota telemetry is collected and then discarded · **P3** · ❌ FAILED

**Evidence.** `BaseProvider.rawFetch` reads `x-ratelimit-requests-remaining` and returns it — but
`fetchJson` destructures only `{ json }` and drops it, and `ProviderManager.runProvider` hard-codes
`quotaRemaining: null` on every health event. `HealthSnapshot.quotaRemaining` is therefore
permanently `null` in production.

Compounding it, the *binding* constraint is not read at all: this vendor family bills a **job
credit per record** (`x-ratelimit-jobs-remaining`), a smaller budget than requests. The dashboard
would show healthy request quota right up to the moment job credits run out.

**Recommendation.** Thread the observed quota back through the search path and record both headers.
**Deliberately not fixed here** — it requires a signature change on the `JobProvider` interface,
which exceeds a minimal hardening change and deserves a designed fix rather than mutable
per-instance state that would race across concurrent searches in one isolate.
**Owner:** Backend · **Effort:** M
**Acceptance criteria.** After a live search, `provider_health_events.quota_remaining` is non-null;
job-credit remaining is visible in the admin dashboard.

---

## 10 · Documentation Review

| Document | Status | Note |
|---|:--:|---|
| Architecture (`PROJECT-HANDOFF.md`) | ✓ VERIFIED | Thorough; matches the code |
| Deployment (`DEPLOYMENT.md`) | ⚠ Incomplete | Covers the Worker and DB well; **no edge-function deployment procedure** — the gap behind F1 |
| Operations / release (`RELEASE.md`) | ✓ VERIFIED | Step-by-step with rollback at each step |
| Runbooks | ⚠ Partial | Rollback and backup covered; no incident-response or on-call runbook |
| Provider onboarding | ⚠ Partial | Code is self-documenting (add one object to `buildNativeProviders`); **no doc lists the canonical secret names** — the gap behind F5 |
| Developer onboarding (`SETUP.md`) | ✓ VERIFIED | Complete |
| API documentation (`API.md`) | ✓ VERIFIED | Present |
| Environment variables | ⚠ Incomplete | `.env.example` covers client vars only. No manifest of the 8 provider secrets + `CAREERS_*` tuning vars |
| Troubleshooting | ✓ VERIFIED | Covered in handoff |
| Disaster recovery | ⚠ Partial | Backup/restore documented; no tested restore drill |
| `CAREERS_PRODUCTION_READINESS.md` | ⚠ **Correct fixes, wrong blocker** | Its provider-contract work is excellent and verified. Its headline claim — "No provider API credentials exist anywhere in this environment" — is **wrong**: it checked the local shell and `.env` but never the live project, where credentials do exist (§5.2). It also could not know its own fixes were never deployed |

**Documentation actions.** Add an env-var manifest with canonical secret names; add the edge-
function deploy procedure to `DEPLOYMENT.md`; correct the credentials claim in the readiness report.

---

## 11 · Risk Register

| ID | Risk | Likelihood | Impact | Severity | Mitigation | Owner |
|---|---|:--:|:--:|:--:|---|---|
| R1 | Repo and production drift again after this deploy | High | Critical | **P0** | Add edge-function deploy to CI; gate on a downloaded-source diff | DevOps |
| R2 | Résumé PII already retained in existing edge logs | Medium | High | **P0** | Purge/expire `careers-ai` logs; verify retention settings | Backend |
| R3 | API overspend from the absent durable cache | High | High | **P1** | Apply the migration before launch; monitor cost daily for week 1 | Backend |
| R4 | Job-credit exhaustion with no warning | Medium | High | **P1** | Track `x-ratelimit-jobs-remaining` (F12); alert at 20% remaining | Backend |
| R5 | Glassdoor licence exposure — vendor self-describes as an unofficial API of a site whose ToS forbids scraping | Medium | High | **P1** | Legal ruling. Ship disabled via `CAREERS_DISABLED_PROVIDERS` until cleared | Product + Legal |
| R6 | Google Jobs licence exposure — scraped SERP data | Medium | Medium | **P2** | Same review | Product + Legal |
| R7 | Quota degrades open during a DB outage | Low | Medium | **P2** | Accepted — but requires the alerting that does not yet exist | Backend |
| R8 | Anonymous request flood (F8) | Medium | Medium | **P2** | Pre-auth IP burst limit | Backend |
| R9 | Per-IP quota forgeable via `CF-Connecting-IP` (F20) | Medium | Medium | **P2** | Use the platform-supplied client IP | Backend |
| R10 | `xlsx` high advisory, no registry fix | Low | Medium | **P2** | Accepted + documented; migrate to the CDN build or replace | Frontend |
| R11 | No error monitoring at launch | High | Medium | **P2** | Sentry before public traffic | DevOps |
| R12 | Storage bucket outside backup coverage | Low | Medium | **P3** | Accepted for beta; revisit at GA | DevOps |

---

## 12 · Technical Debt Register

| ID | Debt | Severity | Effort | Note |
|---|---|:--:|:--:|---|
| D1 | Edge functions and SQL deploy manually; no applied-state tracking | P0 | M | Root cause of F1 and F3 |
| D2 | Adapter fixtures are invented, not captured | P1 | S | Tests are written to become real regression guards the moment a live payload replaces them |
| D3 | Google Jobs / Glassdoor / Workday mappings unverified | P1 | M | Fail closed, so they can only under-deliver — never corrupt |
| D4 | `CAREERS_PROVIDER_RETRIES` does not apply to `BaseProvider` (hard-codes 1 retry) | P3 | S | Documented as tunable; is not. Fix the code or the doc |
| D5 | `LegacyProvider.health()` returns `ok: true` unconditionally | P3 | S | Admin "test provider" reports healthy for the 4 incumbents without probing |
| D6 | Cache-hit path leaves `counts`/`latency` empty while setting `status: 'ok'` | P3 | S | Low impact since per-source counts were de-branded out of the UI |
| D7 | `company_logo` is delivered on the wire and typed, but never rendered — and CSP `img-src 'self' data: blob:` would block third-party logos if it were | P3 | S | Decide: render (and extend CSP) or stop sending it |
| D8 | `listJobSources()` / `job_sources` now dead after de-branding | P3 | S | Remove, or repurpose for the admin surface |
| D9 | No load-testing harness | P2 | M | Blocks all of Phase 4 |
| D10 | `react-router` v8 migration | P2 | M | Advisory not exploitable here; upgrade on a normal cycle |
| D11 | `deduplicate` recomputes `normToken(company)` per pair | P3 | S | Immaterial at 400 jobs; revisit if the cap rises |

---

## 13 · Production Readiness Checklist

| # | Item | Status |
|---|---|:--:|
| 1 | Provider abstraction · manager · normaliser · dedupe · ranking · cache · health · metrics · rate limiter | ✓ VERIFIED (64 provider tests) |
| 2 | Unified `FinatriXJob` model + wire superset | ✓ VERIFIED |
| 3 | Retry · timeout · parallel execution · fault isolation | ✓ VERIFIED (`allSettled`; no provider can fail a search) |
| 4 | Deterministic AI enrichment | ✓ VERIFIED — LLM hooks deliberately off (cost control) |
| 5 | Truthful provider badges + de-branding | ✓ VERIFIED |
| 6 | TypeScript · ESLint · unit + integration tests · build | ✓ VERIFIED (1006 tests) |
| 7 | Provider request/response contracts (Fantastic-Jobs ×3) | ✓ FIXED in repo · ❌ **not deployed** (F1) |
| 8 | Google Jobs · Glassdoor · Workday contracts | ⚠ BLOCKED |
| 9 | Live provider calls · quotas · rate limits | ⚠ BLOCKED (no test session) |
| 10 | The five required live searches | ⚠ BLOCKED |
| 11 | `posted_at` ISO contract | ✓ FIXED |
| 12 | Description sanitisation | ✓ FIXED |
| 13 | Résumé PII out of logs | ✓ FIXED |
| 14 | RLS on every table | ✓ VERIFIED |
| 15 | `security_invoker` on every view | ✓ FIXED (all 3) |
| 16 | SECURITY DEFINER review · default grants · anon/authenticated/service roles | ✓ VERIFIED |
| 17 | Auth · authorisation · JWT handling | ✓ VERIFIED |
| 18 | SQLi · XSS · CSRF · SSRF · open redirect · CSP | ✓ VERIFIED |
| 19 | Prompt injection | ✓ VERIFIED (fenced + guarded) |
| 20 | Rate limiting — authenticated | ✓ VERIFIED |
| 21 | Rate limiting — unauthenticated | ❌ FAILED (F8) |
| 22 | Per-IP quota integrity | ❌ FAILED (F20) |
| 23 | Dependency vulnerabilities | ✓ VERIFIED assessed (3, none critical, 2 unreachable) |
| 24 | Database migrations applied | ❌ FAILED (F3) |
| 25 | Environment variables / secret names | ❌ FAILED (F5) |
| 26 | Deployed code matches repo | ❌ FAILED (F1) |
| 27 | Cloudflare configuration · Worker · headers · 404 | ✓ VERIFIED live |
| 28 | Backups · restore · rollback | ✓ VERIFIED documented (restore never drilled) |
| 29 | Load benchmark 50/100/500/1000 · P50/P95/P99 | ⚠ BLOCKED |
| 30 | Cache hit rate · DB · memory · CPU · API cost | ⚠ BLOCKED (0% cache in production — F3) |
| 31 | Sentry | ❌ FAILED (not integrated, deliberately) |
| 32 | Structured logging | ✓ VERIFIED |
| 33 | Provider health · latency · failure · quota · cost dashboards | ❌ FAILED (F3, F12) |
| 34 | Alerting | ❌ FAILED (none) |
| 35 | robots · sitemap · OG · Twitter · JSON-LD · 404 · redirects | ✓ VERIFIED (pointing at a dead host — F9) |
| 36 | Production domain resolves | ❌ FAILED (F9) |
| 37 | Canonical URLs per route | ❌ FAILED (F10) |
| 38 | hreflang | ✓ VERIFIED n/a (single locale) |
| 39 | WCAG 2.2 AA on changed surfaces | ✓ VERIFIED / ✓ FIXED (table headers) |
| 40 | Documentation — architecture · deploy · ops · runbooks · onboarding · env · DR | ⚠ Partial (§10) |
| 41 | Licence / ToS ruling (Glassdoor, Google Jobs) | ⚠ BLOCKED — legal decision |

---

## 14 · Release Recommendation

### 🔴 DO NOT RELEASE

Not because the engineering is weak — it is not — but because **what is deployed is not what was
built, tested and reviewed**, and because a debug statement has been writing users' résumés into
logs. Neither is acceptable at a public launch, and neither is visible from the repository alone.

### Ordered path to green

**Blocking — in this order**

1. **Deploy `careers-ai`.** Stops PII reaching the logs. Then purge existing logs. *(F2)*
2. **Apply both SQL files** — `careers_provider_infrastructure.sql` and `analytics_schema.sql`,
   including this session's `security_invoker` and grant fixes. *(F3, F4)*
3. **Deploy `careers-jobs`.** Ships the corrected provider contract plus the date and HTML fixes.
   Verify with `supabase functions download` + diff. *(F1, F6, F7)*
4. **Re-set the provider secrets** under canonical names; add `WORKDAY_HOST`; delete the
   label-named duplicates. *(F5)*
5. **Run the five live searches** with a signed-in test account. Capture the `status`/`counts`/
   `latency` map and replace the invented adapter fixtures with real redacted payloads.
   *(unblocks §5.5, §5.6, D2)*
6. **Verify Google Jobs, Glassdoor and Workday** against those live responses. *(D3)*
7. **Point DNS at the Worker**, then set `CANONICAL_HOST`. *(F9)*
8. **Obtain a licence ruling on Glassdoor** — ship it disabled via `CAREERS_DISABLED_PROVIDERS`
   until cleared. *(R5)*

**Strongly recommended before public traffic**

9. Pre-auth IP rate limit *(F8)* · trustworthy IP source *(F20)*
10. Sentry, plus alerts on provider failure rate and quota exhaustion *(R11, R4)*
11. Track `x-ratelimit-jobs-remaining` *(F12)*
12. Per-route canonical/OG tags *(F10)*
13. Add edge-function deploy to CI so R1 cannot recur

**Deferred**

14. Load benchmark *(D9)* · dashboard time-series *(F12)* · `react-router` v8 *(D10)* · restore
    drill *(R12)*

### Assessment

Items 1–4 are hours of work, not weeks. The provider architecture is sound, fault isolation is
real and demonstrated, security posture is strong once the two view/log defects are shipped, and
test coverage is genuinely good. **After steps 1–7 the platform is a credible launch candidate**,
with the licence ruling (8) the one item outside engineering's control.

The pattern worth fixing permanently is item 13: every P0 in this report except F2 exists because a
correct change sat in the repository and never reached production.

---

*No financial formula, calculation, educational logic, calculator behaviour or financial assumption
was modified in this engagement. Verification: 1006 tests pass (73 files) · tsc clean · ESLint clean
· production build succeeds.*
