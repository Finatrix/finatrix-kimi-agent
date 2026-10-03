# FinatriX launch guide — everything left, step by step

Written 3 October 2026 for someone who has never published an app. Follow the
tasks **in order**. Each one says where to click, what to type, which file to
use, what you should see, and what to do if you don't. Tick the boxes as you go.

**Where things stand.** The website and servers are fixed and verified. Android
version 1.0.0 (6) is live to your 12 closed testers. iOS build 1.0.0 (2) is in a
finished **draft** submission at Apple (not submitted). Everything below needs
your hands, your phone, your passwords, or time.

**Two things nobody else can do for you:** type passwords, and make legal
statements in your name. That is why these steps are yours.

---

## 0. Before you start

You need these open or at hand:

| What | Used for |
|---|---|
| This Mac, signed in to Chrome | App Store Connect and Play Console |
| Your iPhone 16 Pro, unlocked, with the **TestFlight** app | Tasks 1–2 |
| An Android phone (Android 7 or newer) | Task 6 |
| Your Apple Developer login (Team: Hrishik KS) | App Store Connect |
| Your Google Play Console login (developer: FinatriX) | Play Console |

**The demo account** (a pretend user for Apple's reviewers and for your testing):

- User name: `finatrix.hub+appreview@gmail.com`
- Password: **copy it, don't type it.** Open
  <https://appstoreconnect.apple.com> → **Apps** → **FinatriX: Budget & Money Plan**
  → **Distribution** → **iOS App 1.0.0** → scroll to **App Review Information**.
  The two boxes under *Sign-In Information* hold the user name and password.
  Click in a box, press `⌘A`, `⌘C`. Because your Mac and iPhone share a clipboard,
  you can then paste on the iPhone (long-press a field → **Paste**).
- It already contains fictional data (October 2026 spending, net worth, a goal).
  **Never delete this account** during testing.

**Test files** (all in the project folder `/Users/hrishikks/Downloads/app/docs/launch/`):

| File | Use |
|---|---|
| `sample-statement.csv` | A valid bank statement (7 transactions) |
| `sample-statement.pdf` | A valid PDF statement (5 transactions) |
| `invalid-statement.csv` | A file the app must politely refuse |
| `sample-statement-photo.png` | Open full-screen on the Mac and photograph with the phone |

To send files to the iPhone: in Finder open that folder, select the files,
right-click → **Share** → **AirDrop** → your iPhone. On the iPhone, tap
**Accept**; they land in **Files → Downloads**.

---

## Task 1 — Test the iOS app on your iPhone (about 2–3 hours)

**Why:** Apple's reviewers will do exactly this. Anything broken here will be
rejected there. I could test everything except the parts that need your phone,
your Face ID and your passwords.

Open **TestFlight** on the iPhone → **FinatriX**. It should say **1.0.0 (2)**.
If it offers **Update**, tap it first.

Write down anything that goes wrong (a screenshot is best) and send it to me.

### 1.1 Starting up
- [ ] Force-quit the app (swipe up from the bottom, flick FinatriX away), open it.
  **Expect:** a launch screen, then the Dashboard. No white flash, nothing hidden
  under the Dynamic Island or the home bar.
- [ ] Tap the sun/moon button (top right) to switch light/dark. **Expect:** all
  text readable in both; the clock/battery at the top readable in both.
- [ ] Turn the phone sideways. **Expect:** content clears the rounded corners.
  Turn it back.

### 1.2 Without an account (guest mode)
- [ ] Tap **Expenses**. A round black **+** sits bottom-right. Tap it, type
  `340` in the amount, type `lunch` in the note, tap **Add transaction**.
  **Expect:** the sheet closes and "Monthly spent" goes up by 340.
- [ ] On **Budget**, **Goals** and **Net Worth**, tap **Show calculation,
  examples & FAQ** once. **Expect:** it opens; tap again, it closes.
- [ ] Look everywhere for prices or "Buy/Upgrade" buttons. **Expect:** none.

### 1.3 Sign in with the demo account
- [ ] Tap **SIGN IN** (top right) → **or sign in with email**. Paste the user
  name and password (see Task 0). Tap **Sign in**.
  **Expect:** you land signed in; the Dashboard now shows October 2026 data;
  Net Worth shows about ₹8.57 L; Goals shows "Home down payment".
- [ ] Force-quit and reopen. **Expect:** still signed in.
- [ ] **Menu (top left) → Sign out** (or **Profile → Sign out**), then **SIGN IN** and sign in again. Works.

### 1.4 The AI assistant (this proves the AI privacy fix works)
- [ ] While signed in, tap the **gold sparkle** button (bottom right).
  **Expect:** a permission box naming **OpenRouter**. Tap **Allow**.
- [ ] Ask: `How much have I spent on groceries this month?`
  **Expect:** a written answer within about 20 seconds. **If it says the AI is
  unavailable or errors, screenshot it and send it to me** — that means the
  privacy setting is blocking every AI provider and I must adjust it.

### 1.5 Sign in with Apple (and prove deletion revokes it)
- [ ] Sign out. **SIGN IN → Continue with Apple.** Use your Apple ID; choose
  **Hide My Email** if offered. **Expect:** signed in, empty data (a new account).
- [ ] On the iPhone: **Settings → your name → Sign-In & Security → Sign in with
  Apple**. **Expect:** FinatriX is listed.
- [ ] Back in the app: **Menu → Profile → Delete account**. When asked, type
  `DELETE` if the account used Hide My Email, otherwise the email shown. Confirm.
  **Expect:** you are signed out.
- [ ] Re-check **Settings → … → Sign in with Apple**. **Expect:** FinatriX is
  **gone** from the list. (That is Apple's rule 5.1.1(v) working.)
- [ ] Sign in with Apple once more. **Expect:** an empty, brand-new account.
  Delete it again the same way.

### 1.6 Sign in with Google
- [ ] **SIGN IN → Continue with Google.** A browser sheet opens; pick any Google
  account. **Expect:** it returns to the app, signed in.
- [ ] Sign out. Start Google sign-in again, but this time **close the sheet
  halfway (tap Cancel/X)**. **Expect:** the sign-in form is usable again, no
  endless spinner.
- [ ] Sign in with Google once more, then **Profile → Delete account** to tidy up.

### 1.7 Links open the app
- [ ] Open the **Notes** app, type `https://finatrix.co/tools/goals`, tap the
  link. **Expect:** **FinatriX opens on the Goals page** (not Safari).
- [ ] Force-quit FinatriX, then tap the same link again. Same result.
- *If it opens Safari instead:* the website's link file was missing for about
  three hours today and Apple caches it. Wait a few hours (or delete and
  reinstall the app from TestFlight) and try again. If it still fails tomorrow,
  tell me.

### 1.8 Importing files
Send the files from Task 0 to the iPhone first.
- [ ] **Expenses → Import → choose file → `sample-statement.csv`.**
  **Expect:** a review sheet listing **7** transactions (Swiggy, BigBasket,
  salary, Netflix…). Confirm; they appear in the list.
- [ ] Start an import and **cancel** it. **Expect:** nothing changes.
- [ ] Import **`invalid-statement.csv`**. **Expect:** a clear message that it
  couldn't be read — no crash.
- [ ] Import **`sample-statement.pdf`**. **Expect:** **5** transactions.

### 1.9 The camera
- [ ] On the Mac, open `sample-statement-photo.png` and make it fill the screen.
- [ ] **Expenses → Import → Take Photo.** iOS asks to use the camera
  (the only time it will). Tap **Allow**.
- [ ] Photograph the Mac screen. **Expect:** the five rows (Blue Bottle Cafe,
  Market Groceries, …) are read and offered for review.

### 1.10 No internet
- [ ] Turn on **Airplane mode** (Control Centre), force-quit, reopen.
  **Expect:** Budget, Expenses and Goals still work. Turn Airplane mode off.

### 1.11 VoiceOver (blind-user screen reader)
- [ ] **Settings → Accessibility → VoiceOver → on.** In FinatriX swipe right
  repeatedly. **Expect:** the tab-bar buttons are read by name (Dashboard,
  Budget…), the **+** is read as "Add expense", and with a sheet open you can't
  swipe out into the page behind it.
- [ ] Turn VoiceOver off again (same Settings screen).

**All boxes ticked?** Tell me, or move to Task 2. **Any failure?** Send me the
screenshot and which step — I'll fix it and we'll re-test only that step.

---

## Task 2 — Declare your EU trader status (about 10 minutes)

**Why:** Until you do, Apple will not show the app in the 27 EU countries. It
does not block the rest of the world, so you can skip it for now.

This is a **legal statement about you**, so I can't pick the answer. Apple's
definition: a *trader* is anyone acting for purposes related to their trade,
business, craft or profession. FinatriX offers a paid Pro plan on its website,
which points towards "trader" — but ask an accountant or lawyer if unsure.
(A trader's name, address, phone and email are shown publicly on the app's EU
page; non-traders are not shown.)

1. <https://appstoreconnect.apple.com> → top menu **Business**.
2. Find the banner **"Complete Compliance Requirements"** → click it.
3. Choose **"I'm a trader"** or **"I'm not a trader"** and fill in what it asks
   (name, address, phone, email). Apple verifies the phone/email with a code.
4. Click **Save / Submit**. The banner should disappear.

---

## Task 3 (optional) — Let Family and Friends test via TestFlight (10 minutes)

Skip this if you only want to publish. It exists because Apple's *beta* review
rejected the first test build for having no demo account.

1. App Store Connect → **FinatriX** → **TestFlight** tab → left side, under
   **Additional**, click **Test Information**.
2. Scroll to **Beta App Review Information**. Tick **Sign-in required**. Two
   boxes appear. Copy the user name and password from **Task 0** into them.
   (The **Review Notes** box is already filled in.)
3. Click **Save** (top right).
4. Left side → **External Testing → Family** → **Builds** → the **+** → pick
   **1.0.0 (2)** → in *What to Test* paste:
   ```
   Try Budget, Expenses (tap the + to add a spend), Goals and Net Worth without an account. Signing in is optional. Tell us anything that looks wrong or confusing.
   ```
   → **Submit for Review**. Repeat for **Friends**.

---

## Task 4 — Submit the iOS app for review (5 minutes, then 1–3 days waiting)

**Only after Task 1 passes.**

1. <https://appstoreconnect.apple.com> → **Apps → FinatriX: Budget & Money Plan**
   → **Distribution** → **iOS App 1.0.0**.
2. Check three things on the page:
   - **Build** shows **2** (version 1.0.0).
   - **App Review Information → Sign-in required** is ticked with both boxes
     filled.
   - **App Store Version Release** says **Manually release this version**
     (already chosen — keep it; it lets you release when *you* are ready).
3. Bottom right, click the blue **Draft Submissions (1)** button.
4. Click **Submit for Review** (or **Add for Review** then **Submit**).
5. If Apple asks extra questions, these are the answers:
   - *Encryption / Export compliance:* the app is already marked as not using
     non-exempt encryption — if asked, choose **No** (it uses only standard HTTPS).
   - *Advertising Identifier (IDFA):* **No.**
   - *Content rights ("Does your app contain, show or access third-party
     content?"):* **No.** (This is normally already answered under **App
     Information**; only answer it if Apple asks again.)
6. The status becomes **Waiting for Review** → **In Review** → a decision, usually
   within 24–72 hours. You'll get an email.

**What happens next**
- **Approved** → status **Pending Developer Release** → open the version page →
  click **Release This Version**. It appears on the App Store within a day.
- **Rejected** → open **App Review → the message**, copy it to me. Most rejections
  are fixable in a day.
- **Possible rejection about a "legal entity" (Guideline 5.1.1(ix))** — Apple
  expects finance apps from companies, not individuals. If this happens you may
  need an Organization developer account (needs a registered business and a
  D-U-N-S number; 1–4 weeks). Give `docs/LEGAL_REVIEW_PACKAGE.md` to a lawyer
  *before* submitting if you want to be sure.

---

## Task 5 — Keep the Android closed test running (every few days until ~15 Oct)

Google will only let you publish after **12 testers have stayed opted-in for 14
days in a row**. Day 1 was 2 October, so the earliest is **about 15 October**.

- Do **not** remove testers, delete the Google Group `testers-community`, or
  pause the track. Any of those can restart the clock.
- Check progress: <https://play.google.com/console> → **FinatriX** → **Dashboard**.
  Look for *"12 testers have currently been opted in for N days continuously."*
- Ask your testers for real feedback now — you must report it in Task 7. Send
  them this:
  ```
  Thanks for testing FinatriX! Over the next few days please: 1) add a few expenses, 2) try the budget and goals tools, 3) try signing in, 4) tell me anything confusing, broken or missing — even small things. A reply like "worked fine, I liked X, Y was confusing" is perfect.
  ```
  Keep the replies (screenshots of messages are fine). **Never write feedback
  you didn't actually receive.**

---

## Task 6 — Test Google sign-in and deleting an account on Android (about 30 minutes)

You need an Android phone whose Google account is one of your 12 testers (or add
a spare Google account to the Group: <https://groups.google.com> →
**testers-community** → **Members → Add members**).

1. **Install the test build.** On the Mac: Play Console → **FinatriX** →
   **Test and release → Testing → Closed testing → Alpha → Testers** tab →
   **How testers join your test → Copy link**. Send that link to the phone,
   open it while signed in as the tester account, tap **Become a tester**, then
   **Download it on Google Play** and install. You should get version
   **1.0.0 (6)**.
2. **Google sign-in.** Open FinatriX → **SIGN IN → Continue with Google** →
   pick the account. **Expect:** a browser tab opens, then returns to the app
   signed in. Close and reopen the app: still signed in.
3. **Cancel check.** Sign out, start Google sign-in again, then press the
   system **Back** button halfway. **Expect:** the form works again.
4. **Delete account.** Menu → **Profile → Delete account** → type the email
   shown → confirm. **Expect:** signed out. Sign in with Google again →
   **Expect:** a fresh, empty account. (This deletes only the FinatriX account,
   never your Google account.)
5. **Links open the app.** In Messages or Notes, tap
   `https://finatrix.co/tools/goals`. **Expect:** FinatriX opens on Goals.
6. Anything odd → screenshot → send to me.

---

## Task 7 — Apply for production access (about 45 minutes, on or after ~15 Oct)

1. <https://play.google.com/console> → **FinatriX** → **Dashboard**. The button
   **Apply for production** turns blue once the 14 days are done.
2. Click it. Google asks questions in three groups. Wording varies slightly; use
   the matching answer. **Items in [brackets] only you can supply — use real
   information.**

   **About your closed test**
   - *How did you recruit testers?*
     `I invited 12 people I know personally, by email, through a Google Group (testers-community) and a Play opt-in link. [Say who they are — friends, family, colleagues.]`
   - *How many testers and for how long?*
     `12 testers, continuously opted in from 2 October 2026 for at least 14 days.`
   - *How did testers use the app?*
     `They logged expenses, built 50/30/20 budgets, used the goal planner and net-worth tracker, imported statements, and tried sign-in and cloud sync. [Edit to what they truly did.]`
   - *Feedback received and what you changed:*
     `[Summarise the real replies from Task 5.]` Then add:
     `During the test I also made these changes: sign-in now uses a safer one-time-code flow (PKCE); the sign-in token is excluded from device backups; a clear prompt appears on out-of-date WebViews; clearer messages when a statement format isn't supported; screen-reader fixes for dialogs; removed an unfinished feature from the app; and shortened the tool pages with collapsible explanations plus a one-tap add-expense button.`

   **About your app**
   - *What does the app do / who is it for?*
     `FinatriX is a free personal-finance education tool: monthly budgeting (50/30/20), expense tracking, goal planning and net-worth tracking. It works without an account; signing in only adds cloud sync. It is educational and does not hold money, give trades or recommend financial products.`
   - *Expected installs in the first year:* `[your honest estimate]`

   **Production readiness**
   - *Why is the app ready?*
     `It has been in closed testing for 14+ days; target API 36; in-app account deletion plus a web deletion page; no ads and no third-party trackers; no in-app purchases; Data safety and Financial features declarations completed; thousands of automated tests pass.`
3. Click **Submit**. Google replies by email, usually within **7 days**.

(The same text, with more detail, is in `docs/ANDROID.md` §11.)

---

## Task 8 — Publish on Google Play (about 30 minutes, after Task 7 is approved)

1. Play Console → **FinatriX → Test and release → Production → Create new release**.
2. Click **Add from library**, tick **1.0.0 (6)** (versionCode 6), **Add to
   release**. *Only if it isn't in the library*, use **Upload** and pick
   `/Users/hrishikks/Downloads/app/android/release-candidates/1.0.0-code6/finatrix-1.0.0-code6.aab`.
3. **Release notes** — in the *English (United Kingdom)* box paste:
   ```
   FinatriX 1.0 — your monthly money picture. Budget with the 50/30/20 rule, log spending in seconds, plan goals and track net worth. Works without an account; sign in only for cloud sync. The optional AI assistant always asks first. An educational tool, not financial advice.
   ```
4. **Next → Save.** On the **Countries/regions** tab make sure the countries you
   want are ticked (the closed test used 178).
5. **Publishing overview** (left menu) → **Send changes for review**. Review takes
   about 1–7 days.
6. When it says changes are **ready to publish** (managed publishing is on),
   open **Publishing overview** and click **Publish changes**.
7. If Google offers a **rollout percentage**, enter **20** to start; after 2–3
   days with no crash spike (**Monitor and improve → Android vitals**), raise it
   to **100**.
8. Search "FinatriX" on the Play Store on a phone (can take a few hours to appear).

---

## Task 9 — After both apps are live

- [ ] Open both store pages on a phone; check the icon, screenshots and text.
- [ ] Reply to any reviews; watch **Android vitals** (Play) and **Analytics** (Apple)
  for crashes in the first week.
- [ ] Change the demo account's password (and the matching Sign-In fields in
  App Store Connect) or delete the account if you won't need it again.

---

## Order and timing at a glance

| # | Task | You | Then waiting |
|---|---|---|---|
| 1 | iPhone test | 2–3 h | — |
| 2 | EU trader status (optional) | 10 min | — |
| 3 | TestFlight friends (optional) | 10 min | Apple beta review |
| 4 | Submit iOS | 5 min | **1–3 days** |
| 5 | Keep closed test running | 5 min/day | until ~15 Oct |
| 6 | Android sign-in test | 30 min | — |
| 7 | Apply for production | 45 min | **≤ 7 days** |
| 8 | Publish on Google Play | 30 min | **1–7 days** |

**Realistic dates:** iOS public about 7–10 October if you finish Tasks 1 and 4
this weekend and Apple approves first time. Android public about 25 October to
5 November.
