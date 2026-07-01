# FinatriX — V3.1 Project Handover

> Single source of truth for the FinatriX product. Written so a future session with **no prior context** can continue development immediately. Last updated: 2026-07-01.

---

## 1. Executive Summary

**What FinatriX is.** FinatriX is a free, education-first personal-finance toolkit built for India. It offers seven interactive money tools (budgeting, expense tracking, investment allocation, idle-cash parking, peer benchmarking, reverse goal planning, and a full life-long wealth simulation). It is explicitly positioned as **educational tools, not financial advice**.

**Vision.** One premium, trustworthy financial workspace where an Indian user can go from "where does my money go?" to "what will my whole financial life look like?" — without paying, without ads, and without their data leaving their control.

**Objectives.**
- A single, cohesive premium product (landing → login → tools all feel like one app).
- Zero-cost to the user; privacy-first (guest data stays on-device; signed-in data syncs to their own row).
- Accurate, unchanged financial calculations (the math is the product's credibility).
- Rank well for the brand term "FinatriX".

**Current production status.** **Live** at https://fiantrix.online (Cloudflare Workers). Landing, auth, navigation, and all seven tools are deployed and functional. Design system V3 is live across the marketing shell and the tools. TypeScript 0 errors, ESLint 0 errors, 7/7 tests passing, production build clean. Remaining work is polish (per-tool "dashboard" depth, light mode) and a real-device mobile QA pass — see §8.

**Overall architecture (one line).** A React 19 SPA (marketing shell + auth + routing) that embeds the seven tools as a self-contained vanilla-JS HTML app inside a same-origin sandboxed iframe; auth and cross-device sync are provided by Supabase; everything is served as static assets by a Cloudflare Worker deployed from GitHub `main`.

---

## 2. Complete Timeline

**Origin.** Started as a React/TypeScript/Vite/Supabase site (repo `github.com/Finatrix/finatrix-kimi-agent`) with a dummy "Overview" landing and seven tools. First engagement was a full A–Z audit request: list every bug/mistake/upgrade, then "make it the best in the world with 0 bugs."

**V1 — Foundation & fixes.** Fixed a broken build (a Terms `<H2 id>` TS error), purged dead code (84 → 31 files, CSS 89 → 23 KB), restructured information architecture (landing at `/`, app at `/tools`), added security headers, full SEO/OG/JSON-LD meta, code-splitting, and made every tool persist + sync. Original smooth-scroll stack used **GSAP + Lenis** (later removed).

**SEO pass.** Added `robots.txt`, `sitemap.xml`, canonical/OG/Twitter/JSON-LD, PWA manifest, theme-color — all pointing at `fiantrix.online`, to rank #1 for "FinatriX" for free.

**Landing redesign (Apple-inspired).** Replaced the dummy overview with an animated first screen focused on the logo: a constellation of glass tool-tiles with SVG connectors, a gradient-gold wordmark, top tab bar. GSAP entrance animations were later found to freeze the tiles and were replaced with pure CSS keyframes.

**Deployment migration.** Netlify ran out of credits → migrated to **Cloudflare Workers** (static assets via `wrangler.jsonc`, SPA fallback). Solved: Worker-vs-Pages deploy config, an infinite-loop `_redirects` (deleted; wrangler SPA handling covers it), and a CSP problem where a strict global `script-src 'self'` blank-screened the tools — fixed by moving CSP to **per-document `<meta>`** (strict for the app; `'unsafe-inline'` for `tools-app.html`).

**V2 — "One product."** Removed the Overview page (tools now default to Budget or last-used), unified the tools' look to the dark/gold system, added a mobile nav drawer, return-to-landing, responsive hardening, and a premium login. Re-themed `tools-app.html` from light to dark/gold; fixed near-invisible InvestMatch inputs and off-brand selected states (blue/orange chips → gold).

**V2.1 — Launch readiness.** PWA manifest, accessibility (reduced-motion + always-visible focus), deployment prep.

**V3 — Visual transformation.** A premium design-system pass on the public experience: CSS tokens/utilities (`.fx-gold-text`, `.fx-glass`, `.fx-card-hover`, `.fx-btn-gold/ghost`, `.fx-reveal`), a rebuilt hero (layered gold lighting, logo constellation, trust strip), new landing sections (`LandingShowcase`, `LandingClose`), an `IntersectionObserver` `Reveal` component, and a redesigned `AuthShell`. Later polish unified the legal pages, 404, and the crash screen; the base background was standardized to `#060607`.

**V3.1 — The tools become the product (this session).**
- **Stage 1:** transplanted the exact V3 design language into `tools-app.html` — an ambient gold backdrop, glass cards, gold-gradient buttons, tool-color nav dots, and dashboard primitives (metric tiles, insight cards, empty/loading states).
- **Bug fixes:** the reported "Set Budget does nothing" bug was root-caused to a missing `allow-modals` in the iframe sandbox (which also silently killed three validation `alert()`s). Fixed the sandbox and replaced native modals with an on-brand inline editor + toasts.
- **Live production QA** on `fiantrix.online` via a real browser: all seven tools verified working and on-brand; found and fixed two dark-theme contrast bugs (ParkSmart hero gradient faded to white; LifeMap confirm button invisible).
- **Domain:** `fiantrix.online` connected to Cloudflare (nameservers moved from GoDaddy; conflicting parked DNS records deleted; custom domain attached to the Worker).
- **Production cleanup:** removed unused deps (gsap, lenis), dead file `App.css`, ~90 lines of duplicate/legacy CSS, and ~1.37 MB of unused images.

---

## 3. Architecture Overview

**Frontend.** React 19 + TypeScript, bundled by Vite 7, styled with Tailwind CSS 3 (+ `tailwindcss-animate`) and a hand-written token layer in `src/index.css`. Routing is React Router 7 with lazy routes, `Suspense`, and an `ErrorBoundary`.

**The tools app.** All seven tools live in **`public/tools-app.html`** — a single ~3,100-line self-contained vanilla-JS/HTML/CSS file with its own hash router (`ROUTES`, `route()`), CSS variables, and inline `<script>` blocks (one shared block + one per tool group). It is **not** React. It is rendered inside a **same-origin sandboxed `<iframe>`** by `src/pages/ToolsPage.tsx`. This isolation is deliberate: the tools are large, stable, and calculation-heavy, so they are frozen behind an iframe boundary while the React shell around them evolves.

**Backend / Auth.** Supabase provides email/password + Google OAuth. There is **no custom server** — the SPA talks to Supabase directly with the anon key.

**Data model & sync.** Each user has a single row in a **`tool_data`** table with a JSONB payload, protected by **Row-Level Security** (a user can only read/write their own row, keyed by `user_id`). The tools persist to `localStorage`; because the iframe is same-origin, the React shell and the tools share one `localStorage`. `src/tools/cloudSync.ts` bridges the two: on sign-in it pulls the cloud row into `localStorage` (cloud wins), and it pushes local changes back up via `upsert`. Synced keys (`SYNC_KEYS`): `fx_expenses`, `fx_budget`, `fx_currency`, `fx_budgets`, `fx_bb_data`, `fx_lifemap`, `fx_investmatch`, `fx_parksmart`, `fx_peercompare`, `fx_goals`. Also used: `fx_last_uid` (detect account switch), `fx_last_tool` (default tool on `/tools`).

**Cloudflare.** `wrangler.jsonc` defines a Worker named `finatrix` that serves `./dist` as static assets with `not_found_handling: "single-page-application"`. Deploys run automatically on push to GitHub `main` (Cloudflare Workers Builds). Security headers live in `public/_headers`; CSP is per-document via `<meta>`.

**Routing (`src/App.tsx`).** `/` → Home; `/home` → redirect to `/`; `/tools` → ToolsPage (iframe); `/login`, `/signup`, `/profile`, `/privacy`, `/terms`; `*` → NotFound. The tools' internal routes are hashes (`/tools#/budget`, `#/expenses`, …) handled inside the iframe.

**Data flow (sign-in example).** User signs in (Supabase) → `AuthContext` fires → `cloudSync.pull()` writes the cloud JSONB into `localStorage` → the iframe reads `localStorage` and renders the user's data → user edits → tool writes `localStorage` → `cloudSync.push()` upserts the row.

**Design system.** Token/utility layer in `src/index.css` for the React shell; a parallel, visually-identical token set inside `tools-app.html` for the tools. Both share the same palette, radii, glass, and motion language (see §5).

**Build system.** `npm run build` = `tsc -b && vite build`. Output → `dist/`. `public/` is copied verbatim (so `tools-app.html`, fonts, vendored Chart.js, images, manifest, robots, sitemap ship as-is).

**Folder structure.** See §9.

---

## 4. Every Major Feature

**Landing (`src/pages/Home.tsx` + `src/sections/*`).** Composes `LandingNav`, `LandingHero`, `LandingShowcase`, `LandingClose`, `LandingFooter` on `#060607`. The **hero** (`LandingHero.tsx`) is the signature screen: layered gold radial glow + masked grid + vignette; a 3×3 constellation of glass tool-tiles (each filled with its tool color, colored glow, white top-highlight) with animated SVG connectors to a central gold hub; a gradient-gold `FinatriX` wordmark; an eyebrow pill; dual CTAs; and a trust strip (7 free tools / ₹0 / 100% private / 14 Indian cities). Hovering a tile updates a live label. All animation is CSS keyframes with `prefers-reduced-motion` fallbacks.

**Navigation (`LandingNav.tsx`).** Fixed glass header (`#060607/70` + blur). Desktop shows inline tool tabs, each with a **tool-color dot**; mobile collapses to the CTA. "Open tools" is a gold button.

**Login / Signup (`src/pages/Login.tsx`, `Signup.tsx` + `src/components/AuthShell.tsx`).** `AuthShell` provides the premium ambient backdrop, brand lockup, and a glass card. Email/password fields have a show/hide toggle and gold focus rings; Google OAuth via `SocialButton`; `Notice` for inline errors/success. `PrimaryButton` is the gold pill.

**Profile (`src/pages/Profile.tsx`).** Shows email + verification state, editable display name (persisted to Supabase user metadata), and a sign-out button. Redirects to `/login` if unauthenticated.

**Mobile drawer (`ToolsPage.tsx`).** Below 768px the in-iframe tab bar is hidden (`#mainNav{display:none}`) and the React shell renders a slide-out drawer with Home + the 7 tools + Profile/Privacy/Terms/Sign-out, with body-scroll lock.

**The seven tools (`public/tools-app.html`).** Each has a page-head (colored tool-chip + headline), inputs, and an animated result. Tool accent colors: Budget `#16A36A`, Expenses `#1FAE5A`, InvestMatch `#0A84FF`, ParkSmart `#FF6B5E`, PeerCompare `#7C5CFF`, Goals `#14B8A6`, LifeMap `#D4AF37`.
- **Budget Builder** — 50/30/20 split of take-home income with per-month budgets; live needs/wants/savings bars.
- **Expense Tracker** — log expenses by category/date; monthly stats (today / this month / daily avg); optional monthly budget with progress bar (inline editor). Categories, history, breakdown.
- **InvestMatch** — a 6-question wizard (age, income, investable amount, risk, horizon, goal) → a personalised allocation across Indian instruments with a growth projection and a segmented allocation bar.
- **ParkSmart** — ranks ~10 idle-cash parking options by **post-tax** return, tuned to amount, duration, and tax slab (2026 rules); shows a best-match hero + ranked list with implied rates and risk.
- **PeerCompare** — city-calibrated benchmarks for 14 Indian cities; an overall percentile ring + metric-by-metric comparison (income, savings, investments, debt…).
- **Reverse Goal Planner** — enter a target + deadline → reverse-engineers the monthly SIP, with inflation adjustment and step-up options; shows a path card with instruments and milestones.
- **LifeMap** — the flagship: enter a full financial profile once, then travel an age slider (22→60) through a simulated wealth trajectory. Renders net-worth/score stat cards, a Chart.js wealth-projection line ("smart" vs "impulsive"), a financial-health score ring, health breakdown bars, life "decisions" (with a confirm dialog), and a parallel-universe comparison.

**Currency system.** A currency selector (`fxSetCurrency`) in the tools bar; `fx_currency` is synced. Amounts render via a shared formatter (`cfmt`).

**Cloud Sync.** See §3 — `cloudSync.ts`, `SYNC_KEYS`, RLS-protected `tool_data` JSONB row. Guests keep everything in `localStorage` only.

**Theme system.** Currently a single premium **dark/gold** theme (there is no runtime theme toggle). Tokens are defined once in `src/index.css` (shell) and once in `tools-app.html` (tools). Light mode is **not** implemented (see §8).

**Animations.** CSS keyframes throughout: hero constellation entrance, page-slide transitions inside the tools, result fly-in, score-ring draw, count-ups, toasts. `prefers-reduced-motion` is honored globally in both the shell and the tools.

---

## 5. Design System

**Typography.** Self-hosted **Geist** (variable) + **Geist Mono**, served from `public/fonts/` and referenced in both the shell and the tools. Display headings use tight negative tracking; mono is used for eyebrows, labels, and CTAs (uppercase, wide tracking).

**Colors / tokens (dark/gold).**
- App canvas: `#060607`. Tools surface: `#0A0A0A` (deliberately matches the iframe wrapper so there is no seam).
- Gold: `--gold #D4AF37`, `--gold-2 #F0D779`, gold tint `rgba(212,175,55,.10)`.
- Ink: `#F5F5F0` (primary), `#9c9c96` (secondary), `#6b6b70` (muted).
- Hairlines: white-alpha (`rgba(255,255,255,.12)` / `.07)` / `.06`).
- Tool accents: see §4.
- Tools tokens live in `tools-app.html :root` (`--bg`, `--card`, `--ink/2/3`, `--hair/2`, `--gold/-2`, `--r`, `--shadow`, `--glass-blur`, spring/ease/duration vars).

**Spacing / radii.** Card radius `20px` (`--r`); pills `980px`; inputs `12px`. Generous card padding (24px).

**Components.** React shell utilities: `.fx-gold-text`, `.fx-glass`, `.fx-card-hover`, `.fx-btn-gold`, `.fx-btn-ghost`, `.fx-reveal`, `.fx-conn`. Tools primitives: `.card` (glass), `.btn`/`.btn-ghost` (gold gradient / glass), `.fi`/`.fs` (inputs), `.stat-cell`, `.metric`, `.dash-grid`, `.insight`, `.empty-state`, `.panel-*`, `.fx-toast` (on-brand toast), `.et-budget-form` (inline editor).

**Motion.** Shared easing (`--fx-ease`, spring `cubic-bezier(.34,1.56,.64,1)`), subtle and purposeful. Ambient gold aurora drifts; cards lift on hover; results fly in.

**Glass / lighting / elevation.** Translucent card fills + `backdrop-filter` blur over a fixed ambient layer (gold radial glow + masked grid + vignette). This ambient layer is the single biggest cue that the tools and the landing are "one app."

**Charts.** **Chart.js self-hosted** at `public/vendor/chart.umd.js` (loaded with SRI). Used by LifeMap (wealth projection) and score rings. Chart colors follow the dark/gold palette.

**Visual language.** Dark, quiet, expensive; gold reserved for emphasis and primary actions; color used semantically (per-tool accents, green/red for good/bad, risk tiers).

---

## 6. Production Bugs (discovered + fixed)

1. **Broken build — Terms `<H2 id="disclaimer">` (TS2322).** Root cause: `H2` didn't accept `id`. Fix: made `H2` forward an optional `id`. Files: `src/components/LegalPage.tsx`, `src/pages/Terms.tsx`.
2. **Tools rendered blank (CSP).** Root cause: a strict global `script-src 'self'` blocked the tools' inline scripts. Fix: per-document CSP `<meta>` (tools get `'unsafe-inline'`). Files: `public/_headers`, `public/tools-app.html`, `index.html`.
3. **Cloudflare deploy failed (Worker vs Pages).** Fix: added `wrangler.jsonc` (assets + SPA fallback). Also deleted `public/_redirects` (infinite-loop error).
4. **Landing tiles invisible.** Root cause: GSAP entrance left tiles at opacity 0. Fix: replaced with CSS keyframes (fill-mode backwards).
5. **InvestMatch inputs nearly invisible; off-brand selected states.** Fix: input fill `rgba(255,255,255,.04)` + visible border + gold focus; unified selected states to gold.
6. **"Set Budget" button did nothing (+ 3 silent validations).** Root cause: the tools' iframe `sandbox` lacked `allow-modals`, so `prompt()`/`alert()` were blocked — Set Budget (Expense Tracker) and the InvestMatch/ParkSmart/Goals minimum-amount `alert()`s all failed silently. Fix: added `allow-modals allow-forms` to the sandbox; replaced the prompt with an **inline budget editor** and the alerts with **`fxNotify` toasts**. Files: `src/pages/ToolsPage.tsx`, `public/tools-app.html`. **Verified live.**
7. **ParkSmart "Best Match" hero washed out.** Root cause: `background:linear-gradient(135deg,rgba(12,128,121,.06),#fff)` — a light-theme leftover fading to white, killing text contrast on dark. Fix: dark teal→glass gradient. File: `public/tools-app.html`. Found via live QA.
8. **LifeMap decision "Confirm" button invisible.** Root cause: `background:var(--ink)` (now near-white `#F5F5F0` after the dark-theme flip) with white text. Fix: gold-gradient button + dark text; solid dialog surface + readable Cancel. File: `public/tools-app.html`. Found via live QA.

---

## 7. Major Improvements (and why)

- **IA restructure** (landing `/`, app `/tools`) — a real first impression instead of a dummy overview.
- **Dead-code purge** (84→31 files early; more in V3.1) — maintainability and bundle size.
- **Security headers + full SEO/JSON-LD + PWA** — trust, discoverability, installability.
- **Full persistence + RLS cloud sync** — data survives refreshes and follows the user across devices, privately.
- **Dark/gold design-system unification** (shell + tools) — the product finally feels like one premium app, not two.
- **Overview removal + last-tool default + mobile drawer** — fewer clicks to value; native-feeling mobile.
- **V3 hero + AuthShell + landing sections** — a memorable, expensive-feeling brand surface.
- **Accessibility** — reduced-motion + always-visible keyboard focus everywhere.
- **Cloudflare Workers migration + custom domain** — reliable free hosting on the brand domain.
- **V3.1 tools transplant + modal-bug fix + live QA** — the tools now match the landing and the reported bug (plus its hidden siblings) is gone.
- **Production cleanup** — removed gsap/lenis/App.css/6 images/~90 lines dead CSS so the codebase reads as intentional.

---

## 8. Remaining Limitations (honest)

**Production blockers.** None known. The site is live and functional.

**Minor issues / needs verification.**
- **Mobile visual QA is unverified in-tooling.** The QA browser could not shrink below the screen width, so 320–430px breakpoints and the mobile drawer were **not pixel-verified**. The responsive CSS exists (drawer <768px, grids stack ≤520px) but should be spot-checked on a real phone.
- **npm audit** reports ~10 advisories (mostly transitive dev-dependencies). Not addressed to avoid version-bump regressions; review before any dependency upgrade.
- A harmless dead JS reference to `.brand-band` remains in `tools-app.html` (returns `0`); left in place to avoid touching scroll logic.

**Future enhancements (not blockers).**
- **Tools → true dashboards (Stage 2).** The dashboard primitives (`.metric`, `.dash-grid`, `.insight`, `.empty-state`, `.panel-*`, `.dash-hero`) exist but are **not yet applied**; restructuring each tool's results around summary panels/insight cards is the next polish workstream (task-tracked). Do it with a live-verify loop.
- **Light mode.** Not implemented. Must be a designed palette, not an inversion. Tools use CSS vars (easy to theme via `[data-theme]`); the React shell hardcodes many hex values (larger refactor). Do NOT ship a rushed inversion.

**Technical debt.**
- Two parallel token systems (shell in `index.css`, tools in `tools-app.html`) must be kept in visual sync by hand.
- `tools-app.html` is a large single file; presentation refactor is permitted but **never** touch its calculations.
- `chart.js` is a devDependency that only sources the self-hosted `vendor/chart.umd.js` (kept intentionally to document the version / allow regeneration).

**Wishlist.** Real onboarding, shareable result links, export to PDF, more cities/instruments, a designed light theme, component-extraction of the tools if they ever move into React.

---

## 9. Repository Overview

```
index.html                     App shell + all SEO/OG/JSON-LD/manifest/theme-color; canonical → fiantrix.online
wrangler.jsonc                 Cloudflare Worker config (static assets from ./dist, SPA fallback)
vite.config.ts                 Vite + manualChunks + Vitest config
tailwind.config.*              Tailwind (+ tailwindcss-animate)
package.json                   Scripts + deps (see §10)
FINATRIX_AUDIT.md              Earlier audit notes
SEO_GUIDE.md                   SEO playbook
FINATRIX_PRODUCTION_AUDIT.md   Production audit notes
FINATRIX_V3_PROJECT_HANDOVER.md  ← this document

public/
  tools-app.html               THE SEVEN TOOLS (vanilla JS/HTML/CSS, hash-routed, iframed). Do not touch calculations.
  vendor/chart.umd.js          Self-hosted Chart.js (SRI)
  fonts/                        Geist + Geist Mono (woff2)
  images/                      finatrix-logo.png, finatrix-wordmark.jpg (only used images)
  manifest.webmanifest         PWA manifest
  _headers                     Cloudflare security headers
  robots.txt, sitemap.xml, favicon.svg

src/
  main.tsx                     React entry
  App.tsx                      Routes (lazy) + Suspense + ErrorBoundary
  index.css                    Design tokens + utilities for the React shell
  context/AuthContext.tsx      Supabase auth state + triggers cloud sync
  lib/
    supabase.ts                Supabase client (VITE_SUPABASE_URL / _ANON_KEY)
    tools.ts                   TOOLS[] metadata (id, name, short, blurb, href, color, icon)
  tools/cloudSync.ts           localStorage↔Supabase bridge (SYNC_KEYS, pull/push, RLS row)
  pages/                       Home, ToolsPage, Login, Signup, Profile, Privacy, Terms, NotFound
  sections/                    LandingNav, LandingHero, LandingShowcase, LandingClose, LandingFooter
  components/                  AuthShell, ErrorBoundary, LegalPage, Reveal, ToolIcon
  test/                        Vitest: ErrorBoundary, Landing, NotFound, cloudSync (+ setup)
```

---

## 10. Deployment

- **Host:** Cloudflare **Workers** (project `finatrix`), serving `./dist` as static assets with SPA fallback (`wrangler.jsonc`).
- **CI/CD:** Cloudflare **Workers Builds** auto-deploys on push to GitHub `main` (repo `Finatrix/finatrix-kimi-agent`). There is no separate deploy command for normal use — **push to `main`**.
- **Custom domain:** **`fiantrix.online`** ⚠️ note the spelling — the brand is *FinatriX* but the domain is *fiantrix* (transposed letters, registered that way). All canonical/OG URLs intentionally use `fiantrix.online`. **Do not "fix" it.**
- **workers.dev URL:** `finatrix.finatrix-hub.workers.dev`. Cloudflare account id: `0cb5cc8481ab72624994a216ad4b1a19`.
- **DNS:** domain registered at **GoDaddy**, nameservers pointed to **Cloudflare**. When attaching the custom domain to the Worker, conflicting parked A/CNAME records had to be deleted in Cloudflare DNS first (keep MX/TXT).
- **Build:** `npm run build` → `tsc -b && vite build` → `dist/`.
- **Environment variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (build-time, must be set in the Cloudflare project). No server secrets (anon key + RLS only).
- **CSP:** per-document `<meta http-equiv>` (strict for the SPA; `'unsafe-inline'` scripts for `tools-app.html`). Additional headers in `public/_headers`.
- **Production checklist before shipping:** `tsc` 0 · `eslint` 0 · `vitest` all pass · `vite build` clean · push `main` · wait ~1–2 min for Workers Build · verify `fiantrix.online` (landing + `/tools` + one calculation + sign-in round-trip).

---

## 11. Development Workflow

**Golden rule.** **Never change financial calculations, business logic, formulas, persistence, auth, Supabase schema, or existing user data.** Presentation, architecture, and UX may evolve; the math must not.

**Coding standards.** TypeScript strict (0 errors) and ESLint (0 errors) are hard gates. Small, logical commits with descriptive messages. Prefer editing the real files over adding new ones. In `tools-app.html`, treat calculation code as read-only and only change the presentation/template layer.

**Design standards.** Match the V3 tokens exactly (dark/gold, glass, Geist, the ambient layer). Keep the shell and tools token systems in visual sync. Gold is for emphasis/primary actions only. Respect `prefers-reduced-motion`.

**Architecture principles.** The tools stay behind the same-origin sandboxed iframe. Sync flows only through `localStorage` + `cloudSync.ts`. Keep routes lazy. Keep CSP per-document.

**Testing.** `npm test` (Vitest + Testing Library) — currently 7 tests (ErrorBoundary, Landing, NotFound, cloudSync). Add tests when you touch those areas. For the tools' inline JS, `node --check` each `<script>` block to catch syntax errors (the build won't validate JS inside a static HTML file). For CSS surgery in `tools-app.html`, verify `{`/`}` counts stay balanced.

**Review / quality.** Before declaring done: run all four gates, then **verify on the live site** (build success is not verification). This environment can drive a real browser against the deployed URL (Chrome tools) — use it. Dead-CSS removal is provably safe only if the class has zero applications AND braces stay balanced.

---

## 12. Future Roadmap (prioritized)

**High priority.**
1. Real-device mobile QA (320–430px + drawer), fix anything found.
2. Tools → true dashboards (Stage 2): apply the existing primitives to each tool's results (summary panels, insight cards, refined tables/charts) — presentation only, live-verified.

**Medium priority.**
3. Designed light theme (palette, not inversion) via `[data-theme]` in the tools + a shell token refactor.
4. Dependency/security review (npm audit) before any upgrade.
5. Extract shared tool JS/CSS for maintainability (without touching math).

**Low priority.**
6. Shareable result links, PDF export, onboarding, more cities/instruments.

**Long-term vision.** FinatriX becomes the default free Indian money workspace — trustworthy enough that "educational" tools genuinely change behavior — with the seven tools potentially migrating into first-class React surfaces once the presentation layer is fully componentized.

---

## 13. Lessons Learned

**What worked well.**
- Isolating the tools behind a same-origin iframe let the shell be redesigned repeatedly without risking the calculations.
- A shared `localStorage` bridge made cloud sync simple and privacy-preserving.
- Per-document CSP resolved the tension between a strict shell and inline-script tools.
- Pure-CSS animation (over GSAP) removed a whole class of "tiles invisible" failures and cut dependencies.
- Live QA against the deployed site caught real contrast bugs that static review missed.

**What should never be repeated.**
- Shipping a theme flip without auditing every hardcoded color: light-theme leftovers (`#fff` gradients, `var(--ink)` fills) became invisible-text/contrast bugs on dark.
- Assuming a button "works" because the function exists — a sandboxed iframe silently blocked `prompt()`/`alert()`. **Test interactions on the real deployment.**
- Leaving iteration cruft (old Home CSS, duplicate `.orb`/`.glass`, gsap/lenis) — it accumulates and makes the project feel accidental.

**What future contributors should know.**
- The domain is `fiantrix.online` (intentional spelling). Push to `main` to deploy. Env vars live in Cloudflare.
- The tools are vanilla JS in one HTML file behind an iframe — respect that boundary and never touch the math.
- Build success ≠ done. Verify on the live site, and remember mobile still needs a real-device pass.

---

## 14. Final Production Report (this session)

**Files changed:** `src/pages/ToolsPage.tsx` (iframe sandbox `allow-modals`), `public/tools-app.html` (V3 design transplant, dashboard primitives, Set-Budget inline editor, `fxNotify` toasts, contrast fixes, dead-CSS purge), `src/components/ErrorBoundary.tsx`, `src/index.css` (base bg, border token, removed `.lenis` CSS), `src/App.tsx` (splash bg + comment), `src/components/LegalPage.tsx`, `src/pages/NotFound.tsx`, `src/pages/Profile.tsx`, `package.json` (removed gsap/lenis + `build:netlify`), `package-lock.json`, `src/test/Landing.test.tsx` (removed gsap mock + unused import).

**Files added:** `FINATRIX_V3_PROJECT_HANDOVER.md` (this document).

**Files removed:** `src/App.css`; `public/images/capability-1.jpg`, `capability-2.jpg`, `capability-3.jpg`, `capability-4.jpg`, `image_infra_base.jpg`, `image_infra_dissolve.jpg` (~1.37 MB of unused assets).

**Commits this session (most recent first):** `b0b4b18` Phase 1 cleanup · `d7acfd8` live-QA contrast fixes · `ffd6ef1` Set Budget + validation fix · `c175ecd` V3.1 Stage 1 design transplant · `0ac3ff6` base bg/border + ErrorBoundary · `12f3b52` legacy border cleanup · `8bb9689` legal/404 branding unify. (Earlier `e7580e0` = V3 visual transformation.)

**Status:** TypeScript **0 errors** · ESLint **0 errors** · Tests **7/7 pass** · Build **clean** · Deployment **live at https://fiantrix.online** (push `main` to ship the latest commits).

> A future session can read this file alone and continue development without prior context.
