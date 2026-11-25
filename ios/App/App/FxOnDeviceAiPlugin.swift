import Capacitor
import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/**
 The AI built into the iPhone: Apple's on-device foundation model (iOS 26+,
 Apple Intelligence on). The web side is `src/lib/ai/onDevice.ts`, which tries
 this only after the user has allowed FinatriX AI, and sends the request to the
 cloud AI whenever this says no.

 Two calls, the same on Android (`OnDeviceAiPlugin.java`):
 - `status()` → `{ state: "available" | "preparing" | "unsupported", engine: "apple", contextTokens }`
 - `generate({ system, user, maxTokens })` → `{ content }`, or a rejection for
   anything else (guardrails, an unsupported language, context overflow, busy).
   A rejection is not an error the user sees: the cloud answers instead.

 Nothing here leaves the phone. The model writes text; the app checks it, and
 the app does every calculation.

 FoundationModels does not exist before iOS 26 and the app supports 15.4, so
 the framework is weak-linked: an older iPhone loads the app and reports
 "unsupported".
 */
@objc(FxOnDeviceAiPlugin)
public class FxOnDeviceAiPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FxOnDeviceAiPlugin"
    public let jsName = "FxOnDeviceAi"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "generate", returnType: CAPPluginReturnPromise)
    ]

    private static let unsupported: [String: Any] = ["state": "unsupported", "engine": "apple", "contextTokens": 0]

    @objc func status(_ call: CAPPluginCall) {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            call.resolve(Self.appleStatus())
            return
        }
        #endif
        call.resolve(Self.unsupported)
    }

    @objc func generate(_ call: CAPPluginCall) {
        let system = call.getString("system") ?? ""
        let user = call.getString("user") ?? ""
        let maxTokens = max(1, call.getInt("maxTokens") ?? 512)
        guard !user.isEmpty else {
            call.reject("Nothing to answer", "empty")
            return
        }
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            Self.appleGenerate(system: system, user: user, maxTokens: maxTokens, call: call)
            return
        }
        #endif
        call.reject("This iPhone has no on-device model", "unsupported")
    }

    #if canImport(FoundationModels)
    @available(iOS 26.0, *)
    private static func appleStatus() -> [String: Any] {
        let model = SystemLanguageModel.default
        switch model.availability {
        case .available:
            return ["state": "available", "engine": "apple", "contextTokens": model.contextSize]
        case .unavailable(.appleIntelligenceNotEnabled), .unavailable(.modelNotReady):
            // Supported, but switched off or still downloading: the cloud
            // answers until it is ready.
            return ["state": "preparing", "engine": "apple", "contextTokens": 0]
        default:
            // .deviceNotEligible, and any reason a later iOS adds.
            return unsupported
        }
    }

    @available(iOS 26.0, *)
    private static func appleGenerate(system: String, user: String, maxTokens: Int, call: CAPPluginCall) {
        guard case .available = SystemLanguageModel.default.availability else {
            call.reject("The on-device model is not ready", "unavailable")
            return
        }
        Task {
            do {
                // A fresh session per request: no transcript carries over, so
                // one question's data never leaks into the next answer. The
                // conversation the model needs is already in `user`.
                let session = LanguageModelSession(instructions: system)
                // Low temperature: every task here wants one well-formed JSON
                // object, not variety.
                let options = GenerationOptions(temperature: 0.2, maximumResponseTokens: maxTokens)
                let response = try await session.respond(to: user, options: options)
                call.resolve(["content": response.content])
            } catch {
                // Guardrails, refusal, an unsupported language, context
                // overflow, rate limit: all mean "ask the cloud".
                CAPLog.print("FxOnDeviceAi: generation failed (\(String(describing: type(of: error))))")
                call.reject("On-device generation failed", "failed")
            }
        }
    }
    #endif
}
