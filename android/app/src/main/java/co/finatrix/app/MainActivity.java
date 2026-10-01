package co.finatrix.app;

import android.content.res.Configuration;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugins register before the bridge starts.
        registerPlugin(SystemUiPlugin.class);
        registerPlugin(FileExportPlugin.class);
        super.onCreate(savedInstanceState);
        // Draw under the status and navigation bars on every Android version,
        // not only 15+ where it is enforced. The page pads itself from the
        // insets Capacitor's SystemBars injects (insetsHandling: 'css').
        // AFTER super.onCreate: BridgeActivity sets the post-launch theme there,
        // and touching the window before it installs the decor with the launch
        // theme — which carries a title bar over the whole app.
        EdgeToEdge.enable(this);

        WebView webView = getBridge().getWebView();
        // The WebView's own backdrop defaults to white, which flashes between
        // documents (an OAuth return reloads the page). Match the app surface
        // for the current day/night mode instead.
        webView.setBackgroundColor(ContextCompat.getColor(this, R.color.fx_window_bg));
        applyFontScale(getResources().getConfiguration());
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applyFontScale(newConfig);
    }

    /**
     * Honour the system "Font size" accessibility setting.
     *
     * Unlike Chrome, an embedded WebView renders text at 100% whatever the user
     * chose in Settings → Display → Font size, so someone who needs large text
     * would get small text in this app only. The page layout is fluid and
     * already survives browser zoom, so scaling text to the system factor is
     * safe (WCAG 1.4.4).
     */
    private void applyFontScale(Configuration config) {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        int zoom = Math.max(85, Math.min(Math.round(config.fontScale * 100f), 200));
        WebView webView = getBridge().getWebView();
        if (webView.getSettings().getTextZoom() == zoom) return;
        webView.getSettings().setTextZoom(zoom);
        // Text zoom leaves the layout viewport alone, so the page cannot notice
        // on its own; src/native/bridge.ts re-measures on this event.
        webView.evaluateJavascript("window.dispatchEvent(new Event('fx:textzoom'))", null);
    }
}
