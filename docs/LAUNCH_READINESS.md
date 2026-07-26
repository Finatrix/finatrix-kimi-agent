# FinatriX — Launch Readiness Review (independent)

**Reviewer stance:** external Staff Engineer with authority to **block** release unless the product is
world-class. **Date:** 11 July 2026. **Target:** public launch on `finatrix.co` (from `finatrix.co`).
**Method:** whole-repository read + running the full local gate (`tsc`, ESLint, Vitest incl. parity).
Prior audits deliberately ignored; judged fresh against current source.

---

## Verdict: **CONDITIONAL GO** ✅ (contingent on the 4 launch blockers in §3)

FinatriX is a genuinely strong product on a modern, secure, well-tested foundation. After this
transformation it is **launch-capable** once four deploy/verify steps are done — none of which are new
engineering, all of which are operational. The remaining items are fast-follow or non-blocking.

Current gate: `tsc -b` clean · **794/794 tests pass** · **533 parity assertions green** (frozen math
intact) · changed code lint-clean.

---

## 1. Dimension scorecard

| Dimension | Grade | Notes |
|---|---|---|
| Architecture | A− | React 19 + Vite + TS, route-code-split, clean tools/careers separation, edge Worker, Supabase. Single source of truth for routing. |
| Financial correctness | A | 8 parity suites (533 assertions) pin every calculator to the original; unchanged this whole transformation. |
| Security | A− | RLS everywhere, storage isolation, secure edge functions, CSP+headers; Phase 2 fixed coupon leak + RLS recursion + search_path + payload caps. Pen test still due. |
| Privacy | A | Cookieless, no-fingerprint, DNT/GPC-respecting analytics; anonymous store; IP never stored; retention. Best-in-class for the category. |
| Accessibility | B+ | Semantic H1s, AA contrast, skip-link, reduced-motion, labelled forms. **Manual SR/keyboard/zoom pass still required** before an AA claim. |
| SEO | A− | Per-route titles, canonical, OG/Twitter, JSON-LD, complete sitemap, **real 404s** (soft-404 fixed). Per-tool long-form content is a growth follow-up. |
| Performance | B+ | Code-split, preloaded fonts, branded loading, Web Vitals capture. **No Lighthouse/CrUX numbers yet** — measure before claims. |
| Resilience | B+ | ErrorBoundary, graceful backend-off mode, edge timeouts, atomic AI quota. Add error-rate alerting post-deploy. |
| Observability | A− | Analytics + Web Vitals + error monitoring + `/healthz` + retention + runbook. Needs live wiring (deploy + `VITE_ANALYTICS_URL`). |
| CI/CD | A− | GitHub Actions: typecheck + lint + test + build + prod audit on every branch. Add Lighthouse/axe steps. |
| Legal/Compliance | A− | DPDP/GDPR-literate privacy policy (now hosting-accurate), sitewide disclaimer, security.txt. `/terms` needs the same review pass. |
| Documentation | A | README accurate; TRANSFORMATION_LOG, SECURITY_REVIEW, OBSERVABILITY, and this doc. |
| Maintainability | A− | Small typed modules, shared route logic, idempotent SQL. One watch-item: hardcoded design-token hexes (Phase 4 unification). |

---

## 2. What's world-class already (do not re-litigate)
- Frozen financial logic guarded by parity tests — the single most important property, intact.
- Backend security posture (RLS, storage folder-ownership, secure edge functions, no SSRF).
- Privacy-first observability that most funded startups don't achieve.
- Honest, thorough documentation and an idempotent, reproducible schema/deploy model.

---

## 3. Launch blockers (must clear before `finatrix.co` go-live)

1. **Apply the DB changes to the live database** (SQL Editor, in order): the Phase 2 hardening
   (`schema.sql`, `careers_*_schema.sql`) **and** `analytics_schema.sql`. ⚠️ Until applied,
   Phase 2 **S-2** means admin cross-row reads may error on production. This is a deploy step, not code.
2. **Smoke-test the edge Worker** with `wrangler dev` / a preview deploy: confirm `/tools/budget` → 200,
   `/nope` → **404**, `/healthz` → 200, and that `_headers` (HSTS/XFO/CSP-companions) are present on
   responses. The routing logic is unit-tested; the edge glue cannot be exercised in CI.
3. **Deploy `analytics-collect`** (`--no-verify-jwt`), set `VITE_ANALYTICS_URL`, and schedule
   `prune_analytics_events` (pg_cron). Without this, observability is dark.
4. **Run Lighthouse + axe-core** across all routes (guest + signed-in) and fix any AA/CWV blockers.
   Add both to CI so the claim stays true. (Converts the two "manual validation" grades above to hard numbers.)

---

## 4. Prioritized launch checklist

**P0 — blockers (above):** apply SQL · Worker smoke test · deploy analytics · Lighthouse+axe.

**P1 — before public launch:**
- Manual accessibility pass: VoiceOver/NVDA on Budget + LifeMap, keyboard-only traversal, 400% zoom.
- Complete the `.online → .space` migration (§5).
- Verify security headers live (securityheaders.com / `curl -I`) and run the two RLS confirmation
  queries in `docs/SECURITY_REVIEW.md §6`.
- Review `/terms` to the `/privacy` standard.
- Confirm cross-tool guest data flow (Budget → Expense) in a clean session (audit's open item).

**P2 — fast-follow (post-launch):**
- Third-party penetration test (required for enterprise/university procurement).
- Financial-math SME sign-off (validation only — no change) + a public Methodology & Sources page.
- Per-tool long-form educational SEO copy.
- Design-token unification (Phase 4) to remove hardcoded hexes.
- If upgrading `eslint-plugin-react-hooks` to 7.1.x, do a dedicated `react-hooks` code-health pass
  (16 pre-existing `set-state-in-effect`/refs issues surface; two are calculators — handle carefully).

---

## 5. Domain migration — `finatrix.co` → `finatrix.co`

Find/replace `finatrix.co` → `finatrix.co` in: `index.html` (canonical, `og:url`, JSON-LD),
`public/sitemap.xml`, `public/robots.txt`, `public/.well-known/security.txt`, and update
`src/test/deploy-config.test.ts` to match. Also:
- **Edge CORS allowlists:** `analytics-collect` already includes `finatrix.co`; add it to
  `careers-ai` and `careers-jobs` `CAREERS_ALLOWED_ORIGINS` (or set the env var).
- **Supabase Auth:** add `https://finatrix.co` to Site URL + Redirect URLs (Google OAuth + email).
**Status: DONE.** `finatrix.co` is the sole canonical host, declared once as `CANONICAL_HOST`
in `src/shared/routes.ts` and consumed by the Worker, the SEO module, the tests and
`wrangler.jsonc`. The Worker 301s `www`, both retired domains and any plain-HTTP request to the
apex in a single hop; `careers-ai`'s `HTTP-Referer`, the edge-function CORS allowlists, the OG
image, the sitemap, robots and security.txt all name it. See `docs/DEPLOYMENT.md` § Domains.

Remaining operator steps (Cloudflare/Search Console credentials required, not code):
- Keep the `finatrix.online` / `finatrix.space` zones attached to the Worker until Google has
  recrawled — detaching them discards the 301 and the link equity with it.
- Submit the new sitemap in Search Console and file a change-of-address for each old property.
- Confirm with `npm run verify:production` once DNS and the certificate are live.

---

## 6. Residual risks (honest)
- **Client-side auth token in `localStorage`** (Supabase default) — XSS-exposure pattern; CSP mitigates.
  Review vs httpOnly-cookie model before scale. *Not a confirmed vuln.*
- **Edge behaviour unverified in CI** — the 404 Worker + headers need the §3.2 smoke test.
- **No live performance numbers** — CWV must be measured, not assumed.
- **Bounded abuse surfaces** — anonymous analytics ingest and the `careers-ai` proxy are rate-limited but
  public/quota-bound; monitor post-launch.
- **`xlsx` advisory** — patched build from SheetJS CDN; keep the CI critical-only audit.
- **No third-party pen test yet** — required before enterprise/university procurement.

## 7. Deferred product work (value-adds, NOT launch blockers)
Phase 3 features that raise the ceiling but don't gate launch: **Unified Financial Dashboard** /
cross-tool "Financial Picture" (note: `/tools` intentionally redirects to a tool today — a hub is a
deliberate IA change with a returning-user tradeoff, encoded in `AppRouting.test.tsx`), **Careers guest
preview** (turns a 0%-conversion surface into a funnel), **LifeMap step-wizard + autosave**
(flagship completion), and light gamification / referral loops. Each deserves its own tested increment.

---

## 8. Go / No-Go

**GO for public launch on `finatrix.co` — conditional on P0 (§3).** The codebase itself is ready and
verified; the four blockers are operational (apply SQL, smoke-test the edge, wire analytics, run
Lighthouse/axe). Clear those and FinatriX launches on a foundation a senior team from any of the named
companies would respect. The deferred Phase-3 features are how it goes from excellent to category-defining
— they are the roadmap after launch, not prerequisites to it.
