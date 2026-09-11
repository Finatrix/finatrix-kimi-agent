# FinatriX launch readiness — 12 September 2026

Scope: prepare the site for the beta launch — forecasting accuracy, the AI assistant's reliability and answer format, SEO for clients that do not run JavaScript, animation robustness. Earlier uncommitted work in the tree was preserved; this record covers only the changes below.

## What changed, why, and the effect

| Area | Problem found | Change | Effect |
| --- | --- | --- | --- |
| Month-end forecast | Day-to-day spending was projected from the current month alone, so one early purchase was multiplied by the days remaining and an empty day 1 projected nothing. | With two or more tracked months, the rate for the days ahead blends this month's pace with the user's typical month (weight on this month = days ÷ (days + 10)). Single purchases ≥ 20% of a typical month, and entries already dated later in the month, are counted once. A range is quoted after replaying the forecast on the user's own past months (≥ 3). No history → identical to the previous run-rate. | Replayed on simulated ledgers of six spender types, mean absolute error fell from 65% → 16% on day 1, 41% → 16% on day 3, 28% → 15% on day 7, 17% → 12% on day 14, 7% → 6% on day 25; bias within ±1.5%; the range held the outcome 67–74% of the time. Pinned by `forecastBacktest.test.ts`. |
| Budget timeline | Projected rent and savings transfers as if they accrued daily, contradicting the forecast card directly above it (a user who paid rent and a SIP on time was told they would finish far over budget); rent day was flagged as "unusually high"; the pace line called an on-time rent payment "ahead of pace". | The Expenses timeline now measures spending against the spending plan (savings excluded), steps the plan line up on each bill's due day, uses the forecast's own projection, and judges anomalies on day-to-day spending only. The AI's timeline view uses the same inputs. | The chart and the card give one month-end figure. False over-budget and anomaly signals for on-time bills are gone. |
| Dashboard goal card | Showed the Aggressive path's (14% return) monthly amount alone, as if it were the plan. | Shows the range across all return paths, labelled as depending on the path chosen. | No longer understates the monthly amount most people need. |
| AI grounding | The assistant was told to use only the user's figures, but nothing checked; charts were drawn in the user's currency unverified. | Every currency amount in a data answer is checked against the data it was given (to its written precision, capped at 5%), or must be one arithmetic step from grounded numbers on the same line. Unmatched amounts are named under the answer; charts and figure tiles with values outside the data are withheld. | A randomly invented amount passes by coincidence 6.8% of the time against a realistic snapshot, so about 93% of fabricated figures are caught and labelled. |
| AI context | The assistant saw one month of the ledger only. | It now receives the saved goal (every return path with its assumption), net worth, investing plan and emergency-fund plan — each computed by that tool's own engine — plus the forecast's range and a computed savings rate. | "Can I afford…", "what should I prioritise" and "am I on track" are answered from the whole picture. |
| AI answer format | Answers ran long, in paragraphs. | New answer shape: one-sentence headline, up to four figure tiles, 2–5 short bullets or a table, and a bar, line or donut chart; long answers collapse behind "Show the full answer". General explanations may use a chart only as a labelled illustration, never in a currency. Stricter length rules in the prompt. | Scannable answers; every tile and chart still grounded. |
| SEO — served HTML | Every URL's body was an empty `<div id="root">`, so Bing's first pass, AI answer engines and archivers saw no heading, text or links. | The edge Worker fills `<noscript>` with the route's real content from the same registries the React pages render (tool method, worked example and FAQ; full guide bodies; public pages; site navigation). Private routes are untouched. JavaScript users see no change. | All ~145 indexable URLs now carry 1.6–12 KB of real content and 28–42 internal links in the raw HTML. |
| SEO — AI answer engines | No machine-readable site summary. | `/llms.txt`, generated from the sitemap's registries. | AI engines get a curated map of every tool, topic and guide. |
| SEO — accuracy | Site-level JSON-LD declared `en-IN` and India-only reach; four tool descriptions said "for India" though the tools support four markets. | Fixed to `en` and the four markets; descriptions corrected (all ≤ 165 characters). | Metadata consistent with the page-level language and the product. |
| Animations | Reveal-on-scroll used a 12% visibility threshold, which an element taller than ~8 viewports can never reach (stays invisible); no fallback without IntersectionObserver; unrevealed sections printed blank. | Threshold 0 with a pulled-in bottom edge; visible by default without an observer; always visible in print. Progress tracks contain their layout; opaque navigation under `prefers-reduced-transparency`; one `transition: all` narrowed. | No content can be stuck invisible; smoother scrolling on low-end devices. |

## Calculation safeguards

No financial formula, tax rule, return assumption or scoring rule changed. The forecast change is to how the days still to come are estimated; its inputs remain the user's own transactions and budget, and the no-history path is unchanged. The timeline sums are the same sums; the change is which items are shown (spending, not savings) and which projection is drawn.

## Verification

| Check | Result |
| --- | --- |
| Unit/component suite | 2,830 passed, 14 pre-existing skips (173 files); 81 new tests across `forecastBacktest`, `aiGrounding`, `aiPlanContext`, `crawlable`, timeline, parser and panel suites |
| Type-check (`tsc -b`) and the edge Worker (checked separately — it is in no tsconfig project) | Passed |
| Lint, zero-warning gate | Passed |
| Production dependency gate | Passed (existing, documented `xlsx` exception) |
| Browser suite, desktop + mobile | 1,034 passed in 4.0 min — WCAG 2.2 AA, responsive 320–1440 px, public crawl with zero console errors, offline, expense flows |
| Worker in the real Workers runtime (`wrangler dev`) | Crawlable content on indexable routes, none on private routes, 404 preserved, `/llms.txt` served |
| Production verification (`verify:production`) | All 145 sitemap URLs live, indexable and self-canonical; redirects, HSTS, robots, JSON-LD, 404, icons, auth targets, 5 edge-function CORS checks, real credentials in the live bundle |
| Live spot checks (cache-busted GET) | `/tools/budget` 6.4 KB / 32 links, `/learn/investing/sip-maths` 11.9 KB / 28 links, `/` 5.6 KB / 42 links in `<noscript>`; `/tools/dashboard` untouched; `/llms.txt` 200 text/plain; `www` → apex 301 |

## Release record

- Published to `finatrix-co` (finatrix.co, www.finatrix.co) with `--keep-vars`.
- Cloudflare version: `db635ce5-3f03-4ccb-b8a4-7d0cfa1f2446`.
- Previous version for rollback: `9cc00958-eb08-4f1c-9a8d-8315321aea7f`.
- Live entry bundle `/assets/index-v0x5MRY0.js` — the exact build the browser suite ran against.
- No edge functions or database migrations were deployed.

## Open items (need a decision or access)

- **Cloudflare zone injections.** Cloudflare injects a JavaScript-detections snippet and the Web Analytics beacon into every HTML response. The site's Content Security Policy correctly blocks both, so they log console errors and collect nothing. Disable both in the Cloudflare dashboard (recommended, consistent with the privacy positioning), or allow-list them in the CSP.
- **Source control.** This release, like the two before it, was deployed from an uncommitted working tree. Commit it so a deployment can be rebuilt from the repository.
- **AI model.** The assistant requests `anthropic/claude-sonnet-5`, honoured only if it is on the edge function's allow-list. Accuracy now rests on grounding and context rather than the model; a stronger model is a cost decision and needs an edge-function deploy.
- Signed-in AI answers, sync and billing still need a staging account to verify end to end (unchanged from the 10 September report).
