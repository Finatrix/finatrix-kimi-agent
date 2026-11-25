import Foundation
import WatchConnectivity

/**
 The phone's end of the watch link (step 3.8, docs/WATCH.md).

 A watch can wake the app in the background to deliver an expense, when the web
 layer is not running, so this is a singleton started at launch (`AppDelegate`)
 rather than state inside the Capacitor plugin. It does three things and no
 maths:

  1. Keeps expenses from the watch in an inbox (`UserDefaults`, by id) until the
     web layer has saved them through the app's own path and acknowledged them.
  2. Remembers the ids it was told were saved (`acked`, newest first, bounded) and
     sends them to the watch with the latest context, so the watch can drop them.
  3. Sends the context JSON the app worked out (`WatchContext`) to the watch.

 It never reads or edits an amount.
 */
final class WatchBridge: NSObject, WCSessionDelegate {
    static let shared = WatchBridge()
    /// Posted (main queue) when the inbox gains an entry. `FxWatchPlugin` forwards it to the web layer.
    static let inboxChanged = Notification.Name("FxWatchInboxChanged")

    private let defaults = UserDefaults.standard
    private let inboxKey = "fx_watch_inbox"      // [String: String]  id -> expense JSON
    private let ackedKey = "fx_watch_acked"      // [String]          newest first
    private let contextKey = "fx_watch_context"  // String            last context JSON
    private let ackedLimit = 200
    private let lock = NSLock()

    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    // MARK: Plugin calls

    func publish(_ contextJSON: String) {
        lock.lock(); defaults.set(contextJSON, forKey: contextKey); lock.unlock()
        push()
    }

    func inbox() -> [String] {
        lock.lock(); defer { lock.unlock() }
        let all = defaults.dictionary(forKey: inboxKey) as? [String: String] ?? [:]
        return all.keys.sorted().compactMap { all[$0] }
    }

    func acknowledge(_ ids: [String]) {
        lock.lock()
        var all = defaults.dictionary(forKey: inboxKey) as? [String: String] ?? [:]
        ids.forEach { all.removeValue(forKey: $0) }
        defaults.set(all, forKey: inboxKey)
        var acked = defaults.stringArray(forKey: ackedKey) ?? []
        acked.insert(contentsOf: ids.filter { !acked.contains($0) }, at: 0)
        defaults.set(Array(acked.prefix(ackedLimit)), forKey: ackedKey)
        lock.unlock()
        push()
    }

    /// Latest context plus the acknowledged ids. `updatedAt` in the context changes with every write, and
    /// `sent` makes two pushes of the same context differ, so the system always delivers the new ids.
    private func push() {
        let session = WCSession.default
        guard session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else { return }
        lock.lock()
        var message: [String: Any] = ["acked": defaults.stringArray(forKey: ackedKey) ?? [], "sent": Date().timeIntervalSince1970]
        if let json = defaults.string(forKey: contextKey) { message["context"] = json }
        lock.unlock()
        try? session.updateApplicationContext(message)
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        if state == .activated { push() }
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        // A new watch was paired: start the session again for it.
        session.activate()
    }

    func sessionWatchStateDidChange(_ session: WCSession) { push() }

    /// One expense from the watch. Stored by id, so the same entry sent twice is one entry.
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        guard let json = userInfo["expense"] as? String,
              let data = json.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let id = obj["id"] as? String, !id.isEmpty, id.count <= 80
        else { return }
        lock.lock()
        var all = defaults.dictionary(forKey: inboxKey) as? [String: String] ?? [:]
        // Bounded, so a misbehaving sender cannot fill the phone: the web layer drains it every foreground.
        if all.count < 500 { all[id] = json }
        defaults.set(all, forKey: inboxKey)
        lock.unlock()
        DispatchQueue.main.async { NotificationCenter.default.post(name: Self.inboxChanged, object: nil) }
    }
}
