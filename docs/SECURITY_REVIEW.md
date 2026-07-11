# FinatriX — Security Review (Phase 2, repo-based)

**Date:** 11 July 2026 · **Method:** full read of `supabase/*.sql`, `supabase/functions/*`, client
data-access code, deploy config. **Scope boundary:** static analysis of the authoritative repository.
No production credentials were used or required (see §6 for why, and the few items that warrant a
self-serve live check).

---

## 1. Overall posture

FinatriX's backend is **notably mature** for its stage. Row-Level Security is enabled on every table,
storage isolation is textbook-correct, and the edge functions are genuinely well-built (JWT auth,
CORS allowlists, rate limiting, input bounds, timeouts, secrets in env, no SSRF). The review found
**no critical vulnerability**, one medium business-logic issue, and a cluster of database-hardening
improvements — all now fixed in the repo.

### What's already strong (verified in source)
- **RLS everywhere.** Every `public` table has `enable row level security`. User-owned tables scope
  to `auth.uid() = user_id`. Tables with no policy are fail-closed (deny-all → service-role only).
- **Storage isolation is exemplary.** The `resumes` bucket is private, 10 MB-capped, MIME-allowlisted
  (pdf/doc/docx), and every object policy enforces `(storage.foldername(name))[1] = auth.uid()::text`
  — a user can only ever touch files under their own UID folder.
- **Edge functions (`careers-ai`, `careers-jobs`).** Authenticate the caller with their Supabase JWT;
  CORS restricted to an origin allowlist (not `*`); per-user rate limiting; strict input caps; request
  timeouts; **no SSRF** (job-provider URLs are a fixed hardcoded set — user input only fills encoded
  query params); OpenRouter key never leaves the server; the AI meter uses an **atomic** Postgres
  upsert to prevent quota races. `increment_ai_usage` is correctly revoked from `public/anon/authenticated`.
- **Secrets hygiene.** No private keys in the client bundle beyond the intended Supabase publishable
  anon key; `.env` and `supabase/.temp/` are gitignored and **not committed** (project ref not leaked).
- **Security headers** shipped via `public/_headers` (HSTS preload, XFO, nosniff, Referrer-Policy,
  Permissions-Policy) + a strict CSP `<meta>` (`default-src 'self'`, `object-src 'none'`).

---

## 2. Findings & status

| # | Severity | Finding | Status |
|---|---|---|---|
| S-1 | **Medium** | `coupons` select policy `using (active = true)` let any signed-in user enumerate **all active coupon codes** via PostgREST (discount abuse). | ✅ **Fixed** |
| S-2 | **Medium** | Latent **RLS infinite-recursion**: `platform_roles_select` → `is_platform_admin()` → reads `platform_roles` → same policy. Admin reads of *other* users' rows would error. | ✅ **Fixed** |
| S-3 | Low/Hardening | **Mutable `search_path`** on all DB functions (`is_platform_admin`, `increment_ai_usage`, `careers_touch_updated_at`) — Supabase-lint "Function Search Path Mutable" class; object-resolution hijack risk. | ✅ **Fixed** |
| S-4 | Low/Hardening | `tool_data.data` JSONB had **no size cap** — a signed-in user could write an unbounded blob (storage/cost abuse). | ✅ **Fixed** |
| S-5 | Low | `tool_data.updated_at` only defaulted on insert; a client could send a **backdated** value on upsert. | ✅ **Fixed** (server-stamped trigger) |
| S-6 | Low | `careers_analytics` insert policy `with check (true)` allows authenticated write-flooding (reads are admin-only; table has **no `user_id`**, so no impersonation). | ⚠️ **Accepted / noted** — bounded by JWT + edge rate limits; revisit with analytics work. |
| S-7 | Low | `feature_flag_overrides` select `using (true)` returns all overrides to any signed-in user (client resolves scope). Minor config disclosure. | ⚠️ **Accepted / noted** — no user PII; server-side resolution is a later refactor. |
| S-8 | Info | `careers-ai` accepts a client-supplied **system** prompt, so an authenticated user can use it as a metered generic AI proxy. | ⚠️ **Accepted / noted** — bounded by daily quota + burst limit + model allowlist + token caps; move prompt construction server-side later. |

---

## 3. Fixes implemented this pass (all in the authoritative, idempotent schema files)

- **S-1 — coupons locked down.** `coupons` select is now **admin-only**. Added a `SECURITY DEFINER`
  `validate_coupon(p_code)` RPC that checks active/expiry/redemption-limit **server-side** and returns
  only the single submitted code when redeemable — never the catalogue. Client `applyCoupon()` now
  calls the RPC instead of reading the table. (`careers_phase4_schema.sql`, `subscriptions.ts`)
- **S-2 + S-3 — `is_platform_admin` is now `SECURITY DEFINER` with `set search_path = ''`.** Breaks the
  RLS recursion cycle (definer bypasses `platform_roles` RLS) and pins resolution. Execute revoked from
  `public/anon`, granted to `authenticated/service_role`.
- **S-3 — `search_path` pinned** on `increment_ai_usage` and `careers_touch_updated_at` (bodies were
  already schema-qualified, so behaviour is unchanged).
- **S-4 — `tool_data` payload cap:** `check (pg_column_size(data) <= 1048576)` (~1 MB; real data is
  KB-scale). Idempotent (drop-then-add).
- **S-5 — server-stamped `updated_at`:** `fx_touch_updated_at()` (search_path-pinned) + `before update`
  trigger on `tool_data`. `cloudSync` doesn't use `updated_at` for conflict logic, so no sync regression.

All changes are **additive and idempotent** — re-running the schema files (the project's documented
apply method) upgrades an existing database in place. Financial math untouched; **785/785 tests pass**.

---

## 4. OWASP Top 10 (2021) quick alignment

- **A01 Broken Access Control** — RLS on all tables; storage folder-ownership; coupon enumeration (S-1)
  fixed; admin-check recursion (S-2) fixed. Residual: live RLS spot-check (see §6).
- **A02 Cryptographic Failures** — HTTPS + HSTS preload; secrets server-side. Residual: auth token is
  stored in `localStorage` (Supabase default) — XSS-exposure pattern; CSP mitigates, but review token
  storage vs httpOnly cookie before scale (§5).
- **A03 Injection** — parameterized Supabase client + RLS; no dynamic SQL; edge inputs bounded/encoded;
  `search_path` pinned. **Prompt injection** possible but bounded (S-8).
- **A04 Insecure Design** — quota/rate-limit/atomic-meter patterns are sound.
- **A05 Security Misconfiguration** — headers + CSP present; `.temp`/`.env` gitignored.
- **A06 Vulnerable Components** — `xlsx` has a known advisory (patched build ships from SheetJS CDN;
  documented accepted risk). Keep `npm audit --omit=dev --audit-level=critical` in CI.
- **A07 Auth Failures** — JWT verified in edge functions; email verification present. **MFA not yet
  available** — recommend for scale (§5).
- **A08 Integrity Failures** — server-stamped `updated_at` (S-5) reduces client-tamper surface.
- **A09 Logging/Monitoring** — **addressed (Phase A):** privacy-first analytics + Web Vitals + error
  monitoring + `/healthz`; ingest is rate-limited and re-validates input; store is admin-read-only with
  retention. See `docs/OBSERVABILITY.md`.
- **A10 SSRF** — not present in `careers-jobs` (fixed provider URL set).

---

## 5. Recommendations (future phases)

- **Analytics/observability (cookieless):** per your decision, add a privacy-first, self-hostable
  analytics + lightweight error monitoring — closes the A09 gap and unblocks conversion experiments.
- **Auth-token storage:** review `localStorage` session token vs an httpOnly cookie model before public
  scale (XSS exposure). Not a confirmed vuln; a design review.
- **MFA readiness** for accounts; **account enumeration** review on auth error copy; **password-reset**
  token expiry check.
- **S-7/S-8 refactors:** resolve feature-flag scope server-side; move `careers-ai` system-prompt
  construction server-side (task-keyed) so the endpoint can't be used as a generic AI proxy.

---

## 6. Do we need production access? — No (with two self-serve live checks)

Per the "only request prod access if it adds objective value" rule: **it does not here.** Everything
actionable was fixable in the repo, and the remaining verification is cheaper to do without granting me
credentials:

1. **Apply the updated schema files** (SQL Editor, in order) so the live DB gets S-1…S-5. This is a
   deploy step you run — not an inspection needing my access. Critically, **S-2 means admin reads may be
   broken on the live DB today** until this is applied.
2. **Confirm live posture with two queries you can run** (results tell us if anything drifted from the
   repo):
   - `select tablename, rowsecurity from pg_tables where schemaname='public' and rowsecurity=false;`
     → should return **zero rows**.
   - `select proname, prosecdef, proconfig from pg_proc where pronamespace='public'::regnamespace and proname in ('is_platform_admin','validate_coupon','increment_ai_usage','careers_touch_updated_at','fx_touch_updated_at');`
     → confirms `SECURITY DEFINER` + `search_path=` are live.
3. **Headers (independent of me):** verify `finatrix.online` on securityheaders.com or `curl -I` once the
   Worker (Phase 1b) is deployed.

I would only request production access if a finding required inspecting **data** (not schema) — e.g.
auditing whether existing rows violate a new constraint. Nothing in this pass does.

---

## 7. Residual risk statement

FinatriX is **not** claimed to be "unhackable." After this pass the known residual risks are: client-side
auth-token storage (A02/A07, CSP-mitigated), bounded AI-proxy and analytics-write abuse (S-6/S-8, quota/
rate-limited), a still-open observability gap (A09), and the standard need for a third-party penetration
test and live RLS confirmation before enterprise/university procurement. Each is tracked above with a
concrete mitigation or next step.
