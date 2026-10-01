# FinatriX: smart assistance across the finance workspace

Release date: 18 September 2026. Careers excluded from this upgrade.

The release adds practical assistance to all eight finance tools and the five supporting workspace screens. Calculations continue to use the existing engines. Assistance can check inputs, find an option within the existing model, explain a difference, prepare an export, or preview a reversible change. It does not silently change financial assumptions or claim to predict an individual's future.

## Delivered capabilities

| Tool or screen | Upgrades delivered |
|---|---|
| **Budget Builder** | Ranks gaps between the current month's plan and logged spending; opens the exact allocation needing attention; previews matching observed amounts; allocates a user-chosen remainder with a before/after preview; undoes smart changes while preserving subsequent manual edits. |
| **Expense Tracker** | Identifies possible duplicate records; flags invalid or future dates; checks amounts while respecting negative refunds; identifies categories outside the selected month's plan; provides filtered, expandable review queues linked to the original entries. Existing automatic category suggestions and natural-language entry remain available. |
| **InvestMatch** | Explicitly reviews and reuses saved answers for the same market/currency; checks every input without silently clamping it; compares lower/current/higher contributions; compares existing investment horizons; explains the result and points to relevant planning tools. Back navigation preserves valid edits. |
| **ParkSmart** | Reviews saved inputs with their currency/market; accepts clearly named user-entered rate quotes where required; filters for liquidity and handles no eligible options; shows the earnings/access/tax trade-offs between alternatives; explores other holding periods without replacing the saved base inputs. |
| **PeerCompare** | Reviews saved figures; checks savings-rate consistency against entered cash flow; lets users explicitly adopt the implied rate; explores location/measure comparisons; requires compatible currency and labels model scores as illustrative. In AU/SG/CN, assistance instead checks population/definition/period, builds a matching figure from components, compares its difference from a published median, compares a second figure, and links to an appropriate personal planning tool. No invented population percentile. |
| **Reverse Goal Planner** | Searches every supported whole-year deadline for a user-entered monthly limit; shows the earliest fit under each existing return path; applies a chosen deadline; reveals the full 10% annual contribution step-up and when it exceeds the limit; exports the plan and yearly schedule in the selected currency. |
| **LifeMap** | Refreshes saved source inputs with their provenance; checks inputs that the legacy model would otherwise replace or clamp; pins a scenario for comparison across ages; finds the first modelled age reaching a target; ranks untried decisions by their effect within the existing illustrative model. Net Worth seeds use the existing currency converter. |
| **Net Worth** | Prioritizes the oldest carried-forward balances; opens the next account to update; explicitly confirms an unchanged native-currency balance with undo; flags possible duplicate accounts; explains signed account movements using the existing totals and display exchange rates. |
| **Reports** | Reviews readiness for the exact selected month; finds the latest month containing both sources; checks invalid amounts, dates, categories and budget splits; lets users select which reports to export; rechecks and freezes the chosen payloads before generating files. |
| **Calendar** | Searches and filters events by type/day/upcoming status; summarizes remaining outflows and busy days without treating goal milestones as spending; remembers a preferred investing day with correct month-end clamping; anchors goal dates to the recorded plan date and supports distant-month navigation; exports only visible events with stable identifiers and explicit currency. |
| **Dashboard** | Resumes the last recognized tool; searches the finance workspace; filters saved/not-started/review states; opens a live queue of missing monthly records. Incomplete investment and LifeMap inputs no longer generate apparently complete projections. |
| **Settings** | Diagnoses saved formats and missing monthly records; links to the tool needing review; records when a backup download was requested; exports an amount-free diagnostic file. Live warnings distinguish persistent records from recent writes held only in memory. |
| **Reference** | Filters by market and topic; searches official authorities and rule descriptions; checks review dates automatically; filters sources due for review. Date handling rejects impossible dates and counts civil days correctly across daylight-saving changes. |

## Accuracy and reliability fixes

- The calculator engines for Budget, Expenses, InvestMatch, ParkSmart, PeerCompare, Goals, LifeMap and Net Worth were not changed. Existing calculation-parity tests remain part of the release checks.
- Known market/currency mismatches and incomplete InvestMatch answers are excluded from shared projections. Complete older investment records remain compatible but have unverified provenance; Calendar labels them for review.
- Foreign-currency Net Worth balances are converted before filling LifeMap fields, using the same conversion rules as the balance sheet.
- Legacy PeerCompare scores no longer imply measured population ranks. Both rendered and crawler-visible explanations describe the actual age-band/location model.
- Calendar goal dates remain stable, leap-year/month-end dates are handled, goal targets are excluded from outflow summaries, and exported bill IDs no longer depend on sorting order.
- Reports no longer silently substitute another month's budget. Exports use the reviewed period and report currency.
- Refunds remain valid negative entries. Review hints beyond the first 20 are accessible without changing legitimate records.
- A storage-quota failure now produces an accurate warning about recent memory-only edits. The existing storage and synchronization behavior is preserved.
- Fixed invalid calendar accessibility roles and low-contrast expense insight titles. Added narrow-screen checks for the new assistance and reviewed desktop/mobile rendering.

## Release evidence

- Full unit/integration suite: **3,418 passed, 14 existing skips, 198 files passed**.
- Full lint, TypeScript and production build passed. The original financial engine files have no changes.
- Full browser regression run: **1,172 cases**, with **1,164 passing initially**. Eight PeerCompare explanation checks needed to follow the new explicit native-currency safeguard; their helper now performs that review. The final affected-flow rerun passed **all 184 checks**, covering those eight, result explanations, new smart assistance, the finance accessibility floor, responsive layouts and seven-market behavior. There are no unresolved failures from this release run.
- Desktop and mobile checks cover the new assistance, accessibility rules, responsive layouts, result explanations and market-specific behavior. Budget preview rendering was also visually inspected on desktop and mobile.
- Production dependency audit passed its policy: no unreviewed high/critical advisories. The pre-existing `xlsx` exception remains; this is not a claim of zero dependency vulnerabilities.
- Backend verification passed: all 10 required relations present, anonymous analytics ingestion accepted, deployed function source matches the repository. No backend or Careers change was deployed as part of this release.
- Production deployment and live verification were completed by **GPT-5.6 Sol** as requested. **All 30 live browser checks passed** across desktop Chromium and mobile emulation.

## Production deployment

- Live site: [finatrix.co](https://finatrix.co).
- Cloudflare Worker: `finatrix-co`; dry run and deployment succeeded.
- Active version at 100%: `9284e248-68b8-4217-85af-808faae963a4`.
- Previous version: `13c2c8a7-dad3-4223-8a9c-fb794c251a92`.
- Live entry asset: `/assets/index-CP2lC6fr.js`, 327,231 bytes, byte-identical to the tested local build.
- Asset SHA-256: `6cf6a9e5cb30b3f14055410016c23e414766762e9d9694a283eba8e5475b2910`.
- Production verification passed: HTTPS/www redirects, HSTS, robots, all 140 sitemap URLs and their canonical/indexing metadata, structured data, genuine 404 responses, social preview image, favicons/manifest icons, authentication redirects, all five tested function CORS responses, and production frontend configuration.
- No unresolved test or deployment failures remain from this release. No database migration or Careers deployment was required.

## Practical limits

This is explainable assistance driven by saved records and existing educational models. It is not a bank connection, a verified provider debit schedule, a guarantee of financial outcomes, or an independent validation of the original models. Pattern matches are review hints; legitimate duplicates remain possible. Older saved records can lack complete market/currency provenance. Reference review dates do not fetch live rules or rates.

Automated checks establish behavior in the tested cases, not that every possible defect is absent. Browser checks use Chromium desktop and mobile emulation; they do not certify every browser, assistive technology, real device, or authenticated cloud-sync journey.

The [competitor assessment](sitewide-competitor-assessment-2026-09-18.md) provides the weighted product-maturity score, official sources, and the next five priorities.
