import Capacitor
import Foundation
import WidgetKit

/**
 `FxWidget` (src/native/widget.ts): stores the app's widget document where the
 widget extension (`ios/App/FinatriXWidget`) can read it, and asks WidgetKit to
 redraw. The Android twin is `widget/WidgetPlugin.java`.

 The document is worked out by the app (src/tools/lib/widgetData.ts); nothing
 here reads or changes it. Storage contract, shared with the watch app (step
 3.8): App Group `group.co.finatrix.app`, `UserDefaults` key `fx_widget`, a JSON
 string. See docs/WIDGETS.md.
 */
@objc(FxWidgetPlugin)
public class FxWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FxWidgetPlugin"
    public let jsName = "FxWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "publish", returnType: CAPPluginReturnPromise)
    ]

    /// Must match `FinatriXWidget/WidgetPayload.swift` and both entitlements files.
    static let appGroup = "group.co.finatrix.app"
    static let key = "fx_widget"

    @objc func publish(_ call: CAPPluginCall) {
        guard let payload = call.getString("payload") else {
            call.reject("payload is required")
            return
        }
        guard let defaults = UserDefaults(suiteName: Self.appGroup) else {
            // No App Group: an unsigned build, or the capability is missing.
            call.resolve()
            return
        }
        defaults.set(payload, forKey: Self.key)
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }
}
