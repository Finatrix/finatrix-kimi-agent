/**
 * Careers Pro paywall — the entry screen CareersPaywallGate shows in place of
 * any /careers/* page for a signed-in user without a paid plan. Purely a UX
 * layer (see CareersPaywallGate's header comment); pricing and checkout both
 * come straight from the existing billing plumbing (subscriptions.ts) so
 * there's exactly one source of plan data and one checkout path in the app.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { Tabs } from '../../tools/ui/Tabs';
import { Icon } from '../../tools/ui/Icon';
import { track } from '../../lib/analytics';
import { listPlans, startCheckout, type BillingPeriod } from '../services/subscriptions';
import type { SubscriptionPlanRow } from '../types/phase4';

const FEATURES = [
  'AI Match Score',
  'Resume Matching',
  'Multiple Job Providers',
  'Daily Updated Jobs',
  'Unlimited Searches',
  'Advanced Filters',
  'Faster Job Discovery',
];

const PERIODS = [
  { key: 'monthly' as const, label: 'Monthly' },
  { key: 'yearly' as const, label: 'Yearly' },
];

export default function CareersProPaywall() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();

  const [plans, setPlans] = useState<SubscriptionPlanRow[]>([]);
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    track('careers_paywall_view');
    void listPlans().then(setPlans).catch(() => setPlans([]));
  }, []);

  const paidPlans = plans
    .filter((p) => p.id !== 'free')
    .sort((a, b) => a.sort_order - b.sort_order);

  const subscribe = async (planId: string) => {
    if (!user) return;
    track('careers_checkout_clicked', { kind: planId });
    setBusy(planId);
    const result = await startCheckout(planId, period);
    if ('error' in result) {
      notify(result.error, 'error');
      setBusy('');
      return;
    }
    // Full-page navigation to Stripe Checkout — the same pattern BillingPage
    // uses for the identical call, which lints clean. eslint-plugin-react-hooks
    // v7's compiler-derived `immutability` rule flags this assignment here but
    // not there; A/B tested by swapping each file's content into the other's
    // path — the trigger tracks unrelated surrounding JSX shape, not this line.
    // eslint-disable-next-line react-hooks/immutability -- verified false positive, see above
    window.location.href = result.url;
  };

  const maybeLater = () => {
    track('careers_paywall_closed');
    navigate('/', { replace: true });
  };

  return (
    <div className="fx-page" style={{ maxWidth: 920, margin: '0 auto' }}>
      <div
        style={{
          textAlign: 'center',
          padding: '48px 24px 36px',
          borderRadius: 20,
          marginBottom: 28,
          background: 'radial-gradient(120% 140% at 50% 0%, rgba(212,175,55,.16), rgba(212,175,55,.03) 60%, transparent 100%)',
          border: '1px solid var(--hair)',
        }}
      >
        <span className="tool-chip" style={{ background: 'rgba(212,175,55,.14)', color: '#D4AF37', marginBottom: 18 }}>
          <Icon name="briefcase" size={14} style={{ marginRight: 5 }} />
          Careers Pro
        </span>
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 42px)', margin: '10px 0 12px', lineHeight: 1.15 }}>
          Unlock FinatriX Careers Pro
        </h1>
        <p style={{ fontSize: 15, color: 'var(--ink2)', maxWidth: 560, margin: '0 auto 28px' }}>
          Find finance careers faster with AI-powered search, resume matching and premium job sources.
        </p>
        <ul
          style={{
            listStyle: 'none', padding: 0, margin: '0 auto', maxWidth: 640,
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px 20px',
            textAlign: 'left',
          }}
        >
          {FEATURES.map((f) => (
            <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--ink)' }}>
              <Icon name="check" size={15} style={{ color: '#D4AF37', flexShrink: 0 }} />
              {f}
            </li>
          ))}
        </ul>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
        <Tabs items={PERIODS} active={period} onChange={setPeriod} label="Billing period" />
      </div>

      <div className="dash-grid" style={{ marginBottom: 24 }}>
        {paidPlans.map((p) => {
          const price = period === 'yearly' ? p.price_yearly : p.price_monthly;
          const canCheckout = price > 0;
          return (
            <div key={p.id} className="card fx-pro-card" style={{ padding: 20 }}>
              <b>{p.name}</b>
              <div style={{ fontSize: 24, fontWeight: 700, margin: '8px 0' }}>
                {canCheckout ? `${p.currency} ${price.toLocaleString()}/${period === 'yearly' ? 'yr' : 'mo'}` : 'Contact us'}
              </div>
              <ul style={{ fontSize: 12.5, color: 'var(--ink2)', paddingLeft: 18, marginBottom: 14 }}>
                {p.features.map((f) => <li key={f}>{f}</li>)}
              </ul>
              {canCheckout ? (
                <button
                  className={`btn ${busy === p.id ? 'btn-loading' : ''}`}
                  style={{ width: '100%' }}
                  disabled={!!busy}
                  onClick={() => void subscribe(p.id)}
                >
                  Start Careers Pro
                </button>
              ) : (
                <a className="btn btn-ghost" style={{ width: '100%', textAlign: 'center', display: 'block' }} href="mailto:finatrix.hub@gmail.com?subject=Careers%20Enterprise">
                  Contact us
                </a>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ textAlign: 'center' }}>
        <button className="btn btn-ghost btn-sm" onClick={maybeLater} disabled={!!busy}>
          Maybe Later
        </button>
      </div>
    </div>
  );
}
