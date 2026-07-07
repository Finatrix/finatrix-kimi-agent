# FinatriX — Complete Production Audit
**Date:** 2026-07-04  
**Auditor:** Claude (Cowork mode)  
**Scope:** Full codebase at `/app` — QA, Performance, Security, Database, UX, Launch Readiness

---

## Executive Summary

FinatriX is a well-engineered, two-module SaaS (Finance Tools + Careers Platform) built on React 19, Vite 7, TypeScript 5.9, Tailwind, and Supabase. The test suite passes all **754 tests across 40 files** with zero type errors and zero lint warnings. The architecture is sound — lazy-loaded routes, defence-in-depth RLS, prompt-injection guards, magic-byte file validation, client-side rate limiting, and a secure AI proxy edge function. The code quality is high with consistent error handling and no console.log left in production code.

Despite the strong foundation, **five medium-severity and several low-severity issues** were identified. The single most actionable finding is a **typo in the canonical/OG/sitemap URL** (`fiantrix.online` instead of `finatrix.online`) that will harm SEO from day one. A medium-severity **open email relay** in the transactional email edge function is the highest-risk security finding. Full details follow.

---

## Part 1 — QA & Bug Report (Prioritized)

### P1 — Critical (Launch Blocker)

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 1 | **Canonical URL / OG URL / sitemap typo** — `fiantrix.online` instead of `finatrix.online` | `index.html` (canonical, og:url, og:image ×2, structured-data ×3), `public/sitemap.xml` (4 URLs), `public/robots.txt` | All crawled inbound links, social previews, and Google's canonical signal point to the wrong domain. This will split PageRank and confuse search indexing from launch. **Fix all 9 occurrences.** |

### P2 — High Severity

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 2 | **AI usage metering race condition** — read-then-write counter is not atomic | `supabase/functions/careers-ai/index.ts` lines 149–161 | Two simultaneous requests for the same user read `calls = N`, both increment to `N+1`, and upsert the same value. A determined user can exceed the daily quota under concurrent load. Fix: use a Postgres `UPDATE … SET calls = calls + 1 WHERE …` or `rpc('increment_ai_usage', …)` to make it atomic. |
| 3 | **Open email relay** — `careers-email` sends to any address the authenticated user supplies without checking it matches their account email | `supabase/functions/careers-email/index.ts` line 41 | An authenticated attacker can call the function with `to: "victim@example.com"`, consuming Resend quota and sending unsolicited mail on FinatriX's domain. Fix: validate `to === userData.user.email` or require admin role for third-party addresses. |

### P3 — Medium Severity

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 4 | **`careers_analytics` table readable by all authenticated users** | `supabase/careers_schema.sql` — `careers_analytics_select` policy | The select policy uses `using (true)` for `to authenticated`, meaning any signed-in user can read every analytics event ever recorded. While events contain no user IDs or PII by design, the policy should be restricted to admins or removed for non-admin consumers. |
| 5 | **`careers_analytics` table has no index** | `supabase/careers_schema.sql` | The table has no index on `created_at` or `event`. As rows accumulate, any admin dashboard query scanning for analytics events will do a full table scan. Add `CREATE INDEX careers_analytics_event_idx ON careers_analytics (event, created_at DESC)`. |
| 6 | **CORS wildcard on all three edge functions** | All three `supabase/functions/*/index.ts` | `Access-Control-Allow-Origin: *` is fine for public read-only endpoints but is overly permissive for authenticated mutation endpoints. For functions that require JWT auth, restrict to `https://finatrix.online` (or the Supabase dashboard URL) in production. |

### P4 — Low Severity / Informational

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 7 | **HTMLCanvasElement.getContext console errors in test output** | `ExpensePage.test.tsx` | jsdom does not implement the Canvas API; the Chart.js `useEffect` throws "Not implemented" into stderr on every ExpensePage render test. Tests pass, but the noise masks real errors. Fix: mock `HTMLCanvasElement.prototype.getContext` in `src/test/setup.ts`. |
| 8 | **`dist/_headers` and `dist/` are tracked in git** | `.gitignore` (missing entry), repo root | The `dist/` and `dist-verify/` build artefacts are committed. This inflates repo size and causes `EPERM` errors when the sandbox tries to overwrite them. Add `dist/` and `dist-verify/` to `.gitignore`. |
| 9 | **`mammoth` (docx parser, 197 kB minified) is in the initial entry chunk** | `/tmp/finatrix-dist/assets/index-Bu08WTFA.js` — 197 kB | The `index-Bu08WTFA.js` entry chunk is 197 kB (63 kB gzip). Mammoth is statically imported via the careers module chain and pulled into the initial load even though it is only used during resume uploads. Dynamic import would reduce the initial bundle by ~197 kB. |
| 10 | **`html2canvas` is always loaded as a non-lazy dependency** | Build output — `html2canvas.esm-DXEQVQnt.js` 201 kB | html2canvas (201 kB) is included without being behind a `React.lazy` or dynamic import boundary. It is only used for PDF export. Wrapping the export action in `const { default: html2canvas } = await import('html2canvas')` would remove it from the critical path. |
| 11 | **`ParkSmartPage` fake loading delay (500ms setTimeout)** | `src/tools/pages/ParkSmartPage.tsx` line 37 | Computation is synchronous but wrapped in a 500ms delay to simulate async work. This is unnecessary UX friction; remove the `setTimeout` and call `computeParkSmart` directly (or use `startTransition`). |
| 12 | **No `aria-label` on the error boundary "Reload" button** | `src/components/ErrorBoundary.tsx` | The reload button has no accessible label beyond its text content — acceptable, but the surrounding `div` is `text-center` with no landmark. Add `role="main"` or an `aria-live="assertive"` region to surface the error to screen readers. |
| 13 | **Missing `<title>` tag updates for sub-routes** | All careers pages | The `<title>` in `index.html` is static ("FinatriX — Smart Money Tools for India"). Careers sub-pages (Jobs, Applications, etc.) never update `document.title`. Screen readers and tab previews always show the landing title. |

---

## Part 2 — Performance Audit

### Bundle Analysis

| Chunk | Size (minified) | Gzip | Status |
|-------|----------------|------|--------|
| `index-Bu08WTFA.js` (entry) | 197 kB | 63 kB | ⚠️ Contains mammoth |
| `react-B9ZJ12ue.js` | 49 kB | 17 kB | ✅ Isolated vendor |
| `supabase-Bpnwbzac.js` | 210 kB | 55 kB | ✅ Isolated vendor |
| `JobsPage-dZp8icEA.js` | 77 kB | 24 kB | ✅ Lazy route |
| `pdf-DfXYdI47.js` | 432 kB | 129 kB | ✅ Never in initial load |
| `docx-CQpOaEOd.js` | 502 kB | 131 kB | ✅ Never in initial load |
| `xlsx-CNerDvZX.js` | 429 kB | 143 kB | ✅ Never in initial load |
| `jspdf.es.min` | 386 kB | 126 kB | ✅ Never in initial load |
| `html2canvas` | 201 kB | 47 kB | ⚠️ Should be dynamic |

**Initial load (critical path):** `index-Bu08WTFA.js` + `react` + `supabase` + CSS = **~456 kB minified / ~135 kB gzip**. Good, but the mammoth inclusion in the entry chunk is wasteful.

### What's Working Well

- **Route-level code splitting** is implemented correctly — all 30+ routes are `React.lazy`. Each page only loads when visited.
- **Vendor isolation** for React, Supabase, pdf.js, docx, xlsx, jspdf is correctly configured in `vite.config.ts` `manualChunks`. These large deps never appear in the initial bundle.
- **Signed URLs** for storage downloads (120s TTL) avoids serving large files through the function, keeping edge function costs low.
- **Analysis caching** (`resume_analysis` table, keyed by SHA-256) prevents re-spending AI tokens on identical inputs — correct implementation.
- **Client-side rate limiting** (`rateLimit.ts` token-bucket) provides UX-level protection against button spam before the request reaches the server.

### Optimization Recommendations

**High impact (implement before launch):**

1. **Dynamically import mammoth** in the careers parser — saves ~197 kB from the entry chunk:
   ```ts
   // In src/careers/parser/docx.ts
   const { default: mammoth } = await import('mammoth');
   ```

2. **Dynamically import html2canvas** at the export call site — saves 201 kB from the non-lazy bundle:
   ```ts
   const html2canvas = (await import('html2canvas')).default;
   ```

**Medium impact:**

3. **Add `<link rel="preconnect" href="https://your-project.supabase.co">` to `index.html`** to reduce Supabase connection latency on first authenticated request.

4. **Add stale-while-revalidate caching** for the careers context `load()` call — currently re-fetches both `career_profiles` and `resumes` in parallel on every mount. A 60-second SWR cache would eliminate redundant fetches when navigating between careers sub-pages.

**Low impact:**

5. **Remove the ParkSmart 500ms fake delay** — synchronous computation treated as async adds friction with no benefit.

6. **Add `modulepreload` hints** for the most-visited career routes (Dashboard, Jobs) in `index.html` to pre-fetch their chunks after initial load.

### Database Query Performance

- All user-owned tables have correct composite indexes: `(user_id, updated_at DESC)` / `(user_id, created_at DESC)`.
- The SHA-256 dedup indexes on `resume_versions` and `jobs` are correct.
- `resume_analysis` cache index `(user_id, input_sha256, kind, created_at DESC)` is correctly structured.
- **Missing:** `careers_analytics` has no index — will full-scan on every admin dashboard load.
- **Missing:** `audit_log` in Phase 4 has an index on `actor_user_id` but not on `action` or `table_name` — admin filtering by action type will be slow at scale.

### React Rendering

- No unnecessary re-renders detected — `useMemo` and `useCallback` are applied correctly throughout the careers context.
- `CareersContext` wraps a `useMemo` around the entire value object — prevents all consumers from re-rendering on unrelated state changes. ✅
- `ErrorBoundary` is class-based (required by React API) and correctly placed at the app root. ✅

---

## Part 3 — Security Report

### Authentication & Session Management

| Check | Result |
|-------|--------|
| Session persisted to localStorage via Supabase | ✅ |
| Auto-refresh token enabled | ✅ |
| OAuth redirect lockdown (`redirectTo` is same-origin) | ✅ |
| Sign-out clears local state even if network fails | ✅ |
| Supabase client never exposes service role key to browser | ✅ |
| API key (OpenRouter) never in browser — edge function only | ✅ |

### Authorization & RBAC

| Check | Result |
|-------|--------|
| RLS enabled on all 30+ user-owned tables | ✅ |
| Every query also filters `eq('user_id', userId)` (defence-in-depth) | ✅ |
| `platform_roles` has no client insert/update/delete policy | ✅ |
| Admin checks in UI backed by DB-level RLS (not UI-only) | ✅ |
| `is_platform_admin()` SQL function used in RLS policies | ✅ |
| Privilege escalation via client-side flag impossible | ✅ |
| `careers_analytics` readable by all authenticated users | ⚠️ |

### Input Validation & Prompt Injection

| Check | Result |
|-------|--------|
| Magic-byte file sniffing (PDF/DOCX/DOC) before upload | ✅ |
| File size capped at 10 MB (client + bucket policy) | ✅ |
| MIME type whitelist in storage bucket + client | ✅ |
| Control character stripping (`sanitizeText`) | ✅ |
| Bidi override mark stripping | ✅ |
| HTML tag stripping on AI output fields | ✅ |
| Prompt fence (`<<<RESUME>>>` delimiters) in all AI prompts | ✅ |
| Injection guard instruction in all AI system prompts | ✅ |
| AI output validated against schema before storage | ✅ |
| Score clamped to 0–100 (`clampScore`) | ✅ |
| Max input characters enforced in edge function (80,000) | ✅ |
| Prompt token limit enforced (8,192 output tokens max) | ✅ |

### Secrets & Configuration

| Check | Result |
|-------|--------|
| `.env` in `.gitignore` | ✅ |
| `.env.example` present without real values | ✅ |
| No hardcoded API keys in source code | ✅ |
| Supabase anon key is public (by design) | ✅ — anon key is intended to be public |
| OpenRouter key only in Deno edge function secret | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` only used server-side | ✅ |

### Edge Function Security

| Check | Result |
|-------|--------|
| All functions require JWT authentication | ✅ |
| Request body size limited (80,000 chars) | ✅ |
| Model allowlist enforced (no arbitrary model injection) | ✅ |
| Daily per-user AI quota | ✅ |
| Quota enforcement is non-atomic (race condition) | ⚠️ Medium |
| CORS `*` on authenticated endpoints | ⚠️ Low |
| Email function sends to any address (open relay risk) | ⚠️ Medium |
| No per-IP rate limiting on edge functions | ⚠️ Low (Supabase platform limits apply) |

### Content Security Policy

The CSP in `index.html` is well-constructed:
```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
connect-src 'self' https://*.supabase.co wss://*.supabase.co;
object-src 'none';
```

**Note:** `unsafe-inline` for styles is required by Tailwind's inline style API. Acceptable. The `connect-src` correctly includes Supabase WebSocket (`wss://`) for realtime. All AI traffic goes through the Supabase edge function, so OpenRouter's domain is not needed in CSP — correctly absent.

### Security Findings Summary

| Severity | Finding | Fix |
|----------|---------|-----|
| **Medium** | Open email relay in `careers-email` | Restrict `to` to the authenticated user's own email |
| **Medium** | AI usage counter race condition | Use atomic Postgres increment |
| **Low** | CORS `*` on authenticated edge functions | Restrict to `https://finatrix.online` |
| **Low** | Analytics readable by all authenticated users | Restrict select policy to admins or remove |
| **Low** | No per-IP rate limiting on edge functions | Supabase platform provides baseline; consider explicit limits |

---

## Part 4 — Database Migration Review

### Migration Structure

The schema is split across four files in execution order:
1. `schema.sql` — `tool_data` table (finance tools cloud sync)
2. `careers_schema.sql` — Phase 1 (profiles, resumes, analysis)
3. `careers_phase2_schema.sql` — Phase 2 (jobs, applications, companies, interviews)
4. `careers_phase3_schema.sql` — Phase 3 (tasks, tailoring, emails, recruiters, network, assessments, offers, knowledge)
5. `careers_phase4_schema.sql` — Phase 4 (RBAC, orgs, billing, audit, feature flags)

All statements are idempotent (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS`, `ON CONFLICT DO NOTHING/UPDATE`). Safe to re-run. ✅

### Index Audit

| Table | Existing Indexes | Missing / Recommended |
|-------|-----------------|----------------------|
| `tool_data` | PK only (user_id) | ✅ Sufficient — single-row-per-user |
| `career_profiles` | PK only | ✅ Sufficient — single-row-per-user |
| `resumes` | `(user_id, updated_at DESC)` | ✅ |
| `resume_versions` | `(resume_id, version_number DESC)`, `(user_id, created_at DESC)`, `(user_id, sha256)` | ✅ |
| `resume_skills` | `(version_id)`, `(user_id, name)` | ✅ |
| `resume_analysis` | `(user_id, input_sha256, kind, created_at DESC)`, `(version_id)` | ✅ |
| `jobs` | `(user_id, created_at DESC)`, `(user_id, sha256)`, `(user_id, is_saved) WHERE is_saved` | ✅ |
| `applications` | `(user_id, stage, applied_at)` | ✅ |
| `companies` | `(user_id, name)` | ⚠️ Add `(user_id, industry)` for industry filter |
| `careers_analytics` | None | ❌ Add `(event, created_at DESC)` |
| `audit_log` | `(actor_user_id, created_at DESC)` | ⚠️ Add `(table_name, action, created_at DESC)` |
| `subscriptions` | `(user_id, status)` + unique partial | ✅ |
| `feature_flag_overrides` | `(flag, scope, scope_id)` unique | ✅ |

### Constraints & Foreign Keys

- All user-owned tables have `REFERENCES auth.users (id) ON DELETE CASCADE` — correct. ✅
- `resumes.current_version_id` does NOT have a FK to `resume_versions` — intentional (circular reference avoidance) but undocumented. The app manages this integrity in code. ✅ (acceptable)
- `generated_emails.recruiter_id` FK is added via a deferred `ALTER TABLE` in Phase 3 — correctly guarded by existence check. ✅
- `subscriptions` has a partial unique index ensuring at most one active subscription per user. ✅
- `careers_ai_usage` primary key `(user_id, day)` naturally prevents duplicate metering rows. ✅

### Normalization

The schema is appropriately normalized for a SaaS:
- JSONB is used correctly for AI payloads (variable schema, queried by app not DB), not for fields that need filtering (those are proper columns).
- `raw_text` stored on `resume_versions` is denormalized intentionally — avoids re-parsing for AI re-runs. ✅
- Subscription `features` as JSONB array is acceptable — the plan catalogue is small and infrequently queried.

### RLS Completeness

All 30+ user-owned tables have RLS enabled with full CRUD policies. ✅  
`platform_roles` is read-only from the client — no insert/update/delete policy. ✅  
`subscription_plans` and `coupons` are read-all-authenticated, write-admin-only. ✅  
`billing_history` is insert-only via service role (future webhook). ✅

### Recommended Safe Optimizations (Implement Now)

```sql
-- 1. Index for analytics admin queries
CREATE INDEX IF NOT EXISTS careers_analytics_event_idx 
  ON public.careers_analytics (event, created_at DESC);

-- 2. Index for audit log filtering by action
CREATE INDEX IF NOT EXISTS audit_log_action_idx 
  ON public.audit_log (table_name, action, created_at DESC);

-- 3. Index for company filtering by industry
CREATE INDEX IF NOT EXISTS companies_industry_idx 
  ON public.companies (user_id, industry);
```

---

## Part 5 — UX Review

### Consistency

| Area | Status | Notes |
|------|--------|-------|
| Design language | ✅ | Dark theme (`#060607` base), gold accent (`#D4AF37`), consistent across all pages |
| Card / button components | ✅ | `btn`, `card`, `chip` classes used consistently |
| Empty states | ✅ | `EmptyState` component used across all careers pages |
| Error states | ✅ | `ErrorCard` component with retry button where applicable |
| Loading states | ✅ | 68 uses of skeleton/loading patterns in careers module |
| Toast notifications | ✅ | `useToast()` used consistently for all user feedback |
| Typography | ✅ | Geist Variable + GeistMono, consistent sizing scale |

### Responsiveness

- Mobile breakpoints defined at `640px` in `careers.css`. ✅
- Modal max-width and `max-height: 86dvh` prevent modals from overflowing on small screens. ✅
- Tools pages use CSS Grid with responsive column layouts. ✅
- **No horizontal overflow issues found** in the source layout code.
- **Careers sub-pages** — sidebar navigation may stack awkwardly on mobile (narrower than 640px). No explicit sub-640px sidebar styles observed in `careers.css`.

### Accessibility

| Check | Status | Notes |
|-------|--------|-------|
| `aria-label` on interactive elements | ⚠️ | 132 uses found — good coverage but some buttons (confirm dialogs) may lack descriptive labels |
| `role="alert"` on `ErrorCard` | ✅ | |
| `role="dialog"` + `aria-modal` on `ConfirmDialog` | ✅ | |
| Focus management in modals | ✅ | `confirmRef.current?.focus()` on open |
| Keyboard: Escape closes modal | ✅ | `onKeyDown` handler present |
| Image alt text | ✅ | `BrandLogo` has `alt="FinatriX logo"` |
| Skip links | ❌ | No skip-to-main-content link present |
| `document.title` updates per route | ❌ | Title is always the landing page title |
| Color contrast | ⚠️ | Dark grey text (`#8A8A8A`) on `#060607` background = 4.4:1 — passes AA (4.5:1 minimum) marginally; verify gold on dark meets AA |
| `noscript` fallback | ✅ | Present in `index.html` |
| `lang="en"` on `<html>` | ✅ | |

### Navigation

- Careers sidebar navigation is consistent across all sub-pages. ✅
- Back navigation works via browser history (React Router). ✅
- 404 page present and linked from Router. ✅
- `/home` redirects to `/` (legacy route preserved). ✅
- No broken internal links found in source code. ✅

### UX Improvements (No Functionality Change)

1. **Add `document.title` updates** to each Careers page component (e.g. `"Jobs — FinatriX Careers"`).
2. **Add a skip link** at the top of the page for keyboard users: `<a href="#main" className="sr-only focus:not-sr-only">Skip to content</a>`.
3. **Loading skeleton for Careers pages** — the 40vh blank div during Suspense loads is invisible to screen readers. Add `aria-busy="true"` and a visually-hidden "Loading…" text.
4. **Remove the 500ms artificial delay** in ParkSmart.
5. **Page title updates** — all careers pages should set `document.title` in a `useEffect`.
6. **Careers sidebar mobile** — add a hamburger/drawer for sub-640px viewports.

---

## Part 6 — Launch Readiness Report

### Scores by Category (0–100)

| Category | Score | Rationale |
|----------|-------|-----------|
| **Features** | 88 | Finance tools are complete. Careers has 18 pages covering the full job-search lifecycle. Billing/payments exist in schema but payment gateway (Stripe/Razorpay) is not wired. Admin "Users list", "Errors", and "System Health" sections are placeholder. |
| **Architecture** | 92 | Clean separation of concerns, lazy loading, edge function pattern for secrets, defence-in-depth RLS, composable AI pipeline. Minor issue: mammoth in entry chunk. |
| **Testing** | 85 | 754 tests, 40 files, 100% passing. Good unit coverage on business logic (sanitize, match engine, pipeline, applications). Missing: integration tests for edge functions, E2E browser tests (Playwright/Cypress). Canvas mock noise in test output. |
| **Documentation** | 80 | README, SETUP.md, SEO_GUIDE.md, multiple audit/handover docs. Schema SQL files are well-commented. Missing: API reference for edge functions, contribution guide, environment variable catalogue. |
| **Deployment** | 75 | CI pipeline (type-check → lint → test → build) is correctly configured. No CD pipeline present. `dist/` committed to git (should be gitignored). No staging environment defined. Vercel/Netlify config (`_headers`) present. |
| **Security** | 82 | Excellent auth, RLS, prompt injection guards, file validation. Two medium findings (email relay, metering race condition) need fixing before launch. CORS wildcard is low risk. |
| **Performance** | 83 | Route-level splitting is excellent. Vendor isolation correct. Two large deps (mammoth 197kB, html2canvas 201kB) not yet lazy — fixable in hours. No N+1 queries. Good cache strategy. |
| **UX / Accessibility** | 74 | Consistent design system, empty/error/loading states everywhere. Missing: skip links, dynamic titles, mobile sidebar for careers. Color contrast marginally passes. |

### Overall Readiness Score: **82 / 100**

---

### Blockers Preventing Launch

#### P1 — Must Fix Before Any Public Traffic

| # | Blocker | Effort |
|---|---------|--------|
| B1 | **Canonical/OG URL typo** (`fiantrix.online` → `finatrix.online`) in `index.html`, `sitemap.xml`, `robots.txt` | 5 minutes |

#### P2 — Fix Before Launch (Security / Correctness)

| # | Blocker | Effort |
|---|---------|--------|
| B2 | **Email relay** — restrict `careers-email` recipient to authenticated user's own email | 30 minutes |
| B3 | **AI quota race condition** — make metering atomic | 1 hour |
| B4 | **`dist/` committed to git** — add to `.gitignore`, remove from tracking | 10 minutes |

#### P3 — Strongly Recommended Before Launch

| # | Item | Effort |
|---|------|--------|
| B5 | Dynamic import for mammoth (removes 197 kB from entry chunk) | 1–2 hours |
| B6 | Dynamic import for html2canvas | 1 hour |
| B7 | Canvas mock in test setup (eliminates stderr noise) | 15 minutes |
| B8 | `document.title` updates on each careers route | 2 hours |
| B9 | Skip-to-content link for accessibility | 30 minutes |
| B10 | `careers_analytics` index | 5 minutes |
| B11 | Restrict `careers_analytics` select policy to admins | 15 minutes |

---

### What Is Production-Ready ✅

- All 754 tests pass — zero failures
- TypeScript strict — zero type errors
- ESLint — zero warnings
- Build succeeds and produces correct chunked output
- RLS on all 30+ tables with correct owner-only policies
- RBAC with DB-enforced admin roles (not client-only)
- Prompt injection guards on all AI inputs
- File upload: magic-byte sniffing, MIME whitelist, 10 MB cap
- AI proxy edge function with auth, metering, model allowlist, fallback chain
- Analysis caching (SHA-256 keyed) to avoid redundant AI calls
- Client-side rate limiting token bucket
- Defence-in-depth: both UI guards and DB RLS for every restricted action
- Correct CSP headers
- PWA manifest, robots.txt, sitemap (except URL typo)
- Lazy loading for all 30+ routes
- Error boundaries at app root
- Graceful degradation when Supabase is not configured

---

## Appendix — File References

| Finding | File(s) |
|---------|---------|
| Canonical URL typo | `index.html` lines 21, 42, 45, 58, 68, 70, 71, 81, 84; `public/sitemap.xml`; `public/robots.txt` |
| Email relay | `supabase/functions/careers-email/index.ts` line 41 |
| AI quota race | `supabase/functions/careers-ai/index.ts` lines 149–161 |
| Analytics RLS | `supabase/careers_schema.sql` — `careers_analytics_select` policy |
| Missing analytics index | `supabase/careers_schema.sql` |
| Canvas test noise | `src/test/setup.ts` (missing mock) |
| dist/ in git | `.gitignore` |
| Mammoth in entry chunk | `src/careers/parser/docx.ts` |
| html2canvas not lazy | Any tool page that triggers export |
| ParkSmart fake delay | `src/tools/pages/ParkSmartPage.tsx` line 37 |
| Missing document.title | All `src/careers/pages/*.tsx` |
| Missing skip link | `src/main.tsx` or root layout |
