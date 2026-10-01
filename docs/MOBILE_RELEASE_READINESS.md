# FinatriX mobile release readiness — source of truth

**Last updated: 2026-10-02.** Everything below was verified against the
repository, signed builds, the live backend and emulator/Simulator runs on
2026-10-01/02. Anything that could not be verified says **UNKNOWN** or
**USER ACTION**; nothing is marked PASS on a claim alone.

Runbooks: [ANDROID.md](ANDROID.md), [IOS.md](IOS.md),
[APP_STORE_SUBMISSION.md](APP_STORE_SUBMISSION.md). This file records the
verified state, the blockers and what only the account owner can do.

---

## 1. Verdict

| | Android | iOS |
|---|---|---|
| Technical readiness | **92%** | **68%** |
| Submission-package readiness | **80%** | **35%** |
| Verdict | **READY FOR CLOSED TEST** | **NOT READY** |
| P0 technical blockers | 0 | 3 (Apple sign-in, signing/archive, physical-device test) |
| P1 technical blockers | 0 | 1 (Universal Links need the Team ID) |

Store waiting periods are kept out of these numbers on purpose: Google's
12-testers × 14-days gate decides *when* Android can go public, not whether
the binary is ready.

**Why Android is not 100% technical:** a real successful Google sign-in under
PKCE and account deletion end-to-end have not been run (both need the owner's
own accounts), and old Android versions have only been exercised with their
factory WebViews. **Why iOS is not higher:** the only Apple team on this Mac
is a free Personal Team — no Sign in with Apple, Associated Domains, signing
for distribution or TestFlight until the paid membership (purchased, awaiting
enrolment) is active.

## 2. Release candidate (frozen)

| | |
|---|---|
| Git commit | `18731721edd7cdc3ff3cf41186afc6502c48a073` (branch `release/2026-09-12-launch-readiness`, **not pushed**) |
| Git tag | none yet — tag when the AAB below is uploaded: `git tag android-1.0.0-code4 1873172` |
| Android AAB | `android/release-candidates/1.0.0-code4/finatrix-1.0.0-code4.aab` (gitignored) — SHA-256 `4659f31d28f8a134cc0b3c9ae45d3f1567b9a88e26d7e63b7b3221507e23ec6c` (11,054,614 B) |
| Android APK | same folder, `finatrix-1.0.0-code4.apk` — SHA-256 `e9fe84a25e38708b111c3f4b2f2e3caa218a28633d59eece4d6ca44a8664b873` (10,579,691 B) |
| Android version | **1.0.0 / versionCode 4** (code 1 is on the Play Alpha track; codes 2 and 3 were built but never uploaded — skip them) |
| Signing | upload key `CN=FinatriX`, SHA-256 `FC:B1:BA:96…5F:4C` (Play App Signing re-signs with `B6:E9:AD:C3…EF:FB`) |
| iOS build | Release for Simulator only (unsigned); no archive possible yet |
| Backend (live) | `account-delete` v4, `apple-token` v1, `careers-ai` v40, `analytics-collect` v25, `careers-jobs` v45, `careers-email` v25, `careers-billing-checkout` v13, `careers-billing-webhook` v11; migration `20261001000100_apple_auth_tokens` applied |
| Worker / website (live) | `finatrix-co` version `b3436291-b6a4-45a0-9771-4ec6dd49b6e7` = commit `9201151`. **Not** yet the compatibility work in `1873172` (the apps bundle their own copy; deploying it to the website is READY FOR OWNER APPROVAL) |
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
| Apple 5.1.1(v) | In-app deletion; revoke SIWA tokens | Built and deployed; untested with a real Apple account (no paid team yet) |
| Apple 5.1.2(i) | Explicit consent before sending personal data to third-party AI | Consent gate enforced in the transport — PASS |

## 5. Verification matrix

### Android (emulators: API 36 / WebView 133; API 30 / 91; API 28 / 66; API 24 / 53)
| Area | Result |
|---|---|
| Release build (code 4) | PASS — target 36, not debuggable, cleartext off, R8 (single dex), no native libs; permissions INTERNET, VIBRATE, signature-level AndroidX receiver |
| App Links | PASS — `pm get-app-links` verified for both hosts on a fresh release install (code 3; manifest unchanged since) |
| Cold deep link | PASS — `/tools/goals` in 544 ms |
| PKCE | PASS except a real successful Google sign-in (**USER ACTION**) |
| Back, offline cold start (704 ms), process death | PASS |
| Export (Save picker) / CSV import / OCR import | PASS (API 36) |
| TalkBack | PASS after the dialog fix — 0 unnamed controls on 9 screens; the deletion screen needs a signed-in account (**USER ACTION**) |
| Compatibility | API 36 full; API 30 with factory WebView 91 renders every screen; API 28 and 24 show the update prompt. Old Android **with an updated WebView**: Play pre-launch report or a physical device (**USER ACTION**) |
| Account deletion end-to-end | **USER ACTION** (needs a disposable account) |

### iOS (Simulator iPhone 17 Pro Max, iOS 26.5)
| Area | Result |
|---|---|
| Simulator Release build | PASS |
| Launch / safe areas | PASS — clear of the Dynamic Island and home indicator |
| Sign-in screen | PASS — email only until Apple is configured; no orphan divider; callback errors shown |
| Archive / signing / TestFlight | BLOCKED — paid team pending |
| Universal Links | Endpoint ready on both hosts (plain-text 404 by design until `APPLE_APP_ID_PREFIX` is set); a dummy Team ID served correct JSON on both hosts in a local Worker |
| Apple sign-in / revocation | BLOCKED — needs the paid team, Services ID and `.p8` |
| Camera OCR, VoiceOver, physical device | Not done (Simulator has no camera; physical device after TestFlight) |
| Screenshots | 6 ready (see §3); retake from the final signed build if any screen changes |

### Automated suites (commit `1873172`)
| Suite | Result |
|---|---|
| Vitest | 224 files, **3,687 passed**, 14 skipped, exit 0 |
| Playwright full run (at `cb224af`) | 1,292 / 1,295 in 9.3 min — the 3 failures (palette focus return) were a real regression, fixed in `9201151`; that spec then 12/12 on all engines. **No WebKit page-load timeouts** — the earlier flake did not reproduce at 3 workers, which points at host load rather than the app |
| Targeted e2e after the compatibility work | 33 / 33 (compatibility-import, dialog-inert, command-palette, ios-webkit) |
| `npm run lint` / `audit:prod` | clean / clean (xlsx accepted, write-only tripwire) |
| `npm run verify:native` | 16 / 18 — only the two iOS association checks (Team ID) |
| `npm run verify:production` / `verify:deploy` | green / green |

## 6. Blockers

### P0
**iOS**
1. Sign in with Apple not configured (paid team, Services ID, `.p8`, Supabase provider, `VITE_AUTH_APPLE=1`).
2. No signed Release archive / TestFlight build (paid team).
3. No physical-iPhone smoke test (after TestFlight).

**Android** — none.

### P1
- iOS Universal Links: set `APPLE_APP_ID_PREFIX` in `wrangler.jsonc` and deploy the Worker once the Team ID exists.

### P2
- Website still on `9201151`; deploy `1873172` so finatrix.co gets the same compatibility work as the apps (READY FOR OWNER APPROVAL).
- `careers-ai` deny routing is switched off by the owner's secret — decide after one signed-in AI test.
- Capacitor logs "Error injecting safe area CSS" once on API 30 (its own timing; nothing visible).
- A leftover Simulator app `co.finatrix.exportaudit` also claims `co.finatrix.app://` on some simulators — delete it before any iOS OAuth testing.
- Gradle DSL deprecations (Gradle 10); DOMPurify low advisory.

## 7. Owner actions, in order

1. **Apple** (when enrolment completes): Xcode → Settings → Accounts → add the paid team and send the **Team ID**. Create the Services ID (e.g. `co.finatrix.signin`, return URL `https://uspbsgbggurggsfsontq.supabase.co/auth/v1/callback`) and a Sign in with Apple key (`.p8` + Key ID). Enable the Apple provider in Supabase. Set edge secrets `APPLE_SIWA_TEAM_ID`, `APPLE_SIWA_KEY_ID`, `APPLE_SIWA_CLIENT_ID`, `APPLE_SIWA_PRIVATE_KEY`, `APPLE_TOKEN_ENC_KEY` (generate with `openssl rand -base64 32`). Never paste the `.p8` into chat, the repo or docs.
2. **AI**: sign in and ask FinatriX AI one question; then keep or `unset` `CAREERS_AI_DATA_COLLECTION` (§2).
3. **Deletion end-to-end** on Android (and later iOS): create a throwaway account, add a budget, expenses and a résumé if offered, delete it from Profile, and confirm sign-in no longer works. Tell me when, and I will verify the rows and storage are gone.
4. **Play Console**: confirm the account type, tester count and each tester's opt-in date; upload `finatrix-1.0.0-code4.aab` to the closed track (11 MB — upload by hand); update Data Safety from ANDROID.md §9 (adds User IDs and Purchase history); review the pre-launch report for older Android versions.
5. **Legal review** of the investment wording and of the developer-account type (Apple 5.1.1(ix) for finance apps).

## 8. Store gates

| Gate | Status |
|---|---|
| Google 12 testers × 14 days | UNKNOWN — owner to confirm in Play Console |
| Google production access application | Not yet — answer template in ANDROID.md §11 (fill with real tester evidence only) |
| Apple developer enrolment | Purchased, awaiting confirmation |
| Apple App Review | NOT YET SUBMITTED |

## 9. Deployment log

| When (UTC) | What | Verified by |
|---|---|---|
| 2026-10-01 08:36–08:38 | Edge functions + Worker `1d3f57a0` from `e1aa533` (peer audit session, owner-approved) | verify:native 14/16, verify:production green |
| 2026-10-01 ~10:20 | Worker `b3436291` from `9201151` (privacy backup paragraph, dialog accessibility, copy) | live entry chunk = local build; verify:production green |
| 2026-10-01 ~10:24 | Migration `20261001000100_apple_auth_tokens`; `apple-token` v1, `account-delete` v4 | anon probe 42501 on the table; 405/401/503 probes; CORS on both app origins; verify:deploy relations 11/11 |
| 2026-10-01 ~10:27 | `careers-ai` v40 (`data_collection: deny`) | boot, CORS for 3 origins, 401 without a session |
| 2026-10-01 10:58 | Owner set `CAREERS_AI_DATA_COLLECTION=allow` | `secrets list` |

Noted, not caused by these deploys: Cloudflare injects its Web Analytics
beacon and Bot Management script at the edge and the site CSP blocks both
(console errors, nothing runs) — a Cloudflare dashboard setting.

## 10. Reviewer-mode simulation (2026-10-02)

**Apple.** 2.1 completeness: no placeholder Careers; guest mode works fully; a
demo account is still to be created (owner). 2.3 metadata: APP_STORE_SUBMISSION.md;
the screenshots are the real app. 3.1 payments: nothing sold; pricing routes
redirect. 4.2 minimum functionality: offline tools, on-device OCR, native back,
links and haptics — residual risk for any WebView app. 4.8 login: compliant at
every stage. 5.1 privacy: answers corrected (User ID, Purchase History, §8 of
APP_STORE_SUBMISSION.md). 5.1.1(v): in-app deletion and Apple revocation built;
must be tested with a real Apple account before submission. 5.1.2(i) AI:
explicit consent naming the recipient. Finance: educational disclaimer and
non-prescriptive wording; legal review pending. **Would reject today for the
missing Apple sign-in and the absence of any build.**

**Google.** Data Safety: add User IDs and Purchase history before the next
release. Deletion: in-app and web URL. Payments: none. Target API 36.
Permissions minimal. Financial features: budgeting and education only. App
access: guest mode. Content rating: answer the AI question "Yes". Misleading
claims: none found. Testing eligibility: UNKNOWN. **Would hold today on the
stale Data Safety form and the listing's old Goal-plan screenshot until the
new one is uploaded.**
