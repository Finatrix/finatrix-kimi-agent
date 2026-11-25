import SwiftUI
import WidgetKit

/**
 The FinatriX widget: today's safe-to-spend figure with an Add button, in small
 and medium on the Home Screen and as a Lock Screen widget (iOS 16+).

 Everything shown comes from `WidgetPayload`, which the app writes. Links use
 the app's own scheme, `co.finatrix.app://widget/add` and `/open`, which
 src/native/bridge.ts turns into the add-expense form and the Expenses page.
 */

private enum Links {
    static let add = URL(string: "co.finatrix.app://widget/add")!
    static let open = URL(string: "co.finatrix.app://widget/open")!
}

/// Colours from src/styles/tokens.css, so the widget looks like the app.
private enum Palette {
    static let surface = Color(UIColor { $0.userInterfaceStyle == .dark
        ? UIColor(red: 0x12 / 255, green: 0x12 / 255, blue: 0x14 / 255, alpha: 1)   // --surface-2, dark
        : .white })                                                                   // --surface-2, light
    static let ink = Color(UIColor { $0.userInterfaceStyle == .dark
        ? UIColor(red: 0xF5 / 255, green: 0xF5 / 255, blue: 0xF0 / 255, alpha: 1)
        : UIColor(red: 0x17 / 255, green: 0x15 / 255, blue: 0x0F / 255, alpha: 1) })
    static let ink2 = Color(UIColor { $0.userInterfaceStyle == .dark
        ? UIColor(red: 0x9C / 255, green: 0x9C / 255, blue: 0x96 / 255, alpha: 1)
        : UIColor(red: 0x57 / 255, green: 0x53 / 255, blue: 0x4A / 255, alpha: 1) })
    static let gold = Color(red: 0xD4 / 255, green: 0xAF / 255, blue: 0x37 / 255)
    static let onGold = Color(red: 0x0A / 255, green: 0x0A / 255, blue: 0x0A / 255)
}

struct SafeSpendEntry: TimelineEntry {
    let date: Date
    let home: Shown
    let lock: Shown
}

struct SafeSpendProvider: TimelineProvider {
    func placeholder(in context: Context) -> SafeSpendEntry {
        SafeSpendEntry(date: Date(), home: .amount("₹1,240"), lock: .hidden("₹ ••••"))
    }

    func getSnapshot(in context: Context, completion: @escaping (SafeSpendEntry) -> Void) {
        completion(entry(at: Date(), payload: WidgetPayload.load()))
    }

    /// One entry now, then one at each local midnight the app wrote a figure
    /// for, and a last one asking to be opened. The app reloads the timeline
    /// whenever it writes, so `.never` is enough.
    func getTimeline(in context: Context, completion: @escaping (Timeline<SafeSpendEntry>) -> Void) {
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

    private func entry(at date: Date, payload: WidgetPayload?) -> SafeSpendEntry {
        guard let payload else { return SafeSpendEntry(date: date, home: .openApp, lock: .openApp) }
        return SafeSpendEntry(date: date, home: payload.home(on: date), lock: payload.lockScreen(on: date))
    }
}

// MARK: - Shared pieces

private let title = "Safe to spend today"

private extension Shown {
    /// The big line: the amount or mask, or a short prompt.
    var headline: String {
        switch self {
        case .amount(let text), .hidden(let text): return text
        case .noBudget: return "Set a budget"
        case .openApp: return "Open FinatriX"
        }
    }

    var isPrompt: Bool {
        switch self {
        case .noBudget, .openApp: return true
        default: return false
        }
    }

    var accessibilityValue: String {
        switch self {
        case .amount(let text): return text
        case .hidden: return "Amount hidden"
        case .noBudget: return "Set a monthly budget to see this"
        case .openApp: return "Open FinatriX to update"
        }
    }
}

private struct AddPill: View {
    var body: some View {
        Label("Add", systemImage: "plus")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Palette.onGold)
            .frame(maxWidth: .infinity, minHeight: 36)
            .background(Capsule().fill(Palette.gold))
            .accessibilityLabel("Add an expense")
    }
}

private struct Figure: View {
    let shown: Shown
    let size: CGFloat

    var body: some View {
        Text(shown.headline)
            .font(.system(size: shown.isPrompt ? size * 0.6 : size, weight: .bold, design: .rounded))
            .foregroundStyle(Palette.ink)
            .lineLimit(1)
            .minimumScaleFactor(0.5)
            .accessibilityLabel(title)
            .accessibilityValue(shown.accessibilityValue)
    }
}

// MARK: - Home Screen

private struct SmallView: View {
    let entry: SafeSpendEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption)
                .foregroundStyle(Palette.ink2)
                .accessibilityHidden(true)
            Spacer(minLength: 0)
            Figure(shown: entry.home, size: 28)
            Spacer(minLength: 0)
            AddPill()
        }
        // A small widget is one tap target, so it goes to the primary action.
        .widgetURL(Links.add)
    }
}

private struct MediumView: View {
    let entry: SafeSpendEntry

    var body: some View {
        HStack(spacing: 16) {
            Link(destination: Links.open) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.subheadline)
                        .foregroundStyle(Palette.ink2)
                        .accessibilityHidden(true)
                    Figure(shown: entry.home, size: 36)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            Link(destination: Links.add) {
                AddPill().frame(width: 104)
            }
        }
    }
}

// MARK: - Lock Screen

@available(iOSApplicationExtension 16.0, *)
private struct RectangularView: View {
    let entry: SafeSpendEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title).font(.caption).widgetAccentable()
            Text(entry.lock.headline)
                .font(.system(.title2, design: .rounded).weight(.bold))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .accessibilityValue(entry.lock.accessibilityValue)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(Links.add)
    }
}

@available(iOSApplicationExtension 16.0, *)
private struct InlineView: View {
    let entry: SafeSpendEntry

    var body: some View {
        Text("Safe today: \(entry.lock.headline)")
            .accessibilityLabel(title)
            .accessibilityValue(entry.lock.accessibilityValue)
            .widgetURL(Links.add)
    }
}

// MARK: - Widget

struct SafeSpendWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SafeSpendEntry

    var body: some View {
        switch family {
        case .systemMedium:
            MediumView(entry: entry).fxBackground(Palette.surface)
        case .systemSmall:
            SmallView(entry: entry).fxBackground(Palette.surface)
        default:
            if #available(iOSApplicationExtension 16.0, *) {
                lockScreen.fxBackground(.clear, padded: false)
            }
        }
    }

    @available(iOSApplicationExtension 16.0, *)
    @ViewBuilder private var lockScreen: some View {
        if family == .accessoryInline {
            InlineView(entry: entry)
        } else {
            RectangularView(entry: entry)
        }
    }
}

private extension View {
    /// `containerBackground` on iOS 17+, where the system sizes the margins;
    /// a padded fill before it.
    @ViewBuilder func fxBackground(_ color: Color, padded: Bool = true) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            containerBackground(color, for: .widget)
        } else if padded {
            padding().frame(maxWidth: .infinity, maxHeight: .infinity).background(color)
        } else {
            self
        }
    }
}

struct SafeSpendWidget: Widget {
    let kind = "co.finatrix.app.safe-spend"

    private var families: [WidgetFamily] {
        if #available(iOSApplicationExtension 16.0, *) {
            return [.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline]
        }
        return [.systemSmall, .systemMedium]
    }

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SafeSpendProvider()) { entry in
            SafeSpendWidgetView(entry: entry)
        }
        .configurationDisplayName("Safe to spend")
        .description("Today's safe-to-spend figure, with a quick Add.")
        .supportedFamilies(families)
    }
}

@main
struct FinatriXWidgetBundle: WidgetBundle {
    var body: some Widget {
        SafeSpendWidget()
    }
}
