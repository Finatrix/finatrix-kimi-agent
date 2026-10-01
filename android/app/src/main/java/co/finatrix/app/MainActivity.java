package co.finatrix.app;

import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * The oldest Android System WebView (Chromium major version) the bundled web
     * app is built for. MUST equal the `chrome` entry of `build.target` in
     * vite.config.ts — src/test/webviewFloor.test.ts holds the two together.
     *
     * Below it the app does not degrade, it goes blank: measured on an Android
     * 11 image with its original WebView 91, the bundle stops at the first
     * `Array.prototype.at` call. WebView updates through the Play Store on every
     * Android version this app supports (7.0+), so almost every phone is far
     * past this; the few that are not get told how to fix it, not a white page.
     */
    static final int MIN_WEBVIEW_MAJOR = 107;

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
        if (savedInstanceState == null) warnIfWebViewTooOld();
    }

    /** Chromium major version of the WebView actually in use, or -1 if unknown. */
    static int webViewMajor(String userAgent) {
        if (userAgent == null) return -1;
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("Chrome/(\\d+)\\.").matcher(userAgent);
        return m.find() ? Integer.parseInt(m.group(1)) : -1;
    }

    /**
     * Offer to update an out-of-date WebView instead of showing a blank app.
     * "Continue" is still offered: the person may know better (a device with no
     * Play Store), and nothing is lost by letting them try.
     */
    private void warnIfWebViewTooOld() {
        int major;
        try {
            major = webViewMajor(WebSettings.getDefaultUserAgent(this));
        } catch (RuntimeException e) {
            return; // No WebView provider at all — nothing useful to suggest.
        }
        if (major < 0 || major >= MIN_WEBVIEW_MAJOR) return;
        new AlertDialog.Builder(this)
            .setTitle(R.string.webview_outdated_title)
            .setMessage(R.string.webview_outdated_message)
            .setPositiveButton(R.string.webview_outdated_update, (dialog, which) -> openWebViewStorePage())
            .setNegativeButton(R.string.webview_outdated_continue, null)
            .show();
    }

    private void openWebViewStorePage() {
        String pkg = "com.google.android.webview";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            PackageInfo provider = WebView.getCurrentWebViewPackage();
            if (provider != null) pkg = provider.packageName;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg)));
        } catch (ActivityNotFoundException e) {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + pkg)));
        }
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
