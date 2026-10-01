# Seven-market activation

12 September 2026 · application changes only; no deployment or Git operations.

All seven market settings now resolve to a local configuration: IN, US, GB, AE, AU, SG and Mainland CN. The new three are available throughout the tools. Their availability does not imply complete tax software, statutory retirement projections or observed peer percentiles.

## What changed

The previous market contract made a full instrument-rate table and city/age peer grid prerequisites for every tool. Those prerequisites do not apply to budgeting, expense tracking, goal arithmetic or net worth. The new configurations declare their cash-input and peer-context modes explicitly, with no inherited Indian grid and no fabricated current yields.

| Tool | Australia, Singapore and Mainland China |
| --- | --- |
| Budget Builder | Existing arithmetic with selected display currency; user supplies take-home amounts |
| Expense Tracker | Existing ledger behavior and display currency |
| ParkSmart | Two user-entered annual net rates and access conditions, using the unchanged simple-interest engine; zero must be entered explicitly |
| PeerCompare | Published dated summary points and an optional comparison of matching definitions; no percentile engine |
| InvestMatch | Shared authored educational asset-category examples with explicit 2%, 4%, 6% return scenarios and 2% inflation; no claim these are measured local returns |
| Reverse Goal Planner | Local configuration, generic editable goal examples, the same disclosed return scenarios and unchanged solver |
| LifeMap | Existing simulation, locally scaled starting income example and blank initial balance/expense fields; statutory entitlements and legacy Indian tax/fixed-price decision cards remain excluded |
| Net Worth | Local retirement-account labels; existing balance and currency arithmetic |

The existing four-market calculation paths and parity fixtures are retained. The new market configuration is English-language UI, with local number formatting and Mainland China scope; this does not claim a fully translated Chinese interface.

Both methodology surfaces now resolve from the same market-aware guide. ParkSmart outside India no longer presents India's 80TTA treatment as local law. New PeerCompare explanations describe published summaries instead of the legacy city model. INR worked examples elsewhere are explicitly labelled as illustrations rather than the selected market's inputs.

Settings, homepage examples, source-page availability and public market-coverage copy now include seven markets. Browser detection supports script subtags such as zh-Hans-CN. Hong Kong, Macau and Taiwan are not accepted as Mainland market codes. Active pages remount on a market or display-currency change so a result and rate input do not remain on screen under a different label. Existing saved financial records are not converted or overwritten by that operation.

## Published summaries and evidence

Four summary values are kept separately from the distribution dataset registry:

- Australia: 2019–20 median weekly gross household income and household net worth, ABS Tables 1a and 1b. These are historical, not current household benchmarks.
- Singapore: preliminary 2025 median monthly household market income, including non-employment income and employer CPF; covers resident households, including non-employed households.
- Mainland China: 2025 median annual per-capita disposable income; not median employee salary.

Each value has an exact release URL, stable source ID, table/paragraph locator, observation period, population, definition, attribution, reuse terms and verification date. The six archived source/terms files and SHA-256 manifest are in `docs/evidence/seven-markets-2026-09-12/`. The Singapore PDF was checked at printed pages 6 and 18–19. ABS release page retains both initial/revised publication labels; the registry uses the 25 May 2022 release timestamp, while the statistics remain 2019–20 observations.

ABS published tables are used under CC BY 4.0, Singapore's open data under Singapore Open Data Licence v1.0, and NBS website statistics with its required source acknowledgement. These permissions are scoped to the displayed published summary points, not a blanket microdata or yearbook licence. No agency endorsement is implied.

The optional comparison requires an explicit confirmation of population, definition and reference period. Values always display in the reference's own currency. No FX conversion, inflation uplift, city multiplier or percentile interpolation is performed.

## Preserved limits and report correction

Tax schedules remain context; statutory pensions and contribution engines remain disabled. UAE deposit-protection and CPI evidence gaps remain stated. There is no legitimate numerical guarantee to fill in solely to produce a green readiness count.

The supplied integration report said no percentile was computed. Inspection found `PeerComparePage` still displaying the legacy modeled-percentile result for the original four markets. This change does not certify that number as a statistical percentile or change its formula. The new markets never enter that engine. Replacing or relabelling the legacy scoring experience remains a separate product correction; the gate text now accurately names the distinction.

## Verification

See `seven-market-validation.md` for final checks. Tests cover the new market flows, blank versus zero rates, avoiding a second tax deduction, empty-ranking prevention, matching peer definitions, source identity, evidence checksums and exclusion of HK/MO/TW. Existing parity tests are unchanged. Browser checks cover all eight tools in all three new markets on desktop and mobile, plus the seven-option Settings picker and accessibility of the two new result flows.
