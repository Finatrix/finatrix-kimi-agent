// FinatriX — look up a group's room code, and join with it (build step 2.2).
//
// A room code (shown as FX-7K2P9Q) is all that stands between a stranger and
// a family's shared spending, so it is checked here and never by the client:
//  1. the caller is verified from their own session (auth.getUser);
//  2. every lookup counts against a per-person and a per-IP hourly limit in
//     the shared quota table, which every isolate sees. If that table can't
//     answer, joining stops (fails closed) rather than allowing unlimited guesses;
//  3. Postgres does the lookup (`group_join_by_code`, service role only), and
//     with it the 7-day expiry, the 20-member limit and the 18+ confirmation.
//
// Codes are 6 characters of a 32-letter alphabet, about a billion in all, so
// guessing a live one at 20 lookups an hour per person and 60 per IP would take
// a very large number of accounts and addresses. Members also see everyone
// who joins, and the admin can remove them and reset the code.
//
// Request:   POST { code, action: 'preview' | 'join', displayName?, confirmAdult? }
// Responses: 200 { status, group? } for every lookup outcome:
//              ok · joined · already_member · not_found · expired · group_full
//              · too_many_groups · adult_confirmation_required
//            400 bad input · 401 no session · 405 · 429 too many lookups
//            · 503 not configured or limits unavailable · 500 lookup failed
// Contract for the app: docs/GROUPS.md.
//
// Deploy:  supabase functions deploy group-join --no-verify-jwt
//          (identity is verified here with auth.getUser, as in account-delete)
// Needs:   SUPABASE_SERVICE_ROLE_KEY (set automatically for deployed functions)

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { rateLimited } from '../_shared/ratelimit.ts';
import { corsHeaders } from '../_shared/origins.ts';
import { clientIp } from '../_shared/clientIp.ts';
import { privateQuotaKey, sharedQuotaState } from '../_shared/sharedQuota.ts';
import { normalizeGroupCode } from './code.ts';

/**
 * Requests per client IP per minute, checked per isolate BEFORE the token is
 * verified, to trim junk traffic before it costs an Auth round trip. The real
 * limits are the shared hourly ones below.
 */
const PRE_AUTH_PER_IP = 30;
const LOOKUPS_PER_PERSON_PER_HOUR = 20;
const LOOKUPS_PER_IP_PER_HOUR = 60;
const HOUR = 3600;
/** Matches `group_members_details` in the migration. */
const NAME_MAX = 40;
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

function corsFor(req: Request): Record<string, string> {
  return corsHeaders(req, {
    headers: 'authorization, x-client-info, apikey, content-type',
    methods: 'POST, OPTIONS',
    // Bearer-token endpoint with no cookie auth: any origin is harmless, and
    // the Android app (https://localhost) must be able to call it.
    reflectAnyWebOrigin: true,
  });
}

/** A display name as the database will store it, or null when it can't be one. */
function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  const length = Array.from(name).length;
  return length >= 1 && length <= NAME_MAX && !CONTROL_CHARS.test(name) ? name : null;
}

/** The name on the account, cut to fit, for a join that didn't send one. */
function accountName(metadata: Record<string, unknown> | undefined): string {
  const raw = typeof metadata?.full_name === 'string' ? metadata.full_name : '';
  const name = Array.from(raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim()).slice(0, NAME_MAX).join('').trim();
  return name || 'Member';
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const ip = clientIp(req.headers);
  if (ip && rateLimited(`group-join:ip:${ip}`, PRE_AUTH_PER_IP)) {
    return json(429, { error: 'Too many tries. Wait a minute and try again.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) return json(503, { error: 'Groups are not available right now.' });

  // Identify the caller from their own token — never from the body.
  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: userData, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: 'Sign in to join a group.' });
  const uid = userData.user.id;

  let body: { code?: unknown; action?: unknown; displayName?: unknown; confirmAdult?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid request.' });
  }
  const preview = body.action === 'preview';
  if (!preview && body.action !== 'join') return json(400, { error: 'Invalid request.' });

  // A string that can't be a code can't match a group, so it costs no lookup.
  const code = normalizeGroupCode(body.code);
  if (!code) return json(400, { error: 'invalid_code' });

  let displayName: string | null = null;
  if (!preview) {
    displayName = body.displayName === undefined ? accountName(userData.user.user_metadata) : cleanName(body.displayName);
    if (!displayName) return json(400, { error: 'invalid_name' });
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Fail closed: without a working limit, codes could be guessed freely.
  const limits = [await sharedQuotaState(admin, 'group-join:user:hour', uid, LOOKUPS_PER_PERSON_PER_HOUR, HOUR)];
  if (ip && limits[0] === 'ok') {
    const ipKey = await privateQuotaKey(ip, serviceKey);
    limits.push(await sharedQuotaState(admin, 'group-join:ip:hour', ipKey, LOOKUPS_PER_IP_PER_HOUR, HOUR));
  }
  if (limits.includes('unavailable')) return json(503, { error: 'Joining is unavailable right now. Try again soon.' });
  if (limits.includes('over')) return json(429, { error: 'Too many codes tried. Try again in an hour.' });

  const { data, error } = await admin.rpc('group_join_by_code', {
    p_user: uid,
    p_code: code,
    p_display_name: displayName,
    p_confirm_adult: body.confirmAdult === true,
    p_preview: preview,
  });
  if (error || !data) {
    // Never log the code: it is a live secret for seven days.
    console.error('group-join lookup failed', uid, String(error?.message ?? 'no data').slice(0, 300));
    return json(500, { error: 'Something went wrong. Try again.' });
  }
  return json(200, data);
});
