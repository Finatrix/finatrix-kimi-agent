// FinatriX — remember the Apple refresh token from a Sign in with Apple, so
// account deletion can revoke it (App Review 5.1.1(v); see
// _shared/appleSignIn.ts for the whole design).
//
// The client calls this once, straight after an Apple sign-in, with the
// provider refresh token Supabase handed it. Nothing is stored on the client's
// word: the token is exchanged with Apple first, and kept only if Apple
// confirms it is live AND issued for the very Apple account linked to the
// caller. A token for someone else, an expired one, or a Google token sent by
// mistake are all refused without being written anywhere.
//
// Deploy:  supabase functions deploy apple-token --no-verify-jwt
//          (identity is verified here with auth.getUser, like account-delete)
// Needs:   the APPLE_SIWA_* and APPLE_TOKEN_ENC_KEY secrets; without them it
//          answers 503 and the app carries on (the feature is simply off).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { rateLimited } from '../_shared/ratelimit.ts';
import { corsHeaders } from '../_shared/origins.ts';
import {
  appleConfig,
  appleSubjectForRefreshToken,
  appleSubjectOf,
  encryptToken,
  plausibleAppleToken,
} from '../_shared/appleSignIn.ts';

function corsFor(req: Request): Record<string, string> {
  return corsHeaders(req, {
    headers: 'authorization, x-client-info, apikey, content-type',
    methods: 'POST, OPTIONS',
    // Bearer-token endpoint with no cookie auth (same reasoning as account-delete).
    reflectAnyWebOrigin: true,
  });
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const ip = req.headers.get('CF-Connecting-IP') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (rateLimited(`apple-token:ip:${ip}`, 20)) return json(429, { error: 'Too many requests.' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const cfg = appleConfig();
  if (!supabaseUrl || !anonKey || !serviceKey || !cfg) return json(503, { error: 'Not configured.' });

  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: userData, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: 'Not signed in.' });
  const uid = userData.user.id;
  if (rateLimited(`apple-token:${uid}`, 5)) return json(429, { error: 'Too many requests.' });

  const subject = appleSubjectOf(userData.user);
  if (!subject) return json(409, { error: 'No Apple account is linked.' });

  let body: { token?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid request.' });
  }
  if (!plausibleAppleToken(body.token)) return json(400, { error: 'Invalid token.' });

  const owner = await appleSubjectForRefreshToken(cfg, body.token);
  if (owner !== subject) {
    // Never log the token. The subject mismatch is the interesting part.
    console.warn(JSON.stringify({ fn: 'apple-token', uid, outcome: owner ? 'subject-mismatch' : 'rejected-by-apple' }));
    return json(422, { error: 'Apple did not confirm this sign-in.' });
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.from('apple_auth_tokens').upsert(
    { user_id: uid, token_ciphertext: await encryptToken(body.token, cfg.encryptionKey), updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (error) {
    console.error(JSON.stringify({ fn: 'apple-token', uid, outcome: 'store-failed', code: error.code }));
    return json(500, { error: 'Could not store.' });
  }
  console.info(JSON.stringify({ fn: 'apple-token', uid, outcome: 'stored' }));
  return new Response(null, { status: 204, headers: cors });
});
