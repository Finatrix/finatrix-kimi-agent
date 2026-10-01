import Capacitor
import UIKit
import WebKit

/**
 The app's single view controller: Capacitor's, with two additions.

 Kept as a subclass rather than configured from `SceneDelegate` because both
 additions need the web view at the moment Capacitor creates it, and
 `capacitorDidLoad()` is the documented place for that.
 */
class ViewController: CAPBridgeViewController {

    /// App-local plugins must be registered before the bridge finishes starting,
    /// which is exactly when this runs. Mirrors `registerPlugin(SystemUiPlugin.class)`
    /// in MainActivity.java on Android.
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(FxSystemUiPlugin())
        bridge?.registerPluginInstance(FileExportPlugin())
    }

    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        let webView = super.webView(with: frame, configuration: configuration)

        // The edge-swipe back gesture. Not polish: without it this app has no
        // back affordance at all on a nested screen.
        //
        // The shared stylesheet hides the breadcrumb and the Back pill inside the
        // app (`html.fx-native [data-web-only]`) because on Android the hardware
        // BACK button replaces them — and on iOS there is no hardware button, so
        // leaving this off would strand someone on a Learn article or a careers
        // detail page with only the tab bar to escape through.
        //
        // Safe for this app specifically because React Router drives the History
        // API: every in-app navigation is a real WKWebView history entry, so the
        // gesture walks screens exactly as the Android BACK button does. The two
        // places the app replaces the document instead (an OAuth return, an email
        // link) use `location.replace`, which overwrites the current entry rather
        // than adding one — so the gesture can never swipe back into a URL that
        // still carries auth material.
        webView.allowsBackForwardNavigationGestures = true

        return webView
    }
}
