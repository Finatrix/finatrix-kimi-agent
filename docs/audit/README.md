# FinatriX — Complete Product Audit
## Master Document

**Date:** 25 July 2026 · **Classification:** Board / Investor confidential
**Engagement type:** Independent, read-only product, technical and commercial audit

---

## The finding, in one sentence

> **FinatriX is an engineering-strong, commercially-unlaunched product: build quality sits in the top
> decile for its stage, while the product cannot currently be found by a search engine, reached at its
> branded domain, or paid for by a customer.**

---

## Deliverables

| Document | Format | Contents |
|---|---|---|
| [Volume 1 — Executive & Investor](VOL1-EXECUTIVE-INVESTOR.md) | Markdown | Exec summary · vision · business model · market position · scorecard · top 20 findings · SWOT · maturity · North Star · investor summary · roadmap summary |
| [Volume 2 — UX, Design & Accessibility](VOL2-UX-DESIGN-ACCESSIBILITY.md) | Markdown | IA · journeys · WCAG 2.2 AA audit · design system · microcopy · trust signals · responsive · funnel (blocked) |
| [Volume 3 — Technical & Security](VOL3-TECHNICAL-SECURITY.md) | Markdown | Architecture · frontend · backend · database · OWASP Top 10 · dependencies · CI/CD · scalability |
| [Volume 4 — Careers & Competitive](VOL4-CAREERS-COMPETITIVE.md) | Markdown | Capability inventory · competitive scorecard · positioning · 112 ranked recommendations (RICE) |
| [Volume 5 — Roadmap & PMO](VOL5-ROADMAP-IMPLEMENTATION.md) | Markdown | 30/90/180/365-day + 3-year plans · four backlogs · risk register · cost & ROI · KPIs · governance |
| **[Full report (PDF)](dist/FinatriX-Product-Audit.pdf)** | PDF | All five volumes · 51 pages · 26 rendered diagrams · 61 tables |
| **[Executive deck (PPTX)](dist/FinatriX-Executive-Deck.pptx)** | PowerPoint | 11 slides, 16:9, board-ready |

Related: [Careers Production Readiness Report](../CAREERS_PRODUCTION_READINESS.md) — provider-level
engineering audit produced in the same engagement.

---

## Evidence standard

Every claim carries exactly one mark. They are never mixed.

| Mark | Meaning |
|:--:|---|
| **✓** | **Verified** — directly observed: command output, live HTTP response, rendered DOM, or source code |
| **⚠** | **Assumption** — reasoned inference, market context, or estimate. Must be validated before action |

All cost, ROI, market-sizing and competitor-capability claims are **⚠ by definition** — no
financials, analytics, or competitive-intelligence access was provided.

---

## Scope actually covered

| Area | Status |
|---|:--:|
| Public website (unauthenticated) | ✓ Audited live |
| Authenticated careers platform | ✓ Audited live (client-authenticated session) |
| Codebase — 279 TS/TSX files, 40,683 LOC | ✓ Audited |
| Database — 9 schema files, 74 tables | ✓ Audited |
| Edge functions (5) | ✓ Audited |
| Dependencies | ✓ Audited (`npm audit`) |
| Accessibility (WCAG 2.2 AA) | ✓ Audited on landing + 2 authenticated pages |
| Heatmaps · conversion funnels · CrUX field data | **BLOCKED — no data exists** |
| Financials · CAC/LTV · runway | **BLOCKED — not provided** |
| Competitor internals | **BLOCKED — no CI subscription** |

### Blocked items, stated plainly

**Behavioural analytics.** Heatmaps and conversion funnels require session data. The product emits
7 event types, none covering signup, upload, search, application or payment ✓, and the deployment
has no branded domain and no traffic. **No funnel percentage, drop-off rate, heatmap or CrUX figure
appears anywhere in these reports, because any such figure would be fabricated.** Lab performance
metrics were captured instead and are labelled as such.

**Competitor capabilities.** Stated from general market knowledge, marked ⚠, and explicitly flagged
as requiring re-verification before external use.

---

## Headline results

### Verified strengths ✓

| Dimension | Evidence |
|---|---|
| Data-layer security | 74 tables · **74 with RLS enabled (100%)** · 63 policies · 89 indexes |
| Test discipline | **999 tests** across 73 files, all passing · Playwright E2E in CI |
| CI quality gates | `tsc` → `eslint --max-warnings 0` → tests → build → audit → E2E |
| Edge performance (lab) | TTFB **109 ms** · load **371 ms** · 153 KB JS · **0 console errors** |
| Security headers | CSP with script **hashes** (no `unsafe-inline`) · HSTS preload · Permissions-Policy |
| Product breadth | 11 finance tools · 20 careers pages · **45 careers service modules** |
| Accessibility basics | Skip link first in tab order · global `:focus-visible` ring · **9/9 form controls named** |
| Privacy | **Zero third-party requests** — no CDN, tracker, or external font host |

### Verified blockers ✓

| # | Finding | Severity |
|:--:|---|:--:|
| 1 | `finatrix.co` and `finatrix.co` return **NXDOMAIN** | S1 |
| 2 | Canonical, `og:url`, all 11 sitemap URLs and `robots.txt` point at the dead domain | S1 |
| 3 | No payment processor — revenue collection is impossible | S1 |
| 4 | **2 high-severity vulnerabilities** ship to production; CI gates only on `critical` | S1 |
| 5 | **No error monitoring or alerting** — production failures are invisible | S2 |
| 6 | Careers platform absent from sitemap (0 of 11 URLs) | S2 |
| 7 | Only 7 analytics events — 6 of 7 funnel steps invisible | S2 |
| 8 | No `<main>` landmark platform-wide; 2 AA contrast failures (1.98:1, 3.09:1) | S2 |

### Executive scorecard

| Dimension | Score | | Dimension | Score |
|---|:--:|---|---|:--:|
| Engineering quality | 4.5 / 5 | | Accessibility | 3.0 / 5 |
| Data architecture | 4.5 / 5 | | Infrastructure | 2.0 / 5 |
| Performance | 4.5 / 5 | | Analytics | 2.0 / 5 |
| Product breadth | 4.5 / 5 | | **SEO** | **1.0 / 5** |
| AI capability | 4.0 / 5 | | **Monetisation** | **1.0 / 5** |
| Security posture | 3.5 / 5 | | **Overall** | **3.05 / 5** |

Build capabilities average **3.5**; commercial capabilities average **1.2**. That gap is the entire
finding.

---

## Remediated during this engagement ✓

| Finding | Resolution |
|---|---|
| Admin dashboard views bypassed RLS (`security_invoker` absent) | Fixed — both views now declare `security_invoker = true`, `anon` revoked |
| 3 of 6 job providers called a retired API contract (100% failure) | Fixed — 11 request/response defects corrected against verified v4 docs |
| Adapter tests used invented fixtures | Rebuilt from documented schema; now assert endpoint, params and pagination |

Verification after changes: **999 tests pass · production build succeeds · ESLint clean.**

---

## Conduct

This engagement was strictly read-only. No production data was modified, no form submitted, no
setting changed, no application created, no data deleted, and no authentication bypassed. The client
authenticated their own session; **the auditor never handled, stored, or transmitted credentials**,
and none appear in any deliverable. Personal data encountered in the authenticated session
(e.g. resume filenames) has been genericised and is not reproduced.

---

## How these documents were produced

| Output | Method | Verified? |
|---|---|:--:|
| Markdown volumes | Authored from direct observation | ✓ |
| PDF | Markdown → styled HTML → headless Chrome print | ✓ 51 pages; **26/26 Mermaid diagrams confirmed rendered as SVG** via Playwright |
| PPTX | `python-pptx`, 16:9 | ✓ Structure validated (11 slides); **visual rendering not verified — no LibreOffice available** |

---

## Recommended reading order

1. **Board / investors** — Executive deck (PPTX), then Volume 1
2. **CTO / engineering** — Volume 3, then Volume 5 §7.1, then the Production Readiness Report
3. **CPO / product** — Volume 1 §4, Volume 4, Volume 5 §7.2
4. **Design / UX** — Volume 2, then Volume 5 §7.3
5. **DevOps** — Volume 3 §5–6, Volume 5 §7.4

---

## The single most important next step

Instrument the six missing funnel events. Until that exists, **every optimisation recommendation in
these five volumes — including the ones the auditor is most confident about — is a hypothesis rather
than a measured improvement**, and traction cannot be demonstrated to anyone.
