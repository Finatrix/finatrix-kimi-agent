import SwiftUI
import WidgetKit

/**
 The FinatriX complication (step 3.8): today's safe-to-spend on the watch face.

 It prints what the phone wrote (`WidgetPayload`, shared with the iPhone
 widget), and follows the lock-screen rule rather than the home-screen one: a
 watch face is seen by anyone nearby, so the amount shows only once the user has
 turned on "Show the amount on the Lock Screen" in the app, and never while
 Hide amounts is on. Until then it shows the mask.
 */

struct WatchEntry: TimelineEntry {
    let date: Date
    let shown: Shown
}

struct WatchProvider: TimelineProvider {
    func placeholder(in context: Context) -> WatchEntry { WatchEntry(date: Date(), shown: .hidden("₹ ••••")) }

    func getSnapshot(in context: Context, completion: @escaping (WatchEntry) -> Void) {
        completion(entry(at: Date(), payload: WidgetPayload.load()))
    }

    /// One entry now and one at each local midnight the phone wrote a figure for, as the iPhone widget does.
    func getTimeline(in context: Context, completion: @escaping (Timeline<WatchEntry>) -> Void) {
        let payload = WidgetPayload.load()
        let now = Date()
        var entries = [entry(at: now, payload: payload)]
        let calendar = Calendar.current
        let start = calendar.startOfDay(for: now)
        for i in 1...max(1, payload?.days.count ?? 1) {
            guard let midnight = calendar.date(byAdding: .day, value: i, to: start) else { break }
            entries.append(entry(at: midnight, payload: payload))
        }
        completion(Timeline(entries: entries, policy: .never))
    }

    private func entry(at date: Date, payload: WidgetPayload?) -> WatchEntry {
        WatchEntry(date: date, shown: payload?.lockScreen(on: date) ?? .openApp)
    }
}

private extension Shown {
    var headline: String {
        switch self {
        case .amount(let t), .hidden(let t): return t
        case .noBudget: return "Budget"
        case .openApp: return "Open"
        }
    }

    var spoken: String {
        switch self {
        case .amount(let t): return "Safe to spend today, \(t)"
        case .hidden: return "Safe to spend today, hidden"
        case .noBudget: return "Set a budget in FinatriX"
        case .openApp: return "Open FinatriX"
        }
    }
}

struct WatchComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: WatchEntry

    var body: some View {
        switch family {
        case .accessoryCircular:
            VStack(spacing: 0) {
                Image(systemName: "indianrupeesign.circle").font(.caption2)
                Text(entry.shown.headline).font(.caption2.bold()).minimumScaleFactor(0.4).lineLimit(1)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(entry.shown.spoken)
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 0) {
                Text("Safe to spend today").font(.caption2).foregroundStyle(.secondary)
                Text(entry.shown.headline).font(.title3.bold()).minimumScaleFactor(0.5).lineLimit(1)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(entry.shown.spoken)
        case .accessoryCorner:
            Text(entry.shown.headline)
                .widgetLabel("Safe to spend")
                .accessibilityLabel(entry.shown.spoken)
        default: // .accessoryInline
            Text("Safe today \(entry.shown.headline)").accessibilityLabel(entry.shown.spoken)
        }
    }
}

@main
struct FinatriXWatchWidget: Widget {
    let kind = "FinatriXWatchSafeSpend"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WatchProvider()) { entry in
            WatchComplicationView(entry: entry).containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Safe to spend")
        .description("Today's safe-to-spend figure from FinatriX.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryCorner, .accessoryInline])
    }
}
