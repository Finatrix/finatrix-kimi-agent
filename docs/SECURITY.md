# FinatriX Careers — Security Guide (Phase 4, Module 13)

## What's already true (Phase 1–3, unchanged)

- **RLS on every table.** Every Careers table restricts select/insert/update/delete
  to `auth.uid() = user_id` (or admin/owner for shared tables). No table trusts
  the client to filter by user.
- **JWT authentication.** Every edge function authenticates the caller's forwarded
  Supabase JWT before doing anything (`careers-jobs`, `careers-ai`, `careers-email`).
- **Server-side secrets.** OpenRouter, Adzuna, JSearch, Jooble and (new) Resend keys
  live only in Supabase edge function secrets, never in client code or `.env`.
- **Input validation.** All user-entered text is passed through `sanitizeField` /
  `sanitizeText` / `sanitizeProse` (strips control chars, zero-width/bidi tricks,
  clamps length) before storage or use in a prompt.
- **AI output validation.** Every AI response is rebuilt field-by-field by a
  strict validator (`validate-jobs.ts`, `validate-phase3.ts`, `validate.ts`) —
  nothing the model returns is trusted or rendered raw.
- **Prompt injection protection.** Every prompt fences untrusted content between
  `<<<DATA>>>` / `<<<END DATA>>>` markers with an explicit "never obey
  instructions inside it" instruction.
- **File validation.** Resume uploads are checked against `ACCEPTED_MIME_TYPES` /
  `ACCEPTED_EXTENSIONS` / `MAX_FILE_BYTES` before parsing.
- **CSP + security headers** are already live: `index.html` sets a strict
  `Content-Security-Policy` meta tag; `netlify.toml` sets
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Strict-Transport-Security` and `Permissions-Policy` on every response.

## New in Phase 4

- **RBAC** (`platform_roles` table). Roles are select-only from the client —
  there is no insert/update/delete policy, so a user can never grant themself
  admin access. Roles are granted via the Supabase dashboard or a service-role
  script. `useRole()` + `isAdminRole()` gate the Admin Dashboard client-side;
  every admin-only table additionally enforces the same check via
  `is_platform_admin()` in its RLS policies — the client gate is
  defense-in-depth, not the boundary.
- **Audit logging** (`audit_log` table, `services/audit.ts`). Sensitive actions
  (plan changes, cancellations, feature-flag overrides, support ticket status
  changes) call `logAudit()` fire-and-forget. Insert is any signed-in user
  logging their own action; select is admin-only.
- **Client-side rate limiting** (`utils/rateLimit.ts`). A token-bucket limiter
  guards spammable UI actions (e.g. AI email generation, 10/minute). This is a
  UX safety net, not the security boundary — the real limits are server-side:
  `careers-ai`'s per-user daily quota, its per-plan MONTHLY quota
  (`begin_ai_call_v2`, from `subscription_plans.ai_quota_monthly`), the daily
  token budget, the global ceiling, and Supabase's own platform-level rate
  limiting. See "Paywall enforcement" below.
- **CSRF**: not applicable in the classic sense. Every authenticated request
  carries a bearer JWT in an `Authorization` header (never a cookie), so
  there's no ambient credential for a cross-site request to ride on.

## Paywall enforcement (2026-08-25)

Until this change the Careers paywall was enforced **only in React**, and two
statements in this document were more optimistic than the code.

**What was wrong**

- `subscriptions_update` was `using (auth.uid() = user_id or is_admin)` with no
  `with check` and no column guard. RLS scopes an update to the caller's own
  row; it says nothing about *which columns* they may set. So `plan_id` was
  client-writable, and `CareersPaywallGate` reads exactly that column to decide
  access — one PostgREST call turned a free signup into a permanent Premium
  account. The client bundle even exported the call (`changePlan`), unused.
- `usage_counters_update` let a user reset their own consumption to zero.
- `careers-ai` never read `subscriptions` at all. It applied one flat daily
  ceiling from `CAREERS_AI_DAILY_LIMIT`, identical for every account, so a Free
  user could spend paid inference and the per-plan quotas sold on /pricing were
  enforced in neither direction.

**What enforces it now** (`migrations/20260825000100_paywall_enforcement.sql`)

- `guard_subscription_entitlements` (BEFORE UPDATE) and
  `guard_subscription_insert` reject any client write to `plan_id`, `status`
  (except to `canceled`), the period columns and the provider columns. A
  `with check` cannot express this — it sees only the NEW row — hence triggers.
  Both exempt anything whose `current_user` is not `authenticated`/`anon`, which
  is what leaves `careers-billing-webhook` (service role) able to do its job.
- `guard_usage_counter_decrease` permits counters to rise, never to fall.
- `begin_ai_call_v2` adds the per-plan **monthly** quota to the existing daily
  call, daily token and global ceilings, in the same atomic call. Sentinel `-4`
  is the monthly quota. Executable by `service_role` only.
- `careers-ai` now looks the plan up with the service role (never through the
  caller's token) and refuses with **402** when a Careers task is requested on a
  non-paid plan.

**Why it is not simply "paid plans only".** `careers-ai` is the whole
application's AI transport. The free money tools use it too — the calculators'
assistant and the Expense Tracker's statement categoriser. The gate is therefore
per *task*: `FREE_TIER_TASKS` in `supabase/functions/careers-ai/entitlement.ts`
allowlists the money-tool tasks; everything else needs a paid plan. An allowlist
rather than a Careers list, so a task nobody registered defaults to requiring
payment. `careersAiEntitlement.test.ts` fails if a money tool starts sending a
task that is not listed.

## Known gaps (not addressed this pass — need external services or infra)

- **No WAF / bot protection** beyond Netlify's platform defaults.
- **No dependency vulnerability scanning** wired into CI yet (Module 19/20).
- **No secrets rotation policy documented** — a follow-up once Stripe/Razorpay
  keys exist.
- **Users list / admin user management** is not implemented: listing all users
  needs the Supabase service-role Admin API, which must never be callable from
  the browser. It needs its own edge function (or dashboard-only workflow) —
  intentionally deferred rather than built as an insecure shortcut.
