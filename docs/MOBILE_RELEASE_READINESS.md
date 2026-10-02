# FinatriX mobile release readiness — source of truth

**Last updated: 2026-10-03 (04:30 AEST).** Everything below was verified against the
repository, signed builds, the live backend, store consoles and
emulator/Simulator runs on 2026-10-01/02. The live Play findings are recorded
in [PLAY_CONSOLE_RELEASE_2026-10-02.md](PLAY_CONSOLE_RELEASE_2026-10-02.md).
Anything that could not be verified says **UNKNOWN** or **USER ACTION**.

Runbooks: [ANDROID.md](ANDROID.md), [IOS.md](IOS.md),
[APP_STORE_SUBMISSION.md](APP_STORE_SUBMISSION.md). This file records the
verified state, the blockers and what only the account owner can do.

---

## 1. Verdict

| | Android | iOS |
|---|---|---|
| Technical readiness | **95%** | **85%** |
| Submission-package readiness | **90%** | **80%** |
| Verdict | **CODE 6 BUILT; CODE 5 LIVE TO CLOSED TESTERS** | **BUILD 2 IN TESTFLIGHT AND ATTACHED; DEVICE VALIDATION PENDING** |
| P0 technical blockers | 0 | 1 (physical TestFlight test) |
| P1 verification gaps | 2 (real Google sign-in and deletion) | 3 (real Apple sign-in/revocation, Universal Links on device, and the iOS 15.4 runtime floor) |

Store waiting periods are kept out of these numbers on purpose: Google's
12-testers × 14-days gate decides *when* Android can go public, not whether
the binary is ready.

**New in this pass (2026-10-02/03):** the mandatory UX changes — collapsed
secondary information on every tool page and the Expense Tracker's floating
"+" — are in Android code 6 and iOS build 2, verified on Chromium, Pixel 7 and
WebKit (Playwright), on the API 36 emulator with the exact signed code 6 APK,
and in the iOS Simulator (iPhone 17e) with a Release build. **Why Android is
not 100% technical:** a real Google sign-in under PKCE and account deletion
end-to-end still need a disposable account. **Why iOS is not higher:** real
Apple sign-in/revocation, Universal Links and the full TestFlight flow have
not been run on the paired physical iPhone, and the declared iOS 15.4 minimum
has no runtime test (only the iOS 26.5 Simulator runtime is installed).

## 2. Release candidates

| | |
|---|---|
| Git branch | `release/2026-09-12-launch-readiness`, **pushed to `origin`** on 2026-10-03 (head `c662ec5` at push; secrets scan clean) |
| Android AAB (current) | `android/release-candidates/1.0.0-code6/finatrix-1.0.0-code6.aab` (gitignored), built from **`5e72515`** in a fresh worktree with `npm ci` — SHA-256 `5ad724126d41413bbc468450fd947b05f3897e0bdfd2888bf1ef209e2c187e3b` |
| Android APK (current) | same folder, `finatrix-1.0.0-code6.apk` — SHA-256 `e679d1615a2163ed3d6669f1e2f9e48ea413957adc60e0b3979d003b594c98ce` |
| Android version | **1.0.0 / versionCode 6** — target 36, min 24, not debuggable, permissions unchanged (INTERNET, VIBRATE, signature-level receiver). Code 6 exists because the mandatory UX changes are not in code 5. **Not yet uploaded** (see §7) |
| Android signing | upload key `CN=FinatriX`, SHA-256 `FC:B1:BA:96…5F:4C` (verified on the code 6 APK, v2 scheme; AAB jar-verified). Play App Signing re-signs with `B6:E9:AD:C3…EF:FB` |
| Android previous | code 5 from `bff53e1` (tag `android-1.0.0-code5-rc1`) — live on Closed testing (Alpha) |
| iOS build (current) | **1.0.0 (2)** from **`c662ec5`**, fresh worktree + `npm ci`, `ios/release-candidates/1.0.0-2/App.ipa` SHA-256 `4228245f38200c624f48a46ee7a1994308da29ff748504be1bd0a68f0c7b5a87`. Signed "Apple Distribution: Hrishik KS (AY79GYWLDP)"; entitlements: Sign in with Apple, Associated Domains, `get-task-allow` false; MinimumOSVersion 15.4. Uploaded 2026-10-02 23:57 AEST, processed, in the internal TestFlight group and **attached to App Store version 1.0.0** (replacing build 1) |
| iOS previous | build 1 from `b30b4cc` (tag `ios-1.0.0-build1-rc1`) — waiting for TestFlight external (beta) review for the Family and Friends groups |
| Code 6 vs build 2 | Identical app code. The two commits between them change only the iOS build number and `scripts/ios-release.sh` |
| Website | Live Worker `finatrix-co` version `499018e0` serves the code 5 frontend. The new UX is built (`npm run build` at `c662ec5`) but **not deployed** — a production web deploy needs the owner's go-ahead (§7) |
| AI routing secret | `CAREERS_AI_DATA_COLLECTION=allow` (owner, 2026-10-01). Audit and recommendation to restore `deny`: [AI_PRIVACY_AUDIT.md](AI_PRIVACY_AUDIT.md) |

## 3. What changed since the 2026-10-01 audit (newest first)

| Change | Why | Evidence |
|---|---|---|
| **Shorter tool pages** — a reusable `Disclosure` (button + `aria-expanded`/`aria-controls`, `hidden` region) collapses the education block under all 8 tools and the what-if explorers under results (Goals, LifeMap, ParkSmart, PeerCompare, InvestMatch) | The education block alone was 3,500–6,500px of every page at 375px | Page height at 375px, empty state: Budget 12,936 → 6,752; Expenses 9,203 → 4,870; InvestMatch 5,787 → 1,566; ParkSmart 5,176 → 1,967; PeerCompare 5,325 → 2,369; Goals 7,335 → 2,128; LifeMap 9,232 → 3,728; Net Worth 5,054 → 1,443. With a result: Goals 10,950 → 4,701, LifeMap 10,633 → 4,917, PeerCompare 9,239 → 4,581, ParkSmart 8,948 → 5,226. `disclosure.test.tsx`, `toolEducation.test.tsx` (×8 tools), `e2e/compact-tools.spec.ts` on 3 engines |
| **Expense Tracker floating "+"** (`AddExpenseFab`) calling the page's own `openAdd` | Adding a spend must be one tap away from anywhere on the page, on every tab | `addExpenseFab.test.tsx`; e2e: on-screen after a full scroll, no overlap with the AI dock or tab bar, covered by the open sheet, focus returns (WebKit included). API 36 code 6: tap → decimal keypad → save → Monthly spent updates; BACK closes the keyboard, then the sheet |
| **Docks below dialogs** (`--z-fab` 310 → 290) | The AI and Wallet docks painted over the add-transaction sheet's Save button on phones | e2e `elementFromPoint` check; seen fixed on the emulator and in Simulator |
| **Sheet footer flush to the card edge** | Form content scrolled visibly under Save | Visual check at 375px and on API 36 |
| **Dashboard investing copy** | "Put your goal on autopilot — match a portfolio to reach it faster" claimed an outcome | [LEGAL_REVIEW_PACKAGE.md](LEGAL_REVIEW_PACKAGE.md) "Changed in this pass" |
| **App OAuth moved to PKCE** (`src/lib/nativeOAuth.ts`, `AuthContext`, `bridge.ts`) | Tokens returned on `co.finatrix.app://`, a scheme any app can claim (demonstrated on the Simulator). Now a one-time code, redeemed with a verifier that never leaves the device | 19 unit tests, mutation-checked; on the API 36 emulator the authorize URL carries an S256 challenge and cancel / error / injected code / injected token / warm / cold / process-death all behave; live GoTrue accepts the challenge and answers `flow_state_not_found` (not 401) to a bogus code; release logcat has no tokens |
| **Tokens on the custom scheme are refused** | Stops session injection (signing someone into an attacker's account) | `native.test.ts`; the release build shows "Sign-in could not be completed" and writes no session |
| **Android cloud backup excludes WebView storage**; device-to-device transfer keeps everything | The refresh token lives in the same storage as guest data | Local backup transport on API 36: the cloud archive has no `app_webview/` and no data marker; the D2D archive has 53 `app_webview/` entries including the marker |
| **FileProvider** limited to `Pictures/` in app storage | The template granted all of shared storage | `androidDataExposure.test.ts`; export via the system Save picker, CSV and OCR imports still work on-device |
| **Careers hidden in the apps** (nav, palette, footer, drawer, topic cards; route → dashboard; no `/careers` deep-link claim on either platform) | Unlaunched placeholder in a store binary (App Review 2.1) | `careersNativeEntry.test.tsx` (12), `appleAppSite.test.ts`; a `/careers/jobs` link opens Chrome, not the app |
| **Web-only chrome hidden in the apps** (breadcrumbs, duplicate Home) and device-neutral copy | Browser furniture inside an app | Android and iOS sign-in screenshots |
| **Modal dialogs make the page behind them `inert`** | TalkBack swiped out of the AI panel into hidden content (Android WebView ignores `aria-modal`) | TalkBack tree 197 → 51 nodes with the panel open; `inertOutside.test.tsx`; `e2e/dialog-inert.spec.ts` on Chromium, Pixel 7 and WebKit |
| **iOS offers Google only together with Apple** | The Apple button previously pointed at a disabled provider; 4.8 forbids Google alone | `authProviders.test.tsx`; provider and build flag are now enabled, so the signed build offers both; real sign-in still needs testing |
| **Sign in with Apple token revocation** (`apple-token`, `account-delete`, `apple_auth_tokens`) | Guideline 5.1.1(v) | `supabase/functions/_e2e/apple-revocation.ts` 10/10 (real functions; mock Apple verifies every ES256 client secret); unit tests; edge secrets now set, live token storage/revocation still untested |
| **OpenRouter `data_collection: deny`** | Keep prompts away from providers that store or train on them | Deno E2E (fallback chain intact, override works); deployed as `careers-ai` v42 — **currently overridden to `allow`** (§2) |
| **Old-WebView support**: bundle targets Chrome 91 / Safari 15.4 + `public/compat.js`; below WebView 91 a blocking "Update needed" dialog | Factory WebView 91 rendered a blank screen; 66 and 53 cannot run the bundle at all | Android 11 / WebView 91: every tool, Reports, Settings and sign-in render with no console errors. Android 9 / WebView 66 and Android 7 / WebView 53: install and launch without a crash and show the prompt |
| **PDF import is honest on older engines** (pdf.js legacy build; message below Chrome 125 / iOS 18) | pdf.js's official legacy floor | `pdfCompatibility.test.ts`; `e2e/compatibility-import.spec.ts` reads a real PDF on 3 engines |
| **XLSX fallback inflater** (`fflate`, lazy, size-capped) | iOS 15.4–16.3 lack `DecompressionStream('deflate-raw')` | `xlsxImport.test.ts` with `DecompressionStream` removed |
| **Finance wording** — "assumes ~12% a year, not guaranteed"; instruments shown as "examples to research, not a recommendation" | Avoid reading as a personalised recommendation or a promised return | All 546 parity tests unchanged (no rate or formula touched). Final classification is a **LEGAL REVIEW** item |
| **Privacy policy** — Android backup paragraph | Behaviour changed | Live on finatrix.co since Worker `b3436291` |
| **Play screenshot 4 (Goal plan) recaptured** | It showed the old "Suggested instruments / ~12% CAGR" copy | `android/store/screenshots/4-goal-plan.png`, 1080×1920 RGB, fictional data, demo status bar — upload it to the listing |
| **iOS App Store screenshots** | None existed | 6 × 1320×2868, opaque RGB, fictional data — `ios/store/screenshots/`, repeatable via `ios/store/seed-demo-data.py` + `capture-screenshots.sh` |

## 4. Store rules in force (checked 2026-10-02)

| Rule | Requirement | FinatriX |
|---|---|---|
| Play target API | API 36 for new apps/updates since 2026-08-31 | targetSdk 36 — PASS |
| Play testing gate | Personal accounts created after 2023-11-13: 12 testers opted in for 14 continuous days | Live console: 12 testers, 1 continuous day on 2 Oct; production application disabled |
| Play account deletion | In-app + web resource | Both — PASS |
| Play payments | Play Billing for digital goods | Nothing sold in-app — PASS |
| App Store SDK | Xcode 26 / iOS 26 SDK | Xcode 26.6 / SDK 26.5 — PASS |
| Apple 4.8 | Equivalent privacy-preserving login when Google is offered | Signed iOS build offers Apple and Google together; provider configured, live flow pending |
| Apple 5.1.1(v) | In-app deletion; revoke SIWA tokens | Built and deployed; paid team and provider configured, but untested with a real Apple account |
| Apple 5.1.2(i) | Explicit consent before sending personal data to third-party AI | Consent gate enforced in the transport — PASS |

## 5. Verification matrix

### Android (emulators: API 36 / WebView 133; API 30 / 91; API 28 / 66; API 24 / 53)
| Area | Result |
|---|---|
| Release build (code 5) | PASS — target 36, not debuggable, cleartext off, R8 (single dex), no native libs; permissions INTERNET, VIBRATE, signature-level AndroidX receiver; APK v2 signature and AAB JAR signature verified |
| App Links | PASS — `pm get-app-links` verified for both hosts on a fresh release install (code 3; manifest unchanged since) |
| Cold deep link | PASS — `/tools/goals` in 544 ms |
| PKCE | PASS except a real successful Google sign-in (**USER ACTION**) |
| Back, offline cold start (704 ms), process death | PASS |
| Export (Save picker) / CSV import / OCR import | PASS (API 36) |
| TalkBack | PASS after the dialog fix — 0 unnamed controls on 9 screens; the deletion screen needs a signed-in account (**USER ACTION**) |
| Compatibility | Exact code 5 signed APK on API 36 / WebView 133 and API 30 / WebView 91 renders Dashboard, Budget, Expenses, Goals and Net Worth without logged app-process JS or fatal errors. Net Worth App Link works directly on API 36; API 30 shows the platform's chooser and opens in FinatriX when selected. API 28 and 24 showed the update prompt in the previous code 4 test (native code unchanged). Old Android **with an updated WebView**: Play pre-launch report or a physical device (**USER ACTION**) |
| Account deletion end-to-end | **USER ACTION** (needs a disposable account) |

### iOS (Simulator iPhone 17 Pro Max, iOS 26.5)
| Area | Result |
|---|---|
| Simulator Release build | PASS |
| Declared iOS 15.4 minimum | NOT VERIFIED on iOS 15.4: Xcode only has the iOS 26.5 Simulator runtime; the bundle is compiled for Safari 15.4, and optional PDF import is gated to iOS 18+ |
| Launch / safe areas | PASS — clear of the Dynamic Island and home indicator |
| Sign-in screen | PASS in Simulator before provider enablement; final Apple/Google buttons need a physical-device test |
| Archive / signing / TestFlight | Signed IPA 1.0.0 (1) uploaded, processed and attached to the App Store Connect version. IPA verifies with Apple Distribution signature and the correct entitlements. Internal TestFlight group **FinatriX Team** lists one invited tester and build **Ready to Test** with no sessions yet. Physical TestFlight installation is **not yet verified** |
| Universal Links | Both hosts serve HTTP 200 JSON without redirect and with `AY79GYWLDP.co.finatrix.app`; `verify:native` passes 18/18. Installation-time device handoff still untested |
| Apple sign-in / revocation | Backend configured — `node scripts/configure-apple-signin.mjs --check` confirms provider, client ID/secret, redirect and five edge secrets. Successful native sign-in, encrypted token storage and revocation still need live tests |
| Camera OCR, VoiceOver, physical device | Not done (Simulator has no camera; physical device after TestFlight) |
| Screenshots | 6 ready (see §3); retake from the final signed build if any screen changes |

### Automated suites (source through `c662ec5`)
| Suite | Result |
|---|---|
| Vitest | 227 files, **3,727 passed**, 14 skipped (includes the 37 new disclosure, education and floating-add tests), exit 0 |
| Playwright full run (Chromium + Pixel 7) | **1,210 / 1,218** on the first pass; the 8 failures were four specs × two projects driving explorers that are now behind a toggle. Specs updated; the affected files (`finance-upgrade`, `sitewide-automation`, `result-explainer`) then passed **100 / 100** on Chromium, Pixel 7 and WebKit |
| New e2e `compact-tools.spec.ts` | **12 / 12** on each of Chromium, Pixel 7 and WebKit |
| `npm run lint` | clean |
| Android emulator (API 36 / WebView 133, exact signed code 6 APK) | cold start 856 ms; App Link to `/tools/expenses` 1,081 ms; "+" exposed to TalkBack as button "Add expense"; add/save/keyboard/BACK; collapsed education expands; logcat: no app errors, no tokens, emails or auth headers |
| iOS Simulator (iPhone 17e, iOS 26.5, Release build of `c662ec5`) | "+" clear of the home indicator and tab bar on the Expenses tabs, absent elsewhere; exposed by WebKit as "Add expense" (pop-up button, from `aria-haspopup="dialog"`); dimmed under the sign-in prompt. The Simulator MCP is broken by an Xcode update, so taps were limited |

## 6. Blockers

### P0
**iOS**
1. No physical-iPhone TestFlight smoke test of the signed build, including camera,
   OAuth, import, offline and accessibility flows.
2. App Store submission blocked by missing reviewer credentials and contact
   details (App Store Connect's own "Unable to Add for Review" list: User name,
   Password, First name, Last name; phone and email are also blank).

**Android** — none in the binary. Code 6 must be uploaded before the
production application so the reviewed build carries the mandatory UX.

### P1
- Android: successful native Google PKCE sign-in and end-to-end account deletion
  with a disposable account are not yet verified.
- iOS: successful native Apple sign-in, encrypted token storage/revocation and
  Universal Links are not yet verified on the signed physical-device build.
- iOS: the declared iOS 15.4/WKWebView minimum has no actual runtime or device
  test; only iOS 26.5 Simulator is installed (evidence in §11).
- iOS: App Availability (countries) not set — an owner decision (§7).

### P2
- `careers-ai` routes with `data_collection: allow` — recommendation to restore
  `deny` in [AI_PRIVACY_AUDIT.md](AI_PRIVACY_AUDIT.md).
- `careers-ai/index.ts` NUL bytes — **fixed in the repo, not deployed.** The two
  literal NULs in the `promptHash` template are now `\u0000` escapes, so git
  diffs the file as text again. The runtime string is unchanged: Deno ran the
  old and new `promptHash` source on 5 samples and got identical SHA-256s, which
  also matched an independent Python hash, so every `ai_response_cache` key
  stays the same. `src/test/no-nul-bytes.test.ts` now fails on any raw NUL in
  `src`, `supabase`, `worker` or `scripts`. Deployed `careers-ai` v42 is
  byte-identical to the pre-fix file (downloaded 2026-10-03), so the repo is
  out of parity with production until it is redeployed (§7 item 8). That
  redeploy ships this change and nothing else.
- `deploy.yml` ("Deploy authenticated edge functions") deploys `careers-ai`,
  `careers-jobs` and `careers-email` without `--no-verify-jwt`. All three run
  live with `verify_jwt: false` and check the caller themselves (`auth.getUser`).
  The workflow runs on every push to `main` and holds `SUPABASE_ACCESS_TOKEN`,
  so the next merge flips them to `true`. The `account-delete` comment in the
  same file says the gateway's legacy check can falsely 401 this project's
  ES256 sessions. That was not tested for these three. Decide before the next
  merge to `main`.
- No Play pre-launch report has ever been generated (codes 1 and 5); the console
  shows "Upload artifacts to generate pre-launch reports". Re-check after code 6.
- About 20 money fields still use `type="number"` with string state (Goal
  Planner, ParkSmart, PeerCompare and the explorers). They keep their input,
  but the project rule is text + `inputMode="decimal"`; convert post-launch.
- Capacitor logs "Error injecting safe area CSS" once on API 30 (its own timing; nothing visible).
- Gradle DSL deprecations (Gradle 10); DOMPurify low advisory.

## 7. Owner actions, in order

1. **Upload Android code 6** — Play Console → Test and release → Testing →
   Closed testing → Alpha → Create new release → upload
   `android/release-candidates/1.0.0-code6/finatrix-1.0.0-code6.aab` → release
   name "1.0.0 (6) — shorter tool pages, quick add" → Next → Save → Publishing
   overview → Send for review. Do not remove testers or change the track's
   audience. (Agent cannot: the AAB is 11.06 MB, over the browser upload tool's
   10 MB limit, and no Play API service account exists.)
2. **Reviewer account (Apple)** — create a disposable email/password account on
   finatrix.co, then App Store Connect → FinatriX → iOS App 1.0.0 → App Review
   Information: enter its user name and password; Contact Information: first
   name, last name, phone, email. Save.
3. **App Availability (Apple)** — Pricing and Availability → Set Up
   Availability. Suggested: all countries/regions except mainland China (needs an
   ICP filing); EU storefronts need the trader-status declaration under
   Business → Agreements. Price is already set to Free.
4. **Physical device** — on the iPhone 16 Pro open TestFlight, install
   FinatriX 1.0.0 (2) (internal group "FinatriX Team"), then run the IOS.md
   checklist: Apple and Google sign-in, sign out, relaunch (session restored),
   a finatrix.co link from Notes/Messages opens the app on the right screen,
   camera OCR on a receipt, CSV and PDF import (and a cancelled and an invalid
   file), airplane-mode launch, VoiceOver on tabs/forms/dialogs/results, the
   Expenses "+" and a "Show calculation, examples & FAQ" toggle, then Delete
   account with the Apple account and confirm sign-in starts fresh.
5. **Android sign-in and deletion** — on any Android phone with code 6 (or 5)
   from the closed track: Google sign-in with a throwaway Google account,
   relaunch, sign out, sign in, Delete account, relaunch, sign in again
   (fresh account expected).
6. **AI routing decision** — [AI_PRIVACY_AUDIT.md](AI_PRIVACY_AUDIT.md) §5.
7. **Web deploy (go-ahead needed)** — the new UX is built from `c662ec5`;
   `npm run build && npx wrangler deploy && npm run verify:production`.
   Rollback: `npx wrangler rollback 499018e0-38f4-4ab7-9bce-ae5abef79c67`.
8. **`careers-ai` redeploy (go-ahead needed)** — brings production back into
   parity with the repo after the NUL-byte fix (§6 P2). Cache keys and behaviour
   are unchanged. Keep the live `verify_jwt: false`:
   `npx supabase functions deploy careers-ai --no-verify-jwt --project-ref uspbsgbggurggsfsontq`.
   Without the flag the CLI default is `true` (there is no `supabase/config.toml`).
   Then check: `npx supabase functions list` shows v43 with `verify_jwt: false`,
   an `OPTIONS` preflight from `https://finatrix.co` succeeds, a `POST` without a
   session returns 401, and one signed-in AI question gets an answer.
9. **Legal review** — [LEGAL_REVIEW_PACKAGE.md](LEGAL_REVIEW_PACKAGE.md),
   including the Individual-account question under Guideline 5.1.1(ix).
10. **iOS minimum version** — keep 15.4 (test on an iOS 15 device) or raise it
   (§11).

## 8. Store gates

| Gate | Status (verified in the consoles 2026-10-03 ~00:00 AEST) |
|---|---|
| Play closed testing | **1.0.0 (5) "Available to testers on Google Play"**, Closed testing – Alpha, full roll-out, 178 countries/regions, updated 2 Oct 19:29. Stale empty drafts remain on Alpha (1.0.0 (1)) and Internal |
| Google 12 testers × 14 days | **TIME-GATED** — dashboard: "12 testers have currently been opted in for 1 day"; first two checks ticked; Apply for production disabled. Earliest eligibility ≈ 15–16 Oct if opt-ins persist |
| Google production access application | Not yet — answer template in ANDROID.md §11 (fill with real tester evidence only) |
| Play pre-launch report | None generated for any build (see §6 P2) |
| Play store listing | Corrected Goal-plan screenshot (`4-goal-plan.png`, uploaded as `4-goal-plan-2026-10-02.png`, 1080×1920) added as the 6th phone screenshot; AI-asset declaration "Don't label" (real capture); **sent for review 2026-10-03** — BLOCKED — GOOGLE. Managed publishing is on, so it waits for a Publish click after approval |
| Apple developer enrolment | **ACTIVE** — Individual Apple Developer Program, Team ID `AY79GYWLDP`, renewal 2 Oct 2027 |
| Apple TestFlight | Build 2 processed, internal group "FinatriX Team" ("Ready to Submit" for external). Build 1 "Waiting for Review" for external groups Family and Friends |
| Apple App Store version 1.0.0 | **Prepare for Submission**; build **2** attached (saved); price **Free** (175 regions, takes effect at Ready for Sale); availability not set; reviewer sign-in and contact fields blank — Add for Review refused for exactly those |

## 9. Deployment log

| When (UTC) | What | Verified by |
|---|---|---|
| 2026-10-01 08:36–08:38 | Edge functions + Worker `1d3f57a0` from `e1aa533` (peer audit session, owner-approved) | verify:native 14/16, verify:production green |
| 2026-10-01 ~10:20 | Worker `b3436291` from `9201151` (privacy backup paragraph, dialog accessibility, copy) | live entry chunk = local build; verify:production green |
| 2026-10-01 ~10:24 | Migration `20261001000100_apple_auth_tokens`; `apple-token` v1, `account-delete` v4 | anon probe 42501 on the table; 405/401/503 probes; CORS on both app origins; verify:deploy relations 11/11 |
| 2026-10-01 ~10:27 | `careers-ai` v40 (`data_collection: deny`) | boot, CORS for 3 origins, 401 without a session |
| 2026-10-01 10:58 | Owner set `CAREERS_AI_DATA_COLLECTION=allow` | `secrets list` |
| 2026-10-02 ~01:13 | Worker `499018e0` from the current frontend build | `verify:production` passes entry parity and 140 URLs; `verify:deploy` sees no edge/database drift |
| 2026-10-02 13:57 | iOS 1.0.0 (2) uploaded to App Store Connect (not a deploy; nothing public) | `upload.log` "Upload succeeded"; TestFlight shows build 2 processed |
| — | No web, Worker, edge-function or database deploy in this pass | `wrangler deployments list`: live version still `499018e0` |

Noted, not caused by these deploys: Cloudflare injects its Web Analytics
beacon and Bot Management script at the edge and the site CSP blocks both
(console errors, nothing runs) — a Cloudflare dashboard setting.

## 10. Reviewer-mode simulation (2026-10-02)

**Apple.** 2.1 completeness: no placeholder Careers; guest mode works fully; a
reviewer account is still to be created. 2.3 metadata: APP_STORE_SUBMISSION.md;
six real Simulator screenshots and a processed distribution build are attached.
3.1 payments: nothing sold; pricing routes redirect. 4.2 minimum functionality:
offline tools, on-device OCR, native back, links and haptics — residual risk for
any WebView app. 4.8 login: Apple and Google are offered in the signed iOS build
but successful native Apple sign-in remains untested. 5.1 privacy: nine data
types published by the owner. 5.1.1(v): in-app
deletion and Apple revocation built; a real Apple account test is still needed.
5.1.2(i) AI: explicit consent naming the recipient. Finance: educational
disclaimer and non-prescriptive wording; legal review pending. **Would reject
today for missing reviewer access and physical-device validation.**

**Google.** Data safety now includes User IDs, purchase history and AI sharing;
the approved revision and the corrected listing were published on 2 October.
Deletion: in-app and web URL. Payments: none. Target API 36. Permissions
minimal. Financial features: educational budgeting and tracking declared.
App access: guest mode. The updated listing removes the outdated Goal-plan
image, with five remaining screenshots. Production access: 12 testers, 1/14
days. **Would hold today because code 5 is still in review and
the mandatory testing gate is incomplete.**

## 11. iOS minimum version — evidence for the decision

| Factor | Finding |
|---|---|
| Capacitor and plugins | `capacitor-swift-pm` 8.5.2 and all five plugins declare `.iOS(.v15)` |
| Why the app says 15.4 | `100dvh` sizing (Safari 15.4+); the bundle targets Safari 15.4; PDF import is gated to iOS 18+ and says so; XLSX has a bundled inflater for 15.4–16.3 |
| Xcode | Xcode 26.6 archives and validates at 15.4 (build 2 `MinimumOSVersion` 15.4) |
| Runtime test | **None.** Only the iOS 26.5 Simulator runtime is installed; Playwright's WebKit is current WebKit, not the 15.4 engine. An older runtime is a multi-GB download from Apple and may not run on this macOS 26.6 host |
| Devices affected | iOS 15 is the last release for iPhone 6s/6s Plus, 7/7 Plus and SE (1st gen); raising to 16.0 drops exactly those |
| CI | No iOS job in `.github/workflows` |

Both options are technically valid: **A** keep 15.4 and test it on an iOS 15.x
device (or a downloaded 15.x runtime, if it runs); **B** raise to 16.0 so the
declared floor matches what can be tested, at the cost of the three iOS-15-only
iPhone families. Changing it means a new build. Owner decision.
