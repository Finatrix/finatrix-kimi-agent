# Company Registry jobs — activation runbook

The app side is **done and merged**. Registry jobs will start appearing in Job
Search the moment the database side exists; nothing further needs deploying to
the frontend.

## Why this matters

Every aggregator provider returns a link to *itself*, not to the job:

| Provider | `apply_url` is actually | Lands on |
|---|---|---|
| Adzuna | `redirect_url` | `adzuna.in/land/ad/…` tracking bounce |
| Jooble | `link` | `jooble.org` redirect |
| Remotive | `url` | Remotive's own listing page |

Measured on a live "risk analyst" search against production providers:
**13 results, 0 of them a real application form.**

Registry jobs are read straight off each verified employer's ATS, so
`source_url` *is* the canonical posting. `src/careers/search/dedupe.ts` prefers
direct-employer URLs, so when the same role also arrives via an aggregator, the
registry copy is the one that survives.

## What is already in the app

| File | Role |
|---|---|
| `src/careers/services/registryJobs.ts` | Calls the `search_registry_jobs` RPC, maps rows to `NormalizedJob`, merges into the provider fan-out |
| `src/careers/search/applyUrl.ts` | Classifies a URL as employer-ATS vs aggregator; drives the "Apply" vs "View on X" label and the *Direct from employer* chip |
| `src/careers/search/dedupe.ts` | Direct-employer postings win de-duplication |
| `src/test/careers.registry-provider.test.ts` | 13 tests, including the fail-closed paths |

**Failure behaviour is verified against production today:** the RPC returns
`404 / PGRST202`, `searchRegistryJobs` returns `null`, the source is reported as
`not-configured`, and search still returns its normal results. No console noise,
no user-visible error.

## Activation

The migrations live in the `finatrix-company-registry` repo, not this one.

```bash
supabase link --project-ref <your-project-ref>
```

Apply `0007_jobs.sql`, `0008_jobs_indexes.sql`, `0009_search_api.sql` in order —
`0008` defines the `search_registry_jobs` RPC the provider calls, `0009` adds the
public read surface and RLS policies.

```bash
supabase db push
```

Then confirm the RPC answers (this is the exact call the provider makes):

```bash
curl -s -X POST "$VITE_SUPABASE_URL/rest/v1/rpc/search_registry_jobs" -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d '{"p_query":"risk","p_limit":3}'
```

`200` with a JSON array means it is live. Search will then show
*Direct from employer* chips and **Apply** buttons instead of *View on Adzuna*.

Finally, run the registry's own sync to populate `jobs` (the snapshot carries
1,421 postings across 9 employers; the sync keeps them current).

---

## ⚠ Review before applying `0009`

**`v_public_jobs` is created without `security_invoker = true`.**

A Postgres view runs with its *owner's* privileges by default, so a view over an
RLS-protected table silently bypasses that table's policies. `0009` enables RLS
on `jobs` and `companies` and then creates a view over both:

```sql
CREATE OR REPLACE VIEW v_public_jobs AS
SELECT … FROM jobs j JOIN companies c ON c.id = j.company_id
WHERE j.is_active;
```

**Impact today is low** — the view repeats the `is_active` filter that the
`jobs_public_read` policy enforces, so the two happen to agree. The risk is
latent: the moment a policy tightens (per-tenant rows, employer-private
postings, a draft state) the view keeps serving everything, and nothing fails
loudly to tell you.

Recommended before applying:

```sql
ALTER VIEW v_public_jobs SET (security_invoker = true);
```

The `search_registry_jobs` RPC is **not** affected — it is `LANGUAGE sql STABLE`
without `SECURITY DEFINER`, so it already runs as the invoker and RLS applies
normally. The provider in this app calls only that RPC, never the view.

## Coverage note

The snapshot is 9 employers, 1,421 jobs, heavily Australian (ASX-listed) plus
One 97 Communications in India. Registry jobs will be a small, high-quality
slice of results until the registry scales — which the registry README describes
as a data operation, not a schema change. Aggregator results continue to fill
the long tail, now labelled honestly.
