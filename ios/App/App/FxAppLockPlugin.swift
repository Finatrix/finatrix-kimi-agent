import Capacitor
import LocalAuthentication
import UIKit

/**
 The iOS half of the optional app lock. The policy (when to lock, when to ask)
 lives on the web side in `src/native/appLock/`; this file does the three
 things only native code can:

  - `availability`  whether the device has a passcode to check against;
  - `authenticate`  the system prompt: Face ID or Touch ID first, the device
                    passcode as the fallback;
  - `setCover`      keep the app's content out of the app switcher.

 The Android half, with the same JS name and the same three methods, is
 `android/app/src/main/java/co/finatrix/app/AppLockPlugin.java`.

 Why `.deviceOwnerAuthentication` and not the biometrics-only policy. The lock
 has to work for someone who wears a mask, has wet hands, or never enrolled a
 face: this policy tries biometrics and then offers the passcode, and it is
 available exactly when a passcode is set. If the user declines Face ID for
 FinatriX, the passcode still unlocks the app.

 Why the cover is native. iOS photographs the app for the switcher as it goes
 to the background. The page also covers itself, but nothing guarantees the web
 view paints before that photograph is taken, so the cover goes up here, in the
 same turn of the run loop as the notification that the app is losing the
 foreground.

 The lock is a privacy gate on an unlocked phone. It does not encrypt anything.
 */
@objc(FxAppLockPlugin)
public class FxAppLockPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FxAppLockPlugin"
    public let jsName = "FxAppLock"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "availability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setCover", returnType: CAPPluginReturnPromise)
    ]

    private var coverEnabled = false
    private var cover: UIView?
    private var observers: [NSObjectProtocol] = []

    override public func load() {
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.showCover()
        })
        observers.append(center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.hideCover()
        })
    }

    deinit {
        for observer in observers {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    // MARK: - Calls from the page

    @objc public func availability(_ call: CAPPluginCall) {
        var error: NSError?
        let available = LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: &error)
        call.resolve(["available": available, "biometry": Self.biometry()])
    }

    @objc public func authenticate(_ call: CAPPluginCall) {
        // An empty reason makes `evaluatePolicy` raise an exception.
        let given = call.getString("reason") ?? ""
        let reason = given.isEmpty ? "Unlock FinatriX" : given
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            call.resolve(["result": Self.outcome(of: error)])
            return
        }
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { success, failure in
            // Keeps the context alive until iOS has answered.
            withExtendedLifetime(context) {
                call.resolve(["result": success ? "ok" : Self.outcome(of: failure)])
            }
        }
    }

    @objc public func setCover(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        DispatchQueue.main.async { [weak self] in
            self?.coverEnabled = enabled
            if !enabled { self?.hideCover() }
            call.resolve()
        }
    }

    // MARK: - Helpers

    /// What the device can check besides the passcode, for the page's wording.
    private static func biometry() -> String {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            return "none"
        }
        switch context.biometryType {
        case .faceID: return "face"
        case .touchID: return "touch"
        default: return "biometric"
        }
    }

    /// `unavailable` only when there is no passcode: that is the one case the
    /// page answers by switching the lock off, so nothing else may claim it.
    private static func outcome(of error: Error?) -> String {
        switch (error as? LAError)?.code {
        case .userCancel, .systemCancel, .appCancel: return "cancelled"
        case .passcodeNotSet: return "unavailable"
        default: return "failed"
        }
    }

    /// The launch screen, over everything in the window, so the switcher shows
    /// the same thing a cold start does.
    private func showCover() {
        guard coverEnabled, cover == nil, let window = bridge?.viewController?.view.window else { return }
        let launch = UIStoryboard(name: "LaunchScreen", bundle: nil).instantiateInitialViewController()?.view
        let view = launch ?? UIView()
        if launch == nil {
            view.backgroundColor = bridge?.webView?.backgroundColor ?? .systemBackground
        }
        view.frame = window.bounds
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        window.addSubview(view)
        cover = view
    }

    private func hideCover() {
        cover?.removeFromSuperview()
        cover = nil
    }
}
