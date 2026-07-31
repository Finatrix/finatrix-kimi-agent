# FinatriX — Edge Function API Reference

Functions live at `https://<project-ref>.supabase.co/functions/v1/<name>`, accept **POST only** (plus CORS preflight), and require the caller's Supabase JWT in `Authorization: Bearer <token>` — except `careers-billing-webhook`, which is called by Stripe directly and has no user session at all (see its own section). CORS is restricted to the production origins (see `CAREERS_ALLOWED_ORIGINS` in DEPLOYMENT.md). All responses are JSON.

Common error statuses: `401` not signed in · `405` wrong method · `429` rate/quota limited · `400` bad body.

---

## POST /careers-ai — AI proxy

The only place the OpenRouter key exists. Walks a model fallback chain until one answers.

Despite the name, this function serves **every** AI surface in the product, not just Careers — the money tools' assistant (FinatriX AI) calls it too. Both go through one client-side transport, `src/lib/ai/transport.ts`; adding a consumer must never mean adding a second way to reach OpenRouter. The `task` field is what tells them apart in `ai_usage_log`:

| `task` | Surface |
| --- | --- |
| `parse`, `ats-score`, `career-dna`, … | Careers résumé/job pipeline |
| `money-chat` | FinatriX AI, in Budget Builder / Expense Tracker / Dashboard / Reports |

Note that the request always sets `response_format: json_object`, so **every** task — including the conversational one — must ask the model for a JSON object. There is no streaming endpoint.

**Request**
```jsonc
{
  "task": "ats-score",          // free-form label for telemetry
  "system": "...",              // system prompt (required)
  "user": "...",                // user prompt (required); system+user ≤ 80,000 chars
  "model": "openai/gpt-5.5",    // optional; must be on the allowlist, tried first
  "maxTokens": 4096             // optional; clamped to [256, 8192]
}
```

**200**
```jsonc
{
  "content": "…model output…",
  "model": "openai/gpt-5.5",    // the model that actually answered
  "task": "ats-score",
  "ms": 2140,
  "promptTokens": 1874,
  "completionTokens": 512
}
```

**Limits:** 20 req/min burst (per isolate), 60 calls/user/day (atomic, Postgres-enforced) → `429`. `413` prompt too large. `502` when every model in the chain failed.

---

## POST /careers-jobs — job-search provider fan-out

**Request** (all fields optional except `query`)
```jsonc
{
  "query": "risk analyst",
  "terms": ["risk analyst", "operational risk", "aml"],  // intent-expanded, ≤18
  "location": "Chennai", "country": "in",
  "remoteOnly": false, "workMode": "hybrid",             // ''|remote|hybrid|onsite
  "employmentType": "fulltime", "salaryMin": null, "salaryMax": null,
  "page": 0,
  "providers": ["adzuna", "jsearch"]                     // optional subset
}
```

**200**
```jsonc
{
  "jobs": [ /* NormalizedJob[] — see careers-jobs/index.ts */ ],
  "status": { "adzuna": "ok", "jooble": "not-configured", "remotive": "error" },
  "page": 0
}
```

Providers missing their secret report `not-configured`, never a hard error. All filtering/ranking is client-side (`src/careers/search/pipeline.ts`). Burst limit 30 req/min.

---

## POST /careers-email — transactional email (Resend)

**Request**
```jsonc
{ "to": "user@example.com", "subject": "…", "html": "…", "text": "…" }  // html or text required
```

**Rules:** `to` **must equal the caller's own verified account email** (case-insensitive) → otherwise `403`. Burst limit 5 req/min.

**200** `{ "sent": true }` — or, when `RESEND_API_KEY` is not configured, `{ "sent": false, "reason": "not-configured" }` (deliberately 200: inert-by-design, not an error). `502 { "sent": false, "reason": "provider-error" }` on Resend failures.

---

## POST /careers-billing-checkout — start a one-time-per-period Stripe Checkout

Not a subscription: each call creates a single `mode: 'payment'` Checkout Session covering one billing period (see the function's header comment for why — RBI e-mandate rules make plain recurring charges unreliable for Indian cards). `public.expire_subscriptions()` (pg_cron, docs/OBSERVABILITY.md §7) moves an unrenewed plan back to Free once `current_period_end` passes.

**Request**
```jsonc
{ "planId": "professional", "period": "monthly" }  // period: monthly | yearly, default monthly
```

**200** `{ "url": "https://checkout.stripe.com/..." }` — redirect the browser here.

**Rules:** the plan must be `is_active` and have a non-zero price for the requested period (Free and "contact us" plans like Enterprise → `400`). Burst limit 10 req/min. `503` if `STRIPE_SECRET_KEY` isn't configured yet.

---

## POST /careers-billing-webhook — Stripe webhook (no user auth)

Called by Stripe's servers, not the browser — no `Authorization` header, no CORS. Trust comes from verifying the `Stripe-Signature` header against `STRIPE_WEBHOOK_SECRET` (Stripe's documented HMAC-SHA256 v1 scheme). Configure the endpoint in the Stripe Dashboard pointing at this function's URL, listening for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `checkout.session.async_payment_failed`.

On a paid `checkout.session`, updates the caller's `subscriptions` row (plan, `current_period_end` computed from `metadata.period`) and inserts a `billing_history` row (idempotent via a unique index on `(provider, provider_ref)`, so Stripe's at-least-once redelivery never double-books a payment).

**200** always, once the signature checks out (even for events it ignores) — Stripe retries on any non-2xx. `400` on a bad/missing signature.
