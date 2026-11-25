import Foundation

/**
 The watch app's logic that has no UI, kept in Foundation-only types so it can
 be compiled and checked on the Mac without a watch (`scripts/test-watch-logic.sh`).

 There is no money maths here. The safe-to-spend figure is printed from the
 phone's document; the only numbers the watch makes are the amount the user
 typed and the id of the entry.
 */

/// What the phone sends about categories and the keypad (`WatchContext`, src/tools/lib/watchData.ts).
struct WatchCategory: Codable, Equatable, Identifiable {
    let k: String
    let l: String
    var id: String { k }
}

/// The phone's document. `widget` is decoded again by `WidgetPayload` from its own JSON.
struct WatchContext: Decodable {
    static let version = 1
    let v: Int
    let symbol: String
    let categories: [WatchCategory]

    static func parse(_ json: String) -> WatchContext? {
        guard let data = json.data(using: .utf8),
              let ctx = try? JSONDecoder().decode(WatchContext.self, from: data),
              ctx.v == version
        else { return nil }
        return ctx
    }

    /// The `widget` member re-serialised, so the widget document keeps one reader for the watch and the iPhone.
    static func widgetJSON(from json: String) -> String? {
        guard let data = json.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let widget = obj["widget"],
              let out = try? JSONSerialization.data(withJSONObject: widget),
              let text = String(data: out, encoding: .utf8)
        else { return nil }
        return text
    }
}

/// One expense made on the watch. The phone's `WatchExpense` (src/tools/lib/watchInbox.ts) is this shape.
struct PendingExpense: Codable, Equatable {
    let id: String
    let amount: Double
    let category: String
    /// Local calendar day on the watch, `YYYY-MM-DD`.
    let date: String
    /// When the user added it, ISO 8601.
    let at: String

    /// The id is made here, once, and never changes: it is what lets the phone ignore a repeat.
    static func make(amount: Double, category: String, now: Date = Date(), calendar: Calendar = .current) -> PendingExpense {
        PendingExpense(
            id: "tx_" + UUID().uuidString.lowercased(),
            amount: (amount * 100).rounded() / 100,
            category: category,
            date: dayKey(now, calendar: calendar),
            at: ISO8601DateFormatter().string(from: now)
        )
    }

    static func dayKey(_ date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    var json: String? {
        guard let data = try? JSONEncoder().encode(self) else { return nil }
        return String(data: data, encoding: .utf8)
    }
}

/// Entries waiting for the phone to say it has them. Newest last. A plain value so it is easy to check.
struct PendingQueue: Codable, Equatable {
    private(set) var items: [PendingExpense] = []
    /// A day of heavy use is a few dozen entries; this only stops a runaway.
    static let limit = 200

    var count: Int { items.count }

    /// Adds an entry unless that id is already waiting. False when the queue is full.
    @discardableResult
    mutating func add(_ e: PendingExpense) -> Bool {
        if items.contains(where: { $0.id == e.id }) { return true }
        guard items.count < Self.limit else { return false }
        items.append(e)
        return true
    }

    /// The phone listed these ids as taken in.
    mutating func remove(acknowledged ids: [String]) {
        guard !ids.isEmpty else { return }
        let gone = Set(ids)
        items.removeAll { gone.contains($0.id) }
    }
}

/// The keypad's state: digits, one dot, at most two decimals.
struct AmountEntry: Equatable {
    private(set) var text = ""
    static let maxIntegerDigits = 7

    mutating func press(_ ch: Character) {
        if ch == "." {
            guard !text.contains(".") else { return }
            text = text.isEmpty ? "0." : text + "."
            return
        }
        guard ch.isASCII, ch.isNumber else { return }
        if let dot = text.firstIndex(of: ".") {
            guard text.distance(from: dot, to: text.endIndex) <= 2 else { return }
            text.append(ch)
        } else {
            if text == "0" { text = String(ch); return }
            guard text.count < Self.maxIntegerDigits else { return }
            text.append(ch)
        }
    }

    mutating func backspace() { if !text.isEmpty { text.removeLast() } }
    mutating func set(_ value: Double) {
        text = String(format: value == value.rounded() ? "%.0f" : "%.2f", value)
    }

    /// Nil until there is an amount above zero.
    var value: Double? {
        guard let v = Double(text.hasSuffix(".") ? String(text.dropLast()) : text), v > 0 else { return nil }
        return v
    }

    var display: String { text.isEmpty ? "0" : text }
}

enum SpokenAmount {
    /// "150", "₹1,200.50", "rupees 75", "one hundred fifty": the first number in what was said, or nil.
    /// The result is shown on the keypad for the user to correct before anything is saved.
    static func parse(_ said: String) -> Double? {
        let cleaned = said.replacingOccurrences(of: ",", with: "")
        if let range = cleaned.range(of: #"\d+(\.\d{1,2})?"#, options: .regularExpression),
           let v = Double(cleaned[range]), v > 0, v < 10_000_000 {
            return v
        }
        let f = NumberFormatter()
        f.numberStyle = .spellOut
        f.locale = Locale(identifier: "en_US")
        if let n = f.number(from: said.lowercased().trimmingCharacters(in: .whitespaces)) {
            let v = n.doubleValue
            if v > 0, v < 10_000_000 { return v }
        }
        return nil
    }
}
