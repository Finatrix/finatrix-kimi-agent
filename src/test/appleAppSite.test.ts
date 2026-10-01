/**
 * /.well-known/apple-app-site-association — iOS Universal Links verification.
 *
 * Like its Android twin (`assetLinks.test.ts`) this fails silently: a wrong
 * content type or a redirect just means finatrix.co links open in Safari. iOS
 * also caches the answer in Apple's CDN and reads it when the app is INSTALLED,
 * so a mistake survives the deploy that fixes it — which is why the shape is
 * pinned here rather than checked by hand against a device.
 *
 * The parity test at the bottom is the one that earns its keep: two deep-link
 * surfaces that disagree about which URLs belong to the app is a bug that is
 * invisible from either platform on its own.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import worker from '../../worker/index';
import {
  IOS_BUNDLE_ID,
  IOS_LINK_COMPONENTS,
  buildAppleAppSiteAssociation,
} from '../shared/appleAppSite';
import { APP_ID } from '../native/platform';

const TEAM = 'A1B2C3D4E5';

const env = (prefix?: string) => ({
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) },
  APPLE_APP_ID_PREFIX: prefix,
});

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

describe('association file', () => {
  it('names the bundle the Xcode target builds, prefixed with the Team ID', () => {
    expect(IOS_BUNDLE_ID).toBe(APP_ID);
    const aasa = buildAppleAppSiteAssociation(TEAM)!;
    expect(aasa.applinks.details).toEqual([
      { appIDs: [`${TEAM}.co.finatrix.app`], components: IOS_LINK_COMPONENTS },
    ]);
    // Password AutoFill for the same app — needs the webcredentials entitlement.
    expect(aasa.webcredentials.apps).toEqual([`${TEAM}.co.finatrix.app`]);
  });

  it('normalises a lower-case Team ID rather than publishing a broken one', () => {
    expect(buildAppleAppSiteAssociation(` ${TEAM.toLowerCase()} `)).toEqual(
      buildAppleAppSiteAssociation(TEAM),
    );
  });

  it('publishes nothing until a well-formed Team ID is configured', () => {
    for (const bad of [undefined, null, '', '   ', 'SHORT', 'TOOLONGTEAMID', 'A1B2-C3D4E', 'a1b2c3d4e_']) {
      expect(buildAppleAppSiteAssociation(bad), String(bad)).toBeNull();
    }
  });

  it('excludes /.well-known/* first, so a link can never route this file into the app', () => {
    const first = IOS_LINK_COMPONENTS[0];
    expect(first['/']).toBe('/.well-known/*');
    expect(first.exclude).toBe(true);
  });
});

describe('edge Worker', () => {
  const get = (host: string, prefix?: string) =>
    worker.fetch(
      new Request(`https://${host}/.well-known/apple-app-site-association`),
      env(prefix) as never,
    );

  it('serves JSON on the apex', async () => {
    const res = await get('finatrix.co', TEAM);
    expect(res.status).toBe(200);
    // Apple rejects anything but application/json — including a charset suffix.
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(await res.json()).toEqual(buildAppleAppSiteAssociation(TEAM));
  });

  it('serves it on www too, WITHOUT the canonical redirect — iOS never follows one', async () => {
    const res = await get('www.finatrix.co', TEAM);
    expect(res.status).toBe(200);
    expect(res.headers.get('Location')).toBeNull();
    expect(await res.json()).toEqual(buildAppleAppSiteAssociation(TEAM));
  });

  it('404s when unconfigured instead of serving the SPA shell', async () => {
    const res = await get('finatrix.co');
    expect(res.status).toBe(404);
  });

  it('still serves the Android file — one route must not have replaced the other', async () => {
    const res = await worker.fetch(
      new Request('https://finatrix.co/.well-known/assetlinks.json'),
      { ...env(TEAM), ANDROID_CERT_SHA256: Array.from({ length: 32 }, () => 'AB').join(':') } as never,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });
});

describe('parity with the Android intent filter', () => {
  /**
   * Both platforms answer the same product question, so they must claim the same
   * URLs. Read from the manifest rather than restated, so adding a path on one
   * platform and forgetting the other fails here instead of shipping an app that
   * opens a link its sibling ignores.
   */
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  const attr = (name: string) =>
    [...manifest.matchAll(new RegExp(`android:${name}="([^"]+)"`, 'g'))].map((m) => m[1]);

  const claimed = IOS_LINK_COMPONENTS.filter((c) => !c.exclude).map((c) => String(c['/']));

  it('claims every pathPrefix the Android app does', () => {
    for (const prefix of attr('pathPrefix')) {
      // Android's `pathPrefix="/tools"` matches /tools and /tools/... ; Apple's
      // `*` does not match an empty remainder, hence the explicit pair.
      const wildcard = `${prefix.replace(/\/$/, '')}/*`;
      expect(claimed, `pathPrefix ${prefix}`).toContain(wildcard);
    }
  });

  it('claims every exact path the Android app does', () => {
    for (const path of attr('path')) {
      expect(claimed, `path ${path}`).toContain(path);
    }
  });

  it('claims nothing the Android app does not', () => {
    const androidPrefixes = attr('pathPrefix').map((p) => p.replace(/\/$/, ''));
    const androidPaths = new Set(attr('path'));
    for (const component of claimed) {
      const covered = androidPaths.has(component)
        || androidPrefixes.some((p) => component === `${p}/*` || component === p);
      expect(covered, `iOS claims ${component}, Android does not`).toBe(true);
    }
  });

  it('claims no marketing or purchase page on either platform', () => {
    // App Review 3.1.1 and Play Billing: the apps do not show these at all, so
    // routing a link to one into the app would land on a redirect.
    for (const page of ['/pricing', '/about', '/']) {
      expect(claimed).not.toContain(page);
      expect(manifest).not.toContain(`android:path="${page}"`);
    }
  });
});

describe('production configuration', () => {
  /**
   * The Team ID ships as a Worker var. `buildAppleAppSiteAssociation` returns
   * null for a malformed one rather than publishing it — right at runtime, but
   * it means a typo silently turns Universal Links off. If the var is present it
   * must be usable; it is allowed to be absent/empty while the Apple Developer
   * account is still being set up (see docs/IOS.md).
   */
  it('wrangler.jsonc either omits APPLE_APP_ID_PREFIX or sets a well-formed one', () => {
    const match = read('wrangler.jsonc').match(/"APPLE_APP_ID_PREFIX"\s*:\s*"([^"]*)"/);
    if (!match || match[1].trim() === '') return;
    expect(buildAppleAppSiteAssociation(match[1])).not.toBeNull();
  });

  it('the entitlement claims exactly the hosts the Worker answers on', () => {
    const entitlements = read('ios/App/App/App.entitlements');
    for (const host of ['finatrix.co', 'www.finatrix.co']) {
      expect(entitlements).toContain(`applinks:${host}`);
      expect(entitlements).toContain(`webcredentials:${host}`);
    }
  });
});

describe('Careers deep links before launch', () => {
  it('neither app claims /careers while the apps contain no Careers screens', async () => {
    const { CAREERS_AVAILABLE } = await import('../shared/careersAvailability');
    if (CAREERS_AVAILABLE) return; // Launched: claiming it again is a product decision, not a regression.
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    expect(manifest).not.toMatch(/android:path(Prefix)?="\/careers/);
    expect(IOS_LINK_COMPONENTS.map((c) => String(c['/']))).not.toContain('/careers/*');
  });
});
