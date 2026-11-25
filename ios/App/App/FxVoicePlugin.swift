import AVFoundation
import Capacitor
import Speech
import UIKit

/**
 The iOS half of FinatriX AI's voice conversation. The loop itself (listen,
 ask, read aloud, listen again, stop on a pause or "stop") lives on the web side
 in `src/lib/voice/`; this file does the two things only native code can do in
 the app's web view:

  - `listen`  one utterance through `SFSpeechRecognizer`, in the language the
              user picked. On the device when the phone has that language's
              model, otherwise Apple's speech service. Ends itself after a
              pause, which is what makes the conversation hands-free.
  - `speak`   the reply through `AVSpeechSynthesizer`, in the phone's voice for
              that language.

 Every call resolves with an outcome word and never rejects, so a language a
 phone lacks becomes "type instead", not an error. The Android half, with the
 same JS name and outcome words, is
 `android/app/src/main/java/co/finatrix/app/VoicePlugin.java`.

 It never listens in the background: the page stops it when it is hidden, and
 this plugin stops both the microphone and the voice as the app leaves the
 foreground, in case the page cannot run.
 */
@objc(FxVoicePlugin)
public class FxVoicePlugin: CAPPlugin, CAPBridgedPlugin, AVSpeechSynthesizerDelegate {
    public let identifier = "FxVoicePlugin"
    public let jsName = "FxVoice"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "listen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopListening", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speak", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopSpeaking", returnType: CAPPluginReturnPromise)
    ]

    /// Nothing said this long after listening starts: the pause that ends hands-free.
    private let noSpeechTimeout: TimeInterval = 7
    /// This long after the last word, the user has finished speaking.
    private let endOfSpeechPause: TimeInterval = 1.5

    private let audioEngine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var listenCall: CAPPluginCall?
    private var transcript = ""
    private var timer: Timer?
    private var tapInstalled = false

    private let synthesizer = AVSpeechSynthesizer()
    private var speakCall: CAPPluginCall?
    /// The utterance `speakCall` waits for; a cancelled earlier one must not answer it.
    private var utterance: AVSpeechUtterance?
    private var observers: [NSObjectProtocol] = []

    override public func load() {
        synthesizer.delegate = self
        observers.append(NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
        ) { [weak self] _ in
            self?.finishListening("aborted")
            self?.synthesizer.stopSpeaking(at: .immediate)
        })
    }

    deinit {
        for observer in observers {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    // MARK: Listening

    @objc func listen(_ call: CAPPluginCall) {
        let lang = call.getString("lang") ?? "en-IN"
        DispatchQueue.main.async {
            self.finishListening("aborted")
            self.synthesizer.stopSpeaking(at: .immediate)
            self.authorize { granted in
                guard granted else {
                    call.resolve(["outcome": "denied"])
                    return
                }
                self.startListening(call, lang: lang)
            }
        }
    }

    @objc func stopListening(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.finishListening("aborted")
            call.resolve()
        }
    }

    /// Speech recognition, then the microphone: two prompts, the first time only.
    private func authorize(_ done: @escaping (Bool) -> Void) {
        let askMicrophone = {
            let session = AVAudioSession.sharedInstance()
            switch session.recordPermission {
            case .granted:
                done(true)
            case .denied:
                done(false)
            default:
                session.requestRecordPermission { granted in
                    DispatchQueue.main.async { done(granted) }
                }
            }
        }
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized:
            askMicrophone()
        case .notDetermined:
            SFSpeechRecognizer.requestAuthorization { status in
                DispatchQueue.main.async {
                    if status == .authorized { askMicrophone() } else { done(false) }
                }
            }
        default:
            done(false)
        }
    }

    private func startListening(_ call: CAPPluginCall, lang: String) {
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: lang)) else {
            call.resolve(["outcome": "unsupported-language"])
            return
        }
        // Deliberately not gated on `isAvailable`: it reports false for the
        // first recogniser after launch and for about a second after each turn
        // ends (seen every time on iOS 26.5), which would end a hands-free
        // conversation for nothing. If recognition really cannot run, the task
        // fails at once and `finishListening` reports "unavailable".
        beginListening(call, recognizer: recognizer)
    }

    private func beginListening(_ call: CAPPluginCall, recognizer: SFSpeechRecognizer) {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .duckOthers])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            CAPLog.print("FxVoice: listen unavailable (audio session)")
            call.resolve(["outcome": "unavailable"])
            return
        }

        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        // No microphone (a Simulator without one, say) reports a zero format.
        guard format.sampleRate > 0, format.channelCount > 0 else {
            deactivateSession()
            CAPLog.print("FxVoice: listen unavailable (no microphone input)")
            call.resolve(["outcome": "unavailable"])
            return
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.taskHint = .dictation
        // Kept on the phone when the phone can, so the words never leave it.
        if recognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
        }
        if #available(iOS 16, *) {
            request.addsPunctuation = true
        }

        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            request.append(buffer)
        }
        tapInstalled = true
        audioEngine.prepare()
        do {
            try audioEngine.start()
        } catch {
            removeTap()
            deactivateSession()
            CAPLog.print("FxVoice: listen unavailable (audio engine did not start)")
            call.resolve(["outcome": "unavailable"])
            return
        }

        self.request = request
        listenCall = call
        transcript = ""
        restartTimer(noSpeechTimeout)

        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            DispatchQueue.main.async {
                guard let self = self, self.listenCall != nil else { return }
                if let result = result {
                    let text = result.bestTranscription.formattedString
                    if !text.isEmpty {
                        self.transcript = text
                        self.notifyListeners("partial", data: ["text": text])
                        self.restartTimer(self.endOfSpeechPause)
                    }
                    if result.isFinal {
                        self.finishListening(self.transcript.isEmpty ? "silence" : "heard")
                    }
                } else if error != nil {
                    // "No speech detected" and its relatives end the turn as a
                    // pause; anything else, with nothing heard, is unavailable.
                    let code = (error as NSError?)?.code ?? 0
                    let silent = [203, 216, 1110].contains(code)
                    if !silent { CAPLog.print("FxVoice: recognition error \((error as NSError?)?.domain ?? "") \(code)") }
                    self.finishListening(!self.transcript.isEmpty ? "heard" : (silent ? "silence" : "unavailable"))
                }
            }
        }
    }

    private func restartTimer(_ seconds: TimeInterval) {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
            guard let self = self else { return }
            self.finishListening(self.transcript.isEmpty ? "silence" : "heard")
        }
    }

    private func removeTap() {
        if tapInstalled {
            audioEngine.inputNode.removeTap(onBus: 0)
            tapInstalled = false
        }
    }

    private func deactivateSession() {
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// Ends the current turn once, whatever ended it, and answers the page.
    private func finishListening(_ outcome: String) {
        timer?.invalidate()
        timer = nil
        guard let call = listenCall else { return }
        listenCall = nil
        if audioEngine.isRunning { audioEngine.stop() }
        removeTap()
        request?.endAudio()
        task?.cancel()
        task = nil
        request = nil
        deactivateSession()
        call.resolve(outcome == "heard" ? ["outcome": "heard", "text": transcript] : ["outcome": outcome])
    }

    // MARK: Speaking

    @objc func speak(_ call: CAPPluginCall) {
        let text = call.getString("text") ?? ""
        let lang = call.getString("lang") ?? "en-IN"
        DispatchQueue.main.async {
            self.synthesizer.stopSpeaking(at: .immediate)
            self.finishSpeaking("interrupted")
            guard !text.isEmpty else {
                call.resolve(["outcome": "done"])
                return
            }
            guard let voice = Self.voice(for: lang) else {
                call.resolve(["outcome": "unsupported-language"])
                return
            }
            do {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
                try session.setActive(true)
            } catch {
                call.resolve(["outcome": "unavailable"])
                return
            }
            let utterance = AVSpeechUtterance(string: text)
            utterance.voice = voice
            self.speakCall = call
            self.utterance = utterance
            self.synthesizer.speak(utterance)
        }
    }

    @objc func stopSpeaking(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.synthesizer.stopSpeaking(at: .immediate)
            self.finishSpeaking("interrupted")
            call.resolve()
        }
    }

    /// The phone's voice for a language: this region first, then the same language anywhere.
    private static func voice(for lang: String) -> AVSpeechSynthesisVoice? {
        if let exact = AVSpeechSynthesisVoice(language: lang) {
            return exact
        }
        let base = String(lang.prefix(2))
        return AVSpeechSynthesisVoice.speechVoices().first { $0.language.hasPrefix(base + "-") }
    }

    private func finishSpeaking(_ outcome: String) {
        guard let call = speakCall else { return }
        speakCall = nil
        utterance = nil
        deactivateSession()
        call.resolve(["outcome": outcome])
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            if self.utterance === utterance { self.finishSpeaking("done") }
        }
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            if self.utterance === utterance { self.finishSpeaking("interrupted") }
        }
    }
}
