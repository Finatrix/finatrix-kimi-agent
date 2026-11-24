import ImageIO
import UIKit
import UniformTypeIdentifiers

/**
 "FinatriX" in the iOS share sheet.

 Takes the shared images (a GPay or bank-app screenshot, a photo of a bill),
 saves them as JPEGs in the App Group container the app can also read, and
 opens the app at `co.finatrix.app://share`. The app's `FxSharePlugin` picks
 them up there and the web page opens the screenshot import's review, so
 nothing is read here, nothing is uploaded, and nothing reaches the user's
 ledger until they press Import in the app.

 If iOS does not let the extension open the app, the images still wait in the
 container and the app takes them the next time it comes to the front; the
 sheet says so.
 */
final class ShareViewController: UIViewController {

    /// Must match `FxSharePlugin.appGroup` and both entitlements files.
    static let appGroup = "group.co.finatrix.app"
    static let inboxName = "ShareInbox"
    static let openURL = URL(string: "co.finatrix.app://share")!
    /// The page's import reads at most this many at once.
    static let maxFiles = 10
    /// Long side of a saved image. Plenty for text recognition, and decoding a
    /// full-size camera photo would exceed an extension's memory limit.
    static let maxPixels = 3000

    private let label = UILabel()
    private let spinner = UIActivityIndicatorView(style: .medium)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        label.text = "Sending to FinatriX…"
        label.font = .preferredFont(forTextStyle: .body)
        label.adjustsFontForContentSizeCategory = true
        label.numberOfLines = 0
        label.textAlignment = .center
        spinner.startAnimating()
        let stack = UIStackView(arrangedSubviews: [spinner, label])
        stack.axis = .vertical
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: view.layoutMarginsGuide.leadingAnchor),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: view.layoutMarginsGuide.trailingAnchor),
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        Task { await receive() }
    }

    @MainActor
    private func receive() async {
        guard let inbox = inboxFolder() else {
            finish(message: "FinatriX could not receive this. Please update the app and try again.", opened: false)
            return
        }
        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? [])
            .flatMap { $0.attachments ?? [] }
            .filter { $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) }
            .prefix(Self.maxFiles)

        // A new share replaces one the app never opened.
        let fm = FileManager.default
        for name in (try? fm.contentsOfDirectory(atPath: inbox.path)) ?? [] {
            try? fm.removeItem(at: inbox.appendingPathComponent(name))
        }

        let stamp = Int(Date().timeIntervalSince1970)
        var saved = 0
        for (index, provider) in providers.enumerated() {
            guard let jpeg = await loadJPEG(provider) else { continue }
            let suggested = provider.suggestedName ?? "Shared image \(index + 1)"
            let base = (suggested as NSString).deletingPathExtension.replacingOccurrences(of: "/", with: " ")
            let name = "\(stamp)-\(String(format: "%02d", index))-\(base).jpg"
            if (try? jpeg.write(to: inbox.appendingPathComponent(name), options: .atomic)) != nil {
                saved += 1
            }
        }

        guard saved > 0 else {
            finish(message: "There was no image FinatriX could read in what was shared.", opened: false)
            return
        }
        let opened = await openApp()
        finish(message: opened ? nil : "Saved. Open FinatriX to review it before anything is added.", opened: opened)
    }

    private func inboxFolder() -> URL? {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: Self.appGroup) else { return nil }
        let inbox = container.appendingPathComponent(Self.inboxName, isDirectory: true)
        try? FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
        return inbox
    }

    /// The image as a JPEG no larger than `maxPixels` on its long side, decoded
    /// by ImageIO straight to that size so a 48 MP photo never sits in memory whole.
    private func loadJPEG(_ provider: NSItemProvider) async -> Data? {
        await withCheckedContinuation { continuation in
            provider.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) { url, _ in
                guard let url,
                      let source = CGImageSourceCreateWithURL(url as CFURL, nil),
                      let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                          kCGImageSourceCreateThumbnailFromImageAlways: true,
                          kCGImageSourceCreateThumbnailWithTransform: true,
                          kCGImageSourceThumbnailMaxPixelSize: Self.maxPixels,
                      ] as CFDictionary)
                else {
                    continuation.resume(returning: nil)
                    return
                }
                continuation.resume(returning: UIImage(cgImage: image).jpegData(compressionQuality: 0.9))
            }
        }
    }

    /// Open the app through the responder chain: `UIApplication.shared` is not
    /// available to an extension, but the application object is in the chain.
    @MainActor
    private func openApp() async -> Bool {
        var responder: UIResponder? = self
        while let current = responder {
            if let application = current as? UIApplication {
                return await withCheckedContinuation { continuation in
                    application.open(Self.openURL, options: [:]) { continuation.resume(returning: $0) }
                }
            }
            responder = current.next
        }
        return false
    }

    @MainActor
    private func finish(message: String?, opened: Bool) {
        guard let message else {
            extensionContext?.completeRequest(returningItems: nil)
            return
        }
        spinner.stopAnimating()
        spinner.isHidden = true
        label.text = message
        let delay: TimeInterval = opened ? 0 : 2.5
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        }
    }
}
