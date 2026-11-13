# FinatriX: the first four pieces — brief and progress log

This file is both the instructions and the record of where the work stands. Any Claude session, on either of the owner's accounts, can pick the work up from here.

**Starter prompt** (paste this into a new session opened in `/Users/hrishikks/Downloads/app`):

> Read `docs/handoff/first-four.md` and carry on from the first unticked step in its Progress log. Follow its rules, keep the log updated and committed as you go, and stop to ask me before anything it marks as needing my yes.

## 1. How to work from this file

1. Only one session works on this at a time. It works in the main checkout (`/Users/hrishikks/Downloads/app`), not a worktree: native builds need the ignored files that live there (`.env`, `android/local.properties`, signing config, `node_modules`).
2. Before touching anything, read the **Progress log** (section 9), then run `git status`, `git log --oneline -8` and `git branch --list 'feat/*' 'release/*' 'fix/*'`. Uncommitted changes belong to whichever step the log says was in progress. Another tool sometimes edits this repo and drives emulators, so if you see changes the log does not explain, stop and ask.
3. After each step: tick it, add a dated line under it (commit hashes, what was verified and how, what was not), then commit this file as a docs-only commit with `[skip ci]` in the message and push.
4. If you have to stop mid-step (usage limit, error, a question for the owner), first write in the log exactly where you stopped, what is uncommitted, and the next command you would have run. Commit work in progress to the piece's branch with a `WIP:` message rather than leaving it loose.
5. Finish one piece (merged, deployed, verified) before starting the next. If your context is past roughly 250k tokens when a piece ends, stop there so the next piece starts in a fresh session.

## 2. What the owner asked for

Verbatim, 13 November 2026:

> Fix everything and make every category 10/10. Have face lock for the apps, For exoense tracker when suer is reviewing the imported transactions, they can edit the amount as well. Make everything better and dont break anything. And then update it in appstore, playstore and website. Make everything 10/10.

The job was sized at nine pieces. The owner then said: **"Do first 4"**. Those four are sections 5 to 8. The other five are listed in section 10 and are out of scope for now.

## 3. Rules

The project charter (`CLAUDE.md`) and the owner's usage rules (`~/.claude/CLAUDE.md`) apply in full. The ones that matter most here:

- **Never change** financial formulas, calculations or educational logic. Preserve calculation parity.
- **No new dependencies** unless genuinely necessary. The one expected exception is a native biometric plugin for piece 2, and even there a small in-repo plugin is acceptable if no maintained plugin supports Capacitor 8.
- **Never weaken** authentication, authorisation, row-level security or the CSP to make something work.
- **Tests:** do not delete, skip or weaken a failing test. Do not say something works unless you tested it. Report failures with their output.
- **Money fields:** never `type="number"`. Use the project's `AmountInput` / `MoneyField` / `PercentField`, and resolve string state with `plainAmount` before `Number()` or saving.
- **Accessibility:** WCAG 2.2 AA. Every control needs a name, keyboard support, visible focus and a label. Fields under 16px use `max(<size>, var(--field-min-fs))` or iOS zooms on focus. Fixed overlays inside `.fx-page` must portal to `body`.
- **Needs the owner's explicit yes in chat, at that moment:** any production SQL change, any Stripe change, any App Store or Play submission or publish, deleting data, pushing anything other than a tested change to `main`. A yes given earlier for something else does not carry over.
- **Owner-only:** typing passwords, creating accounts, signing in to Xcode, App Store Connect, Play Console or Stripe.
- **Usage:** the owner is on a limited plan. Locate before reading, cap command output, batch independent calls, keep replies short.

### Checks that must pass before anything reaches `main`

| Check | Command | Baseline at `f0d6cd7` |
|---|---|---|
| Types | `npx tsc -b` (`tsc --noEmit` is a no-op here) | clean |
| Lint | `npx eslint .` | clean |
| Unit | `npx vitest run` | 271 files, 4,450 passed, 14 skipped |
| Browser tests, all three engines | `FX_ALLOW_UNCONFIGURED_BUILD=1 VITE_ANALYTICS_URL= npx playwright test` | 1,359 passed, 1 skipped |
| Dependencies | `npm run audit:prod` | passes |

Before the browser tests, make sure nothing is listening on port 4319 (`lsof -nP -iTCP:4319 -sTCP:LISTEN`), or Playwright silently reuses a stale server.

### Testing in a browser

- Write-test only on the signed-out production preview: `npm run build`, then the `vite-preview` launch entry (`http://localhost:4173`).
- `http://localhost:3000` and `:5173` in the Browser pane are signed in to a real account. Anything written there syncs to that account's cloud data. Do not write there.
- The Browser pane's animation clock can freeze, which makes pages look washed out in screenshots. That is the pane, not the site.

### Shipping to the website

A push to `main` starts the Deploy workflow (about 45 minutes: checks, build, all browser tests, `wrangler deploy`, edge functions, `verify:production`). It does **not** run SQL. Read the result with `gh run view <id> --json conclusion,jobs`, never by piping `gh run watch`. Afterwards confirm the change is in the live bundle and run `npm run verify:production`.

## 4. Where things stand (13 November 2026)

- `main` and `fix/expense-import-repair` are at `f0d6cd7` plus the commit that added this file.
- Deploy run `43333899242` for `f0d6cd7` was still running when this was written. Confirm it finished green before pushing anything else to `main`.
- Untracked files that belong to the owner and must be left alone: `.claude/agents/`, `.claude/skills/`, `docs/E2EE_FINANCE_SYNC_PLAN.md`, `scripts/ops/`.
- Production database: migration history is 14 of 14, the last being `20261112000100`. `20261105000100_lock_paid_access_writes.sql` (security branch) is **not** applied.
- Live apps at last check (30 October): Android 1.0.1 (10) published. iOS 1.0.0 (10) was Waiting for Review with release on approval. Neither console has been read since.
- The engineering report for the work so far: `docs/audit/2026-11-12-import-repair-and-audit.md`.
- Notes from earlier sessions: `~/.claude/projects/-Users-hrishikks-Downloads-app/memory/MEMORY.md` is the index. Entries worth opening are named in each piece below.
- A decision the owner has not made, so leave it alone: a kill switch saved from the admin dashboard is stored as "on".

## 5. Piece 1 — edit the amount while reviewing an import

**Goal:** in the Expense Tracker's statement import, the review sheet lets the user correct a transaction's amount before importing, the same way they can already correct other fields.

**Where:** `src/tools/ui/StatementImport.tsx` (the review sheet; the row editor's fields are around lines 590 to 660) and `src/tools/lib/import/useStatementImport.ts` (`updateDraft(id, patch)` near line 250). Supporting code is in `src/tools/lib/import/`: `draft.ts` (`buildDrafts`, `toExpense`, `flipDirection`), `dedupe.ts` (`markDuplicates`, matched by cents), `types.ts`.

**Requirements**

1. Each row's amount is editable in the review sheet with the project's money input, labelled, showing the currency, at least 16px on touch devices.
2. An edit changes only the amount. Money in or out stays as it is unless the user changes it with the existing control. Zero, negative, empty or unparseable input is rejected: the previous amount stays and the field says why, following whatever pattern the date field already uses.
3. Amounts are kept to two decimals, consistent with how duplicates are matched.
4. After an edit, duplicates are checked again against the existing ledger and the rest of the batch (as `swapDirections` does with `markDuplicates`), and the summary totals update.
5. The edited amount survives closing and reopening the sheet (the staged review), and it is the amount that gets imported.
6. Nothing is "learned" from an amount edit, and the original statement text is not lost if the draft keeps it.
7. Tests: add to `src/test/importFlow.test.tsx` and/or `src/test/importRepair.test.ts`. Cover: an edit reaches the imported transaction; a row becomes or stops being a duplicate when its amount changes; bad input is rejected; a reopened review keeps the edit; the field has an accessible name. jsdom's `File` has no `.text()`; the test helpers shim it.
8. Check it by hand on `http://localhost:4173` at desktop and phone width with a small CSV, including the keyboard path and the "import failed, nothing saved" path.

**Done when:** checks in section 3 pass, it is on `main`, the deploy is green and the live import chunk contains the change.

Notes to open: `finatrix-import-test-traps`, `finatrix-money-input-rule`, `finatrix-touch-field-size-rule`.

## 6. Piece 2 — Face ID or fingerprint lock for the iOS and Android apps

**Goal:** an optional app lock, so someone who picks up an unlocked phone cannot open FinatriX.

**Facts:** the apps are Capacitor 8.5.2 with the web bundle inside. Installed plugins: app, browser, haptics, keyboard, local-notifications, share, splash-screen. There is no lock code today. `src/pages/marketing/Security.tsx` mentions the subject: read it and make sure whatever it says is true once this ships.

**Behaviour agreed with the owner**

- Off by default. A switch in Settings, shown only in the native apps.
- Turning it on requires one successful unlock first. If the phone has no biometrics or passcode set up, explain that and leave it off.
- When on, the app locks at launch and when it returns after being in the background for more than a short while (start with 60 seconds).
- Uses the phone's biometrics and falls back to the phone passcode.
- While locked, and in the app switcher, the content is covered.
- It is a privacy gate on this device. It does not encrypt data, so the copy must not claim that it does.
- The setting is stored on the device only. It must not be added to the cloud-synced keys, and signing out clears it.

**Implementation notes**

- A native bridge is needed. Prefer the smallest maintained plugin that supports Capacitor 8 on both platforms. If none does, write a small in-repo plugin (Swift `LocalAuthentication`, Kotlin `androidx.biometric`). Check it does not break the Mac Catalyst build notes in `finatrix-mac-catalyst-blockers`.
- iOS needs `NSFaceIDUsageDescription` in `Info.plist`. Android needs the biometric permission.
- Put the lock at the app root, above the routes, portalled to `body`, with a focus trap, an "Unlock" button, a live announcement, safe-area padding and reduced-motion support.
- Use `@capacitor/app` state changes to time the background period, and show the cover the moment the app pauses, before the system takes its switcher snapshot.
- Taps on a notification must land behind the lock.
- Keep the timing and state logic in a pure module with unit tests. Test the component with the plugin mocked.

**Verification**

- `npm run verify:native` passes.
- Both apps build. Try the flow on the iOS Simulator (Face ID enrolment under Features) and an Android emulator (fingerprint via `adb emu finger touch 1`). This Mac has 16 GB: do not run the emulator, the Simulator and the test suite at the same time.
- The owner tests on a real phone before anything is submitted. Record that as a step waiting on the owner.

Notes to open: `finatrix-android-app`, `ios-simulator-driving-notes`, `finatrix-emulator-capture-traps`, `finatrix-host-memory-stalls`, `finatrix-concurrent-editors`, `finatrix-fixed-overlay-transform-trap`, `finatrix-local-notifications-traps`.

## 7. Piece 3 — release the audited security fixes

**Why:** today paid access is enforced only in the browser, and the AI edge function accepts prompts written by the caller from any account. The fixes exist on branch `fix/security-audit-2026-11` (3 commits, 40 files, +807 −212) and were never released.

**Order matters. Do not merge before the database is ready.**

1. Bring the branch up to date with `main` (the privacy-copy commit `ad2dbaa` is already on `main` as `f5bfdd0` and drops out). Resolve conflicts, run every check in section 3.
2. Read-only checks on production (recipe in `finatrix-prod-sql-apply-recipe`): every beta tester has a paid `subscriptions` row, because the new edge functions refuse them otherwise; `begin_ai_call` exists; note whether `platform_roles` is still empty.
3. **Owner's yes needed.** Apply `20261105000100_lock_paid_access_writes.sql`. It is dated before the already-applied `20261112000100`, so `supabase db push` will need `--include-all`. Do a dry run first and go ahead only if it names that one file. Prove the new policies on the live database with a probe that rolls itself back, before and after.
4. **Owner does this, or gives an explicit yes.** Add `charge.refunded` and `charge.dispute.created` to the Stripe webhook.
5. Merge to `main`. The deploy redeploys every edge function from `main`. Then run `npm run verify:deploy` and `npm run verify:production`, and confirm a free-tier AI request and a paid-only request behave correctly for a free account.
6. Never remove a free-tier AI prompt hash that a shipped mobile build still sends (`supabase/functions/_shared/aiTasks.ts`).
7. Turnstile on sign-up stays out of scope: it needs a site key and would break sign-ups in installed apps. Record it as still open.

Notes to open: `finatrix-security-audit-2026-11`, `finatrix-prod-sql-apply-recipe`, `finatrix-stripe-billing-launch`, `finatrix-deployed-vs-repo-drift`, `finatrix-edge-deploy-verification`, `finatrix-ci-and-deploy-pipeline`.

## 8. Piece 4 — new App Store and Play versions, and the website

**Goal:** pieces 1 to 3 are live on the website, and new builds containing pieces 1 and 2 are submitted to both stores.

- **Website:** done piece by piece through the deploy. Finish with `npm run verify:production`.
- **Read both consoles first** and write what they say in the log. Do not rely on the 30 October state above.
- **Android:** raise the version code above 10 and the version name, build the signed bundle (`android/app/build/outputs/bundle/release/app-release.aab`), upload to the production track with release notes. The bundle is over the 10 MB browser upload cap; the workaround is in `finatrix-mobile-release-state`. Managed publishing is on, so after Google approves, someone must press Publish. The Play Console was signed in only in the owner's Chrome profile at last check.
- **iOS:** what to do depends on App Store Connect (app id `6818361672`). If 1.0.0 is live, create the next version. If it is still waiting for review, ask the owner whether to replace the pending build or wait, because replacing it restarts the queue. Archive and upload with `scripts/ios-release.sh upload ios/release-candidates/<version>-<build>`; Xcode must already be signed in. Update "What's New" and the review notes (`docs/APP_STORE_SUBMISSION.md` §7) to describe the lock and its Face ID prompt. Check the review demo account still works (`finatrix-review-demo-account`).
- **Owner's yes needed** before each upload, each submission and each publish. State what will be submitted, to which track or version, and what happens on approval.

Notes to open: `finatrix-mobile-release-state`, `finatrix-play-tracks-and-testers`, `finatrix-app-review-2-1-rejection`, `finatrix-review-demo-account`, `finatrix-android-app`.

## 9. Progress log

Tick a step only when it is verified. Put a dated line under each step you finish or stop in.

**Piece 1 — edit the amount in import review**
- [x] 1.1 Read the review sheet and the hook; decide how the amount field behaves
  - 2026-11-13: read only, no code written. Decision for 1.2 (branch `feat/import-review-amount`):
    - `StatementImport.tsx` `Row`: replace the read-only amount cell (~line 668) with `AmountInput` (`src/tools/ui/AmountInput.tsx`, text + decimal keypad + formulas), className `fx-imp-input fx-imp-input-sm` (already `max(12.5px, var(--field-min-fs))`), `ariaLabel` "Amount for <label>", keep the balance line under it. Needs a new `sym` prop: `ExpensePage.tsx` already has `sym` from `useCurrency()` (line 126); pass it where `<StatementImport>` is rendered.
    - Row keeps a local string; commit on blur or Enter via `plainAmount` then `Number`. Empty, zero, negative or unparseable: keep the old amount, show an error (`aria-invalid` + `errorId`, text like "Enter an amount above zero"). The date field has no error pattern to copy, so this is a new, small one.
    - User types the magnitude; the sign comes from the row's `credit` issue (credit stays negative). Round to cents (`Math.round(x*100)/100`; `evaluateFormula` already rounds).
    - New hook action `setDraftAmount(id, magnitude)` in `useStatementImport.ts`, next to `swapDirections` (~line 321): set `amount`, drop the `no-amount` issue, then `markDuplicates(current, existing)` like `swapDirections`. Do NOT touch `origin`/`confidence` (nothing learned) or `source` (original text kept). Reuse the auto-tick-on-becoming-importable rule from `updateDraft` (~line 250).
    - Staging: `saveStaged` already persists drafts, so a reopened review should keep the edit. Confirm in a test.
    - Tests (in `src/test/importFlow.test.tsx`): edit reaches `onImport`; row becomes and stops being a duplicate; bad input rejected; resume keeps the edit; field has an accessible name.
  - Stopped here: usage limit. Next: step 1.2. Nothing uncommitted except the owner's untracked files.
- [x] 1.2 Build it, with tests
  - 2026-11-13: built on `feat/import-review-amount`, commit `16d8efe`. Verified: `npx tsc -b` clean; `npx eslint` clean on the changed files only; `npx vitest run src/test/importFlow.test.tsx` 69 passed. `statementImport.test.ts` (80) and `importRepair.test.ts` (36) passed before the last two edits and were not re-run after them. NOT run: the full unit suite, any browser test, and the new browser test added to `e2e/compatibility-import.spec.ts` (it runs in all three engines).
  - Where it differs from the 1.1 plan, and why:
    - The text being typed is held by the hook (`amountEdit`, `editAmount`, `settleAmount`, `dropAmountEdit`), not by the row. A tap on Import on a phone does not always blur a field, so a row-local draft could import the old amount while the new one was on screen. `confirm` and `stash` settle it; a field that unmounts mid-typing drops it.
    - A refused entry never stays in the field. The field goes back to the row's amount and a `role="alert"` line says why ("Enter an amount above zero. Kept ₹450."). No `aria-invalid`, because the value on show is valid again.
    - `amendAmount` in `draft.ts` re-checks duplicates and changes a tick only for a reason: newly flagged rows untick; rows the correction releases return to their default tick; a blocked row given its amount ticks; a flagged row the user ticked back on keeps its tick. The two tick rules now live once each, in `startsTicked` and `becameImportable`.
    - The `no-amount` issue is dropped once an amount is supplied. `source` is untouched, and the printed figure shows under the field once the two differ ("statement ₹450").
    - `StatementImport` has a new required `sym` prop.
- [x] 1.3 All checks in section 3 pass
  - 2026-11-13: on `16d8efe` plus the test fix `e46940e`. `npx tsc -b` clean. `npx eslint . --max-warnings 0` clean. `npx vitest run`: 271 files, 4,499 passed, 14 skipped (49 new). `npm run audit:prod` passes. Browser tests in all three engines, port 4319 empty before and after: 1,360 passed, 1 skipped, 2 failed. Both failures were the new test on the two phone engines, and the fault was in the test: on a phone the formula keys sit over the sheet's buttons while a field has focus, so Import cannot be pressed until the keyboard is put away. The test now presses Done first on touch, and that spec then passed in all three engines (6 of 6). The full browser run was not repeated after that one-file test change.
- [x] 1.4 Checked by hand on `localhost:4173`, desktop and phone width
  - 2026-11-13: mostly done, NOT ticked. The last edit (`dropAmountEdit`) came after the final build, so rebuild and repeat a short pass. Seen working at 1280 and 1024 wide and at 375×812 with touch: named field, currency, formula preview and keys, Enter and Tab, refusal line, statement line, hold-back and release against a real ledger, keyboard order, contrast in light and dark (all 5.5:1 or better), resume keeps the correction, the storage-full path keeps the review and imports on retry, Import and ✕ pressed without leaving the field. Not checked: a real phone, a screen reader, Safari.
  - 2026-11-13, later: ticked. Repeated on the final build at 1280 wide and at 375×812 with touch: a half-typed amount is dropped when its row leaves the list, a refused amount goes back and says why, and a correction shows the statement figure and is what lands in the ledger. This last pass used scripted input events, because the Browser pane stalled on real key presses; the earlier passes used real typing. Still not checked: a real phone, a screen reader, Safari by hand (WebKit is covered by the new browser test).
- [ ] 1.5 On `main`, deploy green, change confirmed in the live bundle
  - 2026-11-13: on `main` at `e46940e`. The owner then asked for a hand deploy instead of waiting for run `43379389682` ("Deploy by hand"). Built the way the pipeline does (the three client settings from `.env`, `VITE_AUTH_APPLE` blanked) and ran `npx wrangler deploy` at 06:47Z. The first upload also carried a stray `public/.DS_Store` (git-ignored Finder data, so the pipeline's clean checkout never has it). Removed it and deployed again; `/.DS_Store` now answers 404 (a probe one second after the upload still got the file, fifteen seconds later it was gone). Worker version now `a3abc57b-77c1-40ad-8dd8-78d2cee34212`. Confirmed live: the entry script `index-D6NEHEJY.js` matches the build, `/assets/StatementImport-B_pJZPS6.js` holds the change, and `npm run verify:production` passes 12 of 12. NOT ticked: run `43379389682` was still on its browser checks, and its own `wrangler deploy` will replace this upload.

**Piece 2 — app lock**
- [ ] 2.1 Choose the native bridge (plugin or in-repo) and say why
- [ ] 2.2 Lock logic and screen, with tests
- [ ] 2.3 Settings switch, native-only, with tests
- [ ] 2.4 iOS and Android native changes; `verify:native` passes; both apps build
- [ ] 2.5 Tried on the iOS Simulator and an Android emulator
- [ ] 2.6 Marketing and help copy say only what is true
- [ ] 2.7 Owner has tested on a real phone (waiting on the owner)
- [ ] 2.8 On `main`, deploy green

**Piece 3 — security release**
- [ ] 3.1 Branch brought up to date with `main`; all checks pass
- [ ] 3.2 Production prerequisites checked, read-only
- [ ] 3.3 Migration applied and proven (needs the owner's yes)
- [ ] 3.4 Stripe webhook events added (owner)
- [ ] 3.5 Merged; deploy green; `verify:deploy` and `verify:production` pass; free and paid paths checked

**Piece 4 — store and web releases**
- [ ] 4.1 Both consoles read; status written here
- [ ] 4.2 Android bundle built and signed
- [ ] 4.3 Android uploaded and sent for review (needs the owner's yes)
- [ ] 4.4 iOS archive built and uploaded (needs the owner's yes; Xcode signed in)
- [ ] 4.5 iOS submitted for review (needs the owner's yes)
- [ ] 4.6 Website verified; report updated; memory notes updated

**Log**

- 2026-11-13: brief written. Nothing in this file has been started. Next action: step 1.1.
- 2026-11-13: step 1.1 done (plan recorded under it). Branch `feat/import-review-amount` made from `0075ba3`; this file is committed there, not on `main`. Deploy run `43333899242` not checked yet. Next action: step 1.2.
- 2026-11-13: deploy run `43333899242` for `f0d6cd7` finished green. Step 1.2 built and committed (`16d8efe`). Stopped here: usage limit. Nothing is uncommitted except the owner's untracked files. `dist/` holds an analytics-free build. Next action: step 1.3, in this order: `npx vitest run`; `npx eslint .`; `npm run audit:prod`; `lsof -nP -iTCP:4319 -sTCP:LISTEN` (must be empty); `FX_ALLOW_UNCONFIGURED_BUILD=1 VITE_ANALYTICS_URL= npx playwright test`. Then finish 1.4.
- 2026-11-13: noticed, not done, outside piece 1: editing a row's date or merchant does not re-check duplicates (`updateDraft`); a date-order flip leaves released rows unticked; the "No date found" badge stays after a date is set; focus is left on `<body>` once a file is read; the review table needs sideways scrolling on a phone.
- 2026-11-13: steps 1.3 and 1.4 done. `e46940e` pushed to `main` (fast-forward from `0075ba3`); deploy run `43379389682` started. Next action: when it finishes, `gh run view 43379389682 --json conclusion,jobs`, then confirm the live import chunk has the change (the text `Kept ` is in `StatementImport-*.js`) and run `npm run verify:production`. Later log commits go to this branch first and to `main` only once the deploy is green.
- 2026-11-13: also noticed, not done: on a phone the formula keys cover a sheet's footer buttons while an amount field has focus (app-wide), so the user presses Done before Import.
- 2026-11-13: hand deploy done and verified (details under 1.5). Next action: `gh run view 43379389682 --json conclusion,jobs`. If it is green, run `npm run verify:production` again, tick 1.5 and push this file to `main`. Then stop: piece 2 starts in a fresh session.
- 2026-11-13: for any later hand deploy: delete `public/.DS_Store` first, or add `.DS_Store` to a `public/.assetsignore`.

## 10. Not in scope yet (pieces 5 to 9)

5. Bulk deletes that stick across devices, and a ledger that can grow past the current cloud and browser limits.
6. Error detail that stays private, and uptime alerts.
7. Lighter fonts, larger tap targets, a keyboard and screen-reader pass.
8. Database migrations run by the deploy workflow.
9. Splitting the 3,042-line expense page. Highest risk of breaking something for no visible gain: last, or not at all.

For reference, the scores these pieces were sized against (13 November): technical SEO 9, testing and release 8.5, design 8, mobile web 8, core tools 7.5, performance 7.5, accessibility 7, code quality 7, data safety and sync 6, security 5.5, monitoring 5.
