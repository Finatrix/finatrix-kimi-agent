# FinatriX — Production Release Runbook

Exact, ordered steps to take the verified repository live on **finatrix.co** with **finatrix.co**
301-redirecting. These require credentials that live in your Supabase/Cloudflare/GitHub accounts (not in
the build environment), so they are run by the owner or CI. Everything in the repo is already verified:
`tsc` clean · **794+ tests pass** · **533 parity assertions green** · changed code lint-clean.

> Rollback is noted at each step. Do steps 1–4 first (they're safe and reversible); the domain flip
> (step 6) is the only user-visible cutover.

---

## 0. Pre-flight
```bash
npm ci
npx tsc -b && npx eslint . --max-warnings 0 && npm test   # full local gate (mirrors CI)
npm run build                                              # produces ./dist
```
Green here = the artifact is releasable.

## 1. Supabase — apply schema (idempotent; safe to re-run)
SQL Editor → New query → paste each file's contents → Run, **in this order**:
1. `supabase/schema.sql`  (adds tool_data size cap + updated_at trigger)
2. `supabase/careers_schema.sql`
3. `supabase/careers_phase2_schema.sql`
4. `supabase/careers_phase3_schema.sql`
5. `supabase/careers_phase4_schema.sql`  (coupon lock + validate_coupon + is_platform_admin DEFINER + search_path)
6. `supabase/analytics_schema.sql`  (analytics_events + retention)

**Verify (should return zero rows / show SECURITY DEFINER):**
```sql
select tablename from pg_tables where schemaname='public' and rowsecurity=false;         -- expect: none
select proname, prosecdef, proconfig from pg_proc
 where pronamespace='public'::regnamespace
   and proname in ('is_platform_admin','validate_coupon','increment_ai_usage','prune_analytics_events');
```
Rollback: policies/functions are `create or replace` / `drop … if exists` — re-running a prior file reverts.

## 2. Supabase — schedule retention (pg_cron)
```sql
select cron.schedule('prune-analytics', '0 3 * * *', $$ select public.prune_analytics_events(90); $$);
```

## 3. Supabase — deploy Edge Functions + secrets
```bash
supabase functions deploy careers-ai
supabase functions deploy careers-jobs
supabase functions deploy careers-email
supabase functions deploy analytics-collect --no-verify-jwt   # public, anonymous, rate-limited

supabase secrets set OPENROUTER_API_KEY=sk-or-...             # careers-ai
supabase secrets set ADZUNA_APP_ID=... ADZUNA_APP_KEY=... RAPIDAPI_KEY=... JOOBLE_KEY=...   # careers-jobs (each optional)
# Optional origin override once on the new domain:
supabase secrets set CAREERS_ALLOWED_ORIGINS="https://finatrix.co,https://www.finatrix.co"
```
Verify: `supabase functions logs analytics-collect` after step 5 shows 204s, no errors.

## 4. Frontend env + Cloudflare Worker deploy
Set build env (`.env` / CI): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_ANALYTICS_URL=https://<project-ref>.supabase.co/functions/v1/analytics-collect`.
```bash
npm run build && npx wrangler deploy        # or: git push main → GitHub Actions (.github/workflows/deploy.yml)
curl -s https://<worker-url>/healthz         # {"status":"ok",...}
curl -s -o /dev/null -w "%{http_code}\n" https://<worker-url>/nope   # 404 (soft-404 fixed)
```
Rollback: `npx wrangler rollback` or redeploy the previous commit.

## 5. Cloudflare — bind domains
Workers & Pages → your Worker → **Custom Domains** → add `finatrix.co`, `www.finatrix.co`, and keep
`finatrix.co` bound. DNS: proxied (orange-cloud) records for the apex + www; SSL/TLS = Full (strict).

## 6. Domain cutover (the only user-visible flip)
Once `https://finatrix.co/healthz` returns 200 on the real domain, set the Worker var and redeploy:
```
wrangler.jsonc → "vars": { "CANONICAL_HOST": "finatrix.co" }
npx wrangler deploy
```
This activates the built-in 301: `finatrix.co` + `www.*` → `finatrix.co` (path/query preserved).
Then flip the static canonical set for SEO (single commit):
- `index.html` (canonical, `og:url`, JSON-LD `@id`/`url`), `public/sitemap.xml`, `public/robots.txt`,
  `public/.well-known/security.txt`, and `src/test/deploy-config.test.ts` → `finatrix.co` ⇒ `finatrix.co`.
- Supabase Auth → Site URL + Redirect URLs: add `https://finatrix.co` (Google OAuth + email).
- Google Search Console: verify `finatrix.co`, submit sitemap, set Change of Address from `.online`.

Rollback: unset `CANONICAL_HOST` (redirect goes inert) and revert the canonical commit.

## 7. Post-launch verification
```bash
curl -I https://finatrix.co/               # HSTS, X-Frame-Options, nosniff, Referrer/Permissions-Policy
curl -s -o /dev/null -w "%{http_code}\n" https://finatrix.co/   # 301 → finatrix.co
```
- securityheaders.com → A/A+ ; Lighthouse (mobile, throttled) → confirm LCP/CLS/INP; axe → no AA violations.
- Confirm `analytics_event_counts_daily` is receiving rows (admin) and DNT/GPC visitors send nothing.
- Point uptime monitor at `https://finatrix.co/healthz`.

## 8. Monitoring & rollback readiness
- Alerts per `docs/OBSERVABILITY.md §8`. Health probe: `/healthz`.
- App rollback: `wrangler rollback` (Worker) / revert commit + redeploy. DB: schema is additive/idempotent;
  no destructive migration was introduced.
