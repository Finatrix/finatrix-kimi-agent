# FinatriX mobile release readiness — source of truth

**Last audited: 2026-10-01** (policy sources read the same day). Everything below
was re-derived from the repository, fresh builds, the live backend and device
runs on that date. Earlier reports and memories were treated as claims to
re-verify, not facts. Where something could not be verified it says **UNKNOWN**.

How-to runbooks stay in [ANDROID.md](ANDROID.md), [IOS.md](IOS.md) and
[APP_STORE_SUBMISSION.md](APP_STORE_SUBMISSION.md). This file records the
**verified state**, the blockers, and what only the account owner can do.

---

## 1. Verdict

| | Android | iOS |
|---|---|---|
| Technical readiness | **~82%** | **~55%** |
| Public-release readiness | **~35%** | **~10%** |
| Verdict | READY AFTER USER ACTION (production-access gate, new build upload) | NOT READY |

Technical readiness and publication readiness are kept apart on purpose: the
Android binary is close to done, but Play's closed-testing gate (status UNKNOWN)
decides when it can go public.

## 2. Store rules in force (verified 2026-10-01, official sources)

| Rule | Current requirement | FinatriX |
|---|---|---|
| Play target API | New apps and updates must target **API 36** since 2026-08-31 (extension to 2026-11-01 on request) | targetSdk 36 — PASS |
| Play testing gate | Personal accounts created after 2023-11-13: **12 testers opted in for 14 consecutive days** before applying for production | Applies if the account is personal and new (notes say personal) — status UNKNOWN |
| Play account deletion | In-app path **and** a web resource; delete associated data; disclose retention | Both exist — PASS (web: `/privacy#delete-account`) |
| Play Payments | Play Billing for digital goods; no steering | Nothing sold in-app — PASS |
| App Store SDK | Uploads built with **Xcode 26+ / iOS 26 SDK** since 2026-04-28; minimum target iOS 13+ since 2026-09-09 | Xcode 26.6, iOS SDK 26.5, target 15.4 — PASS |
| Apple 4.8 | Third-party login (Google) requires an equivalent privacy-preserving option | Sign in with Apple shipped in UI, **disabled on backend** — FAIL |
| Apple 5.1.1(v) | In-app deletion; SIWA apps must revoke Apple tokens via REST | In-app deletion blocked on iOS by CORS; no Apple revocation — FAIL |
| Apple 5.1.2(i) | Disclose and obtain **explicit permission** before sharing personal data with third-party AI | Fixed in code this audit (consent prompt) — PASS in code, not yet shipped |
| Apple age rating | New questionnaire answers were due 2026-01-31 | USER ACTION |

## 3. Release candidates (built 2026-10-01 from the working tree)

### Android
| | |
|---|---|
| Application ID | `co.finatrix.app` |
| Version | 1.0.0 (versionCode **2** — code 1 is reportedly on the Play Alpha track, UNKNOWN) |
| SDK | min 24 · target 36 · compile 36 |
| Toolchain | AGP 8.13.0, Gradle 8.14.3, JDK 21 (Homebrew openjdk@21; the system default is 17), Java 21 source/target, Capacitor 8.5.2 |
| Artifact | `android/app/build/outputs/bundle/release/app-release.aab` — see §9 for size and hash |
| Signing | Upload key `CN=FinatriX`, SHA-256 `FC:B1:BA:96…5F:4C`, SHA384withRSA, valid to 2054 |
| Permissions | `INTERNET`, `VIBRATE` (haptics), `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` (AndroidX, signature-level) |
| Native code | none (no `.so`; no ABI or 16 KB page-size exposure) |
| Release flags | not debuggable (verified on device), R8 + resource shrinking on, cleartext off |

### iOS
| | |
|---|---|
| Bundle ID | `co.finatrix.app` |
| Version | 1.0.0 (build 1) |
| Deployment target | iOS 15.4, iPhone only (runs in compatibility mode on iPad — verified) |
| Toolchain | Xcode 26.6 (17F113), iOS SDK 26.5, Swift 5, SPM, Capacitor 8.5.2 |
| Release build | `xcodebuild -configuration Release` for `generic/platform=iOS`, unsigned — **BUILD SUCCEEDED** (1 benign AppIntents warning) |
| Archive / signing | **Not possible yet**: no `DEVELOPMENT_TEAM`. USER ACTION |
| Entitlements | Associated Domains (applinks + webcredentials for apex and www) |
| Privacy manifest | Present; FileTimestamp C617.1; tracking false |

## 4. What was verified, and how

| Area | Result | Evidence |
|---|---|---|
| Clean install + web build | PASS | `npm ci` from lockfile; `tsc -b && vite build` with zero warnings; no sourcemaps shipped |
| Bundle in native projects | PASS | `cap sync`; `index.html` SHA-1 identical in dist, Android and iOS copies |
| Secrets | PASS | Bundle and all 165 commits scanned: only the public `sb_publishable_` key; no service-role, Stripe, OpenRouter or private keys |
| Dev leftovers | PASS | No `console.log`, staging hosts or debug switches; the only `localhost` strings are library defaults |
| Android App Links | PASS | Live `assetlinks.json` (200, `application/json`, both hosts) lists the upload and app-signing fingerprints; `pm get-app-links` → **verified** for `finatrix.co` and `www.finatrix.co` on a fresh release install |
| Android deep links | PASS | Release APK: cold link → app directly (1.45 s); warm `www` link → app; unknown tool → falls back to the last tool; unclaimed `/pricing` → Chrome |
| Android OAuth return (error/cancel) | PASS | `co.finatrix.app://auth/callback#error=…`, warm and cold → sign-in screen with the message; no tokens or emails in logcat |
| Android BACK | PASS | Closes dialog → walks history → backgrounds (process kept) at the dashboard |
| Android offline | PASS | Airplane mode: cold start 0.80 s, Budget fully usable |
| Android font scale 200% | PASS | Text scales; header compensates; tab-bar labels truncate without overlap |
| Android theme | PASS | Light/dark toggle; status-bar icons stay legible |
| Android process death | PASS | `am kill` while backgrounded → relaunch 0.91 s with state intact |
| Android cold start | measured | 3.44 s first launch after install, then 1.72 s / 1.19 s (emulator under heavy host load) |
| iOS universal links | **FAIL (pending paid team)** | Since the 2026-10-01 Worker deploy both hosts answer `404 text/plain` with no redirect — the AASA route is live and waits only for `APPLE_APP_ID_PREFIX`. The only Apple team on this Mac is a **free Personal Team** (`AY79GYWLDP`), which cannot use Associated Domains, so it was deliberately not published |
| iOS backend access | **PASS (fixed 2026-10-01)** | Edge functions redeployed from `e1aa533`; all six echo `capacitor://localhost`; `verify:native` CORS checks 14/14 |
| Sign in with Apple | **FAIL** | Live `/auth/v1/settings` → `"apple": false`; `/authorize?provider=apple` → 400 "Unsupported provider" |
| iOS launch / layout | PASS | Simulator iPhone 17 Pro, 17 Pro Max and iPad Air 11 (compat): launches to dashboard, clear of the Dynamic Island and home indicator |
| Account deletion data model | PASS | Live DB catalog: 49 FKs to `auth.users` CASCADE, 6 SET NULL, 0 RESTRICT; no user-id column without an FK; only storage bucket `resumes` (private), purged by the function |
| Account deletion function | PASS (shape) | Deployed `account-delete` v2: 401 without or with a bad token; 405 on GET |
| Account deletion end-to-end | **UNKNOWN** | Not run against production (needs a disposable account). USER ACTION, see §8 |
| AI data flow | PASS | `careers-ai` sends model, system + user text, max_tokens, temperature, JSON mode; headers `HTTP-Referer`, `X-Title`. No user id, email, name or client IP is forwarded; client prompts carry no identity (`src/tools/ai/context.ts`) |
| OCR | PASS (WebKit) | Tesseract worker, core and language data load from bundled `/careers-ocr/` paths only; real recognition with the app's assets passes in the `ios-webkit` project (2.0 s). Not exercised on a physical camera |
| xlsx advisory | accepted, verified | User spreadsheets are read by a purpose-built ZIP+XML reader; SheetJS only writes; tripwire test passes |

## 5. Fixes made in this audit

| Fix | Why | Proof |
|---|---|---|
| **AI consent gate** (`src/lib/ai/consent.ts`, enforced in `requestCompletion`; consent card in the AI panel; opt-in banner in statement import; toggle in Settings → Privacy; privacy policy updated) | Apple 5.1.2(i): explicit permission before personal data reaches third-party AI. Statement import used to send merchant names automatically | `aiConsent.test.tsx` (8 tests, mutation-checked); e2e `asks for permission…` on Chromium and Pixel 7, axe clean |
| "Can't be purchased in the **Android** app" → "in the app" (paywall and billing) | Apple 2.3.10: no other platform names in an iOS app | `nativePurchaseCopy.test.tsx` (iOS + Android) |
| Command-palette focus return on WebKit | WebKit doesn't focus a button on tap, so closing stranded keyboard/Switch Control users (WCAG 2.4.3) | New unit test; WebKit e2e 12/12 across 3 repeats (was failing 3/3) |
| Expenses "Open <month>" target 17 px → 25 px | WCAG 2.2 2.5.8 | `a11y-finance` passes on Chromium and Pixel 7 |
| AI panel deferred focus no longer steals focus | The 40 ms composer focus could take focus back from the consent card | Repeated runs green |
| Stale `expense.pdfReport` test contract | Tested the old `undefined` return; the export now returns its save outcome | 7/7 |
| ESLint ignores `ios/` (and test output) | Linted the 25 MB copied bundle: ~15 min → 10.6 s | `npm run lint` clean |
| Android instrumented template test | Asserted package `com.getcapacitor.app` | Now `co.finatrix.app` (not run — needs a device run) |
| Docs | ANDROID.md / IOS.md / APP_STORE_SUBMISSION.md corrected against live evidence | — |

## 6. Blockers

### P0 — publication blockers
**iOS**
1. **Sign in with Apple is not configured on Supabase**, yet the iOS app shows it first. A reviewer gets an error (2.1, 4.8). USER ACTION: IOS.md §4.3.
2. ~~Deployed edge functions reject the iOS origin~~ — **resolved 2026-10-01** (functions redeployed; CORS verified).
3. ~~The live privacy policy does not cover the iOS app~~ — **resolved 2026-10-01** (website deployed; live policy dated 1 October 2026 covers both apps, the camera, statement-import AI and the consent rule).
4. **Missing submission prerequisites**: a **paid Apple Developer Program** membership (only a free Personal Team is visible on this Mac — free teams cannot use Associated Domains, Sign in with Apple or App Store distribution), Apple team and signing, App Store Connect record, 6.9″ screenshots (none exist; Simulator captures must be flattened — they carry alpha), App Privacy and age-rating answers, a demo account.

**Android**
5. **Play production access gate** — 12 testers × 14 days. Applicability and progress are UNKNOWN without Play Console access.

No verified *technical* P0 remains in the Android binary.

### P1 — high
- OAuth uses Supabase's **implicit flow**: access and refresh tokens return in the URL of a **custom scheme**. Another app can claim `co.finatrix.app://` — demonstrated on the Simulator, where a leftover test app ("FinatriX Export Audit") was offered the callback. Move native sign-in to PKCE (RFC 8252). Product and auth change: owner decision.
- Account deletion must **revoke Sign in with Apple tokens** (Apple REST `/auth/revoke`) once SIWA is live; Supabase does not.
- Universal Links not live (iOS): set `APPLE_APP_ID_PREFIX` and deploy the Worker.
- **The entire mobile app is uncommitted** (`android/`, `ios/`, `capacitor.config.ts`, `src/native/`, deletion UI, iOS CORS origin, these fixes). No release candidate is reproducible from a commit.
- Data Safety should add Financial info → Purchase history (statement-import merchant descriptions); App Privacy wording updated in APP_STORE_SUBMISSION.md §8.
- Legal review: Goals shows "Suggested instruments: Large-cap MF, Nifty 50 index, ELSS…" beside a "~12% CAGR" path (SEBI investment-adviser line). Apple 5.1.1(ix) / 3.2.1(viii): finance app from an individual developer account.
- Careers "coming in 2027" entry points (nav pill, palette, footer) are visible in both apps — App Review 2.1 placeholder risk. Recommend hiding them in native builds.
- Apple 4.2 (minimum functionality) review risk for a WebView app — mitigated by offline tools, on-device OCR, native back/links/haptics, but not eliminable.

### P2 — before launch if possible
- `allowBackup=true` with no extraction rules: WebView storage, including the Supabase refresh token, goes into device backup/transfer (disclosed in the policy).
- `FileProvider` `external-path path="."` is broader than needed.
- Sign-in screen shows web breadcrumbs inside the app.
- Effectively no native tests (Android template only; no XCTest target).
- OpenRouter requests do not set `provider.data_collection: "deny"`.
- No API 24–29 device/emulator coverage (minSdk 24).
- A dedicated `/delete-account` page would be clearer than `/privacy#delete-account`.
- E2E specs wait on `networkidle` and stall under host memory pressure.

### P3
- Gradle DSL deprecations (Gradle 10), `flatDir` warning; DOMPurify low advisory; minor updates to supabase-js and react.

## 7. Testing (2026-10-01)

| Suite | What it covers | What it does NOT cover | Result |
|---|---|---|---|
| Vitest unit/integration (217 files, 3,632 tests; ~1,131 calculator/formula, 362 expenses/import/OCR, 230 AI, 201 native bridge, 75 auth/deletion) | Formulas, parsing, grounding, routing, native bridge logic in jsdom | Real devices, real backend, real WebViews | 3 clean full runs after fixes; 2 runs had ~900 s stalls during host swap storms, not assertion failures |
| Playwright e2e (19 specs, 1,295 tests across Chromium desktop, Pixel 7 Chromium, iOS-WebKit) | Real-browser flows: persistence, export, offline, a11y (axe), SEO, WebKit layout/OCR, AI consent | Native shell, signed-in backend, store builds | 1,287/1,295 on the last full run; every failure was a host stall that passed in isolation (§9) |
| `ios-webkit` project (109 tests incl. 15 iOS-specific) | WebKit safe areas, decimals, keyboard chrome, theming, OCR, Apple button | WKWebView inside the app, native plugins | 103/109 in run 1 under load; failures were a real focus bug (fixed) and load stalls |
| Android native | Template only | Everything | Not meaningful |
| iOS native (XCTest) | None exists | Everything | — |

> **Previous claims invalidated:** "45/45 iOS tests" referred to Playwright
> WebKit runs, not native iOS tests. "Android native tests passing" — only
> Capacitor's template tests exist. "Production deep links working" — true for
> Android; **false for iOS**. "Cloudflare CORS configured" — the iOS origin is
> rejected by the deployed edge functions.

## 8. Owner-only actions (in order)

1. Commit the mobile work (it is all untracked or modified) and tag the RC.
2. Deploy the edge functions from that commit (adds `capacitor://localhost`).
3. Apple Developer: App ID `co.finatrix.app` (Associated Domains, Sign in with Apple), Services ID, `.p8` key; Supabase → enable the Apple provider; set `VITE_AUTH_APPLE=1`.
4. Set `APPLE_APP_ID_PREFIX` (Team ID) in `wrangler.jsonc`, deploy the Worker + website, verify with `npm run verify:native` (expect all green).
5. Run account deletion end-to-end with a disposable account on **both** apps (create → add budget, expenses, a résumé → delete → confirm rows and storage are gone).
6. Xcode: choose the team, archive, validate, upload; TestFlight smoke test on a physical iPhone (Universal Link, camera OCR, Apple + Google sign-in, deletion).
7. App Store Connect: record, 6.9″ screenshots (flatten alpha), App Privacy, age rating (AI question), review notes and demo account, export compliance (pre-answered in Info.plist).
8. Play Console: upload AAB versionCode 2 to the closed track; confirm the tester count and consecutive days; update Data Safety (Purchase history row) and the financial-features declaration; apply for production when eligible.
9. Legal review of instrument suggestions and financial-advice wording; confirm the developer account type (individual vs organisation) for Apple 5.1.1(ix).

## 9. Artifacts and test log (2026-10-01)

### Final release candidates (built from the working tree after the fixes in §5)
| Artifact | Size | SHA-256 / notes |
|---|---|---|
| `android/app/build/outputs/bundle/release/app-release.aab` (1.0.0 / code 2, upload-key signed) | 11,004,149 B | `5ae883a4cda7ba234666bcbb10d70740db13e75676ede6b08f7c33c121f9182c` |
| `android/app/build/outputs/apk/release/app-release.apk` (same build, for device testing) | 10,527,049 B | `8a3a9e273c39221f44dce0a5012fe7621026096b8de5f52840adf85cc1b9d374` |
| iOS `App.app`, Release, `generic/platform=iOS`, **unsigned** | 26 MB | arm64 only; SDK iphoneos26.5; Xcode 2660 (26.6); bundle `index.html` SHA-1 `e3d0ef53…` = dist |

Android RC smoke on emulator (Pixel 8 profile, Android 16 / API 36, WebView 133): fresh install → App Links **verified** for both hosts → cold link to `/tools/expenses` in 0.98 s → correct screen.

These are built from an **uncommitted** tree. Commit first, then rebuild from the commit before uploading.

### Runs
| Run | Result | Reading |
|---|---|---|
| Vitest #1 (before fixes) | 3,602 pass / 5 fail | All 5 were the stale PDF-export contract → fixed |
| Vitest #2 | 3,617 / 1 | New consent test exposed a real focus race (40 ms timer) → fixed |
| Vitest #3 | **3,618 / 0** (217 files, 14 skipped) | Clean |
| Vitest #4, #5 | 4 and 1 "failures" at ~900 s each | Host swap storm; those 4 files then passed 134/134 three times |
| Playwright #1 (all projects) | 1,274 pass / 19 fail | 2 real defects (WCAG 2.5.8 target; WebKit focus return) → fixed; 17 load stalls → pass in isolation |
| Playwright #2 (after fixes, 4 workers) | 1,287 pass / 8 fail | All 8 stalled 6–17 min together; 11/11 pass in isolation |
| iOS-WebKit project ×3 (2 workers) | 309 / 315 | 6 `page.goto` / lazy-chunk timeouts at 30 s |
| Those 3 specs ×3 (1 worker) | 143 / 147 | 4 timeouts. **Unresolved WebKit e2e flake** against `vite preview`; root cause not established; the native apps are unaffected (bundled assets, no service worker) |
| `npm run lint` | clean, 10.6 s | — |
| `npm run audit:prod` | clean | xlsx accepted (write-only, tripwire passes); DOMPurify low |
| `npm run verify:native` | 9 failures | All iOS: AASA ×2, CORS for `capacitor://localhost` ×7 (two preflights also returned a transient 503) |

## 10. Deployment log

### 2026-10-01 — backend and website from commit `e1aa533`
| What | Result |
|---|---|
| Pre-flight drift check | Downloaded every deployed function (`functions download --use-api`) and diffed against the commit: the only runtime differences were the iOS origin in `_shared/origins.ts` and `careers-billing-checkout` using `isNativeAppOrigin` for its Stripe return target. All 7 migrations already applied |
| Edge functions | `account-delete` v3, `analytics-collect` v25, `careers-ai` v39, `careers-email` v25, `careers-jobs` v45 (all `verify_jwt=false`, as before) and `careers-billing-checkout` v13 (`verify_jwt=true`, as before). `careers-billing-webhook` untouched (v11) |
| Function checks | All six echo `capacitor://localhost`, `https://localhost` and `https://finatrix.co`; `analytics-collect` still refuses an unknown origin; account-delete 401 without a session and 405 on GET; careers-ai 401; checkout 401 at the gateway; analytics allowlist probe 502 for `page_view` and 204 for a bogus event (nothing stored) |
| Website + Worker | `wrangler deploy` → `finatrix-co` version `1d3f57a0-19c0-454d-969e-acb3c4f97cca`, custom domains `finatrix.co` and `www.finatrix.co`; bundle built with real credentials |
| `npm run verify:production` | all green — "https://finatrix.co matches this repository" |
| `npm run verify:native` | **14/16** — every CORS check passes for both apps; the 2 failures are the iOS association file (needs a paid-team ID) |
| Live privacy policy | "Last updated: 1 October 2026"; covers the Android and iOS apps, iOS camera, statement-import AI and the consent rule |
| Noted, not caused by this deploy | Cloudflare injects its Web Analytics beacon and Bot Management "JavaScript detections" script at the edge; the site CSP blocks both (console errors on every page, nothing runs). Turning them off is a Cloudflare dashboard setting |
