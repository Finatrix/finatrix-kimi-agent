# FinatriX Careers — Auto Apply & Application Automation

**Date:** 4 August 2026
**Status:** Proposal, pending approval
**Supersedes nothing.** Extends `docs/audit/VOL4-CAREERS-COMPETITIVE.md` §4.2 items 6–7, which
identified autofill and the browser extension as the two genuine product gaps.

---

## 1 · Why this exists

Volume 4 (25 Jul 2026) scored FinatriX Careers **○ Absent** on exactly three capabilities:
browser extension, one-click apply/autofill, and auto-apply at scale. Verified again on
4 Aug 2026: `grep -ril 'autofill|auto-?apply' src supabase/functions` returns **zero matches**.
The gap is real and unchanged.

Meanwhile the payment gap (Vol 4 §4.1 item 4) has since closed — Stripe billing is live.

The competitive reference point for this work is AIApply, teardown in §2. The conclusion of that
teardown is **not** that FinatriX should copy it. It is that AIApply's headline feature rests on
infrastructure FinatriX already has, and stops precisely where FinatriX is strongest.

---

## 2 · Competitive teardown — AIApply (4 Aug 2026)

Evidence standard follows Vol 4: **✓ verified** by direct observation · **⚠ assumption**.

### 2.1 Stack ✓

| Layer | Technology | Evidence |
|---|---|---|
| Backend | Laravel (PHP) | `XSRF-TOKEN`, `aiapply_session`, Laravel-encrypted `{iv,value,mac,tag}` cookies |
| Marketing | Blade + HTMX, server-rendered | `robots.txt` disallows `/htmx`, `/components`; 4 JS islands total |
| Authed app | Inertia.js, routed under `/app/*` | `vary: X-Inertia` response header |
| CSS | Tailwind v4 | v4-signature `@layer properties` block; 320 KB marketing bundle |
| Build / edge | Vite · Cloudflare | `/build/assets/*-[hash].js` · `cf-ray` |
| Auth | Google + Apple OAuth only | no password or LinkedIn option on `/signin` |

Marketing pages are ~450 KB of server-rendered HTML with almost no JavaScript — a deliberate
SEO/LCP posture, not a SPA.

### 2.2 Auto Apply, as actually built ✓

Observed logged-in at `/app/auto-apply`. **It is a human-in-the-loop triage queue, not
fire-and-forget automation.**

- Credit balance persistent in the header, with an inline "Get more" upsell
- A **"Review mode" selector** — implying at least one higher-automation mode behind it
- Two tabs: **Quick Review** (the queue) and **Your Jobs** (the accepted set)
- Each card carries: company logo · title · company · one-line company blurb · "View Job"
  deep-link · **match score with a qualitative band** (`55/100 | Moderate fit`) · location ·
  a "Why this might be a good fit" rationale · Qualifications split into **Key Matches (✓)**
  and gaps (✗)
- Three actions: **Decline · Skip · Apply**
- Bottom nav carries an **Inbox** with a four-digit unread count — a reply-capture channel

The single most transferable detail: **the AI rationale is candid, not promotional.** The
observed card argued *against* its own match — "the role's core requirements emphasize Power BI
development with DAX/Power Query, SQL, and data integration, which are not evidenced in the
resume." A scoring engine that admits weakness is the trust mechanic that makes the queue
worth reviewing rather than rubber-stamping.

### 2.3 Commercial model ✓

- Subscription (monthly/annual) **plus à-la-carte application credits**; 1 credit = 1 application,
  non-expiring
- Limited free tier rather than a timed trial
- **`/pricing` 301-redirects to `/`** — pricing is invisible until after signup

### 2.4 Surface area ✓

- ~29 free no-signup tools at `/tools/*` (ATS checker, STAR generator, salary calculators,
  keyword finder…) — top-of-funnel SEO
- Programmatic SEO: `/resume-examples/{role}`, `/cover-letter-examples/{role}`,
  `/careers/{role}`, `/salaries/{role}`, plus 7 hand-built `/compare/aiapply-vs-{competitor}` pages
- 14 locales via path prefix; 5 satellite subdomains (`tools.`, `coaching.`, `hire.`, `labs.`, `careers.`)

### 2.5 Where they are weak ⚠

1. **Hidden pricing** — a trust cost in a category serving people who are, by definition, between incomes.
2. **Volume framing** — "100 applications in under an hour" is the entire pitch. ATS vendors are
   actively filtering exactly this behaviour. The exposed flank is quality-per-application.
3. **The funnel ends at "applied."** There is an Inbox, so replies are captured — but nothing
   downstream models what an offer is actually *worth*. This is the FinatriX wedge, unchanged
   from Vol 4 §3.2.
4. **Interview Buddy** — live answer-feeding during a real interview is a reputational liability,
   and their own review wall carries users reporting mid-call failures.

---

## 3 · What FinatriX already has ✓

Verified 4 Aug 2026. Auto-apply is a **composition problem**, not a greenfield build.

| Requirement | Existing asset |
|---|---|
| Job supply | `careers-jobs` edge function, 8 providers, dedupe + ranking + health |
| Apply destination | `JobRow.apply_url` — already on the type |
| Match scoring | `matchEngine.ts` (4 deterministic categories) + `matchService.ts` (10 AI categories) |
| Match rationale | `ai/prompts-jobs.ts`, `ai/scoring.ts` via OpenRouter |
| Tailored resume | `resumeTailoring.ts` |
| Cover letter | `coverLetters.ts` |
| Tracking | `applications.ts`, `pipeline.ts` — **`ready_to_apply` stage already defined** |
| Metering | `subscriptions.ts` + live Stripe billing |
| Ops | `providerOps`, `featureFlags2`, `audit`, `aiUsage`, `analysisCache` |

**Missing, and only this:** a queue, a credit ledger, a submission adapter, and an extension.

---

## 4 · Legal and technical constraints

Stated once, applies to every phase below.

- **No scraping of LinkedIn, Indeed, or SEEK for submission.** Their ToS prohibits it and the
  ground has been litigated. FinatriX already *consumes* their listings via licensed provider
  APIs; that is a different act from automated submission and must stay separate.
- **ATS-native submission is legitimate** where the ATS publishes an application API. Greenhouse,
  Lever, Ashby and Workable all do. FinatriX's provider mix is ATS-weighted already
  (`ActiveJobsProvider` `/active-ats`, `WorkdayProvider`), so a meaningful share of listings will
  resolve to an ATS with a real API.
- **Coverage will be partial — say so.** Expect roughly 30–50% ⚠ of listings submittable
  natively. Claiming "every job board" is both false and the thing that gets the category sued.
  The browser extension (Phase 4) covers the long tail *because the user initiates it*, which is
  the same reason it carries no ToS exposure.
- **Disclose automation.** Where a submission is machine-generated, the application should say so.
  This is a trust asset, not a concession.

---

## 5 · Phased plan

Each phase ships something usable on its own. No phase depends on a later one.

### Phase 1 — Match Queue (no submission) · ~1 week

The triage card UX, `Apply` opening `apply_url` in a new tab and advancing the application to
`ready_to_apply`. Zero automation, zero legal exposure, and it makes the existing match engine
*visible* for the first time.

- `src/careers/pages/MatchQueuePage.tsx` — card queue, keyboard-driven (←/→/space)
- Reuse `ScoreRing`, `MatchPanel`, `CareersPaywallGate` — all already built
- Score band vocabulary (`Excellent / Strong / Moderate / Weak fit`) as a shared helper
- Rationale must surface gaps as prominently as matches — see §2.2

**This alone closes most of the perceived gap** against AIApply's headline screen.

### Phase 2 — Application Kit · ~1 week

Bundle tailored resume + cover letter per job, generated on demand from the queue.
`resumeTailoring.ts` and `coverLetters.ts` already do the work; this is composition, storage
and a review UI.

### Phase 3 — Credit ledger · ~1 week

Metering, before any automated submission exists to meter.

- `careers_credits` table: purchase, balance, debit-on-submit, **refund-on-failure**
- Credit packs suit the existing Stripe constraint *better* than subscriptions do — per
  `finatrix-stripe-billing-launch`, RBI e-mandate rules already pushed billing to one-time
  per-period checkout. Non-expiring credit packs are a natural fit.
- Watch the known PostgREST limitation: upsert cannot target a partial unique index.

### Phase 4 — ATS-native submission · ~3–4 weeks

The actual auto-apply.

- `src/careers/apply/ats/` — detect ATS from `apply_url` host, one adapter per ATS
  (Greenhouse, Lever, Ashby, Workable), each declaring its field schema
- Field mapping from `careerProfile` + parsed resume → ATS schema
- Submission queue with idempotency, per-employer rate limiting, and retry
- `Review mode` (default, user confirms each) vs `Auto mode` (score threshold + daily cap)
- Every submission written to `audit` with the exact resume version used

### Phase 5 — Browser extension · ~4 weeks

Covers the long tail Phase 4 cannot reach, and closes Vol 4 §4.2 item 6.

- Save-job-from-any-board → FinatriX
- Autofill any application form from `careerProfile`
- User-initiated per form. No background automation, no ToS exposure.

### Phase 6 — Outcome loop · ~2 weeks · **the differentiator**

Where AIApply stops and FinatriX should not.

- Reply capture and status inference → feeds `applications` and `offers`
- Offer → after-tax take-home, using the 11 existing finance tools (Vol 4 §4.3 items 16–22)
- Response-rate analytics per resume version — closes the loop that makes matching improvable

---

## 6 · Sequencing recommendation

**Phases 1–3 first (≈3 weeks), then reassess.** They are low-risk, ship visible value, and
produce the usage data needed to justify Phase 4's cost. Phase 4 is the expensive, legally
sensitive one and should not start until the queue proves people actually review matches.

The temptation is to build Phase 4 first because it is the headline. Resist it: an auto-apply
engine with no review queue in front of it is exactly the spam product the category is being
filtered for.

---

## 7 · Open questions

1. Does auto-apply ship inside the existing Careers Pro plan, or as a separate credit SKU?
2. Score threshold for Auto mode — and does the user set it, or do we?
3. Which market first? ATS-adapter coverage differs sharply by region.
4. Should FinatriX disclose machine-generated applications to employers? (Recommendation: yes.)
