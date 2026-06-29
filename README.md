# FinatriX

Education-first personal-finance tools for India — Budget Builder, Expense Tracker,
InvestMatch, ParkSmart, PeerCompare, Reverse Goal Planner and LifeMap. Free, no ads,
no trackers. **Educational tools, not financial advice.**

A React + TypeScript + Vite single-page app with a marketing landing page and an
authenticated tools workspace. Accounts, email verification and cross-device sync are
powered by Supabase; hosting is on Netlify.

## Tech stack

- **Frontend:** React 19, TypeScript, Vite 7, Tailwind CSS 3, React Router 7
- **Animation:** GSAP + Lenis (landing page), Canvas/WebGL backgrounds
- **Backend:** Supabase (auth + a single per-user `tool_data` row, protected by RLS)
- **Charts:** Chart.js (self-hosted in `public/vendor/`)
- **Hosting:** Netlify (SPA redirects + security headers in `netlify.toml`)
- **Tests:** Vitest + Testing Library

## Getting started

```bash
npm install
cp .env.example .env   # then fill in your Supabase URL + anon key
npm run dev            # http://localhost:3000
```

See **SETUP.md** for the full backend (Supabase) and hosting (Netlify) walkthrough, and
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
| `/tools` | The tools workspace (supports deep-links, e.g. `/tools#/budget`) |
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
  hooks/        useComputationalLattice (Hero canvas)
  tools/        cloudSync — mirrors tool localStorage keys to Supabase
  test/         Vitest setup + tests
public/
  tools-app.html  The self-contained tools app (rendered in a same-origin iframe)
  vendor/         Self-hosted Chart.js
```

## Deployment

Pushing to `main` triggers a Netlify build (`npm run build:netlify`, which **does**
type-check). `netlify.toml` defines SPA redirects, a Content-Security-Policy, other
security headers, and long-lived caching for fingerprinted assets.
