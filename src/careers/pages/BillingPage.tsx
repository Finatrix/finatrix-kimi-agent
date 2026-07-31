/**
 * Billing (Phase 4, Module 2) — real checkout, one-time-per-period billing.
 * Not an auto-renewing subscription: India's RBI e-mandate rules make a plain
 * "subscription with a saved card" unreliable for Indian cards (see
 * supabase/functions/careers-billing-checkout for the full rationale), so a
 * plan purchase is a single Stripe Checkout payment that covers one period.
 * public.expire_subscriptions() (docs/OBSERVABILITY.md) demotes an unrenewed
 * plan back to Free once current_period_end passes.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { Tabs } from '../../tools/ui/Tabs';
import { PageHead, ToolFoot } from '../../tools/ui/common';
import { track } from '../../lib/analytics';
import { EmptyState, PageLoading, ErrorCard } from '../components/states';
import { useCareers } from '../context/CareersContext';
import {
  checkQuota, ensureFreeSubscription, getMySubscription, getUsageCounter, listBillingHistory, listPlans, startCheckout,
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
      notify('Checkout cancelled — you were not charged.', 'error');
      navigate('/careers/billing', { replace: true });
      return;
    }

    let cancelled = false;
    notify('Payment received — setting up your account…', 'ok');
    void (async () => {
      const deadline = Date.now() + 8000;
      let paid = false;
      while (!cancelled && Date.now() < deadline) {
        const sub = await getMySubscription(user.id).catch(() => null);
        if (sub && sub.plan_id !== 'free') { paid = true; break; }
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (cancelled) return;
      void load();
      if (paid) {
        track('subscription_success');
        navigate('/careers', { replace: true });
      } else {
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
