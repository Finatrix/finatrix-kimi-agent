# FinatriX — Project Handoff & Context

A complete summary of the work done so far, so a new chat can continue without re-deriving anything. Paste this whole file into a new conversation to resume.

---

## 1. What FinatriX is

An educational personal-finance website for India with 7 free tools, real user accounts, and cloud-synced data. It is **not** a broker/trading platform — strictly educational, "not financial advice."

- **Live site (custom domain):** https://fiantrix.online
- **Netlify default URL (same site):** https://finatrix-kimi-agent.netlify.app
- **The 7 tools:** Budget Builder, Expense Tracker, InvestMatch, ParkSmart, PeerCompare, Goal Planner, LifeMap.

---

## 2. How it started & evolved

1. Began with two inputs: a React/Vite landing-page project (dark gold, GSAP/WebGL animations) and a standalone `finatrix-tools_6.html` (the 7 tools, light "Apple" theme, Chart.js, localStorage).
2. Goal: merge them into one real website with sign-in + email verification + per-user cloud data that syncs across devices.
3. First approach extracted the tools' JS into React — it subtly broke tools (blank Budget page). **Reworked** to run the original tools HTML **verbatim inside an `<iframe>`**, which is the current, working design.
4. Added Supabase backend, deployed to Netlify, then iterated: tools-as-homepage, currency selector, bug fixes, legal/privacy overhaul, mobile fixes.

---

## 3. Architecture (current)

- **Frontend:** Vite + React 19 + TypeScript + Tailwind v3, react-router v7. The landing animations use GSAP + a WebGL shader.
- **Tools:** the original HTML runs **unchanged** at `public/tools-app.html`, embedded via an iframe in the React `ToolsPage`. This keeps tool behavior identical to the source file.
- **Backend:** Supabase (auth with email verification + Postgres + Row-Level Security).
- **Cloud sync bridge:** the iframe is same-origin, so the tools' `localStorage` is shared with the React app. The app mirrors specific keys to the user's Supabase row and back (`src/tools/cloudSync.ts`).
- **Hosting:** Netlify, auto-deploys from GitHub `main`. Vite `base: '/'` (absolute) so routes like `/tools` load assets correctly.

### Key files
- `src/App.tsx` — routes: `/` → ToolsPage (homepage), `/home` → landing, `/tools`, `/login`, `/signup`, `/profile`, `/privacy`, `/terms`.
- `src/main.tsx` — wraps app in `<AuthProvider>`.
- `src/lib/supabase.ts` — Supabase client; `isSupabaseConfigured` flag.
- `src/context/AuthContext.tsx` — session/user state, signUp/signIn/signOut, resend/reset.
- `src/pages/ToolsPage.tsx` — slim top bar (FinatriX wordmark + account/sync) + the tools iframe; handles cloud sync on mount/account change.
- `src/tools/cloudSync.ts` — `SYNC_KEYS = ['fx_expenses','fx_budget','fx_currency']`, load/push to Supabase, plus `fx_last_uid` for account-switch handling.
- `src/pages/{Login,Signup,Profile}.tsx`, `src/components/AuthShell.tsx` — auth UI (dark gold).
- `src/pages/{Privacy,Terms}.tsx`, `src/components/LegalPage.tsx` — legal pages.
- `src/sections/*` — landing page sections (Hero, Capabilities, Ticker, Footer, etc.).
- `public/tools-app.html` — the verbatim tools app (with the small fixes listed below).
- `supabase/schema.sql`, `.env`, `.env.example`, `SETUP.md`, `netlify.toml`.

### Repo / working folder
- Local path: `~/Downloads/app` (this folder).
- Git remote: `https://github.com/Finatrix/finatrix-kimi-agent.git`, branch `main`.

---

## 4. Backend config (Supabase)

- **Project:** "Finatrix's Project", ref `uspbsgbggurggsfsontq`.
- **Project URL:** `https://uspbsgbggurggsfsontq.supabase.co`
- **Publishable (anon) key:** `sb_publishable_BJ5ucFnZJyrMpotDGlP3Kw_DgAzNUKt` (public, safe in browser).
- **Table:** `public.tool_data (user_id uuid PK → auth.users, data jsonb, updated_at)` with RLS so each user can only read/write their own row (see `supabase/schema.sql`).
- **Auth:** email/password, "Confirm email" ON, signups allowed.
- **URL config:** Site URL = `https://finatrix-kimi-agent.netlify.app`; Redirect allowlist includes `http://localhost:3000/**` and `https://finatrix-kimi-agent.netlify.app/**`.
- Display name is stored in Supabase Auth user metadata (no separate profiles table).

### Env vars
`.env` (local) and Netlify both set:
```
VITE_SUPABASE_URL=https://uspbsgbggurggsfsontq.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_BJ5ucFnZJyrMpotDGlP3Kw_DgAzNUKt
```
`.env` is git-ignored. `@supabase/supabase-js` pinned to `^2.49.0` (supports the new publishable-key format).

---

## 5. Hosting (Netlify)

- Project **finatrix-kimi-agent**, deploys from GitHub `main` (auto-publish on).
- Build: `npm install && npm run build:netlify` (which is `vite build` — **no tsc**, so type-only issues won't block deploy). Publish dir `dist`.
- `netlify.toml` has forced redirects for `/tools` and `/tools/*` → `/index.html` (so the SPA route wins over any stale static file) plus the SPA catch-all.
- Custom domain **fiantrix.online** points at this same site.

---

## 6. Changes made vs. the original tools HTML

Inside `public/tools-app.html`:
1. Fixed InvestMatch `${${` template-literal typo (had silently broken that tool).
2. Fixed Expense Tracker **breakdown** icons (`${c.i}` → real SVG; previously showed "undefined").
3. Fixed Expense Tracker **history** icons (same bug).
4. Fixed LifeMap **category-tab** icons (same "undefined" bug).
5. Added a **currency system**: 40 currencies + selector in the tools nav (`cfmt`/`cfmtSh` formatters; `fx_currency` persisted; INR keeps Lakh/Crore).
6. Budget Builder, Expense Tracker, LifeMap amounts now follow the selected currency; InvestMatch/ParkSmart/PeerCompare/Goal Planner stay ₹ (India-specific).
7. Input labels (and Overview "Cost forever") show the selected currency symbol via `.fx-sym` spans + `fxApplyLabels()`.
8. LifeMap now scrolls to the **top** when you submit the setup form (was opening at the bottom).
9. Replaced false privacy claims ("stays in your browser / nothing leaves your device / lives only in this browser") with accurate guest-vs-account wording; "Private, on-device" → "Private & secure."
10. Tools footer now links Privacy / Terms / Contact and says "not financial advice."

Around the file (app/site/backend):
11. Tools run verbatim in an iframe inside the React app (one site).
12. Real accounts: sign-up, email verification, login, profile (Supabase).
13. Cloud sync: budget, expenses, currency saved to the account and synced across devices.
14. Tools dashboard is the **homepage**; marketing landing moved to `/home` (unlinked).
15. Deployed publicly on Netlify with env-based Supabase keys.

---

## 7. Legal / privacy work (latest round)

- New **Privacy Policy** (`/privacy`) and **Terms & Conditions** (`/terms`) pages: data collected, guest-vs-cloud storage, processors (Supabase/Netlify), retention, user rights (access/delete/export under India DPDP + GDPR), security/RLS, cookies, children (18+), contact.
- **Signup consent checkbox**: "I agree to the Terms & Conditions and Privacy Policy…" with clickable links opening in a new tab; account can't be created until ticked.
- Softened misleading landing claims (HFT / "executing strategies" / "trade from a single interface" / "predict price") to honest educational wording; labeled the ticker "ILLUSTRATIVE — NOT LIVE MARKET DATA."
- Contact email updated everywhere to **finatrix.hub@gmail.com**.

---

## 8. Mobile fixes (latest round)
- Responsive tools account bar (long sync/status text hidden on small screens; tighter spacing; "Sign in" label shortened).
- Container uses `height: 100dvh` (dynamic viewport) so nothing is cut off by mobile browser chrome.
- Landing hero heading scales down on phones; hero box padding reduced; overflow guards.
- NOTE: true mobile width couldn't be rendered in the tooling used — **verify on a real phone** and report anything still off.

---

## 9. Outstanding / known issues

1. **Email "rate limit exceeded" on signup** — this is Supabase's built-in email throttle (a few/hour, test-only). Fix = connect a custom SMTP provider in Supabase → Authentication → SMTP. Options: Gmail SMTP with an **App Password** (`smtp.gmail.com`, port 465, username = full email `finatrix.hub@gmail.com`, password = 16-char App Password, requires 2-Step Verification), or Brevo/Amazon SES for better deliverability. Resend won't work (needs an owned/verified domain; sender is gmail.com). When the user was last setting this up, the **Username** field was wrongly "Finatrix's Project" — it must be the full email.
2. The marketing landing at `/home` still exists (orphaned, not linked); claims were softened but it could be removed entirely if desired.
3. A few unused starter files remain (`src/components/ui/` excluded from build; old `src/tools/{toolsEngine.js,toolsMarkup.ts,tools.css,fxStore.ts}` from the first approach — safe to delete).
4. India-specific tax figures in the tools are hard-coded for 2026 and will go stale — add "as of" dates if updating.

---

## 10. Important workflow notes for whoever continues

- **The build cannot be run in the assistant's sandbox** (npm registry is blocked there). Verification is done by: `node --check` on the tools' extracted JS, static review, and live checks after deploy. Netlify runs the real build.
- **The assistant cannot push to git** (sandbox can't write `.git`, and push needs the user's GitHub creds). Workflow: assistant edits files → **user runs** `git add -A && git commit -m "..." && git push origin main` in `~/Downloads/app` → Netlify auto-deploys (~15s) → assistant verifies the live site.
- **File-permission quirk:** the assistant's file-edit tool can re-own `public/tools-app.html` so the shell can't overwrite it afterward; large scripted edits to it are done by remove-then-rewrite (folder deletion was enabled).
- The assistant can drive the browser (Supabase/Netlify dashboards) but **must not enter passwords/API keys/SMTP secrets** — the user types those.

### Standard push command
```
cd ~/Downloads/app
git add -A
git commit -m "describe change"
git push origin main
```

---

## 11. Suggested next steps
- Finish custom SMTP so verification emails are reliable.
- Test thoroughly on a real phone; report mobile issues.
- Consider deleting `/home` and the unused starter files.
- Optionally add account-deletion self-service (currently via email request) and "as of" dates on tax content.
