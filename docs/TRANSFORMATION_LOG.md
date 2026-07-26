# FinatriX Transformation Log

Chronological record of the production-transformation work. Newest entries at the top.
Each entry records: date · files · reason · impact · risk · tests · follow-up.

Guardrails on every entry: **financial formulas frozen**, **parity tests must stay green**,
**"educational tools, not financial advice" preserved**.

Baseline at start of transformation (11 Jul 2026): `tsc -b` clean · **779 tests / 43 files pass**
(incl. **533 parity assertions**) · ESLint clean at the pinned `eslint-plugin-react-hooks@7.0.1`.
Current: `tsc -b` clean · **794 tests / 45 files pass** (533 parity) · changed code lint-clean.

---

## 2026-07-11 — Design-system foundation (tokens, a11y, primitives)

Built the shared visual language every page will use — **no page-by-page redesign**. Values are
identical to what already rendered, so zero visual drift; verified by a clean production build that
compiled the tokens and the `.fx-tools` references. Gate: `tsc -b` clean · **802 tests / 46 files pass**
(533 parity) · lint clean · `vite build` succeeds. Full reference: `docs/DESIGN_SYSTEM.md`.

- **Canonical tokens** (`src/styles/tokens.css`, loaded first in `main.tsx`): surfaces/ink/accent/
  status/hairlines/radius/spacing/elevation/motion/focus/z-index — one source of truth.
- **Unified the two token systems:** `src/tools/tools.css` `.fx-tools` block now *references* the
  canonical tokens (`--gold: var(--accent)`, `--bg: var(--surface-1)`, `--ink3: var(--ink-3)`, …)
  instead of duplicate literals. `--ink`/`--ease-out` inherit from `:root` (avoided a self-ref cycle).
- **A11y foundation** (`src/index.css`): token-driven `*:focus-visible` ring; a **global
  reduced-motion** safety net; a **high-contrast** (`prefers-contrast: more`) block that lifts muted
  inks/borders toward AAA app-wide (works because tools/careers inherit the tokens).
- **Primitives** (`src/components/Button.tsx`, `Badge.tsx`): composition-first (variant class +
  verbatim `className`) so migrations are byte-identical. `LoginReminderModal` migrated to `<Button>`
  as proof. Tests: `src/test/primitives.test.tsx` (5).
- **Tailwind:** added `app` (#060607) + documented the hex→named-token migration map (additive).
- Scope discipline: call-site hex→token migration is incremental + visually verified, not a blind
  repo-wide sweep (I can't see rendered pixels here; visual regressions are the one class of bug the
  test suite can't catch).

---

## 2026-07-11 — Release engineering: domain-migration redirect + runbook

Note on scope: this environment has **no authenticated production access** (wrangler not logged in, no
Supabase CLI, no Cloudflare/Supabase/GitHub tokens, CF API → 403). Deploy/DNS/schema-apply are therefore
owner/CI actions. The repo is made one-command-deployable instead.

- **Domain-migration 301 in the Worker** (`worker/index.ts` + `canonicalRedirect()` in `src/shared/routes.ts`):
  legacy/www hosts → `finatrix.co`, path+query preserved. **Gated on `CANONICAL_HOST`** (unset = inert),
  so it ships now and activates at cutover; previews/localhost never redirect. `/healthz` answers first on
  any host. 3 new unit tests (worker-routes → 8). `wrangler.jsonc` gains the `CANONICAL_HOST` var (empty).
- **`docs/RELEASE.md`** — exact, ordered, copy-pasteable cutover runbook (Supabase SQL apply + verify
  queries, pg_cron, edge-function deploys + secrets, Worker deploy, domain binding, the single-flip
  `CANONICAL_HOST` cutover, canonical/SEO swap, post-launch verification, rollback per step).
- Gate: `tsc -b` clean · **797 tests / 45 files pass** · **533 parity** · changed code lint-clean.

---

## 2026-07-11 — Independent launch-readiness review + migration prep

- **`docs/LAUNCH_READINESS.md`** — independent, block-if-not-world-class audit with a dimension
  scorecard, **CONDITIONAL GO** verdict, 4 operational launch blockers (apply DB SQL · smoke-test the
  404 Worker · deploy analytics · run Lighthouse+axe), a prioritized checklist, the `.online → .space`
  migration plan, residual risks, and the deferred Phase-3 product roadmap.
- **CORS consistency:** added `finatrix.co` (+ www) to the `careers-ai` and `careers-jobs` default
  origin allowlists (analytics-collect already had it) — removes a domain-migration footgun. Additive
  and safe.
- Corrected an earlier assessment: `/tools` **redirects** to a tool (encoded in `AppRouting.test.tsx`),
  so a real hub / Unified Financial Dashboard is a deliberate Phase-3 IA change with a returning-user
  tradeoff — scoped as deferred product work, not forced in.

---

## 2026-07-11 — Phase A: Privacy-first observability & analytics

A complete cookieless, no-fingerprint, DNT/GPC-respecting observability foundation. Off by default
(no endpoint → nothing runs). Financial math untouched; `tsc -b` clean, **lint clean**, **791/791
tests pass** (+6). Full design in `docs/OBSERVABILITY.md`.

- **Client analytics** (`src/lib/analytics.ts`): ephemeral in-memory session id (never persisted),
  event-name + prop-key allowlists, PII stripping, string caps, route-template-only paths, batched
  `sendBeacon` flush on tab-hide. Disabled under Do-Not-Track / Global Privacy Control.
- **Web Vitals** (`src/lib/webVitals.ts`): TTFB/FCP/LCP/CLS/INP via `PerformanceObserver` (no new
  dependency), reported with good/needs-improvement/poor ratings.
- **Error monitoring** (`src/lib/errorReporting.ts` + `ErrorBoundary`): global handlers report error
  **type + route only** — never message/stack (privacy) — throttled per session.
- **Ingest** (`supabase/functions/analytics-collect`): public but per-IP rate-limited (**IP never
  stored**), CORS allowlist, server-side re-validation of the event/prop allowlist, service-role
  insert. Clients cannot write the table directly.
- **Store** (`supabase/analytics_schema.sql`): anonymous `analytics_events`, RLS with **no client
  write policy** + admin-only reads, size/length constraints, `prune_analytics_events(days)` retention
  (90d) + `analytics_event_counts_daily` rollup view. All functions `search_path`-pinned.
- **Health probe:** `GET /healthz` added to `worker/index.ts`.
- **Instrumented now:** page_view, tool_view, signup-prompt funnel, web_vital, app_error,
  route_not_found. **Defined & ready to wire:** tool_completed, search_performed, careers_view.
- **Config:** `VITE_ANALYTICS_URL` (optional) added to `.env.example`. New regression tests:
  `analytics.test.ts` (6) + observability assertions in `deploy-config.test.ts` (3).
- **Deploy note:** apply `supabase/analytics_schema.sql`, deploy `analytics-collect`
  (`--no-verify-jwt`), set `VITE_ANALYTICS_URL`, and schedule `prune_analytics_events` via pg_cron.

---

## 2026-07-11 — Phase 2: Supabase security & schema review (repo-based)

Full read of `supabase/*.sql`, edge functions, and client data-access. Findings + residual risks in
`docs/SECURITY_REVIEW.md`. All fixes are additive/idempotent; financial math untouched; **785/785 tests
pass**, `tsc -b` clean. No production credentials needed (repo is authoritative; two self-serve live
checks documented).

- **S-1 (Medium) — coupon enumeration fixed.** `coupons` select was `using (active = true)` → any signed-in
  user could dump all active codes. Now admin-only; added `SECURITY DEFINER validate_coupon(p_code)` RPC
  that validates a single submitted code server-side; client `applyCoupon()` uses it.
  Files: `supabase/careers_phase4_schema.sql`, `src/careers/services/subscriptions.ts`.
- **S-2 (Medium) — latent RLS infinite-recursion fixed.** `platform_roles_select` → `is_platform_admin()`
  → reads `platform_roles` → same policy. Made `is_platform_admin` `SECURITY DEFINER` (breaks the cycle)
  + `set search_path = ''`, with execute revoked from public/anon. Also fixes broken admin cross-row reads.
- **S-3 (Hardening) — pinned `search_path`** on `increment_ai_usage` + `careers_touch_updated_at`
  (Supabase "mutable search path" class). Bodies already schema-qualified → no behaviour change.
- **S-4 (Hardening) — `tool_data` payload cap** `check (pg_column_size(data) <= 1 MB)` (storage-abuse
  defense-in-depth). Files: `supabase/schema.sql`.
- **S-5 (Low) — server-stamped `updated_at`** via `fx_touch_updated_at()` + trigger (prevents client
  backdating; `cloudSync` doesn't use it for conflict logic, so no regression).
- **Accepted/noted:** S-6 analytics write-flood (bounded; no user_id to spoof), S-7 feature-flag override
  disclosure (no PII), S-8 `careers-ai` client-supplied system prompt (bounded by quota/rate/model caps).
- **Strong as-found (no change needed):** RLS on all tables, exemplary `resumes` storage isolation,
  no SSRF in `careers-jobs`, atomic AI quota, CORS allowlists, secrets hygiene.
- **Deploy note:** re-apply the schema files (SQL Editor, in order) to push S-1…S-5 live — **S-2 means
  admin cross-row reads may be broken on the live DB until applied.**

---

## 2026-07-11 — Phase 1: Close the audit (table-stakes credibility)

All remaining open audit findings, verified against source. Financial math untouched;
**785 tests / 44 files pass** (was 779; +6 new), `tsc -b` clean, changed files lint-clean.

### 1a — Sitemap completeness (S8-1)
- **Files:** `public/sitemap.xml`, `src/test/deploy-config.test.ts`, `src/shared/routes.ts`
- **Reason:** the sitemap listed 4 URLs; the 7 calculators (the acquisition surface) were absent.
- **Impact:** all 7 tool pages now discoverable by search engines. Highest ROI/hour in the plan.
- **Decision (challenged the audit):** deliberately **held `/careers` out** — it's 100% login-gated,
  and listing a walled page in a sitemap is an SEO anti-pattern. It rejoins in Phase 3 once it has a
  public preview.
- **Risk:** none. **Tests:** new assertion iterates `TOOL_IDS` (single source of truth).

### 1b — Real HTTP 404 (FX-05 / S8-2)
- **Files:** `wrangler.jsonc`, `worker/index.ts` (new), `src/shared/routes.ts` (new),
  `src/test/worker-routes.test.ts` (new), `src/test/deploy-config.test.ts`
- **Reason:** `not_found_handling: "single-page-application"` returned **HTTP 200** for every unknown
  path (soft-404) — dilutes indexing, fools uptime monitors.
- **Change:** replaced the SPA-200 fallback with a Cloudflare Worker (Workers + Assets model). The
  Worker runs only on asset-misses and serves the SPA shell with an honest status — **200** for real
  routes, **404** for unknown URLs — using a shared, unit-tested `isKnownRoute()`. Security/caching
  headers from `_headers` are preserved.
- **Risk:** medium — the edge glue can't be exercised in-sandbox. Route logic is unit-tested (5 tests);
  **the deployed Worker must get a `wrangler dev` / preview smoke test before go-live** (see follow-up).
- **Root-cause bonus:** created `src/shared/routes.ts` as the single source of truth for route knowledge
  (used by the Worker, the sitemap test, and available to the app), preventing client/edge drift.

### 1c — Semantic H1 on tool pages (A6-2 / S8-3)
- **Files:** `src/tools/ui/common.tsx`, `src/tools/tools.css`
- **Reason:** tool pages led with `<h2>`, zero `<h1>` — SEO + screen-reader navigation gap.
- **Change:** the shared `PageHead` now renders `<h1>` (one change fixes all 7 tools). Verified: exactly
  one `h1` per page (header uses a logo, not a heading), no heading-level skips (sub-sections are divs).
- **Risk:** none. Parity fixtures untouched.

### 1d — Contrast to WCAG AA (A6-3)
- **Files:** `src/tools/tools.css` (`--ink3`), `ToolsLayout.tsx`, `careers/CareersLayout.tsx`,
  `AuthShell.tsx`, `LandingClose.tsx`, `LandingHero.tsx`, `LoginReminderModal.tsx`
- **Reason:** muted greys failed AA — `--ink3 #6b6b70` ≈ 3.46:1 and `#5A5A5A` ≈ 2.87:1 as body text.
- **Change:** `--ink3` → `#8b8b90` (~5.8:1); standardized failing text greys to `#8A8A8A` (~5.7:1).
  Comfortable AA margin; hierarchy still carried by size/weight/letter-spacing.
- **Follow-up:** the greys are still hardcoded hex in many places — tokenize in Phase 4.

### 1e — Unified clock (FX-03)
- **Files:** `src/tools/ui/LocalClock.tsx`, `src/sections/LandingFooter.tsx`
- **Reason:** the landing footer ran a bespoke **UTC** clock while every tool used local time — a
  trust-eroding inconsistency on a finance product.
- **Change:** deleted the bespoke clock; the footer now uses `<LocalClock compact />`. Made `LocalClock`
  context-independent (token references carry explicit fallbacks) so it renders correctly outside the
  `.fx-tools` scope. One clock, one source of truth, sitewide.
- **Risk:** none.

### 1f — Branded loading state (perceived performance)
- **Files:** `src/components/RouteFallback.tsx` (new), `src/App.tsx`
- **Reason:** code-split routes fell back to a blank dark screen (jarring flash on direct nav).
- **Change:** a branded fallback (FinatriX mark + slim indeterminate top bar), `role="status"`,
  `sr-only` label, **all motion disabled under `prefers-reduced-motion`**.
- **Risk:** none.

### 1g — Signup prompt at a value moment (FX-01)
- **Files:** `src/components/LoginReminderModal.tsx`
- **Reason:** the account modal interrupted the landing hero before any value was shown.
- **Change:** it no longer arms on the landing or on first tool arrival — it appears when a guest opens
  their **second distinct calculator** (a genuine "save your progress across tools" moment), still once
  per browser, and its entry animation now respects `prefers-reduced-motion`.
- **Risk:** none — under-prompting is safer than interrupting; header + bottom-CTA still offer accounts.

### Verification & honest notes
- `tsc -b` clean · **785/785 tests pass** · **533/533 parity** · changed files **lint-clean**.
- **Lint caveat (sandbox artifact):** an in-sandbox `npm install` bumped `eslint-plugin-react-hooks`
  to 7.1.1, whose new rules surface **16 pre-existing issues** in *unmodified* files (careers pages,
  BudgetPage, InvestMatchPage). The project **pins 7.0.1**, and CI runs `npm ci` + `eslint --max-warnings 0`
  against it, so the real baseline lints clean. Watch item: **if the team upgrades to 7.1.x**, schedule a
  dedicated `react-hooks` code-health pass (mostly `set-state-in-effect`) — do it carefully, as two of
  the files are calculators.
- **Pre-deploy follow-up:** smoke-test the 404 Worker with `wrangler dev` (verify `/tools/budget` → 200,
  `/nope` → 404, security headers intact) before shipping.

---

## 2026-07-11 — Phase 0: Truth & guardrails

### Docs/config reconciliation (hosting + architecture drift)
- **Files:** `README.md`, `src/pages/Privacy.tsx`
- **Reason:** README and Privacy Policy described **Netlify hosting** and a **`tools-app.html`
  iframe**. The live app runs on **Cloudflare Workers** (`wrangler.jsonc`, `.github/workflows/deploy.yml`
  → `wrangler deploy`; no `netlify.toml` exists) with **native React tool routes** (`ToolRoute.tsx`).
- **Impact:** (1) Compliance — an inaccurate sub-processor disclosure is a defect under the DPDP
  Act/GDPR language the policy invokes; Privacy now names **Cloudflare** and the "updated" date is
  bumped to 11 July 2026. (2) Diligence/DevEx — README now reflects the real stack, deploy pipeline,
  and route model, and states explicitly that there is no iframe/`tools-app.html` at runtime.
- **Risk:** None to runtime (docs + one JSX string). No formula/logic touched.
- **Tests:** Covered by the Phase 1 verification gate (tsc + full suite + parity).
- **Follow-up:** Give `/terms` the same accuracy review `/privacy` received (Phase 2).

### Change log established
- **Files:** `docs/TRANSFORMATION_LOG.md` (this file)
- **Reason:** Directive requires a maintained change log for every meaningful change.

### Deferred (needs product decision, not blocked)
- **Analytics + error monitoring** (Phase 0 of the roadmap): intentionally **not** wired yet.
  Adding any third-party SDK conflicts with the "no trackers" promise, so vendor/approach is a
  product call. Recommendation on the table: cookieless, self-hostable analytics + lightweight
  error reporting. Awaiting the owner's choice before implementing.

---

## Template for future entries

```
## YYYY-MM-DD — <Phase / title>
- **Files:** …
- **Reason:** …
- **Impact:** …
- **Risk:** …
- **Tests:** …
- **Follow-up:** …
```
