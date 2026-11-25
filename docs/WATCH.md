# Watch app (step 3.8)

NEW_FEATURES item 16. Safe-to-spend on the watch face and a quick add, for
Apple Watch (built, v1) and Wear OS (designed, not built). Read
[WIDGETS.md](WIDGETS.md) first: the watch reuses its document and rules.

## Status

| Piece | State |
| --- | --- |
| TypeScript: context, inbox, de-duplication, hook, tests | Done (`src/tools/lib/watch*.ts`, `src/native/watch.ts`, `src/test/watch*.test.ts`) |
| iPhone side: `WatchBridge`, `FxWatch` plugin | Done, compiles in the app target |
| watchOS app + complication | Done, **compiles** for the watch simulator; never run on a watch or a watchOS simulator (this Mac has no watchOS runtime) |
| Wear OS | **Not built.** Design and exact steps below |
| Signing, App Group on the watch ids, store listings | Owner follow-ups, below |

## The rules (same as the widget)

- **No maths on the watch.** The figure is the Expense Tracker's own
  `dailySafeSpend`, worked out by the phone (`buildWidgetPayload`) and printed
  as is. The watch makes only the amount the user types and an id.
- **Hide amounts.** While it is on, the phone's document has no amounts at all
  (`days` is empty), so the watch app shows the mask and has nothing to leak.
- **Complication = lock-screen rule.** A watch face is seen by anyone nearby,
  so the face shows the amount only when the user has turned on "Show the amount
  on the Lock Screen" (decided 24 Nov 2026 for widgets, applied here for the
  same reason). Inside the watch app the home-screen rule applies: a raised
  wrist and a tap is a deliberate look.
- **No new network calls, no secrets.** Everything moves over WatchConnectivity.
  The watch holds the widget document and a list of category names and keys.
- **No second ledger.** A watch expense is saved by `ingestWatchExpenses`
  (`src/tools/lib/watchInbox.ts`) through `saveExpenses` + `recordAudit`, the
  path `logSubscriptionPayment` and the voice actions (3.2) use. That path's
  signature is untouched.

## How it fits together

```
phone web layer ── publish(WatchContext) ──► FxWatch plugin ──► WatchBridge ── applicationContext ──► watch
                                                                                   (context + acked ids)
watch quick add ── PendingExpense (id made on the watch) ── transferUserInfo ──► WatchBridge inbox (UserDefaults)
phone web layer ◄─ drain() ── FxWatch plugin ◄── inbox          ingestWatchExpenses → ledger
phone web layer ── ack(ids) ──► WatchBridge ── next applicationContext carries acked ids ──► watch drops them
```

### Down: the context (`WatchContext`, v1)

`src/tools/lib/watchData.ts`:

```json
{
  "v": 1, "updatedAt": "2026-11-25T08:30:00.000Z", "symbol": "₹",
  "widget": { "...the WidgetPayload from WIDGETS.md, unchanged..." },
  "categories": [ { "k": "groceries", "l": "Groceries" } ]
}
```

`categories` are spending categories only (never savings or transfers), the
user's most-used first (`frequentCategoryKeys`, the list the Expenses page's
"Recent" shortcut uses), padded from the rest, at most six. Sent by
`applicationContext` with `acked` (ids the phone has saved). On the watch the
`widget` member is stored in the watch's App Group under `fx_widget`, the same
key the iPhone widget reads, so `WidgetPayload.swift` is compiled into both and
the complication uses the same `lockScreen(on:)` rule.

### Up: quick add, queued, no duplicates

1. The user enters an amount (keypad, or dictation shown on the keypad to
   correct) and taps a category.
2. The watch makes `PendingExpense { id: "tx_<uuid>", amount, category, date, at }`,
   stores it in its queue **on disk**, and calls `transferUserInfo`. The system
   delivers it whenever the phone can be reached, in order, even hours later, so
   there is no "phone unreachable" failure to handle.
3. The phone's `WatchBridge` (started in `AppDelegate`, because a watch can wake
   the app with no web layer) stores it in an inbox keyed by id.
4. The web layer (`useWatchSync`) drains the inbox on mount, on every return to
   the foreground and on the `watchExpenses` event, runs `ingestWatchExpenses`,
   and acks the ids.
5. The next context carries those ids as `acked`; the watch drops them from its
   queue. At each launch the watch sends anything still waiting again.

**Idempotent by id.** `ingestWatchExpenses` skips an id already in the ledger or
in `fx_watch_seen` (device-only, 500 newest, outlives a delete, so deleting a
watch entry on the phone never brings it back), and repeats inside one batch.
It validates every field: id shape, amount finite, above zero and under 1e9,
a real date no more than a day ahead and under two years back, a category. A
category that no longer exists is filed under the user's most-used category with
a note rather than lost; an invalid entry is acknowledged (it can never become
valid) and not saved. Open Expenses pages re-read the ledger because the write
is announced with the new `device` origin (`runDeviceApply` in `storage.ts`),
which, unlike `remote`, is still pushed to the cloud.

## Decisions (made under the owner's delegation; each can be reversed)

1. **Both watches, in order.** watchOS first and complete, Wear OS as a design
   and an exact list, because it needs a new Gradle module, the Play Services
   Wearable dependency and a Wear emulator, and this Mac runs one emulator at a
   time.
2. **No standalone watch app.** The watch app needs the phone: it has no network
   and holds no account. First run says "Open FinatriX on your iPhone once".
3. **Amounts typed on the watch are in the home currency, not travel-priced.**
   The Expenses page's quick add prices an entry in the trip's currency while a
   trip is on; the watch does not know the trip. Travel pricing for watch adds is
   a follow-up (it needs the trip's currency sent down and `spendMoney` applied
   in `ingestWatchExpenses`).
4. **"Two taps" is amount, then category.** A keypad is several taps for the
   digits; dictation is one. The category list is ordered by use so the common
   case is one tap.
5. **`transferUserInfo`, not `sendMessage`.** It is queued and survives the app
   closing, which is the requirement; a live path for instant delivery while both
   are awake can be added later without changing the contract.
6. **Complication shows the mask until the lock-screen switch is on** (above).
7. **No new settings screen.** The existing "Show the amount on the Lock Screen"
   switch also covers the watch face; its note says so.

## Verify

```sh
npx vitest run src/test/watchData.test.ts src/test/watchInbox.test.ts   # phone side
sh scripts/test-watch-logic.sh                                          # keypad, dictation, queue, ids (Swift, on the Mac)
cd ios/App && xcodebuild -project App.xcodeproj -target FinatriXWatch -sdk watchsimulator \
  -configuration Debug CODE_SIGNING_ALLOWED=NO build                    # watch app + complication compile
```

Build the watch with `-target`, not `-scheme FinatriXWatch`: a scheme build
resolves the Capacitor package for the watch SDK and fails on its xcframeworks.
The iPhone app (`-scheme App`) embeds the watch app and builds as before.

## Owner follow-ups (not done here; they change Apple or Google account state)

1. **Apple Developer: App IDs.** Register `co.finatrix.app.watchkitapp` and
   `co.finatrix.app.watchkitapp.widget`, and enable the App Groups capability on
   both with `group.co.finatrix.app` (the same group the widget and share
   extension use). Without it the complication cannot read what the watch app
   writes; the app itself still works and the face shows "Open".
2. **Signing.** The new targets use automatic signing with no team set, like the
   other extensions; set the team in Xcode once. `CURRENT_PROJECT_VERSION` and
   `MARKETING_VERSION` match the iPhone app and must be bumped together.
3. **App Store Connect.** The next iPhone build that includes the watch app needs
   Apple Watch screenshots (the listing asks for them once a watch app ships)
   and a mention in the review notes. Not touched here.
4. **Try it on a real watch** (or install a watchOS simulator runtime, a
   multi-GB download): pairing, the first context arriving, the complication
   being added to a face, a quick add reaching the phone, and the same entry
   delivered twice. Also with the phone off: add on the watch, turn the phone
   back on, open the app, see one entry.
5. **Wear OS** (below).

## Wear OS: design and exact remaining steps

Same contract, different transport. Nothing in `watchData.ts`, `watchInbox.ts`
or the hook changes; only the native layer is new.

| watchOS | Wear OS |
| --- | --- |
| `applicationContext` (latest value) | Data Layer `DataClient.putDataItem` at `/fx/context` (latest value, `setUrgent`) holding the same JSON, plus the `acked` list |
| `transferUserInfo` (queued, ordered) | `DataClient.putDataItem` at `/fx/expense/<id>` per entry, one item per id (a repeat overwrites itself), deleted by the phone once acked |
| App Group `fx_widget` | watch app `SharedPreferences` |
| Complication (`WidgetKit`) | **Tile** (`androidx.wear.tiles`) with the same text, plus a `ComplicationDataSourceService` (SHORT_TEXT, LONG_TEXT) following the lock-screen rule |
| `WatchBridge` | `WearListenerService` in the phone app that stores items in an inbox (`SharedPreferences`), as `WatchBridge` does |
| `FxWatchPlugin.swift` | `watch/WatchPlugin.java`, registered in `MainActivity` (`publish`, `drain`, `ack`, `watchExpenses` event) |

Steps:

1. **Module.** `android/wear/` (`com.android.application`, `minSdk 30`,
   applicationId `co.finatrix.app`, same as the phone app so the Data Layer
   pairs them; Play requires the same id). Add it to `android/settings.gradle`.
   Dependencies: `play-services-wearable`, `androidx.wear.compose:compose-material`,
   `androidx.wear.tiles`, `androidx.wear.watchface:watchface-complications-data-source-ktx`.
   Add `play-services-wearable` to the phone app too (the one new dependency).
2. **Phone side.** `watch/WatchPlugin.java` + a `WearableListenerService`
   (`onDataChanged` for `/fx/expense/*` → inbox; push `/fx/context` from
   `publish`). Reuse `src/native/watch.ts`: its three calls are platform-neutral
   (change `nativePlatform() !== 'ios'` in `useWatchSync.ts` to allow Android).
3. **Watch app.** One Compose-for-Wear activity: home (the figure by the
   `home(on:)` rule, ported as a few lines of Kotlin from `WidgetPayload.swift`:
   today's entry, else "Open the app"), Add (keypad, `RemoteInput` for voice,
   category list), queue in `SharedPreferences`. ID is `"tx_" + UUID`. Port the
   logic checks in `ios/App/FinatriXWatch/LogicTests/main.swift` as JUnit tests.
4. **Tile + complication** reading the stored document; refresh with
   `TileService.getUpdater().requestUpdate` and `ComplicationDataSourceUpdateRequester`.
5. **Release.** Play Console: the Wear OS form factor on the existing listing and
   a Wear screenshot set; the same signing key. Owner action.
6. **Test** on a Wear OS emulator paired with the phone emulator (two emulators:
   do it when nothing else is using one), covering: context arrives; add while
   unpaired then pair; the same item delivered twice.

## Not done, and why it is not a gap in v1

- Travel-mode pricing for watch adds (decision 3).
- Watch-side edit or undo of an entry already sent: edit it in the app.
- A live (`sendMessage`) fast path; the queued path is correct but can take a few
  seconds to minutes depending on the system.
- Rendering the watch screens: only compiled, not seen.
