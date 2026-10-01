/**
 * Where this bundle is running: a browser tab, the FinatriX Android app, or the
 * FinatriX iOS app.
 *
 * The same `dist/` ships to all three. Each app (Capacitor, see
 * `capacitor.config.ts`) loads it from the installed bundle — Android at
 * `https://localhost`, iOS at `capacitor://localhost` — and the native bridge
 * defines `window.Capacitor` before any page script runs, so the answer is
 * known synchronously at boot, with nothing imported.
 *
 * This file must stay dependency-free: it is in the main bundle of the
 * website, where every byte is paid for by people who will never install the
 * app. Everything that actually talks to native code lives in `./bridge.ts`,
 * which is a lazy chunk only the app ever fetches.
 */

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

function capacitor(): CapacitorGlobal | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** True inside an installed FinatriX app (Android or iOS), false in every browser. */
export function isNativeApp(): boolean {
  try {
    return capacitor()?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/** The two native platforms FinatriX ships an app for. */
export type NativePlatform = 'android' | 'ios';

/**
 * Which app this is, or `null` in a browser.
 *
 * Needed because a handful of behaviours genuinely differ between the two
 * stores and the two WebViews — not as a general-purpose escape hatch. Reach
 * for `isNativeApp()` first; the platform matters only where the platform
 * itself does:
 *
 *  - `lib/ocr.ts`   Android's build tools decompress `.gz` assets while
 *                   packaging; Xcode copies them verbatim. The two apps
 *                   therefore contain language files under different names.
 *  - `native/bridge.ts`  BACK, app minimising and WebView text zoom exist only
 *                   on Android; keyboard appearance only on iOS.
 *
 * Anything else belonging to one platform should be a capability check, not a
 * platform check, so a third platform never needs a third branch.
 */
export function nativePlatform(): NativePlatform | null {
  if (!isNativeApp()) return null;
  try {
    return capacitor()?.getPlatform?.() === 'ios' ? 'ios' : 'android';
  } catch {
    return 'android';
  }
}

/** True inside the installed iOS app. */
export function isIosApp(): boolean {
  return nativePlatform() === 'ios';
}

/** True inside the installed Android app. */
export function isAndroidApp(): boolean {
  return nativePlatform() === 'android';
}

/**
 * Application id / bundle identifier — identical on both stores, and also the
 * custom URL scheme OAuth returns on. Declared in `capacitor.config.ts`
 * (`appId`), Android's `applicationId`, and iOS's `PRODUCT_BUNDLE_IDENTIFIER`
 * plus `CFBundleURLTypes`.
 */
export const APP_ID = 'co.finatrix.app';

/**
 * Where a provider sends the user back after an OAuth sign-in in the app.
 *
 * Google refuses to run its sign-in page inside an embedded WebView, so the app
 * opens it in the system browser — a Chrome Custom Tab on Android, an
 * `SFSafariViewController` on iOS — and that has to hand the result back to the
 * app, which only a URL the app owns can do. Supabase must list
 * `co.finatrix.app://**` under Auth → URL Configuration → Redirect URLs. Both
 * platforms claim the scheme: Android through an intent filter, iOS through
 * `CFBundleURLTypes` in `ios/App/App/Info.plist`.
 */
export const NATIVE_AUTH_CALLBACK = `${APP_ID}://auth/callback`;

/** The public website. Also the host App Links / Universal Links are verified for. */
export const PUBLIC_ORIGIN = 'https://finatrix.co';

/**
 * The origin to put in links that leave the device — email confirmation,
 * password reset.
 *
 * In a browser that is the page's own origin, exactly as before. In the app,
 * the page's origin is a device-local one (`https://localhost` on Android,
 * `capacitor://localhost` on iOS), which means nothing on any other device and
 * nothing in an email client, so those links point at the public site instead. The app's verified deep links route them back into the app when
 * it is installed — Android App Links (`/.well-known/assetlinks.json`), iOS
 * Universal Links (`/.well-known/apple-app-site-association`) — and when it is
 * not, the website completes the same flow.
 */
export function publicLinkOrigin(): string {
  if (isNativeApp()) return PUBLIC_ORIGIN;
  return typeof window !== 'undefined' ? window.location.origin : PUBLIC_ORIGIN;
}

/**
 * Whether the platform's store rules allow selling digital goods through the
 * web checkout.
 *
 * Both stores say no. Google Play requires Play Billing for digital goods
 * bought in an Android app; Apple's App Review Guideline 3.1.1 requires in-app
 * purchase and forbids "buttons, external links, or other calls to action that
 * direct customers to purchasing mechanisms other than in-app purchase".
 * FinatriX Pro is sold through Stripe, so neither app offers the purchase at
 * all; people who already have Pro keep full access, which both stores permit.
 * Gate every purchase control on this, never on `isNativeApp()` directly, so
 * adding Play Billing or StoreKit later is a change in one place.
 */
export function canPurchaseInApp(): boolean {
  return !isNativeApp();
}

/**
 * Pages that exist to sell — price tables and purchase calls to action.
 *
 * App.tsx already swaps these routes for the member-facing screen in the app;
 * this is for the links that point at them, so the app does not advertise a
 * "Pricing" card that leads somewhere else. Pair with `canPurchaseInApp()`.
 */
export function isPurchasePage(path: string): boolean {
  return path === '/pricing' || path === '/careers' || path === '/careers/features'
    || path === '/careers/compare' || path.startsWith('/careers/compare/');
}

/**
 * Mark the document so CSS can adapt the chrome (`html.fx-native`). Called once
 * at boot, before the first render, so there is no flash of web-only UI.
 */
export function markPlatform(): void {
  if (typeof document === 'undefined' || !isNativeApp()) return;
  document.documentElement.classList.add('fx-native');
}
