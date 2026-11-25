import Foundation
import SwiftUI
import WatchConnectivity
import WidgetKit

/**
 The watch's link to the phone app (step 3.8, docs/WATCH.md).

 Down (phone to watch): `applicationContext` holds the latest `WatchContext`
 JSON and the ids the phone has taken in. It is stored here and, for the
 complication, the widget part is written to the watch's own App Group under
 the same key the iPhone widget reads (`fx_widget`), so one `WidgetPayload`
 reader serves both.

 Up (watch to phone): each quick add becomes a `PendingExpense` with an id made
 here, is saved in `queue` (on disk, so it survives the app closing) and handed
 to `transferUserInfo`, which the system delivers in order whenever the phone
 can be reached, even hours later. The entry stays in `queue` until the phone
 lists its id as taken in. At launch, anything still waiting is sent again: the
 phone ignores an id it already has, so a repeat is harmless.

 No network calls, no secrets: everything travels over WatchConnectivity.
 */
final class WatchSession: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchSession()

    @Published private(set) var context: WatchContext?
    @Published private(set) var widget: WidgetPayload?
    @Published private(set) var queue = PendingQueue()
    /// True once the phone has ever sent a context: until then the watch has nothing to show.
    @Published private(set) var reachable = false

    private let defaults = UserDefaults(suiteName: WidgetPayload.appGroup) ?? .standard
    private let contextKey = "fx_watch_context"
    private let queueKey = "fx_watch_queue"

    override init() {
        super.init()
        if let json = defaults.string(forKey: contextKey) { apply(contextJSON: json, reload: false) }
        if let data = defaults.data(forKey: queueKey),
           let saved = try? JSONDecoder().decode(PendingQueue.self, from: data) {
            queue = saved
        }
    }

    func start() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    // MARK: Quick add

    /// Saves the entry first, then sends it. Returns false only if the queue is full.
    @discardableResult
    func add(amount: Double, category: String) -> Bool {
        let entry = PendingExpense.make(amount: amount, category: category)
        guard queue.add(entry) else { return false }
        persistQueue()
        send(entry)
        return true
    }

    private func send(_ entry: PendingExpense) {
        guard WCSession.default.activationState == .activated, let json = entry.json else { return }
        WCSession.default.transferUserInfo(["expense": json])
    }

    private func resendWaiting() {
        queue.items.forEach(send)
    }

    private func persistQueue() {
        if let data = try? JSONEncoder().encode(queue) { defaults.set(data, forKey: queueKey) }
    }

    // MARK: From the phone

    private func apply(contextJSON json: String, reload: Bool) {
        guard let ctx = WatchContext.parse(json) else { return }
        defaults.set(json, forKey: contextKey)
        if let widgetJSON = WatchContext.widgetJSON(from: json) {
            defaults.set(widgetJSON, forKey: WidgetPayload.key)
        }
        context = ctx
        widget = WidgetPayload.load(from: defaults)
        if reload { WidgetCenter.shared.reloadAllTimelines() }
    }

    private func apply(received: [String: Any]) {
        if let json = received["context"] as? String { apply(contextJSON: json, reload: true) }
        if let acked = received["acked"] as? [String], !acked.isEmpty {
            queue.remove(acknowledged: acked)
            persistQueue()
        }
    }

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async {
            self.reachable = state == .activated
            // The last context the phone sent is kept by the system even while the app was closed.
            self.apply(received: session.receivedApplicationContext)
            self.resendWaiting()
        }
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        DispatchQueue.main.async { self.apply(received: applicationContext) }
    }
}
