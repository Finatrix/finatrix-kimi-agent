# FinatriX — Final Pre-Launch Review

**Date:** 1 Aug 2026 · **Target:** `https://finatrix.co` · **Reviewer:** CTO / launch gate
**Gate run:** `tsc -b` ✓ clean · `eslint .` ✓ clean · **1,492 tests / 102 files — 0 failures** ✓ · `vite build` ✓ · landing JS **143 KB gz** (budget 185 KB) ✓

---

# 1. Executive Summary

| | |
|---|---|
| **Overall Launch Readiness** | Conditional — finance ready, careers not |
| **Overall Score** | **6.5 / 10** |
| **Launch Decision** | ❌ **NO** (as one public launch) — ✓ YES for finance-only |
| **Estimated effort remaining** | **5–8 working days** to clear all 3 blockers |

**Top 5 strengths**

1. ✓ Financial math frozen and guarded by parity suites.
2. ✓ RLS on all 74 tables; service-role tables fail closed.
3. ✓ Edge Worker: canonical host, per-route SEO in served bytes, real 404s.
4. ✓ 1,492 passing tests incl. drift + perf-budget guards.
5. ✓ Cookieless, DNT/GPC-respecting, no-PII analytics.

**Top 5 weaknesses**

1. ❌ Paid product has no public marketing or pricing page.
2. ❌ No refund/cancellation policy; no GST treatment.
3. ❌ Checkout → webhook → activation never tested.
4. ⚠️ Manual renewal with no reminder email — silent churn.
5. ⚠️ No `user_id` in analytics — conversion/retention unmeasurable.

---

# 2. Category Scores

| Category | Score | Status |
|---|---:|---|
| Engineering | 9.0 | ✓ Excellent |
| Security | 8.5 | ✓ Strong |
| Performance | 8.5 | ✓ Strong |
| SEO | 8.0 | ✓ Strong (finance only) |
| Accessibility | 8.0 | ⚠️ Asserted, not axe-verified |
| UI | 8.0 | ✓ Strong |
| UX | 7.5 | ⚠️ No public careers entry |
| Finance Platform | 8.5 | ✓ Launch-ready |
| Careers Platform | 6.5 | ⚠️ Built, not commercial |
| AI | 6.5 | ⚠️ No streaming |
| Payments | 5.0 | ❌ Blocking |
| Infrastructure | 7.5 | ⚠️ Schema not migration-managed |
| Testing | 8.0 | ⚠️ Zero careers/billing E2E |
| Documentation | 9.0 | ✓ Excellent |
| Business | 5.0 | ❌ Blocking |
| Launch Confidence | 6.0 | ⚠️ Conditional |

---

# 3. Critical Issues

1. ❌ **Careers is invisible to buyers.** `/careers` is `noindex`, absent from `sitemap.xml`, auth-gated; `subscription_plans` policy is `to authenticated`; no `/pricing` route. Nobody can evaluate a ₹199–₹2,499/mo product before signing up.
2. ❌ **No refund/cancellation policy; no GST.** `Terms.tsx` has no billing section at all. Checkout sends bare `price_data` with no tax config. Both are legal requirements for B2C digital billing in India.
3. ❌ **Revenue path untested.** No unit, integration or E2E coverage of `careers-billing-checkout`, `careers-billing-webhook` or `expire_subscriptions()`. Silent webhook failure = money taken, access not granted.

---

# 4. High Priority

1. ⚠️ Wire pre-expiry reminder emails (`careers-email` exists; no job calls it). Renewal is manual — users lose access with no warning.
2. ⚠️ Add a consented user dimension to analytics. No cross-session funnel today = no conversion, activation or retention data.
3. ⚠️ Add missing events: `signup_completed`, `trial_started`, `checkout_failed`, `checkout_cancelled`, `resume_uploaded`, `job_search_run`, `ai_message_sent`. Only 11 event types exist.
4. ⚠️ Fold 8 hand-applied `*_schema.sql` files into timestamped migrations. Only 6 of ~74 tables are migration-managed; rollback is manual.
5. ⚠️ Stream AI responses. 90 s ceiling with whole-response delivery reads as broken on a premium tier.
6. ⚠️ Defer `supabase-js` off the landing path — 55 KB gz of 143 KB (39%) for a marketing page.
7. ⚠️ Add axe-core + Lighthouse to CI. WCAG 2.2 AA is claimed but only invariant-tested, and careers has no a11y test.
8. ⚠️ Add E2E for the careers surface — 21 pages / 126 files rest entirely on unit tests.
9. ⚠️ Constant-time HMAC compare in webhook (`toHex(sig) === v1`).
10. ⚠️ Ship a self-serve cancellation affordance; today users must email support.

---

# 5. Medium Priority

1. Replace 177 hardcoded hex literals (83× `#D4AF37`) with design tokens.
2. Rate limiting is per-isolate in-memory only — not a durable control.
3. Add `/tools/reports`, `/tools/calendar` to the tools registry and sitemap; reachable but undiscoverable.
4. Schedule review of `react-router` (GHSA-qwww-vcr4-c8h2) and `xlsx` high advisories — assessments are sound but open-ended.
5. Adopt `eslint-plugin-react-hooks` 7.1 rules (38 known call sites deferred).
6. Add visual regression coverage.
7. Careers onboarding: 21 nav destinations with no first-run narrative.

---

# 6. Nice to Have

1. Per-tool long-form educational content for organic acquisition.
2. Shared identity/value story linking finance ↔ careers.
3. Richer error reporting (currently type + route only).
4. Chart export presets and scheduled report delivery.
5. Coupon UI surfacing (RPC exists, no entry point).

---

# 7. Product Strengths

1. Parity suites freeze every financial formula — the property that matters most here.
2. RLS on 74/74 tables, generated via idempotent `DO` loops.
3. Storage isolated by `auth.uid()` folder ownership.
4. `SECURITY DEFINER` functions pin `search_path` and revoke public execute.
5. CSP as header + meta with script hash; HSTS, COOP, Permissions-Policy all set.
6. CORS allowlist is additive — a stale secret is inert, not fatal.
7. Edge Worker returns honest 404s instead of soft-404s.
8. Cookieless, no-fingerprint, GPC-respecting analytics with 90-day retention.
9. Enforced perf budgets for both JS and images on the critical path.
10. Documentation names its own gaps and records the outages behind each fix.

---

# 8. Product Weaknesses

1. Revenue product has zero public surface.
2. No billing, refund or cancellation terms.
3. No GST handling on Indian consumer charges.
4. Money path has no test of any kind.
5. Manual renewal, no reminder → silent churn.
6. Business is unmeasurable (no cross-session funnel).
7. AI has no streaming.
8. Schema mostly outside migration control.
9. Design tokens leaked into 177 hex literals.
10. Finance and careers share a shell but no product story.

---

# 9. Finance Platform Review

| Area | Score | Notes |
|---|---:|---|
| Budget Builder | 9 | 50/30/20 split, parity-tested, recent-category shortcut. |
| Expense Tracker | 9 | Full lifecycle + undo, real-browser E2E, bulk edit. |
| Reports | 8 | Solid; route missing from tools registry and sitemap. |
| Goals | 8 | Reverse SIP planner, clean and parity-locked. |
| Calendar | 7.5 | Functional; same registry/sitemap omission. |
| AI | 6.5 | Context-aware, no-invented-figures prompt; no streaming. |
| Exports | 8 | PDF/XLSX/DOCX, all lazily chunked off the critical path. |
| Dashboard | 8.5 | Clear hierarchy, good empty and seeding states. |
| **Overall** | **8.5** | ✓ Launch-ready. |

---

# 10. Careers Platform Review

| Area | Score | Notes |
|---|---:|---|
| Search | 8 | Multi-provider, dedupe, cache, quota, confidence scoring. |
| Resume Match | 8 | Deterministic scoring with hard threshold — no fake filtering. |
| JD Analyzer | 7.5 | Works; buried inside JobsPage rather than its own surface. |
| Resume Builder | — | ❌ Not present. Library + upload + tailoring only. |
| Billing | 4 | Untested end-to-end; manual renewal; no refund policy. |
| Authentication | 8.5 | Supabase JWT, OAuth full-page redirect, graceful unconfigured mode. |
| Premium | 5 | Gating logic exists; nothing anonymous can see or buy. |
| Providers | 8 | Health/metric events, quota RPC, cache pruning, admin-only reads. |
| **Overall** | **6.5** | ⚠️ Feature-rich, commercially unready. |

---

# 11. AI Review

| Area | Status | Notes |
|---|---|---|
| Conversation | ✓ | History, suggested prompts, contextual Ask-AI buttons. |
| Accuracy | ✓ | Prompt forbids invented/estimated figures; output validated. |
| Context | ✓ | Focus-data scoped to the active tool. |
| UI | ✓ | Consistent panel, signed-out state handled. |
| Speed | ❌ | No streaming; 90 s timeout, whole-response delivery. |
| Safety | ✓ | Model allowlist, 80k input cap, 8,192 token cap, key server-side only. |
| Suggestions | ✓ | Per-tool prompts wired. |
| Integration | ⚠️ | Atomic daily quota in Postgres; per-isolate rate limit only. |

---

# 12. Security Review

- ✓ Authentication (Supabase JWT, OAuth redirect flow)
- ✓ RLS — 74/74 tables, fail-closed on service-role tables
- ✓ Storage isolation by `auth.uid()` folder
- ✓ CSP (header + meta, script hash) · HSTS · COOP · Permissions-Policy · XFO
- ✓ Secrets server-side only; `.env` gitignored; no keys in bundle
- ✓ Stripe webhook HMAC + 300 s replay window
- ✓ `SECURITY DEFINER` search_path pinned, execute revoked
- ✓ Coupon enumeration closed (admin-only reads + validate RPC)
- ✓ CORS allowlist additive, canonical-origin fallback
- ⚠️ Non-constant-time signature comparison
- ⚠️ Rate limiting is in-memory per isolate
- ⚠️ No error-rate alerting wired
- ⚠️ No penetration test performed

---

# 13. Performance Review

| Area | Result | Status |
|---|---|---|
| Bundle (landing, gz) | 143 KB / 185 KB budget | ✓ |
| Bundle (total dist) | 5.5 MB, all heavy vendors lazy | ✓ |
| LCP | Not measured | ⚠️ |
| CLS | Not measured (fonts preloaded, theme boot pre-paint) | ⚠️ |
| Lazy loading | Route-split + vendor chunks (pdf/xlsx/jspdf/tesseract) | ✓ |
| Caching | `immutable` on hashed assets, 24 h revalidate on icons | ✓ |
| Build | `tsc -b` + `vite build` clean, 973 modules, 6.2 s | ✓ |
| Tests | 1,492 pass, 0 fail | ✓ |
| Eager `supabase-js` | 55 KB gz on landing (39% of path) | ⚠️ |

---

# 14. Production Review

- ✓ Deployment — GitHub Actions: typecheck, lint, test, build, prod audit, E2E job
- ✓ Secrets — documented per function; `.env.example` complete
- ✓ Cloudflare — Worker + `run_worker_first`, `_headers`, canonical redirects
- ✓ Supabase — RLS, pg_cron for expiry + analytics pruning
- ⚠️ Stripe — live keys and webhook endpoint not verified in test mode
- ✓ Edge Functions — 6 deployed, CORS/auth/quota consistent
- ✓ Workers — `/healthz`, honest status codes, security headers on generated responses
- ⚠️ Monitoring — analytics + web vitals + `/healthz` present; **no alerting**
- ❌ Rollback — schema outside migrations makes DB rollback manual
- ⚠️ Backups — Supabase defaults only; no documented restore drill

---

# 15. Product Comparison

| Competitor | Score | One-line reason |
|---|---:|---|
| YNAB | 6 | Comparable method quality; no bank sync and no habit loop. |
| Monarch Money | 5 | Monarch aggregates accounts; FinatriX is manual entry. |
| Copilot Money | 5 | Copilot's auto-categorisation and polish are ahead. |
| LinkedIn Jobs | 4 | No network graph, no employer supply side. |
| Indeed | 5 | Smaller index; better match scoring and ATS insight. |
| Resume.io | 4 | ❌ No resume builder at all — only library and tailoring. |

**Where FinatriX wins:** India-specific tax/instrument logic, education-first framing, genuine privacy, and the finance + careers pairing. Nobody credible occupies that intersection.

---

# 16. Future Roadmap

1. Bank / UPI account aggregation (AA framework).
2. Resume Builder — the largest missing careers feature.
3. Public, indexable content layer per calculator.
4. Recruiter / university portal (tables already exist).
5. Auto-renewing subscriptions once RBI e-mandate is viable.
6. Native mobile app.
7. Consented cohort analytics for real retention curves.
8. Goal tracking with progress over time, not one-shot calculation.
9. Tax-filing season module.
10. Shared finance ↔ careers identity ("earn more, keep more").
11. Interview simulation with voice.
12. Salary benchmarking from real user data.
13. Multi-currency / NRI support.
14. Organisation billing and seats.
15. Public API.

---

# 17. Final Verdict

## Would you launch today? **NO**

- ❌ A paid product no anonymous visitor can find, read about, or price is not launchable.
- ❌ Charging Indian consumers with no refund/cancellation policy and no GST is legal exposure, not backlog.
- ❌ The checkout → webhook → activation path has never been run against a real Stripe event.
- ✓ The finance platform is ready today and should not wait — ship it publicly now.
- ✓ All three blockers are 5–8 days of work; keep Careers in invite-only beta until they clear.
