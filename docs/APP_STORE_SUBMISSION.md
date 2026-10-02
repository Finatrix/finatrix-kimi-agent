# FinatriX — App Store submission

> **Release status lives in [MOBILE_RELEASE_READINESS.md](MOBILE_RELEASE_READINESS.md).**
> As of 2026-10-02 the App Store Connect record exists (Apple ID **6818361672**)
> and holds everything below except where a row says otherwise; build 1.0.0 (1)
> is uploaded, processed and attached to version 1.0.0. The privacy answers are
> entered but still require the owner's Publish attestation. Reviewer sign-in
> and contact fields are blank.

Everything App Store Connect asks for, answered. The build and signing runbook is
docs/IOS.md; this is the paperwork.

Character counts are given because App Store Connect silently truncates some
fields and rejects others, and because a value that no longer fits is a change
somebody has to notice.

---

## 1. App information

| Field | Value | Count |
|---|---|---|
| App name | `FinatriX: Budget & Money Plan` | 29 / 30 |
| Subtitle | `Plan spending. See the maths.` | 29 / 30 |
| Bundle ID | `co.finatrix.app` | |
| SKU | `finatrix-ios-001` (internal only; any unique string) | |
| Primary category | **Finance** | |
| Secondary category | **Education** | |
| Primary language | English (U.S.) — App Store Connect offers no English (India) | |
| Price | Free | |

The name matches the Play listing, so the same product is not two products in
search. The subtitle deliberately repeats none of the keywords below: Apple
indexes the name and subtitle already, so a word spent twice is a word wasted.

## 2. Promotional text (updatable without a new build, ≤170)

```
Every figure shows its working. Split your pay 50/30/20, log a spend in one line, and plan goals you can actually hit. Free, works offline, no ads and no trackers.
```
163 characters.

## 3. Keywords (≤100, comma-separated, no spaces after commas)

```
expense tracker,money manager,savings,net worth,SIP,50/30/20,spending,finance planner,debt
```
90 characters. "budget" and "money" are omitted on purpose — both are already in
the app name, which is indexed.

## 4. Description

```
FinatriX turns your income, spending and goals into one clear monthly picture — and shows the working behind every number.

BUDGET THE 50/30/20 WAY
Split take-home pay into needs, wants and savings. Budget Builder scores your plan, shows what's unallocated and flags where you're over.

TRACK EVERY RUPEE IN SECONDS
Log a spend with one line — "340 lunch upi" — and it's categorised for you. See remaining budget, daily safe-to-spend and cash flow for the month. Photograph a statement and FinatriX reads the figures off it, on your iPhone, without uploading the photo.

PLAN GOALS YOU CAN ACTUALLY HIT
Reverse Goal Planner works back from a target and a deadline to the monthly SIP you need, with conservative, moderate and aggressive paths and a 10% step-up option.

MORE TOOLS, ONE DASHBOARD
Net Worth, InvestMatch, ParkSmart for idle cash, PeerCompare benchmarks, LifeMap lifetime simulation, reports and a money calendar.

ASK FINATRIX AI (OPTIONAL)
Ask questions about your own month. Answers about your figures are checked against your records before you see them.

PRIVATE BY DESIGN
• Works without an account — your data stays on your iPhone.
• Sign in only if you want cloud sync across devices.
• Sign in with Apple, and keep your email address private.
• No ads. No selling data. No third-party trackers.
• Delete your account and all its data from inside the app.

Built for India, with market packs for the US, UK, UAE, Australia, Singapore and Mainland China.

FinatriX is an educational tool, not a bank, broker or registered financial adviser. Figures are estimates based on your inputs and stated assumptions.
```

The closing disclaimer is not optional garnish: Guideline 1.4.1 and the Finance
category both treat an app that could be read as giving regulated advice as a
different, much harder submission.

## 5. URLs

| Field | Value |
|---|---|
| Support URL | `https://finatrix.co/support` |
| Marketing URL | `https://finatrix.co` |
| Privacy Policy URL | `https://finatrix.co/privacy` |
| Account deletion URL | `https://finatrix.co/privacy#delete-account` |

Check `https://finatrix.co/support` resolves before submitting — a support URL
that 404s is a rejection, and it is the single most common one.

## 6. Age rating

**Entered 2026-10-02: 18+** (17+ on systems before iOS 26; Korea shows 19+ by
its own scale). Every content question in Apple's questionnaire is honestly
"None"/"No", which calculates **4+** — the 18+ is an override, for one reason:
the Terms say "You must be at least 18 years old to create an account" and the
privacy policy says the service is for adults, and Apple's form requires the
rating to align with an age minimum in the app's terms. The Terms are entered
as the age-suitability URL. To publish at a lower rating, change the Terms and
privacy policy first (a legal decision), then the override.

| Question | Answer | Why |
|---|---|---|
| Parental controls, age assurance | No | |
| Unrestricted web access | **No** | External links open specific pages the app chose in an in-app browser with no address bar |
| User-generated content, social media, messaging and chat | No | Nothing a user writes reaches any other user; the AI talks only to the person who asked |
| Advertising | No | |
| Profanity, horror, alcohol/tobacco/drugs | None | The only match in `src/` is a quick-add keyword list (`pub`, `drinks`) filing entries under "Going out" |
| Medical / health or wellness | None / No | LifeMap's "health" is financial health |
| Mature or suggestive themes, sexual content | None | The financial-crime guide is about compliance careers |
| Violence, weapons | None | |
| Gambling, simulated gambling, contests, loot boxes | None / No | Return projections are not wagering; PeerCompare compares with published averages, not other users |

The questionnaire as of this date has **no generative-AI question**; the AI
assistant is one more reason not to claim 4+.

## 7. App Review notes

Entered in App Store Connect on 2026-10-02 (1,798 characters):

```
FinatriX is a personal-finance education tool. Every calculator works fully without an account: open the app and use Budget, Expenses, Goals, Net Worth and the rest straight away. Data is stored on the device.

Signing in adds only cloud sync across devices and the optional AI assistant. A demo account is in the Sign-In Information fields: tap SIGN IN (top right), then use the email form below "or sign in with email". Sign in with Apple is presented first, then Google.

FinatriX AI (optional, signed-in only; the gold sparkle button at the bottom right, "Open FinatriX AI") asks for explicit permission before any question or statement description is sent to its AI provider (OpenRouter and the model it routes to). Declining leaves every calculator fully usable. The permission can be withdrawn in Settings under FinatriX AI.

Account deletion: menu (top left) > Profile > Delete account, then type the account's email address to confirm (or DELETE, for a Sign in with Apple "Hide My Email" address). It deletes the account and all its data immediately and irreversibly, and revokes the app's Sign in with Apple authorization. If you delete the demo account, please tell us so we can recreate it.

Camera: requested only if you choose "Take Photo" in Expenses > Import. The photo is read by an on-device text-recognition engine and never uploaded. PDF statements need iOS 18 or later; on older iOS the app says so and offers CSV, Excel and photo import instead.

The app sells nothing and shows no prices. FinatriX Pro exists on the website only; in the app the pricing pages redirect and every purchase control is hidden (Guideline 3.1.1).

FinatriX is not a bank, broker or registered adviser and executes no transactions. All figures are estimates from user input under stated assumptions.
```

**Demo account:** create a throwaway one before submitting and put the address
and password in the Sign-In Information fields — never in the notes body.
Seed it with a month of budget and expense data so the dashboard is not empty.
The saved notes currently say this account is present, but those fields are
blank; correct the mismatch before App Review submission.

## 8. App Privacy questionnaire

Derived from the code, and it must stay in step with `PrivacyInfo.xcprivacy`
and `https://finatrix.co/privacy`. The "where" column is so the next person can
check rather than trust.

### Data collected

| Apple data type | Linked to user | Tracking | Purpose | Where |
|---|---|---|---|---|
| Contact Info → Email Address | Yes | No | App Functionality | Supabase Auth account (`src/context/AuthContext.tsx`) |
| Contact Info → Name | Yes | No | App Functionality | Display name at sign-up |
| Financial Info → Other Financial Info | Yes | No | App Functionality | Budgets/expenses/net worth, synced to the user's own `tool_data` row **only when signed in**; figures relevant to an AI question, and merchant descriptions from a statement import, sent to the AI provider **only after the in-app consent prompt** (`src/lib/ai/consent.ts`) |
| Purchases → Purchase History | Yes | No | App Functionality | The user's own expense records (amount, merchant note, category), synced **only when signed in**; merchant descriptions from a statement import sent to the AI provider **only after consent** |
| Identifiers → User ID | Yes | No | App Functionality | The account ID every signed-in account has (Supabase Auth); used to store and sync the user's own data |
| User Content → Other User Content | Yes | No | App Functionality | AI questions; Careers résumés and notes exist in the backend but Careers is not available in the app before launch |
| Usage Data → Product Interaction | **Yes** | No | Analytics, App Functionality | Two sources, and Apple asks one "linked?" per type. `src/lib/analytics.ts` is anonymous (random per-session id, no account id, `credentials: 'omit'`, no cookie). But `careers-ai` keeps a per-account daily call count (`careers_ai_usage`, fair-use limits) and caches answers per account (`ai_response_cache`), so the honest answer for the type is "linked" |
| Diagnostics → Crash Data | No | No | App Functionality | `src/lib/errorReporting.ts` |
| Diagnostics → Performance Data | No | No | Analytics | `src/lib/webVitals.ts` |

### Data NOT collected — and why the answer is "no", not "probably not"

- **Device ID.** No IDFA, no IDFV, no advertising SDK, no attribution SDK. The
  analytics session id is generated per launch, is not stored across sessions
  and is not linked to the account. (The account's own **User ID** *is*
  collected — declared above.)
- **Location, Contacts, Health, Browsing History, Search History, Sensitive
  Info.** No API in the bundle touches any of them.
- **Payment info.** The app sells nothing, so it collects no payment
  information. Existing subscribers' payment data is held by Stripe from a
  website purchase. (Purchase *history* — the user's own expense records — is
  declared above.)
- **Guest data.** Someone who never signs in transmits nothing but anonymous
  analytics, and can turn that off in Settings.

### Tracking

**No.** Answer "No" to "Does this app use data for tracking purposes?" and show
**no App Tracking Transparency prompt** — there is no
`NSUserTrackingUsageDescription` in `Info.plist`, and a test asserts there never
is. Analytics go to FinatriX's own endpoint, are not joined with data from any
other company, and are not used for advertising. That is precisely the line ATT
draws, and prompting without crossing it is itself a review risk.

### Third-party SDKs

There are none in the usual sense. The bundle's network dependencies are
Supabase (the product's own backend) and, for AI answers, an inference provider
reached through a FinatriX edge function — the app never calls it directly.
Capacitor and its five plugins (App, Browser, Haptics, Keyboard, SplashScreen)
collect nothing; Capacitor's own `PrivacyInfo.xcprivacy` declares no accessed
API types, and Capacitor 8's key-value store is file-based rather than
`UserDefaults`-backed, which was checked in its source rather than assumed.

### Required-reason APIs

One, declared in `ios/App/App/PrivacyInfo.xcprivacy`:
`NSPrivacyAccessedAPICategoryFileTimestamp`, reason **C617.1** — Capacitor's
URL-scheme handler reads attributes of the web bundle inside the app's own
container when serving a Range request. Nothing read that way leaves the device.

## 9. Encryption and export compliance

`ITSAppUsesNonExemptEncryption` is set to `false` in `Info.plist`, so the
question is answered once instead of on every TestFlight upload. That is
accurate: FinatriX uses HTTPS and the platform's own cryptography and ships no
encryption of its own, which is the standard exemption.

## 10. Screenshots

**Ready:** `ios/store/screenshots/1-dashboard.png` … `6-lifemap.png` — six
1320 × 2868 (6.9", iPhone 17 Pro Max) captures of the real app, opaque RGB,
fictional data, no Careers, no developer controls. Regenerate with docs/IOS.md
§9 if any screen changes before submission.

Accepted sizes: **6.9" (1320 × 2868 or 1290 × 2796)** or **6.5" (1284 × 2778)**
portrait — providing 6.9" covers the smaller classes, which App Store Connect
scales automatically.
No iPad set is needed: the app ships iPhone-only. PNG or JPEG, **no alpha
channel**.

Capture from a Simulator so the status bar and corner radii are real:

```bash
xcrun simctl boot "iPhone 16 Pro Max"
xcrun simctl status_bar booted override --time "9:41" --batteryState charged --batteryLevel 100 --cellularBars 4
xcrun simctl io booted screenshot ios/store/screenshots/1-dashboard.png
```

Six, matching the Play listing so the two stores tell one story:

1. Dashboard — the month at a glance
2. Budget Builder — the 50/30/20 split with the score
3. Expenses — one-line entry and the category breakdown
4. Statement import — a photographed statement being read
5. Goals — a target worked back to a monthly SIP
6. Net Worth — assets and liabilities over time

## 11. Version information

| Field | Value |
|---|---|
| Version | `1.0.0` (`MARKETING_VERSION`) |
| Build | increments every upload (`CURRENT_PROJECT_VERSION`) |
| Copyright | `2026 FinatriX` |
| Contact email | `finatrix.hub@gmail.com` |
| Release | Manually release this version |

"What's New in This Version" for 1.0.0:

```
FinatriX comes to iPhone. Budget by 50/30/20, log spending in one line, photograph a statement and have its figures read on-device, and plan goals you can actually hit — with the working shown behind every number.
```

## 12. Review-risk register

Everything below was checked against the current App Review Guidelines and
resolved in code, or is listed as an accepted answer with its reasoning.

| Guideline | Risk | Status |
|---|---|---|
| 2.1 App Completeness | A demo account that does not work, or an empty app | Guest mode works fully; demo account still needs to be entered in Sign-In Information |
| 2.3.1 Hidden features | — | Nothing gated on a hidden flag |
| **3.1.1 In-app purchase** | Prices or a link to the Stripe checkout | **Resolved.** `canPurchaseInApp()` is false in both apps; `/pricing` and the Careers sales pages redirect (`isPurchasePage`); tests pin it |
| 4.2 Minimum functionality | "A website in an app" | Eight calculators, on-device storage, offline operation, camera OCR, haptics, native navigation gestures — none of which a web page does |
| **4.8 Login services** | Google offered without an equivalent | The signed iOS build offers Apple and Google together. The provider is configured, but successful native Apple sign-in still needs a physical-device test |
| **5.1.1(v) Account deletion** | "Email us to delete"; Apple tokens left authorized | Profile → Delete account calls `account-delete` (storage purged, auth user deleted, all user rows cascade); the iOS origin is accepted; Apple tokens are revoked via Apple's REST API (`apple-token` + `account-delete`, docs/IOS.md §4.3a). A real Apple account deletion test remains |
| **5.1.2(i) Third-party AI** | Personal data to an AI provider without explicit permission | **Resolved in code 2026-10-01.** One-time consent prompt naming OpenRouter, enforced in `requestCompletion`; withdrawable in Settings → Privacy |
| 5.1.1 Data minimisation | Permissions asked for and unused | Camera only, and only at the moment it is used. A test asserts the plist declares exactly one usage description |
| 5.1.2 Data use and sharing | A privacy answer the code contradicts | §8 derives every answer from a named file |
| **5.1.1 ATT** | Prompting without tracking | No ATT prompt, no tracking domains, asserted by test |
| 1.4.1 Physical harm | Regulated financial advice | Disclaimer in the description, in-app, and in the review notes; no execution of transactions |
| 2.5.1 Private API | — | No private API; the only native code is two small Capacitor plugins in `ios/App/App/` |
| 2.5.2 Self-modifying code | A live-update server URL | None: `capacitor.config.ts` has no `server.url`, so the reviewed binary is the shipped binary |
| 3.2.2 Unacceptable | Linking out to purchase | The app shows no price and no checkout link anywhere |

## 13. Before you press Submit

- [ ] docs/IOS.md §12 release checklist complete
- [ ] `https://finatrix.co/support` returns 200
- [ ] `https://finatrix.co/privacy` names iOS, the camera permission and account deletion
- [ ] Demo account created, seeded, and entered in Sign-In Information
- [ ] Six screenshots at 6.9" (ready in `ios/store/screenshots/`; retake if a screen changed)
- [ ] App Privacy questionnaire answered from §8 and agreeing with `PrivacyInfo.xcprivacy`
- [x] Age rating questionnaire answered from §6 (18+ override; the current form has no AI question)
- [ ] Review notes pasted from §7
