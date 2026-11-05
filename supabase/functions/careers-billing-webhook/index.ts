// FinatriX Careers — Stripe webhook (Phase 4, Module 2).
//
// Stripe calls this directly — no user session, no browser Origin, no CORS.
// Trust comes entirely from verifying the `Stripe-Signature` header against
// STRIPE_WEBHOOK_SECRET (Stripe's documented v1 HMAC-SHA256 scheme), computed
// with Web Crypto rather than pulling in the Stripe SDK for one check. That
// verification — the whole trust boundary — lives in `./signature.ts` so it can
// be tested without standing up the function; see `signature.test.ts`.
//
// Deploy:  supabase functions deploy careers-billing-webhook --no-verify-jwt
// Secret:  supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
// Then in the Stripe Dashboard: add an endpoint pointing at this function's
// URL, listening for checkout.session.completed / async_payment_succeeded /
// async_payment_failed / charge.refunded / charge.dispute.created, and copy the
// signing secret it gives you back here.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { verifyStripeSignature, periodEnd, renewalBase } from './signature.ts';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Idempotent insert: check-then-insert rather than an upsert ON CONFLICT,
 * because billing_history's uniqueness on (provider, provider_ref) is a
 * PARTIAL index (WHERE provider_ref <> '') — PostgREST's on_conflict= only
 * targets a plain column-list constraint, so it 400s (42P10) against a
 * partial one. A stray unique-violation on the insert (a genuinely
 * concurrent redelivery) means another delivery already recorded it, which
 * is exactly the "already handled" outcome we want, so it's swallowed too.
 */
async function recordBillingHistory(
  admin: ReturnType<typeof createClient>,
  row: { user_id: string; subscription_id?: string; amount: number; currency: string; status: string; provider: string; provider_ref: string; invoice_url?: string },
): Promise<void> {
  const { data: existing } = await admin
    .from('billing_history')
    .select('id')
    .eq('provider', row.provider)
    .eq('provider_ref', row.provider_ref)
    .maybeSingle();
  if (existing) return;
  const { error } = await admin.from('billing_history').insert(row);
  if (error && error.code !== '23505') console.error('billing_history insert failed', error.message);
}

async function fetchHostedInvoiceUrl(invoiceId: string | null, stripeKey: string): Promise<string> {
  if (!invoiceId) return '';
  try {
    const res = await fetch(`https://api.stripe.com/v1/invoices/${invoiceId}`, {
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    if (!res.ok) return '';
    const invoice = await res.json();
    return String(invoice.hosted_invoice_url ?? '');
  } catch {
    return '';
  }
}

/**
 * Take back what a refunded or disputed payment bought. Only the newest payment
 * demotes the plan: refunding last month's charge must not end a period the
 * customer has since paid for. The demotion mirrors expire_subscriptions(), and
 * `provider` stays 'stripe', which is what marks the row as lapsed from paid.
 */
async function revokePayment(
  admin: ReturnType<typeof createClient>,
  paymentIntent: string,
  status: 'refunded' | 'disputed',
): Promise<boolean> {
  const { data, error } = await admin
    .from('billing_history')
    .select('id, user_id, created_at')
    .eq('provider', 'stripe')
    .eq('provider_ref', paymentIntent)
    .eq('status', 'paid')
    .maybeSingle();
  if (error) {
    console.error('billing_history lookup failed', error.message);
    return false;
  }
  const row = data as { id: string; user_id: string; created_at: string } | null;
  if (!row) return true; // already revoked, or a payment this function never fulfilled

  const { error: markErr } = await admin.from('billing_history').update({ status }).eq('id', row.id);
  if (markErr) {
    console.error('billing_history update failed', markErr.message);
    return false;
  }

  const { data: newer } = await admin
    .from('billing_history')
    .select('id')
    .eq('user_id', row.user_id)
    .eq('status', 'paid')
    .gt('created_at', row.created_at)
    .limit(1);
  if (newer?.length) return true;

  const now = new Date().toISOString();
  const { error: demoteErr } = await admin
    .from('subscriptions')
    .update({
      plan_id: 'free',
      status: 'active',
      current_period_start: now,
      current_period_end: null,
      cancel_at_period_end: false,
      updated_at: now,
    })
    .eq('user_id', row.user_id)
    .in('status', ['trialing', 'active', 'past_due']);
  if (demoteErr) {
    console.error('subscription demotion failed', demoteErr.message);
    return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!webhookSecret || !stripeKey) return json(503, { error: 'Payments are not configured yet.' });

  const rawBody = await req.text();
  const signed = await verifyStripeSignature(rawBody, req.headers.get('Stripe-Signature'), webhookSecret);
  if (!signed) return json(400, { error: 'Invalid signature.' });

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json(400, { error: 'Invalid JSON.' });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
    const object = event.data.object as { payment_intent?: string | null; refunded?: boolean };
    // A partial refund leaves `refunded` false, and the customer keeps their access.
    if (!object.payment_intent || (event.type === 'charge.refunded' && !object.refunded)) {
      return json(200, { ok: true, skipped: true });
    }
    const status = event.type === 'charge.refunded' ? 'refunded' : 'disputed';
    const done = await revokePayment(admin, object.payment_intent, status);
    return done ? json(200, { ok: true }) : json(500, { error: 'Could not revoke access.' });
  }

  const session = event.data.object as {
    id: string; payment_intent: string | null; invoice: string | null;
    payment_status: string; amount_total: number | null; currency: string | null;
    customer: string | null; metadata: Record<string, string> | null;
  };

  if (event.type === 'checkout.session.async_payment_failed') {
    const meta = session.metadata ?? {};
    if (meta.user_id) {
      await recordBillingHistory(admin, {
        user_id: meta.user_id,
        amount: (session.amount_total ?? 0) / 100,
        currency: (session.currency ?? 'inr').toUpperCase(),
        status: 'failed',
        provider: 'stripe',
        provider_ref: session.payment_intent ?? session.id,
      });
    }
    return json(200, { ok: true });
  }

  const isFulfillable = event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded';
  if (!isFulfillable || session.payment_status !== 'paid') return json(200, { ok: true, skipped: true });

  const meta = session.metadata ?? {};
  const userId = meta.user_id;
  const planId = meta.plan_id;
  const period = meta.period === 'yearly' ? 'yearly' : 'monthly';
  if (!userId || !planId) {
    console.error('checkout.session missing metadata', session.id);
    return json(200, { ok: true, skipped: true }); // ack so Stripe stops retrying an unfulfillable event
  }

  // Stripe redelivers events, and a renewal now extends the period, so applying
  // the same payment twice would hand out a free extra period.
  const providerRef = session.payment_intent ?? session.id;
  const { data: alreadyPaid } = await admin
    .from('billing_history')
    .select('id')
    .eq('provider', 'stripe')
    .eq('provider_ref', providerRef)
    .eq('status', 'paid')
    .maybeSingle();
  if (alreadyPaid) return json(200, { ok: true, duplicate: true });

  const { data: current, error: currentErr } = await admin
    .from('subscriptions')
    .select('plan_id, current_period_end')
    .eq('user_id', userId)
    .in('status', ['trialing', 'active', 'past_due'])
    .maybeSingle();
  if (currentErr) {
    console.error('subscription lookup failed', currentErr.message);
    return json(500, { error: 'Could not read subscription.' });
  }

  const now = new Date();
  const patch = {
    plan_id: planId,
    status: 'active',
    trial_ends_at: null,
    current_period_start: now.toISOString(),
    current_period_end: periodEnd(period, renewalBase(now, current, planId)),
    cancel_at_period_end: false,
    coupon_code: null,
    provider: 'stripe',
    provider_customer_id: session.customer ?? '',
    provider_subscription_id: session.id,
    updated_at: now.toISOString(),
  };

  const { data: updated, error: updateErr } = await admin
    .from('subscriptions')
    .update(patch)
    .eq('user_id', userId)
    .in('status', ['trialing', 'active', 'past_due'])
    .select('id')
    .maybeSingle();
  if (updateErr) {
    console.error('subscription update failed', updateErr.message);
    return json(500, { error: 'Could not update subscription.' });
  }

  let subscriptionId = updated?.id as string | undefined;
  if (!subscriptionId) {
    const { data: inserted, error: insertErr } = await admin
      .from('subscriptions')
      .insert({ user_id: userId, ...patch })
      .select('id')
      .single();
    if (insertErr) {
      console.error('subscription insert failed', insertErr.message);
      return json(500, { error: 'Could not create subscription.' });
    }
    subscriptionId = inserted.id;
  }

  const invoiceUrl = await fetchHostedInvoiceUrl(session.invoice, stripeKey);
  await recordBillingHistory(admin, {
    user_id: userId,
    subscription_id: subscriptionId,
    amount: (session.amount_total ?? 0) / 100,
    currency: (session.currency ?? 'inr').toUpperCase(),
    status: 'paid',
    provider: 'stripe',
    provider_ref: providerRef,
    invoice_url: invoiceUrl,
  });

  return json(200, { ok: true });
});
