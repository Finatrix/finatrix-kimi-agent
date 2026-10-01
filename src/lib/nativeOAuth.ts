/**
 * PKCE for provider sign-in inside the FinatriX apps (RFC 7636, which RFC 8252
 * requires of native apps).
 *
 * WHY THE APPS NEED THIS AND THE WEBSITE DOES NOT
 * -----------------------------------------------
 * In a browser the provider hands the result back to `https://finatrix.co`, an
 * origin nobody else can serve. In an app it has to come back on the app's own
 * URL scheme, `co.finatrix.app://`, because only a URL the app owns can bring
 * the system browser back to it — and a custom scheme is first come, first
 * served. Any other app can declare the same scheme (demonstrated on the iOS
 * Simulator, where a leftover test app was offered the callback). With the
 * implicit flow that callback carried the access AND refresh tokens, so whoever
 * received it owned the account.
 *
 * With PKCE the callback carries only a one-time code, and the code is worthless
 * without the verifier generated here, which never leaves the device: GoTrue
 * redeems the code only for the client that can show the secret whose hash it
 * was given at the start.
 *
 * The same property closes the reverse attack. An app or page that opens
 * `co.finatrix.app://auth/callback` itself can no longer sign the person into
 * an account of the attacker's choosing (whose cloud sync would then receive
 * their figures): an injected code fails, because this device holds no verifier
 * for it, and `bridge.ts` no longer accepts tokens on that URL at all.
 *
 * WHY ONLY PROVIDER SIGN-IN
 * -------------------------
 * The Supabase client stays on the implicit flow everywhere. Switching it to
 * PKCE would also turn email confirmation and password-reset links into
 * same-device-only links — requested in the app, opened on a laptop, and the
 * reset would fail for want of a verifier. Those links do not travel over the
 * custom scheme: they are `https://finatrix.co` URLs that only the verified app
 * (App Links / Universal Links) or the website can receive, so they were never
 * the exposure.
 *
 * Everything here uses GoTrue's documented REST contract and the client's
 * public `signInWithOAuth({ queryParams })` / `setSession()`, not the library's
 * private storage keys, so a supabase-js upgrade cannot quietly break it.
 */
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabaseConfig';

/** Our key, deliberately not the library's `sb-*-code-verifier`. */
const VERIFIER_KEY = 'fx_oauth_pkce';

/**
 * How long a started sign-in may take. GoTrue's own codes expire within
 * minutes; this only bounds how long an abandoned verifier sits on the device.
 */
export const PKCE_MAX_AGE_MS = 10 * 60 * 1000;

export interface PkceChallenge {
  code_challenge: string;
  code_challenge_method: 's256' | 'plain';
}

export interface NativeSession {
  access_token: string;
  refresh_token: string;
}

interface StoredVerifier {
  v: string;
  t: number;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 64 random bytes → 86 URL-safe characters, inside RFC 7636's 43–128. */
function newVerifier(): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function challengeFor(verifier: string): Promise<PkceChallenge> {
  // S256 whenever WebCrypto is there, which it is in both apps' WebViews.
  // `plain` is RFC 7636's fallback for clients without SHA-256 and still
  // defeats the interception this exists for: the authorization request goes
  // from this app straight to the system browser, so another app that grabs
  // the callback has the code but never saw the challenge.
  if (typeof crypto === 'undefined' || !crypto.subtle || typeof TextEncoder === 'undefined') {
    return { code_challenge: verifier, code_challenge_method: 'plain' };
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { code_challenge: base64Url(new Uint8Array(digest)), code_challenge_method: 's256' };
}

/**
 * Start a sign-in: remember a fresh verifier and return the challenge to send.
 *
 * localStorage rather than sessionStorage on purpose. While the sign-in page is
 * in front, Android may kill the app's process to reclaim memory; the callback
 * then cold-starts a new WebView, and a sessionStorage verifier would be gone —
 * a sign-in that fails only on low-memory phones. A second start overwrites the
 * first, so only the most recent attempt can complete.
 */
export async function beginNativePkce(now = Date.now()): Promise<PkceChallenge> {
  const verifier = newVerifier();
  const challenge = await challengeFor(verifier);
  localStorage.setItem(VERIFIER_KEY, JSON.stringify({ v: verifier, t: now } satisfies StoredVerifier));
  return challenge;
}

/** Read and forget the verifier — a code is redeemable once, and so is this. */
function takeVerifier(now: number): { verifier: string | null; expired: boolean } {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(VERIFIER_KEY);
    localStorage.removeItem(VERIFIER_KEY);
  } catch {
    return { verifier: null, expired: false };
  }
  if (!raw) return { verifier: null, expired: false };
  try {
    const stored = JSON.parse(raw) as Partial<StoredVerifier>;
    if (typeof stored.v !== 'string' || typeof stored.t !== 'number') return { verifier: null, expired: false };
    if (now - stored.t > PKCE_MAX_AGE_MS || now < stored.t) return { verifier: null, expired: true };
    return { verifier: stored.v, expired: false };
  } catch {
    return { verifier: null, expired: false };
  }
}

const FAILED = 'Sign-in could not be completed. Please try again.';

/**
 * Redeem the code from the callback for a session.
 *
 * Never throws, and never reports the server's message verbatim: every failure
 * here has the same remedy (start again), and GoTrue's wording ("invalid flow
 * state") explains nothing to the person holding the phone.
 */
export async function exchangeNativeCode(
  code: string,
  now = Date.now(),
): Promise<{ session: NativeSession | null; error: string | null }> {
  const { verifier, expired } = takeVerifier(now);
  if (expired) return { session: null, error: 'That sign-in took too long to finish. Please try again.' };
  // No verifier means this device never started the sign-in the code belongs
  // to — an injected callback, or one replayed after it was already used.
  if (!verifier || !code || !SUPABASE_URL || !SUPABASE_ANON_KEY) return { session: null, error: FAILED };

  try {
    const response = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      // `apikey` only: a new-format `sb_publishable_` key is not a JWT and must
      // not be sent as a Bearer token.
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json;charset=UTF-8' },
      body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    });
    if (!response.ok) return { session: null, error: FAILED };
    const body = (await response.json()) as Partial<NativeSession>;
    if (typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string') {
      return { session: null, error: FAILED };
    }
    return { session: { access_token: body.access_token, refresh_token: body.refresh_token }, error: null };
  } catch {
    return { session: null, error: 'Sign-in could not be completed. Check your connection and try again.' };
  }
}

/**
 * The PKCE code on this page load, if it is an app's sign-in return leg.
 *
 * `bridge.ts` delivers it as `/login?code=…`. Only ever meaningful in an app:
 * the website never starts a PKCE sign-in, so a `code` in a browser URL is
 * somebody else's parameter and is left alone.
 */
export function readNativeAuthCode(search: string, isApp: boolean): string | null {
  if (!isApp) return null;
  const code = new URLSearchParams(search).get('code');
  return code && /^[A-Za-z0-9._~-]{1,512}$/.test(code) ? code : null;
}

/** Remove the spent code from the address without adding a history entry. */
export function stripAuthCodeFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('code')) return;
    url.searchParams.delete('code');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* Nothing to clean if the URL cannot be parsed. */
  }
}
