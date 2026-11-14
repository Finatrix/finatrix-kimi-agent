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

- `main` holds piece 1 (`16d8efe`, `e46940e`) and the log commits after it. `fix/expense-import-repair` is behind it at `0075ba3`.
- Deploy run `43379389682` for `e46940e` finished green on 13 November, after a hand deploy the owner asked for. Nothing is waiting to deploy.
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
- [x] 1.5 On `main`, deploy green, change confirmed in the live bundle
  - 2026-11-13: on `main` at `e46940e`. The owner then asked for a hand deploy instead of waiting for run `43379389682` ("Deploy by hand"). Built the way the pipeline does (the three client settings from `.env`, `VITE_AUTH_APPLE` blanked) and ran `npx wrangler deploy` at 06:47Z. The first upload also carried a stray `public/.DS_Store` (git-ignored Finder data, so the pipeline's clean checkout never has it). Removed it and deployed again; `/.DS_Store` now answers 404 (a probe one second after the upload still got the file, fifteen seconds later it was gone). Worker version now `a3abc57b-77c1-40ad-8dd8-78d2cee34212`. Confirmed live: the entry script `index-D6NEHEJY.js` matches the build, `/assets/StatementImport-B_pJZPS6.js` holds the change, and `npm run verify:production` passes 12 of 12. NOT ticked: run `43379389682` was still on its browser checks, and its own `wrangler deploy` will replace this upload.
  - 2026-11-13, later: ticked. Run `43379389682` finished green at 07:23Z (deploy, edge-functions, native-apps), and its own upload replaced the hand deploy: Worker version `845727fc-ec84-4cc1-b1db-1ce80b963e6d`. The live site serves the pipeline's build, entry `index-DV9rKcy6.js`, and its import chunk `StatementImport-f_Xa3xHe.js` holds the change (found through the live entry's own references). `npm run verify:production` run locally now passes 11 of 12. The one failure is release parity, and it is a comparison artefact: the local `dist/` is the hand build, whose vendor chunks (for example `supabase-*.js`) hash differently from the pipeline's build of the same commit. The two entry files are the same size and carry the same three client settings. The pipeline's own production check and the native-apps check both passed. Why the vendor hashes differ was not looked into.

**Piece 2 — app lock**
- [x] 2.1 Choose the native bridge (plugin or in-repo) and say why
  - 2026-11-14: an in-repo plugin, `FxAppLock`, beside the two the app already has (`FxSystemUi`, `FxFileExport`). Branch `feat/app-lock`, cut from `main` at `4cdfa4c`. A maintained plugin for Capacitor 8 does exist (`@capgo/capacitor-native-biometric` 8.9.3, peer `@capacitor/core >=8`, published 11 November), so this departs from the preference in section 6. Why:
    - The lock also has to cover the app in the app switcher, and that part must be native: the page cannot be relied on to paint before iOS takes its snapshot, and Android's recents thumbnail is not under the page's control. No biometric plugin does it, so the plugin route means two new packages (the second would be `@capacitor-community/privacy-screen` 8.0.0), or one package plus native code anyway.
    - Three calls are needed (`availability`, `authenticate`, `setCover`). The capgo plugin also ships credential storage the app would never use.
    - No new npm package: nothing new for `audit:prod` to watch, and no third-party code inside the lock of a finance app. The one new dependency is Google's `androidx.biometric:biometric` on Android, which the plugin would have pulled in as well.
    - The Mac Catalyst build compiles Capacitor from source into a generated workspace (`finatrix-mac-catalyst-blockers`). A Swift file in `ios/App/App/` that uses Apple's `LocalAuthentication` needs nothing added there; a third-party Swift package would.
    - Checked with `npm view` only; no plugin source was read. `@aparajita/capacitor-biometric-auth` 10.0.0 (February) lists no peer range, and `capacitor-native-biometric` was last published in 2023.
  - Design settled with it, for 2.2 to 2.4:
    - `availability`: does the phone have a passcode or screen lock (iOS `canEvaluatePolicy(.deviceOwnerAuthentication)`, Android `KeyguardManager.isDeviceSecure()`). `authenticate`: the system prompt, biometrics first and the passcode as fallback (iOS `.deviceOwnerAuthentication`, Android `BiometricPrompt` with `BIOMETRIC_WEAK | DEVICE_CREDENTIAL`). `setCover`: hide the app in the switcher while the lock is on (iOS: a cover view from resign-active to become-active; Android: `setRecentsScreenshotEnabled(false)` on 13 and later, `FLAG_SECURE` below that, which there also blocks screenshots).
    - Web side: a pure state machine (`open`, `veiled`, `locked`) under `src/native/appLock/`. Every page load starts locked when the setting is on, so an OAuth return, which reloads the page, asks once more. The page is veiled the moment the app leaves the foreground and locks on return after 60 seconds by the wall clock; a clock that went backwards locks.
    - Setting: `fx_app_lock`, added to `ACCOUNT_LOCAL_KEYS`, so sign-out, an account switch and account deletion clear it. Not in `SYNC_KEYS`, backups or "clear finance data".
    - If the phone's passcode is removed later, nothing can be checked, so the lock switches itself off and the app opens.
- [x] 2.2 Lock logic and screen, with tests
  - 2026-11-14: commits `e414710` and `544b788` on `feat/app-lock`. The rules are in `src/native/appLock/machine.ts` (pure), device events in `controller.ts`, the cover in `AppLockScreen.tsx`, and `src/native/AppLock.tsx` mounts it at the app root beside `NativeShell`. Verified: `npx tsc -b` clean; `npx eslint . --max-warnings 0` clean; `src/test/appLockMachine.test.ts` 15 passed; `src/test/appLock.test.tsx` 14 passed, with the plugin and `@capacitor/app` mocked. Nothing native is covered by these (step 2.5).
  - How it behaves, beyond the brief:
    - A browser loads only the small gate in `AppLock.tsx` and renders nothing. In the apps the lock's code is its own chunk, fetched when the lock is on at launch (an opaque hold covers the app until it arrives) or the first time it is switched on.
    - One automatic prompt each time the lock engages: at launch, on return after a minute, and on return to an app that is already locked. A cancelled prompt waits for the Unlock button. The prompt's own trip through "inactive" is not taken for the user leaving, so it cannot loop.
    - While locked, the rest of the page is inert, focus sits on Unlock and goes back where it was afterwards, and no key reaches the page behind. Android BACK on the lock screen sends the app to the background.
    - No animation, so there is nothing to reduce.
    - The screen's box is laid out inline. It carries `.fx-tools.fx-scope` like every portal root (`portalTokenScope.test.ts` requires it), and `tools.css` can load after it.
  - Known limits, not fixed: the minute is measured on the wall clock, so someone who sets the phone's clock back to within a minute of when the app was left gets in without a prompt (a clock set further back locks). After a sign-in that reloads the page, the lock asks once more.
- [x] 2.3 Settings switch, native-only, with tests
  - 2026-11-14: commit `e414710`. `src/tools/ui/AppLockCard.tsx`, shown in Settings above "Your finance records" only when `isNativeApp()`. Switching on checks that the device has a passcode, then asks for one unlock; a refusal, a cancel or no passcode leaves it off and says why. Switching off does not ask. `fx_app_lock` is in `ACCOUNT_LOCAL_KEYS` and not in `SYNC_KEYS` or `LOCAL_ONLY_KEYS`. Verified: `src/test/appLockSetting.test.tsx` 8 passed, including that `clearSyncedLocal()` removes the setting. Not seen on a device yet.
- [x] 2.4 iOS and Android native changes; `verify:native` passes; both apps build
  - 2026-11-14: commit `e414710`. iOS: `ios/App/App/FxAppLockPlugin.swift`, registered in `ViewController.swift` and added to the Xcode project's Sources, and `NSFaceIDUsageDescription` in `Info.plist`. Android: `AppLockPlugin.java`, registered in `MainActivity.java`, `androidx.biometric:biometric` 1.1.0, and `USE_BIOMETRIC` in the manifest. Verified: `npm run verify:native` passes; `FX_ALLOW_UNCONFIGURED_BUILD=1 VITE_ANALYTICS_URL= scripts/android-build.sh debug` ends `BUILD SUCCESSFUL` (debug APK, 15.3 MB); `npx cap sync ios` then `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build` ends `BUILD SUCCEEDED`. Neither sync changed a tracked file. Not built: the signed release bundle and the device archive (piece 4), and the Mac Catalyst target, whose code lives in the `feat/mac-catalyst` worktree and could not be built from here. The plugin uses only `LocalAuthentication` and `UIKit`, which Catalyst has, but that is reasoning, not a build.
  - An existing test was changed on purpose. `native.test.ts` pinned the iOS permission strings to the camera alone. It now pins exactly two, the camera and Face ID, each with a real purpose sentence, and a new case holds the plugin's registration on both platforms to one name.
- [ ] 2.5 Tried on the iOS Simulator and an Android emulator
  - 2026-11-14, Android, first pass, on `544b788` (debug APK, analytics off), AVD `fx_pixel` (Android 16, WebView 133), driven by a Sonnet agent over the Chrome DevTools Protocol. 12 of 13 checks passed. With no screen lock the switch stays off and says why; a cancelled prompt leaves it off; the PIN switches it on. A cold start shows only the splash and then the prompt, never content, and a fingerprint opens it. A dismissed prompt leaves the lock screen and does not come back by itself. Ten seconds away gives no prompt; 65 seconds away gives one. BACK on the lock screen goes to the launcher. A cold start from a `https://finatrix.co/tools/settings` link reaches Settings only after the unlock. The in-app Security page says "The app lock is not encryption." Switching off needs no prompt. Removing the emulator's PIN switches the lock off and the app opens. I looked at the lock screen capture myself: logo, title, sentence and button are laid out cleanly, clear of the status and gesture bars.
  - One failure, fixed in `d2181eb`: pressing the recents key straight from the app left its live content in the overview card. Android keeps the app running there without pausing it, so the page never covered itself, and `setRecentsScreenshotEnabled(false)` only blanks the saved thumbnail (it did: after HOME the card was blank). `MainActivity.onTopResumedActivityChanged` now tells the plugin, which tells the page. Not in split screen, where it would blank the half not being touched. The fix is unit-tested but has not been re-run on the emulator yet.
  - Not tested on Android: version 9 (`fx_api28` has WebView 66, below the app's floor of 91, so the app shows only its "update needed" dialog). So the `FLAG_SECURE` path used below Android 13 and the PIN fallback below Android 11 have not run anywhere. Also not tested: the light theme. The system prompt cannot be captured in a screenshot (secure window); `dumpsys window` showed `BiometricPrompt` in focus.
  - 2026-11-14, Android, second pass on `d2181eb` (both apps rebuilt at 09:06). `fx_pixel`: recents straight from the app now shows a dark card with the logo at 0.5 and at 3 seconds, and the page reports itself veiled. Back within 30 seconds gives content and no prompt; a minute in the overview locks; HOME then recents gives a blank card. Android's own picker for the Market select does not trip the cover, and neither does the notification shade. I looked at the fixed card myself. `fx_api30` (Android 11, WebView 91), which takes the `FLAG_SECURE` path: no screen lock, cancel, PIN, cold start, 65 seconds away, recents (a blank white card, and ordinary screenshots are blocked there, as designed) and passcode removed all passed. Not run: split screen. Still untested anywhere: Android 10 and below, where the PIN fallback takes an older path.
  - 2026-11-14, iOS, partial, on `d2181eb` (Simulator build of 09:06). A Sonnet agent created the device "FX Lock Trial" (iPhone 17 Pro, iOS 26.5) but could not tap anything. This Xcode has no Simulator app (Device Hub replaced it), the Simulator control tool refused because Claude has not been granted access to that device (the permission request went unanswered), and `simctl` has no tap. So the lock was switched on by writing `fx_app_lock` into the app's WebKit storage, not through Settings. Seen: with the lock on, a cold start shows a cover with the logo and no content; iOS raises its unlock screen by itself, titled `Enter iPhone Passcode for "FinatriX"` with our reason "Unlock FinatriX" under it (I looked at that capture myself); the app keeps running through a simulated Face ID match. A first-run notification alert stayed on screen throughout, because nothing could tap it. NOT seen on iOS: a successful unlock, the Settings switch, the Face ID permission alert and its wording, the one-minute rule, the cover in the app switcher, and switching off.
  - A scare that was probably not a bug: in the agent's run the app exited with status `tcc` right after a simulated match. Repeating the launch and the match by hand left the app running, and the built app does carry `NSFaceIDUsageDescription`. So the exit is put down to the agent's `simctl privacy` attempt, which ends the app it is aimed at. That is an inference: the agent's exact command and its time were not checked.
  - **Waiting on the owner** for the rest of iOS, either way: (a) grant Claude access to the simulator device "FX Lock Trial" from the simulator panel in the desktop app, and a session can then run the remaining checks; or (b) cover them in the real-iPhone test (step 2.7), which has to happen before any store submission anyway.
  - Key captures were copied to the sessions' shared notes folder (`app-lock-evidence/`), since the scratchpad is not kept. Face ID on the Simulator: `xcrun simctl spawn booted notifyutil -s com.apple.BiometricKit.enrollmentChanged 1` then `notifyutil -p com.apple.BiometricKit.enrollmentChanged` to enrol, `notifyutil -p com.apple.BiometricKit_Sim.pearl.match` for a matching face.
- [x] 2.6 Marketing and help copy say only what is true
  - 2026-11-14: commits `544b788` and `2734475`. `src/pages/marketing/Security.tsx` used to say FinatriX adds no passcode or biometric lock. It now shows one of two sentences. In a browser, and in app builds from before the lock (they carry their own copy of the page), it says there is no separate lock there. Inside an app build that has the lock, it says the lock is not encryption. So the website never claims a lock that the store versions do not have yet. `src/test/securityLockCopy.test.tsx` holds both sentences (2 passed), and the Android trial saw the app's sentence on the emulator. `src/pages/Privacy.tsx` ("Data on your device relies on your device's own lock and encryption") is still true and was left alone. `docs/IOS.md` and `docs/ANDROID.md` list the plugin. No other page or help text mentioned a lock (`git grep`). Left for piece 4: the App Store review notes and "What's New".
  - Not done, because it would be untrue until then: once both store versions with the lock are live, the browser sentence could add that the apps have an optional lock.
- [ ] 2.7 Owner has tested on a real phone (waiting on the owner)
  - 2026-11-14: **waiting on the owner.** Nothing may be submitted to a store before this. What to do, on a real iPhone and a real Android phone, with a build of `feat/app-lock` or later (Android: `scripts/android-build.sh debug`, then `adb install -r android/app/build/outputs/apk/debug/app-debug.apk` with the phone on USB; iPhone: run the App scheme onto the phone from Xcode, which needs Xcode signed in):
    1. Settings, App lock, switch it on. The phone should ask for your face or fingerprint once. On the iPhone, the first time, iOS should ask whether FinatriX may use Face ID and show the sentence "FinatriX uses Face ID to unlock the app when you have switched on app lock."
    2. Close the app completely and open it. It should be locked, show nothing of yours, and open with your face or fingerprint.
    3. Open it again and cancel the prompt. You should see "FinatriX is locked" with an Unlock button, and the prompt should not come back until you press it.
    4. Fail the face or fingerprint on purpose. The phone should offer its passcode, and the passcode should open the app.
    5. Leave the app for ten seconds and come back: no prompt. Leave it for more than a minute: locked.
    6. Open the app switcher while the app is unlocked. FinatriX's card should show the logo, not your data.
    7. Switch App lock off. It should not ask, and the app should open without a prompt from then on.
    8. If an Android phone on version 10 or older is to hand, repeat 1, 2 and 4 on it. No emulator here could run that path.
    Say what happened for each, and which phones were used.
- [x] 2.8 On `main`, deploy green
  - 2026-11-14: every check in section 3 passes on `d2181eb`. `npx tsc -b` clean. `npx eslint . --max-warnings 0` clean. `npx vitest run`: 275 files, 4,540 passed, 14 skipped (271 files and 4,499 before this piece). Browser tests in all three engines, port 4319 empty before and after: 1,362 passed, 1 skipped, none failed or flaky (run by an agent; I checked the summary lines in its log myself). `npm run audit:prod` passes. `d2181eb` was pushed to `main`, a fast-forward from `4cdfa4c`, at 22:39Z on 13 November. Deploy run `43521096750` and CI run `43521096014` started. Ticked later the same day: see the next line. The push deploys the website only, where the lock does nothing; the iOS interactive trial (2.5) and the real-phone test (2.7) are still owed.
  - 2026-11-14, later: Deploy run `43521096750` finished green (edge-functions, deploy and native-apps all success) and CI run `43521096014` is green. The live entry script `index-D_FbH8wG.js` names the lock's chunk `AppLockRuntime-DN3Q5QbY.js`, which answers 200. The deploy job ends with the pipeline's own `verify:production`; a local run was not repeated, because against a local `dist/` it reports 11 of 12 (see 1.5). The store apps only change at the piece 4 releases.

**Piece 3 — security release**
- [ ] 3.1 Branch brought up to date with `main`; all checks pass
- [x] 3.2 Production prerequisites checked, read-only
  - 2026-11-14: plain SELECTs against production, run by an agent as the database owner so row-level security does not hide rows; I did not repeat them. Migration history: 14 applied, latest `20261112000100`; TWO pending, `20261105000100_lock_paid_access_writes.sql` and `20261106000100_prune_quota_windows.sql` (the second came with commit `aba90f8` after the brief was written). Both are dated before the latest, so `db push` needs `--include-all`. Users: 41, of whom 2 are flagged beta. Both beta testers pass the new entitlement rule (a `premium` row, provider `manual`, no end date), nobody would be refused, and no non-beta user holds a paid row. `begin_ai_call(uuid, date, integer, bigint, bigint)` exists, and so does every function and table the branch's edge functions use. `platform_roles` exists and is still empty: nobody is a platform admin. The vulnerable policies are all still live (`subscriptions_insert`, `subscriptions_update`, `usage_counters_upsert`, `usage_counters_update`, `audit_log_insert`). Nothing in either file conflicts with the live data: 14 rows across the three tables, policies that do not look at existing rows, no long transactions. The prune migration schedules an hourly job; its first run deletes about 28 of the 59 rows in `provider_quota` (expired rate-limit windows, including raw IP keys older than a day). NOT done: the self-rolling-back policy probe, which writes and belongs to 3.3 after the owner's yes.
  - Noticed on the side, not fixed, outside this piece: in production the anonymous role can execute `increment_ai_usage` and `is_platform_admin`, and `is_platform_admin` is `SECURITY INVOKER`, which could recurse once an admin row exists. Worth its own look.
- [ ] 3.3 Migration applied and proven (needs the owner's yes)
- [ ] 3.4 Stripe webhook events added (owner)
- [ ] 3.5 Merged; deploy green; `verify:deploy` and `verify:production` pass; free and paid paths checked

**Piece 4 — store and web releases**
- [ ] 4.1 Both consoles read; status written here
  - 2026-11-14, NOT ticked. The consoles themselves could not be read: Claude in Chrome is not connected to this Mac's Chrome, and the desktop app's built-in browser is signed out of both (App Store Connect sends it to a sign-in page, Play Console to the public marketing page). What the owner's mail says instead: **iOS 1.0.0 is live.** Apple completed review of the submission made on 29 October, and sent "Welcome to the App Store" on 4 November at 04:10 UTC (release was set to automatic on approval). The newest iOS build seen is 1.0.0 (10), uploaded 30 October; the Mac Catalyst build is 1.0.0 (9), 22 October. No Apple mail about the app after 4 November. **Android:** the last known state is the 30 October note, 1.0.1 (code 10) published to production; the only Play mail found is "production access granted" on 17 October. Not confirmed from a console: anything newer in review, the highest version code on every track, and whether managed publishing holds a change. To close this step the owner connects Claude in Chrome (extension installed and signed in to the same Claude account, side panel open, Chrome signed in to both consoles) or signs in to both inside the desktop app's built-in browser; then a session reads them.
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
- 2026-11-13: piece 1 is finished: on `main`, deployed and verified live. Next action: piece 2, step 2.1, in a fresh session. Do not resume the session that did piece 1: it holds about 530k tokens, and each resume after a pause used about a third of a Pro 5-hour window before any work was done. Local `main` now tracks `origin/main`.
- 2026-11-14: piece 2 started in a fresh session on `feat/app-lock`. Steps 2.1 to 2.3 are done. For 2.4 the native code is written (`FxAppLockPlugin.swift`, `AppLockPlugin.java`, `NSFaceIDUsageDescription`, `USE_BIOMETRIC`, `androidx.biometric` 1.1.0) but not yet built. Next action: `FX_ALLOW_UNCONFIGURED_BUILD=1 VITE_ANALYTICS_URL= scripts/android-build.sh debug` (analytics off, so an emulator run sends nothing to production), then an iOS Simulator build, then step 2.5. Usage when this session started: 5-hour window 48%, weekly 43%, weekly Fable 82%.
- 2026-11-14, later: steps 2.1 to 2.4 and 2.6 are ticked. 2.5 is done for Android (two emulators, one bug found and fixed in `d2181eb`) and only partly for iOS, which is waiting on the owner (see 2.5). 2.7 is waiting on the owner (see 2.7). Head of `feat/app-lock` is `d2181eb` for code, with docs-only commits after it. Nothing is on `main`. Next action for 2.8: the full unit suite and the browser tests in all three engines were started on `d2181eb` (`npx vitest run`, then `FX_ALLOW_UNCONFIGURED_BUILD=1 VITE_ANALYTICS_URL= npx playwright test`; output in the session scratchpad). If both are clean: `git push origin d2181eb:main` first, so the head of that push has no `[skip ci]` and the Deploy workflow starts, then `git push origin feat/app-lock:main` for the log commits; watch the run with `gh run list --branch main --limit 3` and `gh run view <id> --json conclusion,jobs`; then `npm run verify:production`.
- 2026-11-14, later still: both suites were clean, so `d2181eb` is on `main` and Deploy run `43521096750` is running. This session stopped here on purpose: it holds about 480k tokens, so each further step in it costs about ten times what it would in a fresh one. Next action, in a fresh session: step 2.8's "Next" line. The log commits after `d2181eb` are on `feat/app-lock` only, until the deploy is green. Piece 3 has not been started.
- 2026-11-14: noticed, not done, outside piece 2: the iOS app asks for notification permission on its very first launch, before the user has done anything. On the Simulator that alert sat on top of the lock's unlock screen.
- 2026-11-14, afternoon (after a usage-limit pause): Deploy run `43521096750` is green and 2.8 is ticked. Piece 3 is under way: branch `fix/security-release-2026-11` was cut from `main` and holds the two security commits that were not already on `main` (`34ccd12` and `aba90f8`, applied as `b002656` and `b54d45c` with no conflict); its checks and a migration dry run are running. The old branch `fix/security-audit-2026-11` is untouched. Note for 3.3: `aba90f8` brings a second migration, `20261106000100_prune_quota_windows.sql`, so the dry run may name two files, not the one the brief expects; the owner's yes must then cover both. The store consoles could not be read (see 4.1).

## 10. Not in scope yet (pieces 5 to 9)

5. Bulk deletes that stick across devices, and a ledger that can grow past the current cloud and browser limits.
6. Error detail that stays private, and uptime alerts.
7. Lighter fonts, larger tap targets, a keyboard and screen-reader pass.
8. Database migrations run by the deploy workflow.
9. Splitting the 3,042-line expense page. Highest risk of breaking something for no visible gain: last, or not at all.

For reference, the scores these pieces were sized against (13 November): technical SEO 9, testing and release 8.5, design 8, mobile web 8, core tools 7.5, performance 7.5, accessibility 7, code quality 7, data safety and sync 6, security 5.5, monitoring 5.
