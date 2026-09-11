/**
 * The Careers plan cards, shared by every surface that sells a plan.
 *
 * There are three of those — `/pricing`, the public `/careers` landing page,
 * and the in-app Careers Pro paywall — and until now only `/pricing` had a card
 * worth buying from. The landing page linked away to `/pricing` instead of
 * showing a price at all, and the paywall rendered a plainer card that omitted
 * the featured plan, the yearly saving and the "who is this for" line. A buyer
 * therefore saw a different, weaker answer to "what does it cost" depending on
 * which door they came through.
 *
 * One card, three surfaces. The `cta` prop is the only thing that differs: the
 * public pages send an anonymous visitor to sign-up, while the paywall already
 * has a signed-in user and starts Stripe checkout directly.
 */

import { Link } from 'react-router';
import { CAREERS_PLANS, formatInr, yearlySavingPct, type PlanCopy } from '../shared/plans';
import { SegmentedControl } from './ui';

export type BillingPeriod = 'monthly' | 'yearly';

/** Not exported: a value export alongside components breaks Fast Refresh. */
const BILLING_PERIODS = [
  { key: 'monthly' as const, label: 'Monthly' },
  { key: 'yearly' as const, label: 'Yearly' },
];

/**
 * How a card's button behaves. `link` is the public path (sign-up, pricing);
 * `action` is used where the surface can act immediately, i.e. the signed-in
 * paywall starting checkout.
 */
export type PlanCta =
  | { kind: 'link'; to: string; label?: (plan: PlanCopy) => string }
  | {
      kind: 'action';
      onSelect: (planId: string) => void;
      busyPlanId?: string;
      label?: (plan: PlanCopy) => string;
    };

const defaultLabel = (plan: PlanCopy) => `Get ${plan.name}`;

export function PlanCard({
  plan,
  period,
  cta,
}: {
  plan: PlanCopy;
  period: BillingPeriod;
  cta: PlanCta;
}) {
  const price = period === 'yearly' ? plan.priceYearly : plan.priceMonthly;
  const selfServe = price > 0;
  const saving = period === 'yearly' ? yearlySavingPct(plan) : 0;
  const headingId = `plan-${plan.id}`;
  const label = (cta.label ?? defaultLabel)(plan);
  const busy = cta.kind === 'action' && cta.busyPlanId === plan.id;

  return (
    <li
      className="fx-glass relative flex h-full flex-col rounded-[18px] p-6"
      style={plan.featured ? { borderColor: 'var(--accent-text)' } : undefined}
    >
      {plan.featured && (
        <span className="absolute -top-2.5 left-6 rounded-full bg-[#D4AF37] px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-black">
          Most chosen
        </span>
      )}

      <h3 id={headingId} className="text-[16px] font-semibold tracking-[-0.01em] text-ink">
        {plan.name}
      </h3>

      <p className="mt-3">
        {selfServe ? (
          <>
            <span className="text-[30px] font-semibold tracking-[-0.03em] text-ink">
              {formatInr(price)}
            </span>
            <span className="ml-1 text-[13px] text-ink-3">
              {period === 'yearly' ? '/year' : '/month'}
            </span>
          </>
        ) : (
          <span className="text-[24px] font-semibold tracking-[-0.03em] text-ink">Talk to us</span>
        )}
      </p>

      {/* An empty reserved line rather than a conditional one: without it the
          card's height changes when the billing period toggles, which shifts
          every card below it (CLS on a deliberate, repeated interaction). */}
      <p className="mt-1 min-h-[18px] font-mono text-[10px] uppercase tracking-[0.12em] text-accent-text">
        {saving > 0 ? `Save ${saving}% vs monthly` : ' '}
      </p>

      <p className="mt-3 text-[13.5px] leading-[1.6] text-ink-2">{plan.bestFor}</p>

      <ul className="mt-4 flex-1 space-y-2 text-[13.5px] leading-[1.55] text-ink-2">
        {plan.features.map((f) => (
          <li key={f} className="flex gap-2.5">
            <span aria-hidden="true" className="mt-[2px] shrink-0 text-accent-text">
              ✓
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        {!selfServe ? (
          <a
            href="mailto:finatrix.hub@gmail.com?subject=FinatriX%20Careers%20Enterprise"
            // The accessible name has to say WHICH plan: a screen-reader user
            // tabbing this grid otherwise hears the same label four times with
            // nothing to tell them apart (WCAG 2.4.4).
            aria-describedby={headingId}
            className="fx-btn-ghost block w-full rounded-full py-3 text-center font-mono text-[11px] uppercase tracking-[0.1em]"
          >
            Contact sales
          </a>
        ) : cta.kind === 'link' ? (
          <Link
            to={cta.to}
            aria-describedby={headingId}
            className="fx-btn-gold block w-full rounded-full py-3 text-center font-mono text-[11px] uppercase tracking-[0.1em]"
          >
            {label}
          </Link>
        ) : (
          <button
            type="button"
            aria-describedby={headingId}
            aria-busy={busy || undefined}
            disabled={!!cta.busyPlanId}
            onClick={() => cta.onSelect(plan.id)}
            className="fx-btn-gold block w-full rounded-full py-3 text-center font-mono text-[11px] uppercase tracking-[0.1em]"
          >
            {busy ? 'Starting…' : label}
          </button>
        )}
      </div>
    </li>
  );
}

/** The full grid plus its monthly/yearly control. */
export function PlanGrid({
  period,
  onPeriodChange,
  cta,
  plans = CAREERS_PLANS,
}: {
  period: BillingPeriod;
  onPeriodChange: (p: BillingPeriod) => void;
  cta: PlanCta;
  plans?: readonly PlanCopy[];
}) {
  return (
    <>
      <div className="mb-6 flex justify-center">
        <SegmentedControl
          options={BILLING_PERIODS}
          value={period}
          onChange={onPeriodChange}
          label="Billing period"
        />
      </div>
      <ul
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))' }}
      >
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} period={period} cta={cta} />
        ))}
      </ul>
    </>
  );
}
