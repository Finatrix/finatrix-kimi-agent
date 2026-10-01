/**
 * /.well-known/assetlinks.json — Android App Links verification.
 *
 * Verification fails silently (links just open in the browser), so the exact
 * shape, content type and the no-redirect rule are pinned here.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import worker from '../../worker/index';
import { ANDROID_PACKAGE, buildAssetLinks, parseFingerprints } from '../shared/assetLinks';
import { APP_ID } from '../native/platform';

const FP = Array.from({ length: 32 }, (_, i) => (i + 16).toString(16).toUpperCase().padStart(2, '0')).join(':');

const env = (fingerprints?: string) => ({
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) },
  ANDROID_CERT_SHA256: fingerprints,
});

describe('fingerprint parsing', () => {
  it('accepts well-formed SHA-256 fingerprints, normalising case and dupes', () => {
    expect(parseFingerprints(`${FP.toLowerCase()}, ${FP}`)).toEqual([FP]);
  });

  it('drops anything malformed rather than publishing it', () => {
    expect(parseFingerprints('AB:CD, not-a-fingerprint, ')).toEqual([]);
    expect(parseFingerprints(undefined)).toEqual([]);
  });
});

describe('statement', () => {
  it('names the app package the APK is built with', () => {
    expect(ANDROID_PACKAGE).toBe(APP_ID);
    expect(buildAssetLinks([FP])).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: 'co.finatrix.app', sha256_cert_fingerprints: [FP] },
      },
    ]);
  });

  it('publishes nothing until a fingerprint is configured', () => {
    expect(buildAssetLinks([])).toBeNull();
  });
});

describe('edge Worker', () => {
  const get = (host: string, fingerprints?: string) =>
    worker.fetch(new Request(`https://${host}/.well-known/assetlinks.json`), env(fingerprints) as never);

  it('serves JSON on the apex', async () => {
    const res = await get('finatrix.co', FP);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(await res.json()).toEqual(buildAssetLinks([FP]));
  });

  it('serves it on www too, WITHOUT the canonical redirect — Android never follows one', async () => {
    const res = await get('www.finatrix.co', FP);
    expect(res.status).toBe(200);
  });

  it('404s when unconfigured instead of serving the SPA shell', async () => {
    const res = await get('finatrix.co');
    expect(res.status).toBe(404);
  });
});

describe('production configuration', () => {
  /**
   * The fingerprints ship as a Worker var in wrangler.jsonc. parseFingerprints
   * drops a malformed entry rather than publishing it — correct at runtime, but
   * it means a typo there would quietly empty the file and turn App Links off
   * with no error anywhere. Fail the build instead.
   */
  it('wrangler.jsonc configures at least one well-formed fingerprint, and nothing malformed', () => {
    const raw = readFileSync(resolve(__dirname, '../../wrangler.jsonc'), 'utf8');
    const match = raw.match(/"ANDROID_CERT_SHA256"\s*:\s*"([^"]*)"/);
    expect(match, 'ANDROID_CERT_SHA256 var').not.toBeNull();
    const entries = match![1].split(',').map((s) => s.trim()).filter(Boolean);
    expect(entries.length).toBeGreaterThan(0);
    expect(parseFingerprints(match![1])).toHaveLength(entries.length);
  });
});
