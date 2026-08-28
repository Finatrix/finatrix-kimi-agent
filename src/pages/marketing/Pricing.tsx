/**
 * /pricing — the page the product did not have.
 *
 * The pre-launch review's first blocker was that nobody could evaluate or price
 * a ₹199–₹2,499/month product before signing up: `/careers` was noindex and
 * auth-gated, and there was no pricing URL at all. This is the anonymous,
 * indexable answer to "what does it cost and what am I buying".
 *
 * Prices come from `src/shared/plans.ts` (constant, no fetch — see that file for
 * why) and the billing behaviour described here is the behaviour
 * `careers-billing-checkout` actually implements: a single Stripe charge per
 * period, no stored mandate, no auto-renewal, no trial.
 */

import { useState } from 'react';
import { Link } from 'react-router';
import MarketingPage from '../../marketing/MarketingPage';
import {
  Card, CtaRow, Facts, Faq, Grid, P, RelatedPages, Section, SegmentedControl, UL,
} from '../../marketing/ui';
import { TOOLS } from '../../lib/tools';
import { publicPageFor } from '../../shared/publicPages';
import {
  CAREERS_PLANS,
  formatInr,
  yearlySavingPct,
  type PlanCopy,
} from '../../shared/plans';
import { TOOL_COUNT, TOOL_COUNT_WORD } from '../../shared/toolCount';

const PATH = '/pricing';

type Period = 'monthly' | 'yearly';

const PERIODS = [
  { key: 'monthly' as const, label: 'Monthly' },
  { key: 'yearly' as const, label: 'Yearly' },
];

function PlanCard({ plan, period }: { plan: PlanCopy; period: Period }) {
  const price = period === 'yearly' ? plan.priceYearly : plan.priceMonthly;
  const selfServe = price > 0;
  const saving = period === 'yearly' ? yearlySavingPct(plan) : 0;
  const headingId = `plan-${plan.id}`;

  return (
    <li
      className={`fx-glass relative flex h-full flex-col rounded-[18px] p-6 ${
        plan.featured ? 'border-[color:var(--accent-text)]' : ''
      }`}
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
          <span className="text-[24px] font-semibold tracking-[-0.03em] text-ink">
            Talk to us
          </span>
        )}
      </p>

      {/* An empty reserved line rather than a conditional one: without it the
          card's height changes when the billing period toggles, which shifts
          every card below it (CLS on a deliberate, repeated interaction). */}
      <p className="mt-1 min-h-[18px] font-mono text-[10px] uppercase tracking-[0.12em] text-accent-text">
        {saving > 0 ? `Save ${saving}% vs monthly` : ' '}
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
        {selfServe ? (
          <Link
            to="/signup"
            // The accessible name has to say WHICH plan: a screen-reader user
            // tabbing this grid otherwise hears "Get started" four times with
            // nothing to tell them apart (WCAG 2.4.4).
            aria-describedby={headingId}
            className="fx-btn-gold block w-full rounded-full py-3 text-center font-mono text-[11px] uppercase tracking-[0.1em]"
          >
            Get {plan.name}
          </Link>
        ) : (
          <a
            href="mailto:finatrix.hub@gmail.com?subject=FinatriX%20Careers%20Enterprise"
            aria-describedby={headingId}
            className="fx-btn-ghost block w-full rounded-full py-3 text-center font-mono text-[11px] uppercase tracking-[0.1em]"
          >
            Contact sales
          </a>
        )}
      </div>
    </li>
  );
}

export default function Pricing() {
  const [period, setPeriod] = useState<Period>('monthly');
  const page = publicPageFor(PATH);

  return (
    <MarketingPage path={PATH} wide>
      <Section id="free-tools" title="The money tools are free. All of them.">
        <P>
          Every calculator on FinatriX is free to use with no account, no usage cap and no card.
          That is not a trial tier that quietly narrows later — it is the product. The tools exist
          to teach the arithmetic behind a financial decision, and a paywall in front of that would
          defeat the point of building them.
        </P>
        <Facts
          items={[
            { value: '₹0', label: 'Money tools' },
            { value: String(TOOL_COUNT), label: 'Free calculators' },
            { value: 'None', label: 'Ads or trackers' },
            { value: 'Anytime', label: 'Export or delete' },
          ]}
        />
        <ul className="mt-6 flex flex-wrap gap-2">
          {TOOLS.map((t) => (
            <li key={t.id}>
              <Link
                to={t.href}
                className="inline-flex items-center gap-2 rounded-full border border-hairline px-3.5 py-1.5 text-[13px] text-ink-2 transition-colors hover:border-[color:var(--accent-text)] hover:text-ink"
              >
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: t.color }}
                />
                {t.name}
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="careers-plans"
        title="FinatriX Careers plans"
        intro="The paid product. A job-search workspace that searches several sources at once, scores every role against your own resume, and tracks the process through to an offer."
      >
        <div className="mb-6 flex justify-center sm:justify-start">
          <SegmentedControl
            options={PERIODS}
            value={period}
            onChange={setPeriod}
            label="Billing period"
          />
        </div>

        <ul
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))' }}
        >
          {CAREERS_PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} period={period} />
          ))}
        </ul>

        <p className="mt-5 text-[13px] leading-[1.6] text-ink-3">
          Prices are in Indian rupees and are the total charged at checkout — nothing is added at
          the payment step. Payment is handled by Stripe; FinatriX never sees or stores your card
          details.
        </p>
      </Section>

      <Section id="how-billing-works" title="How billing actually works">
        <P>
          FinatriX Careers is <strong className="text-ink">not an auto-renewing subscription</strong>.
          Each purchase is a single payment covering one billing period. We chose this because
          India&rsquo;s RBI e-mandate rules make recurring card debits unreliable for Indian cards —
          and because a plan that cannot silently charge you again is a better deal, even though it
          means we have to earn the renewal every period.
        </P>
        <UL>
          <li>You pay once for the period you choose. No mandate is registered against your card.</li>
          <li>
            Nothing renews automatically. When the period ends your account returns to the free
            tier and Careers features lock.
          </li>
          <li>
            Nothing is deleted. Your resumes, applications, notes and history are all still there
            if you come back.
          </li>
          <li>Cancelling is simply not buying another period. There is no cancellation flow to hunt for.</li>
          <li>A payment receipt is issued for every purchase and is listed on your Billing page.</li>
        </UL>
        <CtaRow
          primary={{ to: '/signup', label: 'Create a free account' }}
          secondary={{ to: '/refunds', label: 'Refund policy' }}
          note="Educational tools · not financial advice"
        />
      </Section>

      <Section id="whats-included" title="What is and is not included">
        <Grid min={280}>
          <Card title="Included in every paid plan" eyebrow="Included">
            <ul className="space-y-1.5">
              <li>Multi-provider job search, de-duplicated</li>
              <li>Resume-to-role match scoring with the reasoning shown</li>
              <li>Application tracking through every stage</li>
              <li>Interview preparation and company research</li>
              <li>All {TOOL_COUNT_WORD} money tools, as always</li>
            </ul>
          </Card>
          <Card title="Deliberately not included" eyebrow="Not included">
            <ul className="space-y-1.5">
              <li>Automatic applications submitted in your name</li>
              <li>Listing your resume in a recruiter-searchable database</li>
              <li>Any guarantee of an interview or an offer</li>
              <li>Financial or investment advice of any kind</li>
              <li>Bank connections — FinatriX never touches an account</li>
            </ul>
          </Card>
        </Grid>
      </Section>

      {page?.faq && <Faq entries={page.faq} />}

      <RelatedPages
        paths={['/careers', '/careers/features', '/refunds', '/terms', '/faq', '/security']}
      />
    </MarketingPage>
  );
}
