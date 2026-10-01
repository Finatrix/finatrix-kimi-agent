// End-to-end check of Sign in with Apple token revocation (App Review 5.1.1(v)):
// the REAL `apple-token` and `account-delete` functions, run under Deno against
// in-process mocks of Apple's REST API and Supabase. The mock Apple verifies
// every ES256 client_secret against a freshly generated P-256 key, so a wrongly
// signed JWT fails here, not in production.
//
//   deno run --node-modules-dir=none --allow-net --allow-env --allow-read supabase/functions/_e2e/apple-revocation.ts
//
// Not a deployed function (the leading underscore keeps it out of the deploy
// and drift lists) and needs no credentials, Docker or network beyond the
// first download of the functions' imports.
const APP = new URL('..', import.meta.url).href.replace(/\/$/, '');
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

// ── Apple signing key (what the .p8 would be) ─────────────────────────────
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8)).match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----`;
const encKey = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
for (const [k, v] of Object.entries({
  APPLE_SIWA_TEAM_ID: 'TEAM123456', APPLE_SIWA_KEY_ID: 'KEY1234567', APPLE_SIWA_CLIENT_ID: 'co.finatrix.signin',
  APPLE_SIWA_PRIVATE_KEY: pem.replace(/\n/g, '\\n'), APPLE_TOKEN_ENC_KEY: encKey,
  SUPABASE_URL: 'http://supabase.mock', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service',
})) Deno.env.set(k, v);

// ── mock state ────────────────────────────────────────────────────────────
const U1 = '11111111-1111-4111-8111-111111111111';
const VALID = 'r1a2b3c4d5e6f7a8.0.rvalid.apple-refresh-token';
const state = {
  identities: [{ provider: 'apple', id: 'apple-sub-1', identity_data: { sub: 'apple-sub-1' } }] as unknown[],
  tokens: new Map<string, { token_ciphertext: string }>(),
  revoked: [] as string[], revokeStatus: 200, secretsOk: true, deleted: [] as string[],
};

async function verifyClientSecret(secret: string) {
  const [h, p, sig] = secret.split('.');
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, fromB64(sig), new TextEncoder().encode(`${h}.${p}`));
  const head = JSON.parse(new TextDecoder().decode(fromB64(h))); const claims = JSON.parse(new TextDecoder().decode(fromB64(p)));
  const now = Math.floor(Date.now() / 1000);
  const good = ok && head.alg === 'ES256' && head.kid === 'KEY1234567' && claims.iss === 'TEAM123456' && claims.sub === 'co.finatrix.signin'
    && claims.aud === 'https://appleid.apple.com' && claims.exp > now && claims.exp - claims.iat <= 15777000;
  if (!good) state.secretsOk = false;
  return good;
}

async function apple(url: URL, init: RequestInit): Promise<Response> {
  const form = new URLSearchParams(String(init.body));
  if (form.get('client_id') !== 'co.finatrix.signin' || !(await verifyClientSecret(form.get('client_secret') ?? ''))) return Response.json({ error: 'invalid_client' }, { status: 400 });
  if (url.pathname === '/auth/token') {
    if (form.get('grant_type') !== 'refresh_token' || form.get('refresh_token') !== VALID) return Response.json({ error: 'invalid_grant' }, { status: 400 });
    const idToken = `${b64url(new TextEncoder().encode('{"alg":"RS256"}'))}.${b64url(new TextEncoder().encode(JSON.stringify({ sub: 'apple-sub-1', aud: 'co.finatrix.signin' })))}.sig`;
    return Response.json({ access_token: 'a', token_type: 'Bearer', expires_in: 3600, id_token: idToken });
  }
  if (url.pathname === '/auth/revoke') { state.revoked.push(form.get('token') ?? ''); return new Response('', { status: state.revokeStatus }); }
  return new Response('', { status: 404 });
}

function supabase(url: URL, init: RequestInit): Response {
  const method = (init.method ?? 'GET').toUpperCase();
  if (url.pathname === '/auth/v1/user') return Response.json({ id: U1, aud: 'authenticated', identities: state.identities, app_metadata: {}, user_metadata: {} });
  if (url.pathname === '/rest/v1/apple_auth_tokens') {
    if (method === 'POST') { const row = JSON.parse(String(init.body)); const r = Array.isArray(row) ? row[0] : row; state.tokens.set(r.user_id, { token_ciphertext: r.token_ciphertext }); return new Response(null, { status: 201 }); }
    const uid = url.searchParams.get('user_id')?.replace(/^eq\./, '') ?? '';
    const row = state.tokens.get(uid);
    return row ? Response.json(row) : new Response('{}', { status: 406 });
  }
  if (url.pathname.startsWith('/storage/v1/object/list/')) return Response.json([]);
  if (url.pathname.startsWith('/auth/v1/admin/users/') && method === 'DELETE') {
    const uid = url.pathname.split('/').pop()!; state.deleted.push(uid); state.tokens.delete(uid); return Response.json({});
  }
  return new Response('[]', { headers: { 'content-type': 'application/json' } });
}

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const req = input instanceof Request ? input : null;
  const url = new URL(req ? req.url : String(input));
  if (req) init = { method: req.method, headers: req.headers, body: req.body ? await req.text() : undefined, ...init };
  if (url.origin === 'https://appleid.apple.com') return apple(url, init);
  if (url.origin === 'http://supabase.mock') return supabase(url, init);
  return realFetch(input, init);
}) as typeof fetch;

// ── load both functions without binding ports ─────────────────────────────
const handlers: Array<(r: Request) => Promise<Response>> = [];
(Deno as unknown as { serve: unknown }).serve = (h: (r: Request) => Promise<Response>) => { handlers.push(h); return { finished: Promise.resolve(), shutdown() {} }; };
await import(`${APP}/apple-token/index.ts`);
await import(`${APP}/account-delete/index.ts`);
const [appleToken, accountDelete] = handlers;
const call = (h: (r: Request) => Promise<Response>, body: unknown, ip: string) => h(new Request('http://fn/', {
  method: 'POST', headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json', Origin: 'capacitor://localhost', 'CF-Connecting-IP': ip }, body: JSON.stringify(body),
}));

const results: Array<[string, boolean, unknown]> = [];
const check = (name: string, ok: boolean, detail?: unknown) => results.push([name, ok, detail]);

let r = await call(appleToken, { token: 'r0000000000000000.0.someone-elses' }, '1.1.1.1');
check('refuses a token Apple does not confirm (422) and stores nothing', r.status === 422 && state.tokens.size === 0, r.status);

r = await call(appleToken, { token: 'not a token!' }, '1.1.1.2');
check('rejects a malformed token before calling Apple (400)', r.status === 400, r.status);

r = await call(appleToken, { token: VALID }, '1.1.1.3');
const stored = state.tokens.get(U1)?.token_ciphertext ?? '';
check('stores a confirmed token (204)', r.status === 204 && !!stored, r.status);
check('the stored value is ciphertext, not the token', !!stored && !stored.includes('apple-refresh-token') && stored !== VALID);

state.identities = [{ provider: 'google', id: 'g-1', identity_data: { sub: 'g-1' } }];
r = await call(appleToken, { token: VALID }, '1.1.1.4');
check('refuses when the caller has no Apple identity (409)', r.status === 409, r.status);
state.identities = [{ provider: 'apple', id: 'apple-sub-1', identity_data: { sub: 'apple-sub-1' } }];

r = await call(accountDelete, { confirm: 'DELETE' }, '2.2.2.1');
const body = await r.json();
check('account-delete revokes the decrypted token with Apple, then deletes', r.status === 200 && body.appleRevoked === true && state.revoked[0] === VALID && state.deleted.includes(U1), body);
check('the token row is gone with the user', !state.tokens.has(U1));
check('every client_secret was a valid ES256 JWT for this team/key/client', state.secretsOk);

// Apple down: re-store, then deletion still completes and says so.
r = await call(appleToken, { token: VALID }, '1.1.1.5');
state.revoked = []; state.deleted = []; state.revokeStatus = 503;
r = await call(accountDelete, { confirm: 'DELETE' }, '2.2.2.2');
const down = await r.json();
check('deletion still completes when Apple refuses, reporting appleRevoked:false', r.status === 200 && down.appleRevoked === false && state.deleted.includes(U1), down);

// Non-Apple account: no Apple call, no appleRevoked field.
state.identities = [{ provider: 'google', id: 'g-1', identity_data: { sub: 'g-1' } }];
state.revoked = []; state.deleted = [];
r = await call(accountDelete, { confirm: 'DELETE' }, '2.2.2.3');
const plain = await r.json();
check('a non-Apple account is deleted without contacting Apple', r.status === 200 && !('appleRevoked' in plain) && state.revoked.length === 0, plain);

for (const [name, ok, detail] of results) console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  → ${JSON.stringify(detail)}`}`);
const failed = results.filter(([, ok]) => !ok).length;
console.log(failed ? `\n${failed} FAILED` : `\nAll ${results.length} passed`);
Deno.exit(failed ? 1 : 0);
