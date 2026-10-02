# FinatriX mobile release readiness — source of truth

**Last updated: 2026-10-02.** Everything below was verified against the
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
| Technical readiness | **93%** | **82%** |
| Submission-package readiness | **88%** | **72%** |
| Verdict | **READY FOR CLOSED TEST AFTER CODE 5 UPLOAD** | **TESTFLIGHT BUILD READY; DEVICE VALIDATION PENDING** |
| P0 technical blockers | 0 | 1 (physical TestFlight test) |
| P1 verification gaps | 2 (real Google sign-in and deletion) | 2 (real Apple sign-in/revocation and Universal Links on device) |

Store waiting periods are kept out of these numbers on purpose: Google's
12-testers × 14-days gate decides *when* Android can go public, not whether
the binary is ready.

**Why Android is not 100% technical:** a real successful Google sign-in under
PKCE and account deletion end-to-end have not been run (both need disposable
accounts), and old Android versions have only been exercised with their
factory WebViews. **Why iOS is not higher:** the Apple provider and signed
archive are configured, but real Apple sign-in/revocation, Universal Links and
the complete TestFlight flow have not been tested on the paired physical iPhone.
App Store Connect still needs a reviewer account, contact fields and the owner's
legal attestation before its privacy disclosure can be published.

## 2. Release candidate (frozen)

| | |
|---|---|
| Git commit | `bff53e16fdd6b9a09a3fc890a86fd46b410ad8f2` (branch `release/2026-09-12-launch-readiness`, **not pushed**) |
| Git tag | `android-1.0.0-code5-rc1` (local annotated release-candidate tag) |
| Android AAB | `android/release-candidates/1.0.0-code5/finatrix-1.0.0-code5.aab` (gitignored) — SHA-256 `a10d8d4af786d7e97469673738c0b021da51533d7076e5418b2d31dcc6b2ca46` |
| Android APK | same folder, `finatrix-1.0.0-code5.apk` — SHA-256 `2d15b57b22eda5b85cec85906ef3248940a947afcf65fb570100cfdd567b3e12` |
| Android version | **1.0.0 / versionCode 5** (code 1 is on the Play Alpha track; codes 2–4 were built but never uploaded) |
| Signing | upload key `CN=FinatriX`, SHA-256 `FC:B1:BA:96…5F:4C` (Play App Signing re-signs with `B6:E9:AD:C3…EF:FB`) |
| iOS build | Signed App Store IPA `ios/release-candidates/1.0.0-1/App.ipa`, SHA-256 `5f2f1005b9fbeace5ba29d2650a194d054e76e2cb60706a0aaea5d5afe37b3b3`, from `b30b4cc` (tag `ios-1.0.0-build1-rc1`); uploaded, processed and attached to App Store Connect version 1.0.0. IPA signed by Apple Distribution for `AY79GYWLDP`, with Associated Domains and SIWA entitlements. |
| Backend (live) | `account-delete` v6, `apple-token` v3, `careers-ai` v42, `analytics-collect` v27, `careers-jobs` v47, `careers-email` v27, `careers-billing-checkout` v15, `careers-billing-webhook` v13; `verify:deploy` reports source parity for all eight and all 11 relations |
| Worker / website (live) | `finatrix-co` version `499018e0-38f4-4ab7-9bce-ae5abef79c67` serves `index-BsJKBXA5.js` and `/compat.js`, matching the Android code 5 bundle and local build. `verify:production` passes including the new entry-parity check. |
| AI routing secret | `CAREERS_AI_DATA_COLLECTION=allow` was set by the owner on 2026-10-01 10:58 UTC, so `careers-ai` currently routes **without** the `data_collection: deny` restriction. To restore it: `npx supabase secrets unset CAREERS_AI_DATA_COLLECTION --project-ref uspbsgbggurggsfsontq` |

## 3. What changed since the 2026-10-01 audit

| Change | Why | Evidence |
|---|---|---|
| **App OAuth moved to PKCE** (`src/lib/nativeOAuth.ts`, `AuthContext`, `bridge.ts`) | Tokens returned on `co.finatrix.app://`, a scheme any app can claim (demonstrated on the Simulator). Now a one-time code, redeemed with a verifier that never leaves the device | 19 unit tests, mutation-checked; on the API 36 emulator the authorize URL carries an S256 challenge and cancel / error / injected code / injected token / warm / cold / process-death all behave; live GoTrue accepts the challenge and answers `flow_state_not_found` (not 401) to a bogus code; release logcat has no tokens |
| **Tokens on the custom scheme are refused** | Stops session injection (signing someone into an attacker's account) | `native.test.ts`; the release build shows "Sign-in could not be completed" and writes no session |
| **Android cloud backup excludes WebView storage**; device-to-device transfer keeps everything | The refresh token lives in the same storage as guest data | Local backup transport on API 36: the cloud archive has no `app_webview/` and no data marker; the D2D archive has 53 `app_webview/` entries including the marker |
| **FileProvider** limited to `Pictures/` in app storage | The template granted all of shared storage | `androidDataExposure.test.ts`; export via the system Save picker, CSV and OCR imports still work on-device |
| **Careers hidden in the apps** (nav, palette, footer, drawer, topic cards; route → dashboard; no `/careers` deep-link claim on either platform) | Unlaunched placeholder in a store binary (App Review 2.1) | `careersNativeEntry.test.tsx` (12), `appleAppSite.test.ts`; a `/careers/jobs` link opens Chrome, not the app |
| **Web-only chrome hidden in the apps** (breadcrumbs, duplicate Home) and device-neutral copy | Browser furniture inside an app | Android and iOS sign-in screenshots |
| **Modal dialogs make the page behind them `inert`** | TalkBack swiped out of the AI panel into hidden content (Android WebView ignores `aria-modal`) | TalkBack tree 197 → 51 nodes with the panel open; `inertOutside.test.tsx`; `e2e/dialog-inert.spec.ts` on Chromium, Pixel 7 and WebKit |
| **iOS offers Google only together with Apple** | The Apple button pointed at a disabled provider; 4.8 forbids Google alone | `authProviders.test.tsx`; Simulator sign-in shows email only |
| **Sign in with Apple token revocation** (`apple-token`, `account-delete`, `apple_auth_tokens`) | Guideline 5.1.1(v) | `supabase/functions/_e2e/apple-revocation.ts` 10/10 (real functions; mock Apple verifies every ES256 client secret); unit tests; deployed and probed (503 "Not configured" until the Apple keys exist) |
| **OpenRouter `data_collection: deny`** | Keep prompts away from providers that store or train on them | Deno E2E (fallback chain intact, override works); deployed as `careers-ai` v40 — **currently overridden to `allow`** (§2) |
| **Old-WebView support**: bundle targets Chrome 91 / Safari 15.4 + `public/compat.js`; below WebView 91 a blocking "Update needed" dialog | Factory WebView 91 rendered a blank screen; 66 and 53 cannot run the bundle at all | Android 11 / WebView 91: every tool, Reports, Settings and sign-in render with no console errors. Android 9 / WebView 66 and Android 7 / WebView 53: install and launch without a crash and show the prompt |
| **PDF import is honest on older engines** (pdf.js legacy build; message below Chrome 125 / iOS 18) | pdf.js's official legacy floor | `pdfCompatibility.test.ts`; `e2e/compatibility-import.spec.ts` reads a real PDF on 3 engines |
| **XLSX fallback inflater** (`fflate`, lazy, size-capped) | iOS 15.4–16.3 lack `DecompressionStream('deflate-raw')` | `xlsxImport.test.ts` with `DecompressionStream` removed |
| **Finance wording** — "assumes ~12% a year, not guaranteed"; instruments shown as "examples to research, not a recommendation" | Avoid reading as a personalised recommendation or a promised return | All 546 parity tests unchanged (no rate or formula touched). Final classification is a **LEGAL REVIEW** item |
| **Privacy policy** — Android backup paragraph | Behaviour changed | Live on finatrix.co since Worker `b3436291` |
| **Play screenshot 4 (Goal plan) recaptured** | It showed the old "Suggested instruments / ~12% CAGR" copy | `android/store/screenshots/4-goal-plan.png`, 1080×1920 RGB, fictional data, demo status bar — upload it to the listing |
| **iOS App Store screenshots** | None existed | 6 × 1320×2868, opaque RGB, fictional data — `ios/store/screenshots/`, repeatable via `ios/store/seed-demo-data.py` + `capture-screenshots.sh` |

## 4. Store rules in force (checked 2026-10-01)

| Rule | Requirement | FinatriX |
|---|---|---|
| Play target API | API 36 for new apps/updates since 2026-08-31 | targetSdk 36 — PASS |
| Play testing gate | Personal accounts created after 2023-11-13: 12 testers opted in for 14 continuous days | Personal account per notes — progress UNKNOWN |
| Play account deletion | In-app + web resource | Both — PASS |
| Play payments | Play Billing for digital goods | Nothing sold in-app — PASS |
| App Store SDK | Xcode 26 / iOS 26 SDK | Xcode 26.6 / SDK 26.5 — PASS |
| Apple 4.8 | Equivalent privacy-preserving login when Google is offered | iOS offers no third-party login until Apple is configured — compliant at every stage |
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
| Launch / safe areas | PASS — clear of the Dynamic Island and home indicator |
| Sign-in screen | PASS in Simulator before provider enablement; final Apple/Google buttons need a physical-device test |
| Archive / signing / TestFlight | Signed IPA 1.0.0 (1) uploaded, processed and attached to the App Store Connect version. IPA verifies with Apple Distribution signature and the correct entitlements. Internal TestFlight group **FinatriX Team** lists one invited tester and build **Ready to Test** with no sessions yet. Physical TestFlight installation is **not yet verified** |
| Universal Links | Both hosts serve HTTP 200 JSON without redirect and with `AY79GYWLDP.co.finatrix.app`; `verify:native` passes 18/18. Installation-time device handoff still untested |
| Apple sign-in / revocation | Backend configured — `node scripts/configure-apple-signin.mjs --check` confirms provider, client ID/secret, redirect and five edge secrets. Successful native sign-in, encrypted token storage and revocation still need live tests |
| Camera OCR, VoiceOver, physical device | Not done (Simulator has no camera; physical device after TestFlight) |
| Screenshots | 6 ready (see §3); retake from the final signed build if any screen changes |

### Automated suites (source through `bff53e1`)
| Suite | Result |
|---|---|
| Vitest | 224 files, **3,690 passed**, 14 skipped, exit 0 after regenerating the sitemap (the prior run had one stale `lastmod` mismatch) |
| Playwright full run | **1,299 / 1,301 passed**; two early Chromium layout tests timed out on the loading screen under the long run. Both passed in the isolated single-worker rerun; the complete layout spec passed **18/18**. A previous full run before the final account-deletion edit passed **1,301/1,301**. The latest full run is therefore not labelled an unconditional pass. |
| Targeted e2e after the compatibility work | 18 / 18 latest responsive-finance Chromium rerun; prior 33 / 33 compatibility-import, dialog-inert, command-palette, ios-webkit |
| `npm run lint` / `audit:prod` | clean / clean (xlsx accepted, write-only tripwire) |
| `npm run verify:native` | **18 / 18** — including the real paid Team ID on both AASA hosts; signed-device Universal Links still require testing |
| `npm run verify:production` / `verify:deploy` | green / green; production entry and `/compat.js` exactly match local `dist/` |

## 6. Blockers

### P0
**iOS**
1. No physical-iPhone TestFlight smoke test of the signed build, including camera,
   OAuth, import, offline and accessibility flows.

**Android** — none.

### P1
- Android: successful native Google PKCE sign-in and end-to-end account deletion
  with a disposable account are not yet verified.
- iOS: successful native Apple sign-in, encrypted token storage/revocation and
  Universal Links are not yet verified on the signed physical-device build.
- iOS submission: App Privacy is entered but its **Publish** dialog requires
  the owner's accuracy/legal attestation. Reviewer sign-in and contact fields
  remain blank in App Store Connect.

### P2
- `careers-ai` deny routing is switched off by the owner's secret — decide after one signed-in AI test.
- Capacitor logs "Error injecting safe area CSS" once on API 30 (its own timing; nothing visible).
- A leftover Simulator app `co.finatrix.exportaudit` also claims `co.finatrix.app://` on some simulators — delete it before any iOS OAuth testing.
- Gradle DSL deprecations (Gradle 10); DOMPurify low advisory.

## 7. Owner actions, in order

1. **Apple privacy**: review the nine entered data types and click **Publish** in
   the open App Store Connect modal. The modal explicitly asks for an accuracy
   and legal-compliance attestation, which the owner must make.
2. **Play upload access**: enable Chrome's ChatGPT extension setting **Allow
   access to file URLs**. The browser upload failed locally with “Not allowed”;
   Google has not received the AAB. Then upload **code 5** to the saved closed
   Alpha draft, inspect Play's parsed build/signing and the pre-launch report.
3. **Reviewer account**: set credentials for a disposable account in Supabase
   and enter them, plus reviewer contact information, in App Store Connect.
   The app works as a guest, but its optional signed-in AI needs reviewer access.
4. **Physical device**: install the processed TestFlight build on the paired
   iPhone 16 Pro and run the full camera/OCR, import, login, links, accessibility,
   offline and account-deletion checklist in IOS.md.
5. **AI and deletion**: perform one signed-in AI prompt to decide whether the
   current `CAREERS_AI_DATA_COLLECTION=allow` fallback is acceptable; use
   disposable accounts to verify deletion and Apple token revocation.
6. **Legal review** of the investment wording and developer-account type
   (Apple 5.1.1(ix) for finance apps).

## 8. Store gates

| Gate | Status |
|---|---|
| Google 12 testers × 14 days | **12 testers, 1 continuous day** on 2 Oct in the production-access panel; roughly 13 days remain if opt-ins persist |
| Google production access application | Not yet — answer template in ANDROID.md §11 (fill with real tester evidence only) |
| Apple developer enrolment | **ACTIVE** — Individual Apple Developer Program, Team ID `AY79GYWLDP`, renewal 2 Oct 2027 |
| Apple App Store Connect | App record 6818361672, processed build 1.0.0 (1) attached, six screenshots and metadata saved; internal TestFlight build **Ready to Test**; App Store version **Prepare for Submission**, not submitted |
| Play listing and Data safety | Four approved changes published on 2 Oct; installed closed Alpha remains code 1 |

## 9. Deployment log

| When (UTC) | What | Verified by |
|---|---|---|
| 2026-10-01 08:36–08:38 | Edge functions + Worker `1d3f57a0` from `e1aa533` (peer audit session, owner-approved) | verify:native 14/16, verify:production green |
| 2026-10-01 ~10:20 | Worker `b3436291` from `9201151` (privacy backup paragraph, dialog accessibility, copy) | live entry chunk = local build; verify:production green |
| 2026-10-01 ~10:24 | Migration `20261001000100_apple_auth_tokens`; `apple-token` v1, `account-delete` v4 | anon probe 42501 on the table; 405/401/503 probes; CORS on both app origins; verify:deploy relations 11/11 |
| 2026-10-01 ~10:27 | `careers-ai` v40 (`data_collection: deny`) | boot, CORS for 3 origins, 401 without a session |
| 2026-10-01 10:58 | Owner set `CAREERS_AI_DATA_COLLECTION=allow` | `secrets list` |
| 2026-10-02 ~01:13 | Worker `499018e0` from the current frontend build | `verify:production` passes entry parity and 140 URLs; `verify:deploy` sees no edge/database drift |

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
types are entered, awaiting the owner's Publish attestation. 5.1.1(v): in-app
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
days. **Would hold today because the versionCode 5 AAB is not yet uploaded and
the mandatory testing gate is incomplete.**
