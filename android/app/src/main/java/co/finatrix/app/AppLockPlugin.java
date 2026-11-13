package co.finatrix.app;

import android.app.KeyguardManager;
import android.content.Context;
import android.os.Build;
import android.view.WindowManager;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The Android half of the optional app lock. The policy (when to lock, when to
 * ask) lives on the web side in src/native/appLock/; this class does the three
 * things only native code can:
 *
 *  - availability  whether the device has a screen lock to check against;
 *  - authenticate  the system prompt: fingerprint or face first, the PIN,
 *                  pattern or password as the fallback;
 *  - setCover      keep the app's content out of the recents screen.
 *
 * The iOS half, with the same JS name and the same three methods, is
 * ios/App/App/FxAppLockPlugin.swift.
 *
 * BIOMETRIC_WEAK | DEVICE_CREDENTIAL is the one combination androidx.biometric
 * supports on every Android version this app runs on (24 and later), and it is
 * usable exactly when the device is secured: Android will not enrol a
 * fingerprint or a face without a PIN, pattern or password behind it. So
 * "available" is simply KeyguardManager.isDeviceSecure().
 *
 * The lock is a privacy gate on an unlocked phone. It does not encrypt anything.
 */
@CapacitorPlugin(name = "FxAppLock")
public class AppLockPlugin extends Plugin {

    private static final int AUTHENTICATORS =
        BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    @PluginMethod
    public void availability(PluginCall call) {
        boolean biometrics = BiometricManager.from(getContext())
            .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK) == BiometricManager.BIOMETRIC_SUCCESS;
        JSObject result = new JSObject();
        result.put("available", isDeviceSecure());
        result.put("biometry", biometrics ? "biometric" : "none");
        call.resolve(result);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        final String title = call.getString("reason", "Unlock FinatriX");
        final AppCompatActivity activity = getActivity();
        activity.runOnUiThread(() -> {
            if (!isDeviceSecure()) {
                finish(call, "unavailable");
                return;
            }
            // Once the activity's state is saved (it is on its way to the
            // background) BiometricPrompt logs a line and does nothing: no
            // prompt and no callback. Answer here, or the page waits for ever.
            if (activity.getSupportFragmentManager().isStateSaved()) {
                finish(call, "cancelled");
                return;
            }
            try {
                BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title == null || title.isEmpty() ? "Unlock FinatriX" : title)
                    .setAllowedAuthenticators(AUTHENTICATORS)
                    .setConfirmationRequired(false)
                    .build();
                new BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        finish(call, "ok");
                    }

                    @Override
                    public void onAuthenticationError(int code, @NonNull CharSequence message) {
                        finish(call, outcome(code));
                    }
                    // onAuthenticationFailed is one finger that did not match.
                    // The prompt stays up and tries again, so there is nothing
                    // to report yet.
                }).authenticate(info);
            } catch (RuntimeException e) {
                finish(call, "failed");
            }
        });
    }

    @PluginMethod
    public void setCover(PluginCall call) {
        final boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        final AppCompatActivity activity = getActivity();
        activity.runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                // Android 13 and later can leave the recents thumbnail out
                // without also blocking the user's own screenshots.
                activity.setRecentsScreenshotEnabled(!enabled);
            } else if (enabled) {
                // Earlier versions have one switch for both.
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            } else {
                activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            }
            call.resolve();
        });
    }

    private boolean isDeviceSecure() {
        KeyguardManager keyguard = (KeyguardManager) getContext().getSystemService(Context.KEYGUARD_SERVICE);
        return keyguard != null && keyguard.isDeviceSecure();
    }

    /**
     * "unavailable" only when there is no screen lock: that is the one case the
     * page answers by switching the lock off, so nothing else may claim it.
     */
    static String outcome(int code) {
        switch (code) {
            case BiometricPrompt.ERROR_USER_CANCELED:
            case BiometricPrompt.ERROR_NEGATIVE_BUTTON:
            case BiometricPrompt.ERROR_CANCELED:
            case BiometricPrompt.ERROR_TIMEOUT:
                return "cancelled";
            case BiometricPrompt.ERROR_NO_DEVICE_CREDENTIAL:
                return "unavailable";
            default:
                return "failed";
        }
    }

    private static void finish(PluginCall call, String outcome) {
        JSObject result = new JSObject();
        result.put("result", outcome);
        call.resolve(result);
    }
}
