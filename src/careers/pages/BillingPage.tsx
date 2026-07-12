/**
 * Subscription Platform (Phase 4, Module 1) — plan comparison, current
 * subscription with usage vs. quota, coupon redemption, billing history,
 * upgrade/downgrade/cancel. No live payment gateway yet (Module 2,
 * deferred): plan changes take effect immediately, exactly like a payment
 * webhook will do once Stripe/Razorpay checkout is wired in.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { PageHead, ToolFoot } from '../../tools/ui/common';
import { EmptyState, ErrorCard, PageLoading } from '../components/states';
import { useCareers } from '../context/CareersContext';
import {
  applyCoupon,
  cancelSubscription,
  changePlan,
  checkQuota,
  ensureFreeSubscription,
  getUsageCounter,
  listBillingHistory,
  listPlans,
} from '../services/subscriptions';
import type { BillingHistoryRow, QuotaKind, SubscriptionPlanRow, SubscriptionRow, UsageCounterRow } from '../types/phase4';
import { toCareersError, type CareersError } from '../utils/errors';
import { formatDate } from '../utils/format';

const QUOTA_LABELS: Record<QuotaKind, string> = {
  ai_calls: 'AI analyses this month',
  storage_bytes: 'Storage used',
  resumes_count: 'Resume versions',
  applications_count: 'Applications tracked',
};

function formatQuotaValue(kind: QuotaKind, n: number): string {
  if (kind === 'storage_bytes') return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return String(n);
}

export default function BillingPage() {
  const { user } = useAuth();
  const { loading, error: ctxError, refresh } = useCareers();
  const { notify } = useToast();

  const [plans, setPlans] = useState<SubscriptionPlanRow[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [usage, setUsage] = useState<UsageCounterRow | null>(null);
  const [history, setHistory] = useState<BillingHistoryRow[]>([]);
  const [loadError, setLoadError] = useState<CareersError | null>(null);
  const [coupon, setCoupon] = useState('');
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

  useEffect(() => {
    void load();
  }, [load]);

  const currentPlan = plans.find((p) => p.id === subscription?.plan_id) ?? null;

  const upgrade = async (planId: string, trialDays: number) => {
    if (!user || !subscription) return;
    setBusy(planId);
    try {
      const updated = await changePlan(user.id, subscription.id, planId, trialDays);
      setSubscription(updated);
      notify(`Switched to the ${planId} plan.`, 'ok');
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const cancel = async () => {
    if (!user || !subscription) return;
    setBusy('cancel');
    try {
      const updated = await cancelSubscription(user.id, subscription.id);
      setSubscription(updated);
      notify('Your plan will not renew at the end of the period.', 'ok');
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const redeemCoupon = async () => {
    if (!user || !subscription || !coupon.trim()) return;
    setBusy('coupon');
    try {
      const updated = await applyCoupon(user.id, subscription.id, coupon.trim());
      setSubscription(updated);
      setCoupon('');
      notify('Coupon applied.', 'ok');
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    } finally {
      setBusy('');
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div className="fx-page">
      <PageHead chip="Billing" chipColor="#D4AF37" chipBg="rgba(212,175,55,.12)" icon="goal" title="Plans &amp; billing">
        Compare plans, track your usage against quota, and manage your subscription.
      </PageHead>

      {(ctxError || loadError) && <ErrorCard error={(ctxError ?? loadError)!} onRetry={() => { void refresh(); void load(); }} />}

      {subscription && currentPlan && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="panel-eyebrow">Current plan</div>
          <div className="panel-title">{currentPlan.name}</div>
          <div className="job-meta" style={{ marginBottom: 12 }}>
            <span className="badge badge-gold">{subscription.status}</span>
            {subscription.trial_ends_at && <span>Trial ends {formatDate(subscription.trial_ends_at)}</span>}
            {subscription.cancel_at_period_end && <span className="badge badge-red">cancels at period end</span>}
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
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <input className="fi" style={{ maxWidth: 200 }} placeholder="Coupon code" value={coupon} onChange={(e) => setCoupon(e.target.value)} />
            <button className={`btn btn-ghost btn-sm ${busy === 'coupon' ? 'btn-loading' : ''}`} disabled={!!busy} onClick={() => void redeemCoupon()}>Apply coupon</button>
            {subscription.plan_id !== 'free' && !subscription.cancel_at_period_end && (
              <button className={`btn btn-ghost btn-sm ${busy === 'cancel' ? 'btn-loading' : ''}`} disabled={!!busy} onClick={() => void cancel()}>Cancel plan</button>
            )}
          </div>
        </div>
      )}

      <div className="panel-eyebrow" style={{ marginBottom: 10 }}>Plans</div>
      <div className="dash-grid" style={{ marginBottom: 20 }}>
        {plans.map((p) => (
          <div className="card" key={p.id} style={{ padding: 16, border: p.id === subscription?.plan_id ? '1px solid var(--gold)' : undefined }}>
            <b>{p.name}</b>
            <div style={{ fontSize: 22, fontWeight: 700, margin: '8px 0' }}>
              {p.price_monthly ? `${p.currency} ${p.price_monthly}/mo` : p.id === 'enterprise' ? 'Contact us' : 'Free'}
            </div>
            <ul style={{ fontSize: 12.5, color: 'var(--ink2)', paddingLeft: 18, marginBottom: 12 }}>
              {p.features.map((f) => <li key={f}>{f}</li>)}
            </ul>
            {p.id !== subscription?.plan_id && p.id !== 'enterprise' && (
              <button className={`btn btn-sm ${busy === p.id ? 'btn-loading' : ''}`} disabled={!!busy} onClick={() => void upgrade(p.id, p.trial_days)}>
                {p.trial_days > 0 ? `Start ${p.trial_days}-day trial` : 'Switch plan'}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="panel-eyebrow" style={{ marginBottom: 10 }}>Billing history</div>
      {!history.length ? (
        <div className="card"><EmptyState icon="goal" title="No billing history yet">Invoices will appear here once you're on a paid plan.</EmptyState></div>
      ) : (
        <div className="card">
          {history.map((h) => (
            <div className="act-row" key={h.id}>
              <span style={{ flex: 1 }}>{h.currency} {h.amount.toLocaleString()} · {h.provider}</span>
              <span className={`badge ${h.status === 'paid' ? 'badge-green' : h.status === 'failed' ? 'badge-red' : 'badge-mute'}`}>{h.status}</span>
              <span className="note">{formatDate(h.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      <ToolFoot><b>Billing</b> · payment gateway integration (Stripe/Razorpay) is coming — plan changes take effect immediately</ToolFoot>
    </div>
  );
}
