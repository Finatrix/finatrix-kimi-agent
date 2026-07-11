# FinatriX Phase 4.1 — Company Intelligence Search Expansion

**Goal:** make Careers search feel like an AI-powered career-intelligence platform —
live job listings *enriched* by structured company intelligence, without replacing
the existing search architecture. Nothing in the existing engine was rewritten; every
addition is an extension stage or a new, self-contained surface.

---

## What shipped

### 1 · Data layer (global reference, not live jobs)
- New `ci_*` reference tables + RLS + indexes: `supabase/careers_phase4_1_schema.sql`.
  Prefixed `ci_` so nothing collides with the existing per-user `companies` table.
- Generated, idempotent seed (804 companies + all relations): `supabase/company_intelligence_seed.sql`.
- Persistent business ids (`CMP-00001`); every relationship references ids, never array indexes.
- Per-user tables: `ci_saved_companies` (saved / favourite) and `ci_recent_companies` (recently viewed).

### 2 · Matching engine (deterministic, pure)
`src/careers/search/companyMatch.ts` — resolves a live employer string to a CI record:
exact → whitespace/case/punctuation-normalized → alias/synonym → conservative fuzzy.
Aliases come from the dataset's `synonym` tags (J.P. Morgan / JPMorgan / JPMC → one company;
ANZ → Australia and New Zealand Banking Group).

### 3 · Search enrichment + multi-entity search + no-jobs fallback
- `src/careers/search/enrich.ts` — a **Company Enrichment stage that runs after** the existing
  `runSearchPipeline`. It attaches CI metadata to each result and **never mutates the job source**.
- Job cards now show industry / graduate / internship / ATS / confidence badges + a link to the
  company profile.
- **No-jobs fallback**: when live search returns nothing (or the backend is down), the page shows
  matching companies from the intelligence base instead of a dead "no results".
- New **Company Intelligence search page** (`/careers/intelligence`): search Companies, Graduate
  programs, Internships, or by Department / Industry / ATS / Location / Tag / Opportunity source —
  all reusing one paginated code path.

### 4 · Company profiles + smart filters
- `/careers/intelligence/company?id=…` — overview, hiring departments, locations, graduate programs,
  internships, ATS, career + official sites, salary intelligence, opportunity sources, related
  companies, confidence + last-verified. Save / favourite / recently-viewed wired to Supabase.
  Missing data is omitted, never fabricated.
- Filters (industry, department, ATS, size, source, graduate, internship) reuse existing controls.

### 5 · Integrations
- **Dashboard**: `CompanyIntelPanel` — recently viewed, companies in your field, companies with
  graduate programs.
- **Settings**: preferred industries / locations / departments / ATS — these **boost** search ranking.
- **Ranking**: `src/careers/search/rerank.ts` — a preference + CI boost applied **after** the
  pipeline's own ranking (extends, never replaces; only re-orders, never hides).
- **Notifications**: favouriting a company fires a real, data-supported, deduped notification.
- **Reports**: `src/careers/search/companyReports.ts` — applications by company / ATS / industry /
  location + graduate/internship counts, surfaced on the Intelligence page.

### 6 · Scalable, idempotent import pipeline (10k+ ready)
`scripts/import-company-intelligence.py` — drop new batch CSV folders anywhere under an import dir
and run one command. It auto-discovers batches, validates every foreign key, de-duplicates by id
and by normalized name, **merges aliases while preserving ids**, upserts idempotently in a single
transaction (rollback on failure), and writes an import report. See
`scripts/COMPANY_INTELLIGENCE_IMPORT.md`. Verified across dedup / alias-merge / FK-orphan /
id-conflict paths. Client store pages through Supabase (`fetchAll`, 1,000-row chunks) and all search
is paginated, so latency and payload stay flat as the dataset grows — nothing is hardcoded to 804.

### 7 · Job-search failure — root cause fixed
**Root cause:** the dev server runs on **:3000** (`vite.config.ts`) but the `careers-jobs` edge
function's `ALLOWED_ORIGINS` only listed :5173/:4173, so in local dev it returned
`Access-Control-Allow-Origin: https://finatrix.online`, the browser blocked the response, and
`functions.invoke` surfaced it as the opaque *"Job search failed. Check your connection."*
A secondary issue: `jobsService` collapsed 429 / 5xx / network into that one message.

**Fixes** (`supabase/functions/careers-jobs/index.ts`, `src/careers/services/jobsService.ts`):
- CORS now reflects any `localhost` / `127.0.0.1` origin (any port) plus the prod allowlist.
- The handler is wrapped so any crash returns a CORS-safe JSON 500 the client can read.
- Errors are disambiguated: **auth**, **not-deployed**, **rate-limited**, **backend down**, **network/CORS**.
- Per-provider status + counts are returned and rendered:
  `3 providers searched · ✓ Remotive (24) · ✓ Adzuna (81) · ⚠️ JSearch temporarily unavailable · ✓ Jooble (42)`.
- One provider failing **never** fails the whole search (already `Promise.allSettled`; now surfaced).
- Backend-down still shows matching companies from the intelligence base.

---

## You need to do (I don't touch git / live DB / deploys)

1. **Apply the schema + seed to Supabase** (idempotent, safe to re-run):
   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/careers_phase4_1_schema.sql
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/company_intelligence_seed.sql
   ```
2. **Redeploy the edge function** (CORS + error-handling fix):
   ```bash
   supabase functions deploy careers-jobs
   ```
3. **Run the remaining local gates on your Mac** (they can't run in my Linux sandbox — see below):
   ```bash
   npm test        # vitest — includes the new src/test/careers.company-intel.test.ts
   npm run build   # tsc -b && vite build
   ```

---

## Verification status

| Gate | Where | Result |
|------|-------|--------|
| `tsc -b` (whole project) | sandbox | **0 errors** |
| `eslint .` (whole project) | sandbox | **0 problems** |
| CI-layer runtime checks (store, matching, search, pagination, enrichment, rerank, reports) | sandbox | **27 / 27 pass** |
| Import pipeline (dedup / alias-merge / FK / id-conflict) | sandbox | **verified** |
| `vitest` full suite | **your Mac** | new suite `careers.company-intel.test.ts` added (33 assertions); run `npm test` |
| `vite build` | **your Mac** | run `npm run build` |

> Why vitest / vite build didn't run here: your `node_modules` was installed for macOS
> (`@rollup/rollup-darwin-arm64`); this sandbox is Linux and needs `@rollup/rollup-linux-arm64-gnu`,
> which the locked-down registry (HTTP 403) wouldn't install. `tsc` and `eslint` don't use rollup,
> so they ran fully; the runtime harnesses re-implement the vitest assertions against the real
> fixture to compensate. On your Mac the native binary is already correct, so `npm test` /
> `npm run build` will run normally.

## Accessibility / theming / parity
- WCAG: semantic headings, `role="tablist"/"tab"` + `aria-selected` + keyboard handlers on the facet
  selector, `aria-live` result region, `aria-busy` loaders, `scope` on table headers, accessible
  names on all controls.
- Dark/light: all new UI uses existing CSS tokens (`var(--ink)`, `--hair2`, badge classes) — no
  hardcoded colours; responsive via `dash-grid` + flex-wrap.
- **Calculation parity: untouched.** No financial formula, calculator, or scoring logic was changed;
  ranking is *extended* by an additive, bounded boost applied after the existing engine.

## New / changed files
- Schema/seed: `supabase/careers_phase4_1_schema.sql`, `supabase/company_intelligence_seed.sql`, `supabase/import-report.json`
- Scripts: `scripts/import-company-intelligence.py`, `scripts/build-company-intelligence.py`, `scripts/COMPANY_INTELLIGENCE_IMPORT.md`
- Types: `src/careers/types/companyIntel.ts`, `src/careers/types/index.ts` (settings prefs)
- Logic: `src/careers/search/companyMatch.ts`, `enrich.ts`, `rerank.ts`, `companyReports.ts`; `src/careers/services/companyIntelligence.ts`, `companyIntelUser.ts`
- UI: `src/careers/pages/CompanyIntelPage.tsx`, `CompanyProfilePage.tsx`, `components/CompanyIntelPanel.tsx`; edits to `JobsPage.tsx`, `CompaniesPage.tsx`, `CareersSettings.tsx`, `CareersDashboard.tsx`
- Pipeline/edge: `src/careers/search/pipeline.ts`, `src/careers/services/jobsService.ts`, `src/careers/utils/errors.ts`, `supabase/functions/careers-jobs/index.ts`
- Routing/nav: `src/App.tsx`, `src/careers/constants/index.ts`
- Tests: `src/test/careers.company-intel.test.ts`, fixture `src/careers/test/fixtures/company-intelligence.json`
