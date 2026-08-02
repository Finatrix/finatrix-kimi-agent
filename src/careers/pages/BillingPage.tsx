/**
 * Billing (Phase 4, Module 2) — real checkout, one-time-per-period billing.
 * Not an auto-renewing subscription: India's RBI e-mandate rules make a plain
 * "subscription with a saved card" unreliable for Indian cards (see
 * supabase/functions/careers-billing-checkout for the full rationale), so a
 * plan purchase is a single Stripe Checkout payment that covers one period.
 * public.expire_subscriptions() (docs/OBSERVABILITY.md) demotes an unrenewed
 * plan back to Free once current_period_end passes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { Tabs } from '../../tools/ui/Tabs';
import { PageHead, ToolFoot } from '../../tools/ui/common';
import { track } from '../../lib/analytics';
import { EmptyState, PageLoading, ErrorCard } from '../components/states';
import { useCareers } from '../context/CareersContext';
import {
  checkQuota, ensureFreeSubscription, getMySubscription, getUsageCounter, hasLapsedFromPaid,
  listBillingHistory, listPlans, startCheckout,
  type BillingPeriod,
} from '../services/subscriptions';
import type { BillingHistoryRow, SubscriptionPlanRow, SubscriptionRow, UsageCounterRow } from '../types/phase4';
import type { QuotaKind } from '../types/phase4';
import { toCareersError, type CareersError } from '../utils/errors';
import { formatDate } from '../utils/format';

const QUOTA_LABELS: Record<QuotaKind, string> = {
  ai_calls: 'AI analyses this month',
  storage_bytes: 'Storage used',
  resumes_count: 'Resume versions',
  applications_count: 'Applications tracked',
};

const PERIODS = [
  { key: 'monthly' as const, label: 'Monthly' },
  { key: 'yearly' as const, label: 'Yearly' },
];

function formatQuotaValue(kind: QuotaKind, n: number): string {
  if (kind === 'storage_bytes') return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return String(n);
}

/** Last subscription `updated_at` already reported as a lapse — see `load()`. */
const EXPIRY_SEEN_KEY = 'fx_sub_expiry_seen';

export default function BillingPage() {
  const { user } = useAuth();
  const { loading, error: ctxError, refresh } = useCareers();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [plans, setPlans] = useState<SubscriptionPlanRow[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [usage, setUsage] = useState<UsageCounterRow | null>(null);
  const [history, setHistory] = useState<BillingHistoryRow[]>([]);
  const [loadError, setLoadError] = useState<CareersError | null>(null);
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const [busy, setBusy] = useState('');
  /** `load()` runs on mount and after checkout; expiry is one fact, not two. */
  const expiryReported = useRef(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [p, sub, u, h] = await Promise.all([
        listPlans(),
        ensureFreeSubscription(user.id),
        getUsageCounter(user.id),
        listBillingHistory(user.id),
      ]);
      setPlans(p);
      setSubscription(sub);
      setUsage(u);
      setHistory(h);
      setLoadError(null);

      // A lapsed plan, observed. `expire_subscriptions()` demotes the row
      // server-side on a schedule, so nothing in the browser is told when it
      // happens — this is the first moment the app can see it, and without it
      // churn is invisible until someone emails to ask why Careers is locked.
      //
      // This used to test `status === 'expired'`, which never matched and made
      // the event unreachable: that function does NOT write such a status, it
      // sets plan_id='free' and leaves status 'active' (and `getMySubscription`
      // filters to active statuses anyway, so an 'expired' row could not even
      // be read here). Churn read as a flat zero, which looks like a metric
      // rather than a missing one.
      //
      // What a demotion actually leaves behind is a free plan on a row Stripe
      // provisioned. A user who never paid keeps the schema default provider
      // 'manual', and this page has no downgrade-to-free control, so the pair
      // means exactly one thing. Deduped on `updated_at` — stamped at the
      // moment of demotion — so a lapse is reported once and not on every
      // subsequent visit. The prior plan is deliberately not reported: the
      // demotion overwrote it, and guessing it from history would be a
      // different claim than the one this event makes.
      if (hasLapsedFromPaid(sub) && !expiryReported.current) {
        expiryReported.current = true;
        let seen = '';
        try { seen = localStorage.getItem(EXPIRY_SEEN_KEY) ?? ''; } catch { /* private mode */ }
        if (seen !== sub.updated_at) {
          try { localStorage.setItem(EXPIRY_SEEN_KEY, sub.updated_at); } catch { /* private mode */ }
          track('subscription_expired');
        }
      }
    } catch (e) {
      setLoadError(toCareersError(e));
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  // Land back here from Stripe Checkout with ?checkout=success|cancelled. Success
  // briefly polls for the webhook's DB update (it lands moments after the
  // redirect, not before it) so the paywall gate re-checks against a plan
  // that's actually paid, then continues into Careers rather than Home.
  useEffect(() => {
    const checkout = searchParams.get('checkout');
    if (!checkout || !user) return;

    if (checkout === 'cancelled') {
      track('checkout_failed', { where: 'abandoned' });
      notify('Checkout cancelled — you were not charged.', 'error');
      navigate('/careers/billing', { replace: true });
      return;
    }

    // Stripe sent us back with a successful payment. That is a real, separate
    // fact from access being granted: the money is taken here, and the webhook
    // that upgrades the plan lands moments later — or does not.
    track('checkout_completed');

    let cancelled = false;
    notify('Payment received — setting up your account…', 'ok');
    void (async () => {
      const deadline = Date.now() + 8000;
      let paid = false;
      let plan = '';
      while (!cancelled && Date.now() < deadline) {
        const sub = await getMySubscription(user.id).catch(() => null);
        if (sub && sub.plan_id !== 'free') { paid = true; plan = sub.plan_id; break; }
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (cancelled) return;
      void load();
      if (paid) {
        // First subscription or renewal? Counted from billing history rather
        // than from the subscription row, which the webhook has just
        // overwritten — by the time we get here a renewal and a first purchase
        // look identical on that row. Reading React state instead would be
        // worse still: `load()` is async and `subscription` is reliably null
        // this early, so every renewal would be reported as a new customer.
        // History is append-only and written by the same webhook, so counting
        // paid rows answers the question exactly.
        const priorPaid = await listBillingHistory(user.id)
          .then((rows) => rows.filter((r) => r.status === 'paid').length)
          .catch(() => 0);
        // The gap between `checkout_completed` and this pair is the failure the
        // launch review called out as invisible: money taken, access not
        // granted. It is now a subtraction on a dashboard rather than a support
        // email.
        //
        // Written as two statements rather than one ternary so the event names
        // are greppable — `analytics.taxonomy.test.ts` scans source for
        // `track('<name>'` to prove nothing is declared but unsent, and a name
        // hidden inside a conditional expression reads to it as never emitted.
        if (priorPaid > 1) track('subscription_renewed', { plan });
        else track('subscription_started', { plan });
        navigate('/careers/dashboard', { replace: true });
      } else {
        // Not necessarily lost — the webhook may simply be slow — but a
        // customer who has paid and cannot get in is the single most urgent
        // thing this product can do wrong, so it is recorded distinctly.
        track('checkout_failed', { where: 'activation' });
        notify('Still finishing up — refresh in a moment if Careers looks locked.', 'ok');
        navigate('/careers/billing', { replace: true });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const currentPlan = plans.find((p) => p.id === subscription?.plan_id) ?? null;
  const otherPlans = plans.filter((p) => p.id !== 'free').sort((a, b) => a.sort_order - b.sort_order);

  const subscribe = async (planId: string) => {
    setBusy(planId);
    const result = await startCheckout(planId, period);
    if ('error' in result) {
      notify(result.error, 'error');
      setBusy('');
      return;
    }
    window.location.href = result.url; // leaving the app for Stripe Checkout
  };

  if (loading) return <PageLoading />;

  return (
    <div className="fx-page">
      <PageHead chip="Billing" chipColor="#D4AF37" chipBg="rgba(212,175,55,.12)" icon="goal" title="Plans &amp; billing">
        Finance tools stay free, always. Compare Careers plans and manage your subscription.
      </PageHead>

      {(ctxError || loadError) && <ErrorCard error={(ctxError ?? loadError)!} onRetry={() => { void refresh(); void load(); }} />}

      {subscription && currentPlan && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="panel-eyebrow">Your plan</div>
          <div className="panel-title">{currentPlan.name}</div>
          <div className="job-meta" style={{ marginBottom: 12 }}>
            <span className="badge badge-gold">{subscription.status}</span>
            {subscription.current_period_end && currentPlan.id !== 'free' && (
              <span>Renews by {formatDate(subscription.current_period_end)}</span>
            )}
          </div>
          {usage && (['ai_calls', 'resumes_count', 'applications_count', 'storage_bytes'] as QuotaKind[]).map((kind) => {
            const q = checkQuota(kind, currentPlan, usage);
            const pct = q.limit ? Math.min(100, Math.round((q.used / q.limit) * 100)) : 0;
            return (
              <div className="cat-row" key={kind}>
                <span className="cat-label">{QUOTA_LABELS[kind]}</span>
                <div className="bar"><div className="bar-fill" style={{ width: `${q.limit ? pct : 100}%`, background: q.exceeded ? 'var(--red)' : 'var(--gold)' }} /></div>
                <span className="cat-val">{formatQuotaValue(kind, q.used)}{q.limit != null ? ` / ${formatQuotaValue(kind, q.limit)}` : ' / ∞'}</span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div className="panel-eyebrow" style={{ marginBottom: 0 }}>Plans</div>
        <Tabs items={PERIODS} active={period} onChange={setPeriod} label="Billing period" />
      </div>
      <div className="dash-grid" style={{ marginBottom: 20 }}>
        {otherPlans.map((p) => {
          const price = period === 'yearly' ? p.price_yearly : p.price_monthly;
          const isCurrent = p.id === subscription?.plan_id;
          const canCheckout = price > 0;
          return (
            <div className="card" key={p.id} style={{ padding: 16, border: isCurrent ? '1px solid var(--gold)' : undefined }}>
              <b>{p.name}</b>
              <div style={{ fontSize: 22, fontWeight: 700, margin: '8px 0' }}>
                {canCheckout ? `${p.currency} ${price.toLocaleString()}/${period === 'yearly' ? 'yr' : 'mo'}` : 'Contact us'}
              </div>
              <ul style={{ fontSize: 12.5, color: 'var(--ink2)', paddingLeft: 18, marginBottom: 12 }}>
                {p.features.map((f) => <li key={f}>{f}</li>)}
              </ul>
              {isCurrent ? (
                <span className="badge badge-gold">Current plan</span>
              ) : canCheckout ? (
                <button className={`btn btn-sm ${busy === p.id ? 'btn-loading' : ''}`} disabled={!!busy} onClick={() => void subscribe(p.id)}>
                  Subscribe
                </button>
              ) : (
                <a className="btn btn-ghost btn-sm" href="mailto:finatrix.hub@gmail.com?subject=Enterprise%20plan">Contact us</a>
              )}
            </div>
          );
        })}
      </div>

      <div className="panel-eyebrow" style={{ marginBottom: 10 }}>Billing history</div>
      {!history.length ? (
        <div className="card"><EmptyState icon="goal" title="No billing history yet">Invoices will appear here once you subscribe to a paid plan.</EmptyState></div>
      ) : (
        <div className="card">
          {history.map((h) => (
            <div className="act-row" key={h.id}>
              <span style={{ flex: 1 }}>{h.currency} {h.amount.toLocaleString()} · {h.provider}</span>
              <span className={`badge ${h.status === 'paid' ? 'badge-green' : h.status === 'failed' ? 'badge-red' : 'badge-mute'}`}>{h.status}</span>
              {h.invoice_url ? <a className="note" href={h.invoice_url} target="_blank" rel="noopener noreferrer">Receipt</a> : <span className="note">{formatDate(h.created_at)}</span>}
            </div>
          ))}
        </div>
      )}

      <ToolFoot><b>Billing</b> · one-time payment per period via Stripe — plans don't auto-renew, so renew before your period ends to keep your limits</ToolFoot>
    </div>
  );
}
