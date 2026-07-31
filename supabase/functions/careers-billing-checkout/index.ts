// FinatriX Careers — billing checkout (Phase 4, Module 2).
//
// Creates a Stripe Checkout Session in `mode: 'payment'` — a single charge for
// one billing period, not an auto-renewing subscription. India's RBI e-mandate
// rules (AFA/3DS registration + 24h pre-debit notice) make a plain "subscription
// with a saved card" unreliable for Indian cards; one-time-per-period billing
// sidesteps that entirely and needs no special Stripe account enrollment.
// current_period_end is set from the webhook (careers-billing-webhook) once
// payment completes; public.expire_subscriptions() (see migrations +
// docs/OBSERVABILITY.md) is what demotes an unrenewed plan back to Free.
//
// Deploy:  supabase functions deploy careers-billing-checkout
// Secret:  supabase secrets set STRIPE_SECRET_KEY=sk_test_... (or sk_live_...)

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { rateLimited } from '../_shared/ratelimit.ts';
import { corsHeaders, CANONICAL_ORIGIN } from '../_shared/origins.ts';

const RATE_PER_MINUTE = Number(Deno.env.get('CAREERS_BILLING_RATE_PER_MINUTE') ?? '10');

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

type Period = 'monthly' | 'yearly';

/** application/x-www-form-urlencoded body, Stripe's classic API — no SDK needed for one call shape. */
function toForm(params: Record<string, string>): string {
  return Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

Deno.serve(async (req) => {
  const CORS = corsFor(req);
  const json = jsonWith(CORS);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) return json(503, { error: 'Payments are not configured yet.' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: userData, error: userErr } = await anonClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: 'Sign in to subscribe.' });
  const user = userData.user;

  if (rateLimited(user.id, RATE_PER_MINUTE)) {
    return json(429, { error: 'Too many attempts. Wait a minute and try again.' });
  }

  let body: { planId?: string; period?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }
  const planId = String(body.planId ?? '').trim();
  const period: Period = body.period === 'yearly' ? 'yearly' : 'monthly';
  if (!planId) return json(400, { error: 'Missing planId.' });

  const { data: plan, error: planErr } = await anonClient
    .from('subscription_plans')
    .select('id, name, price_monthly, price_yearly, currency, is_active')
    .eq('id', planId)
    .maybeSingle();
  if (planErr) return json(500, { error: 'Could not load that plan.' });
  if (!plan || !plan.is_active) return json(404, { error: 'That plan is not available.' });

  const price = period === 'yearly' ? Number(plan.price_yearly) : Number(plan.price_monthly);
  // Free and "contact us" (price 0, e.g. Enterprise) plans have nothing to check out.
  if (!Number.isFinite(price) || price <= 0) return json(400, { error: 'This plan has no self-serve checkout.' });

  const currency = String(plan.currency || 'INR').toLowerCase();
  const unitAmount = Math.round(price * 100); // smallest currency unit (paise for INR)

  const origin = req.headers.get('Origin');
  const returnOrigin = origin && /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin) ? origin : CANONICAL_ORIGIN;

  const form = toForm({
    mode: 'payment',
    'success_url': `${returnOrigin}/careers/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    'cancel_url': `${returnOrigin}/careers/billing?checkout=cancelled`,
    'customer_email': user.email ?? '',
    'client_reference_id': user.id,
    'metadata[user_id]': user.id,
    'metadata[plan_id]': plan.id,
    'metadata[period]': period,
    'invoice_creation[enabled]': 'true',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': currency,
    'line_items[0][price_data][unit_amount]': String(unitAmount),
    'line_items[0][price_data][product_data][name]': `FinatriX Careers — ${plan.name} (${period})`,
  });

  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });

  if (!stripeRes.ok) {
    const detail = await stripeRes.text().catch(() => '');
    console.error('stripe checkout session create failed', stripeRes.status, detail.slice(0, 500));
    return json(502, { error: 'Could not start checkout. Please try again.' });
  }

  const session = await stripeRes.json();
  return json(200, { url: session.url });
});
