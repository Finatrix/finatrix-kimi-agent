/**
 * The app layer, Android and iOS: platform detection, the store purchase gates,
 * and the native bridge's BACK / deep-link / external-link behaviour.
 *
 * The bridge is exercised against mocked Capacitor plugins — what is under
 * test is OUR routing policy (which URL goes where, what BACK closes first),
 * not Capacitor's plumbing, which has its own tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { browser, app, keyboard, systemBars, fxSystemUi, splash, browserListeners, appListeners, keyboardListeners } = vi.hoisted(() => {
  const browserListeners = new Map<string, () => void>();
  const appListeners = new Map<string, (payload: { url: string }) => void>();
  const keyboardListeners = new Map<string, () => void>();
  return {
    browserListeners,
    appListeners,
    keyboardListeners,
    browser: {
      open: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      addListener: vi.fn(async (event: string, cb: () => void) => {
        browserListeners.set(event, cb);
        return { remove: vi.fn(async () => { browserListeners.delete(event); }) };
      }),
    },
    app: {
      minimizeApp: vi.fn(async () => {}),
      addListener: vi.fn(async (event: string, cb: (payload: { url: string }) => void) => {
        appListeners.set(event, cb);
        return { remove: vi.fn(async () => { appListeners.delete(event); }) };
      }),
      getLaunchUrl: vi.fn(async (): Promise<{ url: string } | undefined> => undefined),
    },
    keyboard: {
      setStyle: vi.fn(async () => {}),
      addListener: vi.fn(async (event: string, cb: () => void) => {
        keyboardListeners.set(event, cb);
        return { remove: vi.fn(async () => { keyboardListeners.delete(event); }) };
      }),
    },
    systemBars: { setStyle: vi.fn(async () => {}) },
    fxSystemUi: { setBackgroundColor: vi.fn(async () => {}) },
    splash: { hide: vi.fn(async () => {}) },
  };
});

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  SystemBars: systemBars,
  SystemBarsStyle: { Light: 'LIGHT', Dark: 'DARK' },
  registerPlugin: () => fxSystemUi,
}));
vi.mock('@capacitor/app', () => ({ App: app }));
vi.mock('@capacitor/browser', () => ({ Browser: browser }));
vi.mock('@capacitor/haptics', () => ({ Haptics: {}, ImpactStyle: {}, NotificationType: {} }));
vi.mock('@capacitor/keyboard', () => ({ Keyboard: keyboard, KeyboardStyle: { Light: 'LIGHT', Dark: 'DARK', Default: 'DEFAULT' } }));
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: splash }));

import { canPurchaseInApp, isNativeApp, isPurchasePage, markPlatform, publicLinkOrigin, APP_ID, NATIVE_AUTH_CALLBACK, nativePlatform, isIosApp, isAndroidApp } from '../native/platform';
import { claimLaunchUrl, closeTopOverlay, syncTextZoom, handleOpenUrl, onBack, onDocumentClick, openAuthBrowser, openInAppBrowser, startNativeBridge } from '../native/bridge';

type CapWindow = Window & {
  Capacitor?: { isNativePlatform: () => boolean; getPlatform?: () => string };
};

/**
 * Pretend to be one of the apps, or neither.
 *
 * The bridge injects `getPlatform` as well as `isNativePlatform`, so a test that
 * supplies only the latter would silently exercise the Android branch of every
 * platform check — which is how an iOS-only path stays untested while looking
 * covered.
 */
function asApp(native: boolean, platform: 'android' | 'ios' = 'android') {
  if (native) {
    (window as CapWindow).Capacitor = { isNativePlatform: () => true, getPlatform: () => platform };
  } else {
    delete (window as CapWindow).Capacitor;
  }
}

/** jsdom lays nothing out; give an element a box so it counts as shown. */
function showBox(el: Element) {
  (el as HTMLElement).getBoundingClientRect = () => ({ width: 100, height: 100 }) as DOMRect;
}

afterEach(() => {
  asApp(false);
  document.documentElement.classList.remove('fx-native');
  document.body.innerHTML = '';
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe('platform detection', () => {
  it('is the website unless the native bridge says otherwise', () => {
    expect(isNativeApp()).toBe(false);
    expect(canPurchaseInApp()).toBe(true);
    expect(publicLinkOrigin()).toBe(window.location.origin);
  });

  it('recognises each app, and tells them apart', () => {
    asApp(true, 'android');
    expect(isNativeApp()).toBe(true);
    expect(nativePlatform()).toBe('android');
    expect(isAndroidApp()).toBe(true);
    expect(isIosApp()).toBe(false);

    asApp(true, 'ios');
    expect(isNativeApp()).toBe(true);
    expect(nativePlatform()).toBe('ios');
    expect(isIosApp()).toBe(true);
    expect(isAndroidApp()).toBe(false);

    asApp(false);
    expect(nativePlatform()).toBeNull();
  });

  it('assumes Android when a bridge reports no platform, rather than iOS', () => {
    // The Android app is the one that needs platform-specific workarounds (the
    // OCR language filename above all). Defaulting the other way would turn a
    // missing `getPlatform` into silently broken scanning on the platform that
    // has most of the users.
    (window as CapWindow).Capacitor = { isNativePlatform: () => true };
    expect(nativePlatform()).toBe('android');
  });

  it('never sells through the web checkout inside either app (Play Billing / App Review 3.1.1)', () => {
    for (const platform of ['android', 'ios'] as const) {
      asApp(true, platform);
      expect(canPurchaseInApp(), platform).toBe(false);
    }
  });

  it('names the pages that exist to sell, and nothing else', () => {
    for (const p of ['/pricing', '/careers', '/careers/features', '/careers/compare', '/careers/compare/naukri']) {
      expect(isPurchasePage(p), p).toBe(true);
    }
    for (const p of ['/careers/billing', '/careers/dashboard', '/tools/budget', '/faq', '/refunds', '/terms']) {
      expect(isPurchasePage(p), p).toBe(false);
    }
  });

  it('sends email links to the public site, not an app-only device origin', () => {
    for (const platform of ['android', 'ios'] as const) {
      asApp(true, platform);
      expect(publicLinkOrigin(), platform).toBe('https://finatrix.co');
    }
  });

  it('marks the document so native-only CSS applies from the first frame', () => {
    markPlatform();
    expect(document.documentElement.classList.contains('fx-native')).toBe(false);
    asApp(true);
    markPlatform();
    expect(document.documentElement.classList.contains('fx-native')).toBe(true);
  });

  it('survives a bridge that throws', () => {
    (window as CapWindow).Capacitor = { isNativePlatform: () => { throw new Error('boom'); } };
    expect(isNativeApp()).toBe(false);
  });
});

describe('one app identity across every file that declares it', () => {
  const root = resolve(__dirname, '../..');
  const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

  it('capacitor.config.ts, Gradle, the manifest scheme and platform.ts agree', () => {
    expect(read('capacitor.config.ts')).toContain(`appId: '${APP_ID}'`);
    expect(read('android/app/build.gradle')).toContain(`applicationId "${APP_ID}"`);
    expect(read('android/app/src/main/AndroidManifest.xml')).toContain(`android:scheme="${APP_ID}" android:host="auth"`);
    expect(NATIVE_AUTH_CALLBACK.startsWith(`${APP_ID}://auth/`)).toBe(true);
  });

  it('the iOS bundle id and its OAuth URL scheme agree with the same constant', () => {
    expect(read('ios/App/App.xcodeproj/project.pbxproj')).toContain(`PRODUCT_BUNDLE_IDENTIFIER = ${APP_ID};`);
    // Without CFBundleURLTypes the SFSafariViewController sign-in has nowhere to
    // return to, and the failure is a browser that simply never closes.
    const plist = read('ios/App/App/Info.plist');
    expect(plist).toContain('<key>CFBundleURLSchemes</key>');
    expect(plist).toContain(`<string>${APP_ID}</string>`);
  });

  it('the edge functions allow BOTH app origins', () => {
    const origins = read('supabase/functions/_shared/origins.ts');
    expect(origins).toMatch(/NATIVE_APP_ORIGIN = 'https:\/\/localhost'/);
    expect(origins).toMatch(/IOS_APP_ORIGIN = 'capacitor:\/\/localhost'/);
    expect(read('capacitor.config.ts')).toMatch(/androidScheme: 'https'[\s\S]*hostname: 'localhost'/);
  });

  /**
   * The plist's own comments name the keys it deliberately does NOT set, so a
   * raw substring search would find every one of them. These assertions are
   * about what the file DECLARES, so the comments come out first.
   */
  const keysOf = (path: string) => {
    const withoutComments = read(path).replace(/<!--[\s\S]*?-->/g, '');
    return [...withoutComments.matchAll(/<key>([^<]+)<\/key>/g)].map((m) => m[1]);
  };

  /**
   * `100dvh` is what sizes every full-height screen (ToolsLayout, AuthShell,
   * Onboarding, NotFound). WebKit gained the unit in Safari 15.4; below that the
   * whole `calc()` is invalid and `min-height` silently becomes `auto`, so those
   * screens stop filling the display with nothing to show for it. Shipping a
   * lower deployment target would reintroduce that on devices nobody tests.
   */
  it('does not deploy below the iOS version that understands the units the layout uses', () => {
    const usesDvh = ['src/tools/ToolsLayout.tsx', 'src/components/AuthShell.tsx']
      .some((f) => read(f).includes('100dvh'));
    expect(usesDvh, 'the layout no longer uses dvh — this floor may be revisitable').toBe(true);
    for (const target of read('ios/App/App.xcodeproj/project.pbxproj').matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g)) {
      expect(parseFloat(target[1])).toBeGreaterThanOrEqual(15.4);
    }
  });

  it('asks for exactly one iOS permission, and it is the camera', () => {
    const plist = read('ios/App/App/Info.plist');
    const asked = keysOf('ios/App/App/Info.plist').filter((k) => /^NS\w*UsageDescription$/.test(k));
    expect(asked).toEqual(['NSCameraUsageDescription']);
    // App Review rejects an empty or boilerplate purpose string.
    expect(plist).toMatch(/<key>NSCameraUsageDescription<\/key>\s*<string>[^<]{40,}<\/string>/);
  });

  it('never weakens App Transport Security', () => {
    // No key at all is the strictest setting: HTTPS only, TLS 1.2+, no
    // exception domains. An `NSAppTransportSecurity` dict can only relax that.
    expect(keysOf('ios/App/App/Info.plist')).not.toContain('NSAppTransportSecurity');
  });

  it('declares no tracking, on a bundle that contains no tracker', () => {
    const manifest = read('ios/App/App/PrivacyInfo.xcprivacy');
    expect(manifest).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
    expect(manifest).toMatch(/<key>NSPrivacyTrackingDomains<\/key>\s*<array\/>/);
    // An ATT prompt with nothing to justify it is itself a review risk.
    expect(keysOf('ios/App/App/Info.plist')).not.toContain('NSUserTrackingUsageDescription');
  });
});

describe('BACK', () => {
  const navigate = vi.fn();
  beforeEach(() => navigate.mockReset());

  it('closes the topmost modal before anything else', () => {
    document.body.innerHTML = '<div role="dialog" aria-modal="true" id="m"><button id="b">x</button></div>';
    const modal = document.getElementById('m')!;
    showBox(modal);
    const seen: string[] = [];
    window.addEventListener('keydown', (e) => seen.push(e.key), { once: true });
    history.pushState({}, '', '/tools/budget');
    onBack(true, navigate);
    expect(seen).toEqual(['Escape']);
    expect(navigate).not.toHaveBeenCalled();
    expect(app.minimizeApp).not.toHaveBeenCalled();
  });

  it('ignores dialogs that are hidden or inert', () => {
    document.body.innerHTML = '<div inert><div role="dialog" aria-modal="true" id="m"></div></div>';
    showBox(document.getElementById('m')!);
    expect(closeTopOverlay()).toBe(false);
  });

  it('closes an open menu or drawer via its trigger', () => {
    document.body.innerHTML = '<button aria-haspopup="menu" aria-expanded="true" id="t">menu</button>';
    showBox(document.getElementById('t')!);
    expect(closeTopOverlay()).toBe(true);
  });

  it('backgrounds the app at a top-level screen instead of navigating', () => {
    history.pushState({}, '', '/tools/dashboard');
    onBack(true, navigate);
    expect(app.minimizeApp).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('goes home when a deep link left no history to walk back through', () => {
    history.pushState({}, '', '/tools/goals');
    onBack(false, navigate);
    expect(navigate).toHaveBeenCalledWith('/tools/dashboard', { replace: true });
  });
});

describe('deep links', () => {
  const navigate = vi.fn();
  let replace: ReturnType<typeof vi.fn>;
  const realLocation = window.location;

  beforeEach(() => {
    navigate.mockReset();
    replace = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...realLocation, origin: 'https://localhost', href: 'https://localhost/tools', pathname: '/tools', replace },
    });
  });
  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  });

  it('redeems a PKCE return on the sign-in screen, keeping the requested destination', () => {
    handleOpenUrl(`${NATIVE_AUTH_CALLBACK}?next=%2Ftools%2Fbudget&code=0b6d2c1e-auth-code`, navigate);
    expect(browser.close).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('https://localhost/login?next=%2Ftools%2Fbudget&code=0b6d2c1e-auth-code');
  });

  it('keeps a destination that carries its own query and anchor intact in `next`', () => {
    handleOpenUrl(`${NATIVE_AUTH_CALLBACK}?next=${encodeURIComponent('/tools/expenses?month=2026-09#entries')}&code=c`, navigate);
    const target = new URL(replace.mock.calls[0][0] as string);
    expect(target.pathname).toBe('/login');
    expect(target.searchParams.get('next')).toBe('/tools/expenses?month=2026-09#entries');
    expect(target.searchParams.get('code')).toBe('c');
    expect(target.hash).toBe('');
  });

  /**
   * The app only ever starts PKCE sign-ins, so tokens on its custom scheme were
   * put there by someone else. Accepting them would let any app or page that
   * can open `co.finatrix.app://` sign the person into the attacker's account.
   */
  it('refuses implicit-flow tokens on the custom scheme and never forwards them', () => {
    handleOpenUrl(`${NATIVE_AUTH_CALLBACK}?next=%2Ftools%2Fbudget#access_token=a&refresh_token=b`, navigate);
    expect(replace).toHaveBeenCalledTimes(1);
    const target = replace.mock.calls[0][0] as string;
    expect(target).not.toMatch(/access_token|refresh_token/);
    const parsed = new URL(target);
    expect(parsed.pathname).toBe('/login');
    expect(parsed.searchParams.get('next')).toBe('/tools/budget');
    expect(parsed.searchParams.get('error_description')).toMatch(/could not be completed/i);
  });

  it('drops every parameter other than the code and destination', () => {
    handleOpenUrl(`${NATIVE_AUTH_CALLBACK}?next=%2Ftools&code=c&type=recovery&redirect=https%3A%2F%2Fevil.example`, navigate);
    expect(replace).toHaveBeenCalledWith('https://localhost/login?next=%2Ftools&code=c');
  });

  it('accepts only the exact registered callback, not a path with the same prefix', () => {
    handleOpenUrl(`${NATIVE_AUTH_CALLBACK}-other#access_token=a`, navigate);
    handleOpenUrl(`${NATIVE_AUTH_CALLBACK}/other#access_token=a`, navigate);
    expect(replace).not.toHaveBeenCalled();
    expect(browser.close).not.toHaveBeenCalled();
  });

  it('sends a refused or failed sign-in to the sign-in screen, which explains it', () => {
    handleOpenUrl(`${NATIVE_AUTH_CALLBACK}?next=%2Ftools%2Fgoals#error=access_denied&error_description=User+cancelled`, navigate);
    expect(replace).toHaveBeenCalledWith('https://localhost/login?next=%2Ftools%2Fgoals#error=access_denied&error_description=User+cancelled');
  });

  it('keeps an off-site `next` out of the error route too', () => {
    handleOpenUrl(`${NATIVE_AUTH_CALLBACK}?next=https%3A%2F%2Fevil.example#error=server_error`, navigate);
    expect(replace).toHaveBeenCalledWith('https://localhost/login?next=%2Ftools#error=server_error');
  });

  it('refuses an OAuth `next` that points off-site (open redirect)', () => {
    handleOpenUrl(`${NATIVE_AUTH_CALLBACK}?next=https%3A%2F%2Fevil.example%2F&code=c`, navigate);
    expect(replace).toHaveBeenCalledWith('https://localhost/login?next=%2Ftools&code=c');
  });

  it('opens a finatrix.co App Link as the matching in-app screen', () => {
    handleOpenUrl('https://finatrix.co/tools/goals?x=1', navigate);
    expect(navigate).toHaveBeenCalledWith('/tools/goals?x=1');
    expect(replace).not.toHaveBeenCalled();
  });

  it('reloads for an App Link carrying auth, so Supabase reads it at start-up', () => {
    handleOpenUrl('https://finatrix.co/reset-password#access_token=a&type=recovery', navigate);
    expect(replace).toHaveBeenCalledWith('https://localhost/reset-password#access_token=a&type=recovery');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('reloads failed email links even when the provider supplies only an error code', () => {
    handleOpenUrl('https://finatrix.co/reset-password#error=access_denied&error_code=otp_expired', navigate);
    expect(replace).toHaveBeenCalledWith('https://localhost/reset-password#error=access_denied&error_code=otp_expired');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not mistake words inside a normal query value for authentication', () => {
    handleOpenUrl('https://finatrix.co/learn?search=access_token=example', navigate);
    expect(navigate).toHaveBeenCalledWith('/learn?search=access_token=example');
    expect(replace).not.toHaveBeenCalled();
  });

  it('ignores links for any other host or scheme', () => {
    handleOpenUrl('https://evil.example/tools', navigate);
    handleOpenUrl('not a url', navigate);
    expect(navigate).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('external links', () => {
  const navigate = vi.fn();

  function clickLink(href: string, attrs = '') {
    document.body.innerHTML = `<a href="${href}" ${attrs}>link</a>`;
    const e = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    Object.defineProperty(e, 'target', { value: document.querySelector('a') });
    onDocumentClick(e, navigate);
    return e;
  }

  beforeEach(() => navigate.mockReset());

  it('opens other sites in an in-app Custom Tab', () => {
    const e = clickLink('https://www.rbi.org.in/');
    expect(e.defaultPrevented).toBe(true);
    expect(browser.open).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://www.rbi.org.in/' }));
  });

  it('routes finatrix.co links to the app’s own screens', () => {
    const e = clickLink('https://finatrix.co/learn/budgeting');
    expect(e.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/learn/budgeting');
    expect(browser.open).not.toHaveBeenCalled();
  });

  it('treats www.finatrix.co the same as the apex', () => {
    clickLink('https://www.finatrix.co/tools/goals');
    expect(navigate).toHaveBeenCalledWith('/tools/goals');
    expect(browser.open).not.toHaveBeenCalled();
  });

  it('leaves in-app links, mailto: and downloads to their normal handling', () => {
    expect(clickLink('/tools/budget').defaultPrevented).toBe(false);
    expect(clickLink('mailto:finatrix.hub@gmail.com').defaultPrevented).toBe(false);
    expect(clickLink('https://example.com/file.pdf', 'download').defaultPrevented).toBe(false);
    expect(browser.open).not.toHaveBeenCalled();
  });
});

describe('launch URL', () => {
  afterEach(() => sessionStorage.clear());

  /**
   * getLaunchUrl() answers with the activity's starting intent on every page
   * load. An OAuth return that cold-started the app is handled by reloading the
   * page — without a once-per-session claim it would reload forever.
   */
  it('is handled once per WebView session, surviving the reloads it causes', () => {
    expect(claimLaunchUrl()).toBe(true);
    expect(claimLaunchUrl()).toBe(false);
    expect(claimLaunchUrl()).toBe(false);
  });

  it('fails closed (no replay) when storage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(claimLaunchUrl()).toBe(false);
    spy.mockRestore();
  });
});

describe('sign-in tab', () => {
  it('resolves only once the Custom Tab has closed, then stops listening', async () => {
    let settled = false;
    const done = openAuthBrowser('https://example.supabase.co/auth/v1/authorize?provider=google').then(() => { settled = true; });
    await vi.waitFor(() => expect(browser.open).toHaveBeenCalled());
    await Promise.resolve();
    expect(settled).toBe(false);
    browserListeners.get('browserFinished')?.();
    await done;
    expect(settled).toBe(true);
    await vi.waitFor(() => expect(browserListeners.has('browserFinished')).toBe(false));
  });

  it('rejects (so the form can report it) when the tab cannot open', async () => {
    browser.open.mockRejectedValueOnce(new Error('no browser'));
    await expect(openAuthBrowser('https://example.test/')).rejects.toThrow('no browser');
    await vi.waitFor(() => expect(browserListeners.has('browserFinished')).toBe(false));
  });

  it('reports a listener registration failure instead of opening a sign-in that cannot finish', async () => {
    browser.addListener.mockRejectedValueOnce(new Error('listener unavailable'));
    await expect(openAuthBrowser('https://example.test/')).rejects.toThrow('listener unavailable');
    expect(browser.open).not.toHaveBeenCalled();
  });
});

describe('system font size', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.classList.remove('fx-text-lg');
    document.documentElement.style.removeProperty('--fx-text-zoom');
  });

  /** WebView text zoom shows up only in computed font sizes — simulate it. */
  function zoomTo(factor: number) {
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
      const style = real(el);
      const declared = parseFloat((el as HTMLElement).style?.fontSize || '');
      if (!declared) return style;
      return { ...style, fontSize: `${declared * factor}px` } as CSSStyleDeclaration;
    });
  }

  it.each([
    [1, false],
    [1.15, false],
    [1.3, true],
    [2, true],
  ])('at %sx text zoom, large-text layout is %s', (factor, large) => {
    zoomTo(factor);
    expect(syncTextZoom()).toBeCloseTo(factor);
    expect(document.documentElement.classList.contains('fx-text-lg')).toBe(large);
    expect(document.documentElement.style.getPropertyValue('--fx-text-zoom')).toBe(String(factor));
  });

  it('leaves no probe element behind', () => {
    const before = document.body.childElementCount;
    syncTextZoom();
    expect(document.body.childElementCount).toBe(before);
  });

  /**
   * WKWebView has no text zoom, so the probe measures exactly what was declared
   * and this must resolve to "no scaling" rather than to a guess. The compensating
   * CSS divides declared sizes by --fx-text-zoom, so a value above 1 with no
   * engine-side scaling behind it would SHRINK the tab bar labels on iOS.
   */
  it('is inert on iOS, where nothing scales the text in the first place', () => {
    asApp(true, 'ios');
    expect(syncTextZoom()).toBe(1);
    expect(document.documentElement.classList.contains('fx-text-lg')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--fx-text-zoom')).toBe('1');
  });
});

describe('platform-specific native wiring', () => {
  const navigate = vi.fn();

  beforeEach(() => navigate.mockReset());

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  /** Start the bridge as one of the apps and hand back its disposer. */
  const start = (platform: 'android' | 'ios') => {
    asApp(true, platform);
    return startNativeBridge({ navigate });
  };

  /**
   * Let the bridge's promise chains settle.
   *
   * The window colour is applied only after `SystemBars.setStyle` resolves —
   * deliberately, because on Android setStyle resets the window background — so
   * a synchronous assertion would test the ordering rather than the outcome.
   */
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('does not navigate after a disposed bridge receives its pending launch URL', async () => {
    let finishLaunch!: (value: { url: string }) => void;
    app.getLaunchUrl.mockImplementationOnce(() => new Promise((resolve) => { finishLaunch = resolve; }));
    const dispose = start('ios');
    dispose();
    finishLaunch({ url: 'https://finatrix.co/tools/goals' });
    await settle();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('handles a retained cold-start event and launch URL only once', async () => {
    let finishLaunch!: (value: { url: string }) => void;
    app.getLaunchUrl.mockImplementationOnce(() => new Promise((resolve) => { finishLaunch = resolve; }));
    const dispose = start('ios');
    const url = 'https://finatrix.co/tools/goals';
    appListeners.get('appUrlOpen')?.({ url });
    finishLaunch({ url });
    await settle();
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/tools/goals');
    dispose();
  });

  it('keeps a newer warm link when an older launch URL resolves afterward', async () => {
    let finishLaunch!: (value: { url: string }) => void;
    app.getLaunchUrl.mockImplementationOnce(() => new Promise((resolve) => { finishLaunch = resolve; }));
    const dispose = start('android');
    appListeners.get('appUrlOpen')?.({ url: 'https://finatrix.co/tools/goals' });
    finishLaunch({ url: 'https://finatrix.co/tools/budget' });
    await settle();
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/tools/goals');
    dispose();
  });

  it('does not replay a warm sign-in return after the page it reloaded starts a new bridge', async () => {
    // iOS: getLaunchUrl() reports the LAST url the app was opened with. The
    // first bridge handles the warm link; the bridge of the reloaded page must
    // not read it back and reload again with the already-spent code.
    const url = 'https://finatrix.co/tools/goals';
    const first = start('ios');
    appListeners.get('appUrlOpen')?.({ url });
    await settle();
    first();
    navigate.mockClear();
    app.getLaunchUrl.mockImplementationOnce(async () => ({ url }));
    const second = start('ios');
    await settle();
    expect(navigate).not.toHaveBeenCalled();
    second();
  });

  it('clears keyboard visibility when the bridge is disposed', () => {
    const dispose = start('ios');
    keyboardListeners.get('keyboardWillShow')?.();
    expect(document.documentElement.classList.contains('fx-kb-open')).toBe(true);
    dispose();
    expect(document.documentElement.classList.contains('fx-kb-open')).toBe(false);
  });

  it('subscribes to the hardware BACK button on Android only', () => {
    const disposeAndroid = start('android');
    const events = () => app.addListener.mock.calls.map((c: unknown[]) => c[0]);
    expect(events()).toContain('backButton');
    disposeAndroid();

    vi.clearAllMocks();
    const disposeIos = start('ios');
    // iOS has no BACK event. The edge-swipe is WKWebView's own
    // (allowsBackForwardNavigationGestures), walking the same history entries.
    expect(events()).not.toContain('backButton');
    // Deep links still have to arrive — that listener is not platform-specific.
    expect(events()).toContain('appUrlOpen');
    disposeIos();
  });

  it.each([
    ['light', 'LIGHT'],
    ['dark', 'DARK'],
  ])('styles the iOS keyboard to match the in-app %s theme', (theme, style) => {
    // Someone using the app in dark mode on a light-mode phone would otherwise
    // get a white keyboard under a charcoal form: the iOS keyboard follows the
    // SYSTEM appearance unless told otherwise.
    document.documentElement.setAttribute('data-theme', theme);
    const dispose = start('ios');
    expect(keyboard.setStyle).toHaveBeenCalledWith({ style });
    dispose();
  });

  it('never restyles the Android keyboard — it is the user’s own IME', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    const dispose = start('android');
    expect(keyboard.setStyle).not.toHaveBeenCalled();
    dispose();
  });

  it.each([
    ['android', 'dark', '#060607'],
    ['ios', 'light', '#F4F2EC'],
  ])('paints the %s window behind the web view in the in-app surface colour', async (platform, theme, colour) => {
    document.documentElement.setAttribute('data-theme', theme);
    const dispose = start(platform as 'android' | 'ios');
    await settle();
    expect(fxSystemUi.setBackgroundColor).toHaveBeenCalledWith({ color: colour });
    dispose();
  });

  it('presents the in-app browser full screen, never as a source-less popover', async () => {
    // `popover` needs a source view UIKit is never given here; it only survives
    // an iPhone because a compact width adapts it back to full screen.
    await openInAppBrowser('https://www.rbi.org.in/');
    expect(browser.open).toHaveBeenCalledWith(
      expect.objectContaining({ presentationStyle: 'fullscreen' }),
    );
  });
});
