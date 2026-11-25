import AppIntents
import Capacitor
import UIKit

/**
 Siri, Spotlight and the Shortcuts app (step 3.9, NEW_FEATURES item 1 stage 3).

 "Hey Siri, talk to FinatriX" opens FinatriX AI and starts the same hands-free
 voice conversation as the mic button. "Hey Siri, add an expense in FinatriX"
 opens the add-expense form, as the widget's Add does.

 Each intent opens the app and hands it one fixed link through Capacitor's own
 open-URL path, so it reaches `src/native/bridge.ts` exactly like a tap on the
 widget: `co.finatrix.app://voice` or `co.finatrix.app://widget/add`. Nothing
 the person said to Siri is passed on. The conversation runs in the app, behind
 the AI consent, and every write still needs a tap on a confirm card.

 App Shortcuts need iOS 16; on 15.4 the app works as before without them.
 */
@available(iOS 16.0, *)
enum FxIntentLink {
    @MainActor
    static func open(_ link: String) {
        guard let url = URL(string: link) else { return }
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: [:])
    }
}

@available(iOS 16.0, *)
struct TalkToFinatrixIntent: AppIntent {
    static var title: LocalizedStringResource = "Talk to FinatriX AI"
    static var description = IntentDescription("Opens FinatriX AI and starts a voice conversation about your money.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        FxIntentLink.open("co.finatrix.app://voice")
        return .result()
    }
}

@available(iOS 16.0, *)
struct AddExpenseIntent: AppIntent {
    static var title: LocalizedStringResource = "Add an expense"
    static var description = IntentDescription("Opens the FinatriX Expense Tracker's add form.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        FxIntentLink.open("co.finatrix.app://widget/add")
        return .result()
    }
}

@available(iOS 16.0, *)
struct FinatrixShortcuts: AppShortcutsProvider {
    // Every phrase must contain the app's name (Apple's rule for App Shortcuts).
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: TalkToFinatrixIntent(),
            phrases: [
                "Talk to \(.applicationName)",
                "Ask \(.applicationName)",
                "Start \(.applicationName) voice",
            ]
        )
        AppShortcut(
            intent: AddExpenseIntent(),
            phrases: [
                "Add an expense in \(.applicationName)",
                "Log an expense in \(.applicationName)",
                "New \(.applicationName) expense",
            ]
        )
    }
}
