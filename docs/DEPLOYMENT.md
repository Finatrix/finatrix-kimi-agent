# FinatriX — Deployment & Operations Runbook

**Hosting model:** Cloudflare Workers (static assets + a status-correct SPA Worker) for the frontend; Supabase (Postgres + Auth + Storage + Edge Functions) for the backend. Netlify is **not** used (config removed 2026-07-07).

---

## 1. Frontend — Cloudflare Workers

Config: `wrangler.jsonc` (worker `finatrix`, serves `./dist`, `not_found_handling: none`). The SPA fallback is gone: `worker/index.ts` owns status codes, returning 200 for real client routes and a genuine 404 otherwise, using `isKnownRoute` from `src/shared/routes.ts` — add any new route there or the edge will 404 it. Security and caching headers: `public/_headers` (copied into `dist/` by Vite; honoured only from `compatibility_date` 2025-04-01 onward). CSP is delivered **both** as a `<meta http-equiv>` in `index.html` and as an HTTP header on document responses in `_headers`; the two must stay byte-identical apart from `frame-ancestors`, which meta CSP cannot express. `deploy-config.test.ts` enforces that.

```bash
npm run build          # tsc -b && vite build
npx wrangler deploy    # deploys dist/ to the finatrix worker
```

Rollback: `npx wrangler deployments list` → `npx wrangler rollback [version-id]`.

### Domains

`https://finatrix.co` is the **only** canonical production host. It is declared in three places that must agree, and a test enforces each:

| Where | What it controls |
|---|---|
| `CANONICAL_HOST` in `src/shared/routes.ts` | the compiled default — canonical/`og:url` tags **and** the Worker's redirect target |
| `name` in `wrangler.jsonc` | **which Worker script the deploy lands on** — see the warning below |
| `routes` in `wrangler.jsonc` | which hostnames Cloudflare binds to this Worker (`finatrix.co`, `www.finatrix.co`, both `custom_domain: true`) |
| `vars.CANONICAL_HOST` in `wrangler.jsonc` | runtime override; set to `""` **only** while a new domain's DNS/SSL is still propagating |

> **Two Worker scripts exist in this account.** `finatrix-co` serves the live apex; the older
> `finatrix` (created 2026-06-29) is now reachable only on its `workers.dev` preview, because
> `finatrix.online` and `finatrix.space` no longer resolve. `wrangler.jsonc` therefore names
> `finatrix-co`. Verify the binding before changing it — compare the entry-bundle hash on
> `https://finatrix.co/` with each `<script>.finatrix-hub.workers.dev/`. Consolidating onto one
> script is worth doing, but it requires detaching the custom domain first, so it is a deliberate
> maintenance task rather than something to fold into a release.

`wrangler deploy` creates the DNS record and certificate for any hostname in `routes` that is not
yet attached, provided the `finatrix.co` zone is on the same Cloudflare account. No dashboard step
is needed. It refuses to attach a hostname another Worker already owns — a loud failure, which is
the behaviour we want.

`worker/index.ts` then 301s, in a single hop, to `https://finatrix.co`:

* `www.finatrix.co` → apex
* `finatrix.online` / `finatrix.space` (and their `www`) → apex. **Currently inert: neither domain resolves any more**, so there is nothing left to redirect and their link equity is already stranded. The rules cost nothing and resume working the moment either zone is re-pointed here. A change-of-address in Search Console for each old property is now the only lever left. `*.workers.dev` previews and `localhost` are never redirected.
* any plain-HTTP request → HTTPS, so TLS is enforced by the application and not only by the "Always Use HTTPS" toggle.

`Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` is sent on asset responses (`public/_headers`) and on the Worker's own redirect and `/healthz` responses. HTTP/3 and Brotli are zone-level Cloudflare settings (Speed → Optimization), on by default and not expressible in `wrangler.jsonc`.

After any domain change run `npm run verify:production`, which checks the live host end to end: redirect topology, HSTS, robots, every sitemap URL, JSON-LD and a real 404.

> **If it reports `UNVERIFIED — blocked before the origin`,** the request never reached the Worker
> and nothing was checked. It exits 0: this is inconclusive, not a failure, and it must not fail a
> deploy that already shipped. Two causes, named separately in the output:
>
> * **Cloudflare** (`cf-mitigated`, or a 403/503 carrying `cf-ray`) — the edge challenged the
>   caller. GitHub Actions runners get this intermittently on Azure IPs. **Bot Fight Mode cannot be
>   skipped by a WAF rule** — it runs outside the Ruleset Engine, so Skip/Bypass/Allow have no
>   effect. The only fixes are turning it off, or moving to Super Bot Fight Mode, which does support
>   Skip. Both are dashboard actions (Security → Bots).
> * **An intermediary** (403/503 with no `cf-ray`) — an egress proxy, allowlist or TLS intercept
>   between the caller and the edge. `worker/index.ts` only ever answers 200, 301 or 404 on a
>   document path, so any 403/503 is provably not ours. Re-run from a host that can reach the apex.
>
> Until the Cloudflare setting is changed, production verification is **skipped** on challenged runs
> rather than failing them — so a green pipeline does not by itself prove the site was verified.

### CD via GitHub Actions
`.github/workflows/deploy.yml` deploys on every push to `main` — but only once **all seven**
repository secrets exist (Settings → Secrets and variables → Actions). Until then every run
fails at its first step, which is the intended behaviour: a deploy that ships a bundle with
sign-in compiled out is worse than no deploy.

The `deploy` job (front end) needs five:

| Secret | Where to get it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | dash.cloudflare.com → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | `npx wrangler whoami` (currently `0cb5cc8481ab72624994a216ad4b1a19`) |
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` `public` key |
| `VITE_ANALYTICS_URL` | `<project-url>/functions/v1/analytics-collect` |

The `edge-functions` job needs two more (plus the two Supabase `VITE_*` values above, which
`npm run verify:deploy` cannot check anything without):

| Secret | Where to get it |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | supabase.com/dashboard/account/tokens |
| `SUPABASE_PROJECT_REF` | `supabase/.temp/project-ref`, or the dashboard URL |

**The three `VITE_*` values are deploy credentials, not optional extras.** Vite inlines them
at build time, so a build without them does not fail — it emits a bundle in which
`isSupabaseConfigured` is the constant `false`. That site loads, renders and passes an SEO
crawl while showing every visitor "the backend isn't configured yet" and refusing every
sign-in. It has reached production twice. Three separate guards now exist because of it: the
workflow preflight below, `assertDeployableClientConfig` in `vite.config.ts` (which covers
manual `npm run build` deploys), and `checkFrontendConfigured` in `npm run verify:production`
(which reads the bundle the live site actually serves).

Each job starts with a **preflight** step that checks its whole set at once, names every
missing secret in a single run, and does it before `npm ci` — so configuring this repository
is one round trip rather than one push per missing name. Neither job blocks the other.

`.github/workflows/ci.yml` runs type-check → lint → test → build on every push/PR to any
branch, and needs no secrets: its build sets `FX_ALLOW_UNCONFIGURED_BUILD=1` because it is a
compile check whose `dist/` is discarded. The deploy job deliberately does not.

---

## 2. Backend — Supabase (project `uspbsgbggurggsfsontq`)

### Schema (idempotent SQL files, apply in order)
```bash
# via CLI (linked project):
for f in schema.sql careers_schema.sql careers_phase2_schema.sql careers_phase3_schema.sql careers_phase4_schema.sql careers_phase4_1_schema.sql analytics_schema.sql careers_provider_infrastructure.sql; do
  supabase db query --file "supabase/$f"   # or paste into the SQL editor
done
```
All files are safe to re-run (`if not exists` / `drop policy if exists` / `on conflict`).

`analytics_schema.sql` and `careers_provider_infrastructure.sql` are **not optional**.
Every store in `careers-jobs` degrades silently when its table is missing, so an unapplied
migration does not fail — it produces a search that runs with **no cache (full provider cost
on every query), no health gating, no quota enforcement and no metrics**, while reporting
itself perfectly healthy. Confirm with `npm run verify:deploy`.

### Edge functions
```bash
supabase functions deploy careers-jobs careers-ai careers-email
supabase functions deploy analytics-collect --no-verify-jwt
```

**`analytics-collect` must be deployed with `--no-verify-jwt`.** The browser sends its
batches with `navigator.sendBeacon`, which cannot set an `Authorization` header. With the
gateway JWT check enabled the platform answers `401 UNAUTHORIZED_NO_AUTH_HEADER` *before* the
function runs, so **100% of analytics events, error reports and web vitals are dropped** — and
nothing anywhere reports a problem, because the client fires beacons and never inspects the
response. This is safe by design: the endpoint is anonymous, writes only allowlisted event
names and prop keys, is per-IP rate limited, and writes to a table no client can read.

Check it with `curl` (no auth header — exactly what a browser sends):
```bash
curl -i -X POST "$SUPABASE_URL/functions/v1/analytics-collect" -H 'Content-Type: application/json' -d '{"sid":"probe","ts":0,"events":[]}'
```
`204` is correct. `401` means the JWT gate is on and analytics is silently dead.

Deploying these is part of every release, not an occasional task. The front end and the
functions ship from the same commit; shipping one without the other is how the live
`careers-jobs` came to run a superseded provider contract for weeks while every local gate
stayed green. CI now does this automatically (`.github/workflows/deploy.yml`, job
`edge-functions`) — it needs `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` as repository
secrets, and fails loudly if they are absent rather than skipping silently.

**Always verify afterwards:**
```bash
npm run verify:deploy
```
This re-downloads the live function source, diffs it against the working tree, and checks that
every required database relation exists. It is the only check that can catch deployed-state
drift — no test, lint or build can.

**How it grades a mismatch.** `functions download` does not read back what
`functions deploy` wrote straight away, so an immediate comparison reports every file of every
function as differing. The check re-tries across a ~7 minute window, and after that:

| Result | Verdict |
|---|---|
| A function has **no deployed source at all** | **fails the deploy** — unambiguous, and the exact failure this script exists for |
| Files still differ textually | **warns**, printing an excerpt of the first difference; the deploy still passes |

A surviving textual difference cannot be told apart from a download that is not byte-faithful, so
it does not block a release that already shipped. Read the excerpt to settle it: stale but real
code means the window is too short; reformatting means the round trip is lossy. Currency itself is
enforced by `functions deploy`, which compares bundle hashes and fails on error.

### Secrets (edge functions)

The **names below are contractual**: `runtimeConfigFromEnv` reads these exact strings and
nothing else. A key stored under a marketplace label (`"Active Jobs DB"`, `"Google Jobs"`) is
never read, and that provider silently returns nothing forever. `careers-jobs` emits a
`WARNING` startup log naming any such key — check `supabase functions logs careers-jobs` after
setting secrets.

```bash
supabase secrets set OPENROUTER_API_KEY=sk-or-...          # required for AI
supabase secrets set RAPIDAPI_KEY=...                      # shared fallback for all six RapidAPI providers
supabase secrets set ACTIVE_JOBS_KEY=...                   # optional per-provider override
supabase secrets set LINKEDIN_JOBS_KEY=...
supabase secrets set JOB_POSTING_FEED_KEY=...              # NOTE: needed when this vendor issues its own key
supabase secrets set GOOGLE_JOBS_KEY=...
supabase secrets set GLASSDOOR_KEY=...
supabase secrets set WORKDAY_KEY=... WORKDAY_HOST=...      # WORKDAY_HOST is REQUIRED — no global endpoint exists
supabase secrets set ADZUNA_APP_ID=... ADZUNA_APP_KEY=...  # optional provider
supabase secrets set JOOBLE_KEY=...                        # optional provider
supabase secrets set RESEND_API_KEY=re_...                 # optional (email stays inert without it)
supabase secrets set EMAIL_FROM="FinatriX Careers <careers@finatrix.co>"  # optional
```

`supabase secrets list` returns SHA-256 **digests**, not values — two entries sharing a digest
hold the same key, which is a quick way to spot a provider accidentally reusing the shared
`RAPIDAPI_KEY` instead of its own.

### Tunables (all optional, sensible defaults in code)
| Env var | Default | Purpose |
|---|---|---|
| `CAREERS_AI_MODELS` | 6-model chain in `careers-ai/index.ts` | Comma-separated OpenRouter fallback chain |
| `CAREERS_AI_DAILY_LIMIT` | `60` | Per-user daily AI call quota (atomic, Postgres-enforced) |
| `CAREERS_AI_RATE_PER_MINUTE` | `20` | Per-isolate burst limit, careers-ai |
| `CAREERS_JOBS_RATE_PER_MINUTE` | `30` | Per-isolate burst limit per authenticated user, careers-jobs |
| `CAREERS_JOBS_UNAUTH_RATE_PER_MINUTE` | `60` | Per-IP burst limit applied **before** authentication, so an anonymous flood cannot run up auth calls and billed invocations |
| `CAREERS_PROVIDER_RETRIES` | `1` | Extra attempts on transient failures only (5xx / network / timeout), clamped 0–2. Never retries 4xx or 429 |
| `CAREERS_DISABLED_PROVIDERS` | *(empty)* | Comma-separated provider-id kill-switch — disable a provider without a redeploy |
| `CAREERS_EMAIL_RATE_PER_MINUTE` | `5` | Per-isolate burst limit, careers-email |
| `CAREERS_ALLOWED_ORIGINS` | finatrix.co, www.finatrix.co, localhost dev | CORS allowlist for all three functions |

---

## 3. Frontend environment variables (`.env`, build-time)

| Var | Purpose | Absent from the build ⇒ |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL (also drives the boot-time preconnect hint) | sign-in and cloud sync dead site-wide |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (public by design; RLS is the boundary) | sign-in and cloud sync dead site-wide |
| `VITE_ANALYTICS_URL` | `analytics-collect` ingest endpoint | no events, error reports or web vitals, ever |

These are **inlined by Vite at build time**, so they must exist in the environment that runs `vite build` — a local `.env` or the deploy workflow's secrets. Runtime secrets in Supabase or Cloudflare have no effect on them.

Absent, the build still succeeds and the affected feature is simply compiled out, with nothing broken-looking to show for it. Both failure modes above have reached production. Three gates now cover it:

1. `vite.config.ts` aborts a production build when any of the three is missing or still a placeholder. Builds that are deliberately backend-less (CI's compile check, Playwright e2e, forks) opt out with `FX_ALLOW_UNCONFIGURED_BUILD=1`.
2. `.github/workflows/deploy.yml` checks the same three before building.
3. `npm run verify:production` re-downloads the **live** bundle and fails if it shipped the placeholder client — the backstop for a manual `wrangler deploy`, which is how every production deploy has actually happened.

The app still degrades gracefully by design when a build opts out (finance tools work on-device, careers gated) — that path is for forks, not for finatrix.co.

---

## 4. Backups & disaster recovery

- **Database:** Supabase's daily automated backups (all plans) — dashboard → Database → Backups. Point-in-time recovery requires Pro; recommended before public beta.
- **Schema:** fully reconstructible from the five SQL files in `supabase/` (idempotent, in git).
- **Storage (`resumes` bucket):** not covered by DB backups. Raw resume *text* is preserved in `resume_versions.raw_text`, so analysis survives object loss; original files do not. Acceptable for beta; revisit for GA.
- **Frontend:** stateless — any git commit can be rebuilt and redeployed in ~2 minutes; wrangler keeps prior versions for instant rollback.
- **Full-loss runbook:** create Supabase project → apply the five SQL files → `supabase functions deploy` ×3 → set secrets → update `.env` → build + `wrangler deploy` → grant the first admin via SQL (`insert into platform_roles (user_id, role) values ('<uid>', 'super_admin');` with service role).

## 4a. Domain migrations — the config that does NOT live in git

A domain move is not finished when the repository stops mentioning the old host.
The finatrix.online → finatrix.co cutover proved it: DNS, SSL, the Worker
binding, the redirects, the sitemap, the canonical tags and every test were all
correct and green **while login was completely broken**, because two pieces of
deployed state still named older domains and neither is visible to a build.

Both are now covered by `npm run verify:production`. Run it after every
migration step; it exits non-zero on a real problem.

| Surface | Where it lives | Correct value |
| --- | --- | --- |
| Auth **Site URL** | Supabase → Authentication → URL Configuration | `https://finatrix.co` |
| Auth **Redirect URLs** | same screen | `https://finatrix.co/**`, plus `http://localhost:5173/**` for dev |
| **Edge CORS allowlist** | `supabase secrets set CAREERS_ALLOWED_ORIGINS=…` | leave **unset**; the canonical origins are built in (see below) |
| Google OAuth callback | Google Cloud console | `https://<ref>.supabase.co/auth/v1/callback` — the Supabase callback, never the site domain |
| Worker custom domains | `wrangler.jsonc` → `routes` | apex + `www`, both `custom_domain: true` |
| Canonical host | `src/shared/routes.ts` → `CANONICAL_HOST` | one constant; the Worker, SEO and edge functions all read it |

**Site URL is the one that bites.** GoTrue honours a `redirect_to` only if it
matches the Redirect-URLs allowlist; anything else is silently discarded and the
user is sent to the Site URL instead. A stale Site URL therefore breaks magic
links, email confirmation, password reset and OAuth **all at once**, with no
error anywhere — the user simply lands on the old host without a session.

**Why the CORS secret should stay unset.** `supabase/functions/_shared/origins.ts`
derives the allowlist from `CANONICAL_HOST` and treats `CAREERS_ALLOWED_ORIGINS`
as *additive*. It used to be `env ?? defaults`, so the secret **replaced** the
built-in list: it still held the retired domain, the correct in-repo default was
never evaluated, and `analytics-collect` answered every request from the new
origin with `Access-Control-Allow-Origin: https://finatrix.online`. Every
analytics event, error report and web vital was rejected by the browser. Set the
secret only to grant an *extra* origin (a staging host); it can no longer revoke
the site's own. Redeploying the functions is enough to correct a bad allowlist.

### Cutover order

1. Add the new domain to the Worker (`wrangler.jsonc` → `routes`) and deploy —
   both hosts serve, the old one 301s once DNS is live.
2. Update `CANONICAL_HOST`, rebuild, deploy.
3. Update Supabase Site URL + Redirect URLs.
4. `supabase functions deploy` ×4 (picks up the canonical origins).
5. `npm run verify:production` — must be all green before announcing.
6. Leave the old domain attached for ≥90 days so the 301s transfer link equity.

## 4b. Icons

The icon set is deliberately **responsive**, split at 64px: below that the
nine-tile logo cannot resolve (each tile gets ~4 pixels at 16×16), so the small
sizes use the simplified mark in `public/favicon.svg` — the same gold quadrant
block, centre node and connectors, redrawn on a pixel grid. At and above 64px
the full logo is used unchanged.

- Regenerate with `python3 scripts/generate-favicons.py` (needs `pillow`,
  `cairosvg`; dev-only, outputs are committed).
- Filenames are fixed by convention, so they cannot be content-hashed. Cache is
  `max-age=86400, must-revalidate` (`public/_headers`) plus a `?v=` token on
  every reference in `index.html` and the manifest. **Bump the token whenever an
  icon's bytes change** — `src/test/favicons.test.ts` fails if the tokens drift
  apart, and `verify:production` fails if any icon 404s in production.

## 5. Monitoring (current state)

- Edge function logs: `supabase functions logs careers-ai` (or dashboard → Edge Functions → Logs).
- Worker logs/analytics: Cloudflare dashboard → Workers & Pages → finatrix → Observability.
- AI usage/cost telemetry: in-product Admin Dashboard (`/careers/admin`), backed by `ai_usage_log`.
- Error monitoring (Sentry) and product analytics (PostHog): intentionally not integrated yet — see PROJECT-HANDOFF.md §15.
