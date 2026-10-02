# FinatriX — financial-wording and developer-account review package

**Prepared 2026-10-02** for a qualified reviewer. This is an engineering
inventory of what the product says and where, not legal advice: every
conclusion below that would decide whether wording is lawful in a market is
marked **LEGAL REVIEW REQUIRED**.

Markets the product ships packs for: India (primary), US, UK, UAE, Australia,
Singapore, Mainland China. App Store and Play listings are global.

## 1. How the product frames itself today

| Surface | Wording | Location |
|---|---|---|
| Store listings (both) | "FinatriX is an educational tool, not a bank, broker or registered financial adviser. Figures are estimates based on your inputs and stated assumptions." | `docs/APP_STORE_SUBMISSION.md` §4, `docs/ANDROID.md` §7 |
| Every calculator | "Educational tool · not financial advice" line under each tool | `src/tools/ui/ToolEducation.tsx` |
| Every result | Methodology drawer: "This is an educational model, not financial advice, and none of it is personalised to your circumstances." | `src/tools/ui/ResultExplainer.tsx` |
| Learn hub | "Nothing here is financial advice, and no specific fund, bank or product is ever recommended." | `src/learn/LearnHub.tsx:78` |
| Editorial standards | "Nothing is recommended" card | `src/pages/marketing/EditorialStandards.tsx:41` |
| FinatriX AI | System prompt: educational, never names a security, fund, policy or product to buy or sell; must say it is not a licensed adviser if asked for personal investment advice | `src/tools/ai/prompts.ts:118` |
| AI numbers | Model may not author figures; every figure comes from the app's own calculators | `src/tools/ai/grounding.ts`, `src/tools/ai/context.ts` |

No brand, fund house, bank or named product is recommended anywhere in the
tools. Instrument examples are asset categories only (e.g. "Large-cap MF,
Nifty 50 index, ELSS").

## 2. Inventory by category

Categories: **E** educational · **G** general information · **P** personalised
calculation · **AI** AI-generated · **C** potential financial-advice concern.

### Highest scrutiny (C) — LEGAL REVIEW REQUIRED

| # | What | Why it needs review | Location |
|---|---|---|---|
| C1 | **InvestMatch**: a six-question questionnaire (age, income, monthly amount, risk appetite, horizon, goal) that outputs an "illustrative allocation" split by asset class with per-month amounts, and a projected future value at an assumed return | A risk-profiling questionnaire producing an asset allocation for the user's own money is the closest thing in the product to personal investment advice (SEBI Investment Advisers Regulations; ASIC personal vs general advice; FCA COBS perimeter; SEC/FINRA "recommendation"). Mitigations in place: "illustrative" throughout, horizon caps the risk band and says why, no products named, methodology drawer | `src/tools/pages/InvestMatchPage.tsx:211,243,259`; `src/tools/lib/investmatch.ts:143–168` |
| C2 | **ParkSmart**: ranks named product *types* (money market fund, notice account, Cash ISA, Premium Bonds, FDs…) by post-tax return for the user's amount, labels the leader "Highest post-tax return", and offers "One way to split it" with specific amounts | Ranking financial products for a user's own sum, with a highlighted winner and a split, may read as a recommendation. Mitigations: "compares modeled earnings; it does not assess provider safety or suitability", deposit-protection note, rates marked indicative | `src/tools/pages/ParkSmartPage.tsx:244,260`; market packs `src/tools/lib/markets/*.ts` (`park.instruments`) |
| C3 | **Goal Planner** paths: "Aggressive / Moderate / Conservative path … What a mix like this typically holds (examples to research, not a recommendation): Small-cap MF, mid-cap MF…" with assumed returns of **14% / 12% / 8%** a year (India pack) | Asset-class examples tied to a required monthly SIP; the India assumptions are high relative to other packs (US 10/7.5/5, UK 9.5/7/4.5) and a reviewer may question their basis | `src/tools/pages/GoalPlannerPage.tsx:241`; `src/tools/lib/goals.ts:35–37`; other packs `src/tools/lib/markets/{gb,us,ae}.ts` |
| C4 | **LifeMap** decision "Start SIP of £4K/mo — For example, ~30% of surplus into a low-cost index fund" | A suggested proportion and product type for the user's surplus | `src/tools/lib/lifemap.ts:96` |
| C5 | **Store copy**: "Plan goals you can actually hit" (description and promotional text) | An outcome claim in marketing; the in-app copy is careful that returns are assumptions | `docs/APP_STORE_SUBMISSION.md` §2, §4; `docs/ANDROID.md` §7 |

### Medium — confirm wording (G/E with directive phrasing)

| # | What | Location |
|---|---|---|
| M1 | Learn table "The answer by type of debt" with a **Verdict** column: "Prepay. Nothing competes.", "Prepay in almost every case.", "Usually prepay; the gap to expected returns is thin." | `src/content/loans.ts:192–198` |
| M2 | "Clearing a card balance is a guaranteed return at the card's rate, which outranks any investment decision you could make." | `src/content/debt.ts:131` |
| M3 | Prepayment described as a "guaranteed return" (economically accurate: avoided interest) | `src/content/loans.ts:138,140,148,273` |
| M4 | LifeMap trap "Trade F&O / meme coins — 90%+ of retail F&O traders lose money — SEBI data 2024" is shown in **every** market, including UK/US where SEBI data is not the local evidence | `src/tools/lib/lifemap.ts:141` |
| M5 | Budget Builder pill "Recommended: 50 / 30 / 20" (a budgeting rule of thumb) and dashboard panel title "Recommended next" (in-app next steps, not products) | `src/tools/pages/BudgetPage.tsx:547`; `src/tools/pages/DashboardPage.tsx:162` |
| M6 | PeerCompare "Illustrative benchmark score" against model reference values; repeatedly says it is not a percentile | `src/tools/pages/PeerComparePage.tsx` |

### Changed in this pass (please confirm)

| What | Before | After | Location |
|---|---|---|---|
| Dashboard suggestion when a goal exists but no InvestMatch run | "Put your goal on autopilot — Match a portfolio to reach it faster." | "See how a goal could be invested — Compare illustrative investment mixes for your timeline." | `src/tools/lib/dashboard.ts:494` |
| Dashboard journey detail for InvestMatch | "Match a portfolio to your risk" / "<profile> portfolio" | "Illustrate a mix for your risk" / "<profile> illustration" | `src/tools/lib/dashboard.ts:420` |

No formula, rate or assumption was changed (calculation parity suites unchanged).

### Low risk (E / G / P) — no action proposed

Budget Builder, Expense Tracker, Net Worth, Reports and Calendar compute the
user's own records with no product or allocation output (P). Learn articles
explain formulas with worked examples (E). FinatriX AI answers are grounded in
the app's own figures and refuse to name products (AI).

## 3. Apple: Individual developer account and Guideline 5.1.1(ix)

FinatriX is enrolled under an **Individual** Apple Developer Program membership
(Team `AY79GYWLDP`, "Hrishik KS"). Guideline 5.1.1(ix) says apps offering
services in highly regulated fields — it names banking and financial services
among them — should be submitted by a legal entity that provides those
services, not by an individual developer.

| Consideration | FinatriX |
|---|---|
| Moves money, holds deposits, lends, brokers, trades, or connects to accounts | No — none of these |
| Collects bank credentials / account numbers | No — statement import reads files on-device; account numbers never leave the device |
| Provides calculators, budgeting and education | Yes |
| Outputs that a reviewer could read as investment advice | InvestMatch allocation (C1), ParkSmart ranking (C2), Goal paths (C3) |

**Risk:** a reviewer who classifies InvestMatch/ParkSmart as financial services
can reject under 5.1.1(ix) regardless of the disclaimers. Budgeting apps from
individual developers are common on the store, so the outcome is not certain
either way. **LEGAL REVIEW REQUIRED / OWNER DECISION** between:

1. Submit as Individual with App Review notes stating plainly that FinatriX
   provides no financial services (no transactions, accounts, lending, trading
   or advice) and is an educational calculator suite — the current plan.
2. Enrol an organisation (needs a legal entity and a D-U-N-S number) and
   transfer the app before submission.
3. Reduce the C1/C2 surfaces in the App Store build (a product decision).

## 4. Questions for the reviewer

1. In each market, is InvestMatch's output (C1) personal advice, general
   advice/information, or neither, given the current disclaimers?
2. Does ParkSmart's ranking with a highlighted leader (C2) require a licence or
   different framing in India, the UK or Australia?
3. Are the India Goal Planner assumptions (14% / 12% / 8%) defensible as
   "illustrative", or should they be sourced or lowered? (Changing them is a
   calculation change and would be done separately, with parity tests updated.)
4. Is the store phrase "goals you can actually hit" acceptable?
5. Is the disclaimer wording sufficient and placed prominently enough?
6. Individual vs organisation Apple account (§3).
