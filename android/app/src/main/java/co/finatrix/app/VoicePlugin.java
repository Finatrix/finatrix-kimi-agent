package co.finatrix.app;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.Locale;
import java.util.UUID;

/**
 * The Android half of FinatriX AI's voice conversation. The loop itself
 * (listen, ask, read aloud, listen again, stop on a pause or "stop") lives on
 * the web side in src/lib/voice/; Android's web view has no speech recognition
 * and no speech synthesis, so this class does both:
 *
 *  - listen  one utterance through the phone's SpeechRecognizer, in the
 *            language the user picked. It ends itself after a pause, which is
 *            what makes the conversation hands-free.
 *  - speak   the reply through the phone's TextToSpeech voice for that language.
 *
 * Every call resolves with an outcome word and never rejects, so a language a
 * phone lacks becomes "type instead", not an error. The iOS half, with the same
 * JS name and outcome words, is ios/App/App/FxVoicePlugin.swift.
 *
 * It never listens in the background: the page stops it when it is hidden, and
 * handleOnPause stops the microphone and the voice in case the page cannot run.
 */
@CapacitorPlugin(
    name = "FxVoice",
    permissions = { @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }) }
)
public class VoicePlugin extends Plugin {

    /** SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED and ERROR_LANGUAGE_UNAVAILABLE (API 31). */
    private static final int ERROR_LANGUAGE_NOT_SUPPORTED = 12;
    private static final int ERROR_LANGUAGE_UNAVAILABLE = 13;

    /** Nothing heard this long after listening starts: the pause that ends hands-free. */
    private static final long NO_SPEECH_MS = 8000;
    /** This long after the last word heard, the user has finished speaking. */
    private static final long END_OF_SPEECH_MS = 2500;
    /** No turn holds the microphone longer than this, whatever the recogniser does. */
    private static final long TURN_LIMIT_MS = 30000;

    private final Handler main = new Handler(Looper.getMainLooper());

    /*
     * The phone's recogniser has its own end-pointing, but it cannot be trusted
     * alone: on an emulator with no network, background noise counted as the
     * start of speech and the recogniser then held the microphone for five
     * minutes before failing. These timers end every turn on FinatriX's terms.
     */
    private final Runnable endTurn = () -> finishListening(this.transcript.isEmpty() ? "silence" : "heard");
    /** A separate runnable, so a new word resets `endTurn` without lifting the limit. */
    private final Runnable turnLimit = () -> finishListening(this.transcript.isEmpty() ? "silence" : "heard");

    private SpeechRecognizer recognizer;
    private PluginCall listenCall;
    private String transcript = "";

    private TextToSpeech tts;
    /** null while the engine starts, then whether it started. */
    private Boolean ttsReady;
    private final ArrayList<Runnable> afterTtsInit = new ArrayList<>();
    private PluginCall speakCall;
    private String utteranceId;

    // ── Listening ──

    @PluginMethod
    public void listen(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphoneAnswered");
            return;
        }
        main.post(() -> startListening(call));
    }

    @PermissionCallback
    private void microphoneAnswered(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            main.post(() -> startListening(call));
        } else {
            resolve(call, "denied", null);
        }
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        main.post(() -> {
            finishListening("aborted");
            call.resolve();
        });
    }

    private void startListening(PluginCall call) {
        finishListening("aborted");
        stopTts();
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            resolve(call, "unavailable", null);
            return;
        }
        String lang = call.getString("lang", "en-IN");
        listenCall = call;
        transcript = "";
        recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) {}
            @Override public void onBeginningOfSpeech() {}
            @Override public void onRmsChanged(float rmsdB) {}
            @Override public void onBufferReceived(byte[] buffer) {}
            @Override public void onEndOfSpeech() {}
            @Override public void onEvent(int eventType, Bundle params) {}

            @Override
            public void onPartialResults(Bundle partial) {
                String text = firstResult(partial);
                if (text.isEmpty() || listenCall == null) return;
                transcript = text;
                main.removeCallbacks(endTurn);
                main.postDelayed(endTurn, END_OF_SPEECH_MS);
                JSObject data = new JSObject();
                data.put("text", text);
                notifyListeners("partial", data);
            }

            @Override
            public void onResults(Bundle results) {
                String text = firstResult(results);
                if (!text.isEmpty()) transcript = text;
                finishListening(transcript.isEmpty() ? "silence" : "heard");
            }

            @Override
            public void onError(int error) {
                finishListening(outcomeFor(error));
            }
        });

        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, lang);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
        try {
            recognizer.startListening(intent);
        } catch (RuntimeException e) {
            finishListening("unavailable");
            return;
        }
        main.postDelayed(endTurn, NO_SPEECH_MS);
        main.postDelayed(turnLimit, TURN_LIMIT_MS);
    }

    private String outcomeFor(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_NO_MATCH:
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                return transcript.isEmpty() ? "silence" : "heard";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "denied";
            case ERROR_LANGUAGE_NOT_SUPPORTED:
            case ERROR_LANGUAGE_UNAVAILABLE:
                return "unsupported-language";
            default:
                // Network, server, busy, audio, client: nothing usable this turn.
                return transcript.isEmpty() ? "unavailable" : "heard";
        }
    }

    private static String firstResult(Bundle bundle) {
        if (bundle == null) return "";
        ArrayList<String> list = bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (list == null || list.isEmpty() || list.get(0) == null) return "";
        return list.get(0).trim();
    }

    /** Ends the current turn once, whatever ended it, and answers the page. Main thread only. */
    private void finishListening(String outcome) {
        main.removeCallbacks(endTurn);
        main.removeCallbacks(turnLimit);
        if (recognizer != null) {
            SpeechRecognizer r = recognizer;
            recognizer = null;
            try {
                r.cancel();
                r.destroy();
            } catch (RuntimeException ignored) {
                // Already gone.
            }
        }
        PluginCall call = listenCall;
        if (call == null) return;
        listenCall = null;
        resolve(call, outcome, "heard".equals(outcome) ? transcript : null);
    }

    // ── Speaking ──

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        String lang = call.getString("lang", "en-IN");
        main.post(() -> {
            stopTts();
            if (text == null || text.isEmpty()) {
                resolve(call, "done", null);
                return;
            }
            withTts(() -> say(call, text, lang));
        });
    }

    @PluginMethod
    public void stopSpeaking(PluginCall call) {
        main.post(() -> {
            stopTts();
            call.resolve();
        });
    }

    /** Runs `then` once the phone's speech engine has started, starting it on first use. */
    private void withTts(Runnable then) {
        if (ttsReady != null) {
            then.run();
            return;
        }
        afterTtsInit.add(then);
        if (tts != null) return;
        tts = new TextToSpeech(getContext(), status -> main.post(() -> {
            ttsReady = status == TextToSpeech.SUCCESS;
            if (ttsReady) tts.setOnUtteranceProgressListener(progress);
            ArrayList<Runnable> waiting = new ArrayList<>(afterTtsInit);
            afterTtsInit.clear();
            for (Runnable r : waiting) r.run();
        }));
    }

    private void say(PluginCall call, String text, String lang) {
        if (!Boolean.TRUE.equals(ttsReady)) {
            resolve(call, "unavailable", null);
            return;
        }
        Locale locale = Locale.forLanguageTag(lang);
        int available = tts.isLanguageAvailable(locale);
        if (available < TextToSpeech.LANG_AVAILABLE) {
            resolve(call, "unsupported-language", null);
            return;
        }
        tts.setLanguage(locale);
        String id = UUID.randomUUID().toString();
        speakCall = call;
        utteranceId = id;
        int max = TextToSpeech.getMaxSpeechInputLength();
        String said = text.length() > max ? text.substring(0, max) : text;
        if (tts.speak(said, TextToSpeech.QUEUE_FLUSH, null, id) != TextToSpeech.SUCCESS) {
            finishSpeaking(id, "unavailable");
        }
    }

    private final UtteranceProgressListener progress = new UtteranceProgressListener() {
        @Override public void onStart(String id) {}

        @Override
        public void onDone(String id) {
            main.post(() -> finishSpeaking(id, "done"));
        }

        @Override
        @SuppressWarnings("deprecation")
        public void onError(String id) {
            main.post(() -> finishSpeaking(id, "unavailable"));
        }

        @Override
        public void onStop(String id, boolean interrupted) {
            main.post(() -> finishSpeaking(id, "interrupted"));
        }
    };

    private void stopTts() {
        if (tts != null && Boolean.TRUE.equals(ttsReady)) tts.stop();
        finishSpeaking(utteranceId, "interrupted");
    }

    /** Answers the page for `id` only, so a stopped earlier reply never ends a later one. */
    private void finishSpeaking(String id, String outcome) {
        PluginCall call = speakCall;
        if (call == null || id == null || !id.equals(utteranceId)) return;
        speakCall = null;
        utteranceId = null;
        resolve(call, outcome, null);
    }

    // ── Lifecycle ──

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        main.post(() -> {
            finishListening("aborted");
            stopTts();
        });
    }

    @Override
    protected void handleOnDestroy() {
        finishListening("aborted");
        stopTts();
        if (tts != null) {
            tts.shutdown();
            tts = null;
            ttsReady = null;
        }
        super.handleOnDestroy();
    }

    private static void resolve(PluginCall call, String outcome, String text) {
        JSObject result = new JSObject();
        result.put("outcome", outcome);
        if (text != null) result.put("text", text);
        call.resolve(result);
    }
}
