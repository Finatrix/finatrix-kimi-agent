import SwiftUI
import WatchKit

/// Amount, then category. The amount comes from the keypad or by dictation, and is always shown before saving.
struct QuickAddView: View {
    @ObservedObject var session: WatchSession
    @Binding var isPresented: Bool
    @State private var entry = AmountEntry()
    @State private var choosing = false
    @State private var said = ""
    @State private var failed = false

    private let rows: [[Character]] = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], [".", "0", "<"]]

    var body: some View {
        VStack(spacing: 4) {
            HStack {
                Text(session.context?.symbol ?? "").foregroundStyle(.secondary)
                Text(entry.display)
                    .font(.system(size: 28, weight: .semibold, design: .rounded))
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Amount \(entry.display)")
            ForEach(rows, id: \.self) { row in
                HStack(spacing: 4) {
                    ForEach(row, id: \.self) { key in
                        Button { press(key) } label: {
                            Text(key == "<" ? "⌫" : String(key)).frame(maxWidth: .infinity, minHeight: 28)
                        }
                        .accessibilityLabel(key == "<" ? "Delete" : key == "." ? "Point" : String(key))
                    }
                }
            }
            HStack(spacing: 4) {
                TextField("Say it", text: $said)
                    .onSubmit { dictated() }
                    .accessibilityLabel("Dictate the amount")
                Button { choosing = true } label: { Image(systemName: "checkmark") }
                    .tint(Palette.gold)
                    .disabled(entry.value == nil)
                    .accessibilityLabel("Choose a category")
            }
        }
        .navigationTitle("Add")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: $choosing) {
            CategoryList(session: session, amount: entry.value ?? 0, finished: { isPresented = false })
        }
        .alert("Couldn’t hear an amount", isPresented: $failed) { Button("OK", role: .cancel) {} }
    }

    private func press(_ key: Character) {
        if key == "<" { entry.backspace() } else { entry.press(key) }
        WKInterfaceDevice.current().play(.click)
    }

    private func dictated() {
        defer { said = "" }
        if let v = SpokenAmount.parse(said) { entry.set(v) } else { failed = true }
    }
}

/// The user's own most-used spending categories first (the phone orders them). One tap saves.
struct CategoryList: View {
    @ObservedObject var session: WatchSession
    let amount: Double
    let finished: () -> Void
    @State private var full = false

    var body: some View {
        List(session.context?.categories ?? []) { cat in
            Button {
                if session.add(amount: amount, category: cat.k) {
                    WKInterfaceDevice.current().play(.success)
                    finished()
                } else {
                    full = true
                }
            } label: { Text(cat.l) }
        }
        .navigationTitle(amountText)
        .alert("Too many waiting", isPresented: $full) {
            Button("OK", role: .cancel) {}
        } message: { Text("Open FinatriX on your iPhone so these can be sent.") }
    }

    private var amountText: String {
        let sym = session.context?.symbol ?? ""
        return sym + (amount == amount.rounded() ? String(format: "%.0f", amount) : String(format: "%.2f", amount))
    }
}
