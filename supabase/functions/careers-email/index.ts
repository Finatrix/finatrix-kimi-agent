// FinatriX Careers — transactional email edge function (Phase 4, Module 9).
//
// Resend-ready: if RESEND_API_KEY is not set, the function responds
// 200 { sent: false, reason: 'not-configured' } instead of erroring, so the
// client always gets a graceful result and callers never need to special-
// case "email isn't set up yet". Once the secret is set, it sends for real.
//
// Deploy:  supabase functions deploy careers-email
// Secret:  supabase secrets set RESEND_API_KEY=re_...
// Optional: EMAIL_FROM="FinatriX Careers <careers@finatrix.co>"

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { rateLimited } from '../_shared/ratelimit.ts';
import { corsHeaders } from '../_shared/origins.ts';

const RATE_PER_MINUTE = Number(Deno.env.get('CAREERS_EMAIL_RATE_PER_MINUTE') ?? '5');

// CORS: see ../_shared/origins.ts for why the allowlist is built from
// CANONICAL_HOST and CAREERS_ALLOWED_ORIGINS is additive. Bearer-JWT
// authenticated and cookieless, so reflecting any well-formed web origin is
// safe (no ambient credentials to ride on) and stops allowlist drift after a
// domain change from surfacing as a browser "CORS" error.
function corsFor(req: Request): Record<string, string> {
  return corsHeaders(req, {
    headers: 'authorization, x-client-info, apikey, content-type',
    methods: 'POST, OPTIONS',
    reflectAnyWebOrigin: true,
  });
}

function jsonWith(cors: Record<string, string>) {
  return (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  const CORS = corsFor(req);
  const json = jsonWith(CORS);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: userData, error: userErr } = await anonClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: 'Sign in to send email.' });

  // The authenticated user's verified email address — the only allowed recipient.
  // This prevents the function from being used as an open relay: an authenticated
  // user cannot send email to arbitrary third-party addresses using FinatriX's
  // Resend API key and sender domain.
  const userEmail = userData.user.email;
  if (!userEmail) return json(403, { error: 'Your account has no verified email address.' });

  // Burst protection (per-isolate) — email is the most abuse-sensitive endpoint.
  if (rateLimited(userData.user.id, RATE_PER_MINUTE)) {
    return json(429, { error: 'Too many emails. Wait a minute and try again.' });
  }

  let body: { to?: string; subject?: string; html?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }
  const to = String(body.to ?? '').trim();
  const subject = String(body.subject ?? '').slice(0, 200);
  const html = String(body.html ?? '');
  const text = String(body.text ?? '');
  if (!to || !subject || (!html && !text)) return json(400, { error: 'Missing to/subject/content.' });

  // Enforce that the recipient is the authenticated user's own email.
  // Case-insensitive comparison to handle normalisation differences.
  if (to.toLowerCase() !== userEmail.toLowerCase()) {
    return json(403, { error: 'You may only send email to your own account address.' });
  }

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    // Inert by design — no key configured yet. Not an error condition.
    return json(200, { sent: false, reason: 'not-configured' });
  }

  const from = Deno.env.get('EMAIL_FROM') ?? 'FinatriX Careers <onboarding@resend.dev>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html: html || undefined, text: text || undefined }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return json(502, { sent: false, reason: 'provider-error', detail: detail.slice(0, 300) });
  }
  return json(200, { sent: true });
});
