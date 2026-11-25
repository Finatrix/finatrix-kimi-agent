import SwiftUI

/// Colours from src/styles/tokens.css, as on the iPhone widget.
enum Palette {
    static let gold = Color(red: 0xD4 / 255, green: 0xAF / 255, blue: 0x37 / 255)
    static let onGold = Color(red: 0x0A / 255, green: 0x0A / 255, blue: 0x0A / 255)
}

/// Today's safe-to-spend, one primary action (Add), and how many entries are waiting for the phone.
struct ContentView: View {
    @ObservedObject var session: WatchSession
    @State private var adding = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 8) {
                    Text("Safe to spend today")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Text(headline)
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                        .foregroundStyle(Palette.gold)
                        .accessibilityLabel(spoken)
                    if let sub = subline {
                        Text(sub).font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    }
                    Button { adding = true } label: {
                        Label("Add", systemImage: "plus").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Palette.gold)
                    .foregroundStyle(Palette.onGold)
                    .disabled(session.context?.categories.isEmpty ?? true)
                    if session.queue.count > 0 {
                        Text("\(session.queue.count) waiting to reach your iPhone")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(.horizontal, 4)
            }
            .navigationDestination(isPresented: $adding) { QuickAddView(session: session, isPresented: $adding) }
        }
    }

    /// Same rule as the home screen of the iPhone: the amount, unless Hide amounts is on.
    private var shown: Shown { session.widget?.home(on: Date()) ?? .openApp }

    private var headline: String {
        switch shown {
        case .amount(let t), .hidden(let t): return t
        case .noBudget: return "Set a budget"
        case .openApp: return session.context == nil ? "FinatriX" : "Open iPhone"
        }
    }

    private var spoken: String {
        switch shown {
        case .amount(let t): return "Safe to spend today, \(t)"
        case .hidden: return "Safe to spend today, hidden"
        case .noBudget: return "Set a budget on your iPhone"
        case .openApp: return "Open FinatriX on your iPhone"
        }
    }

    private var subline: String? {
        switch shown {
        case .amount, .hidden: return nil
        case .noBudget: return "Add a monthly budget in FinatriX on your iPhone."
        case .openApp:
            return session.context == nil
                ? "Open FinatriX on your iPhone once to connect."
                : "Open FinatriX on your iPhone to refresh."
        }
    }
}
