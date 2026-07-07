# FinatriX — Edge Function API Reference

All three functions live at `https://<project-ref>.supabase.co/functions/v1/<name>`, accept **POST only** (plus CORS preflight), and require the caller's Supabase JWT in `Authorization: Bearer <token>`. CORS is restricted to the production origins (see `CAREERS_ALLOWED_ORIGINS` in DEPLOYMENT.md). All responses are JSON.

Common error statuses: `401` not signed in · `405` wrong method · `429` rate/quota limited · `400` bad body.

---

## POST /careers-ai — AI proxy

The only place the OpenRouter key exists. Walks a model fallback chain until one answers.

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
