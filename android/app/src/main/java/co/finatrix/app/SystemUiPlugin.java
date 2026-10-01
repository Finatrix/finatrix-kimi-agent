package co.finatrix.app;

import android.graphics.Color;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Paints the window behind the system bars in the web app's current theme.
 *
 * On Android WebView older than Chromium 140, Capacitor's SystemBars cannot
 * draw the page under the bars; it pads the WebView instead, and the strips
 * under the status and navigation bars show the window background. That
 * colour comes from the day/night resources — the OS setting — while the page
 * follows the user's in-app theme choice. Without this, picking light mode on
 * a phone in dark mode left black bars with dark (invisible) icons on them.
 *
 * SystemBars.setStyle resets the window background on every call, so the web
 * side (src/native/bridge.ts) calls this after it.
 */
@CapacitorPlugin(name = "FxSystemUi")
public class SystemUiPlugin extends Plugin {

    @PluginMethod
    public void setBackgroundColor(PluginCall call) {
        String value = call.getString("color", "");
        final int color;
        try {
            color = Color.parseColor(value);
        } catch (IllegalArgumentException e) {
            call.reject("Invalid colour: " + value);
            return;
        }
        getActivity().runOnUiThread(() -> {
            getActivity().getWindow().getDecorView().setBackgroundColor(color);
            if (getBridge().getWebView() != null) getBridge().getWebView().setBackgroundColor(color);
            call.resolve();
        });
    }
}
