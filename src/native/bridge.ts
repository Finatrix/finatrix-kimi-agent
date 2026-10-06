/**
 * The apps' native integration, Android and iOS. A lazy chunk: `NativeShell`
 * imports it only when `isNativeApp()` is true, so none of this reaches the
 * website.
 *
 * What it owns, and why each one matters for an app that should feel native
 * rather than like a website in a frame:
 *
 *  - The hardware / gesture BACK action (Android). Users expect it to close the
 *    topmost thing first (a sheet, the drawer, a menu), then walk back through
 *    screens, and at the home screen send the app to the background — never to
 *    silently do nothing, and never to navigate underneath an open dialog. iOS
 *    has no equivalent event: its edge-swipe is handled by WKWebView itself
 *    (`allowsBackForwardNavigationGestures` in ViewController.swift), which
 *    walks the same History API entries react-router creates.
 *  - System bar icon colour and the window backdrop, kept in step with the
 *    in-app theme so the clock and battery stay legible when the user flips
 *    light/dark — and so does the keyboard, on iOS.
 *  - The launch splash, held until the first screen has actually painted, so
 *    the user never sees a blank WebView between the splash and the app.
 *  - Deep links: OAuth returning from the system browser, and verified
 *    `https://finatrix.co/...` App Links / Universal Links opening the matching
 *    screen.
 *  - External links, opened in a themed in-app browser (a Chrome Custom Tab, an
 *    SFSafariViewController) instead of throwing the user out to a full browser.
 *  - Native haptics, keyboard state, and the system text-size setting.
 *
 * Platform branches are deliberate and few; `nativePlatform()` in ./platform.ts
 * lists why each one exists.
 */
import { Capacitor, SystemBars, SystemBarsStyle, registerPlugin } from '@capacitor/core';
import { App, type URLOpenListenerEvent } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Keyboard, KeyboardStyle } from '@capacitor/keyboard';
import { SplashScreen } from '@capacitor/splash-screen';
import { setNativeHapticDriver, type Haptic } from '../lib/haptics';
import { safeInternalPath } from '../lib/safePath';
import { NATIVE_AUTH_CALLBACK, PUBLIC_ORIGIN, nativePlatform } from './platform';

export interface BridgeOptions {
  /** Client-side navigation (react-router's `navigate`). */
  navigate: (to: string, opts?: { replace?: boolean }) => void;
}

/** Screens at which BACK leaves the app instead of navigating. */
const ROOT_PATHS = new Set(['/', '/tools', '/tools/dashboard']);
/** Where BACK goes when there is no history to walk (the app was deep-linked). */
const HOME_PATH = '/tools/dashboard';

/* ── Theme → system bars ──────────────────────────────────────────────── */

function currentTheme(): 'light' | 'dark' {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

/**
 * App-local plugin, implemented on both platforms with the same JS name:
 *   android/app/src/main/java/co/finatrix/app/SystemUiPlugin.java
 *   ios/App/App/FxSystemUiPlugin.swift
 */
const FxSystemUi = registerPlugin<{ setBackgroundColor(o: { color: string }): Promise<void> }>('FxSystemUi');

function syncSystemBars(): void {
  // `Light` means dark icons for a light background, and vice versa.
  const light = currentTheme() === 'light';
  const style = light ? SystemBarsStyle.Light : SystemBarsStyle.Dark;
  // Then repaint the window behind the bars — visible on Android WebViews too
  // old to draw under them, and on iOS behind a rubber-band scroll or for the
  // frame a new document takes to paint — in the page's colour. Order matters on
  // Android: setStyle resets it there.
  void SystemBars.setStyle({ style })
    .then(() => FxSystemUi.setBackgroundColor({ color: surfaceColor() }))
    .catch(() => {});
  // iOS only: the on-screen keyboard has its own appearance, and it follows the
  // SYSTEM setting unless told otherwise — so someone using the app in dark mode
  // on a light-mode phone gets a white keyboard under a charcoal form. Android's
  // keyboard is the user's own IME and is not the app's to restyle.
  if (nativePlatform() === 'ios') {
    void Keyboard.setStyle({ style: light ? KeyboardStyle.Light : KeyboardStyle.Dark }).catch(() => {});
  }
}

/** In-app browser toolbar colour — the app's own surface, so the hand-off is seamless. */
function surfaceColor(): string {
  return currentTheme() === 'light' ? '#F4F2EC' : '#060607';
}

/* ── System font size ─────────────────────────────────────────────────── */

/**
 * Tag the document when the system font size is large (`html.fx-text-lg`).
 *
 * MainActivity honours Android's font-size setting through WebView text zoom,
 * which scales every font but — unlike browser zoom — leaves the layout
 * viewport and every media query where they were. Breakpoints therefore never
 * react, and rows sized for normal text (the app header above all) overflow at
 * 150–200%. CSS cannot see the zoom; a 100px probe's computed size can.
 * MainActivity fires `fx:textzoom` when the setting changes while the app runs.
 *
 * ANDROID ONLY, and inert rather than wrong elsewhere: WKWebView has no text
 * zoom, so on iOS the probe measures exactly what was declared, this returns 1,
 * and no compensation is applied — which is correct, because there is nothing to
 * compensate for. iOS reaches WCAG 1.4.4 by a different route: `ios.zoomEnabled`
 * in capacitor.config.ts lets the page be pinch-zoomed, which is the only
 * magnification WKWebView actually offers. See docs/IOS.md § Accessibility.
 */
export function syncTextZoom(): number {
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;font-size:100px';
  document.body.appendChild(probe);
  const zoom = parseFloat(getComputedStyle(probe).fontSize) / 100 || 1;
  probe.remove();
  document.documentElement.classList.toggle('fx-text-lg', zoom >= 1.3);
  document.documentElement.style.setProperty('--fx-text-zoom', String(zoom));
  return zoom;
}

/* ── Back button ──────────────────────────────────────────────────────── */

function isShown(el: Element): boolean {
  const box = (el as HTMLElement).getBoundingClientRect?.();
  return !!box && box.width > 0 && box.height > 0 && !el.closest('[inert]');
}

/**
 * Close the topmost overlay, if one is open. Returns whether one was.
 *
 * Every dialog, drawer and menu in the app already closes on Escape (a WCAG
 * requirement they were built to meet), so BACK reuses that one contract rather
 * than teaching each overlay a second close path. A popover whose Escape
 * handler is scoped to its own subtree gets its trigger toggled instead.
 */
export function closeTopOverlay(): boolean {
  const escape = (target: EventTarget) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));

  const modals = Array.from(document.querySelectorAll('[aria-modal="true"]')).filter(isShown);
  const modal = modals[modals.length - 1];
  if (modal) {
    const focused = document.activeElement;
    escape(focused && modal.contains(focused) ? focused : modal);
    return true;
  }

  const trigger = Array.from(document.querySelectorAll('[aria-haspopup][aria-expanded="true"]')).filter(isShown).pop();
  if (trigger) {
    escape(document.activeElement ?? document.body);
    // Still open a frame later: its Escape listener lives somewhere the event
    // did not reach. The trigger toggles it closed either way.
    requestAnimationFrame(() => {
      if (trigger.getAttribute('aria-expanded') === 'true') (trigger as HTMLElement).click();
    });
    return true;
  }
  return false;
}

export function onBack(canGoBack: boolean, navigate: BridgeOptions['navigate']): void {
  if (closeTopOverlay()) return;
  if (ROOT_PATHS.has(window.location.pathname)) {
    // Android convention for a top-level screen: background, not destroy, so
    // returning is instant and nothing typed is lost.
    void App.minimizeApp();
    return;
  }
  if (canGoBack && window.history.length > 1) window.history.back();
  else navigate(HOME_PATH, { replace: true });
}

/**
 * True where a hardware/gesture BACK event exists at all.
 *
 * iOS has no such event and no way to send an app to the background — Apple
 * treats a programmatic exit as a crash — so `App.minimizeApp()` there would
 * reject rather than do anything. The iOS equivalent of walking back is the
 * WKWebView edge-swipe enabled in ViewController.swift, which works on the same
 * History API entries `onBack` walks.
 */
function hasSystemBackButton(): boolean {
  return nativePlatform() === 'android';
}

/* ── Deep links ───────────────────────────────────────────────────────── */

/**
 * Load an in-app path in a fresh document, carrying its query and fragment.
 *
 * Used only for URLs that carry auth material (`#access_token=…`, `?code=…`,
 * `type=recovery`). The Supabase client reads those exactly once, when it
 * initialises, and `AuthContext` decides at first render whether this is an
 * OAuth or recovery return — so replaying the page load reproduces the web's
 * return leg byte for byte instead of re-implementing it for the app. The
 * bundle is on-device, so the reload costs a few hundred milliseconds.
 */
function reloadAt(pathWithSuffix: string): void {
  window.location.replace(`${window.location.origin}${pathWithSuffix}`);
}

/** finatrix.co or www.finatrix.co — both are in the App Links intent filter. */
function isPublicSite(url: URL): boolean {
  return url.origin === PUBLIC_ORIGIN || url.origin === `https://www.${new URL(PUBLIC_ORIGIN).host}`;
}

function carriesAuth(url: URL): boolean {
  const params = [url.searchParams, new URLSearchParams(url.hash.slice(1))];
  return params.some((p) => ['access_token', 'refresh_token', 'code', 'error', 'error_description', 'error_code'].some((key) => p.has(key))
    || p.get('type') === 'recovery');
}

export function handleOpenUrl(raw: string, navigate: BridgeOptions['navigate']): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return;
  }

  // OAuth return: co.finatrix.app://auth/callback?next=/tools&code=…
  const callback = new URL(NATIVE_AUTH_CALLBACK);
  if (url.protocol === callback.protocol && url.host === callback.host
    && url.pathname === callback.pathname && !url.username && !url.password) {
    void Browser.close().catch(() => {});
    const next = safeInternalPath(url.searchParams.get('next'), '/tools');
    // A refused or failed sign-in (consent declined, provider error) carries
    // `error=…` instead of a code. Only the sign-in screen explains that
    // (`callbackError`); landing on `next` would drop the person on a screen
    // that silently shows them still signed out. They go back to sign-in,
    // with `next` kept for the retry.
    if (/(^|[#&?])error(_description|_code)?=/.test(url.hash + url.search)) {
      const params = new URLSearchParams(url.search);
      params.set('next', next);
      reloadAt(`/login?${params.toString()}${url.hash}`);
      return;
    }
    // The PKCE code is redeemed on the sign-in screen the person started from
    // (AuthContext + src/lib/nativeOAuth.ts), which then sends them on to
    // `next` exactly as a password sign-in does — and explains a failure in
    // place. Only `code` and `next` are carried over.
    const code = url.searchParams.get('code');
    const login = new URLSearchParams({ next });
    if (code) {
      login.set('code', code);
      reloadAt(`/login?${login.toString()}`);
      return;
    }
    // Anything else on this URL — notably implicit-flow tokens in the fragment
    // — was not requested by this app, which only starts PKCE sign-ins. It is
    // dropped unread: a page or app that can open our scheme must not be able
    // to sign the person into an account of its choosing.
    login.set('error', 'invalid_request');
    login.set('error_description', 'Sign-in could not be completed. Please try again.');
    reloadAt(`/login?${login.toString()}`);
    return;
  }

  // Verified App Link: https://finatrix.co/<path>
  if (isPublicSite(url)) {
    const path = safeInternalPath(url.pathname, HOME_PATH);
    if (carriesAuth(url)) reloadAt(`${path}${url.search}${url.hash}`);
    else navigate(`${path}${url.search}${url.hash}`);
  }
}

const LAUNCH_URL_CLAIM = 'fx_launch_url_claimed';

/**
 * True the first time it is asked in this WebView session, false after.
 *
 * Capacitor's `getLaunchUrl()` is the intent that STARTED the activity, fixed
 * for its whole life — it answers the same on every page load. A launch URL
 * handled by `reloadAt` (an OAuth return that cold-started the app, an email
 * confirmation link) would reload the page, be read again, reload again, and
 * never stop. sessionStorage survives those reloads and dies with the WebView,
 * which is exactly the lifetime of the intent it guards.
 */
export function claimLaunchUrl(): boolean {
  try {
    if (sessionStorage.getItem(LAUNCH_URL_CLAIM)) return false;
    sessionStorage.setItem(LAUNCH_URL_CLAIM, '1');
    return true;
  } catch {
    return false;
  }
}

/* ── External links ───────────────────────────────────────────────────── */

/**
 * Open a URL in the system's in-app browser, styled as part of the app — a
 * Chrome Custom Tab on Android, an SFSafariViewController on iOS.
 *
 * `fullscreen` rather than `popover`. Android ignores the option entirely, and on
 * iOS a popover needs a source view it is never given; UIKit only papers over
 * that by adapting to full screen on a compact width, so the value bought
 * nothing on an iPhone and would raise on any regular-width device. Full screen
 * is also the right presentation for a sign-in: a sheet invites a swipe-down
 * halfway through an OAuth hand-off.
 */
export async function openInAppBrowser(url: string): Promise<void> {
  await Browser.open({ url, toolbarColor: surfaceColor(), presentationStyle: 'fullscreen' });
}

/**
 * Open a sign-in page in a Custom Tab and resolve once the tab is gone.
 *
 * A completed sign-in comes back through `appUrlOpen` and reloads the page, so
 * whoever awaits this only ever sees the other outcome: the person closed the
 * tab (✕, or BACK) without finishing, and the form that opened it has to become
 * usable again instead of spinning forever.
 */
export async function openAuthBrowser(url: string): Promise<void> {
  let release: (() => void) | undefined;
  const closed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const listener = await Browser.addListener('browserFinished', () => release?.());
  try {
    await openInAppBrowser(url);
    await closed;
  } finally {
    void listener.remove().catch(() => {});
  }
}

/**
 * Intercept taps on links that leave the app.
 *
 * Without this, the WebView either hands them to the default browser app (a
 * jarring context switch) or, for `target="_blank"`, does nothing visible at
 * all. Links into finatrix.co itself are the app's own screens, so they route
 * in place. `mailto:` / `tel:` are left to the platform, which opens the right
 * app for them.
 */
export function onDocumentClick(e: MouseEvent, navigate: BridgeOptions['navigate']): void {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const anchor = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!anchor || anchor.hasAttribute('download')) return;
  let url: URL;
  try {
    url = new URL(anchor.href, window.location.href);
  } catch {
    return;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.origin === window.location.origin) return; // in-app; the router handles it

  e.preventDefault();
  if (isPublicSite(url) && !carriesAuth(url)) {
    navigate(`${safeInternalPath(url.pathname, HOME_PATH)}${url.search}${url.hash}`);
    return;
  }
  void openInAppBrowser(url.href).catch(() => {
    window.open(url.href, '_system');
  });
}

/* ── Haptics ──────────────────────────────────────────────────────────── */

function nativeHaptic(kind: Haptic): void {
  const run =
    kind === 'success' ? Haptics.notification({ type: NotificationType.Success })
    : kind === 'warn' ? Haptics.notification({ type: NotificationType.Warning })
    : kind === 'remove' ? Haptics.impact({ style: ImpactStyle.Medium })
    : Haptics.selectionChanged();
  void run.catch(() => {});
}

/* ── Splash ───────────────────────────────────────────────────────────── */

/**
 * Hide the splash once real content has painted — the app shell, a page's
 * <main>, or the sign-in card — with a hard ceiling so a slow chunk can never
 * strand the user on the splash.
 */
function hideSplashWhenPainted(): () => void {
  const started = performance.now();
  let frame = 0;
  const tick = () => {
    const painted = document.querySelector('.fx-tools, main, #main, [data-app-ready]');
    if (painted || performance.now() - started > 2500) {
      // Two frames: the one that inserted the content, and the one that drew it.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          void SplashScreen.hide({ fadeOutDuration: 220 }).catch(() => {});
        });
      });
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  tick();
  return () => cancelAnimationFrame(frame);
}

/* ── Entry point ──────────────────────────────────────────────────────── */

/** Install every native integration. Returns a disposer (used by HMR/tests). */
export function startNativeBridge({ navigate }: BridgeOptions): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  let disposed = false;
  const disposers: Array<() => void> = [];
  const listen = (p: Promise<{ remove: () => Promise<void> }>) => {
    const registration = p.catch(() => undefined);
    disposers.push(() => void registration.then((h) => h?.remove()).catch(() => {}));
  };

  disposers.push(hideSplashWhenPainted());

  syncSystemBars();
  const themeObserver = new MutationObserver(syncSystemBars);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  disposers.push(() => themeObserver.disconnect());

  syncTextZoom();
  window.addEventListener('fx:textzoom', syncTextZoom);
  disposers.push(() => window.removeEventListener('fx:textzoom', syncTextZoom));

  setNativeHapticDriver(nativeHaptic);
  disposers.push(() => setNativeHapticDriver(null));

  if (hasSystemBackButton()) {
    listen(App.addListener('backButton', ({ canGoBack }) => onBack(canGoBack, navigate)));
  }
  let receivedLink = false;
  listen(App.addListener('appUrlOpen', (e: URLOpenListenerEvent) => {
    if (disposed) return;
    receivedLink = true;
    // Spend the launch-URL claim before handling the link. iOS answers
    // `getLaunchUrl()` with the LAST url the app was opened with, not the one
    // that started it, so an OAuth return handled here (which reloads the page)
    // was read again by the reloaded page below and replayed: a second reload
    // carrying a one-time code whose verifier the first load had already taken.
    // That is the "sign-in fails the first time, works the second" report —
    // the second attempt found the claim already spent.
    claimLaunchUrl();
    handleOpenUrl(e.url, navigate);
  }));
  // A cold start from a link: the listener above was not yet registered when the
  // intent (Android) or the NSUserActivity / openURLContexts (iOS, via
  // SceneDelegate) arrived. Once per WebView session — see `claimLaunchUrl`.
  void App.getLaunchUrl()
    .then((launch) => {
      if (disposed || !launch?.url || !claimLaunchUrl()) return;
      // iOS retains the cold-start event until a listener is registered. That
      // event can arrive before getLaunchUrl resolves; replaying it adds the
      // same screen twice, or overwrites a newer warm link with an old one.
      if (!receivedLink) handleOpenUrl(launch.url, navigate);
    })
    .catch(() => {});

  // The keyboard covers the bottom of the screen; the tab bar and floating
  // buttons would otherwise ride up on top of it and cover the field in use.
  const root = document.documentElement;
  listen(Keyboard.addListener('keyboardWillShow', () => root.classList.add('fx-kb-open')));
  listen(Keyboard.addListener('keyboardWillHide', () => root.classList.remove('fx-kb-open')));
  disposers.push(() => root.classList.remove('fx-kb-open'));

  const onClick = (e: MouseEvent) => onDocumentClick(e, navigate);
  document.addEventListener('click', onClick);
  disposers.push(() => document.removeEventListener('click', onClick));

  return () => {
    disposed = true;
    disposers.forEach((d) => d());
  };
}
