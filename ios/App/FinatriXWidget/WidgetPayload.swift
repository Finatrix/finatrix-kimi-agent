import Foundation

/**
 The document the app writes for the widgets (src/tools/lib/widgetData.ts,
 docs/WIDGETS.md), and the one rule for reading it: show today's entry, or say
 why there is none. No maths happens here — every figure was worked out by the
 app with the Expense Tracker's own formula.
 */
struct WidgetPayload: Decodable {
    struct Day: Decodable {
        /// Local calendar day, `YYYY-MM-DD`.
        let date: String
        let amount: Double
        /// Formatted by the app exactly as it prints it ("₹1,240").
        let text: String
    }

    /// The version this reader understands. A newer document reads as "open the app".
    static let version = 1
    static let appGroup = "group.co.finatrix.app"
    static let key = "fx_widget"

    let v: Int
    let hidden: Bool
    let lockScreenAmounts: Bool
    let mask: String
    let noBudget: Bool
    let days: [Day]

    static func load() -> WidgetPayload? {
        guard let json = UserDefaults(suiteName: appGroup)?.string(forKey: key),
              let data = json.data(using: .utf8),
              let payload = try? JSONDecoder().decode(WidgetPayload.self, from: data),
              payload.v == version
        else { return nil }
        return payload
    }
}

/// What a widget shows at one moment.
enum Shown: Equatable {
    case amount(String)
    case hidden(String)
    case noBudget
    case openApp
}

extension WidgetPayload {
    static func dayKey(_ date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// Home screen: the amount, unless Hide amounts is on.
    func home(on date: Date) -> Shown {
        if noBudget { return .noBudget }
        if hidden { return .hidden(mask) }
        let key = Self.dayKey(date)
        guard let day = days.first(where: { $0.date == key }) else { return .openApp }
        return .amount(day.text)
    }

    /// Lock screen: as the home screen, but hidden until the user turns it on
    /// in the app (decided 24 Nov 2026).
    func lockScreen(on date: Date) -> Shown {
        let shown = home(on: date)
        if case .amount = shown, !lockScreenAmounts { return .hidden(mask) }
        return shown
    }
}
