# FinatriX Careers — Production Readiness Report

**Date:** 2026-07-25 · **Scope:** multi-provider job search (6 new providers + 4 incumbents)
**Verdict:** 🔴 **NOT READY for production release.** One release-blocking dependency (no API
credentials) and one licence question that needs a human decision.

Every claim below is backed by evidence gathered in this session. Where something could not be
verified, it is marked **BLOCKED** with the reason — nothing is assumed working.

---

> ## ⚠️ CORRECTION — 2026-07-25, later the same day
>
> Two claims in this report are now known to be wrong. See
> [`PRODUCTION_RELEASE_ASSESSMENT.md`](PRODUCTION_RELEASE_ASSESSMENT.md) for the evidence.
>
> 1. **§0's headline blocker is incorrect.** Provider credentials **do** exist — in the live
>    Supabase project, which this report never queried (it checked only the local shell and
>    `.env`). `supabase secrets list` shows `RAPIDAPI_KEY`, `ADZUNA_*`, `JOOBLE_KEY` and
>    `OPENROUTER_API_KEY` under their canonical names, plus six provider keys entered under
>    human-readable labels (`"Active Jobs DB"`, `"Google Jobs"`, …) that the code never reads.
>    The real defect is a **secret-naming mismatch**, not absent credentials — and
>    `WORKDAY_HOST` is genuinely missing, which is why Workday can never run.
>
> 2. **The fixes described below were never deployed.** The live `careers-jobs` function
>    (v29, 2026-07-24T23:14Z) still runs the broken v2 contract — `/active-jb-7d`,
>    `title_filter`, `description_type`. Verified by downloading the deployed source and
>    diffing it against this repository. All three Fantastic-Jobs providers are therefore
>    failing in production right now.
>
> Additionally, none of the tables this work depends on exist in the live database
> (`provider_cache`, `provider_health_events`, `provider_metric_events`, `job_search_history`,
> `provider_quota` — all `PGRST205`), so the deployed function runs with no cache, no health
> gating, no quota enforcement and no metrics.
>
> The provider-contract analysis in §1–§7 below remains **correct and valuable** — it simply
> describes code that has not yet reached production.

---

## 0 · The blocker, stated plainly

> **Superseded — see the correction above.** Credentials exist in the live project; they are
> misnamed. The paragraph below records only what the *local* environment contained.

**No provider API credentials exist anywhere in this environment.**

Evidence:
- `.env` contains only `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (public client keys).
- No `RAPIDAPI_KEY`, `ACTIVE_JOBS_KEY`, `LINKEDIN_JOBS_KEY`, `JOB_POSTING_FEED_KEY`,
  `GOOGLE_JOBS_KEY`, `GLASSDOOR_KEY`, `WORKDAY_KEY`/`WORKDAY_HOST` in the shell, `.env`, or the repo.
- Network egress works (`rapidapi.com` → HTTP 200), so this is a credentials gap, not connectivity.

Consequently **items 18 (smoke tests) and 19 (performance benchmarking) cannot be executed**, and
live-response verification for all providers is impossible. Everything that *could* be verified
without keys, was — including, decisively, the request contracts.

### What unauthenticated probing can and cannot prove

Two control experiments established exactly how much signal is available without a key:

| Probe | Result | Conclusion |
|---|---|---|
| Nonsense **path** on a real host | `401 Invalid API key` | Gateway authenticates *before* routing → **paths are NOT verifiable** by probing |
| Nonsense **host** (`finatrix-totally-fake-api-xyz123`) | `404 {"message":"API doesn't exists"}` | 401-vs-404 **is** a valid host-existence signal |

All six provider hosts returned `401`, not `404` → **all six hosts exist on RapidAPI (verified).**
Endpoint paths therefore had to be verified from documentation, which is what was done.

---

## 1–7 · Provider contract verification

### 🔴 Critical defect found and fixed: all three Fantastic-Jobs providers were non-functional

`ActiveJobsProvider`, `LinkedInProvider`, and `JobPostingFeedProvider` share one request builder.
It targeted a **v2-era contract that no longer exists**. Every search request from all three
providers would have failed.

Authoritative evidence — verbatim cURL from the live RapidAPI v4 playground:

```
https://active-jobs-db.p.rapidapi.com/active-ats
  ?time_frame=24h&limit=10&offset=0&description_format=text&title=…&location=…
https://job-posting-feed-api.p.rapidapi.com/active-ats
  ?description_format=text&include_basic_organization_details=true
https://linkedin-job-search-api.p.rapidapi.com/active-jb
  ?time_frame=24h&title=…&location=…
```

Response schema verified from the vendor docs: <https://developer.fantastic.jobs/api/new-jobs>

| # | Defect (before) | Correct (after) | Impact |
|---|---|---|---|
| 1 | Path `/active-jb-7d` for **all three** | `/active-ats`, `/active-ats`, `/active-jb` | **Total failure** — wrong path, and ATS hosts were sent a job-board path |
| 2 | `title_filter=` | `title=` | Filter silently ignored |
| 3 | `location_filter=` | `location=` | Filter silently ignored |
| 4 | `description_type=text` | `description_format=text` | Descriptions in wrong format |
| 5 | `time_frame` **absent** (required) | `time_frame=7d` | Request invalid |
| 6 | `remote=true` (undocumented param) | removed | Not a real parameter |
| 7 | `offset = page × 10`, no `limit` | `limit = maxResultsPerProvider`, `offset = page × limit` | **Broken pagination** (page 2 skipped 20 of 100) + **60% of paid job credits wasted** |
| 8 | `date_validthrough` | `date_valid_through` | `closesAt` always null |
| 9 | `linkedin_org_industry` | `org_linkedin_industry` | `industry` always empty |
| 10 | `salary_raw.value.minValue` only | flat `ai_salary_min/max_value`, `ai_salary_currency`, `ai_salary_unit_text` | **All salaries lost** |
| 11 | `remote_derived` only | `ai_work_arrangement` + `location_type` + legacy fallback | Remote detection lost |

Defect #7 is worth emphasising: this vendor bills a **job credit per returned record** *in addition*
to a request credit (`x-ratelimit-jobs-limit: 200000` vs `x-ratelimit-requests-limit: 25000`).
Omitting `limit` took the vendor default of 100 rows while the code kept only 40 — burning 60% of
the job quota on every call, against the *smaller* of the two budgets.

**Fixed** in `providers/fantasticJobs.ts` + the three provider classes. Parsers accept both the
documented and legacy field spellings, so a payload of either generation maps correctly.

**Why tests didn't catch this:** the fixtures in `adapters.test.ts` were *invented*, not captured —
they encoded the same wrong schema as the parser, so the suite was green against a broken
integration. Fixtures are now rebuilt from the documented v4 record and assert the real endpoint,
params, and pagination arithmetic (13 adapter tests, up from 9).

### 🚫 BLOCKED — three providers could not be documentation-verified

| Provider | Host | Path in code | Status |
|---|---|---|---|
| Google Jobs | `google-jobs.p.rapidapi.com` ✅ exists | `/search` | **Unverified** — no public docs reachable |
| Glassdoor | `glassdoor-real-time.p.rapidapi.com` ✅ exists | `/jobs/search` | **Unverified** — only `/companies/interview-details` was observable |
| Workday | per-tenant `WORKDAY_HOST` | `/search` | **Unverified by design** — Workday has no global endpoint; the aggregator convention is assumed |

These three need one live call each with a real key before release. All fail *closed*
(a wrong shape yields `[]`, marking the provider unhealthy) so they cannot corrupt results — but
they may silently contribute nothing.

| Item | Status |
|---|---|
| 1 Verify against official docs | ⚠️ 3 of 6 verified · 3 blocked |
| 2 Validate every request | ✅ Fixed (3) · 🚫 blocked (3) |
| 3 Validate every response | ✅ Fixed (3) · 🚫 blocked (3) |
| 4 Fix incorrect field mappings | ✅ **11 defects fixed** |
| 5 Verify pagination | ✅ Fixed (was hard-coded ÷10) |
| 6 Verify authentication | ✅ Header names + all 6 hosts confirmed |
| 7 Verify rate limits | ⚠️ Request quota read correctly; **job-credit quota not tracked** |

**Rate-limit gap:** `BaseProvider` reads `x-ratelimit-requests-remaining` (correct, matches docs),
but ignores `x-ratelimit-jobs-remaining` — the *binding* constraint. The admin dashboard will show
healthy request quota right up until job credits are exhausted. Recommend tracking both.

---

## 8–14 · Pipeline verification

| Item | Status | Evidence |
|---|---|---|
| 8 Provider health reporting | ✅ Verified | `ProviderHealth.ts` + cooldown gating; 13 infra tests |
| 9 **Cloudflare Cache** | ⚠️ **Not applicable — see below** | |
| 10 Deduplication | ✅ Verified | `ProviderDeduplicator.ts`; priority-sorted so the higher-priority record wins; 7 tests |
| 11 AI enrichment | ⚠️ Deterministic only | See below |
| 12 Ranking | ✅ Verified | `ProviderRanking.ts`; covered by `dedupe_ranking.test.ts` |
| 13 Provider prioritisation | ✅ Verified | Native 100→50, incumbents 40→20; dedupe conflicts resolve to higher priority |
| 14 Graceful degradation | ✅ Verified | `Promise.allSettled` fan-out; `runProvider` converts every throw to a value; stores fall back to in-memory if the service-role client fails |

**Item 9 — there is no Cloudflare cache in this path.** The careers job search is a *Supabase edge
function* (Deno), not a Cloudflare Worker. Caching is a two-tier isolate-LRU → Postgres store
(`ProviderCache.ts`, TTL 15 min for searches). Cloudflare fronts only the static front-end.
This item appears to rest on a mistaken assumption about the architecture; the caching that does
exist was reviewed and is sound (deterministic key including the active provider set, stable
key ordering, prefix invalidation, and user skills correctly *excluded* from the key so no
per-user data leaks between cache consumers).

**Item 11 — AI enrichment is deliberately partial.** Deterministic enrichment (work mode,
seniority, skills, quality, confidence, freshness, truthful badges) runs on every job. The
AI-assisted near-duplicate hook (`aiSimilar`) is supported by `ProviderManager` but **is never
supplied in `index.ts`**, so it is off in production. That is defensible cost control, but it is
currently undocumented — a reader of the architecture doc would reasonably assume it is live.

---

## 15 · Environment variables

✅ Verified. All provider secrets are read **only** at the composition root
(`runtimeConfigFromEnv`), never inside a provider; each provider degrades to `not-configured`
rather than failing when its key is absent; a shared `RAPIDAPI_KEY` fallback is supported.

⚠️ **One inconsistency:** `CAREERS_PROVIDER_RETRIES` is documented as "config-tunable; 0 disables
retries", but it is only consulted by the legacy fetch path (`index.ts:177`). The six new providers
use `BaseProvider.fetchJson`, which **hard-codes** one retry (`attempt < 2`). Setting the variable
to `0` will not disable retries for the new providers.

---

## 16 · Database migrations

✅ Verified, and 🔴 **one P1 security defect found and fixed.**

The schema is otherwise well-built: RLS enabled on every table, no client-writable policies,
the quota RPC revoked from `public`/`anon`/`authenticated` and granted only to `service_role`,
and `set search_path = ''` on all functions (blocks object-resolution hijacking).

**P1 — admin-only dashboard views bypassed RLS entirely.**

`provider_ops_health` and `provider_ops_top_terms` were created without `security_invoker`.
Postgres defaults this to **false**, which applies the *view owner's* RLS policies to the base
tables — and since the owner also owns those tables, RLS is bypassed completely. In Supabase,
`anon`/`authenticated` receive `SELECT` on new public-schema objects by default.

> "If any of the underlying base relations has row-level security enabled, then by default, the
> row-level security policies of the view owner are applied."
> — [PostgreSQL CREATE VIEW docs](https://www.postgresql.org/docs/15/sql-createview.html)

**Impact:** any signed-in user could have read internal per-provider cost/latency data *and*
`provider_ops_top_terms` — the job-search queries of **every other user**. That is a privacy
breach, not just an info leak.

**Fixed:** both views now declare `with (security_invoker = true)`, with `revoke all … from anon`
as defence in depth. The source comment previously asserted the opposite of the real behaviour and
has been corrected.

⚠️ **The identical defect exists in `supabase/analytics_schema.sql:66`**
(`analytics_event_counts_daily`) — out of scope for this change, flagged as follow-up work.

---

## 17 · Admin dashboards

✅ Wiring verified. `providerOps.ts` reads both views; `AdminDashboard.tsx` renders 24h searches,
jobs returned, estimated cost, top provider, a per-provider health table, and a top-terms bar
chart. It degrades to a placeholder when the migration has not been applied.

Note: `providerOps.ts` documents access as "gated by the views' underlying RLS (platform admins
only)". That statement was **false before the item-16 fix** and is **true after it**.

Still missing versus the brief: latency/error **time-series graphs**, quota-usage display, and
per-provider cost trend. Present state is tabular, not graphical.

---

## 18–19 · Smoke tests & performance benchmarking

🚫 **BLOCKED — no credentials.** Neither a real search (`Risk Analyst Melbourne`,
`Software Engineer Sydney`, …) nor a 50→1000-user load benchmark can be run without provider keys.
No load-testing harness exists in the repo either; both need to be built after keys are supplied.

What *was* verified locally: **999 unit/integration tests pass** (73 files), production build
succeeds, ESLint clean.

---

## 20 · Security review

| Area | Finding |
|---|---|
| Authentication | ✅ JWT required; unauthenticated → 401 |
| Input validation | ✅ Every field clamped (query 200 chars, page 0–9, terms ≤18) |
| Secret handling | ✅ Keys sent as headers only, never in URLs or logs; error strings truncated to 160 chars and cannot carry a key |
| SQL injection | ✅ No string-built SQL; parameterised RPC only |
| Logging/PII | ✅ Structured logs carry country/counts/latency only |
| RLS | 🔴 **P1 fixed** — see item 16 |
| CORS | ⚠️ Reflects any well-formed origin. Sound *given* Bearer-JWT auth with no cookies (no ambient credentials → no CSRF), and documented as such. Acceptable; tighten via `CAREERS_ALLOWED_ORIGINS` if policy requires |
| Rate limiting | ⚠️ **Per-IP quota is bypassable** — see below |
| Quota failure mode | ⚠️ Degrades **open** on quota-store outage (deliberate: availability over protection). Accept only with monitoring |

**Per-IP quota bypass (medium).** `index.ts:547` derives the client IP from
`CF-Connecting-IP` *first*, falling back to `x-forwarded-for`. This function runs on Supabase Edge,
**not** behind Cloudflare, so nothing strips or sets `CF-Connecting-IP` — a caller can supply an
arbitrary value and rotate it to defeat the per-IP limit. Per-*user* quota still applies and auth
is required, which bounds the damage, but the per-IP dimension is not currently trustworthy.
Recommend preferring the platform-provided client IP and ignoring `CF-Connecting-IP` unless the
deployment genuinely sits behind Cloudflare.

**Prompt injection:** not currently reachable — job text is never fed to an LLM in this path
(`aiSimilar` is unwired). This must be re-reviewed *before* enabling any AI hook, since job
descriptions are attacker-controlled text.

---

## 21 · Licence & terms-of-service review

⚠️ **Requires a human/legal decision before release. I am not qualified to give legal advice; the
evidence is presented so counsel can rule.**

| Provider | Nature | Attribution | Risk |
|---|---|---|---|
| **Fantastic Jobs** ×3 (Active Jobs DB, LinkedIn Job Search, Job Posting Feed) | Licensed commercial aggregation of ATS + job-board postings | `source` → `via`, preserved ✅ | Low — commercial terms; confirm caching/retention limits against the subscription tier |
| **Glassdoor Real-Time** | RapidAPI's own listing describes it as **"Real-time data, unofficial API glassdoor.com"** | `via: 'Glassdoor'` ✅ | 🔴 **High.** An unofficial scraper of a site whose ToS prohibits scraping and redistribution. Redistributing employer ratings compounds this |
| **Google Jobs** | Unofficial aggregation of Google for Jobs results | `via` = original board, `via ` prefix stripped ✅ | ⚠️ Medium — scraped SERP data; Google ToS restricts automated access |
| **Workday** | Per-tenant public career-site endpoints | `via: '<Company> (Workday)'` ✅ | ⚠️ Medium — each tenant's site carries its own terms |

**Attribution is correctly implemented and must not be removed.** The architecture keeps `via`
(the original posting source, often licence-required) strictly separate from `provider` (the
internal vendor id, never surfaced to job seekers). The truthful-badge design is also sound: no
generic "verified" badge is emitted for postings FinatriX has not actually verified.

**Recommendation:** ship without Glassdoor unless counsel clears it. It is priority 60 of 6 and
its removal costs little coverage; the `CAREERS_DISABLED_PROVIDERS` kill-switch can disable it with
no code change.

**Caching/retention:** the 15-minute search TTL and the fact that raw payloads are never persisted
(only normalised, deduped results) are favourable for compliance. Confirm each vendor's permitted
cache duration and whether storing `job_search_history` query text conflicts with any term.

---

## 22 · Release checklist

**Blocking**
1. Supply provider API keys as Supabase secrets.
2. Run one live call per provider; replace the `adapters.test.ts` fixtures with real redacted
   payloads (the tests are written to become regression guards the moment this happens).
3. Verify the three unverified adapters (Google Jobs, Glassdoor, Workday) — endpoint path and
   response mapping.
4. Apply `supabase/careers_provider_infrastructure.sql` **with the security_invoker fix included**.
5. Obtain a licence ruling on Glassdoor (and ideally Google Jobs).

**Strongly recommended**
6. Track `x-ratelimit-jobs-remaining` alongside request quota.
7. Fix the per-IP quota source.
8. Fix `analytics_event_counts_daily` (same RLS defect).
9. Make `CAREERS_PROVIDER_RETRIES` apply to `BaseProvider`, or correct its documentation.

**Deferred (post-launch)**
10. Load benchmark at 50/100/500/1000 users.
11. Dashboard time-series graphs + quota display.
12. Error monitoring/alerting on provider failure rates.
13. Architecture, deployment, provider-onboarding and runbook documentation.

---

## Changes made in this session

| File | Change |
|---|---|
| `providers/fantasticJobs.ts` | Rewrote request builder to the verified v4 contract; salary/remote/industry/expiry mapping corrected; provenance documented |
| `providers/ActiveJobsProvider.ts` | Endpoint `/active-ats`; passes page size |
| `providers/LinkedInProvider.ts` | Endpoint `/active-jb`; passes page size |
| `providers/JobPostingFeedProvider.ts` | Endpoint `/active-ats`; passes page size |
| `providers/adapters.test.ts` | Fixtures rebuilt from documented schema; asserts endpoint/params/pagination; legacy-salary regression test (9 → 13 tests) |
| `careers_provider_infrastructure.sql` | **P1:** `security_invoker = true` on both admin views + `revoke … from anon` |

**Verification:** 999 tests pass (73 files) · `npm run build` succeeds · ESLint clean.
No financial formula, calculation, or educational logic was touched.
