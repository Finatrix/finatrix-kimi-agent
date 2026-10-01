import Capacitor
import UIKit
import WebKit

/**
 Paints the window behind the web view in the web app's current theme.

 The iOS half of the Android plugin at
 `android/app/src/main/java/co/finatrix/app/SystemUiPlugin.java`, with the same
 JS name and the same single method, so `src/native/bridge.ts` calls one API on
 both platforms and needs no branch.

 Why it is needed here. Capacitor makes the web view the view controller's whole
 view, so it already extends under the status bar and the home indicator and the
 page pads itself from `env(safe-area-inset-*)`. What is left is the web view's
 own backdrop, which Capacitor sets once at launch from `ios.backgroundColor` (or
 `UIColor.systemBackground`). That colour shows through in two places:

  - for the instant a new document is loading, which the app does for real on an
    OAuth return (`reloadAt` in bridge.ts) — a white flash mid sign-in;
  - under a rubber-band scroll at the very top or bottom of a long page.

 A static colour cannot be right for both themes, and the system appearance is
 the wrong thing to follow: FinatriX's theme is the user's in-app choice, which
 may deliberately disagree with the OS. So the page, which is the only thing that
 knows, tells native. `SystemBars.setStyle` resets nothing on iOS, but bridge.ts
 calls this after it on both platforms for the same reason it must on Android.
 */
@objc(FxSystemUiPlugin)
public class FxSystemUiPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FxSystemUiPlugin"
    public let jsName = "FxSystemUi"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setBackgroundColor", returnType: CAPPluginReturnPromise)
    ]

    @objc public func setBackgroundColor(_ call: CAPPluginCall) {
        let value = call.getString("color") ?? ""
        guard let color = UIColor.fromHex(value) else {
            call.reject("Invalid colour: \(value)")
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let webView = self?.bridge?.webView else {
                // The view went away between the call and this block. Nothing to
                // paint, and nothing wrong — resolve rather than leaving the
                // page's promise pending forever.
                call.resolve()
                return
            }
            webView.backgroundColor = color
            webView.scrollView.backgroundColor = color
            webView.superview?.backgroundColor = color
            call.resolve()
        }
    }
}

private extension UIColor {
    /// `#RRGGBB` or `#RRGGBBAA` (and the same without the `#`), matching the
    /// values `surfaceColor()` in bridge.ts sends. Anything else is nil rather
    /// than a guess, so a typo in a token surfaces as a rejected call.
    static func fromHex(_ raw: String) -> UIColor? {
        var hex = raw.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        if hex.hasPrefix("#") { hex.removeFirst() }
        guard hex.count == 6 || hex.count == 8, hex.allSatisfy({ $0.isHexDigit }) else { return nil }
        guard let value = UInt32(hex, radix: 16) else { return nil }
        let hasAlpha = hex.count == 8
        let r = CGFloat((value >> (hasAlpha ? 24 : 16)) & 0xFF) / 255
        let g = CGFloat((value >> (hasAlpha ? 16 : 8)) & 0xFF) / 255
        let b = CGFloat((value >> (hasAlpha ? 8 : 0)) & 0xFF) / 255
        let a = hasAlpha ? CGFloat(value & 0xFF) / 255 : 1
        return UIColor(red: r, green: g, blue: b, alpha: a)
    }
}
