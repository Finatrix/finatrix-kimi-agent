import type { CapacitorConfig } from '@capacitor/cli';

/**
 * FinatriX for Android and iOS — the native shells around the same `dist/` the
 * website ships. Runbooks: docs/ANDROID.md, docs/IOS.md.
 *
 * The bundle is packaged INSIDE the app (no `server.url`): it opens instantly
 * and offline, cannot be changed out from under a reviewed release, and every
 * store build is exactly the code that was tested. The cost is that a web deploy
 * no longer updates either app — ship all three.
 */
const config: CapacitorConfig = {
  appId: 'co.finatrix.app',
  appName: 'FinatriX',
  webDir: 'dist',

  android: {
    // chrome://inspect works on debug builds only (Capacitor's default when
    // this is unset) — never on a release build.
    // Local assets only and an https backend: never permit mixed content.
    allowMixedContent: false,
    // Lets server logs and analytics tell app traffic from browser traffic.
    appendUserAgent: 'FinatriXApp/1',
  },

  ios: {
    // The web view's backdrop before the page has painted, and behind a
    // rubber-band scroll. The app's dark surface, matching the splash, so an
    // OAuth return (which reloads the document) does not flash white. From then
    // on FxSystemUiPlugin.swift keeps it on the IN-APP theme, which is what
    // `SystemBars.setStyle` alone cannot do.
    backgroundColor: '#060607',
    // Long-press on a link opens a preview card in WKWebView by default — one of
    // the clearest "this is a web page" tells there is. The shared stylesheet
    // already sets `-webkit-touch-callout: none` in the app; this closes the
    // native half of the same behaviour.
    allowsLinkPreview: false,
    // The page pads itself from env(safe-area-inset-*) (viewport-fit=cover in
    // index.html, --fx-safe-* in tokens.css). Letting UIKit ALSO inset the
    // scroll view would double every inset. This is Capacitor's default; it is
    // written out because the layout depends on it.
    contentInset: 'never',
    // Lets server logs and analytics tell app traffic from browser traffic —
    // the same token the Android shell appends.
    appendUserAgent: 'FinatriXApp/1',
    // Allow pinch-to-zoom. Capacitor blocks it by default, and on iOS that would
    // leave the app with NO way to magnify text: WKWebView has no equivalent of
    // the WebView text zoom that carries Android's system font-size setting into
    // the page (MainActivity.applyFontScale), and `-webkit-text-size-adjust` with
    // a percentage is ignored by WebKit — measured, not assumed. Pinch zoom is
    // therefore the only magnification the engine offers, which makes it the
    // app's WCAG 1.4.4 route. The viewport meta in index.html already permits it
    // (no `user-scalable=no`, no `maximum-scale`), so this only stops Capacitor
    // from overriding the page's own choice.
    zoomEnabled: true,
    // `webContentsDebuggingEnabled` is deliberately ABSENT. Unset means Safari's
    // Web Inspector attaches to debug builds and never to a release build;
    // setting it to false would also give up inspecting during development, and
    // setting it to true would ship an inspectable production app.
    //
    // `limitsNavigationsToAppBoundDomains` is deliberately absent too. Turning it
    // on would confine the web view to a declared domain list, which sounds like
    // hardening but is not one here: the page is loaded from the app's own
    // bundle, external links open out of process in SFSafariViewController, and
    // the real navigation guard is worker-side (`onDocumentClick` in bridge.ts).
    // What it would add is a way for an entitlement list to silently break
    // Supabase calls.
  },

  server: {
    // Page origin. Android: https://localhost. iOS: capacitor://localhost, and
    // NOT by choice — WKWebView refuses a scheme handler for a scheme it already
    // owns, so `iosScheme: 'https'` is rejected and silently falls back to
    // exactly this (CAPInstanceDescriptor.swift). Both are secure contexts
    // (crypto.subtle, secure storage) because the host is `localhost`.
    //
    // Both are also allow-listed by the Supabase edge functions
    // (supabase/functions/_shared/origins.ts). Changing any of these three values
    // orphans every user's on-device data — localStorage is per origin — so
    // treat them as permanent.
    androidScheme: 'https',
    hostname: 'localhost',
  },

  // Bridge logging in debug builds only; release logcat stays clean.
  loggingBehavior: 'debug',

  plugins: {
    SystemBars: {
      // Android only: inject --safe-area-inset-* CSS variables, because Android
      // WebView before Chromium 140 reports env(safe-area-inset-*) as 0 under
      // edge-to-edge. The web tokens (--fx-safe-*) prefer the injected value and
      // fall back to env(), which is what iOS uses — WKWebView reports real
      // insets, so nothing needs injecting there.
      insetsHandling: 'css',
      // index.html declares viewport-fit=cover; saying so up front avoids a
      // one-frame layout jump while the plugin detects it.
      initialViewportFitValueHint: 'cover',
      // Light icons, because the launch surface is the dark charcoal splash on
      // both platforms whatever the system appearance is, and the app's default
      // theme is dark. `src/native/bridge.ts` takes over from the in-app theme as
      // soon as it starts; this is only about the frames before that, where
      // 'DEFAULT' meant dark icons on a charcoal splash for a light-mode phone.
      style: 'DARK',
    },
    SplashScreen: {
      // Hidden by src/native/bridge.ts the moment the first screen paints
      // (typically well under a second). The duration is only a ceiling, so a
      // failed boot can never strand the user on the splash. Must be non-zero:
      // 0 skips the launch splash entirely.
      launchAutoHide: true,
      launchShowDuration: 4000,
      launchFadeOutDuration: 220,
      backgroundColor: '#060607',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    Keyboard: {
      // Android: resize the WebView (not the body) so fixed bars stay put.
      resizeOnFullScreen: false,
      // iOS: the same intent, spelled the way the iOS half of the plugin spells
      // it. 'native' shrinks the web view itself, so a fixed bottom bar sits
      // above the keyboard rather than under it, and env(safe-area-inset-bottom)
      // correctly drops to 0 while the keyboard covers the home indicator. The
      // bridge hides the tab bar either way (`html.fx-kb-open`).
      resize: 'native',
      // The keyboard's own appearance is left on DEFAULT — i.e. the system's —
      // at launch and driven from the in-app theme by src/native/bridge.ts, for
      // the same reason the system bars are: someone running the app in dark
      // mode on a light-mode phone should not get a white keyboard.
      style: 'DEFAULT',
    },
  },
};

export default config;
