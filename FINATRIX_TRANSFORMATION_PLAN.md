# FinatriX — Master Transformation Plan

**Owner:** CPO / Principal Engineer
**Date:** 11 July 2026
**Status:** Study & planning phase — *no implementation yet*
**Inputs:** `FinatriX_Master_Website_Audit.pdf` (18pp, black-box, 11 Jul 2026) + full source-code review of the connected repo (`/Downloads/app`).

> This document is deliberately a *plan*, not a changelog. Nothing here has been implemented.
> It exists so we agree on the map before we move a single pixel.

---

## 0. How to read this document

The prior audit was rigorous but **black-box** — it never saw the source. My first job was to
reconcile every one of its findings against the actual code. The headline result:

**The running codebase is materially ahead of the audited preview build.** Roughly half of the
audit's confirmed defects are already fixed in source. Blindly "executing the audit" would waste
effort re-fixing solved problems and, worse, could regress work that's already correct. So this
plan is built on *verified current state*, not on the audit's snapshot.

Two hard rules govern everything below (per the founding constraints):

1. **The financial math is frozen.** Eight parity tests (`src/test/parity/*.parity.test.ts`) pin
   each calculator's output to the original `tools-app.html` logic. Every change I propose must
   keep these green. No formula, tax table, or projection model is touched.
2. **The educational mission is preserved.** "Educational tools, not financial advice" stays
   sitewide. Every calculator keeps its purpose.

---

## 1. Internal Understanding Brief

### 1.1 What FinatriX is
An education-first, **free-forever, no-ads, no-trackers** personal-finance toolkit built for an
Indian audience, plus a separate, sign-in-gated **Careers** product (resume intelligence, ATS,
job search, interview prep, coach).

Seven calculators, each with a distinct job:

| Tool | Route | Purpose |
|---|---|---|
| Budget Builder | `/tools/budget` | 50/30/20 split against monthly take-home income (entry point) |
| Expense Tracker | `/tools/expenses` | Logs expenses against Budget Builder categories (shared data model) |
| InvestMatch | `/tools/investmatch` | 6-question risk profile → Indian-instrument allocation |
| ParkSmart | `/tools/parksmart` | After-tax comparison of 10 idle-cash instruments (2026 tax rules) |
| PeerCompare | `/tools/peercompare` | Benchmarks income/savings/debt vs 14 Indian cities |
| Reverse Goal Planner | `/tools/goals` | Goal → required monthly SIP, inflation-adjusted |
| LifeMap | `/tools/lifemap` | Whole-of-life financial simulator (flagship, most ambitious) |

### 1.2 Architecture (inferred from source)
- **Frontend:** React 19 + TypeScript + Vite 7 + Tailwind 3 + React Router 7 (SPA).
- **Routing:** `src/App.tsx` — lazy/code-split routes; nested `/tools` (real index + `:toolId`)
  and a large nested `/careers` tree (~19 pages). `*` → `NotFound`.
- **Tools engine:** `src/tools/` — pure calc libs in `lib/*`, page components in `pages/*`, shared
  UI in `ui/*`, `CurrencyContext` (40 currencies), `cloudSync.ts` mirrors localStorage → Supabase.
- **Careers:** `src/careers/` — a genuinely large sub-app (parsers for pdf/docx/ocr, AI scoring via
  OpenRouter, services layer, ~19 routed pages).
- **Auth/data:** Supabase (email+password + Google OAuth, email verification, RLS, single per-user
  `tool_data` row). `AuthContext` gates signed-in state.
- **Hosting (actual):** **Cloudflare Workers** static-asset serving (`wrangler.jsonc`,
  `not_found_handling: "single-page-application"`). Edge Functions live in `supabase/functions/`.
- **Security posture (better than audit could see):** strict CSP via `<meta>` in `index.html`
  (`default-src 'self'`, `script-src 'self'`, `object-src 'none'`), plus `_headers` with HSTS
  (preload), `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
  Self-hosted fonts, preloaded. 37 test files including 8 parity suites.
- **Design system:** dark charcoal (`#060607`/`#0A0A0A`) + gold (`#D4AF37`) identity, CSS tokens in
  `src/tools/tools.css` (`--ink`/`--ink2`/`--ink3`) and `src/index.css`. Geist / Geist Mono.

### 1.3 Documentation & config drift (new finding — source only)
- **`README.md` is stale:** it claims hosting on **Netlify** and a **`tools-app.html` iframe**. The
  live code uses **Cloudflare Workers** and **native React tool routes** (`ToolRoute.tsx` explicitly:
  "there is no iframe and no tools-app.html in the running application").
- **Privacy Policy names Netlify** as the hosting sub-processor — the same drift the audit flagged
  (§3). Under the DPDP Act / GDPR language the policy itself invokes, an inaccurate sub-processor
  disclosure is a **compliance issue**, not just tidiness.

### 1.4 Product goals (synthesized, to align on)
1. Be the **most trusted** free money-education product in India — trust is the moat, not features.
2. Convert first-time visitors to **tool completion**, then to **accounts**, without dark patterns.
3. Reach **investor / enterprise / university-ready** quality bar (Apple/Stripe/Linear-grade polish).
4. Turn seven strong-but-siloed calculators into **one connected financial picture**.
5. Rank organically for high-intent long-tail queries (the tool pages are the acquisition surface).
6. Scale to millions on a low-cost edge stack without changing the free-forever promise.

---

## 2. Audit Reconciliation (finding → verified current state)

This is the core value of having source access. **"Fixed" = confirmed in code; do not redo.**

| ID | Audit finding | Sev | Verified current state | Verdict |
|---|---|---|---|---|
| FX-02 | `/tools` redirects to LifeMap, no index | P2 | Real `ToolsIndex` route exists (`App.tsx`) | ✅ Fixed |
| FX-04 | Budget accepts negative income | P1 | `numify` clamps `Math.max(0,n)` in `computeBudget`; `min={0}` on input | ✅ Fixed |
| A6-1 | 23/28 Budget fields unlabelled | Blocker | Fields now have `htmlFor`/`id` + `aria-label` | ✅ Largely fixed (verify all 7 tools) |
| S8-3 | No per-page `<title>` | Med | `DocumentTitle` + `ToolRoute` set per-route titles | ✅ Fixed |
| A6-4 | Skip-link unverified | Mod | Real `Skip to content` → `#main`, focus-styled | ✅ Fixed (keyboard pass still due) |
| FX-06 | Auth forms native-only validation | P3 | Custom `error` state + `Notice` layer in `Login.tsx` | ✅ Largely fixed (empty-submit polish) |
| — | Security headers unverifiable | — | CSP + HSTS + XFO + nosniff + Referrer/Permissions confirmed | ✅ Present |
| **FX-01** | Modal interrupts hero on load | P1 | Softened: 900ms delay, once-per-browser, full a11y (dialog/aria/Esc/focus). **Still fires on load, not at a value moment** | ⚠️ Partially addressed |
| **FX-03** | Footer clock UTC vs tool-page local time | P3 | **Still live.** `LandingFooter` runs a bespoke **UTC** clock; every tool uses `LocalClock` (user-local, different format) | ❌ Open |
| **FX-05 / S8-2** | Unknown routes return HTTP 200 (soft-404) | P2 | **Still live.** `wrangler.jsonc → not_found_handling: "single-page-application"` serves `index.html` at 200 for all unmatched paths | ❌ Open |
| **A6-2 / S8-3** | No `<h1>` on tool pages | Serious | **Still live.** `.page-head` uses `<h2>`; zero `<h1>` in any tool page | ❌ Open |
| **A6-3** | Sub-AA contrast on muted text | Serious | **Still live.** `--ink3 #6b6b70` ≈ 3.74:1; footer `#5A5A5A` ≈ 2.87:1 (AA needs 4.5:1) | ❌ Open |
| **S8-1** | Sitemap omits 7 tools + `/careers` | High | **Still live.** `sitemap.xml` lists only 4 URLs | ❌ Open |
| — | Hosting mismatch (Netlify vs Cloudflare) | — | Confirmed in **README + Privacy Policy** | ❌ Open (compliance) |

**Net: 6 confirmed items + 1 compliance drift remain open. All are Small effort except the soft-404
(Small–Medium).** The expensive-sounding audit collapses to roughly one focused engineering day of
"table-stakes" fixes — because the team already did the hard half.

---

## 3. New Audit (source-informed — things the black-box pass could not see)

Starting from zero, not assuming the prior audit was complete:

1. **Perceived-performance gap remains, differently.** The unstyled "Loading…" text is gone, but
   `RouteFallback` is still a **blank dark screen** with no skeleton. Code-splitting's cost is still
   paid entirely in perceived performance. → branded skeletons per route shape.
2. **No analytics / product instrumentation** found. Every conversion recommendation in the audit
   (§11 A/B tests) is un-runnable until events exist. This is the true prerequisite, not the tests.
3. **No error monitoring / observability** (Sentry-class) found. At 50M-user scale, runtime errors
   are invisible today.
4. **Careers is a conversion black hole** (audit §2/§11 confirmed from outside; source confirms the
   product is fully built behind the gate). Zero guest preview = the most-built feature converts 0%.
5. **Cross-tool data model is present but unsurfaced.** Budget/Expense already share categories;
   there is no "one financial picture" dashboard stitching all seven. Largest latent product value.
6. **Content staleness risk is structural.** Hardcoded "2026 tax rules" / "June 2026" strings
   (ParkSmart) will silently rot. No single dated-config source of truth.
7. **README architecture drift** (Netlify/iframe) will mislead every future engineer and every
   diligence reviewer — technical-debt-as-documentation.
8. **`/terms` never reviewed** to the standard `/privacy` was. Legal surface is asymmetric.
9. **Design tokens are split** across `index.css` (shadcn HSL vars) and `tools.css` (`--ink*` hex) —
   two token systems, drift risk. A single source of truth is needed before scaling the system.
10. **No visible reduced-motion / prefers-reduced-motion handling** for the GSAP/canvas landing —
    needs verification for WCAG 2.3.3 and vestibular safety.

---

## 4. Phased Transformation Plan

Sequenced so each phase unlocks the next. Effort: **S** = hours, **M** = a few days, **L** = a sprint+.

### Phase 0 — Truth & guardrails *(before any change)* — **S**
- Reconcile docs to reality: fix `README.md` and Privacy Policy hosting/sub-processor claims
  (Netlify → Cloudflare; remove iframe language). *Compliance + diligence integrity.*
- Confirm the parity suite + full test run is green as the baseline gate.
- Stand up **analytics events** (privacy-respecting, cookieless) and **error monitoring**. Nothing
  else is measurable without this. **Impact: unlocks every later decision.**

### Phase 1 — Close the audit (table-stakes credibility) — **S–M**
The remaining open items. Each is small; together they move Overall Readiness 6 → ~8.
- **S8-1:** add all 7 tool routes + `/careers` to `sitemap.xml`. *Highest ROI/hour in the whole plan.*
- **FX-05:** return real HTTP 404 for unmatched routes via a Cloudflare Worker allowlist (known
  route prefixes → SPA 200; everything else → 404). *Stops index dilution + fixes uptime monitoring.*
- **A6-2/S8-3:** promote each tool page's headline to a semantic `<h1>` (single shared template
  change). *Fixes all 7 at once — SEO + screen-reader navigation.*
- **A6-3:** raise `--ink3` lightness to ≥4.5:1 and fix footer `#5A5A5A`/breadcrumb greys
  (design-token fix, low risk). *WCAG AA.*
- **FX-03:** replace `LandingFooter`'s bespoke UTC clock with `<LocalClock compact />` — one clock,
  sitewide. *Removes a trust-eroding inconsistency on a finance product.*
- **FX-01:** move the account prompt from on-load to a **value moment** (after a tool produces a
  result) or exit-intent; keep the accessible modal, change only the trigger. *Conversion + first
  impression.*
- Branded **skeleton loaders** per route shape (replace blank `RouteFallback`). *Perceived quality.*
- Run **Lighthouse + axe-core** in CI to convert audit "requires validation" items into hard gates.

### Phase 2 — Trust & verification (enterprise/university gate) — **M**
- Independent **Supabase RLS** review, table by table (self-reported today).
- **Auth hardening** review: token storage (localStorage vs httpOnly), rate limiting, reset-token
  expiry, account-enumeration resistance.
- **Financial-math SME sign-off** for ParkSmart tax slabs, PeerCompare benchmarks, LifeMap model —
  *validating*, not changing, the frozen formulas. Publish a **Methodology & Sources** page (also
  new indexable SEO content).
- Date every data-backed claim (`as of <month/year>`) from a single config source of truth.
- Screen-reader + keyboard + reduced-motion + 400%-zoom manual passes.

### Phase 3 — Conversion & the connected picture (product leverage) — **M–L**
- **Careers guest preview:** sample resume score / blurred locked detail, no login. Expose the
  most-built feature. *Turns a 0% surface into a funnel.*
- **LifeMap** into 3–4 labelled steps with progress + autosave (mirror InvestMatch's proven
  "Question X of 6"). *Flagship completion rate.*
- **"Your Financial Picture" dashboard** stitching all 7 tools' outputs — the natural
  account-creation motivator and the single biggest differentiator latent in the current data model.
- Per-tool supporting educational copy ("what is the 50/30/20 rule") for long-tail SEO depth.

### Phase 4 — Design system unification & scale — **M–L**
- Merge the two token systems into one source of truth (spacing, elevation, radius, color, type,
  motion, states) documented as a living design system; standardize inline-helper, empty-state, and
  loading-state components. *Prevents drift as surface area grows.*
- Componentize empty/loading/error states with light illustration to match the identity polish.

### Phase 5 — Growth & durability (10-year horizon) — **L**
- Referral/sharing loop that fits "free forever" (e.g. share a PeerCompare city ranking).
- Light gamification for completing the suite (pairs with existing "Open everything" framing).
- Student / Family / Professional modes; widgets; smart reminders — *only if they earn their keep.*

---

## 5. Priority Order (single ranked list)

| # | Item | Impact | Effort | Phase |
|---|---|---|---|---|
| 1 | Analytics + error monitoring | Unlocks everything | S | 0 |
| 2 | Sitemap: add 7 tools + /careers | High (organic) | S | 1 |
| 3 | Fix soft-404 → real 404 (Worker) | Med (SEO integrity) | S–M | 1 |
| 4 | `<h1>` on every tool page | Med (SEO + a11y) | S | 1 |
| 5 | Contrast tokens to AA | Med (a11y) | S | 1 |
| 6 | Unify clock (FX-03) | Med (trust) | S | 1 |
| 7 | Move signup prompt to value moment (FX-01) | High (conversion) | S | 1 |
| 8 | Branded skeleton loaders | Med (perceived perf) | S | 1 |
| 9 | Doc/Privacy hosting reconciliation | Med (compliance) | S | 0 |
| 10 | RLS + auth security review | High (risk) | M | 2 |
| 11 | Financial-math SME sign-off + methodology page | High (trust/SEO) | M | 2 |
| 12 | Careers guest preview | High (conversion) | M–L | 3 |
| 13 | LifeMap step-wizard + autosave | High (flagship) | M | 3 |
| 14 | "Your Financial Picture" dashboard | High (differentiation) | L | 3 |
| 15 | Design-system unification | Med (scale) | M–L | 4 |

---

## 6. Internal Peer Review (challenging my own plan)

- *"Aren't you just re-listing the audit?"* — No. Reconciliation shows **~half is already fixed**;
  the plan spends zero effort there and reallocates it to instrumentation and the connected-picture
  dashboard, which the audit couldn't propose without source.
- *"Analytics before bug-fixes — really?"* — Yes, but only Phase 0's lightweight, cookieless setup.
  It's cheap and every conversion claim (FX-01 retrigger, Careers preview) is otherwise unfalsifiable.
  Risk: scope creep into a "data platform." Mitigation: events-only, no dashboards in Phase 0.
- *"The soft-404 Worker adds server code to a static app."* — True, and it's the one place I'd
  accept minimal edge logic, because SEO index-dilution and broken uptime checks are real costs.
  Alternative considered (static `404.html` via `404-page`) rejected: it would 404 valid deep links.
- *"Is the cross-tool dashboard scope-creep vs the free-forever mission?"* — It's the highest-value
  idea *and* the highest-risk. It must not become a paywall or a data-hungry feature. Guardrail:
  local-first, opt-in, no new PII. If it can't be built that way, it waits.
- *"Could Phase 1 regress the already-fixed items?"* — Real risk. Mitigation: the parity suite +
  CI Lighthouse/axe gate from Phase 0 must be green before and after every change.
- *Rejected ideas:* AI financial mentor / chatbot (regulatory + trust risk against "not advice"),
  heavy 3D/animation (perf + reduced-motion cost), premium tier (contradicts free-forever positioning
  unless it's clearly non-essential convenience).

---

## 7. Final Vision

FinatriX becomes the **most trusted free money-education product in India** — a place where a
student, a first-job earner, or a family can see their *entire financial picture* in one calm,
fast, accessible, beautifully consistent interface, and trust every number because the methodology
is transparent and the math is verifiably unchanged. Seven excellent tools stop being islands and
become one connected journey. The Careers product proves its value before asking for anything. The
whole thing loads instantly at the edge, passes a WCAG audit without excuses, and survives diligence
from any of the review teams — because the trust, not the feature count, is the moat.

*Frozen throughout: the financial formulas, the calculator purposes, and "educational tools, not
financial advice."*
