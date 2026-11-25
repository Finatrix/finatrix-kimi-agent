import SwiftUI

@main
struct FinatriXWatchApp: App {
    @StateObject private var session = WatchSession.shared

    var body: some Scene {
        WindowGroup {
            ContentView(session: session)
                .onAppear { session.start() }
        }
    }
}
