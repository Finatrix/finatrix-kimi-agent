import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

/**
 * PKCE for provider sign-in in the apps (src/lib/nativeOAuth.ts).
 *
 * The properties that matter are security properties, so each test pins one:
 * the challenge really is S256 of the stored verifier, the verifier is single
 * use and short-lived, a code with no verifier on this device is refused without
 * a network call, and the exchange never sends the publishable key as a Bearer.
 */

vi.mock('../lib/supabaseConfig', () => ({
  SUPABASE_URL: 'https://project.supabase.co/',
  SUPABASE_ANON_KEY: 'sb_publishable_test',
}));

import {
  beginNativePkce,
  exchangeNativeCode,
  PKCE_MAX_AGE_MS,
  readNativeAuthCode,
  stripAuthCodeFromUrl,
} from '../lib/nativeOAuth';

const KEY = 'fx_oauth_pkce';

function stored(): { v: string; t: number } {
  return JSON.parse(localStorage.getItem(KEY) ?? 'null');
}

async function s256(verifier: string): Promise<string> {
  const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return Buffer.from(digest).toString('base64url');
}

const fetchMock = vi.fn();

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('beginNativePkce', () => {
  it('stores a fresh RFC 7636 verifier and returns its S256 challenge', async () => {
    const challenge = await beginNativePkce(1_000);
    const { v, t } = stored();
    expect(t).toBe(1_000);
    expect(v).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(challenge.code_challenge_method).toBe('s256');
    expect(challenge.code_challenge).toBe(await s256(v));
    expect(challenge.code_challenge).not.toBe(v);
  });

  it('uses a new verifier every time, so only the latest attempt can complete', async () => {
    await beginNativePkce();
    const first = stored().v;
    await beginNativePkce();
    expect(stored().v).not.toBe(first);
  });
});

describe('exchangeNativeCode', () => {
  function tokens() {
    return new Response(JSON.stringify({ access_token: 'at', refresh_token: 'rt', user: { id: 'u' } }), { status: 200 });
  }

  it('redeems the code with the stored verifier, sending the key only as `apikey`', async () => {
    await beginNativePkce(0);
    const { v } = stored();
    fetchMock.mockResolvedValue(tokens());

    const result = await exchangeNativeCode('code-1', 1_000);

    expect(result).toEqual({ session: { access_token: 'at', refresh_token: 'rt' }, error: null });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://project.supabase.co/auth/v1/token?grant_type=pkce');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe('sb_publishable_test');
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain('authorization');
    expect(JSON.parse(init.body as string)).toEqual({ auth_code: 'code-1', code_verifier: v });
  });

  it('is single use: the verifier is gone after one attempt, successful or not', async () => {
    await beginNativePkce(0);
    fetchMock.mockResolvedValue(new Response('{}', { status: 400 }));
    await exchangeNativeCode('code-1', 1);
    expect(localStorage.getItem(KEY)).toBeNull();

    fetchMock.mockClear();
    const replay = await exchangeNativeCode('code-1', 2);
    expect(replay.session).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a code this device never asked for, without touching the network', async () => {
    const result = await exchangeNativeCode('injected-code');
    expect(result.session).toBeNull();
    expect(result.error).toMatch(/could not be completed/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a verifier older than the time limit and says why', async () => {
    await beginNativePkce(0);
    const result = await exchangeNativeCode('late-code', PKCE_MAX_AGE_MS + 1);
    expect(result.session).toBeNull();
    expect(result.error).toMatch(/took too long/i);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('refuses a verifier dated in the future (clock moved back, or tampering)', async () => {
    await beginNativePkce(10_000);
    const result = await exchangeNativeCode('code', 5_000);
    expect(result.session).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores a corrupted stored value', async () => {
    localStorage.setItem(KEY, '{not json');
    expect((await exchangeNativeCode('code')).session).toBeNull();
    localStorage.setItem(KEY, JSON.stringify({ v: 42, t: Date.now() }));
    expect((await exchangeNativeCode('code')).session).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never shows the server’s own wording, which explains nothing to a person', async () => {
    await beginNativePkce();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ msg: 'invalid flow state, no valid flow state found' }), { status: 404 }));
    const result = await exchangeNativeCode('code');
    expect(result.error).toBe('Sign-in could not be completed. Please try again.');
  });

  it('treats a 200 without both tokens as a failure', async () => {
    await beginNativePkce();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ access_token: 'only' }), { status: 200 }));
    expect((await exchangeNativeCode('code')).session).toBeNull();
  });

  it('reports a network failure as one', async () => {
    await beginNativePkce();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await exchangeNativeCode('code');
    expect(result.session).toBeNull();
    expect(result.error).toMatch(/connection/i);
  });
});

describe('readNativeAuthCode', () => {
  it('reads the code only in an app — on the website it is someone else’s parameter', () => {
    expect(readNativeAuthCode('?next=%2Ftools&code=5f1c-ab', true)).toBe('5f1c-ab');
    expect(readNativeAuthCode('?next=%2Ftools&code=5f1c-ab', false)).toBeNull();
  });

  it('rejects anything that is not shaped like an authorization code', () => {
    expect(readNativeAuthCode('?code=', true)).toBeNull();
    expect(readNativeAuthCode('?code=%3Cscript%3E', true)).toBeNull();
    expect(readNativeAuthCode(`?code=${'a'.repeat(513)}`, true)).toBeNull();
    expect(readNativeAuthCode('?next=%2Ftools', true)).toBeNull();
  });
});

describe('stripAuthCodeFromUrl', () => {
  it('removes the spent code and keeps everything else, without a new history entry', () => {
    window.history.replaceState(null, '', '/login?next=%2Ftools&code=abc#x');
    const before = window.history.length;
    stripAuthCodeFromUrl();
    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/login?next=%2Ftools#x');
    expect(window.history.length).toBe(before);
  });
});
