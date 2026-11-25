# Real-device checklist

Written 25 Nov 2026. Everything below needs a real phone, a store account or a signed-in service, so no agent could do it. About 20 minutes with one iPhone and one Android phone. Tick as you go. If something fails, note the step number and the phone model.

Menu names and wording below come from the code and the step briefs, not from a run on a phone. If a label differs on screen, trust the screen and fix this file.

Use a **throwaway test account** for anything that writes to the cloud (groups, sync). Use **Settings → Privacy → Allow AI** for the AI steps.

## Both phones (10 min)

| # | Check | Expected |
| --- | --- | --- |
| 1 | **App lock.** Settings → App lock → turn on. Background the app, wait 10 s, return. | Face ID / fingerprint prompt. The app switcher card is blank. Cancelling keeps the app covered. Turning it off asks for one more check. |
| 2 | **Voice chat.** Open FinatriX AI, tap the mic, say "How much did I spend on food this month?". | Mic permission asked once. The spoken question appears as text and the answer reads aloud. Figures match the tracker. |
| 3 | **Voice action.** Say "Add 200 rupees for coffee". | A confirm card appears. Nothing is saved until you tap Confirm. |
| 4 | **Hands-free.** Start hands-free, ask two questions, then say "stop". | It keeps listening between turns, stops on "stop", and never listens with the app in the background. |
| 5 | **Share to FinatriX.** In Photos or Files, share a bank-statement screenshot and a bill photo to FinatriX. | FinatriX opens on Expenses with the file ready to import. The bill photo fills the add form. |
| 6 | **Bill locker.** Add a bill, attach a photo, set a warranty end date, close and reopen. | The photo stays. A reminder is offered. Nothing is uploaded (photos are device-only). |
| 7 | **Travel mode with live rates.** Start a trip to another currency, add an expense in that currency. | A rate and its date show. Offline, the last rate is used and labelled with its age. |
| 8 | **Hide amounts.** Turn on Hide amounts. | Amounts show as dots everywhere, including the widget (if the lock-screen option is off). |
| 9 | **Groups.** Phone A creates a group, phone B joins with the code, B adds an expense. | A sees it live and a "1 new" badge on the group. Balances add to zero. Push notifications are **not** expected (see "Not built"). |

## iPhone only (6 min)

| # | Check | Expected |
| --- | --- | --- |
| 10 | **Siri.** "Hey Siri, talk to FinatriX" and "Hey Siri, add an expense in FinatriX". Also look in the Shortcuts app. | Both open the app on the right screen. Both appear under FinatriX in Shortcuts and Spotlight. Siri passes no words; the conversation happens in the app. |
| 11 | **On-device AI** (iPhone 15 Pro or newer, Apple Intelligence on, iOS 26+). Ask a short question; ask a long one about your whole month. | Short answers say "Answered on this phone … nothing was sent". The long chat falls back to the cloud (its prompt is bigger than the phone model's window). On an older iPhone it always uses the cloud and says nothing odd. |
| 12 | **Widget.** Add the FinatriX widget (home and lock screen). Tap **Add**. | Shows safe-to-spend. Lock-screen amount is hidden until you turn it on. Add opens the add form. |
| 13 | **Watch app** (Apple Watch paired). Install from the Watch app. | The complication shows safe-to-spend; the app opens. Needs the watch build to be in the TestFlight build the other session is producing. |
| 14 | **Share extension.** Needs App Group `group.co.finatrix.app` on the app and the `co.finatrix.app.ShareExtension` App ID (docs/IOS.md §4.1). | Share sheet lists FinatriX. |

## Android only (4 min)

| # | Check | Expected |
| --- | --- | --- |
| 15 | **Shortcuts.** Long-press the app icon. | "Talk to FinatriX" and "Add an expense" shortcuts. |
| 16 | **Google Assistant.** "Hey Google, open voice chat on FinatriX." | Works **only** for an app installed from Play (internal track is fine), and can take hours to a day after the upload. Use the App Actions Test Tool if it does not respond. |
| 17 | **On-device AI** (Pixel 9 or Galaxy S24 class with Gemini Nano). Ask a short question. | "Answered on this phone". Other phones use the cloud. |
| 18 | **Widget.** Add the FinatriX widget (small and medium). | Matches the tracker; Add opens the form. |

## Not built (do not test)

- Push notifications for group activity (needs your FCM and APNs keys). The in-app "new" badge stands in.
- Wear OS app (designed in docs/WATCH.md, not built).
- Indian-language app (dropped).

---

## Android release prep (do not submit until you decide)

**Version.** The Android build reads `-PfxVersionCode` and `-PfxVersionName`; nothing is committed. The last published build recorded here is 1.0.1 (code 10, 30 Oct 2026). **Read the highest code in Play Console first** (Test and release → App bundle explorer): codes never repeat, even for drafts. Then build with a code above it and a new name:

```bash
npm run build && npx cap sync android && cd android && ./gradlew bundleRelease -PfxVersionCode=<next> -PfxVersionName=1.1.0
```

Recommended name: **1.1.0** (new features, the `v1.1.0` tag is already used for the web). `scripts/android-build.sh` finds JDK 21. The AAB is over 10 MB, so upload it by hand once on one track, then use "Add from library" for others.

**Permissions added since the last published build (check the Play Console against these):**

| Permission / capability | Why | Play Console action |
| --- | --- | --- |
| `RECORD_AUDIO` (runtime, asked at first mic tap) | Voice chat. Heard only while the voice conversation runs in the open app; the phone's own recogniser turns speech into text. FinatriX keeps no recording. | Data safety: add **Audio → Voice or sound recordings**, collected = yes, shared = no, optional, purpose App functionality. The recogniser is Google's service on the phone, and the text of the question goes to the AI provider only after consent. This declaration is conservative; decide with your legal reviewer. |
| `USE_BIOMETRIC` (normal permission) | App lock. The app never sees the fingerprint. | None. No store declaration for a normal permission. |
| `queries` for speech recogniser and TTS | Needed on Android 11+ to find the phone's speech services. | None. |
| Share target (`SEND` / `SEND_MULTIPLE`, images) | Share to FinatriX. No storage permission; the picker grants one file at a time. | None. |
| Widgets, launcher shortcuts / App Actions | Home-screen widget, assistant launch. | None. App Actions only work for apps from Play. |
| `SCHEDULE_EXACT_ALARM` | Deliberately removed from the merged manifest. | None. |

Also in the Data safety form: bill-locker photos stay on the device (not collected). Group data (names, expenses, balances) lives in the cloud for signed-in users: add it under **Financial info → Other financial info** (already declared) and **Personal info → Name** (already declared). Keep the privacy policy in step (the repo's Privacy page already covers it). The completed answers on file are in docs/PLAY_CONSOLE_RELEASE_2026-10-02.md.

**Release notes for Play ("What's new", under 500 characters):**

> New: travel mode with live exchange rates, groups to budget and split costs together, splits with people not on FinatriX, subscription radar and bill reminders, a monthly money story, a money calendar, warranty and bill locker, share-to-FinatriX, a home-screen widget, optional app lock, and a voice assistant in 11 languages. FinatriX AI now answers on your phone where it can.

**Owner steps (agents do not submit to Play):**

1. Confirm the highest code in Play Console, build the AAB with the next code.
2. Upload to the **Internal testing** track first. Test items 15 to 18 above on a real phone.
3. Update **Data safety** for the microphone row, then submit the app content declarations if Play asks.
4. Promote to Production with a staged rollout (20 percent, then 100 percent). Managed publishing is on, so press **Publish changes** after approval.
5. Re-check `npm run verify:production` and the live listing afterwards.
