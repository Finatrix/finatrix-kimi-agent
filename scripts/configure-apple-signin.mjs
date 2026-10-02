#!/usr/bin/env node
/**
 * Configure — or re-check, or rotate — Sign in with Apple on the live backend.
 *
 *   node scripts/configure-apple-signin.mjs --check
 *   node scripts/configure-apple-signin.mjs --p8 ~/Downloads/AuthKey_ABCDE12345.p8 --key-id ABCDE12345
 *   node scripts/configure-apple-signin.mjs --p8 <file> --key-id <id> --rotate
 *
 * Two consumers need the Sign in with Apple key (.p8), and they need it in
 * different shapes:
 *
 *  1. Supabase Auth's Apple provider (the OAuth sign-in itself) takes a
 *     pre-signed client secret — an ES256 JWT that Apple refuses to accept for
 *     longer than six months. When it expires Apple sign-in fails for everyone,
 *     with nothing in the app to say why. `--rotate` re-signs it from the same
 *     key and touches nothing else; run it before the date this script prints.
 *  2. The `apple-token` and `account-delete` edge functions sign their own
 *     short-lived secrets per request (supabase/functions/_shared/appleSignIn.ts),
 *     so they get the key itself, as edge secrets. They never expire.
 *
 * `APPLE_TOKEN_ENC_KEY` (the at-rest key for stored Apple refresh tokens) is
 * created once and never replaced here: a new one would make every stored token
 * undecryptable, and those accounts' deletions could no longer revoke them.
 *
 * There is no way to check the key itself before someone signs in: Apple only
 * authenticates the client secret once it holds a real code or token (a
 * made-up one gets `invalid_grant`, and a revoke `200`, whatever the key). The
 * first real Apple sign-in is the test — and `apple-token` storing that
 * person's token is the proof that the edge functions' copy works too.
 *
 * Nothing secret is printed, written to disk or passed on a command line (where
 * `ps` would show it). Authentication is the Supabase CLI's own login (or
 * SUPABASE_ACCESS_TOKEN), because provider settings are not reachable through
 * any CLI command — only the Management API.
 */
import { createPrivateKey, createSign, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const DEFAULTS = {
  team: 'AY79GYWLDP',
  servicesId: 'co.finatrix.signin',
  projectRef: 'uspbsgbggurggsfsontq',
};
/** Apple's ceiling is 15,777,000 s (six months); stay a week inside it. */
const CLIENT_SECRET_SECONDS = 180 * 24 * 60 * 60 - 7 * 24 * 60 * 60;
const API = 'https://api.supabase.com/v1/projects';

function parseArgs(argv) {
  const args = { ...DEFAULTS, check: false, rotate: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = () => {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) throw new Error(`${flag} needs a value`);
      i += 1;
      return next;
    };
    if (flag === '--check') args.check = true;
    else if (flag === '--rotate') args.rotate = true;
    else if (flag === '--p8') args.p8 = value().replace(/^~(?=\/)/, homedir());
    else if (flag === '--key-id') args.keyId = value();
    else if (flag === '--team') args.team = value();
    else if (flag === '--services-id') args.servicesId = value();
    else if (flag === '--project-ref') args.projectRef = value();
    else throw new Error(`Unknown option ${flag}`);
  }
  if (!args.check) {
    if (!args.p8 || !args.keyId) throw new Error('--p8 <file> and --key-id <id> are required (or use --check)');
    if (!/^[A-Z0-9]{10}$/.test(args.keyId)) throw new Error('--key-id is the 10-character Key ID shown next to the key');
  }
  if (!/^[A-Z0-9]{10}$/.test(args.team)) throw new Error('--team is the 10-character Team ID');
  return args;
}

/** The CLI's own login: SUPABASE_ACCESS_TOKEN, else the token `supabase login` keeps in the keychain. */
function accessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  let stored;
  try {
    stored = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-a', 'supabase', '-w'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    throw new Error('No Supabase login found: run `npx supabase login`, or set SUPABASE_ACCESS_TOKEN');
  }
  const prefix = 'go-keyring-base64:';
  return stored.startsWith(prefix) ? Buffer.from(stored.slice(prefix.length), 'base64').toString('utf8').trim() : stored;
}

async function api(token, path, init = {}) {
  const response = await fetch(`${API}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    // The body of an error never contains the values sent, only the reason.
    throw new Error(`${init.method ?? 'GET'} ${path} → HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return response.status === 204 ? null : response.json().catch(() => null);
}

function readKey(path) {
  const pem = readFileSync(path, 'utf8').trim();
  const key = createPrivateKey(pem);
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw new Error(`${path} is not a Sign in with Apple key (expected an EC P-256 .p8)`);
  }
  return { pem, key };
}

const b64url = (input) => Buffer.from(input).toString('base64url');

/** The client secret Supabase's Apple provider presents to Apple: ES256, iss = team, sub = Services ID. */
function clientSecret({ key, keyId, team, servicesId, now = Math.floor(Date.now() / 1000) }) {
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const exp = now + CLIENT_SECRET_SECONDS;
  const payload = b64url(JSON.stringify({ iss: team, iat: now, exp, aud: 'https://appleid.apple.com', sub: servicesId }));
  const signer = createSign('SHA256');
  signer.update(`${header}.${payload}`);
  const signature = signer.sign({ key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return { jwt: `${header}.${payload}.${signature}`, exp };
}

/** Only the non-secret claims of a stored client secret, for --check. */
function describeSecret(jwt) {
  // The Management API masks stored secrets, so usually all that can be said is
  // that one is set; its expiry is the date printed when it was last signed.
  if (typeof jwt !== 'string' || jwt.split('.').length !== 3) return jwt ? 'set (masked by the API)' : 'NOT SET';
  try {
    const { iss, sub, exp } = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
    const days = Math.floor((exp * 1000 - Date.now()) / 86_400_000);
    return `iss=${iss} sub=${sub} expires ${new Date(exp * 1000).toISOString().slice(0, 10)} (${days} days)`;
  } catch {
    return 'set (unreadable)';
  }
}

async function report(token, ref) {
  const auth = await api(token, `${ref}/config/auth`);
  const secrets = new Set((await api(token, `${ref}/secrets`)).map((s) => s.name));
  const edge = ['APPLE_SIWA_TEAM_ID', 'APPLE_SIWA_KEY_ID', 'APPLE_SIWA_CLIENT_ID', 'APPLE_SIWA_PRIVATE_KEY', 'APPLE_TOKEN_ENC_KEY'];
  const allow = String(auth.uri_allow_list ?? '').split(',').map((s) => s.trim());
  console.log(`Apple provider enabled:   ${auth.external_apple_enabled === true}`);
  console.log(`Apple client ID:          ${auth.external_apple_client_id || 'NOT SET'}`);
  console.log(`Apple client secret:      ${describeSecret(auth.external_apple_secret)}`);
  console.log(`App redirect allow-listed: ${allow.includes('co.finatrix.app://**')}`);
  for (const name of edge) console.log(`Edge secret ${name.padEnd(24)} ${secrets.has(name) ? 'set' : 'MISSING'}`);
  return { auth, secrets };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = accessToken();
  const ref = args.projectRef;

  if (args.check) {
    await report(token, ref);
    return;
  }

  const { pem, key } = readKey(args.p8);
  const { jwt, exp } = clientSecret({ key, keyId: args.keyId, team: args.team, servicesId: args.servicesId });

  await api(token, `${ref}/config/auth`, {
    method: 'PATCH',
    body: JSON.stringify({
      external_apple_enabled: true,
      external_apple_client_id: args.servicesId,
      external_apple_secret: jwt,
    }),
  });
  console.log(`✓ Supabase Apple provider: enabled for ${args.servicesId}`);

  if (!args.rotate) {
    const existing = new Set((await api(token, `${ref}/secrets`)).map((s) => s.name));
    const secrets = [
      { name: 'APPLE_SIWA_TEAM_ID', value: args.team },
      { name: 'APPLE_SIWA_KEY_ID', value: args.keyId },
      { name: 'APPLE_SIWA_CLIENT_ID', value: args.servicesId },
      { name: 'APPLE_SIWA_PRIVATE_KEY', value: pem },
    ];
    if (!existing.has('APPLE_TOKEN_ENC_KEY')) {
      secrets.push({ name: 'APPLE_TOKEN_ENC_KEY', value: randomBytes(32).toString('base64') });
    }
    await api(token, `${ref}/secrets`, { method: 'POST', body: JSON.stringify(secrets) });
    console.log(`✓ Edge secrets: ${secrets.map((s) => s.name).join(', ')}`);
    if (existing.has('APPLE_TOKEN_ENC_KEY')) console.log('  APPLE_TOKEN_ENC_KEY kept (replacing it would orphan stored tokens)');
  }

  console.log('');
  await report(token, ref);
  console.log('');
  console.log(`Rotate the provider's client secret before ${new Date(exp * 1000).toISOString().slice(0, 10)}:`);
  console.log(`  node scripts/configure-apple-signin.mjs --p8 <AuthKey_${args.keyId}.p8> --key-id ${args.keyId} --rotate`);
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
