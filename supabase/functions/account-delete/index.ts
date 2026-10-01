// FinatriX — delete the signed-in user's account and everything tied to it.
//
// Why this exists: Google Play requires any app that lets people create an
// account to also let them delete it from inside the app (and from the web),
// and "email support" does not meet that bar. It is also simply the right
// thing for a finance product: someone leaving should be able to take their
// data with them — the export already exists — and then remove it, without
// waiting on a human.
//
// What it removes:
//  1. Every object the user uploaded to Storage (the `resumes/<uid>/…` folder).
//     Storage rows carry no foreign key to auth.users, so they would otherwise
//     outlive the account.
//  2. The auth user itself. Every user-owned table references auth.users with
//     `on delete cascade` (profiles, finance sync, careers data, usage,
//     subscriptions, billing history…), so this one call removes all of it.
//     Audit-style columns that merely *mention* a user (`created_by`,
//     `granted_by`, …) are `on delete set null` and are anonymised, not kept
//     attributable.
//
//  3. For an account linked to Sign in with Apple, the Apple refresh token is
//     revoked with Apple first (App Review 5.1.1(v)), so FinatriX leaves the
//     person's "Apps using Apple ID" list. The token was stored, encrypted, by
//     the `apple-token` function at sign-in; see _shared/appleSignIn.ts.
//
// Payment processor records (Stripe) are held by the processor under its own
// legal retention duties and are not deletable from here; the privacy policy
// says so.
//
// Deploy:  supabase functions deploy account-delete --no-verify-jwt
//          (identity is verified here with auth.getUser — see PRE_AUTH_PER_IP)
// Needs:   SUPABASE_SERVICE_ROLE_KEY (set automatically for deployed functions)

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { rateLimited } from '../_shared/ratelimit.ts';
import { corsHeaders } from '../_shared/origins.ts';
import { appleConfig, appleSubjectOf, decryptToken, revokeAppleToken } from '../_shared/appleSignIn.ts';

/** Buckets holding user-owned files, each keyed `<bucket>/<user id>/…`. */
const USER_BUCKETS = ['resumes'];
/** The phrase the client must send, so a stray or replayed call cannot delete. */
const CONFIRMATION = 'DELETE';
/**
 * Attempts allowed per client IP per minute, checked BEFORE the token is
 * verified. The function runs without the gateway JWT check (this project's
 * ES256 session tokens are verified here, by `auth.getUser`), so this trims junk
 * traffic before it costs an Auth round trip. Best-effort only, like every
 * limiter in `_shared/ratelimit.ts`: state is per isolate, and production spreads
 * requests across isolates. The real protection is structural — a call needs a
 * live session and can only ever delete that session's own account.
 */
const PRE_AUTH_PER_IP = 20;

function corsFor(req: Request): Record<string, string> {
  return corsHeaders(req, {
    headers: 'authorization, x-client-info, apikey, content-type',
    methods: 'POST, OPTIONS',
    // Bearer-token endpoint with no cookie auth: any origin is harmless, and
    // the Android app (https://localhost) must be able to call it.
    reflectAnyWebOrigin: true,
  });
}

type StorageClient = ReturnType<typeof createClient>['storage'];

/** Remove every object under `<bucket>/<uid>/`, recursing into sub-folders. */
async function purgeFolder(storage: StorageClient, bucket: string, prefix: string): Promise<void> {
  const PAGE = 100;
  for (;;) {
    const { data, error } = await storage.from(bucket).list(prefix, { limit: PAGE });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data?.length) return;

    // Folders come back as entries with no id; files have one.
    const files = data.filter((o) => o.id).map((o) => `${prefix}/${o.name}`);
    const folders = data.filter((o) => !o.id).map((o) => `${prefix}/${o.name}`);
    for (const folder of folders) await purgeFolder(storage, bucket, folder);
    if (files.length) {
      const { error: rmErr } = await storage.from(bucket).remove(files);
      if (rmErr) throw new Error(`remove ${bucket}/${prefix}: ${rmErr.message}`);
    }
    // Only folders on this page, and they are now empty: nothing left to list.
    if (!files.length) return;
  }
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const ip = req.headers.get('CF-Connecting-IP') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (rateLimited(`account-delete:ip:${ip}`, PRE_AUTH_PER_IP)) {
    return json(429, { error: 'Too many attempts. Wait a minute and try again.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) return json(503, { error: 'Account deletion is not configured.' });

  // Identify the caller from their own token — never from the body.
  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: userData, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: 'Sign in again to delete your account.' });
  const uid = userData.user.id;

  if (rateLimited(`account-delete:${uid}`, 3)) {
    return json(429, { error: 'Too many attempts. Wait a minute and try again.' });
  }

  let body: { confirm?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid request.' });
  }
  if (body.confirm !== CONFIRMATION) return json(400, { error: 'Deletion was not confirmed.' });

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    for (const bucket of USER_BUCKETS) await purgeFolder(admin.storage, bucket, uid);
  } catch (e) {
    // Stop before deleting the user: an account that still exists can retry;
    // orphaned files belonging to a deleted account could never be reached.
    // Some files may already be gone; the account and every row are intact.
    console.error('account-delete storage purge failed', uid, String(e).slice(0, 300));
    return json(500, {
      error: 'Your account was not deleted because some of your files could not be removed. Please try again.',
    });
  }

  // Apple first, while the stored token still exists (deleting the user
  // cascades it away). A failed revocation does not block the deletion: the
  // person's right to remove their account does not depend on Apple's uptime,
  // and the outcome is reported and logged (without the token) instead.
  let appleRevoked: boolean | undefined;
  if (appleSubjectOf(userData.user)) {
    appleRevoked = await revokeStoredAppleToken(admin, uid);
    console.info(JSON.stringify({ fn: 'account-delete', uid, apple: appleRevoked ? 'revoked' : 'not-revoked' }));
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(uid);
  if (delErr) {
    console.error('account-delete deleteUser failed', uid, delErr.message);
    return json(500, { error: 'Your account was not deleted. Please try again.' });
  }

  return json(200, appleRevoked === undefined ? { deleted: true } : { deleted: true, appleRevoked });
});

/**
 * Revoke the Apple refresh token stored for this user, if any. False when the
 * feature is unconfigured, no token was stored (an account that signed in with
 * Apple before tokens were kept), or Apple refused — never throws.
 */
async function revokeStoredAppleToken(admin: SupabaseClient, uid: string): Promise<boolean> {
  const cfg = appleConfig();
  if (!cfg) return false;
  try {
    const { data } = await admin.from('apple_auth_tokens').select('token_ciphertext').eq('user_id', uid).maybeSingle();
    const stored = (data as { token_ciphertext?: string } | null)?.token_ciphertext;
    if (!stored) return false;
    return await revokeAppleToken(cfg, await decryptToken(stored, cfg.encryptionKey));
  } catch {
    return false;
  }
}
