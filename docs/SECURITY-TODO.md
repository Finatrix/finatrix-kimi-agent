# Known security gaps — open

Issues found and confirmed but **not yet fixed**. They are written down here
rather than left in comments so that the code can stop describing enforcement
that does not exist.

Three source comments now point at this file: `CareersPaywallGate`,
`checkQuota`, and `changePlan`. All three previously asserted that the Careers
paywall was enforced server-side. It is not.

---

## 1. Any authenticated user can grant themselves a paid plan

**Severity: critical — the whole revenue model is bypassable.**

`supabase/careers_phase4_schema.sql`:

```sql
create policy "subscriptions_update" on public.subscriptions for update
  using (auth.uid() = user_id or public.is_platform_admin(auth.uid()));
```

There is no `WITH CHECK`, no column restriction, no trigger, and no grant
narrowing. A user may write **any column of their own row**, including
`plan_id`, `status` and `current_period_end`.

`CareersPaywallGate` then decides access from exactly that row:

```ts
setAnswer({ uid, paid: !!sub && PAID_PLAN_IDS.has(sub.plan_id) })
```

So the gate reads a value the user controls. A free signup, one PostgREST
`update`, and the account is Premium permanently for ₹0.

The app also **ships the exploit**: `subscriptions.ts → changePlan()` performs
precisely this write. It has no production callers, but it is exported into the
client bundle and it works.

`usage_counters_update` has the same shape, so a user can also reset their own
usage counters.

**Fix direction.** Constrain the UPDATE policy so `plan_id`, `status` and the
period columns cannot be changed from the client — a `WITH CHECK` comparing
against the existing row, or a `BEFORE UPDATE` trigger that rejects changes to
those columns unless the role is `service_role`. Plan mutation then belongs to
`careers-billing-webhook` running as the service role, which is where the
payment evidence actually is. `changePlan` should move behind that boundary.

## 2. The AI endpoint never checks the caller's plan

**Severity: high — free users can spend real inference budget.**

`supabase/functions/careers-ai/index.ts` verifies the JWT (`:169`), applies a
per-isolate burst limit (`:174`), then a flat daily call ceiling from a single
env var (`:204`) which it passes into `begin_ai_call`. The RPC
(`migrations/20260814000100_ai_token_budget.sql`) takes that limit as a
*parameter* and never reads `subscriptions`.

There is therefore **no entitlement check anywhere in the request path**. Two
consequences:

- A **Free** user — who by product decision gets no Careers access at all — can
  call the endpoint directly and receive `CAREERS_AI_DAILY_LIMIT` (default 60)
  OpenRouter calls per day.
- The per-plan quotas advertised on `/pricing` (100 / 500 / 2,000 analyses a
  month) are not enforced in either direction. Student pays ₹199 for 100 and can
  consume roughly 1,800; Premium pays ₹2,499 for 2,000 and is capped at 60/day
  ≈ 1,860 — **less than was sold**.

**Fix direction.** Look up the caller's active subscription inside
`careers-ai` before metering, refuse plans outside `PAID_PLAN_IDS`, and pass the
plan's `ai_quota_monthly` into `begin_ai_call` instead of a global env var.
`begin_ai_call` already takes the limit as an argument, so the RPC needs no
change — only the caller does. This depends on §1: a plan lookup is worthless
while the user can write the plan.

## 3. Usage counters are client-authored

**Severity: medium.**

`incrementUsage` (`services/subscriptions.ts`) is a read-then-write from the
browser: two concurrent calls both read, both write `n + 1`, and one increment
is lost. More importantly the client can simply not call it, and
`usage_counters_update` lets it write any value. The usage meters on the Billing
page are self-reported.

**Fix direction.** Fold usage increments into the same server-side path as §2 —
`begin_ai_call` and `record_ai_tokens` already do this correctly for AI, and
they are the model to follow for resumes, applications and storage.

---

## What was fixed alongside this note

The comments that concealed the above are corrected, and
`careers-ai/index.ts` no longer contains the raw NUL bytes that made it a
binary file in git — so the diffs for the fixes above will at least be
reviewable when they land.
