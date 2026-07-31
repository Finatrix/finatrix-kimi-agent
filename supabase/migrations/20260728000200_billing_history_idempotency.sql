-- Stripe redelivers webhook events (retries on timeout, duplicate delivery is
-- explicitly "may happen" per Stripe's docs). Without this, a redelivered
-- checkout.session.completed would insert a second billing_history row for
-- the same payment. provider_ref is the Stripe payment_intent id — unique per
-- real charge, so a partial unique index (ignoring the '' default used by
-- non-Stripe/manual rows) makes the webhook's insert idempotent via
-- ON CONFLICT DO NOTHING.
create unique index if not exists billing_history_provider_ref_idx
  on public.billing_history (provider, provider_ref)
  where provider_ref <> '';
