# FinatriX finance: competitor assessment

Assessed 18 September 2026. Careers excluded.

**Provisional product-maturity score: 68/100 — a useful educational finance workbench with material gaps before it can be called a leading automated personal-finance platform.** This is an editorial assessment of the current implementation, not a measured financial-accuracy rate, independent certification, or customer-satisfaction score. More features alone do not establish greater intelligence.

## Evidence and limits

FinatriX evidence comes from the current workspace: the finance pages, `BudgetSmartReview`, `NetWorthSmartReview`, `GoalSmartAssist`, `LifeMapSmartAssist`, `planningAutomation`, `comparisonAssist`, `reportsSmartReview`, and `workspaceReview`. Review confirms actionable assistance across the tools: spending-gap previews and undo, stale-balance queues, scenario comparisons, contribution-fit searches, planning-date controls, export checks, and explicit reuse of saved inputs.

The final unit/integration suite passed 3,418 cases across 198 files, with 14 existing skips, including the original calculation-parity checks. Parity establishes consistency with the original engines; it does **not** independently validate every assumption or demonstrate that a projection predicts real financial outcomes. Browser, accessibility, deployment, and production findings are documented in the [release evidence](sitewide-smart-automation-release-2026-09-18.md). These checks strengthen implementation confidence; they do not substitute for independent financial review or observed user outcomes.

The assessed release is now live at [finatrix.co](https://finatrix.co), version `9284e248-68b8-4217-85af-808faae963a4`. All 30 live desktop/mobile checks passed, and its entry bundle matches the tested build byte for byte. The maturity score remains 68/100 because the missing capabilities and independent-evidence gaps below remain material.

Competitor capabilities below were checked against official public documentation on the assessment date. No paid competitor accounts, bank connections, mobile applications, or end-to-end workflows were tested. Availability can depend on region and subscription. “Not established” means the reviewed evidence does not substantiate a claim, not that a feature cannot exist. No competitor numeric scores are assigned.

## Capability comparison

| Product | Data and routine automation | Planning capabilities | Collaboration and practical implication |
|---|---|---|---|
| **FinatriX, implemented** | Manual/file-based finance records; category suggestions; validation, source reuse, review queues and export preparation; no bank connection | Budget and balance reviews; three goal return paths; earliest contribution-fit deadlines; step-up schedules; illustrative LifeMap comparisons; calendar estimates and ICS export | Local guest use and account sync; household permissions not established. Strong educational breadth, with continued user responsibility for completeness. |
| **YNAB, published** | Automatic transaction import and device sync; automatic initial targets can use 90 days of spending during eligible first-plan mobile onboarding | Savings targets, loan-payoff calculations, spending and net-worth reports | Subscription sharing for up to six people. Sets a benchmark for reducing routine setup and sustaining budgeting habits. [Features](https://www.ynab.com/features), [automatic targets and their limits](https://support.ynab.com/en_us/does-ynab-create-targets-automatically-HJ4k1nBWfg). |
| **Monarch, published** | Connected accounts, transaction review, categorization and recurring-subscription detection | Goals can receive account allocations and track progress automatically; customizable financial reporting | Partner/advisor collaboration and web/mobile access. FinatriX lacks comparable verified connected-household workflows. [Product capabilities](https://www.monarch.com/), [goal planning](https://www.monarch.com/features/planning). |
| **ProjectionLab, published** | Explicitly offers planning without linking bank accounts; progress tracking against projections | Historical backtesting, configurable Monte Carlo trials, tax estimates, drawdown and contribution strategies, international presets | Couple planning and advisor offering. FinatriX’s fixed illustrative LifeMap paths do not match this modelling depth. [Product](https://projectionlab.com/), [simulation details](https://projectionlab.com/monte-carlo). |
| **PocketSmith, published** | Bank feeds, multicurrency accounts and daily exchange-rate conversion | Calendar budgets, what-if scenarios and daily-balance projections up to 60 years; cash-flow and net-worth reporting | Shared account access and scheduled summaries. Its account-linked cash forecasting is substantially broader than FinatriX’s estimated-event calendar. [Official capabilities](https://www.pocketsmith.com/features/). |

These are capability comparisons, not evidence that any competitor’s forecasts are more accurate. Competitor marketing claims have not been independently verified.

## Weighted FinatriX score

Each row awards points against the stated maximum; the maximums sum to 100.

| Dimension | Awarded / maximum | Basis and remaining gap |
|---|---:|---|
| Calculation traceability and input integrity | 19 / 25 | Existing engines reused, parity checks, disclosures and guards; independent model validation and complete data lineage remain incomplete. |
| Useful automation | 14 / 20 | Reviewable actions throughout finance tools; data collection, reconciliation and recurring follow-through still require substantial input. |
| Planning depth | 11 / 20 | Useful goal/amount/deadline comparisons; limited uncertainty, tax, multi-goal and account-level cash-flow modelling. |
| Usability, accessibility and portability | 12 / 15 | Labelled controls, reusable layouts, keyboard interactions, exports and automated browser checks; observed user task completion and independent assistive-technology testing still needed. |
| Data integration and continuity | 6 / 10 | Shared saved records, account sync and backups; bank feeds, household roles and comprehensive reconciliation absent or unestablished. |
| Operational and trust evidence | 6 / 10 | Defensive checks and documented sources; this assessment establishes neither independent security assurance nor sustained production reliability. |
| **Total** | **68 / 100** | **Provisional; reassess with release evidence and real-user outcomes.** |

## Five priorities for exceptional quality

1. **Make every important number auditable.** Show source, currency, market, observation date, completeness and assumption version; trace results to inputs. Target: every displayed projection has a reproducible explanation, and stale/missing data never silently appears current.
2. **Build reconciled, optional data automation.** Improve reviewed imports, transfer/refund matching and statement reconciliation; evaluate consent-based read-only bank feeds while retaining manual use. Target: detect unexplained balance differences and measure correction rates against representative statements.
3. **Introduce independently validated scenario modelling.** Add separately reviewed uncertainty, inflation, tax and interacting-goal models with reproducible assumptions. Preserve existing formulas unless explicitly authorized. Target: documented benchmark agreement and clear separation of facts, estimates and unknowns.
4. **Support coordinated household decisions.** Add scoped partner/advisor access, shared goal allocations, change history and reversible approvals. Target: prevent the same savings being committed twice and prove permission boundaries in tests.
5. **Prove smoothness and trust continuously.** Measure real task completion, keyboard/screen-reader journeys, mobile responsiveness, sync recovery and service reliability; run restore drills and independent security review. Target: publish measured results and fix the highest-impact failures first.

“200/100” and “100 years ahead” are aspirations, not defensible ratings. The strongest differentiation would be reliable automation that explains its evidence, preserves user control, and measurably reduces mistakes and effort.
