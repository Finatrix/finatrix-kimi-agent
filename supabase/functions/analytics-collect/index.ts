// FinatriX — privacy-first analytics ingest.
//
// Public, cookieless, anonymous endpoint. It accepts a small batch of allowlisted
// events from the browser and writes them with the service role (so the table can
// deny all direct client writes). It NEVER stores the IP or any device signal —
// the IP is used only, in memory, for abuse rate-limiting and is then discarded.
//
// Deploy:  supabase functions deploy analytics-collect --no-verify-jwt
//   (public on purpose — there is no user to authenticate; abuse is bounded by
//    per-IP rate limiting + strict validation + a table clients cannot read.)
//
// ⚠️ THE `--no-verify-jwt` FLAG IS LOAD-BEARING, NOT A PREFERENCE.
// The client ships batches with `navigator.sendBeacon`, which cannot attach an
// Authorization header. Deployed with the platform default (verify_jwt = true)
// the gateway answers 401 UNAUTHORIZED_NO_AUTH_HEADER *before* this code runs,
// and because beacons are fire-and-forget the browser never notices — so 100%
// of analytics, error reports and web vitals vanish while every dashboard shows
// a plausible, empty zero. That is exactly what happened in production; a
// re-deploy without the flag silently re-breaks it. `npm run verify:deploy`
// probes this endpoint anonymously and fails when the gate is back on.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { rateLimited } from '../_shared/ratelimit.ts';
import { corsHeaders } from '../_shared/origins.ts';

const RATE_PER_MINUTE = Number(Deno.env.get('ANALYTICS_RATE_PER_MINUTE') ?? '120');
const MAX_BODY_BYTES = 16_384;
const MAX_EVENTS = 50;

// CORS: see ../_shared/origins.ts. This endpoint is UNAUTHENTICATED, so the
// allowlist stays strict — `reflectAnyWebOrigin: false` — or any site on the
// internet could post events into FinatriX's analytics table.

// Must mirror the client taxonomy in src/lib/analytics.ts.
const ALLOWED_EVENTS = new Set([
  'page_view', 'tool_view', 'tool_completed', 'signup_prompt_shown',
  'signup_prompt_action', 'search_performed', 'careers_view', 'web_vital',
  'app_error', 'route_not_found',
]);
const ALLOWED_PROP_KEYS = new Set([
  'tool', 'route', 'action', 'metric', 'rating', 'value', 'bucket',
  'kind', 'where', 'count', 'ok', 'step',
]);
const MAX_STRING = 64;

function corsFor(req: Request): Record<string, string> {
  return corsHeaders(req, {
    headers: 'content-type',
    methods: 'POST, OPTIONS',
    reflectAnyWebOrigin: false,
  });
}

function sanitizeProps(input: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!input || typeof input !== 'object') return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!ALLOWED_PROP_KEYS.has(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, MAX_STRING);
  }
  return out;
}

Deno.serve(async (req) => {
  const CORS = corsFor(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  // Per-IP burst limiting. The IP is read for this check only and never stored.
  const ip = req.headers.get('CF-Connecting-IP') ?? req.headers.get('x-forwarded-for') ?? 'unknown';
  if (rateLimited(`analytics:${ip}`, RATE_PER_MINUTE)) {
    return new Response(null, { status: 429, headers: CORS });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return new Response(null, { status: 413, headers: CORS });

  let body: { sid?: unknown; events?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400, headers: CORS });
  }

  const sid = typeof body.sid === 'string' ? body.sid.slice(0, 64) : '';
  const events = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS) : [];
  if (!sid || events.length === 0) return new Response(null, { status: 204, headers: CORS });

  const rows: { session_id: string; event: string; props: Record<string, unknown>; client_t: number | null }[] = [];
  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue;
    const e = (ev as { e?: unknown }).e;
    if (typeof e !== 'string' || !ALLOWED_EVENTS.has(e)) continue;
    const t = (ev as { t?: unknown }).t;
    rows.push({
      session_id: sid,
      event: e,
      props: sanitizeProps((ev as { p?: unknown }).p),
      client_t: typeof t === 'number' && Number.isFinite(t) ? Math.round(t) : null,
    });
  }
  if (rows.length === 0) return new Response(null, { status: 204, headers: CORS });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { error } = await admin.from('analytics_events').insert(rows);
  if (error) {
    console.error('analytics-collect insert failed', error.message);
    return new Response(null, { status: 502, headers: CORS });
  }
  return new Response(null, { status: 204, headers: CORS });
});
