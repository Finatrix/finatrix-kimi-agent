# FinatriX intelligence upgrade — 12 September 2026

## Delivered behavior

- **Instant financial briefing:** open FinatriX AI and choose “Get my instant financial briefing”. The device interprets the existing financial engines’ results, prioritising recorded shortfalls, missing inputs, forecast risks, emergency-fund gaps and saved goal return paths. Each priority explains its evidence and a next step. Savings and transfers remain distinct from consumption.
- **Instant forecast explanation:** “Explain my month-end forecast” reports the existing engine’s estimate, history basis and historical error range. It does not turn that range into a probability, guaranteed maximum or confidence interval. Missing history is explicit.
- **Comparable periods:** “Compare this month to last month” compares transactions through the same calendar day in both months. When February is shorter, both windows stop at February’s final day. Closed months compare whole months. Empty windows and zero spending baselines do not generate a percentage trend.
- **Exact visual evidence:** AI-generated data tiles and chart points must cite a numeric path in the supplied snapshot, matching the value, sign and unit. Uncited or mismatched visuals are withheld. Day counts cannot validate percentages. Null, boolean and string values no longer silently become numeric evidence. Zero remains a valid amount.
- **More precise prose checks:** negative and zero currency amounts are checked; exact amounts use their written precision rather than an extra half-percent matching allowance. Conversation-history delimiters cannot close the prompt’s evidence blocks.
- **Selected-month awareness:** Budget Builder and Expense Tracker provide their selected month to nested assistant triggers, including categories, charts and transaction controls. The assistant reads that month’s categories and budget when asked.
- **Missing-data handling:** the untouched starter income is excluded from the AI and expense summary, following the dashboard's existing evidence rule. An empty month without useful forecast history no longer produces a zero-spending prediction. Expenses say “No budget set” when no plan exists and “days without entries” rather than claiming unrecorded days were spend-free.
- **Session isolation:** switching accounts resets the composer. Replies arriving after unmount or account changes cannot recreate an old transcript. A synchronous in-flight guard prevents duplicate sends before React updates.
- **Accessibility:** confidence labels and warning tiles use readable text colours. The briefing works in the existing keyboard-accessible dialog on desktop and mobile.

## Architecture and calculation preservation

`src/tools/ai/comparison.ts` builds matched calendar windows and delegates consumption/savings totals to `splitOutflow`. Its additional percentage comparison is `(current spending − previous spending) / previous spending × 100`, available only when both windows contain records and the previous spending baseline is positive. Existing dashboard totals and the legacy month-total comparison are retained unchanged.

`src/tools/ai/briefing.ts` interprets `FinanceSnapshot` and the saved plans already calculated by their owning tools. It adds no investment return assumption, tax rule, loan formula, scoring rule or new forecasting model. `budgetEvidence.ts` extracts the dashboard's existing starter-versus-recorded-input rule and shares it with the expense screen and AI context. The underlying calculation functions are unchanged; cash flow and scores now receive missing income rather than an unconfirmed starter amount. The streak count is unchanged; only its displayed description changed.

The storage format has no explicit income-confirmation flag. As in the existing dashboard, an income equal to the 50,000 starter value with no allocations is treated as unconfirmed. An allocation preserves that same income as recorded. Explicit confirmation metadata would remove this ambiguity in a future storage migration.

The local route recognises a small explicit set of whole questions, including “Summarise my month”. Compound questions, ambiguous follow-ups and focused questions continue through the existing authenticated server-side AI gateway. No API key is added to the browser, and no new dependency is introduced. Answers read fresh data for every question. Local answers identify their origin and describe record coverage rather than claiming model confidence.

Source checks prove that a visual’s value matches its cited numeric field; they do not establish that arbitrary model prose or labels are semantically correct. General educational responses still depend on the configured provider and have no live browsing. Historical error ranges retain the existing forecast engine’s limitations. The upgrade makes no model-superiority or future-performance claim.

## Verification

- Final full Vitest suite: **2,867 passed**, 14 existing skips, 174 test files; calculator parity and forecast backtests included. The empty-dashboard expectation was updated to the intentional “No budget set” wording.
- Full browser suite: **1,036 passed**, desktop Chromium and mobile emulation. After the missing-income and forecast fixes, **20 focused browser checks passed**. The final expense, AI and accessibility checks passed **52 tests** against a fresh production build. Final expense changes also passed **575 targeted unit and parity tests**.
- The new browser fixture intercepts every Supabase request, deliberately makes the AI endpoint unavailable, and verifies **zero AI requests** for the briefing. It checks WCAG 2.2 AA tags, viewport fit, keyboard close and absence of page errors. No real account or financial data is used.
- Strict ESLint gate passed after fixing a React memoization dependency warning.
- Production TypeScript/build verification and strict ESLint passed against the final application code.

## Authorized test-account verification

Signed into the supplied testing account through the local production frontend, connected to its existing backend. Credentials were not added to source or test fixtures. No financial records were deliberately changed, and no deployment was published.

- Authentication succeeded and existing saved records loaded.
- The saved goal's three contribution paths and assumed returns matched the Goal Planner's figures. Its AI tiles and chart passed numeric source checks.
- The configured AI correctly explained a hypothetical two-year annual-compounding example, with a clearly labelled illustrative chart.
- The historical-month trigger sent July's context: the AI reported the recorded rent transaction, recognised absent income and budget, and declined to infer a trend from an empty prior month.
- An empty current month initially exposed starter-income and zero-forecast errors. The corrected local briefing now asks for income and records, and withholds an unsupported forecast.
- The final expense view correctly retained the recorded transaction while withholding unsupported cash flow, overspend and score claims. The gap in logging was described as days without entries. Signed out after verification.
- The checked live replies produced no browser warning or error logs. These are bounded functional checks, not a benchmark of general model ability.

The shared checkout was committed by another task during implementation, incorporating part of this upgrade into commits `c16a127` and `3038911`. This task preserves those commits and the pre-existing edits; remaining work is in the working tree. This task did not publish a deployment or alter server model configuration.
