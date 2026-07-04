# FinatriX Careers — Phase 2.1: Job Search Intelligence Engine

Production-grade rewrite of the job search pipeline. Phase 1 and Phase 2
modules (Resume Library, Career DNA, ATS, AI matching, Applications,
Companies, Career Coach) are untouched and reused.

## Architecture

```
User Search
  → Intent Builder            src/careers/search/intent.ts
  → Query Expansion           src/careers/search/intent.ts
  → Provider Query Builder    supabase/functions/careers-jobs (adapters)
  → Provider Search           supabase/functions/careers-jobs (parallel fan-out)
  → Normalization             edge fn (one model) + src/careers/search/normalize.ts (enrichment)
  → Deterministic Filtering   src/careers/search/filter.ts        ← BEFORE any AI
  → Resume Matching           src/careers/search/quickMatch.ts    ← every job, no exceptions
  → Ranking                   src/careers/search/pipeline.ts (relevanceScore)
  → Business Rules + Sorting  src/careers/search/pipeline.ts
  → Display                   src/careers/pages/JobsPage.tsx
```

One entry point: `runSearchPipeline(params, resumeInput, fetcher, options)`
in [pipeline.ts](../src/careers/search/pipeline.ts). Everything after the
provider fan-out is deterministic, synchronous and unit-tested.

## Modules

| Module | Stage | What it does |
|---|---|---|
| `search/taxonomy.ts` | 6, 13 | Finance taxonomy (33 categories, weighted terms). `classifyJob(title, desc)` classifies every job deterministically; title hits weigh 4× description hits. |
| `search/intent.ts` | 1 | `buildIntent(query, industry)`: "Risk" → the whole risk/compliance/AML/fraud/audit cluster + expansion terms + priority titles. Longest trigger wins ("credit risk" beats "risk"). The industry filter narrows, never widens. |
| `search/locations.ts` | 2, 12 | City → localities (Chennai → OMR, Guindy, Sholinganallur…), country gating, `locationVerdict()` (match/nearby/remote/unknown/mismatch), Indian salary parsing (LPA/lakhs/Cr). |
| `search/normalize.ts` | 4, 12 | Enriches the canonical provider model: inferred work mode (WFH/WFO/hybrid), canonical employment type, seniority, salary from JD text. |
| `search/filter.ts` | 5 | Hard gates before AI: country, city, work mode, employment, salary, freshers, category. Every rejection carries a reason. |
| `search/quickMatch.ts` | 7, 8 | Deterministic Resume Match % (skills, title, category, experience, keywords, location, salary, Career DNA — weighted 0–100) for **every** returned job. The AI 14-category match (matchService, unchanged) replaces it on demand. |
| `search/pipeline.ts` | 9–11, 17 | Orchestration, ranking (title intent + category confidence + location + recency + provider confidence), search-quality metrics, 5-minute result cache keyed by search-hash + resume, stale-search abort support. |
| `careers-jobs` edge fn | 3 | Per-provider adapters: Adzuna `what_or`, JSearch quoted-`OR` query + country, Jooble `|` keywords + country-label location, Remotive skipped for on-site searches. Country strictly routes endpoints. |

## Hard threshold (Stage 8)

The Jobs page slider now filters on the effective Resume Match (AI match if
run, else quick match). A job below the threshold is **never rendered**.
Without a selected resume there is no match to filter on; the UI says so
explicitly.

## Search quality report (Stage 10)

Every search shows: jobs returned, jobs rejected (with per-reason counts),
average match, search confidence, and per-provider coverage.

## Testing (Stage 16)

`src/test/careers21.search-engine.test.ts` — 34 regression tests run the
real pipeline against realistic fixtures:

- the five flagship searches (Risk/Chennai, AML/Bengaluru, Compliance/Mumbai,
  Fraud/Hyderabad, Internal Audit/Pune) return ≥90% relevant jobs and never
  the Phase 2 junk (Writing Specialist, Customer Operations, Data Labeling,
  Communications Manager, Graphic Designer)
- every returned job carries a 0–100 Resume Match
- country/city/work-mode/employment filters are respected; London, remote and
  internship postings are rejected with reasons
- Software Engineer never returns Accountant or Sales; Marketing never
  returns Data Scientist
- caching, salary gating, Indian salary parsing, metro alias resolution

## Live verification runbook

`scripts/verify-search.ts` runs the five flagship searches against **live**
providers through the deployed edge function and enforces the same gates:

```sh
supabase functions deploy careers-jobs        # ship the new adapters
SEARCH_VERIFY_EMAIL=you@example.com \
SEARCH_VERIFY_PASSWORD=... \
npx vite-node scripts/verify-search.ts
```

Exit 0 = all gates green. It prints per-search provider coverage, relevance
%, rejected-reason counts and the top results with their match %.

## Migration guide

Consumer-visible changes (everything else is additive):

1. **`jobsService.searchJobs` → `jobsService.searchProviders(params, terms)`.**
   It now returns raw provider results; do not consume it directly — call
   `runSearchPipeline` instead, which handles filtering/matching/ranking.
   The ad-hoc client-side hybrid/salaryMax filters that lived in
   `searchJobs` moved into `search/filter.ts` (with reasons).
2. **Edge function body** accepts new optional fields: `terms` (expansion
   list), `workMode`, `salaryMax`. Old clients keep working — the fields
   default sensibly. Redeploy `careers-jobs` to activate provider-side
   expansion; until redeployed, the client pipeline still guarantees
   precision (filtering is client-side), only recall improves after deploy.
3. **JobsPage** renders `ScoredJob`s (`report.jobs`) instead of raw
   `NormalizedJob[]`; each card shows Resume Match %, category badge,
   "Why this job", missing resume terms, Save, and the threshold slider is a
   hard filter.
4. No schema changes. No changes to saved jobs, applications, matching,
   cover letters, interviews or coach.
