import Capacitor
import UIKit

/** Shares a private, temporary export through the system's Save to Files sheet. */
@objc(FileExportPlugin)
public class FileExportPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FileExportPlugin"
    public let jsName = "FxFileExport"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveFile", returnType: CAPPluginReturnPromise)
    ]
    private var exportPending = false

    @objc public func saveFile(_ call: CAPPluginCall) {
        guard let encoded = call.getString("data"),
              let filename = call.getString("filename"),
              !filename.isEmpty, filename != ".", filename != "..",
              !filename.contains("/"), !filename.contains("\\") else {
            call.reject("Invalid export file.")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self, let presenter = self.bridge?.viewController else {
                call.reject("The export screen is unavailable. Please try again.")
                return
            }
            guard !self.exportPending, presenter.presentedViewController == nil else {
                call.reject("Finish the current sheet before starting another export.")
                return
            }
            self.exportPending = true
            let directory = FileManager.default.temporaryDirectory
                .appendingPathComponent("finatrix-export-\(UUID().uuidString)", isDirectory: true)
            let file = directory.appendingPathComponent(filename, isDirectory: false)
            DispatchQueue.global(qos: .userInitiated).async {
                do {
                    guard let data = Data(base64Encoded: encoded) else {
                        throw CocoaError(.fileReadCorruptFile)
                    }
                    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                    try data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
                } catch {
                    try? FileManager.default.removeItem(at: directory)
                    DispatchQueue.main.async {
                        self.exportPending = false
                        call.reject("Could not prepare the file. Please try again.")
                    }
                    return
                }

                DispatchQueue.main.async {
                    guard presenter.viewIfLoaded?.window != nil, presenter.presentedViewController == nil else {
                        try? FileManager.default.removeItem(at: directory)
                        self.exportPending = false
                        call.reject("The export screen is unavailable. Please try again.")
                        return
                    }
                    let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                    sheet.completionWithItemsHandler = { _, completed, _, error in
                        try? FileManager.default.removeItem(at: directory)
                        self.exportPending = false
                        if error != nil {
                            call.reject("Could not save or share the file. Please try again.")
                        } else {
                            call.resolve(["saved": completed])
                        }
                    }
                    // Keeps the sheet valid on regular-width presentations too.
                    sheet.popoverPresentationController?.sourceView = presenter.view
                    sheet.popoverPresentationController?.sourceRect = CGRect(
                        x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
                    presenter.present(sheet, animated: true)
                }
            }
        }
    }
}
