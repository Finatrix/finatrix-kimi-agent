# FinatriX new features

The list of new features we are planning, with what was decided for each. The build order is in [BUILD_PHASES.md](BUILD_PHASES.md) (24 Nov 2026).

| # | Feature | Status |
| --- | --- | --- |
| 1 | [FinatriX AI voice assistant](#1-finatrix-ai-voice-assistant) | All decided, not started |
| 2 | [Travel mode in the Expense Tracker](#2-travel-mode-in-the-expense-tracker) | Stage 1 built ([PR 25](https://github.com/Finatrix/finatrix-kimi-agent/pull/25)); stage 2 is step 2.1 |
| 3 | [Home-screen widget](#3-home-screen-widget) | Lock-screen amount decided: hidden until the user turns it on (24 Nov 2026). Step 3.4 |
| 4 | [Share to FinatriX](#4-share-to-finatrix) | Suggested, not discussed |
| 5 | [Receipt scan](#5-receipt-scan) | Suggested, not discussed |
| 6 | [Subscription radar](#6-subscription-radar) | Suggested, not discussed |
| 7 | [Bill reminders](#7-bill-reminders) | Suggested, not discussed |
| 8 | [Monthly money story](#8-monthly-money-story) | Suggested, not discussed |
| 9 | [Splits and money lent](#9-splits-and-money-lent) | Suggested, not discussed |
| 10 | [Warranty and bill locker](#10-warranty-and-bill-locker) | Storage decided: device-only to start (24 Nov 2026). Step 3.5 |
| 11 | [Hide amounts](#11-hide-amounts) | Suggested, not discussed |
| 12 | [Family budget and groups](#12-family-budget-and-groups) | All decided, not started |
| 13 | [Money calendar](#13-money-calendar) | Suggested, not discussed |
| 14 | [Private on-device AI](#14-private-on-device-ai) | Built in step 3.7 ([PR 44](https://github.com/Finatrix/finatrix-kimi-agent/pull/44)); decisions below (25 Nov 2026) |
| 15 | [Indian languages](#15-indian-languages) | **Dropped** by the owner (25 Nov 2026). Was step 3.6 |
| 16 | [Watch app](#16-watch-app) | Suggested, not discussed |

---

## 1. FinatriX AI voice assistant

Added 24 Nov 2026.

A voice assistant that works like an agent. The user speaks, and it does the job inside FinatriX.

### How it works

1. The phone or browser turns speech into text. iPhone, Android, Chrome and Safari have this built in at no extra cost.
2. The AI picks the right app action and fills in what the user said.
3. FinatriX runs the action with its own code.
4. The reply is read aloud.

The AI only ever sees text, so the current model works as it is. The only running cost is the AI call the chat already makes. A real-time voice model would sound more natural and cope better with interruptions, but it usually costs more per minute.

### What it can do

- Log an expense: "Add ₹450 for lunch yesterday."
- Answer questions about the user's own data: "How much did I spend on food this month?"
- Change a budget: "Set my grocery budget to 8,000."
- Run a calculator and explain the result: "If I invest 10,000 a month for 15 years, what do I get?"
- Do several actions in one go: "Salary came in, 60k. Put 15k for rent and 10k in savings."
- Open any screen, or explain any number on it.

### Limits

- **Moving money** (UPI, bills, transfers, buying funds) needs licensed payment or broker partners, and voice can mishear ₹15,000 as ₹50,000. The safe version fills in the details and hands off to the user's UPI or bank app, where they confirm.
- **Reading bank accounts automatically** needs India's Account Aggregator system, through a regulated partner. Until then, data comes from what the user says, types or imports.
- **Personal investment advice** ("Which fund should I buy?") is regulated by SEBI, so answers stay educational.
- **Other apps:** a phone won't let one app control another. Siri Shortcuts could still start it: "Hey Siri, log ₹200 coffee in FinatriX."

### Rules

- The AI never makes up numbers. Amounts come from the user and calculations come from the app, the same rule the AI chat follows today.
- Nothing is saved until the user taps a confirm card, and every action can be undone.
- It asks for microphone permission, and the existing AI consent is extended to cover voice.

### Build stages, easiest first

1. A mic button in the existing AI chat, with replies read aloud and hands-free back-and-forth once it's started.
2. A fixed set of safe actions, each with a confirm card.
3. Multi-step plans, and starting it from Siri or Google's assistant.

### Decided

- English plus the major Indian languages: Hindi, Bengali, Marathi, Telugu, Tamil, Gujarati, Kannada, Malayalam, Punjabi and Odia (24 Nov 2026). Mixed speech such as Hinglish should work too. Support differs by phone, so check each language on real devices at build time.
- Free for everyone (24 Nov 2026).
- On the web and both apps, together (24 Nov 2026).
- Hands-free (24 Nov 2026). Once started, it keeps listening between turns, so there's no tapping, and it stops after a pause or when you say "stop". It never listens in the background, which phones restrict and which would be a privacy risk. To start it without opening the app, use Siri or Google's assistant.

Nothing left to decide.

---

## 2. Travel mode in the Expense Tracker

Added 24 Nov 2026.

While you travel, the expenses you log are entered in the local currency and converted to your home currency. Rent, bills and other basics stay in your home currency.

### Starting a trip

A "Travel mode" button with a plane icon sits at the top of the Expense Tracker. It opens one short screen:

1. **Where are you going?** Pick the country and its currency fills in (Dubai → AED), or pick a currency directly.
2. **When?** From and to dates, with quick picks: 3 days, 1 week, 2 weeks. You can set it up before you leave.
3. **Rate.** Nothing to type. The app fetches today's live rate and fixes it for the whole trip: "1 AED = ₹24.0 · live rate, fixed for this trip". If you set the trip up early, the rate refreshes once on the first day (when you're online) and then stays fixed. You can still change it, for example to your forex card's rate.
4. **Card fee (optional).** Your card's forex fee, in %. It's on your card's fee page, and you can leave it blank if you're not sure. It's added to every trip expense except ones marked Cash: "1 AED = ₹24.0 + 3.5% card fee = ₹24.84".
5. **These stay in ₹:** Rent, Bills, EMI / Loans, Subscriptions, Investments, and anything marked recurring. Tap to change the list.

A trip name ("Dubai trip") is optional. Then: **Start travel mode**.

### During the trip

- Travel mode turns on by itself on the start date and off after the end date. There's nothing to remember.
- A slim strip at the top shows the trip: "✈ Dubai · 3 days left · AED 1,240 (₹29,760)". Tap it for the trip summary.
- The amount field shows AED, with the ₹ value under it as you type.
- Picking Rent or Bills switches the entry to ₹ by itself.
- One tap on the currency switches any single expense, for example a hotel booked in ₹.
- Lists show both amounts: "AED 120 · ₹2,880".
- Expenses dated inside the trip use the trip currency, even if you log them after you get back. Expenses dated outside it stay in ₹.
- It works offline, because the rate is saved with the trip.

### Ending the trip

- On the last day it asks "Still travelling?" One tap extends the trip.
- "End trip now" covers coming back early.
- Afterwards you get a summary: the total in both currencies, spending by category, the daily average and the biggest spends.

### Budgets and totals

Every trip expense is also saved in your home currency at the trip's fixed rate, so every total, budget and report keeps working exactly as today. Trip spending counts in that month's budgets like any other spending (decided 24 Nov 2026). The budget screen says how much came from the trip ("Includes ₹29,760 from the Dubai trip"), so an overspend is never a mystery.

### Rules

- One rate for the whole trip. If you change it, travel mode asks before updating the trip's expenses: "Update 12 trip expenses to the new rate?"
- The rate comes from an exchange-rate feed, never from the AI. AI models can get numbers wrong, so the AI may explain the rate but never sets it.
- With a card fee, the ₹ amount is the foreign amount × rate × (1 + fee ÷ 100). AED 120 at ₹24.0 with a 3.5% fee is ₹2,980.80. Each expense saves the rate and fee it used, and changing the fee later asks first, just like the rate.
- If the bank charged a different ₹ amount, you can type the real figure from the statement. Totals then use what you actually paid.
- No live rate (offline at setup, or a rare currency): travel mode uses the last saved rate and shows its date, or asks you for one. It never guesses.
- Deleting a trip keeps its expenses, because they're real spending.
- Trips can't overlap. A multi-country trip is one trip per country, back to back, and ending one offers "Next stop?" to start the next in one tap.
- A trip inside your own country works too. The currency doesn't change, but you still get the trip strip and the summary.

### How it fits the current code

- Each expense keeps `amount` in the home currency, so every total, budget and report stays exactly as it is (calculation parity). The foreign amount, its currency, the rate used and the trip id are added as optional details. `normalizeExpense` copies only the fields it knows, so the new fields must be added there or they vanish on reload.
- Home currency is the existing `fx_currency` setting.
- Conversion uses `fx.ts` (its converter and the user's own rate overrides), so there's no new conversion formula. The card fee adds one documented step on top, × (1 + fee ÷ 100), skipped when the existing `paymentMethod` field is `Cash`.
- The live rate is new work: nothing in the repo fetches rates or runs on a schedule yet. A small server job fetches the day's rates once a day and the app caches them. `fx.ts` was built for exactly this swap, so the dashboard and net worth get live rates too. The built-in table (1 Jun 2026, already past its 120-day freshness limit) stays only as an offline fallback, shown with its date.
- Pick a rate source that covers the currencies Indian travellers use most. Some free central-bank feeds miss the Vietnamese dong and the Sri Lankan rupee, for example.
- Trips are a new synced list (`fx_trips`). It needs a cloud-sync key and a merge rule.
- The basics come from the existing categories (`rent`, `bills`, `emi`, `subs`, `invest_et`) plus the `recurring` flag.
- Trip dates are plain calendar days (the local-date helpers), so they don't shift by a day in another time zone.

### Build stages, easiest first

1. The live rate feed, trip setup, automatic trip currency for trip dates, both amounts shown, and the trip summary.
2. A trip budget, the ₹-from-statement fix, and adding pre-trip bookings such as flights to the trip.
3. Several currencies in one trip, and voice entry ("50 dirhams for a taxi") through the voice assistant.

### Decided

- Trip spending counts in monthly budgets, in the home currency (24 Nov 2026).
- The rate is the live rate, fetched automatically and fixed for the whole trip (24 Nov 2026).
- Trip setup has an optional card fee, added to every trip expense except ones marked Cash (24 Nov 2026).
- One currency per trip. A multi-country trip is back-to-back trips (24 Nov 2026).
- Free for everyone (24 Nov 2026).

Nothing left to decide. Ready to build once every feature on the list has been discussed.

---

## 3. Home-screen widget

Added 24 Nov 2026. Suggested, not discussed yet.

Shows "Safe to spend today: ₹1,240" with an Add button on the home screen and lock screen, so logging an expense doesn't need the app to be opened.

- Small and medium sizes on iPhone and Android, plus a lock-screen version on iPhone.
- Add opens straight to the add-expense form.
- Follows Hide amounts (item 11), so the number can stay private.
- **Fits the current code:** the figure is the existing daily safe-spend number. Widgets need some native code in each app (WidgetKit on iPhone, app widgets on Android), because FinatriX is web code inside Capacitor.
- **Effort:** medium.
- **To decide:** show the amount on the lock screen by default, or only after the user turns it on?

---

## 4. Share to FinatriX

Added 24 Nov 2026. Suggested, not discussed yet.

Share a payment screenshot from GPay, PhonePe, a bank app or the gallery straight to FinatriX, and the expense is filled in.

- FinatriX appears in the phone's share menu.
- The user checks the filled-in expense before saving. Several screenshots can be shared at once.
- **Fits the current code:** reuses the existing screenshot import, which reads the image on the device. Needs a share extension on iPhone, a share target on Android, and the web share target where the browser supports it.
- **Effort:** medium.

---

## 5. Receipt scan

Added 24 Nov 2026. Suggested, not discussed yet.

Photograph a paper bill, and the amount, shop and date are filled in.

- A camera button on the add-expense form.
- The photo is read on the phone. Nothing is uploaded to read it.
- The user checks the result before saving. The photo can be kept with the expense (see item 10).
- **Fits the current code:** reuses the on-device text reading from the screenshot import. Paper bills need their own layout rules: the total line, the shop name at the top, and Indian date formats.
- **Effort:** small to medium.

---

## 6. Subscription radar

Added 24 Nov 2026. Suggested, not discussed yet.

One screen with every subscription and what it costs a year: "4 subscriptions = ₹7,800 a year".

- Built from the Subscriptions category and expenses marked recurring.
- A reminder 3 days before each renewal, and before a free trial ends (the user types the trial's end date).
- **Fits the current code:** uses the existing recurring detection (`detectRecurring`) and local notifications.
- **Effort:** small.

---

## 7. Bill reminders

Added 24 Nov 2026. Suggested, not discussed yet.

"Electricity usually comes on the 5th, about ₹1,800", sent the day before.

- Based on bills the app has already seen repeat. Any single reminder can be turned off.
- After the date: "Paid it? Log it in one tap", with the usual amount filled in.
- **Fits the current code:** the upcoming-bills logic (`commitments.ts`) and local notifications already exist. The app already sends up to 3 notifications a day, so the reminders need to fit within that.
- **Effort:** small.
- **To decide:** one daily summary, or a separate reminder for each bill?

---

## 8. Monthly money story

Added 24 Nov 2026. Suggested, not discussed yet.

A short recap at the start of each month: the top category, the biggest change from last month, and how much was saved.

- 4 or 5 swipeable cards in plain words.
- Shareable as an image, with amounts hidden by default.
- **Fits the current code:** reads the existing monthly totals and analytics. The only new maths is comparing one month with the last.
- **Effort:** small to medium.

---

## 9. Splits and money lent

Added 24 Nov 2026. Suggested, not discussed yet.

Split a bill and log only your share, and keep track of who owes whom.

- "Split ₹2,400 with 3 friends" logs ₹600 as your expense and records that each friend owes you ₹600.
- Money lent or borrowed is tracked separately from spending.
- A ready-made reminder ("You owe me ₹600 for Saturday's dinner") opens in WhatsApp, and the user sends it.
- "Mark as settled" when it's paid back. No money moves through FinatriX, so no payment licence is needed.
- **Fits the current code:** a new synced list, which needs a cloud-sync key and a merge rule. Only your share counts as spending. What friends owe you is not spending.
- **Effort:** medium to large.
- **To decide:** do friends need FinatriX too, or does it all live on the user's phone? The second is much simpler.
- **Built (step 2.5, 25 Nov 2026):** the second. The list is the user's own data, synced between their devices and never shared; friends who use FinatriX go through Groups. Each entry is between you and one person, so it never suggests one friend pays another. The maths is in [SPLITS.md](SPLITS.md).

---

## 10. Warranty and bill locker

Added 24 Nov 2026. Suggested, not discussed yet.

Keep bill photos with their warranty end dates, and get a reminder before a warranty runs out: "Your TV's warranty ends in 30 days."

- Add from a receipt scan (item 5) or from the gallery.
- Search by product or shop.
- **Fits the current code:** photos are large, so they stay on the device at first. Syncing them needs file storage, which costs more than today's data sync.
- **Effort:** medium.
- **To decide:** device-only at first, or synced photos from day one?

---

## 11. Hide amounts

Added 24 Nov 2026. Suggested, not discussed yet.

One tap on an eye icon hides every number in the app, for public places or screen sharing.

- Amounts show as "₹ ••••". Charts keep their shape but lose their labels.
- The choice is remembered, and widgets follow it.
- **Fits the current code:** one switch in the shared money formatting, plus a check of any screen that prints amounts its own way.
- **Effort:** small.

---

## 12. Family budget and groups

Added 24 Nov 2026. Discussing.

A shared space, like a Splitwise group or a game room, where family members, flatmates or friends track money together. Each person uses their own phone, and everyone sees the group's spending live.

### Creating and joining

- **Create:** pick a type (Family, Couple, Home for flatmates, Trip or Friends), a name and an emoji. The type sets sensible defaults, so nothing else needs filling in.
- **Invite:** every group gets a room code like `FX-7K2P9Q`, a link and a QR code. Share the link on WhatsApp, read the code out on a call, or scan the QR in person.
- **Join:** the link opens straight into the app or the website and shows "Join Sharma Family? 3 members". One tap and you're in.
- Codes expire after 7 days, and the admin can reset them at any time.

### Two ways to use a group

| | Budget together | Split costs |
| --- | --- | --- |
| Best for | Family, couple | Flatmates, trips, friends |
| What it tracks | The household's spending against one shared monthly budget | Who paid, each person's share, and who owes whom |
| Who paid | Shown, with no balances | Drives the balances |

A Family group starts in "Budget together", and a Home or Trip group starts in "Split costs". Any group can switch on either one.

### Adding a group expense

- The add-expense form gets one new choice: **Personal** (the default) or a group.
- In a split group, "Paid by" defaults to you and "Split" defaults to equally. Splitting by shares or exact amounts is one tap away.
- Everyone sees it at once in a live activity feed: "Amma added ₹1,200 · Groceries".

### What the group shows

- **Budget together:** this month's household spending by category against the shared budget, and how much each member added.
- **Split costs:** each person's balance ("You owe Rahul ₹600") and the fewest payments that settle everyone up.
- **Settle up:** "Mark as paid" records the payment, and a ready-made reminder opens in WhatsApp for the user to send. No money moves through FinatriX, so no payment licence is needed.

### Privacy and control

- Only expenses you add to a group are shared. Other members never see your personal expenses, budgets or goals.
- Anyone can leave at any time. The admin can remove members and reset the code.
- Every change shows who made it: "Edited by Priya".
- Members must be 18 or over. Children can appear as names a parent manages (for school fees or pocket money), with no account of their own, because India's data protection law (the DPDP Act) needs verifiable parental consent before a child's data is processed.
- Leaving or deleting an account removes that person's details. Their past group expenses stay for the others, shown as "Former member".

### Rules

- In a split group, only your share counts as your spending. What others owe you is not spending.
- Your share shows in your personal Expense Tracker as a normal expense marked with the group's name, so your own budgets stay right. It updates when the group expense changes, and it stays if you leave the group.
- Every balance comes from the group's own expenses. The AI never sets one.
- A group has one currency. Trip groups using travel mode's live rates, and members in other countries, come later.
- It works offline: new expenses wait on the phone and upload when the connection returns.

### How it fits the current code

- This is FinatriX's first shared, multi-user data. Today each user's data syncs as one private snapshot, so groups can't live there. They need new server tables (groups, members, group expenses, invites, settlements) with row-level security, so only members can read a group, plus live updates.
- Joining by code goes through a server function that is rate-limited, so codes can't be guessed.
- New SQL and security policies get the usual care: test the migration locally first, check every policy, then apply it to production with the existing recipe.
- Invite links reuse the app's existing app links on iPhone and Android.
- Balances and "fewest payments" are new money maths. They get written down and agreed before they're built.
- Item 9 (Splits and money lent) stays for splitting with people who aren't on FinatriX. We can decide whether to merge the two when we discuss item 9.
- If the end-to-end encryption plan in `docs/E2EE_FINANCE_SYNC_PLAN.md` goes ahead, groups will need a shared group key.

### Build stages, easiest first

1. Groups, room codes and links, shared expenses, the live feed, and "Budget together" with a shared monthly budget.
2. "Split costs": who paid, split options, balances, settle up, WhatsApp reminders, and your share in your personal tracker.
3. Push notifications for group activity, children as managed names, group savings goals (a family holiday), trip groups in travel mode's currency, and members in other countries.

**Effort:** large. It's the biggest item on the list so far.

### Decided

- Your share of a split group's expense appears in your personal Expense Tracker automatically. A family's "Budget together" spending stays separate from personal budgets (24 Nov 2026).
- Free for everyone (24 Nov 2026).
- Up to 20 members per group, raised later if people ask (24 Nov 2026).

Nothing left to decide. Ready to build once every feature on the list has been discussed.

---

## 13. Money calendar

Added 24 Nov 2026. Suggested, not discussed yet.

The next 30–90 days on one calendar: salary in; rent, EMIs, bills and subscriptions out; and the expected balance each day. It warns early: "Tight around the 27th, about ₹3,200 short."

- Built only from the user's own data: their income and the bills the app has seen repeat.
- Always labelled as an estimate.
- **Fits the current code:** builds on the upcoming-bills logic (`commitments.ts`) and recurring detection. The projection is new money maths, so it gets written down and agreed before it's built.
- **Effort:** medium to large.

---

## 14. Private on-device AI

Added 24 Nov 2026. Built in step 3.7 (25 Nov 2026).

Newer iPhones and some Android phones have AI built in. FinatriX could use it to suggest categories, write summaries and run the voice assistant (item 1).

- It works offline, costs nothing per use, and the data never leaves the phone.
- Phones without it keep the current cloud AI.
- The rule stays the same: the AI never sets a number.
- **Fits the current code:** a second AI path beside the current one, behind the same consent and grounding rules. Needs native code in each app.
- **Effort:** medium to large.

### Decided

Decided by the building session under the owner's delegation (25 Nov 2026), safest and simplest option each time. The reasons are in [PR 44](https://github.com/Finatrix/finatrix-kimi-agent/pull/44).

- **One path, inside the transport.** `requestCompletion` tries the phone's model first (`src/lib/ai/onDevice.ts`), after the same consent gate, and every caller's own checks (the money chat's grounding and same-line rule, the action resolver, category validation) run on its answer unchanged.
- **Consent still applies.** `fx_ai_consent` gates the on-device path too, even though nothing leaves the phone, so there is one permission and one set of rules.
- **Which tasks:** the money chat, the voice assistant's action picker and statement category suggestions. Careers and statement layout stay in the cloud.
- **Only when the request fits.** Apple's and Google's models take about 4,000 tokens. Today's money-chat prompt alone is larger, so chat answers stay in the cloud until a phone reports a bigger window; voice actions and category suggestions fit now.
- **The cloud is the fallback** whenever the phone has no model, the model is still downloading or switched off, the request is too long, the model refuses or errors, takes over 30 seconds, or its reply fails the caller's check.
- **On by default** where supported, with a switch in Settings → Privacy shown only on phones that have a model. Answers from the phone are labelled in the chat.
- **Android downloads Gemini Nano** through AICore only when a request is about to use it, never when a screen merely describes it.
- **Not on the web** for now (Chrome's built-in model is a possible later step).

---

## 15. Indian languages

Added 24 Nov 2026. **Dropped by the owner on 25 Nov 2026**, so step 3.6 will not be built. The notes below are kept for the record.

The whole app in Hindi, Tamil, Telugu, Marathi, Bengali and more, to reach far more people, especially first-time budgeters.

- **Fits the current code:** the app has no translation system yet, so every screen's text has to move into translation files first. Lessons and calculator explanations need a careful review in each language, because a wrong translation in finance misleads people.
- **Effort:** large.
- **To decide:** which languages first?

---

## 16. Watch app

Added 24 Nov 2026. Suggested, not discussed yet.

Log an expense from an Apple Watch or a Wear OS watch in two taps or by voice, and see today's safe-to-spend on the watch face.

- **Fits the current code:** a separate small native app for each watch, linked to the phone app. Nothing like it exists yet.
- **Effort:** large.
