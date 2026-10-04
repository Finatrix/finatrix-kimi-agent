# FinatriX — answering App Review's 2.1 "Information Needed" (3 Oct 2026)

Apple rejected build 1.0.0 (2) on **2026-10-04** under **Guideline 2.1 —
Information Needed — New App Submission**. It is not a bug report: the message
says the developer account has "limited App Review history" and asks for six
things. Nothing in the binary has to change, so **no new build is needed** —
the answer is a reply in App Store Connect, a rewritten Notes field and a
screen recording.

## What Apple asked for, and what answers it

| # | Apple's request | Answer | Who |
|---|---|---|---|
| 1 | Screen recording on a **physical device**, latest OS, starting at launch, showing registration, login, **account deletion**, any user-generated content with reporting and blocking, and any paid content | The recording in §2. The app has **no** user-generated content shared between users and **no** paid feature or purchase control, which the reply says plainly. | **Owner** (needs the iPhone) |
| 2 | Purpose, target audience, problem and value | Reply item 2 and Notes "What it is" | Done |
| 3 | How to set up and reach the main features, login credentials, sample files | Reply item 3; demo account stays in Sign-In Information; sample files in [`docs/launch/finatrix-review-samples.zip`](launch/finatrix-review-samples.zip) (attach on the version page) | Done, **owner attaches the zip** |
| 4 | External services: data providers, authentication, payments, AI | Reply item 4 and Notes "External services" — checked against the code (below) | Done |
| 5 | Regional differences | Reply item 5 and Notes "Regions" | Done |
| 6 | Highly regulated industry: documentation or credentials | Reply item 6 and Notes "Regulation": no regulated service is provided, so there is no licence to show. See the 5.1.1(ix) risk in §6. | Done |
| — | "Also add this information to the **Notes** field" | The block in [APP_STORE_SUBMISSION.md §7](APP_STORE_SUBMISSION.md) (3,418 of 4,000 characters; replaces the 2,094-character text) | **Owner pastes** |

Every claim in the reply was checked against the code on 2026-10-04:

| Claim | Source |
|---|---|
| Only backends are Supabase and, for AI, OpenRouter through a Supabase function | `src/lib/functions.ts`, `public/_headers` `connect-src 'self' https://*.supabase.co wss://*.supabase.co` |
| AI models are Google, Anthropic, OpenAI | `DEFAULT_MODELS` in `supabase/functions/careers-ai/index.ts` |
| Permission before any AI request; no name, email or id sent | `src/lib/ai/consent.ts`, [AI_PRIVACY_AUDIT.md](AI_PRIVACY_AUDIT.md) §2 |
| Analytics are first-party and can be switched off | `src/lib/analytics.ts`, `src/tools/ui/PrivacyControls.tsx` |
| No purchase anywhere in the app; no feature is paid | `canPurchaseInApp()` is false, no entitlement gate exists outside Careers, and Careers is hidden in the apps (`src/lib/careersEntry.ts`) |
| Market pack comes from device language and time zone, never location or IP | `detectMarket()` in `src/tools/lib/markets/index.ts` |
| Rates and tax figures are bundled, dated and cited | `src/reference/`, linked from Settings |
| Account deletion path and what it revokes | `src/components/DeleteAccount.tsx`, `supabase/functions/account-delete` |

## 1. Order of work

1. Record the video (§2) — about 30 minutes.
2. App Store Connect → **App Review** → the rejected submission → **Edit** the
   version → **App Review Information**: paste the Notes block from
   [APP_STORE_SUBMISSION.md §7](APP_STORE_SUBMISSION.md) and attach
   `docs/launch/finatrix-review-samples.zip` as the **Attachment**. Save.
3. Same submission page → **Reply to App Review**: paste the reply in §3, attach the
   video, send. If the file is too large, upload it as an unlisted link and put the
   link on the first line of the reply.
4. Check **Resubmit to App Review** (greyed out today). Click it if it is now
   enabled; if it stays greyed after the edit and the reply, the reply alone is
   what resumes review and there is nothing more to press.

Do not delete or change the demo account's password; the video uses it
read-only (see the trap in §2).

## 2. The screen recording

Apple wants a **physical device on the latest iOS**, starting from launch.
Before recording, check Settings → General → Software Update, and correct the
version in the reply (§3, item 1) if your phone is not on 26.6.2.

**Setup:** TestFlight build **1.0.0 (2)** — the submitted build. Delete FinatriX
and reinstall it so it is a true first launch with no data. Turn on **Do Not
Disturb** (no banners in the video). Add **Screen Recording** to Control Centre
(Settings → Control Centre) and start it from the Home Screen so the recording
begins before the app opens. Copy the demo password to the clipboard from App
Store Connect first (Sign-In Information → ⌘A, ⌘C; paste on the iPhone with a
long-press), so it is never typed on camera.

| Take | Do | Shows Apple |
|---|---|---|
| 1 | Home Screen → tap **FinatriX** → Dashboard | Launch |
| 2 | **Expenses** → round **+** → `340`, note `lunch` → **Add transaction** | Core flow, no account |
| 3 | **Expenses → Import** → choose `sample-statement.csv` → confirm the 7 rows | Import |
| 4 | **Budget**, **Goals**, **Net Worth** — open each; once expand **Show calculation** | The tools |
| 5 | Menu (top left) → look at it. Nothing to buy, no prices | No paid content |
| 6 | **SIGN IN** → **Continue with Apple** → **Hide My Email** → signed in | **Registration** |
| 7 | Gold sparkle (bottom right) → permission card → **Allow** → ask `How much did I spend on food this month?` → answer | AI consent |
| 8 | Menu → **Profile → Delete account** → type the email (or `DELETE`) → confirm → signed out | **Account deletion** |
| 9 | (Optional, 10 s) iPhone Settings → your name → Sign-In & Security → Sign in with Apple: FinatriX gone | Revocation |
| 10 | **SIGN IN → or sign in with email** → paste the demo credentials → Dashboard shows October 2026 data → **Menu → Sign out** | **Login** |

**The trap, and why the order is fixed.** Signing in on a device that already
holds guest data can merge that data into the account
(`loadCloudIntoLocal` in `src/tools/cloudSync.ts`). So the guest work in takes
2–3 goes into the **throwaway** Apple account, which take 8 then deletes, and
the demo account is touched only at the very end and only read. Do not add or
import anything while signed in as the demo account.

Keep it to about five minutes. Do not show the demo password; the email being
visible is fine. If your Apple sheet shows your name, trim that second in
Photos.

## 3. Reply to App Review

Paste into **Reply to App Review** (3,333 characters).

```
Hello App Review team,

Thank you for reviewing FinatriX: Budget & Money Plan 1.0.0 (2). Everything you asked for is below, and it is also in the Notes field of App Review Information.

1. SCREEN RECORDING
Attached: one recording made on a physical iPhone 16 Pro running iOS 26.6.2. It starts with launching the app, then shows: using the calculators with no account, including importing a statement; creating a new account with Sign in with Apple; the AI permission prompt and an AI answer; deleting that new account from Profile > Delete account; and signing in with the demo account. The app has no user-generated content shared between users (so there is no reporting or blocking) and nothing paid (no in-app purchases, prices or checkout), so those flows do not exist to record.

2. PURPOSE AND AUDIENCE
FinatriX is a personal-finance planning and education app for adults, mainly in India, with market packs for the US, UK, UAE, Australia, Singapore and China. The problem: people can see their spending totals but not whether their plan works. FinatriX splits take-home pay 50/30/20, logs a spend from one line of text, works a goal back to the monthly SIP it needs, and shows the working behind every figure. It is a calculator suite. It holds no money, moves no money and gives no personal advice.

3. HOW TO ACCESS THE MAIN FEATURES
No account is needed: every calculator works at once and data stays on the device. A demo account with sample data is in the Sign-In Information fields: tap SIGN IN (top right), then use the email form below "or sign in with email". Main features are in the tab bar: Dashboard, Budget, Expenses (tap the round + and type "340 lunch"; Import reads statements), Goals, Net Worth, LifeMap. Sample statement files (CSV, PDF and a photo) are in the attachment on the version page: Expenses > Import > choose a file.

4. EXTERNAL SERVICES
- Supabase: our backend (sign-in, cloud sync of the user's own data, server functions).
- Sign in with Apple, Google sign-in, email and password: authentication.
- OpenRouter, routing to Google, Anthropic or OpenAI models: the optional AI assistant. It asks permission before anything is sent, sends no name, email or account ID, and is reached only through our Supabase function.
- First-party anonymous analytics on our own endpoint: no ads, no third-party SDKs, no tracking; it can be switched off in Settings.
- On-device text recognition for statement photos; photos never leave the device.
- Payments: none in the app. The website has a paid plan through Stripe that the app never shows.
- Data providers: none. Rates and tax figures are dated reference data bundled in the app, cited to official public sources.

5. REGIONAL DIFFERENCES
Features are identical in every region. Only reference content (currency, tax rules, published rates, deposit-protection facts) differs by market pack, which defaults from the device language and time zone and can be changed in Settings.

6. REGULATED INDUSTRY
FinatriX is not a bank, broker, lender or registered adviser. It executes no transactions, links no accounts and collects no bank credentials, so it provides no regulated financial service. It presents itself as an educational tool, with a disclaimer in the listing and in the app, and it contains no licensed third-party material.

Thank you,
FinatriX
```

## 4. Before you resubmit

- [ ] Recording made on the iPhone, on the latest iOS, from launch to sign-out
- [ ] iOS version in reply item 1 matches the phone
- [x] Notes block pasted (§7 of APP_STORE_SUBMISSION.md) and **sample-files zip attached** — done 2026-10-04 and verified after a reload
- [ ] Demo account still signs in (take 10); if you ever deleted it, reseed it first ([MOBILE_RELEASE_READINESS.md](MOBILE_RELEASE_READINESS.md) §3)
- [ ] Reply sent with the video, then **Resubmit to App Review** if enabled

## 5. Why this happened, and what it does not mean

Apple sends this note to developer accounts with little App Review history. It asks for evidence
that the app works end to end on real hardware; it does not name a defect. The
earlier TestFlight rejection (2.1(a), missing beta credentials) was a different
cause. Both come down to a reviewer being unable to see the whole app quickly,
which is exactly what the recording and the rewritten Notes fix.

## 6. The risk to watch next: 5.1.1(ix)

Item 6 ("highly regulated industry") is where this review is most likely to
turn. FinatriX is in the Finance category and enrolled as an **Individual**
(Team `AY79GYWLDP`); Apple expects regulated financial services to come from a
legal entity. The reply states, truthfully, that FinatriX provides no regulated
service, and [LEGAL_REVIEW_PACKAGE.md](LEGAL_REVIEW_PACKAGE.md) §3 sets out the
exposure (InvestMatch's allocation and ParkSmart's ranking are the surfaces a
reviewer could read as advice). If Apple answers with 5.1.1(ix), the options
are that document's three: keep arguing the educational framing, move the app
to an Organization account (legal entity and D-U-N-S, 1–4 weeks), or soften the
two surfaces. That is a legal and business decision, so it is the owner's.
