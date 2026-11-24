# FinatriX build plan

Three phases that build everything in [NEW_FEATURES.md](NEW_FEATURES.md). Each phase is split into steps sized for one fresh Claude Code session. Any session, on any Claude account, can pick up a step from this file alone.

Planned 24 Nov 2026.

## How to continue

1. Open this repo in Claude Code and start a **fresh session** for each step. Long sessions cost more per message.
2. Say: "Build step 2.2 from docs/BUILD_PHASES.md." Everything the session needs is the step's brief below, the feature's section in `docs/NEW_FEATURES.md`, the project `CLAUDE.md` and the rules at the end of this file.
3. Each step works on its own branch and ends in a pull request. **Merging to `main` deploys to production automatically**, so review first.
4. In the same PR, tick the step in the table and add the PR link.
5. Usage limits are per account, so two accounts can build at the same time. Just don't run two steps at once that edit the same files. The "Wait for" column says what must be merged first.

If these two docs aren't in your checkout, they were untracked files in `/Users/hrishikks/Downloads/app/docs/` on 24 Nov 2026. The step 1.1 PR commits them.

## Steps

| Step | What | Wait for | Status |
| --- | --- | --- | --- |
| 1.1 | Live exchange-rate feed | — | ☑ [PR 25](https://github.com/Finatrix/finatrix-kimi-agent/pull/25) |
| 1.2 | Travel mode, stage 1 | 1.1 | ☑ [PR 25](https://github.com/Finatrix/finatrix-kimi-agent/pull/25) |
| 2.1 | Travel mode stage 2, and Hide amounts | 1.2 | ☐ |
| 2.2 | Groups: server tables, security, join by code | — | ☑ [PR 29](https://github.com/Finatrix/finatrix-kimi-agent/pull/29) |
| 2.3 | Groups: create and join, Budget together, live feed | 1.2, 2.2 | ☐ |
| 2.4 | Groups: Split costs, settle up, your share in your tracker | 2.3 | ☐ |
| 2.5 | Splits with people not on FinatriX | 2.4 | ☐ |
| 2.6 | Subscription radar and bill reminders | — | ☑ [PR 27](https://github.com/Finatrix/finatrix-kimi-agent/pull/27) |
| 2.7 | Monthly money story | — | ☑ [PR 26](https://github.com/Finatrix/finatrix-kimi-agent/pull/26) |
| 2.8 | Money calendar | 2.6 | ☑ [PR 32](https://github.com/Finatrix/finatrix-kimi-agent/pull/32) |
| 3.1 | Voice assistant: mic, read-aloud and hands-free in 11 languages | — | ☑ [PR 28](https://github.com/Finatrix/finatrix-kimi-agent/pull/28) |
| 3.2 | Voice assistant: safe actions with confirm cards | 3.1, 1.2 | ☐ |
| 3.3 | Share to FinatriX, and receipt scan | — | ☐ |
| 3.4 | Home-screen widget | 2.1 | ☐ |
| 3.5 | Warranty and bill locker | 3.3 | ☐ |
| 3.6 | Indian-language app | No other UI step open | ☐ |
| 3.7 | Private on-device AI | 3.2 | ☐ |
| 3.8 | Watch app | 3.4 | ☐ |
| 3.9 | Later stages: voice from Siri and Google's assistant, group notifications, children as names, group goals, trip groups | 3.2, 2.4 | ☐ |

## Size

Estimated 24 Nov 2026 with low confidence: nothing this big has been built here before, so these are analogies with past FinatriX tasks. Costs are API-equivalent. A Pro 5-hour window is about $28–35, and a week about $267.

| Phase | Likely | Worst case | Pro 5-hour windows | Share of a week | Sessions |
| --- | --- | --- | --- | --- | --- |
| 1 (1.1–1.2) | ~$22 | ~$45 | 1, or 2 at worst | 8–17% | 1 |
| 2 (2.1–2.8) | ~$80 | ~$180 | 3–7 | 30–67% | 8 |
| 3 (3.1–3.9) | ~$145 | ~$320 | 5–12 | 54–120% | 9 or more |

---

## Phase 1: live rates and travel mode

### 1.1 Live exchange-rate feed

For travel mode (`NEW_FEATURES.md` item 2) and every tool that converts currency.

- **Why:** `src/tools/lib/fx.ts` uses a built-in table dated 1 Jun 2026 (`FX_AS_OF`), already past its 120-day freshness limit. Its own header says a fetched dataset is the real fix, and the module is shaped for it.
- **Build:**
  - A Worker route, for example `GET /api/fx/latest`, returning `{ base: "USD", asOf, source, rates }`. Rates are units per 1 USD, the same shape as `BASELINE_RATES`, for at least the 40 codes there. On a cache miss it fetches the source, then keeps the result in the edge cache for up to 24 hours. No cron is needed.
  - Pick a free source that updates daily, covers all 40 codes (including VND, LKR, NPR and AED) and allows commercial use. Check its terms, and show any attribution it requires.
  - Reject bad data: anything that isn't a number, zero or negative rates, and a jump of more than 50% in a day for one currency. In that case keep the previous rate and log it.
  - In the app, fetch at most once a day and save the result with its date. Layer it as fetched rates, then the user's own overrides on top (unchanged), with the built-in table only when nothing has ever been fetched. The date shown beside converted totals becomes the fetched date.
- **Done when:** the dashboard and net worth show converted totals with a current date; offline shows the last saved date; unit tests cover parsing, validation, fallback and staleness; the route works under `wrangler dev`; build and tests pass; PR open.
- **Watch out:** don't change the `convert()` formula. The app calls the Worker on its own origin, never the source directly, because CSP `connect-src` would block it. Run `wrangler dev --var CANONICAL_HOST:""` or every request 301s. `worker/` isn't typechecked by `npm run build`. After deploy, check with GET, not HEAD.
- **First commit:** copy `docs/NEW_FEATURES.md` and `docs/BUILD_PHASES.md` in from `/Users/hrishikks/Downloads/app/docs/` if the branch doesn't have them, so the plan lands in git.

### 1.2 Travel mode, stage 1

Feature: `NEW_FEATURES.md` item 2. Read all of it, including Decided.

- **Trips:** a new synced key `fx_trips`, added to `SYNC_KEYS` in `src/tools/cloudSync.ts`, with a `syncMerge` rule. A trip holds its id, name, country, currency, home currency, start and end (local calendar days), the fixed rate, the optional card fee %, the categories that stay in the home currency, and timestamps.
- **Expenses:** optional fields for the foreign amount, its currency, the rate and fee used, and the trip id. Add them to `normalizeExpense` in `src/tools/lib/expense.ts`, or they vanish on reload. `amount` stays in the home currency, so totals, budgets and reports don't change.
- **Maths, written in the PR before coding:** home amount = foreign amount × rate × (1 + fee ÷ 100), with the fee skipped when `paymentMethod` is `Cash`. The rate comes from `fx.ts`, is fixed at setup, and refreshes once on the first day if the trip was set up early and the phone is online. Round the way existing money amounts are rounded. Worked example for a test: AED 120 at 24.0 with a 3.5% fee is ₹2,980.80.
- **Setup sheet:** where (country fills in the currency), when (dates, with quick picks of 3 days, 1 week and 2 weeks), the rate (live, fixed, editable), the card fee (optional), the stays-in-₹ categories (default `rent`, `bills`, `emi`, `subs`, `invest_et`, plus anything `recurring`) and an optional name.
- **While a trip is on:** it turns on and off by date using `ymdLocal`. A trip strip sits at the top. The add-expense amount shows the trip currency with a ₹ preview. Home categories flip to ₹, and one tap switches a single expense. Lists show both amounts. Expenses dated inside the trip default to the trip currency.
- **Ending:** "Still travelling?" to extend, "End trip now", the trip summary, and "Next stop?".
- **Rules:** trips can't overlap. Deleting a trip keeps its expenses. With no rate, ask and never guess (`hasRate`). Domestic trips work without a currency change. Changing the rate or fee asks before updating the trip's expenses.
- **Done when:** unit tests cover the maths, trip-window dates, the home-category rule, fee and cash, the `normalizeExpense` round trip and the merge rule; e2e covers set up a trip, add expenses, see the summary, in all three Playwright projects; `node scripts/design-audit.mjs` is clean; build passes; PR open.
- **Not in this step:** the trip budget, typing the ₹ from a statement, and adding pre-trip bookings (step 2.1).

---

## Phase 2: together, and everyday helpers

### 2.1 Travel mode stage 2, and Hide amounts

- **Travel (item 2, stage 2):** an optional trip budget with progress in the trip strip; "Charged a different amount?", which takes the real ₹ from the statement while keeping the foreign amount and storing the implied rate; and adding expenses dated before the trip, such as flights, to it.
- **Also open from item 2:** the budget screen's "Includes ₹29,760 from the Dubai trip" line (item 2, Budgets and totals). No step covered it, so stage 1 did not build it.
- **What stage 1 left in place (PR 25):** trips and all their maths are in `src/tools/lib/trips.ts` (`spendMoney` prices every entry route; `tripDefaults` decides the currency). The UI is in `src/tools/travel/`, on the shared `ToolSheet` (`src/tools/ui/ToolSheet.tsx`). Each expense already stores `fxAmount`, `fxCurrency`, `fxRate`, `fxFee` and `tripId`, so a statement amount only needs a new `amount` and the implied `fxRate` (amount ÷ fxAmount, fee folded in). The stays-in-₹ defaults resolve through `migrateCategory` and include the whole Savings section (`defaultHomeCats`).
- **Hide amounts (item 11):** one eye toggle that turns every amount into "₹ ••••" and removes chart labels, remembered on the device. Build it into the shared money formatting, then sweep the screens that format amounts themselves.
- **Done when:** tests, e2e and the design audit pass; build passes; PR open.

### 2.2 Groups: server tables, security, join by code

Feature: `NEW_FEATURES.md` item 12. Everything there is decided.

- **Tables:** groups, members (role, joined, left), group expenses (paid by, split rule, shares), invites (code, 7-day expiry) and settlements. Row-level security lets only current members read or write a group's rows. The 20-member limit is enforced on the server.
- **Join by code:** an edge function, rate-limited per user and per IP. Codes are 6 characters (shown as `FX-7K2P9Q`), expire after 7 days, and can be reset by the admin.
- **People:** members confirm they're 18 or over when they first create or join a group. Deleting an account removes the person's details, and their rows show "Former member".
- **Done when:** the migration is tested on PGlite; every policy is proved with a self-rolling-back probe; the policies get a security review; the edge function is tested under Deno (no Docker on this Mac); PR open. SQL reaches production only through the documented recipe (dry run first), after the owner says yes.
- **Watch out:** every view over an RLS table needs `security_invoker = true`. Guard triggers that check `current_user` need `SECURITY INVOKER`. PostgREST upsert can't target a partial unique index. Edge functions and SQL deploy apart from the app and can drift, so check what's deployed.

### 2.3 Groups: create and join, Budget together, live feed

- Create (type, name, emoji), invite (code, a link through the existing app links, QR) and the join card ("Join Sharma Family? 3 members").
- The add-expense form gets Personal (default) or a group.
- Budget together: a shared monthly budget by category, and how much each member added.
- A live activity feed, "Edited by" on every change, and an offline queue.
- **Before testing writes:** agree a safe two-user test setup with the owner. Never test against real accounts.
- **Done when:** tests and e2e pass; design audit clean; PR open.

### 2.4 Groups: Split costs, settle up, your share in your tracker

- Paid by; split equally, by shares or by exact amounts; balances; and the fewest payments to settle up. Write the maths and the rounding rule for leftover paise in the PR and get them agreed first.
- Settle up: "Mark as paid", plus a reminder through a `https://wa.me/?text=` link that the user sends themselves.
- Your share is copied into your personal Expense Tracker as a normal expense marked with the group's name. It updates when the group expense changes and stays if you leave. Budget-together spending is never copied.
- **Done when:** unit tests cover splits, rounding, balances and settlements; e2e passes; PR open.

### 2.5 Splits with people not on FinatriX

Item 9. A local list of people, reusing the split maths from 2.4. Money lent or borrowed is tracked separately from spending, with a WhatsApp reminder and "Mark as settled". Friends who use FinatriX go through groups instead.

### 2.6 Subscription radar and bill reminders

Items 6 and 7. Use `detectRecurring` in `src/tools/lib/expenseAnalytics.ts` and the upcoming-bills logic in `src/tools/lib/commitments.ts`. The app already sends up to 3 notifications a day, so **decide first** with the owner: one daily summary (suggested) or a reminder per bill. On Android, local notifications need `isExactNotification: false` or they hang.

### 2.7 Monthly money story

Item 8. 4 or 5 cards built from the existing monthly totals, shareable as an image with amounts hidden by default. Canvas can't read CSS `var()`, so resolve colours before drawing.

### 2.8 Money calendar

Item 13. The 30–90 day projection is new maths. Write it down and get it agreed before building, and always label the result as an estimate.

---

## Phase 3: voice, capture and reach

### 3.1 Voice assistant: mic and read-aloud

Item 1. Decided: free for everyone, on the web and both apps together, and hands-free.

- Languages: English, Hindi, Bengali, Marathi, Telugu, Tamil, Gujarati, Kannada, Malayalam, Punjabi and Odia.
- Hands-free: once started, it listens again after each reply and stops after a pause or when the user says "stop". It never listens in the background.
- Speech to text and read-aloud: native on iPhone and Android (an in-repo Capacitor plugin, following the app-lock plugin's pattern, or a well-maintained one), and the browser's speech features on the web. Check every language on real phones, and fall back to typing where one isn't available.
- Add the microphone and speech permission texts on iOS. The existing AI consent (`fx_ai_consent`, checked by `requestCompletion`) must cover voice.
- **Done when:** a mic button in the AI chat works, replies are read aloud, a hands-free back-and-forth works, tests pass and the PR is open.

### 3.2 Voice assistant: safe actions with confirm cards

Item 1, stage 2. A fixed list of actions: log an expense, set a budget, run a calculator, open a screen, and a travel-mode entry ("50 dirhams for a taxi"). The AI picks the action and fills in only what the user said. The app does all the maths, every write shows a confirm card, and everything can be undone.

### 3.3 Share to FinatriX, and receipt scan

Items 4 and 5. An iOS share extension, an Android share target, and the web share target where the browser supports it. Both paths go through the existing screenshot import (`src/tools/lib/import/`) and its review step. Receipt photos are read on the device.

### 3.4 Home-screen widget

Item 3. WidgetKit on iPhone and app widgets on Android, showing the daily safe-to-spend figure. Add opens the form, and the widget follows Hide amounts. **Decided (24 Nov 2026):** the lock screen shows the amount only after the user turns it on; until then it shows it hidden.

### 3.5 Warranty and bill locker

Item 10. **Decided (24 Nov 2026):** photos stay on the device to start; synced photos can come later.

### 3.6 Indian-language app

Item 15. No translation system exists yet, so build one first, then add languages in the decided order. A fluent speaker reviews the finance terms in each language. Run it when no other UI step is open, because it touches every screen. **Decided (24 Nov 2026):** Tamil first, then Malayalam, Telugu, Kannada and Hindi.

### 3.7 Private on-device AI

Item 14. Apple's on-device model on newer iPhones, and Gemini Nano on supported Android phones, behind the same consent and grounding rules, with the cloud AI as the fallback.

### 3.8 Watch app

Item 16. watchOS and Wear OS: quick add, and safe-to-spend on the watch face.

### 3.9 Later stages

Starting voice from Siri and Google's assistant, and multi-step plans (item 1, stage 3). Groups stage 3 (item 12): push notifications, children as names a parent manages, group savings goals, trip groups in travel mode's currency, and members in other countries. Any travel-mode extras left (item 2).

---

## Rules for every step

These are the traps past sessions found in this codebase. Treat them as part of every brief.

- **Money maths:** never change an existing formula. New maths is written in the PR and agreed with the owner first. The AI never sets a number.
- **Money inputs:** never use `type="number"` for money or percentages. Use `MoneyField`, `PercentField` or `AmountInput`, and resolve string state with `plainAmount` before `Number()` or saving.
- **Dates:** calendar days use `ymdLocal` and `ymLocal` from `src/lib/date.ts`. `toISOString().slice(0, 10)` breaks east of UTC.
- **Categories:** resolve with `migrateCategory`. Categories are per month, so call `loadCatViewFor(month)`, not `loadCatView()`.
- **Sync:** a new synced key goes in `SYNC_KEYS` and needs a `syncMerge` rule. Two older merge-sync branches (`fix/sync-merge-port`, `fix/expense-sync-merge`) still exist, so check `git log main` before assuming what's merged. Production has no `updated_at` trigger; the client stamps the compare-and-set token.
- **Expenses:** `normalizeExpense` copies only fields it knows. Only `amount`, `category` and `date` feed totals.
- **Exchange rates:** `convert()` returns the amount unchanged when a rate is missing. Check `hasRate`, and never show that as converted.
- **CSS:** lazy route CSS beats Tailwind utilities, so do breakpoint hiding in component CSS. Tools colour tokens are scoped to `.fx-tools`, and portal roots need `fx-tools fx-scope`. Fixed overlays inside `.fx-page` must portal to `body`. Lock scrolling with `useBodyScrollLock`.
- **Scrolling:** `html` has smooth scrolling, so programmatic scrolls pass `behavior: 'instant'`. The anchor offset is the `--scroll-offset` token, never `scroll-mt-*`. Landing position lives in `useScrollRestoration`.
- **Touch:** fields under 16px use `max(<size>, var(--field-min-fs))`, or iOS zooms on focus. Hover styles sit behind `(hover: hover) and (pointer: fine)`. Hit areas are at least 44px, and there is one mobile nav. Run `node scripts/design-audit.mjs`.
- **Typecheck:** `tsc --noEmit` does nothing here, so `npm run build` is the typecheck.
- **Tests:** `npm test` (Vitest) and `npm run test:e2e` (Playwright, all three projects including WebKit). Pin the clock at the top level of setup for date tests, not in `beforeEach`. A rejecting `vi.fn()` fails as an unhandled rejection even when the code catches it. Playwright reuses a stale preview server on port 4319, so stop it first. For e2e that doesn't pollute analytics, set `FX_ALLOW_UNCONFIGURED_BUILD=1 VITE_ANALYTICS_URL=`. `npm run audit:prod` must pass.
- **Worktrees:** copy `.env` from the main checkout before building, because a build without it ships a silently dead bundle. Never commit it. Two pdfjs test failures are known false alarms in worktrees.
- **Browser testing:** in the Claude desktop Browser pane, localhost:3000 and :5173 are signed in to a real account. Test writes only on the signed-out preview at :4173.
- **Deploys:** every push to `main` deploys the Worker and edge functions. Doc-only commits use `[skip ci]`. A merged PR is live within minutes.
- **AI:** `requestCompletion` refuses until `fx_ai_consent` is `1`. Handle `no-consent` by asking, and seed the key in AI tests.
- **Other editors:** another tool sometimes edits this repo and drives emulators, so check `git status` before starting.
