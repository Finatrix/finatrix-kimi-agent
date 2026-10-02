# FinatriX AI — `CAREERS_AI_DATA_COLLECTION` audit

**2026-10-02.** Decision needed from the owner: **keep `allow`** or **restore
`deny`**. Recommendation: **restore `deny`** (details in §5).

## 1. Where the setting acts

`supabase/functions/careers-ai/index.ts` → `providerPreferences()` sets
OpenRouter's `provider.data_collection` on every completion request:

- unset (default) → `"deny"`: OpenRouter routes only to providers that neither
  store prompts nor train on them.
- `CAREERS_AI_DATA_COLLECTION=allow` → `"allow"`: any provider, including ones
  that retain prompts or may use them for training.

The live project has `allow`, set by the owner on 2026-10-01 10:58 UTC
(`docs/MOBILE_RELEASE_READINESS.md` §2). The reason was not recorded.

The function serves both FinatriX AI in the money tools and Careers (Careers is
hidden in the mobile apps). Callers in the money tools: the assistant panel
(`src/tools/ai/assistant.ts`) and statement-import merchant naming
(`src/tools/ai/statementCategorize.ts`), both behind the consent gate
(`src/lib/ai/consent.ts`).

## 2. What a request contains — measured

The real function was run under Deno with Supabase and OpenRouter mocked by a
patched `fetch` (no account, no API key, nothing sent off the machine), with a
mock user carrying an email and a full name. One harmless prompt was sent with
the setting unset and then with `allow`. Captured outbound request to
`https://openrouter.ai/api/v1/chat/completions`:

```json
{
  "headers": { "authorization": "Bearer sk-or-<redacted>", "content-type": "application/json",
               "http-referer": "https://finatrix.co", "x-title": "FinatriX Careers" },
  "body": {
    "model": "google/gemini-2.5-flash",
    "messages": [
      { "role": "system", "content": "You are FinatriX AI. Answer only from the figures provided." },
      { "role": "user", "content": "Question: How much did I spend on Groceries in October 2026?\nFigures: {…\"Groceries\",\"spent\":4200…}" }
    ],
    "max_tokens": 4096, "temperature": 0.2, "response_format": { "type": "json_object" },
    "provider": { "data_collection": "deny" }   // "allow" in the second run
  }
}
```

| Check | Result |
|---|---|
| User email in request | **No** |
| User id in request | **No** |
| Name in request | **No** |
| User's JWT forwarded | **No** |
| Difference between the two runs | `provider.data_collection` only |

What reaches the model is the question, the recent conversation and the
figures relevant to it, or unrecognised merchant descriptions from a statement
import. The client builds that context with no name, email, user id or account
identifiers, and sanitises and length-caps free text (`src/tools/ai/context.ts`).

## 3. Logging and retention on our side

- Edge logs: task, model, latency and token counts only. Prompts and
  completions are never logged (`careers-ai/index.ts`, observability block).
  On total failure the log carries OpenRouter error text, up to 300 characters
  per model.
- `ai_response_cache`: the answer, keyed by a SHA-256 fingerprint of the
  prompt, kept 15 minutes and deleted with the account.
- `careers_ai_usage` / token meter: per-account counts for fair-use limits.

## 4. Consistency with published statements

| Statement | With `deny` | With `allow` |
|---|---|---|
| Privacy policy: OpenRouter and the model provider "process data on our behalf under their own security and privacy terms" (`src/pages/Privacy.tsx`, "Service providers") | Consistent | **At risk** — a provider that keeps or trains on prompts is not processing only on our behalf |
| Apple App Privacy: Financial Info / Purchase History / User Content used for **App Functionality** | Consistent | **At risk** — third-party use for model improvement is a different purpose |
| Google Data safety: AI sharing declared | Consistent | Consistent on "shared", but the purpose is narrower than what `allow` permits |
| In-app consent prompt: names OpenRouter, covers producing an answer | Consistent | Consent is to processing for an answer, not to a provider retaining it (comment at `careers-ai/index.ts:101–115`) |

## 5. Keep `allow` vs restore `deny`

| | Keep `allow` | Restore `deny` |
|---|---|---|
| Privacy | Prompts with the user's financial figures may be retained or used for training by some providers | Only no-retention, no-training providers |
| Policy / store consistency | Needs a privacy-policy and App Privacy change to be accurate | Matches what is published |
| Availability | Every model in the chain has a route | A model with no compliant provider returns 404 and the six-model fallback chain moves on. Whether at least one model is compliant **today** cannot be verified without a live key |
| Benefit | Availability, if `deny` ever leaves no route | — |

**Recommendation: restore `deny`.** It narrows data sharing, matches every
published statement, and the fallback chain exists for exactly this case. It is
the owner's decision because it reverses a deliberate production setting.

### To apply (owner)

```bash
npx supabase secrets unset CAREERS_AI_DATA_COLLECTION --project-ref uspbsgbggurggsfsontq
```

Then, signed in on the website with any account that has granted AI consent,
ask FinatriX AI one question (e.g. "How much did I spend this month?"). A
normal answer confirms a compliant route exists. If every model fails with
"AI analysis is temporarily unavailable", check the `careers-ai` logs
(`all models failed`) and decide whether to add a model with a no-retention
provider to `CAREERS_AI_MODELS` rather than re-enabling `allow`.

If `allow` is kept instead, the privacy policy (§FinatriX AI), the App Privacy
answers and the Data safety purposes must be updated to say a provider may
retain or train on prompts, and that is a material privacy change to disclose.

## 6. Side finding

`careers-ai/index.ts` contains two literal NUL bytes (the separators in the
prompt-hash template string), so git treats this security-relevant file as
**binary**: `git diff` and `git log -p` show nothing for it, and plain `grep`
skips it. Replace them with the `\u0000` escape (same runtime string, same
cache keys) and redeploy the function in the next backend release; changing it
now would put the repo out of parity with the deployed `careers-ai`.

**2026-10-03 — fixed in the repo, not deployed.** Both NULs are now `\u0000`
escapes, and nothing else in the function's code changed (one comment added).
Git diffs the file as text again.

- **Cache keys are unchanged.** Deno ran the old and new `promptHash` source on
  5 samples (empty fields, non-ASCII, a field that itself contains U+0000, and
  `a|bc` vs `ab|c`) and got identical SHA-256s. They also matched an independent
  Python SHA-256 of `model + "\0" + system + "\0" + user`.
- **Guard test.** `src/test/no-nul-bytes.test.ts` fails on any raw NUL in a
  text file under `src`, `supabase`, `worker` or `scripts`, and names the file,
  line and column. Run against the original file, it reported
  `careers-ai/index.ts:64:50 (2 NUL bytes)`.
- **Deployed state.** `careers-ai` v42, downloaded 2026-10-03, is byte-identical
  to the pre-fix file (both NULs included), as are `_shared/origins.ts` and
  `_shared/ratelimit.ts`. A redeploy therefore ships only this change. It is the
  owner's call: [MOBILE_RELEASE_READINESS.md](MOBILE_RELEASE_READINESS.md) §7
  item 8. Deploy with `--no-verify-jwt`, because the live function has
  `verify_jwt: false` and the CLI default would switch it on.
