# FinatriX — Full Code & Architecture Audit
**Repo:** `Finatrix/finatrix-kimi-agent` · **Reviewed:** 28 Jun 2026
**Stack:** React 19 + TypeScript + Vite 7 + Tailwind 3 + Supabase + Netlify

This audit is based on reading every custom source file line‑by‑line **and** actually
installing dependencies and running `tsc`, `eslint`, and `vite build`. Findings that
say "confirmed" were reproduced, not guessed.

---

## 0. Verdict (read this first)

The app **works in production** (Netlify deploys, auth functions, RLS is correct, the
tools render). But it is **not** "0 bugs / best in the world" today. The headline problems:

1. **The standard build is broken.** `npm run build` fails on a TypeScript error. It only
   ships because Netlify is configured to *skip* type‑checking.
2. **Several user‑facing promises are false.** LifeMap and Budget Builder data are
   **never saved** (locally or to the cloud), yet the Privacy Policy and marketing copy say
   they are. Every "Open →" deep‑link from the homepage ignores which tool you clicked.
3. **~40% of the repo is dead code** — an entire abandoned tools engine plus the whole
   unused shadcn/ui library and ~30 unused dependencies.
4. **No tests, no error boundary, no 404 route, no SEO/meta, no security headers.**

None of this is fatal, and most of it is quick to fix. Counts below: **7 functional bugs,
6 dead‑code/bloat items, 6 security/privacy items, plus SEO/perf/a11y/DX gaps.**

---

## 1. CRITICAL — breaks the build or breaks a core promise (P0)

### 1.1 `npm run build` fails to compile — confirmed
`package.json` → `"build": "tsc -b && vite build"`. Running it:

```
src/pages/Terms.tsx(17,11): error TS2322: Property 'id' does not exist on
type 'IntrinsicAttributes & { children: ReactNode; }'.
```

`Terms.tsx` renders `<H2 id="disclaimer">`, but `H2` in `LegalPage.tsx` only accepts
`{ children }`. This is the **only** tsc error — fixing this one line makes the whole
type‑check pass. Today it's masked because `netlify.toml` builds with `build:netlify`
(`vite build` only, no `tsc`), and the planning doc explicitly notes "no tsc, so type‑only
issues won't block deploy." That is shipping with the safety net switched off.
**Fix:** make `H2` accept and forward `id` (see 1.2), then restore `tsc` to the deploy build.

### 1.2 The `#disclaimer` anchor link is dead — confirmed
Even on Netlify (where it compiles), `H2` never renders the `id` onto the DOM `<h2>`. So the
Footer's **"Disclaimer" → `/terms#disclaimer`** link (and any anchor to it) scrolls nowhere.
**Fix:** `function H2({ children, id }: { children: ReactNode; id?: string })` and put `id` on the `<h2>`.

### 1.3 LifeMap & Budget Builder data is never persisted — confirmed
In `public/tools-app.html` the `store` only ever writes **three** keys:
`fx_expenses`, `fx_budget` (the *Expense Tracker's* budget number), and `fx_currency`.
There is **no** `store.set(...)` for LifeMap, Budget Builder, InvestMatch, ParkSmart,
PeerCompare, or Reverse Goal Planner. Consequences:
- A user can spend 20 minutes building a LifeMap simulation; one refresh wipes it.
- The Budget Builder (the *first* tool you advertise) doesn't remember anything.
- It contradicts your **Privacy Policy** ("your Budget, Expense and **LifeMap** data … are
  saved to your account") and the Tools section ("sign in to **save your data** and pick up
  where you left off"). This is both a UX bug and a compliance/accuracy problem.
**Fix:** give each tool a storage key, add those keys to `SYNC_KEYS`, and persist on change.

### 1.4 Tool deep‑links don't open the chosen tool — confirmed
`Tools.tsx` and `Footer.tsx` link to `/tools#/budget`, `/tools#/expenses`, `/tools#/lifemap`,
etc. But `ToolsPage.tsx` hard‑codes `const TOOLS_URL = '/tools-app.html'` and never passes the
hash into the `<iframe>`. The parent URL's hash is invisible to the iframe, so **every** card
opens the tools app at its default page. All seven "Open →" links are effectively the same link.
**Fix:** read `location.hash` in `ToolsPage`, pass it through (`src={`/tools-app.html${hash}`}`),
and have `tools-app.html` route on its own hash.

### 1.5 No catch‑all `*` route → blank white screen — confirmed
`App.tsx` defines `/`, `/home`, `/tools`, `/login`, `/signup`, `/profile`, `/privacy`,
`/terms` and **no** `path="*"`. Netlify's SPA fallback serves `index.html` for any URL, React
Router then matches nothing, and the user sees a blank page (no 404, no redirect home). Any
mistyped or stale link dead‑ends silently.
**Fix:** add a `<Route path="*" element={<NotFound/>} />`.

---

## 2. HIGH — visible defects (P1)

### 2.1 Footer "UTC" clock shows local time — confirmed
`Footer.tsx` builds the clock with `now.getHours()/getMinutes()/getSeconds()` (local time) but
labels it **"UTC"**. For anyone outside UTC it's simply wrong.
**Fix:** use `getUTCHours()` etc. (or relabel to "Local").

### 2.2 Hero lattice is mis‑centered on retina/HiDPI screens — confirmed by inspection
In `useComputationalLattice.ts`, `getDrawCoords()` centers on `canvas.width/2` (a **device‑pixel**
value) while the canvas context is `setTransform(dpr,…)`‑scaled into **CSS pixels**, and every
other draw routine (`drawGrid`, constellation nodes) correctly uses `canvas.width/dpr`. On any
display with `devicePixelRatio > 1` (virtually all modern laptops/phones) the orbit system is
pushed toward the bottom‑right and is misaligned from the grid it's supposed to sit on.
**Fix:** make `getDrawCoords` use `canvas.width/(2*dpr)` / `canvas.height/(2*dpr)` (i.e. CSS px).

### 2.3 `setState` inside effects causes cascading renders — confirmed (eslint)
`Profile.tsx:20` and `ToolsPage.tsx:28` set state synchronously inside `useEffect`. React's own
lint flags this as a render‑cascade/perf smell. `Profile` can derive the name during render or
via the user object; `ToolsPage`'s `ready` flag can be restructured.

### 2.4 No React error boundary — confirmed
There is no `ErrorBoundary` anywhere. A single render throw (a malformed Supabase payload, a
null guard you missed) takes the **whole** page to white. For a "0‑bug feel" you want a boundary
that shows a graceful fallback.

### 2.5 `signOut` swallows errors; Profile shows raw error text
`AuthContext.signOut()` ignores the result of `supabase.auth.signOut()`. And `Profile.saveName`
surfaces `error.message` directly instead of routing it through the nice `authErrorMessage()`
helper used everywhere else — so the user can see a raw GoTrue blob.

---

## 3. MEDIUM — quality / performance smells (P2)

- **Unconditional animation loops, no `prefers-reduced-motion`.** The Hero canvas runs a
  permanent `requestAnimationFrame` loop, the ticker marquee never pauses, and the Footer runs a
  `setInterval` every second — all regardless of visibility or the user's reduced‑motion setting.
  Constant CPU/GPU/battery cost on the marketing page; also an accessibility issue. Pause rAF when
  the Hero is off‑screen (IntersectionObserver) and honor `prefers-reduced-motion`.
- **`initScene()` runs twice on mount and re‑inits on every resize with no debounce**
  (`useComputationalLattice.ts`): `handleResize()` already calls `initScene()`, then it's called
  again explicitly. Resize handler rebuilds the entire scene per event → jank on window drag.
- **Dead locals** `time` and `frame` in the canvas hook (eslint‑confirmed unused).
- **`any` cast** `gsap.ticker.remove(lenis.raf as any)` in `Home.tsx:37` (eslint‑confirmed).
- **642 KB JS bundle, single chunk** (198 KB gzip) — confirmed from `vite build`. No route‑level
  code‑splitting: GSAP + Lenis load on the auth/legal pages that don't use them, and the Supabase
  client loads on the public landing page. `React.lazy` per route would cut first‑load sharply.
- **`caniuse-lite` data is 6 months stale** (build warning) — run `npx update-browserslist-db`.

---

## 4. DEAD CODE & BLOAT — confirmed by import‑graph grep

This is the single biggest "worst plan" in the repo: **two parallel implementations** shipped,
only one wired up.

- **Abandoned tools engine, imported by nothing:**
  `src/tools/toolsEngine.js` (1,824 lines), `src/tools/fxStore.ts` (155), `src/tools/toolsMarkup.ts`
  (78 KB single string), `src/tools/tools.css` (440). The live app loads `public/tools-app.html`
  in an iframe instead. These files reference a different key set (`fx_inputs`, `fx_budgetbuilder`)
  than the live one, which is exactly why the two `SYNC_KEYS` lists disagree.
- **Entire `src/components/ui/` shadcn library is unused** (50+ files) — the app uses its own
  `AuthShell`/`LegalPage` components. None of `recharts, embla‑carousel‑react, vaul, cmdk,
  input‑otp, react‑day‑picker, react‑resizable‑panels, date‑fns, react‑hook‑form,
  @hookform/resolvers, zod, sonner, next‑themes, lucide‑react` is imported anywhere outside that
  dead folder. ~30 runtime dependencies you install, audit, and lockfile for nothing. (They
  tree‑shake out of the JS bundle, but they bloat `node_modules`, CI time, and your supply‑chain
  surface, and they make the codebase confusing.)
- **Scaffolding/planning files committed:** `info.md` (an agent scaffold note that references a
  nonexistent `src/types/` folder), `README.md` (still the **default Vite template** — "This
  template provides a minimal setup…"), and `FinatriX Project (T&C Updated).md` (internal build
  log — see 5.1). `public/zzz.txt` stray file.
- **Stray nested duplicate folder** `finatrix-kimi-agent/` sits inside the working tree (the
  `.gitignore` even calls it "stray duplicate created during setup (safe to delete)"). Delete it.
- **`tsconfig.app.json` excludes** `src/components/ui`, `use-mobile.ts`, `utils.ts` from
  type‑checking specifically to dodge their errors — masking, not fixing.

---

## 5. SECURITY / PRIVACY / COMPLIANCE

### 5.1 Internal planning doc committed to a public repo
`FinatriX Project (T&C Updated).md` exposes the Supabase **anon/publishable key**, the project
ref `uspbsgbggurggsfsontq`, the Site URL, the redirect allowlist, and the table schema. The anon
key is "public by design" and your RLS protects rows — so this is **not** a breach — but an
internal build log doesn't belong in the repo, and publishing your full backend topology lowers
the cost of an attack if RLS is ever misconfigured. **Remove it from git history**, keep it local.

### 5.2 Privacy Policy is factually inaccurate (see 1.3)
It promises LifeMap/Budget‑Builder cloud sync that doesn't happen. Because the policy itself
invokes India's DPDP Act and GDPR, an inaccurate data‑handling description is a real compliance
liability, not just a copy nit. Align the policy with what the code actually stores
(`fx_expenses`, `fx_budget`, `fx_currency`) — or implement the sync so the policy becomes true.

### 5.3 No security headers
`netlify.toml` sets no `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy`, `Strict-Transport-Security`, or `Permissions-Policy`. A finance product that
embeds an iframe and loads third‑party scripts should ship a CSP at minimum. Add a `[[headers]]`
block.

### 5.4 Third‑party Chart.js with no SRI; iframe with no sandbox
`tools-app.html` loads `chart.js@4.4.0` from jsDelivr with **no `integrity` hash**, and the
`<iframe>` in `ToolsPage.tsx` has **no `sandbox` attribute**. If that CDN asset were ever
compromised, arbitrary JS would run in your origin alongside the authenticated session/localStorage.
Add Subresource Integrity (or self‑host Chart.js) and a scoped `sandbox` on the iframe.

### 5.5 Google Fonts loaded from Google's CDN
`tools-app.html` pulls Inter from `fonts.googleapis.com` (render‑blocking + sends user IPs to
Google, which sits awkwardly next to "no third‑party trackers"). Self‑host the font, as you
already do for Geist.

### 5.6 Verify the custom domain spelling
The planning doc lists the custom domain as **"fiantrix.online"** (fiantrix vs **fina**trix). If
that's the real registration and not just a doc typo, it's a brand‑damaging misspelling. Please
confirm.

---

## 6. SEO / META / DISCOVERABILITY

- `index.html` has **only** `<title>FinatriX</title>` — no meta description, canonical, Open
  Graph/Twitter cards, `theme-color`, favicon, or apple‑touch‑icon. **No `favicon`, no
  `robots.txt`, no `sitemap.xml`** anywhere in `public/`. For a public product this is a major miss.
- **Information architecture is inverted:** `/` serves the *tools app*, and the actual marketing
  landing page is hidden at `/home`. Most visitors and crawlers hitting the root never see your
  brand/marketing page, and per‑tool pages live inside a non‑crawlable iframe. Reconsider making
  `/` the landing page and `/tools` (or `app.finatrix…`) the app.
- **No SSR/prerender and no `<noscript>`** — crawlers and no‑JS users get an empty `<div id="root">`.
- `tools-app.html` meta says **"Six free financial tools"** and omits LifeMap (there are seven).

---

## 7. ACCESSIBILITY

- Decorative `<canvas>` elements (Hero, Infrastructure) have no `aria-hidden`/`role`.
- No `prefers-reduced-motion` handling for the heavy animations (see §3).
- Color contrast: `#8A8A8A` body text on `#0A0A0A`, and `#5A5A5A` on dark, are below WCAG AA for
  small text — worth a contrast pass.
- The custom checkbox/links in Signup are okay, but run an automated a11y audit (axe) before launch.

---

## 8. TESTING / RESILIENCE / DX

- **Zero tests, no `test` script, no CI.** For a "0 bugs" goal this is the structural gap — there's
  nothing stopping a regression. Add Vitest + React Testing Library for the auth/sync logic and a
  Playwright smoke test for the critical flows (sign up → verify → sign in → tool persists).
- **No error boundary** (also in 2.4).
- `package.json` name is still `"my-app"`, version `"0.0.0"`, no `engines` field.
- Mixed module systems (`tailwind.config.js`/`postcss.config.js` use CommonJS while the project is
  `"type":"module"`) — works, but inconsistent.

---

## 9. What's already done well (credit where due)

- **Row‑Level Security is correct** — per‑user `select/insert/update` policies on `tool_data`.
- **Thoughtful auth error handling** — `authErrorMessage()` maps GoTrue 500/SMTP failures to
  human guidance and guards against `{}` / `[object Object]` blobs.
- **Graceful no‑backend mode** — `isSupabaseConfigured` lets the app run with localStorage when
  env vars are missing instead of crashing.
- **Account‑switch hygiene** — clears the previous account's local data on UID change/sign‑out.
- **localStorage access is wrapped in try/catch** (private‑mode safe).
- **Legal pages are genuinely thorough** and the design system (CSS variables, mono/gold theme) is
  consistent and tasteful.
- Effects clean up listeners/RAF/intervals correctly; scroll listener is `passive`.

---

## 10. Prioritized upgrade roadmap

**Phase 1 — correctness (days):**
1. Fix `H2` to forward `id`; restore `tsc` to the Netlify build (1.1, 1.2).
2. Persist + sync every tool's data; correct the Privacy Policy (1.3, 5.2).
3. Pass the hash into the tools iframe so deep‑links work (1.4).
4. Add a `*` 404 route and an `ErrorBoundary` (1.5, 2.4).
5. Fix the UTC clock and the retina canvas centering (2.1, 2.2).

**Phase 2 — cleanup & hardening (days):**
6. Delete the dead tools engine, the unused `components/ui` + ~30 deps, `info.md`, `zzz.txt`, the
   nested duplicate folder; rewrite `README.md`; remove the planning doc from history (§4, 5.1).
7. Add security headers + CSP, SRI on Chart.js, an iframe `sandbox`, self‑host fonts (5.3–5.5).
8. Add favicon, meta/OG tags, `robots.txt`, `sitemap.xml`; fix the "six tools" copy (§6).

**Phase 3 — performance, a11y, tests (week):**
9. Route‑level code‑splitting; pause animations off‑screen; honor reduced‑motion (§3, §7).
10. Vitest + RTL + a Playwright smoke flow; wire a GitHub Actions CI that runs `tsc`, lint, build,
    tests on every PR (§8).
11. Reconsider the `/` vs `/home` IA (§6).

**Phase 4 — product enhancements (optional, higher value):**
- Real (or clearly‑labeled delayed) market data for the ticker instead of hardcoded values.
- "Export my data" / "Delete my account" self‑service (you already promise it in the policy).
- PWA (installable, offline tools), shareable read‑only LifeMap links, email/password strength meter,
  and a server‑side rate‑limit story for auth.

---

*Prepared from a line‑by‑line read plus a reproduced `tsc` / `eslint` / `vite build` run.*
