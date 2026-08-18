# FinatriX

Education-first personal-finance tools for India — Budget Builder, Expense Tracker,
InvestMatch, ParkSmart, PeerCompare, Reverse Goal Planner and LifeMap. Free, no ads,
no trackers. **Educational tools, not financial advice.**

A React + TypeScript + Vite single-page app with a marketing landing page and an
authenticated tools workspace. Accounts, email verification and cross-device sync are
powered by Supabase; hosting is on Cloudflare Workers (static-asset serving at the edge).

## Tech stack

- **Frontend:** React 19, TypeScript, Vite 7, Tailwind CSS 3, React Router 7
- **Animation:** GSAP + Lenis (landing page), Canvas/WebGL backgrounds
- **Backend:** Supabase (auth + a single per-user `tool_data` row, protected by RLS)
- **Charts:** Chart.js (npm dependency, bundled)
- **Hosting:** Cloudflare Workers (static assets via `wrangler.jsonc`; security headers in `public/_headers`)
- **Tests:** Vitest + Testing Library

## Getting started

```bash
npm install
cp .env.example .env   # then fill in your Supabase URL + anon key
npm run dev            # http://localhost:3000
```

See **SETUP.md** for the full backend (Supabase) and hosting (Cloudflare) walkthrough, and
`supabase/schema.sql` for the database table + row-level-security policies.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check (`tsc -b`) **and** build for production |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest suite once |
| `npm run preview` | Preview the production build locally |

## Routes

| Path | Page |
| --- | --- |
| `/` | Marketing landing page |
| `/tools` | The tools workspace index; each tool is a real route, e.g. `/tools/budget` |
| `/login`, `/signup`, `/profile` | Authentication & account |
| `/privacy`, `/terms` | Legal |
| `*` | 404 |

## Project structure

```
src/
  pages/        Route components (lazy-loaded)
  sections/     Landing-page sections (Hero, Tools, Footer, …)
  components/   Shared UI (AuthShell, LegalPage, ErrorBoundary)
  context/      AuthContext (Supabase auth)
  tools/        Native React tool routes (pages/, lib/, ui/) + cloudSync to Supabase
  careers/      The sign-in-gated Careers product (resume intelligence, ATS, jobs)
  test/         Vitest setup + tests (incl. parity/ — locks calculator math)
public/
  _headers        Security + caching headers (Cloudflare/Netlify format)
  sitemap.xml     Public sitemap
  robots.txt      Crawl directives
```

> Every calculator is a **first-class React route** under `/tools/*` — the list lives in
> `src/shared/routes.ts`. There is no `tools-app.html` and no iframe in the running
> application.

## Deployment

Pushing to `main` triggers the GitHub Actions workflow in `.github/workflows/deploy.yml`,
which type-checks, builds (`npm run build`), and runs `npx wrangler deploy` to Cloudflare.
`wrangler.jsonc` configures static-asset serving; `public/_headers` defines the
Content-Security-Policy companion headers, HSTS, frame protection, and long-lived caching
for fingerprinted assets. The document CSP itself is set via `<meta http-equiv>` in
`index.html`.
