# FinatriX — App Store submission

> **Release status lives in [MOBILE_RELEASE_READINESS.md](MOBILE_RELEASE_READINESS.md)**
> (last updated 2026-10-02). The backend half is live; what remains needs the
> paid Apple Developer team (purchased, awaiting enrolment).

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
| Primary language | Match the Play listing | |
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

App Store Connect computes the rating from the questionnaire; do not assume a
number in advance. On these answers the content questions all come back clean,
so the outcome turns on the **AI capability** question, which Apple added in
2025 and which can raise the minimum on its own. Answer it honestly and take
what it gives.

| Question | Answer |
|---|---|
| Violence, sexual content, profanity, horror, alcohol/tobacco/drugs | None |
| Simulated gambling, contests | None |
| Unrestricted web access | **No** — external links open in an in-app browser to URLs the app itself chose; there is no address bar and no arbitrary browsing |
| User-generated content / social | No — nothing a user writes is visible to any other user |
| **Capabilities of AI** | **Yes.** The assistant is generative. Note in the field that answers about a user's own figures are checked against their records before display, and that any answer can be reported from inside the app |
| Medical/treatment information | No |

## 7. App Review notes

Paste into the Notes field:

```
FinatriX is a personal finance education tool. Every calculator works fully
without an account: open the app and use Budget, Expenses, Goals, Net Worth and
the rest straight away. Data is stored on the device.

Signing in adds only cloud sync across devices and the optional AI assistant.
A demo account is supplied in the Sign-In Information fields if you would like
to review the signed-in experience, but it is not required to review the app's
functionality.

Sign in with Apple is offered alongside Google and email, and is presented
first. Deleting an account that used Sign in with Apple also revokes the
app's Apple authorization.

FinatriX AI (optional, signed-in only) asks for explicit permission before any
question or statement description is sent to its AI provider (OpenRouter and the
model it routes to). Declining leaves every calculator fully usable.

Account deletion: Profile -> Delete account. It deletes the account and all
data immediately and irreversibly; please use the demo account only if you are
willing to have it deleted, and tell us if you do so we can recreate it.

Camera: requested only if you choose "Take Photo" when importing a bank
statement in Expenses. The image is read by an on-device text-recognition
engine and is never uploaded.

The app sells nothing and shows no prices. FinatriX Pro exists on the website
only; in the app the pricing routes redirect and every purchase control is
hidden (Guideline 3.1.1).

FinatriX is not a bank, broker or registered adviser and executes no
transactions. All figures are estimates from user input under stated
assumptions.
```

**Demo account:** create a throwaway one before submitting and put the address
and password in the Sign-In Information fields — never in the notes body.
Seed it with a month of budget and expense data so the dashboard is not empty.

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
| Usage Data → Product Interaction | **No** | No | Analytics | `src/lib/analytics.ts` — random per-session id, no account id, `credentials: 'omit'`, no cookie |
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
| 2.1 App Completeness | A demo account that does not work, or an empty app | Guest mode works fully; demo account in Sign-In Information |
| 2.3.1 Hidden features | — | Nothing gated on a hidden flag |
| **3.1.1 In-app purchase** | Prices or a link to the Stripe checkout | **Resolved.** `canPurchaseInApp()` is false in both apps; `/pricing` and the Careers sales pages redirect (`isPurchasePage`); tests pin it |
| 4.2 Minimum functionality | "A website in an app" | Eight calculators, on-device storage, offline operation, camera OCR, haptics, native navigation gestures — none of which a web page does |
| **4.8 Login services** | Google offered without an equivalent | **Compliant at every stage.** iOS shows Google only together with Apple, and both only once `VITE_AUTH_APPLE=1`; until the Apple provider works an iOS build offers email sign-in alone. Configure docs/IOS.md §4.3 before submitting so reviewers see both |
| **5.1.1(v) Account deletion** | "Email us to delete"; Apple tokens left authorized | **Live.** Profile → Delete account calls `account-delete` (storage purged, auth user deleted, all user rows cascade); the iOS origin is accepted; Apple tokens are revoked via Apple's REST API (`apple-token` + `account-delete`, docs/IOS.md §4.3a). Test with a real Apple account once the keys exist |
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
- [ ] Age rating questionnaire answered from §6, including the AI question
- [ ] Review notes pasted from §7
