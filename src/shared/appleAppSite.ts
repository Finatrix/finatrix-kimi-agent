/**
 * The Apple App Site Association file for the FinatriX iOS app.
 *
 * `https://finatrix.co/.well-known/apple-app-site-association` is how iOS
 * verifies that the app may open finatrix.co links directly (Universal Links,
 * declared by the `com.apple.developer.associated-domains` entitlement in
 * ios/App/App/App.entitlements).
 *
 * This is the iOS twin of `assetLinks.ts`, and it exists for the same reason:
 * verification is all-or-nothing and silent. A wrong content type, a redirect, a
 * missing Team ID prefix — and links simply open in Safari, with no error
 * anywhere on the device or the server. Apple makes it worse than Android does
 * in two ways worth knowing before debugging one:
 *
 *  1. iOS fetches this file through Apple's CDN, not from the device, so a fix
 *     is not visible immediately and cannot be observed in a proxy.
 *  2. The file is fetched at INSTALL time. An app installed before the file was
 *     correct keeps the old answer until it is reinstalled (or the device is
 *     put in `developmentAssociatedDomains` mode).
 *
 * So the edge Worker builds it from this one function and `appleAppSite.test.ts`
 * pins its shape, including the parity with Android's intent filter — two deep
 * link surfaces that disagree about which URLs belong to the app would be a bug
 * nobody would find from either platform alone.
 */

/** Must equal `appId` in capacitor.config.ts and `PRODUCT_BUNDLE_IDENTIFIER` in Xcode. */
export const IOS_BUNDLE_ID = 'co.finatrix.app';

/**
 * A ten-character Apple Developer Team ID, e.g. `A1B2C3D4E5`.
 *
 * Apple writes it as the "App ID Prefix". It is not a secret — it is printed in
 * every app's receipt — but it is account-specific, so it is configuration
 * rather than code: the Worker reads it from `APPLE_APP_ID_PREFIX`.
 */
const TEAM_ID = /^[A-Z0-9]{10}$/;

/**
 * The URL patterns the app claims, in Apple's `components` form.
 *
 * MUST stay in step with the `autoVerify` intent filter in
 * android/app/src/main/AndroidManifest.xml. Both lists answer the same product
 * question — "which FinatriX URLs are app screens?" — and the answer is: the
 * product, not the marketing site. A link to `/pricing` or `/about` is for
 * someone deciding whether to install; sending it into the app of someone who
 * already has would be a worse experience than Safari, and on iOS `/pricing`
 * is not even reachable in the app (App Review 3.1.1, see `isPurchasePage`).
 *
 * `/careers/*` is deliberately absent while Careers is unlaunched: the apps
 * contain no Careers screens yet (`src/lib/careersEntry.ts`), so a Careers link
 * belongs to the website. Restore it here and in the Android filter together.
 *
 * `/.well-known/*` is excluded first and explicitly. Without it a Universal
 * Link could route this very file into the app, and any future `/.well-known`
 * resource — a `security.txt`, an OAuth discovery document — with it.
 */
export const IOS_LINK_COMPONENTS: ReadonlyArray<Readonly<Record<string, unknown>>> = [
  { '/': '/.well-known/*', exclude: true, comment: 'Site verification files belong to the site, never the app' },
  { '/': '/tools/*', comment: 'The money tools' },
  { '/': '/tools', comment: 'The tools index' },
  { '/': '/learn/*', comment: 'Guides and articles' },
  { '/': '/login', comment: 'Sign in, and the OAuth/error return leg' },
  { '/': '/signup', comment: 'Create an account' },
  { '/': '/reset-password', comment: 'Password reset link from email' },
  { '/': '/profile', comment: 'Account and privacy controls' },
  { '/': '/welcome', comment: 'Email confirmation landing' },
];

export interface AppleAppSiteAssociation {
  applinks: {
    details: Array<{ appIDs: string[]; components: ReadonlyArray<Readonly<Record<string, unknown>>> }>;
  };
  webcredentials: { apps: string[] };
}

/**
 * The association file, or `null` when no valid Team ID is configured.
 *
 * Returning null — and the Worker answering 404 — is deliberate. A file that
 * parses but names the wrong app is indistinguishable from a working one until
 * a real device fails to open a real link; a 404 is a state somebody can see.
 *
 * `webcredentials` is included because it costs one line and earns Password
 * AutoFill: iOS then offers the finatrix.co password saved in the user's
 * keychain when they sign in inside the app, which is both less typing and one
 * less reason to choose a weak, memorable password. It needs the matching
 * `webcredentials:` entry in the entitlement to take effect.
 */
export function buildAppleAppSiteAssociation(teamId: string | undefined | null): AppleAppSiteAssociation | null {
  const prefix = (teamId ?? '').trim().toUpperCase();
  if (!TEAM_ID.test(prefix)) return null;
  const appID = `${prefix}.${IOS_BUNDLE_ID}`;
  return {
    applinks: {
      details: [{ appIDs: [appID], components: IOS_LINK_COMPONENTS }],
    },
    webcredentials: { apps: [appID] },
  };
}
