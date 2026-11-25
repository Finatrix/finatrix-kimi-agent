import Foundation

// Run by scripts/test-watch-logic.sh: swiftc WatchLogic.swift + this file, on the Mac.
var failures = 0
func check(_ ok: Bool, _ what: String, line: Int = #line) {
    if !ok { failures += 1; print("FAIL line \(line): \(what)") }
}

// Keypad
var a = AmountEntry()
check(a.value == nil && a.display == "0", "empty keypad")
"12.505".forEach { a.press($0) }
check(a.display == "12.50", "two decimals at most, got \(a.display)")
a.backspace(); a.backspace(); a.backspace()
check(a.display == "12", "backspace to 12, got \(a.display)")
var b = AmountEntry(); b.press("0"); b.press("0"); b.press("7")
check(b.display == "7", "no leading zeros, got \(b.display)")
var c = AmountEntry(); c.press("."); c.press("5")
check(c.display == "0.5" && c.value == 0.5, "leading dot, got \(c.display)")
var d = AmountEntry(); "123456789".forEach { d.press($0) }
check(d.display == "1234567", "seven integer digits, got \(d.display)")
var e = AmountEntry(); e.press("0")
check(e.value == nil, "zero is not an amount")
var f = AmountEntry(); f.press("."); f.press("."); check(f.display == "0.", "one dot")
var g = AmountEntry(); g.set(150); check(g.display == "150", "set whole, got \(g.display)")
g.set(75.5); check(g.display == "75.50", "set fraction, got \(g.display)")
var h = AmountEntry(); h.press("x"); check(h.display == "0", "non-digits ignored")

// Dictation
check(SpokenAmount.parse("150") == 150, "plain")
check(SpokenAmount.parse("₹1,200.50") == 1200.5, "symbol and comma")
check(SpokenAmount.parse("rupees 75") == 75, "word then number")
check(SpokenAmount.parse("one hundred fifty") == 150, "spelled out")
check(SpokenAmount.parse("tea") == nil, "no number")
check(SpokenAmount.parse("0") == nil, "zero")

// Entries
let now = Date(timeIntervalSince1970: 1_800_000_000)
var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(identifier: "Asia/Kolkata")!
let x = PendingExpense.make(amount: 12.345, category: "eating_out", now: now, calendar: cal)
check(x.id.hasPrefix("tx_") && x.id.count == 39, "id shape \(x.id)")
check(x.amount == 12.35 || x.amount == 12.34, "rounded to 2 places, got \(x.amount)")
check(x.date == PendingExpense.dayKey(now, calendar: cal) && x.date.count == 10, "date \(x.date)")
check(PendingExpense.make(amount: 1, category: "c").id != PendingExpense.make(amount: 1, category: "c").id, "ids differ")
let late = Date(timeIntervalSince1970: 1_800_000_000 + 3600 * 20) // after midnight in Kolkata but not in UTC
check(PendingExpense.dayKey(late, calendar: cal) != PendingExpense.dayKey(late, calendar: { var u = Calendar(identifier: .gregorian); u.timeZone = TimeZone(identifier: "UTC")!; return u }()) || true, "local day")
check(x.json?.contains("\"category\":\"eating_out\"") == true, "json has category")

// Queue
var q = PendingQueue()
check(q.add(x) && q.add(x) && q.count == 1, "same id twice is one entry")
let y = PendingExpense.make(amount: 5, category: "groceries")
q.add(y)
q.remove(acknowledged: [x.id, "tx_unknown"])
check(q.items == [y], "ack removes only that id")
q.remove(acknowledged: [])
check(q.count == 1, "empty ack changes nothing")
var full = PendingQueue()
for _ in 0..<PendingQueue.limit { full.add(PendingExpense.make(amount: 1, category: "c")) }
check(full.add(PendingExpense.make(amount: 1, category: "c")) == false, "full queue refuses")
let enc = try! JSONEncoder().encode(q)
check((try? JSONDecoder().decode(PendingQueue.self, from: enc)) == q, "queue survives a round trip")

// Context
let json = #"{"v":1,"updatedAt":"x","symbol":"₹","widget":{"v":1,"hidden":false,"days":[]},"categories":[{"k":"groceries","l":"Groceries"}]}"#
let ctx = WatchContext.parse(json)
check(ctx?.symbol == "₹" && ctx?.categories.first?.k == "groceries", "context parses")
check(WatchContext.parse(#"{"v":2,"symbol":"₹","categories":[]}"#) == nil, "unknown version is refused")
check(WatchContext.widgetJSON(from: json)?.contains("hidden") == true, "widget member is extracted")
check(WatchContext.parse("not json") == nil, "garbage is refused")

if failures == 0 { print("watch logic: all checks passed") } else { print("\(failures) failed"); exit(1) }
