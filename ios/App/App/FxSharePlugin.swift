import Capacitor
import Foundation

/**
 The app's half of "Share to FinatriX" on iOS.

 The Share Extension (`ios/App/ShareExtension/ShareViewController.swift`) runs
 in its own process and cannot reach the web view, so it leaves the shared
 images in the App Group container both targets can see, then opens
 `co.finatrix.app://share`. This plugin moves them from there into the app's
 own temporary folder and hands their paths to the page
 (`src/native/shareIntake.ts`), which reads them, puts them in the share inbox
 and opens the import review. Nothing is uploaded and nothing is saved until
 the user reviews it.

 The Android half, with the same JS name and methods, is
 `android/app/src/main/java/co/finatrix/app/SharePlugin.java`.
 */
@objc(FxSharePlugin)
public class FxSharePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FxSharePlugin"
    public let jsName = "FxShare"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "takePending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise)
    ]

    /// Must match `ShareViewController.appGroup` and both entitlements files.
    static let appGroup = "group.co.finatrix.app"
    /// The folder the extension writes into, inside the App Group container.
    static let inboxName = "ShareInbox"
    /// Most files handed over at once; the page's import reads no more.
    static let maxFiles = 10

    private var handoverDir: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("fx-share", isDirectory: true)
    }

    @objc func takePending(_ call: CAPPluginCall) {
        let fm = FileManager.default
        guard let container = fm.containerURL(forSecurityApplicationGroupIdentifier: Self.appGroup) else {
            // No App Group: an unsigned build, or the capability is missing.
            call.resolve(["files": []])
            return
        }
        let inbox = container.appendingPathComponent(Self.inboxName, isDirectory: true)
        let names = ((try? fm.contentsOfDirectory(atPath: inbox.path)) ?? [])
            .filter { !$0.hasPrefix(".") }
            .sorted()
        if names.isEmpty {
            call.resolve(["files": []])
            return
        }
        try? fm.createDirectory(at: handoverDir, withIntermediateDirectories: true)

        var files: [[String: String]] = []
        for name in names {
            let source = inbox.appendingPathComponent(name)
            guard files.count < Self.maxFiles else {
                try? fm.removeItem(at: source)
                continue
            }
            let ext = source.pathExtension.lowercased()
            let target = handoverDir.appendingPathComponent("\(UUID().uuidString).\(ext.isEmpty ? "jpg" : ext)")
            do {
                try fm.moveItem(at: source, to: target)
                files.append(["path": target.path, "name": displayName(name), "type": mimeType(ext)])
            } catch {
                try? fm.removeItem(at: source)
            }
        }
        call.resolve(["files": files])
    }

    @objc func finish(_ call: CAPPluginCall) {
        let fm = FileManager.default
        let root = handoverDir.standardizedFileURL.path + "/"
        for path in call.getArray("paths", String.self) ?? [] {
            let url = URL(fileURLWithPath: path).standardizedFileURL
            // Only the copies this plugin made.
            guard url.path.hasPrefix(root) else { continue }
            try? fm.removeItem(at: url)
        }
        call.resolve()
    }

    /// The extension names files `<time>-<index>-<original name>`; the page shows the original.
    private func displayName(_ stored: String) -> String {
        let parts = stored.split(separator: "-", maxSplits: 2, omittingEmptySubsequences: false)
        return parts.count == 3 && !parts[2].isEmpty ? String(parts[2]) : stored
    }

    private func mimeType(_ ext: String) -> String {
        switch ext {
        case "png": return "image/png"
        case "webp": return "image/webp"
        case "heic", "heif": return "image/heic"
        default: return "image/jpeg"
        }
    }
}
