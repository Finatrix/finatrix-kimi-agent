/**
 * Digital Asset Links for the FinatriX Android app.
 *
 * `https://finatrix.co/.well-known/assetlinks.json` is how Android verifies
 * that the app may open finatrix.co links directly (App Links, declared with
 * `autoVerify` in android/app/src/main/AndroidManifest.xml). Verification is
 * all-or-nothing and silent: a wrong content type, a redirect, a fingerprint
 * with the wrong shape — and links simply open in the browser, with no error
 * anywhere. So the edge Worker builds the file from this one function, and
 * `assetLinks.test.ts` pins its shape.
 *
 * The fingerprints are the SHA-256 of the certificates that sign the APKs on
 * users' devices. With Play App Signing that is Google's app-signing key
 * (Play Console → Test and release → App integrity), not the upload key.
 * They are configuration, not code: the Worker reads them from the
 * `ANDROID_CERT_SHA256` variable (comma-separated), so rotating or adding one
 * — e.g. a debug key for local testing — needs no code change.
 */

/** Must equal `appId` in capacitor.config.ts and `applicationId` in Gradle. */
export const ANDROID_PACKAGE = 'co.finatrix.app';

/** `AB:CD:…` — 32 colon-separated upper-case hex pairs. */
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/**
 * Parse the configured fingerprints, normalising case and dropping anything
 * that is not a well-formed SHA-256 fingerprint rather than publishing it.
 */
export function parseFingerprints(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => FINGERPRINT.test(s)),
    ),
  ];
}

export interface AssetLinkStatement {
  relation: string[];
  target: { namespace: 'android_app'; package_name: string; sha256_cert_fingerprints: string[] };
}

/** The statement list, or null when no valid fingerprint is configured. */
export function buildAssetLinks(fingerprints: string[]): AssetLinkStatement[] | null {
  if (!fingerprints.length) return null;
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: ANDROID_PACKAGE,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}
