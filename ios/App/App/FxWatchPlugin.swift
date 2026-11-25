import Capacitor
import Foundation

/**
 `FxWatch` (src/native/watch.ts): the web layer's door to `WatchBridge`.

   publish({ payload })  the app's WatchContext JSON, for the watch
   drain()               expenses from the watch not yet acknowledged
   ack({ ids })          these are saved: forget them and tell the watch

 The context is worked out by the app (src/tools/lib/watchData.ts) and expenses
 are saved by it (src/tools/lib/watchInbox.ts); nothing here reads or changes one.
 */
@objc(FxWatchPlugin)
public class FxWatchPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FxWatchPlugin"
    public let jsName = "FxWatch"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "publish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "drain", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ack", returnType: CAPPluginReturnPromise),
    ]

    public override func load() {
        NotificationCenter.default.addObserver(
            self, selector: #selector(inboxChanged), name: WatchBridge.inboxChanged, object: nil
        )
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    @objc private func inboxChanged() { notifyListeners("watchExpenses", data: [:]) }

    @objc func publish(_ call: CAPPluginCall) {
        guard let payload = call.getString("payload") else {
            call.reject("payload is required")
            return
        }
        WatchBridge.shared.publish(payload)
        call.resolve()
    }

    @objc func drain(_ call: CAPPluginCall) {
        call.resolve(["items": WatchBridge.shared.inbox()])
    }

    @objc func ack(_ call: CAPPluginCall) {
        guard let ids = call.getArray("ids", String.self) else {
            call.reject("ids is required")
            return
        }
        WatchBridge.shared.acknowledge(ids)
        call.resolve()
    }
}
