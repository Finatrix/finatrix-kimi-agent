# FinatriX — Deployment & Operations Runbook

**Hosting model:** Cloudflare Workers (static assets, SPA fallback) for the frontend; Supabase (Postgres + Auth + Storage + Edge Functions) for the backend. Netlify is **not** used (config removed 2026-07-07).

---

## 1. Frontend — Cloudflare Workers

Config: `wrangler.jsonc` (worker `finatrix`, serves `./dist`, `not_found_handling: single-page-application`). Security and caching headers: `public/_headers` (copied into `dist/` by Vite). CSP is set per-document via `<meta http-equiv>` in `index.html` — deliberately not duplicated in `_headers`.

```bash
npm run build          # tsc -b && vite build
npx wrangler deploy    # deploys dist/ to the finatrix worker
```

Rollback: `npx wrangler deployments list` → `npx wrangler rollback [version-id]`.

**Custom domain (dashboard-only, one-time):** Cloudflare dashboard → Workers & Pages → `finatrix` → Settings → Domains & Routes → add `finatrix.online` (and `www`). Requires the `finatrix.online` zone to be on the same Cloudflare account.

### CD via GitHub Actions
`.github/workflows/deploy.yml` deploys on every push to `main` once two repo secrets exist (Settings → Secrets and variables → Actions):

| Secret | Where to get it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | dash.cloudflare.com → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | `npx wrangler whoami` (currently `0cb5cc8481ab72624994a216ad4b1a19`) |

`.github/workflows/ci.yml` runs type-check → lint → test → build on every push/PR to any branch.

---

## 2. Backend — Supabase (project `uspbsgbggurggsfsontq`)

### Schema (idempotent SQL files, apply in order)
```bash
# via CLI (linked project):
for f in schema.sql careers_schema.sql careers_phase2_schema.sql careers_phase3_schema.sql careers_phase4_schema.sql; do
  supabase db query --file "supabase/$f"   # or paste into the SQL editor
done
```
All files are safe to re-run (`if not exists` / `drop policy if exists` / `on conflict`).

### Edge functions
```bash
supabase functions deploy careers-ai careers-jobs careers-email
```

### Secrets (edge functions)
```bash
supabase secrets set OPENROUTER_API_KEY=sk-or-...        # required for AI
supabase secrets set ADZUNA_APP_ID=... ADZUNA_APP_KEY=...  # optional provider
supabase secrets set RAPIDAPI_KEY=...                      # optional (JSearch)
supabase secrets set JOOBLE_KEY=...                        # optional provider
supabase secrets set RESEND_API_KEY=re_...                 # optional (email stays inert without it)
supabase secrets set EMAIL_FROM="FinatriX Careers <careers@finatrix.online>"  # optional
```

### Tunables (all optional, sensible defaults in code)
| Env var | Default | Purpose |
|---|---|---|
| `CAREERS_AI_MODELS` | 6-model chain in `careers-ai/index.ts` | Comma-separated OpenRouter fallback chain |
| `CAREERS_AI_DAILY_LIMIT` | `60` | Per-user daily AI call quota (atomic, Postgres-enforced) |
| `CAREERS_AI_RATE_PER_MINUTE` | `20` | Per-isolate burst limit, careers-ai |
| `CAREERS_JOBS_RATE_PER_MINUTE` | `30` | Per-isolate burst limit, careers-jobs |
| `CAREERS_EMAIL_RATE_PER_MINUTE` | `5` | Per-isolate burst limit, careers-email |
| `CAREERS_ALLOWED_ORIGINS` | finatrix.online, www, finatrix.finatrix-hub.workers.dev, localhost dev | CORS allowlist for all three functions |

---

## 3. Frontend environment variables (`.env`, build-time)

| Var | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL (also drives the boot-time preconnect hint) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (public by design; RLS is the boundary) |

The app degrades gracefully (finance tools work locally, careers gated) when these are absent.

---

## 4. Backups & disaster recovery

- **Database:** Supabase's daily automated backups (all plans) — dashboard → Database → Backups. Point-in-time recovery requires Pro; recommended before public beta.
- **Schema:** fully reconstructible from the five SQL files in `supabase/` (idempotent, in git).
- **Storage (`resumes` bucket):** not covered by DB backups. Raw resume *text* is preserved in `resume_versions.raw_text`, so analysis survives object loss; original files do not. Acceptable for beta; revisit for GA.
- **Frontend:** stateless — any git commit can be rebuilt and redeployed in ~2 minutes; wrangler keeps prior versions for instant rollback.
- **Full-loss runbook:** create Supabase project → apply the five SQL files → `supabase functions deploy` ×3 → set secrets → update `.env` → build + `wrangler deploy` → grant the first admin via SQL (`insert into platform_roles (user_id, role) values ('<uid>', 'super_admin');` with service role).

## 5. Monitoring (current state)

- Edge function logs: `supabase functions logs careers-ai` (or dashboard → Edge Functions → Logs).
- Worker logs/analytics: Cloudflare dashboard → Workers & Pages → finatrix → Observability.
- AI usage/cost telemetry: in-product Admin Dashboard (`/careers/admin`), backed by `ai_usage_log`.
- Error monitoring (Sentry) and product analytics (PostHog): intentionally not integrated yet — see PROJECT-HANDOFF.md §15.
