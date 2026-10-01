import { describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  appleClientSecret,
  appleConfig,
  appleSubjectForRefreshToken,
  appleSubjectOf,
  decryptToken,
  encryptToken,
  plausibleAppleToken,
  revokeAppleToken,
  type AppleConfig,
} from '../../supabase/functions/_shared/appleSignIn';

/**
 * The server half of Sign in with Apple revocation (App Review 5.1.1(v)). The
 * whole-function run is supabase/functions/_e2e/apple-revocation.ts; these pin
 * the pieces a mistake in would be silent: a client_secret Apple would reject,
 * a token stored readable, an id_token subject read from the wrong place.
 */

const fromB64 = (s: string) => Buffer.from(s, 'base64url');

async function makeConfig(): Promise<{ cfg: AppleConfig; publicKey: CryptoKey }> {
  const kp = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const der = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', kp.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${der.toString('base64')}\n-----END PRIVATE KEY-----`;
  return {
    cfg: {
      teamId: 'TEAM123456', keyId: 'KEY1234567', clientId: 'co.finatrix.signin', privateKeyPem: pem,
      encryptionKey: Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('base64'),
    },
    publicKey: kp.publicKey as CryptoKey,
  };
}

describe('appleClientSecret', () => {
  it('is an ES256 JWT, signed by the .p8 key, with the claims Apple checks', async () => {
    const { cfg, publicKey } = await makeConfig();
    const jwt = await appleClientSecret(cfg, 1_800_000_000);
    const [h, p, sig] = jwt.split('.');
    expect(JSON.parse(fromB64(h).toString())).toEqual({ alg: 'ES256', kid: 'KEY1234567', typ: 'JWT' });
    expect(JSON.parse(fromB64(p).toString())).toEqual({
      iss: 'TEAM123456', iat: 1_800_000_000, exp: 1_800_000_300, aud: 'https://appleid.apple.com', sub: 'co.finatrix.signin',
    });
    const ok = await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, fromB64(sig), new TextEncoder().encode(`${h}.${p}`));
    expect(ok).toBe(true);
  });
});

describe('token encryption at rest', () => {
  it('round-trips, never stores the plaintext, and uses a fresh IV each time', async () => {
    const { cfg } = await makeConfig();
    const a = await encryptToken('r.apple-refresh-token', cfg.encryptionKey);
    const b = await encryptToken('r.apple-refresh-token', cfg.encryptionKey);
    expect(a).not.toContain('apple-refresh-token');
    expect(a).not.toBe(b);
    expect(await decryptToken(a, cfg.encryptionKey)).toBe('r.apple-refresh-token');
  });

  it('fails closed under the wrong key', async () => {
    const { cfg } = await makeConfig();
    const other = Buffer.alloc(32, 7).toString('base64');
    await expect(decryptToken(await encryptToken('x'.repeat(20), cfg.encryptionKey), other)).rejects.toThrow();
  });
});

describe('talking to Apple', () => {
  it('reads the token owner from the id_token Apple returns for a refresh grant', async () => {
    const { cfg } = await makeConfig();
    const idToken = `e30.${Buffer.from(JSON.stringify({ sub: 'apple-sub-9' })).toString('base64url')}.sig`;
    const fetchImpl = vi.fn(async () => Response.json({ id_token: idToken }));
    expect(await appleSubjectForRefreshToken(cfg, 'r'.repeat(20), fetchImpl as unknown as typeof fetch)).toBe('apple-sub-9');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://appleid.apple.com/auth/token');
    const form = new URLSearchParams(String(init.body));
    expect(form.get('grant_type')).toBe('refresh_token');
    expect(form.get('client_id')).toBe('co.finatrix.signin');
  });

  it('treats a refused grant as no owner', async () => {
    const { cfg } = await makeConfig();
    const fetchImpl = vi.fn(async () => Response.json({ error: 'invalid_grant' }, { status: 400 }));
    expect(await appleSubjectForRefreshToken(cfg, 'r'.repeat(20), fetchImpl as unknown as typeof fetch)).toBeNull();
  });

  it('revokes with the refresh-token hint and reports Apple’s answer without throwing', async () => {
    const { cfg } = await makeConfig();
    const okFetch = vi.fn(async () => new Response('', { status: 200 }));
    expect(await revokeAppleToken(cfg, 'tok', okFetch as unknown as typeof fetch)).toBe(true);
    const form = new URLSearchParams(String((okFetch.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(form.get('token_type_hint')).toBe('refresh_token');
    expect(form.get('token')).toBe('tok');
    expect(await revokeAppleToken(cfg, 'tok', vi.fn(async () => { throw new Error('down'); }) as unknown as typeof fetch)).toBe(false);
  });
});

describe('inputs', () => {
  it('accepts plausible Apple tokens only', () => {
    expect(plausibleAppleToken('r1a2b3c4d5e6f7a8.0.rxyz')).toBe(true);
    for (const bad of ['', 'short', 'has spaces in it here', 'x'.repeat(2049), 42, null]) expect(plausibleAppleToken(bad)).toBe(false);
  });

  it('finds the Apple subject in the Supabase identity, and nothing for other providers', () => {
    expect(appleSubjectOf({ identities: [{ provider: 'google', id: 'g' }, { provider: 'apple', id: 'x', identity_data: { sub: 'apple-sub' } }] })).toBe('apple-sub');
    expect(appleSubjectOf({ identities: [{ provider: 'google', id: 'g' }] })).toBeNull();
    expect(appleSubjectOf({ identities: null })).toBeNull();
  });

  it('is off unless every secret is present, and repairs escaped newlines in the key', () => {
    const env: Record<string, string> = {
      APPLE_SIWA_TEAM_ID: 'T', APPLE_SIWA_KEY_ID: 'K', APPLE_SIWA_CLIENT_ID: 'C',
      APPLE_SIWA_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----', APPLE_TOKEN_ENC_KEY: 'E',
    };
    expect(appleConfig((n) => env[n])?.privateKeyPem).toBe('-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----');
    delete env.APPLE_SIWA_KEY_ID;
    expect(appleConfig((n) => env[n])).toBeNull();
  });
});
