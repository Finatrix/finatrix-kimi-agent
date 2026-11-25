# Widgets — the shared-data bridge

Step 3.4 (home-screen widget). Read this before building anything else that
shows the app's figures outside the app, such as the watch app (step 3.8).

## The rule

Native code does no money maths. The app works out every figure with its own
TypeScript and writes one JSON document; widgets only print it. That keeps a
widget from ever disagreeing with the screen it opens, and keeps one copy of
each formula.

## Who writes, who reads

| Piece | File |
| --- | --- |
| Builds the document | `src/tools/lib/widgetData.ts` (`buildWidgetPayload`, tested in `src/test/widgetData.test.ts`) |
| Re-publishes on change | `src/tools/lib/useWidgetSync.ts`, mounted in `ToolsLayout` |
| Hands it to native | `src/native/widget.ts` → `FxWidget.publish({ payload })` |
| iOS store + reload | `ios/App/App/FxWidgetPlugin.swift` |
| iOS widget | `ios/App/FinatriXWidget/` (`WidgetPayload.swift` reads, `FinatriXWidget.swift` draws) |
| Android store + redraw | `android/.../widget/WidgetPlugin.java` |
| Android widget | `android/.../widget/WidgetData.java` reads, `SafeSpendWidget.java` draws |

## Where it lives

- **iOS:** App Group `group.co.finatrix.app`, `UserDefaults(suiteName:)`, key
  `fx_widget`. Every target that reads it needs the App Group entitlement.
- **Android:** SharedPreferences file `fx_widget`, key `payload`, private to the
  app. It is excluded from cloud backup, like the WebView storage it comes from.

## The document (`v: 1`)

```json
{
  "v": 1,
  "updatedAt": "2026-11-25T08:30:00.000Z",
  "currency": "INR",
  "hidden": false,
  "lockScreenAmounts": false,
  "mask": "₹ ••••",
  "noBudget": false,
  "days": [
    { "date": "2026-11-25", "amount": 1666.67, "text": "₹1,667" },
    { "date": "2026-11-26", "amount": 2000, "text": "₹2,000" }
  ]
}
```

- `days` is the Expense Tracker's daily safe-to-spend (`computeDashboard`'s
  `dailySafeSpend`) for today and up to six more days of this month, each worked
  out for that day on the records as they are now: the number the app would show
  that day if nothing else were logged. `text` is formatted by the app; print it
  as is.
- Show the entry whose `date` is the device's local today. No entry means the
  month ended or the app has not been opened for a week: ask to open the app.
- `hidden` is Hide amounts. When true, `days` is empty and every surface shows
  `mask`.
- `lockScreenAmounts` is the user's choice in Settings → Widget. Until it is
  true, any surface a passer-by can see (the iPhone Lock Screen; a watch face
  should follow the same rule) shows `mask`.
- `noBudget` means there is nothing to pace this month; ask for a budget.
- A reader that sees a `v` it does not know shows its "open the app" state.
  Bump `v` only for a change an older reader would misread; adding a field is
  not one.

## Links back into the app

`co.finatrix.app://widget/add` opens the add-expense form and
`co.finatrix.app://widget/open` the Expenses page (`src/native/bridge.ts`).
Nothing else in the URL is read.
