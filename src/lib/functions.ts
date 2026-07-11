/**
 * Authenticated Supabase Edge Function invocation.
 *
 * Every Edge Function in this app authenticates the caller (it reads the user
 * from the JWT). supabase-js normally attaches `Authorization: Bearer <key>`
 * for you — BUT with the new publishable key format (`sb_publishable_…`) the
 * client sends that key only as `apikey`, never as a Bearer token. So a call
 * made while signed out (or before the session hydrates) arrives with NO
 * Authorization header, the Functions platform rejects it with a 401
 * (`UNAUTHORIZED_NO_AUTH_HEADER`), and the browser mislabels that as a CORS
 * error because the platform 401 carries no CORS headers.
 *
 * `invokeAuthed` removes that whole failure class: it fetches the current
 * session (refreshing an expiring token), attaches the real JWT as an explicit
 * `Authorization` header, and — for endpoints that require a user — refuses to
 * call at all when there's no session, returning a clean auth signal instead of
 * a phantom CORS error.
 */

import { supabase, isSupabaseConfigured } from './supabase';

export type InvokeAuthResult<T> =
  | { data: T; error: null; reason: null }
  | { data: null; error: unknown; reason: 'not-configured' | 'no-session' | 'invoke-error' };

/**
 * Current access token (JWT), refreshing first if missing or within 60s of
 * expiry. Returns null when there is no session. Never throws.
 */
export async function currentAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.auth.getSession();
  let session = data.session;
  const expiresMs = session?.expires_at ? session.expires_at * 1000 : 0;
  if (session && expiresMs && expiresMs < Date.now() + 60_000) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    session = refreshed.session ?? session;
  }
  return session?.access_token ?? null;
}

/**
 * Invoke an Edge Function with the current user's JWT attached explicitly.
 *
 * @param requireAuth when true (default) a missing session short-circuits with
 *   `reason: 'no-session'` instead of calling the platform. Set false for
 *   endpoints that also accept anonymous callers.
 */
export async function invokeAuthed<T>(
  name: string,
  body: unknown,
  { requireAuth = true }: { requireAuth?: boolean } = {}
): Promise<InvokeAuthResult<T>> {
  if (!isSupabaseConfigured) {
    return { data: null, error: new Error('Supabase not configured'), reason: 'not-configured' };
  }
  const accessToken = await currentAccessToken();
  if (requireAuth && !accessToken) {
    return { data: null, error: new Error('No active session'), reason: 'no-session' };
  }
  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
  const { data, error } = await supabase.functions.invoke(name, {
    headers,
    body: body as Record<string, unknown>,
  });
  if (error) return { data: null, error, reason: 'invoke-error' };
  return { data: data as T, error: null, reason: null };
}
