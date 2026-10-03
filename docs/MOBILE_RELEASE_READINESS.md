# FinatriX mobile release readiness — source of truth

**Last updated: 2026-10-03 (14:30 AEST).** Everything below was verified against the
repository, signed builds, the live backend, store consoles and
emulator/Simulator/device runs through 2026-10-03. The afternoon pass re-read
both store consoles and production directly; where it corrected an earlier
entry, §12 says what changed and why. The earlier Play findings are recorded
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
| Verdict | **CODE 6 LIVE TO CLOSED TESTERS (3 Oct 11:08); DAY 2 OF 14** | **BUILD 2 IN A READY-FOR-REVIEW DRAFT, NOT SUBMITTED; DEVICE VALIDATION PENDING** |
| P0 technical blockers | 0 | 1 (complete the physical-device flow) |
| P1 verification gaps | 2 (real Google sign-in and deletion) | 2 (real Apple sign-in/revocation, Universal Links on device) |

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
not been run on the paired physical iPhone beyond installation and launch. (The
declared iOS 15.4 minimum *was* run on 2026-10-03 on a real iOS 15.4 runtime —
§5, §11 — and is no longer a gap.)

## 2. Release candidates

| | |
|---|---|
| Git branch | `release/2026-09-12-launch-readiness`; the last code commit is `14d6c4f` (later commits are docs only). **`main` was fast-forwarded to it on 2026-10-03 and is kept on the same commit** ([PR 13](https://github.com/Finatrix/finatrix-kimi-agent/pull/13)), so `main` now contains both tagged release sources and every push to it deploys this code (§9, §12) |
| Android AAB (current) | `android/release-candidates/1.0.0-code6/finatrix-1.0.0-code6.aab` (gitignored), built from **`5e72515`** in a fresh worktree with `npm ci` — SHA-256 `5ad724126d41413bbc468450fd947b05f3897e0bdfd2888bf1ef209e2c187e3b` |
| Android APK (current) | same folder, `finatrix-1.0.0-code6.apk` — SHA-256 `e679d1615a2163ed3d6669f1e2f9e48ea413957adc60e0b3979d003b594c98ce` |
| Android version | **1.0.0 / versionCode 6** — target 36, min 24, not debuggable, permissions unchanged (INTERNET, VIBRATE, signature-level receiver). Approved and **released to Closed testing – Alpha on 2026-10-03 11:08** ("Available to selected testers"); managed publishing remains on. |
| Android signing | upload key `CN=FinatriX`, SHA-256 `FC:B1:BA:96…5F:4C` (verified on the code 6 APK, v2 scheme; AAB jar-verified). Play App Signing re-signs with `B6:E9:AD:C3…EF:FB` |
| Android previous | code 5 from `bff53e1` (tag `android-1.0.0-code5-rc1`) — live on Closed testing (Alpha) |
| iOS build (current) | **1.0.0 (2)** from **`c662ec5`**, fresh worktree + `npm ci`, `ios/release-candidates/1.0.0-2/App.ipa` SHA-256 `4228245f38200c624f48a46ee7a1994308da29ff748504be1bd0a68f0c7b5a87`. Signed "Apple Distribution: Hrishik KS (AY79GYWLDP)"; entitlements: Sign in with Apple, Associated Domains, `get-task-allow` false; MinimumOSVersion 15.4. Uploaded 2026-10-02 23:57 AEST, processed, in the internal TestFlight group and **attached to App Store version 1.0.0** (replacing build 1) |
| iOS previous | build 1 from `b30b4cc` (tag `ios-1.0.0-build1-rc1`) — **rejected by TestFlight beta review on 2026-10-02 (Guideline 2.1(a), no demo account)**; see §6 |
| Code 6 vs build 2 | Identical app code. The two commits between them change only the iOS build number and `scripts/ios-release.sh` |
| Website | Live Worker `finatrix-co` serves the release frontend built from `14d6c4f` (new tool layout, AI consent gate), with `APPLE_APP_ID_PREFIX` and `ANDROID_CERT_SHA256` bound. Built without `VITE_AUTH_APPLE`, as CI builds it, so the website offers Google and email sign-in only; Apple sign-in on the web has never been tested and is not offered. History and versions in §9 |
| AI routing secret | `CAREERS_AI_DATA_COLLECTION` override removed 2026-10-03; deployed `careers-ai` (v45, from `14d6c4f`) defaults to `deny`. The owner delegated the choice after the [AI privacy audit](AI_PRIVACY_AUDIT.md) was provided. `secrets list` shows neither that override nor `CAREERS_AI_MODELS`, and all six models in the default chain list live endpoints on OpenRouter. An authenticated live prompt has still not been sent, so an actual answer under `deny` remains unverified. |
| Since code 6 / build 2 | One app-code commit is in neither binary: `33e4a66` clips the Expenses trend-chart wrapper so a Chart.js canvas that has not resized yet cannot widen the page (seen only on a slow WebKit CI runner at 320px). It ships with the next build; it is not a reason for one. |

## 3. What changed since the 2026-10-01 audit (newest first)

| Change | Why | Evidence |
|---|---|---|
| **`main` brought up to the release branch, and production restored** (2026-10-03) | A push to `main` deployed September sources over the release branch's hand deploys: both association files 404, the iOS origin refused by `careers-ai`, `data_collection: deny` gone, the September website back (§12) | `verify:native` 10 failures → 18/18; `verify:production` green including release parity; `functions list` shows all eight functions redeployed 03:59Z |
| **Deploy now checks what the installed apps need** — a third job, `native-apps`, runs `verify:native` against production after the Worker and edge-function jobs | `verify:production` only looks at what a browser on finatrix.co needs, so the regression above shipped green | `deploy-config.test.ts` pins the job; commit `14d6c4f` |
| **App Review demo account seeded** with three months of fictional budget, expense, net-worth and goal data (the screenshot dataset, October cut at today so nothing is future-dated) | The account held one empty budget month; App Review asks for a demo account "that includes content" | Rendered first in a local guest preview with no console errors; row is 11,070 bytes, 6 keys, 52 expenses. The row it replaced was a single empty budget month (132 bytes) |
| **TestFlight Beta App Review notes written and saved** | They were empty, so the beta reviewer had no way to know the tools work without an account | App Store Connect → TestFlight → Test Information shows "Saved" |
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
| Play testing gate | Personal accounts created after 2023-11-13: 12 testers opted in for 14 continuous days | Live console 3 Oct: "12 testers have currently been opted in for 2 days continuously"; production application disabled |
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
| Declared iOS 15.4 minimum | **PASS on a real iOS 15.4 runtime (19E240), iPhone SE 3rd gen, 2026-10-03.** (a) The exact build 2 Simulator bundle installs and launches (`MinimumOSVersion` 15.4) and renders the dashboard, with no crash report. (b) `scripts/ios-floor-check.mjs` opened 23 routes in Mobile Safari on that runtime (UA `OS 15_4`): 0 uncaught errors, 0 console errors, 0 px horizontal overflow, no blank page; every collapsed "Show calculation, examples & FAQ" section expands; Expenses "+" → sheet → decimal amount → "Add transaction" saves and closes. Also reported by the engine: `100dvh` supported; `DecompressionStream`, `AbortSignal.timeout` and `Array.toSorted` **absent**, which is the exact set `compat.js`, the XLSX inflater and the PDF gate exist for. Not covered: the native shell's plugins (keyboard, status bar, camera, haptics) and PDF/XLSX/CSV import on that engine — those need the phone checklist or a device on iOS 15 |
| Launch / safe areas | PASS — clear of the Dynamic Island and home indicator |
| Sign-in screen | PASS in Simulator before provider enablement; final Apple/Google buttons need a physical-device test |
| Archive / signing / TestFlight | Signed IPA 1.0.0 (2) uploaded, processed and attached to the App Store Connect version. IPA verifies with Apple Distribution signature and the correct entitlements. Installed from TestFlight on the paired iPhone 16 Pro (iOS 26.6.2) on 2026-10-03; `devicectl` reports `co.finatrix.app` version 1.0.0 build 2, and the dashboard launched in iPhone Mirroring. Full physical-device checklist remains open. |
| Universal Links | Both hosts serve HTTP 200 JSON without redirect and with `AY79GYWLDP.co.finatrix.app`; `verify:native` passes 18/18 (restored 2026-10-03 after a 3-hour 404, §12). Apple's CDN (`app-site-association.cdn-apple.com/a/v1/finatrix.co`) serves the correct file. Installation-time device handoff still untested: the Simulator cannot stand in for it — its build is ad-hoc signed with no team and no Associated Domains entitlement, so `simctl openurl` opens Safari whatever the server says |
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
1. The signed build installed and launched from TestFlight on the iPhone 16 Pro,
   but camera, OAuth, import, offline and accessibility flows remain untested there.


   iPhone Mirroring could not be used to run it unattended on 2026-10-03: it
   asks for the Mac login password and the phone was in use.

Resolved 2026-10-03 — **the reviewer sign-in.** iOS 1.0.0 (build 2) is in a
**Ready for Review** draft, not submitted. The earlier doubt about the saved
Sign-In Information was unfounded: a read-only comparison against the stored
password hash confirms the saved value is the demo account's real password,
the account is email-confirmed, and it now holds demo data (§3). Nobody has
yet signed in with it from the app itself — that is one line of the device
checklist. The password is a weak one; change it in the account and in App
Store Connect together if the account outlives review.

**Android** — none in the binary. Code 6 is live to closed testers.

### P1
- iOS: **TestFlight beta review rejected build 1** (Guideline 2.1(a), 2 Oct
  23:41; Apple's message 3 Oct 06:58): the reviewer could not reach all of the
  app and found no demo account. The cause is narrow — TestFlight keeps its own
  "Beta App Review Information", separate from the App Store version's, and
  there "Sign-in required" was unticked with no credentials and no notes. The
  notes are now saved (§3); the two credential fields are **USER ACTION** (§7).
  This gates external TestFlight testers only, not the App Store submission —
  but it is the same reviewer question, so it is a preview of App Review.
- Android: successful native Google PKCE sign-in and end-to-end account deletion
  with a disposable account are not yet verified.
- iOS: successful native Apple sign-in, encrypted token storage/revocation and
  Universal Links are not yet verified on the signed physical-device build.
- iOS: App Availability set to 174 countries/regions, excluding mainland China;
  future regions are not automatically enabled. **The EU trader status is not
  declared** (App Store Connect → Business, checked 2026-10-03: "you need to
  let us know whether or not you are a trader… Complete Compliance
  Requirements"). Until it is, the app is withheld from the 27 EU storefronts;
  it does not block submission or release elsewhere. Free Apps Agreement:
  active to 1 Oct 2027.

### P2
- `careers-ai` now defaults to `data_collection: deny` after removal of the
  `allow` override. Run a live authenticated AI prompt to confirm model
  availability under the stricter routing rule.
- `careers-ai/index.ts` contains literal NUL bytes, so git treats it as binary
  (diffs invisible) — fix with the next backend deploy.
- No Play pre-launch report has ever been generated (codes 1, 5 and now 6); the
  console still shows "Upload artifacts to generate pre-launch reports" three
  hours after code 6 went live to testers. Its settings disable nothing
  ("Don't provide credentials", no deep links). Not a release gate.
- About 20 money fields still use `type="number"` with string state (Goal
  Planner, ParkSmart, PeerCompare and the explorers). They keep their input,
  but the project rule is text + `inputMode="decimal"`; convert post-launch.
- Capacitor logs "Error injecting safe area CSS" once on API 30 (its own timing; nothing visible).
- Gradle DSL deprecations (Gradle 10); DOMPurify low advisory.

## 7. Owner actions, in order

Done on 2026-10-03, no longer owner actions: Android code 6 is published to
the closed track; the Apple reviewer sign-in is verified and the demo account
seeded; production is restored and `main` carries the release (§12).

1. **TestFlight beta credentials (2 minutes).** App Store Connect → TestFlight
   → Test Information → Beta App Review Information: tick "Sign-in required",
   enter the same user name and password as on the App Store version's App
   Review Information, Save. Then add build 2 to the Family and Friends groups
   so it goes to beta review in place of the rejected build 1. An agent cannot
   do this step: it means typing a password into a field.
2. **EU trader status (Apple).** Business → "Complete Compliance Requirements".
   A legal self-declaration, with a phone and email Apple verifies and — for a
   trader — publishes on the EU product page. Until it is made the app is
   simply absent from EU storefronts.
3. **App Availability (Apple) — set.** Free, 174 countries/regions excluding
   mainland China, with future regions off.
4. **Physical device — install complete.** FinatriX 1.0.0 (2) launched from
   TestFlight on the iPhone 16 Pro. Continue the IOS.md checklist: sign in with
   the demo account by email and confirm the seeded data appears; Apple and
   Google sign-in, sign out, relaunch (session restored),
   a finatrix.co link from Notes/Messages opens the app on the right screen,
   camera OCR on a receipt, CSV and PDF import (and a cancelled and an invalid
   file), airplane-mode launch, VoiceOver on tabs/forms/dialogs/results, the
   Expenses "+" and a "Show calculation, examples & FAQ" toggle, then Delete
   account with the Apple account and confirm sign-in starts fresh.
5. **Android sign-in and deletion** — on any Android phone with code 6 (or 5)
   from the closed track: Google sign-in with a throwaway Google account,
   relaunch, sign out, sign in, Delete account, relaunch, sign in again
   (fresh account expected).
6. **AI routing — decided.** The `allow` override was removed, restoring the
   deployed `deny` default. While signed in during step 4, ask FinatriX AI one
   question: an answer confirms a provider is available under `deny`.
7. **Submit for Review (Apple)** — deliberately left as a draft. Press it once
   step 4 passes.
8. **Legal review** — [LEGAL_REVIEW_PACKAGE.md](LEGAL_REVIEW_PACKAGE.md),
   including the Individual-account question under Guideline 5.1.1(ix).
9. **iOS minimum version — decided and now tested.** Keep 15.4 for build 2; it
   ran on a real iOS 15.4 runtime on 2026-10-03 (§5, §11). Re-run
   `node scripts/ios-floor-check.mjs <simulator> dist` against every build you
   intend to ship (IOS.md §9).
10. **Google production access (from ≈ 15 Oct).** When the dashboard enables
    "Apply for production", answer from ANDROID.md §11 with the testers' real
    feedback, then promote code 6 (or a later code) from the closed track.
    Nothing can shorten the 14 days; keeping all 12 testers opted in is the
    only thing that can lengthen them.

## 8. Store gates

| Gate | Status (verified in the consoles 2026-10-03) |
|---|---|
| Play closed testing | **1.0.0 (6) — shorter tool pages, quick add: "Available to selected testers", released 3 Oct 11:08**, Closed testing – Alpha, 178 countries/regions, testers via the Google Group `testers-community`. Publishing overview: "App update published", nothing waiting to publish; managed publishing on |
| Google 12 testers × 14 days | **TIME-GATED** — dashboard 3 Oct: "12 testers have currently been opted in for 2 days continuously"; first two checks ticked; Apply for production disabled. Earliest eligibility ≈ 15 Oct if opt-ins persist |
| Google production access application | Not yet — answer template in ANDROID.md §11 (fill with real tester evidence only) |
| Play pre-launch report | None generated for any build, code 6 included (see §6 P2) |
| Play store listing | Corrected Goal-plan screenshot (`4-goal-plan.png`, uploaded as `4-goal-plan-2026-10-02.png`, 1080×1920) added as the 6th phone screenshot; AI-asset declaration "Don't label" (real capture). Publishing overview on 3 Oct shows "App update published" with nothing in review and nothing waiting to publish, so it went out with code 6. The public listing was not re-opened to confirm the image |
| Apple developer enrolment | **ACTIVE** — Individual Apple Developer Program, Team ID `AY79GYWLDP`, renewal 2 Oct 2027 |
| Apple TestFlight | Build 2 processed and installed on iPhone 16 Pro from the internal group; dashboard launch verified. **Build 1: beta review REJECTED (2.1(a)) for the external groups Family and Friends.** Beta App Review Information: contact saved, review notes saved 3 Oct, "Sign-in required" still unticked (§7 step 1) |
| Apple App Store version 1.0.0 | **Ready for Review draft** (created 3 Oct 00:59), build **2** attached; **Submit for Review has not been clicked, by instruction**. Price **Free**; availability **174 countries/regions except mainland China**; reviewer contact, sign-in and notes saved; the sign-in is verified against the backend and the account is seeded |
| Apple EU trader status (DSA) | **Not declared** — Business page still asks for it. EU storefronts withheld until it is (§7 step 2) |

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
| 2026-10-02 14:29 | Worker `92bcfb66` — **origin unrecorded.** Present in `wrangler deployments list`, absent from every session's notes; the earlier entry "no deploy in this pass, live version still `499018e0`" was already wrong when it was written | `wrangler deployments list` |
| 2026-10-03 00:37–00:50 | **Unintended.** Push of `8110ba6` to `main` ran Deploy from September sources: Worker `2881567e` and six edge functions. Regressions in §12 | Deploy run 37082492390 (green); `verify:native` 10 failures at 03:40 |
| 2026-10-03 03:54 | `main` fast-forwarded to `14d6c4f` (PR 13) | `git ls-remote`; PR shows merged |
| 2026-10-03 ~03:56 | Worker `50e0fb6a` from `14d6c4f`, by hand (`VITE_AUTH_APPLE` unset, as CI builds it), to restore the association files without waiting for CI's browser tests | Both files HTTP 200 JSON on apex and www; `verify:production` green with release parity |
| 2026-10-03 03:59 | Deploy run 37094739696, edge-functions job: `careers-ai` v45, `careers-jobs` v50, `careers-email` v30, `careers-billing-checkout` v18, `account-delete` v8, `apple-token` v5, `analytics-collect` v30 from `14d6c4f` | `functions list`; `verify:native` 18/18 |
| 2026-10-03 03:59 | Data only: App Review demo account's `tool_data` row replaced with the fictional demo dataset (§3) | Row read back: 6 keys, 52 expenses |
| 2026-10-03 04:21 | Deploy run 37094739696, Worker job: Worker `956ffa4d` from `14d6c4f`, built by CI after the full browser suite. **This is the live version.** The run's new `native-apps` job passed on its first real run | `wrangler deployments list`; entry chunk `index-DYJBQAMv.js` byte-identical to the local build of the same commit; afterwards `verify:native` 18/18, `verify:production` green with parity, `verify:deploy` "No drift detected" across all eight functions |

Noted, not caused by these deploys: Cloudflare injects its Web Analytics
beacon and Bot Management script at the edge and the site CSP blocks both
(console errors, nothing runs) — a Cloudflare dashboard setting.

## 10. Reviewer-mode simulation (2026-10-02, revised 2026-10-03)

**Apple.** 2.1 completeness: no placeholder Careers; guest mode works fully; the
reviewer account exists, its saved sign-in is verified and it holds demo data.
Apple's own beta reviewer has already raised 2.1(a) once, against build 1 with
no credentials (§6). 2.3 metadata: APP_STORE_SUBMISSION.md;
six real Simulator screenshots and a processed distribution build are attached.
3.1 payments: nothing sold; pricing routes redirect. 4.2 minimum functionality:
offline tools, on-device OCR, native back, links and haptics — residual risk for
any WebView app. 4.8 login: Apple and Google are offered in the signed iOS build
but successful native Apple sign-in remains untested. 5.1 privacy: nine data
types published by the owner. 5.1.1(v): in-app
deletion and Apple revocation built; a real Apple account test is still needed.
5.1.2(i) AI: explicit consent naming the recipient. Finance: educational
disclaimer and non-prescriptive wording; legal review pending. **Reviewer access
is no longer the gap. Would hold today for physical-device validation — Apple
sign-in, the link handoff and the demo sign-in have never run on a phone — and
carries the open Individual-account question under 5.1.1(ix).**

**Google.** Data safety now includes User IDs, purchase history and AI sharing;
the approved revision and the corrected listing were published on 2 October.
Deletion: in-app and web URL. Payments: none. Target API 36. Permissions
minimal. Financial features: educational budgeting and tracking declared.
App access: guest mode. The updated listing removes the outdated Goal-plan
image, with five remaining screenshots. Production access: 12 testers, 2/14
days. Code 6 is live to those testers. **Would hold today only because the
mandatory testing gate is incomplete (earliest ≈ 15 Oct).**

## 11. iOS minimum version — evidence for the decision

| Factor | Finding |
|---|---|
| Capacitor and plugins | `capacitor-swift-pm` 8.5.2 and all five plugins declare `.iOS(.v15)` |
| Why the app says 15.4 | `100dvh` sizing (Safari 15.4+); the bundle targets Safari 15.4; PDF import is gated to iOS 18+ and says so; XLSX has a bundled inflater for 15.4–16.3 |
| Xcode | Xcode 26.6 archives and validates at 15.4 (build 2 `MinimumOSVersion` 15.4) |
| Runtime test | **Done 2026-10-03.** The earlier belief that this was impractical was wrong: Apple still serves the iOS 15.4 runtime (5.4 GB, signed), it expands without admin rights into `~/Library/Developer/CoreSimulator/Profiles/Runtimes`, and it boots on this macOS 26.6 host. Results in §5; recipe in IOS.md §9. Playwright's WebKit remains current WebKit and is not evidence for the floor |
| Devices affected | iOS 15 is the last release for iPhone 6s/6s Plus, 7/7 Plus and SE (1st gen); raising to 16.0 drops exactly those |
| CI | No iOS job in `.github/workflows` |

**Decision (2026-10-03): keep 15.4.** The signed build already declares this
floor; the bundle targets Safari 15.4, optional PDF import is gated to iOS 18,
and the XLSX inflater covers older WebKit. Raising it would exclude the
iOS-15-only iPhone families and require a new build. This is a supported
configuration judgment that has since been **tested** on an iOS 15.4 runtime
(§5); a physical iOS 15 device would still be the stronger evidence.

## 12. Production regression and repair (2026-10-03)

**What happened.** At 00:37 UTC another session pushed one commit (`8110ba6`,
a deploy-workflow fix) straight to `main`. `main` was 31 commits behind the
release branch, and the Deploy workflow — whose repository secrets had been
set at some point since August, so it now works — shipped it. Every gate
passed. For about three hours production served September's code:

| Regressed | Because | Effect on the apps |
|---|---|---|
| `/.well-known/assetlinks.json` and `apple-app-site-association` → 404 | `main`'s `wrangler.jsonc` had neither `ANDROID_CERT_SHA256` nor `APPLE_APP_ID_PREFIX`; a deploy replaces the Worker's vars | New installs could not verify links; Apple's CDN kept serving its cached good copy, so installed iOS apps were probably unaffected |
| `capacitor://localhost` refused by `careers-ai`, `careers-jobs`, `careers-email`, `careers-billing-checkout`; both app origins refused by `analytics-collect` | `main`'s `_shared/origins.ts` predates the apps | The iOS app's AI panel could not reach its backend; app analytics dropped on both platforms |
| `careers-ai` without `data_collection: deny` | `main`'s source predates it | Prompts could route to providers that retain or train on them |
| Website back on the September bundle | Same deploy | No AI consent gate on the web, none of the release's UX. The apps bundle their own frontend and were unaffected |

`account-delete` and `apple-token` were not in `main`'s deploy list and
survived untouched.

**Why nothing caught it.** `verify:production` checks what a browser on
finatrix.co needs. Only `verify:native` checks the association files and the
app origins, and nothing ran it. This file then recorded "no deploy in this
pass" from memory rather than from `wrangler deployments list`.

**Repair.** `main` merged into the release branch (its commit is a real fix),
`main` fast-forwarded to the result, Worker and all eight functions redeployed
from `14d6c4f` (§9). `verify:native` 18/18, `verify:production` green with
release parity.

**So it cannot recur quietly.** Deploy has a third job that runs
`verify:native` against production after both deploys. `main` now *is* the
release, so a push to it deploys current code. Two rules follow: treat every
push to `main` as a production deploy, and read `wrangler deployments list`
before writing that nothing was deployed.

