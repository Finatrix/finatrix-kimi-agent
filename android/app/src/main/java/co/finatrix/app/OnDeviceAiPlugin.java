package co.finatrix.app;

import android.os.Build;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.genai.common.DownloadCallback;
import com.google.mlkit.genai.common.FeatureStatus;
import com.google.mlkit.genai.common.GenAiException;
import com.google.mlkit.genai.prompt.Candidate;
import com.google.mlkit.genai.prompt.GenerateContentRequest;
import com.google.mlkit.genai.prompt.GenerateContentResponse;
import com.google.mlkit.genai.prompt.Generation;
import com.google.mlkit.genai.prompt.SystemInstruction;
import com.google.mlkit.genai.prompt.TextPart;
import com.google.mlkit.genai.prompt.java.GenerativeModelFutures;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * The AI built into the phone: Gemini Nano through ML Kit's GenAI Prompt API,
 * on the Android phones that have it (AICore). The web side is
 * src/lib/ai/onDevice.ts, which tries this only after the user has allowed
 * FinatriX AI, and sends the request to the cloud AI whenever this says no.
 *
 * Two calls, the same on iPhone (FxOnDeviceAiPlugin.swift):
 *  - status({ prepare }) → { state: "available" | "preparing" | "unsupported", engine: "gemini-nano", contextTokens }
 *  - generate({ system, user, maxTokens }) → { content }, or a rejection for
 *    anything else (busy, quota, too long, not supported). A rejection is not
 *    an error the user sees: the cloud answers instead.
 *
 * Nothing here leaves the phone. The model writes text; the app checks it, and
 * the app does every calculation.
 *
 * The API needs Android 8 (API 26); the app supports 7 (API 24), so every
 * entry point checks the version first, and the manifest's overrideLibrary
 * lets the build accept the library's higher minimum.
 */
@CapacitorPlugin(name = "FxOnDeviceAi")
public class OnDeviceAiPlugin extends Plugin {

    private static final String TAG = "FxOnDeviceAi";
    private static final String ENGINE = "gemini-nano";
    /** Longer than the web side's 30 s, so the web side decides when to give up. */
    private static final long GENERATE_TIMEOUT_S = 60;
    private static final long STATUS_TIMEOUT_S = 10;

    /** One worker: the ML Kit futures are waited on here, never on the main thread. */
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean downloadStarted = new AtomicBoolean(false);
    private GenerativeModelFutures model;

    private GenerativeModelFutures model() {
        if (model == null) model = GenerativeModelFutures.from(Generation.INSTANCE.getClient());
        return model;
    }

    private static JSObject status(String state, int contextTokens) {
        JSObject out = new JSObject();
        out.put("state", state);
        out.put("engine", ENGINE);
        out.put("contextTokens", contextTokens);
        return out;
    }

    @PluginMethod
    public void status(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve(status("unsupported", 0));
            return;
        }
        // Only a request that is about to use the model asks for the download,
        // never a screen that merely describes it.
        final boolean prepare = Boolean.TRUE.equals(call.getBoolean("prepare", false));
        worker.execute(() -> {
            try {
                int feature = model().checkStatus().get(STATUS_TIMEOUT_S, TimeUnit.SECONDS);
                switch (feature) {
                    case FeatureStatus.AVAILABLE:
                        int limit = model().getTokenLimit().get(STATUS_TIMEOUT_S, TimeUnit.SECONDS);
                        call.resolve(status("available", Math.max(0, limit)));
                        return;
                    case FeatureStatus.DOWNLOADABLE:
                        if (prepare) startDownload();
                        call.resolve(status("preparing", 0));
                        return;
                    case FeatureStatus.DOWNLOADING:
                        call.resolve(status("preparing", 0));
                        return;
                    default:
                        call.resolve(status("unsupported", 0));
                }
            } catch (Exception e) {
                // No AICore, an old Play services, a timeout: all read as "no model".
                Log.i(TAG, "status unavailable: " + e.getClass().getSimpleName());
                call.resolve(status("unsupported", 0));
            }
        });
    }

    /** AICore downloads the model in the background; the cloud answers meanwhile. */
    private void startDownload() {
        if (!downloadStarted.compareAndSet(false, true)) return;
        model().download(new DownloadCallback() {
            @Override
            public void onDownloadFailed(GenAiException e) {
                Log.i(TAG, "download failed: " + e.getErrorCode());
                downloadStarted.set(false);
            }
        });
    }

    @PluginMethod
    public void generate(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.reject("This phone has no on-device model", "unsupported");
            return;
        }
        final String system = call.getString("system", "");
        final String user = call.getString("user", "");
        final int maxTokens = Math.max(1, call.getInt("maxTokens", 512));
        if (user == null || user.isEmpty()) {
            call.reject("Nothing to answer", "empty");
            return;
        }
        worker.execute(() -> {
            try {
                GenerateContentRequest.Builder builder;
                boolean systemSlot = system != null && !system.isEmpty()
                    && Boolean.TRUE.equals(model().isSystemPromptAvailable().get(STATUS_TIMEOUT_S, TimeUnit.SECONDS));
                if (systemSlot) {
                    builder = new GenerateContentRequest.Builder(new SystemInstruction(system), new TextPart(user));
                } else if (system != null && !system.isEmpty()) {
                    // No separate system slot on this phone: the instructions go first.
                    builder = new GenerateContentRequest.Builder(new TextPart(system + "\n\n" + user));
                } else {
                    builder = new GenerateContentRequest.Builder(new TextPart(user));
                }
                // Low temperature: every task here wants one well-formed JSON
                // object, not variety.
                builder.setTemperature(0.2f);
                builder.setMaxOutputTokens(maxTokens);
                builder.setCandidateCount(1);

                GenerateContentResponse response = model().generateContent(builder.build())
                    .get(GENERATE_TIMEOUT_S, TimeUnit.SECONDS);
                List<Candidate> candidates = response.getCandidates();
                String text = candidates.isEmpty() ? null : candidates.get(0).getText();
                if (text == null || text.trim().isEmpty()) {
                    call.reject("The on-device model gave no answer", "empty");
                    return;
                }
                JSObject out = new JSObject();
                out.put("content", text);
                call.resolve(out);
            } catch (Exception e) {
                // Busy, quota, too long, background use, safety: all mean "ask the cloud".
                Throwable cause = e.getCause() != null ? e.getCause() : e;
                String code = cause instanceof GenAiException ? String.valueOf(((GenAiException) cause).getErrorCode()) : cause.getClass().getSimpleName();
                Log.i(TAG, "generation failed: " + code);
                call.reject("On-device generation failed", "failed");
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        worker.shutdownNow();
        super.handleOnDestroy();
    }
}
