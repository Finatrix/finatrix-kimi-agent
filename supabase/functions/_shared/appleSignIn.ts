// Sign in with Apple — the server half FinatriX needs for account deletion.
//
// App Review Guideline 5.1.1(v): an app that offers Sign in with Apple must,
// when someone deletes their account, revoke the Apple tokens it holds through
// Apple's REST API (`/auth/revoke`), so FinatriX disappears from their "Apps
// using Apple ID" list. Supabase Auth does not do this, and does not keep the
// provider's tokens either — they reach the client once, at sign-in, and are
// gone from the session at its first refresh. So:
//
//  1. After an Apple sign-in, the client hands the Apple refresh token to the
//     `apple-token` function, which proves with Apple that the token is real and
//     belongs to this user, then stores it encrypted (`apple_auth_tokens`).
//  2. `account-delete` decrypts it and revokes it before deleting the user.
//
// Everything secret lives in edge-function secrets and never in the app:
//   APPLE_SIWA_TEAM_ID       10-character Team ID
//   APPLE_SIWA_KEY_ID        Key ID of the Sign in with Apple key
//   APPLE_SIWA_CLIENT_ID     the Services ID Supabase's Apple provider uses
//                            (tokens are issued to it, so they must be revoked
//                            with it)
//   APPLE_SIWA_PRIVATE_KEY   contents of the .p8 (PKCS#8 PEM)
//   APPLE_TOKEN_ENC_KEY      32 random bytes, base64 — encrypts tokens at rest

export interface AppleConfig {
  teamId: string;
  keyId: string;
  clientId: string;
  privateKeyPem: string;
  encryptionKey: string;
}

const APPLE_ORIGIN = 'https://appleid.apple.com';

/** Deno's environment, reached through globalThis so this module also type-checks (and is unit-tested) outside Deno. */
const denoEnv = (name: string): string | undefined =>
  (globalThis as { Deno?: { env: { get(n: string): string | undefined } } }).Deno?.env.get(name);

/** The configuration, or null when any part is missing (feature off). */
export function appleConfig(env: (name: string) => string | undefined = denoEnv): AppleConfig | null {
  const teamId = env('APPLE_SIWA_TEAM_ID')?.trim();
  const keyId = env('APPLE_SIWA_KEY_ID')?.trim();
  const clientId = env('APPLE_SIWA_CLIENT_ID')?.trim();
  // Secrets set from a shell often arrive with literal "\n" instead of breaks.
  const privateKeyPem = env('APPLE_SIWA_PRIVATE_KEY')?.replace(/\\n/g, '\n').trim();
  const encryptionKey = env('APPLE_TOKEN_ENC_KEY')?.trim();
  if (!teamId || !keyId || !clientId || !privateKeyPem || !encryptionKey) return null;
  return { teamId, keyId, clientId, privateKeyPem, encryptionKey };
}

function b64url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  let s = '';
  for (const b of raw) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  return fromB64(pem.replace(/-----(BEGIN|END) [A-Z ]+-----/g, '').replace(/\s+/g, ''));
}

/**
 * The `client_secret` Apple's token endpoints require: an ES256 JWT signed with
 * the .p8 key. WebCrypto's ECDSA signature is already the raw r‖s form JWS
 * wants, so no DER conversion is needed. Five minutes is plenty for one call.
 */
export async function appleClientSecret(cfg: AppleConfig, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToDer(cfg.privateKeyPem), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: cfg.keyId, typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: cfg.teamId, iat: nowSeconds, exp: nowSeconds + 300, aud: APPLE_ORIGIN, sub: cfg.clientId,
  }));
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${b64url(new Uint8Array(signature))}`;
}

/** Apple refresh tokens are opaque; bound them so the store cannot be abused. */
export function plausibleAppleToken(token: unknown): token is string {
  return typeof token === 'string' && token.length >= 16 && token.length <= 2048 && /^[A-Za-z0-9._-]+$/.test(token);
}

/**
 * Ask Apple whose refresh token this is. A refresh grant succeeds only for a
 * live token issued to our client, and returns an id_token naming its owner.
 * Returns that subject, or null. The id_token comes straight from Apple over
 * TLS in answer to our signed request, so its payload is read, not re-verified.
 */
export async function appleSubjectForRefreshToken(
  cfg: AppleConfig, refreshToken: string, fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const res = await fetchImpl(`${APPLE_ORIGIN}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: cfg.clientId,
      client_secret: await appleClientSecret(cfg),
    }),
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null) as { id_token?: unknown } | null;
  const idToken = typeof body?.id_token === 'string' ? body.id_token : '';
  try {
    const claims = JSON.parse(new TextDecoder().decode(fromB64(idToken.split('.')[1] ?? '')));
    return typeof claims?.sub === 'string' ? claims.sub : null;
  } catch {
    return null;
  }
}

/** Revoke a token with Apple. True on Apple's 200; never throws. */
export async function revokeAppleToken(
  cfg: AppleConfig, token: string, fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const res = await fetchImpl(`${APPLE_ORIGIN}/auth/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: await appleClientSecret(cfg),
        token,
        token_type_hint: 'refresh_token',
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function aesKey(base64Key: string): Promise<CryptoKey> {
  const raw = fromB64(base64Key);
  if (raw.length !== 32) throw new Error('APPLE_TOKEN_ENC_KEY must be 32 bytes, base64');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** AES-256-GCM, a fresh 96-bit IV per value, stored as base64url(iv ‖ ciphertext). */
export async function encryptToken(plain: string, base64Key: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(base64Key), new TextEncoder().encode(plain)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64url(out);
}

export async function decryptToken(stored: string, base64Key: string): Promise<string> {
  const bytes = fromB64(stored);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.slice(0, 12) }, await aesKey(base64Key), bytes.slice(12),
  );
  return new TextDecoder().decode(plain);
}

/** The user's Apple subject (`sub`), from the Supabase identity, or null. */
export function appleSubjectOf(user: { identities?: Array<{ provider?: string; id?: string; identity_data?: Record<string, unknown> }> | null }): string | null {
  const identity = user.identities?.find((i) => i.provider === 'apple');
  if (!identity) return null;
  const sub = identity.identity_data?.sub ?? identity.id;
  return typeof sub === 'string' && sub ? sub : null;
}
