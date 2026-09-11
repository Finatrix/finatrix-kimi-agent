# FinatriX product upgrade — 11 September 2026

## Requested scope

Reduce the generic, templated appearance and introduce a unified finance dashboard, guided onboarding with chat help, recurring-payment detection, monthly financial reviews, goal trade-offs, scenario comparison, an emergency-fund planner, privacy controls, clearer trust information and sharper positioning.

## Delivered behaviour

| Area | Where to find it | Behaviour |
| --- | --- | --- |
| Product positioning | `/` | A specific explanation of budgeting, spending and planning; dashboard and setup entry points; an explicitly illustrative financial example; clear separation of free finance tools and paid Careers. |
| Visual refinement | Homepage and dashboard | Removed the decorative tool constellation and repeated promotional tiles from the opening section. Calmer typography and layout, simpler tool listings, less dominant scoring and more direct action labels. |
| Unified dashboard | `/tools/dashboard` | Existing budget, spending, investment, goal and net-worth summaries, with direct navigation to the new review, recurring-payment and emergency-fund sections. Optional tool exploration and getting-started instructions remain available. |
| Guided onboarding | `/welcome` | Income, optional planned emergency contribution, explicit market choice and optional goal. Existing saved budgets and goals survive repeat setup. No invented age or automatically created investor profile. |
| Setup chat help | Dashboard chat, or `/tools/dashboard?help=setup` | Written guidance for setup, imports, emergency funds, goal comparisons and privacy. Works for guests without sending an AI request. Signed-in AI questions continue through the existing service. |
| Monthly review | Dashboard → Monthly financial review | Select a month, see recorded spending separately from savings/investments/transfers, compare with the preceding month when both have entries, save a next-month note and mark the month reviewed. Missing records and incomplete current-month totals are identified. |
| Recurring payments | Dashboard → Recurring payments | Reuses the existing detector, excludes savings/investment transfers, future charges and stale patterns, preserves display names, and offers persistent confirmation, dismissal and restoration. Estimates are labelled as possible patterns, not scheduled bank payments. |
| Goal trade-offs and comparison | Goals → Calculate → Compare the trade-offs | Compare the original with an alternative target, deadline and starting balance across the existing return paths. An optional monthly contribution limit shows room remaining or a shortfall. Comparing never overwrites the original goal. |
| Emergency fund | Dashboard → Your emergency fund | Essential costs, chosen coverage, accessible savings and contributions produce a target, remaining gap, present coverage and timeline. Plans are stored separately for each display currency. |
| Privacy centre | Settings → Privacy control centre | Device-level optional analytics opt-out respected by finance and Careers; browser privacy signals respected; local chat-history removal; finance backup and clear-data controls; explicit account-deletion contact and sharing boundaries. |
| Trust information | Homepage, dashboard, Settings, Editorial Standards | Links to the real published contact, methodology, sources and privacy information. No invented testimonials, user counts, founder identities or professional qualifications. |

## Calculation and data safeguards

- Existing calculation engines and financial assumptions are unchanged.
- Dashboard goal and investment summaries now pass the selected market's existing assumptions into the same functions their tools use. Previously the dashboard implicitly used India defaults.
- Dashboard Net Worth uses the same foreign-currency converter as the Net Worth page. Previously foreign-account amounts could be added without conversion.
- Dashboard labels distinguish budgeted income, planned savings and recorded spending. Income less spending is explicitly before savings and transfers.
- Goal alternatives call `computeGoalPlanner` with the original inflation setting and the selected market's return paths. They do not change either set of assumptions.
- The new reserve planner uses: target = essentials × months; gap = max(0, target − accessible savings); timeline = ceil(gap ÷ contribution). There is no assumed investment return. Zero costs, zero contributions and already-funded targets have explicit states.
- Monthly review totals use `splitOutflow`, including refund handling and the existing category classification. Each month uses its own category arrangement.
- `fx_planning` stores currency-scoped review notes, recurring-payment choices and emergency-fund inputs. It participates in the existing authenticated finance sync, backup and reset paths. No database migration is needed for the JSON payload.
- Setup seeds only a missing budget month and a missing goal. Existing financial inputs are preserved.
- Resetting finance data uses the storage wrapper so in-memory fallback data is cleared and the existing sync mechanism sees the change. The UI explains that signed-in clearing also propagates to the account when connected.
- A pending quick-add feedback timer is now cancelled on unmount; the regression run exposed its update after teardown.

## Privacy and feature boundaries

- Recurring detection is based on user-entered or imported records. It neither connects to a bank nor cancels, creates or schedules payments. Confirmation affects the new dashboard list; it does not rewrite transaction flags or the existing Expenses commitment calculation.
- Reviews reflect recorded entries, not a guarantee of complete bank activity. Comparisons use full recorded monthly totals and say so; they are not normalised to equal elapsed days.
- Goal comparison is an exploratory view. The optional contribution limit is entered by the user; it is not an inferred safe-to-spend balance or an automatic allocation among multiple goals.
- Guest finance records remain local. Signed-in financial planning data uses the existing cloud sync. Written setup responses are local; AI requests send the question, conversation context and relevant financial context through the existing AI service.
- The analytics control governs optional product usage analytics. Required account, security and billing records are separate. An opt-out clears queued unsent analytics and prevents new finance and Careers usage events.
- Clearing browser chat history does not delete records already held by external service providers. Clearing finance data does not delete the account or Careers records; the privacy centre directs those requests to the published support address.
- No claim of universal zero defects is made. Live authenticated provider calls, account deletion processing, real billing and cross-device cloud sync require their own authenticated service verification.

## Verification

- Production build and lint: passed.
- Unit/component suite: 170 files passed; 2,748 tests passed and 15 existing tests skipped.
- New desktop/mobile workflows and finance accessibility floor: 44 passed.
- Responsive finance layouts (320–1440 px) and homepage performance budgets passed in the broader targeted run.
- Production dependency policy check passed, retaining the repository's existing documented `xlsx` exception.
- Wrangler deployment dry run passed.
- Full browser regression suite: all 1,034 tests passed across desktop and mobile (3.8 minutes).
- Production release verification: passed. All 145 sitemap URLs are live, indexable and self-canonical; redirects, HSTS, robots, JSON-LD, real 404s, social image, icons, auth landing targets, five edge-function CORS checks and frontend service configuration passed.

## Release

- Published to `finatrix-co`, serving `finatrix.co` and `www.finatrix.co`.
- Cloudflare version: `9cc00958-eb08-4f1c-9a8d-8315321aea7f`.
- Prior version for rollback: `7cdcb186-64de-4b70-816d-fba13d3fcc2b`.
- Published entry bundle: `/assets/index-CKAqyERt.js`, verified to match the local tested build.
- Live homepage visually inspected after publishing.
- Existing remote environment variables were preserved with `--keep-vars`. No backend functions or database migrations were deployed as part of this upgrade.

The original workspace contained extensive uncommitted work. It has been preserved; this report describes this upgrade rather than attributing the entire working-tree diff to it.
