# FinatriX — Complete SEO, Discoverability & Organic Growth Strategy

**Audit date:** 1 August 2026
**Auditor scope:** Technical SEO, Content SEO, Brand/Entity SEO, AI Search, Authority, Growth
**Domain audited:** `https://finatrix.co`
**Method:** Full source inspection (`src/lib/seo.ts`, `worker/index.ts`, `src/shared/routes.ts`, `public/*`, `src/App.tsx`) + live crawler-perspective fetches + SERP entity verification
**Horizon:** 24 months

---

## 1. Executive Summary

### 1.1 The one-sentence finding

FinatriX has built **outstanding `<head>` SEO on a site with no `<body>`** — the metadata layer is top-1% engineering, and it is describing pages that contain, to a crawler, zero words.

### 1.2 What the evidence actually shows

I fetched production URLs exactly as a non-JavaScript crawler sees them. This is the complete visible content returned by `https://finatrix.co/` and by `https://finatrix.co/tools/budget`:

> **FinatriX**
> FinatriX needs JavaScript to run its interactive money tools. Please enable JavaScript in your browser, then reload this page.

That is **20 words**, identical on every URL on the site. It is the `<noscript>` block in `index.html`. There is exactly one HTML file in `dist/`, and `<div id="root">` ships empty.

### 1.3 The paradox to understand before reading further

| Layer | Quality | Evidence |
|---|---|---|
| Metadata / head | **Exceptional** | Per-route canonical, title, description, OG, Twitter, JSON-LD — all correct at the edge, before JS, verified live |
| Body / content | **Non-existent** | 20 identical words on every URL |

The edge Worker (`withSeoMetadata`) genuinely works — `/tools/budget` returns its own canonical, its own title, its own OG image. The engineering is real and the code comments show unusually rigorous reasoning (the `robots.txt` note on crawl-block vs. index-block is correct and better than most agencies write).

**But metadata describes content. It does not substitute for it.** Google's renderer will eventually execute the JS and see the tools. Every other consumer — GPTBot, PerplexityBot, ClaudeBot, most of Bing's crawl path, LinkedIn, Slack previews, and Google's own first-wave index — sees 20 words.

### 1.4 The three findings that matter most

1. **Zero server-rendered content.** Nothing to rank. Nothing to cite. Nothing to feed an AI Overview.
2. **Ten indexable URLs on the entire site.** 7 calculators + homepage + privacy + terms. That is the whole organic surface.
3. **The brand name is contested.** `finatrix.net` is an established **financial advisory firm** using the same name in the same industry. `linkedin.com/company/finatrix` belongs to that other entity. `finartix.com` is a third confusable fintech. Google currently has no reason to believe FinatriX-the-product is the primary "Finatrix."

### 1.5 The largest untapped asset

The careers product is **21 fully-built pages** — resume parsing, ATS, interview prep, company intelligence, offers, assessments — and **every single one is `noindex` and behind auth**. Resume/ATS/interview keywords are among the highest-volume, highest-commercial-intent query classes in existence. FinatriX has built the product and published none of it.

### 1.6 Verdict

FinatriX is **not ready to compete for anything except its exact brand name**, and is not currently guaranteed to win even that. The fix is not more metadata engineering — that work is done and done well. The fix is **shipping content that exists in HTML**.

The good news: because the metadata architecture is already correct and centralised in one pure module, content can be added faster here than in almost any codebase I would normally audit. The foundation is genuinely excellent. It is simply holding up nothing.

---

## 2. Overall SEO Score

### **34 / 100**

| Band | Meaning |
|---|---|
| 0–20 | Invisible |
| 21–40 | **Foundation only — cannot compete** ← FinatriX |
| 41–60 | Competing on long-tail |
| 61–80 | Category contender |
| 81–100 | Category leader |

**Weighted composition:**

| Dimension | Weight | Score | Contribution |
|---|---:|---:|---:|
| Technical SEO | 25% | 62 | 15.5 |
| Content SEO | 30% | 8 | 2.4 |
| Brand / Entity SEO | 20% | 18 | 3.6 |
| AI Search Readiness | 15% | 12 | 1.8 |
| Authority / Backlinks | 10% | 5 | 0.5 |
| **Total** | **100%** | | **23.8 → 34\*** |

\* Adjusted upward to 34 to credit the exceptional quality and correctness of the metadata, routing, security and canonical architecture, which materially reduces time-to-value once content ships. A site with this foundation and no content will outrun a site with content and no foundation, once content arrives.

---

## 3. Technical SEO Score

### **62 / 100**

The highest-scoring dimension, and deservedly so — with one catastrophic exception.

| # | Area | Score | Finding |
|---|---|---:|---|
| 1 | Canonical architecture | 95 | Single source of truth in `seo.ts`; `CANONICAL_ORIGIN` never uses `location.origin`. Correct and rare. |
| 2 | Per-route metadata at edge | 92 | `withSeoMetadata` writes real per-URL tags pre-JS. Verified live. |
| 3 | Robots policy | 90 | Correctly uses `noindex` over `Disallow` for private routes. Reasoning in comments is right. |
| 4 | HTTP status honesty | 88 | `isKnownRoute` gives true 404s, no soft-404s. |
| 5 | Security headers | 90 | HSTS preload, CSP with hashes, COOP, granular Permissions-Policy. |
| 6 | Redirect consolidation | 85 | `www`, legacy domains, HTTP all 301 to apex. |
| 7 | Structured data (schema) | 72 | Valid `@graph`, stable `@id`s, correct restraint on FAQPage/aggregateRating. |
| 8 | Icons / PWA / manifest | 88 | Responsive icon set with a genuine vector rebuild below 64px. |
| 9 | Caching strategy | 85 | Immutable for hashed assets, revalidate for icons. |
| 10 | Sitemap correctness | 70 | Correct in what it lists; omits `/tools` for a valid reason. |
| 11 | Sitemap *coverage* | 15 | **10 URLs total.** |
| 12 | Heading hierarchy | 40 | Only one `<h1>` in the entire public surface (`LandingHero.tsx`). Tool pages have none. |
| 13 | Internal linking | 20 | Nothing to link. No contextual links exist. |
| 14 | **Rendering / indexability** | **5** | **Zero SSR body. The single defining failure.** |
| 15 | Core Web Vitals | 55 | Est. — fonts preloaded and self-hosted (good), but full CSR means LCP waits on JS bundle. Chart.js, jsPDF, xlsx, pdfjs, tesseract.js are heavy. |
| 16 | Internationalisation | 45 | `en-IN` consistent and honest. But no `hreflang`, and the brief targets **India *and* Australia** — currently India-only. |
| 17 | Pagination | N/A | No paginated surfaces yet. |
| 18 | Image SEO | 50 | OG images generated per-tool (excellent). No content images, so no `alt` corpus. |

**Note on #16:** The brief asks for Australia and India. Every schema node says `en-IN`, currency is `INR`, copy is built on Indian tax slabs. There is currently **no Australian surface at all**. This is a strategic gap, not a bug — addressed in §11.

---

## 4. Brand SEO Score

### **18 / 100**

The most urgent non-technical problem, and the one most likely to be underestimated.

### 4.1 The entity collision

Searching the brand name today returns **other companies**:

| Rank signal | Entity | Domain | Conflict severity |
|---|---|---|---|
| 1 | **Finatrix — Financial Advisory** (research & advisory boutique; market entry, investment attraction, regulatory affairs) | `finatrix.net` | **Critical — same name, same industry** |
| 2 | Finatrix (LinkedIn company page) | `linkedin.com/company/finatrix` | **Critical — owns the LinkedIn slug** |
| 3 | FINARTIX Fintech Solutions S.A. | `finartix.com` | High — near-homograph, fintech |
| 4 | Finartix (Crunchbase) | `crunchbase.com/organization/finartix` | High — owns Crunchbase presence |
| 5 | **FinatriX (@finatrix_) — "Finance. Clarity. Confidence."** | `instagram.com/finatrix_` | **This is yours** — the only confirmed owned profile found |

`finatrix.co` did **not surface** for its own brand name in search testing.

### 4.2 Why this is worse than a normal new-brand problem

A new brand normally has *no* entity. FinatriX has a **competing entity that already occupies the name in the same vertical**. Google's Knowledge Graph will consolidate signals toward the incumbent unless FinatriX gives it explicit disambiguation.

### 4.3 The `sameAs` decision — correct then, wrong now

`index.html` carries a deliberate `TODO(brand)` explaining why `sameAs` was omitted: it previously pointed at `twitter.com/finatrix_`, which 404s, and the comment correctly argues that verifying a brand against a dead URL is weaker than omitting the property.

**That reasoning was right.** But the conclusion has expired: `instagram.com/finatrix_` **is live and is FinatriX's**. Omitting `sameAs` entirely, in a namespace contested by three other companies, hands entity resolution to the incumbent.

### 4.4 Brand score breakdown

| Signal | Score | Note |
|---|---:|---|
| Organization schema present | 80 | Well-formed, stable `@id`, contact point |
| `sameAs` entity links | **0** | Deliberately empty |
| Owned social profiles | 15 | Instagram only; X handle 404s; LinkedIn slug taken |
| Brand citations (NAP/mentions) | 5 | Effectively none |
| Knowledge Panel eligibility | 0 | Not eligible — no corroborating sources |
| Wikipedia/Wikidata | 0 | Not notable yet (Wikipedia: **not suitable**; Wikidata: **suitable now**) |
| Crunchbase / Product Hunt | 0 | Absent; competitor holds Crunchbase |
| Brand SERP control | 10 | Does not own page 1 for own name |
| Name distinctiveness | 25 | Contested by 3 entities |
| Logo/visual consistency | 85 | Strong, coherent identity |

---

## 5. Content SEO Score

### **8 / 100**

The lowest score, and the simplest to state.

| Metric | Value |
|---|---|
| Indexable URLs | **10** |
| Editorial/blog pages | **0** |
| Words of crawlable body content, entire site | **~20** (identical across all URLs) |
| Guides / explainers / comparisons | 0 |
| FAQ content | 0 |
| Glossary / definitions | 0 |
| Careers content pages (public) | **0 of 21 built pages** |
| Landing pages beyond tools | 0 |
| Topic clusters | 0 |
| Internal contextual links | 0 |

**The 7 calculator pages are the entire acquisition surface**, and each is a JS-only interactive widget with no supporting prose. Even after Google renders them, a calculator with no explanatory text ranks far below a competitor page that explains the concept, shows worked examples, and answers follow-up questions.

**What scores the 8:** the title/description copy in `TOOL_SEO` is genuinely well-written — accurate, under truncation limits, leads with the tool name, honest about being educational rather than advice. That copy is a strong seed for real pages.

---

## 6. AI Search Readiness Score

### **12 / 100**

This is where the rendering failure hurts most, and where it is most often misunderstood.

### 6.1 The critical distinction

Google operates a two-wave index and **will** eventually render JavaScript. **Most AI crawlers do not render JavaScript at all.**

| Engine | Crawler | Renders JS? | What it sees on FinatriX |
|---|---|---|---|
| Google Search | Googlebot | Yes (delayed 2nd wave) | Tools, eventually |
| Google AI Overviews | Googlebot-derived | Partial | Metadata + little else |
| ChatGPT Search | GPTBot / OAI-SearchBot | **No** | **20 words** |
| Perplexity | PerplexityBot | **No** | **20 words** |
| Claude | ClaudeBot | **No** | **20 words** |
| Gemini | Google-Extended | Partial | Metadata + little else |
| Bing / Copilot | Bingbot | Limited | **~20 words** |
| DuckDuckGo | Bing-sourced | Inherits Bing | **20 words** |
| Brave | Brave crawler | Limited | **~20 words** |

**FinatriX is currently uncitable by every major AI answer engine.** Not "poorly ranked" — *uncitable*, because there is no extractable claim on any page.

### 6.2 Why this is the highest-cost failure

AI engines answer *the exact questions calculators serve*: "how does the 50/30/20 rule work in India", "where should I park idle cash post-tax", "how much SIP for a ₹50 lakh goal". These are definitional, extractable, citation-shaped queries — the single best fit for AI Overview and Perplexity citation. FinatriX has the domain expertise encoded in working calculators and exposes none of it as text.

### 6.3 Readiness breakdown

| Factor | Score | Note |
|---|---:|---|
| Extractable text content | 0 | None |
| Question-shaped headings | 0 | None |
| Direct-answer paragraphs | 0 | None |
| Structured data | 65 | Good, but describes empty pages |
| FAQPage schema | 0 | Correctly withheld — no visible FAQ exists |
| Author/expertise signals (E-E-A-T) | 5 | No named author, no credentials, no about page |
| Citable statistics / original data | 0 | None published |
| Freshness signals | 10 | No dates, no updates |
| `llms.txt` | 0 | Absent |
| Crawler access | 90 | `robots.txt` allows all — correctly |

**The one bright spot:** `robots.txt` allows every AI crawler. Many finance sites block them. FinatriX has the door open and nothing in the room.

---

## 7. Authority Score

### **5 / 100**

| Signal | Status |
|---|---|
| Referring domains | Effectively zero |
| Domain age | New (`.co`, recently migrated from `.online`/`.space`) |
| Prior domain migrations | **Two** — dilutes accumulated signal |
| Editorial mentions / PR | None found |
| Directory listings | None |
| Product Hunt | Not launched |
| GitHub public presence | None found |
| Crunchbase | Held by a competitor |
| University / .edu links | None |
| Newsletter mentions | None |
| YMYL trust signals | **Weak — critical for finance** |

**YMYL warning.** Personal finance is a *Your Money or Your Life* category. Google applies its strictest E-E-A-T scrutiny here. A finance site with no named author, no credentials, no editorial policy, no about page, and no external corroboration faces a **structural ranking ceiling** regardless of technical quality. This is the single most under-appreciated constraint in the audit.

The prominent "Not financial advice" disclaimer is good and should stay — but a disclaimer establishes *honesty*, not *expertise*. Both are required.

---

## 8. Critical Issues

Ordered by impact × urgency. These block everything downstream.

| # | Issue | Impact | Evidence | Fix horizon |
|---|---|---|---|---|
| **C1** | **Zero server-rendered body content on every URL** | Catastrophic | `dist/` contains 1 HTML file; live fetch returns only `<noscript>` | Weeks 1–6 |
| **C2** | **Only 10 indexable URLs** | Catastrophic | `sitemap.xml` = 10 `<url>` entries | Ongoing |
| **C3** | **Uncitable by all AI answer engines** | Critical | Non-JS crawlers see 20 words | Follows C1 |
| **C4** | **Brand entity lost to `finatrix.net`** | Critical | SERP shows advisory firm, not FinatriX | Weeks 1–4 |
| **C5** | **`sameAs` array empty** | Critical | `index.html` `TODO(brand)`; Instagram exists but unlinked | **Week 1 — trivial** |
| **C6** | **21 careers pages entirely noindex** | Critical | `PRIVATE_TITLES` in `seo.ts`; all auth-gated | Months 2–5 |
| **C7** | **No E-E-A-T layer on a YMYL site** | Critical | No about/author/editorial-policy page | Weeks 2–6 |
| **C8** | **No `<h1>` on any tool page** | High | Only `LandingHero.tsx` has one | Follows C1 |
| **C9** | **Zero backlinks / no authority** | High | No referring domains found | Months 1–24 |
| **C10** | **Australia target has no surface** | High | Everything is `en-IN`, INR, Indian tax | Months 6–12 |

### Note on C1 — what "fix" means

This is a strategy document, not an implementation plan, so I will name the options and the recommendation without writing code:

| Option | Effort | SEO outcome | Recommendation |
|---|---|---|---|
| Prerendering at build (static HTML per route) | Low–Medium | Solves C1 fully for static content | **Recommended first move** — fastest path, preserves current architecture, works with the existing Worker |
| Full SSR framework migration | High | Solves C1 + dynamic content | Only if careers content becomes dynamic at scale |
| Static MDX content pages alongside the SPA | Low | Solves C2 + C3 directly | **Recommended in parallel** — content pages need no interactivity |
| Worker-side HTML injection of page prose | Medium | Partial | Viable stopgap; the Worker already rewrites head |

The pragmatic path: **prerender the 10 existing routes, and publish all new editorial content as genuinely static pages.** The calculators stay interactive; the words around them become HTML.

---

## 9. High Priority Actions

**Timeframe: 0–90 days.**

| # | Action | Category | Effort | Impact |
|---|---|---|---|---|
| 1 | Add `sameAs` to Organization schema (Instagram, + each profile as created) | Brand | XS | High |
| 2 | Register and populate: X, LinkedIn Company, YouTube, GitHub org, Product Hunt, Crunchbase | Brand | S | High |
| 3 | Prerender all 10 existing routes to real HTML | Technical | M | Critical |
| 4 | Add 400–800 words of explanatory prose beneath each of the 7 calculators | Content | M | Critical |
| 5 | Add a proper `<h1>` to every public page | Technical | XS | High |
| 6 | Build `/about` with named founder, credentials, mission, editorial policy | E-E-A-T | S | Critical |
| 7 | Build `/methodology` explaining every formula and assumption | E-E-A-T | M | High |
| 8 | Launch `/blog` (or `/learn`) infrastructure as static pages | Content | M | Critical |
| 9 | Publish first 12 cornerstone guides | Content | L | Critical |
| 10 | Add visible FAQ sections to each tool, **then** add `FAQPage` schema | Content + Schema | M | High |
| 11 | Create Wikidata entity for FinatriX | Brand | S | High |
| 12 | Verify Google Search Console + Bing Webmaster Tools; submit sitemap | Technical | XS | High |
| 13 | Expand sitemap automatically as pages ship | Technical | S | High |
| 14 | Add `llms.txt` at root | AI | XS | Medium |
| 15 | Add `Person` + `author` schema to all editorial content | E-E-A-T | S | High |
| 16 | Publish 3 public careers landing pages (ATS checker, resume scanner, interview prep) with free tier | Content | L | Critical |
| 17 | Add `dateModified` / `datePublished` to all content | AI + Freshness | XS | Medium |
| 18 | Product Hunt launch | Authority | M | High |
| 19 | Set up branded-search monitoring for "FinatriX" vs `finatrix.net` | Brand | XS | Medium |
| 20 | Audit and reduce initial JS bundle (defer tesseract/pdfjs/xlsx off critical path) | Performance | M | Medium |

---

## 10. Medium Priority Actions

**Timeframe: 90–270 days.**

| # | Action | Category |
|---|---|---|
| 21 | Build glossary of 150+ finance and careers terms, each own URL | Content |
| 22 | Build comparison pages (FinatriX vs. named competitors) | Content |
| 23 | Publish original research (India savings-rate index from anonymised PeerCompare data) | Authority |
| 24 | Add breadcrumb UI to match existing `BreadcrumbList` schema | Technical |
| 25 | Implement hub-and-spoke internal linking | Linking |
| 26 | Add related-tools module to every calculator | Linking |
| 27 | Launch YouTube channel — tool walkthroughs | Brand |
| 28 | Begin university outreach (India + Australia) for `.edu` links | Backlinks |
| 29 | Add `HowTo` schema where genuinely step-based | Schema |
| 30 | Build `/tools` as a real indexable hub page (rather than a redirect) | Technical |
| 31 | Publish monthly financial-literacy newsletter | Authority |
| 32 | Add author bio boxes with credentials | E-E-A-T |
| 33 | Open-source a small utility (e.g. Indian tax calc library) on GitHub | Backlinks |
| 34 | Create shareable embeddable calculator widgets (link-attributed) | Backlinks |
| 35 | Add `SearchAction` once a real site-search endpoint exists | Schema |
| 36 | Build careers content cluster (30+ pages) | Content |
| 37 | Add case studies / worked examples per tool | Content |
| 38 | Localise for Australia: AUD, ATO tax, superannuation | i18n |
| 39 | Implement `hreflang` for `en-IN` / `en-AU` | i18n |
| 40 | Add review/testimonial collection — **then** `aggregateRating` schema | Schema |

---

## 11. Long-term Strategy

**Timeframe: 9–24 months.**

### 11.1 Strategic positioning

FinatriX's defensible wedge is the **intersection nobody occupies**: *money* and *career* in one product. NerdWallet does not do resumes. Jobscan does not do SIP planning. The unifying insight — **your career is your largest financial asset** — is a genuine content territory with no incumbent.

### 11.2 The five pillars

| Pillar | Objective | Proof of success |
|---|---|---|
| 1. **Own the brand entity** | "FinatriX" returns FinatriX, with Knowledge Panel | Panel live; page 1 fully owned |
| 2. **Own India personal-finance calculators** | Top 3 for calculator long-tail | 50+ page-1 rankings |
| 3. **Own the career-finance intersection** | Category-defining content | Cited as origin of the concept |
| 4. **Become AI-citable** | Default citation in AI answers | Cited in Perplexity/ChatGPT for target queries |
| 5. **Expand to Australia** | Second market | `en-AU` cluster ranking |

### 11.3 Sequencing principle

**Do not pursue backlinks before content exists.** Outreach to a 10-page site with no articles converts near zero and burns relationships that are hard to re-approach. Content → authority → links, in that order.

### 11.4 Two-market architecture

Recommended structure when Australia launches:

| Path | Market | Notes |
|---|---|---|
| `/` | India (default) | Preserves existing equity |
| `/au/` | Australia | Subdirectory, not subdomain — inherits domain authority |
| `hreflang` | `en-IN`, `en-AU`, `x-default` | Prevents cannibalisation |

Subdirectory over subdomain, because a new subdomain restarts authority accumulation.

---

## 12. Top 100 Recommended Pages

Prioritised. **P1 = build first.**

### 12.1 Foundation & trust (1–10)

| # | URL | Type | Priority |
|---|---|---|---|
| 1 | `/about` | Trust | P1 |
| 2 | `/methodology` | Trust | P1 |
| 3 | `/editorial-policy` | Trust | P1 |
| 4 | `/team` | Trust | P1 |
| 5 | `/contact` | Trust | P1 |
| 6 | `/tools` (real hub) | Hub | P1 |
| 7 | `/learn` (content hub) | Hub | P1 |
| 8 | `/glossary` | Hub | P1 |
| 9 | `/faq` | Support | P2 |
| 10 | `/changelog` | Freshness | P3 |

### 12.2 Enhanced tool pages (11–20)

| # | URL | Addition | Priority |
|---|---|---|---|
| 11 | `/tools/budget` | +800 words, FAQ, examples | P1 |
| 12 | `/tools/expenses` | +800 words, FAQ | P1 |
| 13 | `/tools/investmatch` | +800 words, FAQ | P1 |
| 14 | `/tools/parksmart` | +800 words, FAQ | P1 |
| 15 | `/tools/peercompare` | +800 words, FAQ | P1 |
| 16 | `/tools/goals` | +800 words, FAQ | P1 |
| 17 | `/tools/lifemap` | +800 words, FAQ | P1 |
| 18 | `/tools/budget/examples` | Worked examples | P2 |
| 19 | `/tools/lifemap/scenarios` | Scenario library | P2 |
| 20 | `/tools/compare` | Tool chooser | P2 |

### 12.3 New calculators — high-volume gaps (21–40)

| # | URL | Priority |
|---|---|---|
| 21 | `/tools/sip-calculator` | P1 |
| 22 | `/tools/emi-calculator` | P1 |
| 23 | `/tools/income-tax-calculator` | P1 |
| 24 | `/tools/ppf-calculator` | P1 |
| 25 | `/tools/fd-calculator` | P1 |
| 26 | `/tools/nps-calculator` | P2 |
| 27 | `/tools/hra-calculator` | P1 |
| 28 | `/tools/gratuity-calculator` | P2 |
| 29 | `/tools/retirement-calculator` | P1 |
| 30 | `/tools/emergency-fund-calculator` | P1 |
| 31 | `/tools/home-loan-affordability` | P1 |
| 32 | `/tools/car-loan-calculator` | P3 |
| 33 | `/tools/inflation-calculator` | P2 |
| 34 | `/tools/compound-interest-calculator` | P1 |
| 35 | `/tools/salary-in-hand-calculator` | P1 |
| 36 | `/tools/capital-gains-calculator` | P2 |
| 37 | `/tools/rent-vs-buy-calculator` | P1 |
| 38 | `/tools/credit-card-payoff-calculator` | P2 |
| 39 | `/tools/net-worth-calculator` | P2 |
| 40 | `/tools/fire-calculator` | P1 |

### 12.4 Public careers pages — the biggest opportunity (41–60)

| # | URL | Priority |
|---|---|---|
| 41 | `/careers/ats-resume-checker` (free tier) | **P1** |
| 42 | `/careers/resume-scanner` | **P1** |
| 43 | `/careers/interview-prep` | **P1** |
| 44 | `/careers/resume-templates` | P1 |
| 45 | `/careers/salary-negotiation-guide` | P1 |
| 46 | `/careers/cover-letter-generator` | P2 |
| 47 | `/careers/resume-keywords` | P1 |
| 48 | `/careers/job-search-tracker` | P2 |
| 49 | `/careers/offer-comparison` | P1 |
| 50 | `/careers/companies` (public directory) | P2 |
| 51–60 | `/careers/interview-questions/{role}` × 10 roles | P2 |

### 12.5 Finance education cluster (61–80)

| # | URL | Priority |
|---|---|---|
| 61 | `/learn/50-30-20-rule` | P1 |
| 62 | `/learn/emergency-fund` | P1 |
| 63 | `/learn/sip-vs-lumpsum` | P1 |
| 64 | `/learn/mutual-funds-india` | P1 |
| 65 | `/learn/how-to-start-investing-india` | P1 |
| 66 | `/learn/tax-saving-80c` | P1 |
| 67 | `/learn/old-vs-new-tax-regime` | P1 |
| 68 | `/learn/index-funds-india` | P1 |
| 69 | `/learn/debt-vs-equity` | P2 |
| 70 | `/learn/asset-allocation` | P2 |
| 71 | `/learn/financial-independence-india` | P1 |
| 72 | `/learn/investment-fraud-red-flags` | P1 |
| 73 | `/learn/credit-score-india` | P2 |
| 74 | `/learn/health-insurance-guide` | P2 |
| 75 | `/learn/term-insurance-guide` | P2 |
| 76 | `/learn/first-salary-checklist` | P1 |
| 77 | `/learn/budgeting-for-students` | P2 |
| 78 | `/learn/nps-vs-ppf-vs-epf` | P1 |
| 79 | `/learn/risk-profiling` | P2 |
| 80 | `/learn/sebi-regulations-explained` | P3 |

### 12.6 Career–finance intersection — the differentiator (81–90)

| # | URL | Why it wins |
|---|---|---|
| 81 | `/learn/salary-negotiation-compound-effect` | Nobody owns this |
| 82 | `/learn/job-switch-financial-checklist` | Unique |
| 83 | `/learn/career-break-financial-planning` | Unique |
| 84 | `/learn/esop-explained-india` | High value, low competition |
| 85 | `/learn/ctc-vs-take-home` | Very high volume |
| 86 | `/learn/notice-period-finances` | Unique |
| 87 | `/learn/freelance-tax-india` | Growing |
| 88 | `/learn/first-job-investing` | Unique |
| 89 | `/learn/layoff-financial-survival` | High intent |
| 90 | `/learn/relocation-cost-calculator` | Unique |

### 12.7 Comparisons, data & Australia (91–100)

| # | URL | Type |
|---|---|---|
| 91 | `/compare/finatrix-vs-ynab` | Comparison |
| 92 | `/compare/finatrix-vs-jobscan` | Comparison |
| 93 | `/compare/best-budget-apps-india` | Listicle |
| 94 | `/compare/best-resume-checkers` | Listicle |
| 95 | `/data/india-savings-index` | **Original research** |
| 96 | `/data/salary-benchmarks-india` | **Original research** |
| 97 | `/au/` | Australia hub |
| 98 | `/au/tools/budget` | Australia |
| 99 | `/au/learn/superannuation-guide` | Australia |
| 100 | `/au/tools/income-tax-calculator` | Australia |

---

## 13. Top 100 Target Keywords

Grouped by strategic function. Volume/difficulty are **directional estimates** requiring validation in Ahrefs/Semrush — I have not fabricated precise figures.

### 13.1 Brand — must win, non-negotiable (1–10)

| # | Keyword | Difficulty | Note |
|---|---|---|---|
| 1 | finatrix | Low | **Contested by `finatrix.net`** |
| 2 | finatrix.co | Low | Own now |
| 3 | finatrix app | Low | Own now |
| 4 | finatrix budget | Low | Own now |
| 5 | finatrix review | Low | Defensive |
| 6 | finatrix login | Low | Own now |
| 7 | finatrix india | Low | Disambiguating |
| 8 | finatrix tools | Low | Own now |
| 9 | is finatrix safe | Low | Trust query |
| 10 | finatrix careers | Low | Own now |

### 13.2 High-volume finance calculators (11–35)

| # | Keyword | Est. difficulty |
|---|---|---|
| 11 | sip calculator | High |
| 12 | emi calculator | High |
| 13 | income tax calculator india | High |
| 14 | ppf calculator | Medium |
| 15 | fd calculator | Medium |
| 16 | budget calculator india | Medium |
| 17 | 50/30/20 rule calculator | **Low — strong fit** |
| 18 | retirement calculator india | Medium |
| 19 | hra calculator | Medium |
| 20 | in hand salary calculator | High |
| 21 | compound interest calculator | High |
| 22 | emergency fund calculator | **Low** |
| 23 | nps calculator | Medium |
| 24 | gratuity calculator | Medium |
| 25 | home loan eligibility calculator | High |
| 26 | rent vs buy calculator india | **Low** |
| 27 | fire calculator india | **Low** |
| 28 | net worth calculator | Medium |
| 29 | inflation calculator india | Low |
| 30 | capital gains tax calculator | Medium |
| 31 | step up sip calculator | **Low — matches `/tools/goals`** |
| 32 | goal based sip calculator | **Low — exact match** |
| 33 | liquid fund vs fd calculator | **Very low — exact `/tools/parksmart`** |
| 34 | arbitrage fund tax calculator | **Very low — exact match** |
| 35 | post tax return calculator | **Very low — exact match** |

### 13.3 Finance education (36–55)

| # | Keyword |
|---|---|
| 36 | how to start investing in india |
| 37 | 50 30 20 rule explained |
| 38 | best mutual funds for beginners india |
| 39 | old vs new tax regime which is better |
| 40 | how much emergency fund do i need |
| 41 | sip vs lumpsum which is better |
| 42 | index funds india beginners |
| 43 | section 80c deductions list |
| 44 | how to save tax in india |
| 45 | financial independence india |
| 46 | asset allocation by age |
| 47 | nps vs ppf vs epf |
| 48 | how to invest first salary |
| 49 | investment scams india how to spot |
| 50 | ponzi scheme red flags |
| 51 | credit score improve india |
| 52 | term insurance how much cover |
| 53 | debt mutual funds taxation |
| 54 | what is expense ratio |
| 55 | risk profile questionnaire |

### 13.4 Careers — highest commercial intent (56–80)

| # | Keyword | Note |
|---|---|---|
| 56 | ats resume checker | **Very high volume** |
| 57 | free resume scanner | Very high |
| 58 | ats friendly resume | Very high |
| 59 | resume keywords for ats | High |
| 60 | resume checker free | Very high |
| 61 | interview preparation questions | Very high |
| 62 | salary negotiation tips | High |
| 63 | how to negotiate salary india | Medium |
| 64 | cover letter generator | High |
| 65 | resume templates ats | High |
| 66 | job application tracker | Medium |
| 67 | offer comparison tool | **Low** |
| 68 | ctc vs in hand salary | **High volume, low difficulty** |
| 69 | esop explained india | **Low** |
| 70 | notice period buyout | Low |
| 71 | behavioural interview questions | High |
| 72 | star method examples | High |
| 73 | resume for freshers india | High |
| 74 | linkedin profile optimisation | High |
| 75 | how to explain career gap | Medium |
| 76 | technical interview preparation | High |
| 77 | company research before interview | **Low** |
| 78 | counter offer should i accept | Medium |
| 79 | job search tracker spreadsheet | Medium |
| 80 | recruiter outreach message template | Medium |

### 13.5 Career–finance intersection — own outright (81–90)

| # | Keyword | Competition |
|---|---|---|
| 81 | financial planning before job switch | **Almost none** |
| 82 | how much salary increase is worth switching | **Almost none** |
| 83 | career break financial planning | **Almost none** |
| 84 | layoff financial checklist india | Low |
| 85 | salary negotiation long term impact | **Almost none** |
| 86 | relocation salary adjustment calculator | **Almost none** |
| 87 | freelance vs full time financial comparison | Low |
| 88 | first job money mistakes | Low |
| 89 | esop vs higher salary | **Almost none** |
| 90 | sabbatical savings calculator | **Almost none** |

### 13.6 Australia — phase 2 (91–100)

| # | Keyword |
|---|---|
| 91 | budget calculator australia |
| 92 | superannuation calculator |
| 93 | tax calculator australia |
| 94 | ato tax brackets |
| 95 | salary sacrifice calculator |
| 96 | ats resume checker australia |
| 97 | resume template australia |
| 98 | first home buyer calculator australia |
| 99 | how much super do i need |
| 100 | seek resume tips |

**Keyword strategy note.** Rows 33–35 and 81–90 are the highest-ROI entries in this table. They are near-zero competition, they map to tools FinatriX **has already built**, and several describe concepts nobody has claimed. Chase these before `sip calculator`, which is contested by ET Money, Groww and every AMC in India.

---

## 14. Internal Linking Strategy

### 14.1 Current state

**Zero contextual internal links.** With 10 URLs and no body content, there is nothing to link from or to. PageRank cannot flow because there are no edges in the graph.

### 14.2 Target architecture — hub and spoke

```
                         Homepage
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
    /tools hub          /learn hub        /careers hub
        │                   │                   │
   ┌────┼────┐         ┌────┼────┐         ┌────┼────┐
 tool  tool  tool    guide guide guide    tool guide tool
   │     │     │        │     │     │        │    │    │
   └──cross-links──────┴─────┴─────┴────────┴────┴────┘
              (contextual, bidirectional)
```

### 14.3 Linking rules

| # | Rule | Rationale |
|---|---|---|
| 1 | Every hub links to all its spokes | Distributes authority downward |
| 2 | Every spoke links back to its hub | Consolidates topical relevance |
| 3 | Every guide links to ≥1 relevant tool | Converts reading into product use |
| 4 | Every tool links to ≥3 relevant guides | Adds depth crawlers can index |
| 5 | Cross-cluster links only where genuinely relevant | Forced links dilute |
| 6 | Descriptive anchor text, never "click here" | Anchors are ranking signals |
| 7 | Max ~100 links per page | Preserves link equity |
| 8 | Glossary terms auto-link on first mention | Scalable internal linking |
| 9 | Breadcrumb UI on every page | Matches existing `BreadcrumbList` schema |
| 10 | Related-content module in every footer | Guaranteed crawl paths |

### 14.4 Priority link paths

| From | To | Anchor example |
|---|---|---|
| `/learn/50-30-20-rule` | `/tools/budget` | "try the 50/30/20 budget calculator" |
| `/learn/emergency-fund` | `/tools/parksmart` | "compare where to park your emergency fund" |
| `/learn/sip-vs-lumpsum` | `/tools/goals` | "work back from your goal to a monthly SIP" |
| `/learn/ctc-vs-take-home` | `/careers/offer-comparison` | "compare two offers side by side" |
| `/careers/salary-negotiation-guide` | `/tools/lifemap` | "see the lifetime effect of a raise" |
| `/tools/peercompare` | `/data/india-savings-index` | "how we benchmark savings rates" |

### 14.5 The signature cross-cluster link

The **single most strategically valuable internal link** on the site:

`/careers/salary-negotiation-guide` → `/tools/lifemap`

It is the only link on the internet connecting *"how to negotiate a raise"* to *"here is what that raise compounds to across your entire life."* That link **is** the FinatriX thesis, made navigable.

---

## 15. Backlink Strategy

### 15.1 Governing principle

**Nothing here works before §9 ships.** Outreach to a 10-page site with no content converts near zero and burns contacts permanently.

### 15.2 Phased plan

#### Phase 1 — Foundation citations (Months 1–3)

| # | Target | Type | Difficulty |
|---|---|---|---|
| 1 | Wikidata entity | Entity | Easy |
| 2 | Crunchbase profile | Directory | Easy |
| 3 | LinkedIn Company Page | Social | Easy |
| 4 | X / Twitter (register handle) | Social | Easy |
| 5 | YouTube channel | Social | Easy |
| 6 | GitHub organisation | Developer | Easy |
| 7 | Product Hunt launch | Launch | Medium |
| 8 | BetaList / Indie Hackers | Startup | Easy |
| 9 | AlternativeTo listing | Directory | Easy |
| 10 | SaaSHub / Slant | Directory | Easy |

#### Phase 2 — Community & developer (Months 3–6)

| # | Target | Approach |
|---|---|---|
| 11 | r/IndiaInvestments | Genuine participation, **never** drive-by links |
| 12 | r/personalfinanceindia | Answer questions, cite tools only when directly relevant |
| 13 | r/AusFinance | Phase 2, Australia |
| 14 | Indie Hackers build-in-public | Ongoing narrative |
| 15 | Hacker News (Show HN) | One shot — time it well |
| 16 | Open-source an Indian tax/finance library | Earns organic dev links |
| 17 | Dev.to / Hashnode technical posts | "How we built a lifetime wealth simulation" |
| 18 | Awesome-lists (finance, India) | PR to curated repos |
| 19 | Stack Overflow profile presence | Slow, credible |
| 20 | Discord/Slack finance communities | Relationship-first |

#### Phase 3 — Editorial & PR (Months 6–12)

| # | Target | Hook |
|---|---|---|
| 21 | YourStory, Inc42, Entrackr | Indian startup coverage |
| 22 | Mint, Economic Times (personal finance desks) | Original data from §12.5 |
| 23 | LiveMint / Moneycontrol contributor columns | Expertise-led |
| 24 | Finance newsletters (India) | Tool mentions |
| 25 | Personal-finance YouTubers (India) | Tool demos |
| 26 | Podcast guest appearances | Founder story |
| 27 | HARO / Qwoted / Featured | Expert quotes |
| 28 | Guest posts on finance blogs | Quality only |
| 29 | Original research press release | `/data/india-savings-index` |
| 30 | Australian finance press | Phase 2 |

#### Phase 4 — Institutional (Months 9–24)

| # | Target | Value |
|---|---|---|
| 31 | Indian university career cells (IITs, NITs, IIMs) | **`.edu` — highest value** |
| 32 | Australian university career services | `.edu.au` |
| 33 | College finance clubs | Sponsorship |
| 34 | Financial-literacy NGOs | `.org` |
| 35 | SEBI investor-education adjacency | Trust by association |
| 36 | Corporate L&D / HR partnerships | B2B |
| 37 | Coding bootcamps | Careers-tool fit |
| 38 | Student unions | Broad reach |
| 39 | Library resource pages | Evergreen `.edu` |
| 40 | Government financial-literacy portals | Highest trust |

### 15.3 Highest-ROI single tactic

**Free embeddable calculator widgets with attribution links.** Bloggers embed a working calculator; every embed is a contextual link from a topically relevant page. This is how Bankrate and NerdWallet built early link profiles, and FinatriX has seven embeddable calculators already built.

### 15.4 What to avoid

| Do not | Why |
|---|---|
| Buy links | Manual action risk; fatal on a YMYL site |
| PBNs | Same |
| Comment/forum spam | Reputational damage in tight finance communities |
| Mass low-quality directories | Zero value, dilution risk |
| Reciprocal link schemes | Detectable pattern |

---

## 16. Content Calendar — 12 Months

**Cadence:** 8–12 pieces/month from Month 2. Quality over volume — on a YMYL site, one thin page damages the whole domain.

| Month | Theme | Deliverables | Target |
|---|---|---|---|
| **1** | Foundation | Prerendering live; `/about`, `/methodology`, `/editorial-policy`, `/team`; `sameAs` populated; all social profiles registered; GSC + Bing verified | 15 URLs |
| **2** | Tool depth | 800 words + visible FAQ on all 7 calculators; `FAQPage` schema; `<h1>`s; `/tools` hub; `/learn` hub | 25 URLs |
| **3** | Cornerstone finance | 10 pillar guides (50/30/20, emergency fund, SIP vs lumpsum, tax regimes, 80C, index funds, asset allocation, first salary, NPS/PPF/EPF, FI India) | 35 URLs |
| **4** | **Careers unlock** | Public ATS checker, resume scanner, interview prep (free tier) + 5 supporting guides | 45 URLs |
| **5** | Calculator expansion | SIP, EMI, income tax, PPF, FD, HRA calculators + prose each | 55 URLs |
| **6** | Intersection cluster | 10 career–finance pieces (§12.6) — the differentiator | 65 URLs |
| **7** | Glossary + Product Hunt | 150-term glossary; PH launch; press outreach | 80 URLs |
| **8** | Comparisons | Competitor comparisons, "best of" listicles, alternatives pages | 90 URLs |
| **9** | **Original research** | India Savings Index published; press release; journalist outreach | 95 URLs |
| **10** | Careers depth | 20 role-specific interview-question pages | 115 URLs |
| **11** | Australia phase 1 | `/au/` hub, AUD/ATO/super localisation, `hreflang` | 130 URLs |
| **12** | Consolidate + refresh | Audit all content, refresh top pages, fix decay, university outreach | 150 URLs |

### 16.1 Monthly recurring commitments

| Cadence | Activity |
|---|---|
| Weekly | 2 published pieces; internal-link audit of new content |
| Fortnightly | Community participation (Reddit, IH, Discord) |
| Monthly | Newsletter; GSC review; ranking report; 1 YouTube video |
| Quarterly | Full technical audit; content refresh; backlink review; competitor gap analysis |

---

## 17. Competitor Comparison

### 17.1 Head-to-head

| Competitor | Domain strength | Content scale | FinatriX advantage | FinatriX weakness |
|---|---|---|---|---|
| **YNAB** | Very high | Large blog, strong brand | Free; India-specific; no paywall | No brand, no community, no content |
| **Monarch Money** | High | Moderate | Free; educational; careers | US-focused rival has funding + press |
| **Copilot Money** | Medium-high | Small | Web-first vs iOS-only; India | Rival has design reputation + reviews |
| **NerdWallet** | Extremely high | Massive (10k+ pages) | Not ad-driven; genuinely educational | **Content gap is ~10,000 pages** |
| **MoneySmart (AU)** | Very high (`.gov.au`) | Large | Better UX; modern tooling | Cannot out-trust a government domain |
| **LinkedIn Jobs** | Extremely high | Enormous | Focused tooling; finance link | Not competing directly — partner instead |
| **Indeed** | Extremely high | Enormous | Same | Same |
| **Seek (AU)** | Very high | Large | Same | Same |
| **Resume.io** | High | Large | Free tier; finance integration | Rival owns resume-template SERPs |
| **Jobscan** | High | Large | **Careers + finance in one** | Rival owns "ATS" outright |

### 17.2 Competitive advantages — real and defensible

| # | Advantage | Defensibility |
|---|---|---|
| 1 | **Money + career in one product** | **High — nobody occupies it** |
| 2 | Genuinely free, no ad-model conflict | Medium-high |
| 3 | India-native (₹, Indian tax, Indian instruments) | Medium — NerdWallet could enter |
| 4 | Education-first, not lead-gen | High — trust compounds |
| 5 | Post-tax comparison in ParkSmart | **High — genuinely rare** |
| 6 | Lifetime simulation (LifeMap) | High — technically hard to copy |
| 7 | Privacy-first (local-first data) | Medium-high |
| 8 | Modern engineering + a11y discipline | Medium |

### 17.3 Weaknesses — honest

| # | Weakness | Severity |
|---|---|---|
| 1 | ~10 pages vs. competitors' thousands | **Critical** |
| 2 | Zero domain authority | **Critical** |
| 3 | Contested brand name | **Critical** |
| 4 | No content team / publishing cadence | High |
| 5 | No community | High |
| 6 | No reviews or social proof | High |
| 7 | No mobile app (competitors are app-first) | Medium |
| 8 | Single-market (India only) | Medium |

### 17.4 Keyword gap summary

| Gap type | Competitor owns | FinatriX opportunity |
|---|---|---|
| Head calculator terms | ET Money, Groww, ClearTax | **Avoid initially** — too contested |
| Long-tail post-tax terms | **Nobody** | **Attack now** — tools already built |
| ATS/resume terms | Jobscan, Resume.io | Attack via free tier |
| Career–finance intersection | **Nobody** | **Attack now — category creation** |
| Australia super/tax | MoneySmart | Phase 2, avoid head terms |

---

## 18. Google Ranking Roadmap

### 18.1 Stage gates

| Stage | Months | Objective | Exit criterion |
|---|---:|---|---|
| **0. Foundation** | 0–1 | Make the site crawlable | Real HTML content on all 10 URLs |
| **1. Brand capture** | 1–3 | Win own name | #1 for "FinatriX"; page 1 fully owned |
| **2. Long-tail entry** | 3–6 | First non-brand rankings | 20+ keywords in top 20 |
| **3. Cluster authority** | 6–12 | Topical authority in 2 clusters | 50+ page-1 rankings |
| **4. Category contention** | 12–18 | Compete on mid-volume head terms | 150+ page-1; AI citations |
| **5. Leadership** | 18–24 | Category-defining | Knowledge Panel; 300+ page-1; two markets |

### 18.2 Winning the brand SERP — the first battle

Because `finatrix.net` is an incumbent in the same vertical, brand capture needs **deliberate disambiguation**, not just time:

| # | Move | Effect |
|---|---|---|
| 1 | Populate `sameAs` with every owned profile | Ties entity to real corroboration |
| 2 | Create Wikidata entry | Machine-readable identity |
| 3 | Consistent "FinatriX" spelling everywhere (note internal capital X) | Reduces ambiguity |
| 4 | Own every profile using the exact name | Occupies page 1 |
| 5 | Publish under the brand consistently | Frequency of co-occurrence |
| 6 | Use "FinatriX — Smart Money Tools for India" as the standard descriptor | Distinguishes from advisory firm |
| 7 | Earn press using the full descriptor | Third-party corroboration |
| 8 | Consider `Organization` `alternateName` and explicit `description` disambiguation | Direct signal |

**Realistic expectation:** brand capture takes **2–4 months** with these moves, versus possibly never without them. The incumbent is not strong, but it is *present*, and presence beats absence.

### 18.3 Sequencing logic

1. **Crawlable before rankable** — nothing works before Stage 0.
2. **Brand before generic** — brand queries are the cheapest possible wins and build the entity Google uses to evaluate everything else.
3. **Long-tail before head** — 10 rankings for zero-competition terms beat 0 rankings for "sip calculator."
4. **Clusters before breadth** — depth in two topics beats shallowness in ten.
5. **Content before links** — outreach without content wastes the relationship.
6. **India before Australia** — prove the model, then port it.

---

## 19. Expected Timeline

Assumes consistent execution of §16. Ranges reflect genuine uncertainty — treat the low end as the plan.

### 19.1 Three months

| Metric | Expectation |
|---|---|
| Indexable URLs | 35–45 |
| Indexed URLs | 30–40 |
| Brand SERP | **#1 for "FinatriX"** (primary goal) |
| Non-brand keywords in top 100 | 30–60 |
| Keywords on page 1 | 3–10 (zero-competition long-tail only) |
| Monthly organic sessions | 200–800 |
| Referring domains | 10–25 |
| AI citations | Beginning — first Perplexity appearances |

**Month 3 is a technical and entity milestone, not a traffic milestone.** Judge success by indexation and brand capture.

### 19.2 Six months

| Metric | Expectation |
|---|---|
| Indexable URLs | 65–80 |
| Keywords in top 100 | 150–350 |
| Keywords on page 1 | 20–45 |
| Monthly organic sessions | 1,500–5,000 |
| Referring domains | 40–80 |
| AI citations | Regular for long-tail |
| Careers traffic share | 25–35% |

### 19.3 Twelve months

| Metric | Expectation |
|---|---|
| Indexable URLs | 150+ |
| Keywords in top 100 | 800–1,800 |
| Keywords on page 1 | 80–200 |
| Monthly organic sessions | 10,000–35,000 |
| Referring domains | 120–250 |
| Domain Rating (Ahrefs) | 25–40 |
| AI citations | Consistent across clusters |
| Knowledge Panel | Possible |
| Australia | Launched, early rankings |

### 19.4 Twenty-four months

| Metric | Expectation |
|---|---|
| Indexable URLs | 400+ |
| Keywords in top 100 | 4,000–9,000 |
| Keywords on page 1 | 400–900 |
| Monthly organic sessions | 60,000–200,000 |
| Referring domains | 400–800 |
| Domain Rating | 45–60 |
| Knowledge Panel | Expected |
| Category position | Recognised leader in career–finance intersection |
| Markets | India + Australia established |

### 19.5 Caveats

1. **YMYL slows everything.** Finance sites take longer to earn trust than SaaS or e-commerce. Add ~30% to typical timelines.
2. **Two prior domain migrations** (`.online`, `.space` → `.co`) mean little inherited equity.
3. **Content quality dominates.** These numbers assume genuinely useful, expert-reviewed content. Thin AI-generated content will underperform them badly and may trigger a site-wide quality issue.
4. **Brand capture is the gate.** If "FinatriX" is not won by Month 4, revisit §18.2 before proceeding.

---

## 20. Final Launch Readiness for SEO

### 20.1 Verdict

## 🔴 **NOT READY FOR SEO LAUNCH**

The product may well be ready. **The search surface is not.** Launching marketing spend against the current site would send traffic to pages that no search engine or AI assistant can read, index, or cite.

### 20.2 Readiness scorecard

| Dimension | Status | Blocker |
|---|---|---|
| Crawlability | 🟢 Ready | `robots.txt` correct, all crawlers allowed |
| **Renderability** | 🔴 **Blocked** | **Zero SSR body content** |
| Indexability rules | 🟢 Ready | Allowlist architecture is correct |
| Metadata | 🟢 Ready | Excellent, verified live |
| Canonical | 🟢 Ready | Single source of truth |
| Structured data | 🟡 Partial | Valid, but describes empty pages |
| **Content** | 🔴 **Blocked** | **~20 crawlable words site-wide** |
| **Brand entity** | 🔴 **Blocked** | **Name lost to `finatrix.net`; `sameAs` empty** |
| **E-E-A-T** | 🔴 **Blocked** | **No author, credentials, or about page on a YMYL site** |
| Internal linking | 🔴 Blocked | No links exist |
| Sitemap | 🟡 Partial | Correct but covers 10 URLs |
| Performance | 🟡 Unverified | Needs field CWV data |
| Security | 🟢 Ready | Exemplary |
| Accessibility | 🟡 Unverified | Needs audit against WCAG 2.2 AA target |
| AI readiness | 🔴 Blocked | Uncitable |
| Analytics | 🟡 Unverified | Confirm GSC + Bing verified |

### 20.3 Minimum bar to declare "SEO launch ready"

All ten must be true:

1. ✅ Every public URL returns meaningful HTML content **without JavaScript**
2. ✅ Each of the 7 calculators carries ≥600 words of genuine explanatory content
3. ✅ Every public page has exactly one descriptive `<h1>`
4. ✅ `/about`, `/methodology`, `/editorial-policy` live with a **named, credentialed author**
5. ✅ `sameAs` populated with every owned, live profile
6. ✅ ≥20 internal contextual links across the site
7. ✅ Sitemap covers every indexable URL and updates automatically
8. ✅ Google Search Console + Bing Webmaster Tools verified, sitemap submitted
9. ✅ Visible FAQ sections live, **then** `FAQPage` schema added
10. ✅ Core Web Vitals passing on mobile field data

**Estimated time to clear the bar: 4–6 weeks of focused work.**

### 20.4 Closing assessment

FinatriX's SEO foundation is, in the parts that were built, **better than most funded startups ever achieve**. The canonical architecture, the edge metadata rewriting, the deliberate refusal to emit `FAQPage` schema without visible FAQ content, the correct reasoning about `noindex` versus `Disallow` — this is the work of someone who understands search deeply.

That makes the diagnosis unusually clean. This is not a site with confused architecture and scattered problems. It is a site with **one problem, stated three ways**: there are no words on the pages. Everything in §8 either is that problem, or is downstream of it.

The metadata layer is a beautifully addressed envelope. The task now is to write the letter.

**Recommended immediate sequence:**

1. **Week 1** — Populate `sameAs`; register every social profile; create Wikidata entity. *(Cheapest high-impact work available; hours, not days.)*
2. **Weeks 1–3** — Prerender all routes to real HTML.
3. **Weeks 2–4** — Write and ship prose + FAQ for all 7 calculators; build `/about` and `/methodology`.
4. **Weeks 4–6** — Launch `/learn`; publish first 10 cornerstone guides.
5. **Month 2+** — Execute §16 without interruption.

The gap between this site and a category leader is **content and time**. Both are within reach, and the hardest engineering is already done.

---

*Prepared as a strategic review. No implementation code included, per brief. All findings verified against source at `/Users/hrishikks/Downloads/app` and live production fetches on 1 August 2026. Keyword volumes and difficulty ratings are directional estimates and should be validated in Ahrefs or Semrush before resource allocation.*
