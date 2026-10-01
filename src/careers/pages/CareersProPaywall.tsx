/**
 * Careers Pro paywall — the entry screen CareersPaywallGate shows in place of
 * any /careers/* page for a signed-in user without a paid plan. Purely a UX
 * layer (see CareersPaywallGate's header comment); pricing and checkout both
 * come straight from the existing billing plumbing (subscriptions.ts) so
 * there's exactly one source of plan data and one checkout path in the app.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { PlanGrid, type BillingPeriod } from '../../marketing/PlanCards';
import { Icon } from '../../tools/ui/Icon';
import { track } from '../../lib/analytics';
import { startCheckout } from '../services/subscriptions';
import { canPurchaseInApp } from '../../native/platform';

const FEATURES = [
  'AI Match Score',
  'Resume Matching',
  'Multiple Job Providers',
  'Daily Updated Jobs',
  'Unlimited Searches',
  'Advanced Filters',
  'Faster Job Discovery',
];

export default function CareersProPaywall() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();

  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const [busy, setBusy] = useState('');

  // The plan list is no longer fetched here. It used to come from
  // `listPlans()`, which meant a network round-trip stood between a blocked
  // user and the only screen that can unblock them — and rendered nothing at
  // all if the request failed. The copy is a constant that `plans.test.ts`
  // pins against the database seed, and checkout still prices server-side from
  // that table, so the paywall now paints instantly and cannot mis-charge.
  useEffect(() => {
    track('careers_paywall_view');
  }, []);

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
    // Navigate to the hosted checkout returned by the billing service.
    window.location.href = result.url;
  };

  const purchasable = canPurchaseInApp();

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

      {!purchasable ? (
        /* Either app: Google Play and the App Store both forbid selling a digital
           service through an outside checkout, and pointing buyers at one, so there is no
           price and no buy button here — see `canPurchaseInApp`. What remains
           is honest and useful: what Pro is, that an existing membership works
           here, and a way back to the free tools. */
        <div className="card" style={{ textAlign: 'center', padding: '24px 20px', marginBottom: 24 }}>
          <p style={{ fontSize: 14.5, color: 'var(--ink)', margin: '0 0 6px', fontWeight: 600 }}>
            Careers Pro can't be purchased in the app.
          </p>
          <p style={{ fontSize: 13.5, color: 'var(--ink2)', margin: '0 0 18px' }}>
            Already a member? Sign in with the account that has Careers Pro and everything unlocks here.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            <Link className="btn btn-sm" to="/tools/dashboard" style={{ width: 'auto', textDecoration: 'none' }}>
              Back to money tools
            </Link>
          </div>
        </div>
      ) : (<>
      {/* The same plan card `/pricing` and the public /careers page render.
          This surface used to draw its own, weaker version: no featured plan,
          no yearly saving, no "who is this for" line, and every button reading
          "Start Careers Pro" so a screen-reader user heard the same label four
          times (WCAG 2.4.4). A buyer now sees one consistent answer to "what
          does it cost" whichever door they came through.

          Plan COPY comes from shared/plans (public, crawlable, and the same
          source /pricing quotes); the PRICE CHARGED still comes from the
          database server-side at checkout, so this cannot cause a wrong charge
          — `plans.test.ts` fails if the two ever disagree. */}
      <div style={{ marginBottom: 24 }}>
        <PlanGrid
          period={period}
          onPeriodChange={setPeriod}
          cta={{
            kind: 'action',
            onSelect: (planId) => void subscribe(planId),
            busyPlanId: busy || undefined,
            label: (plan) => `Start ${plan.name}`,
          }}
        />
      </div>

      {/* A paywall that offers only "buy" and "leave" loses everyone who simply
          wanted to read more first. Both routes out now go somewhere useful:
          the full pricing page (plan comparison, billing terms, refund policy)
          and the public Careers page (what the product actually does). Before
          this, neither existed — which is precisely why nobody could evaluate a
          ₹199–₹2,499/month product before being asked to pay for it. */}
      <div style={{ textAlign: 'center', display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
        <Link className="btn btn-ghost btn-sm" to="/pricing">
          Compare plans in detail
        </Link>
        <Link className="btn btn-ghost btn-sm" to="/careers">
          What is Careers?
        </Link>
        <button className="btn btn-ghost btn-sm" onClick={maybeLater} disabled={!!busy}>
          Maybe later
        </button>
      </div>

      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink3)', marginTop: 16, lineHeight: 1.7 }}>
        One payment per billing period — nothing auto-renews and no card is stored for future
        charges. See the{' '}
        <Link to="/refunds" className="fx-prose-link">
          refund policy
        </Link>
        .
      </p>
      </>)}
    </div>
  );
}
