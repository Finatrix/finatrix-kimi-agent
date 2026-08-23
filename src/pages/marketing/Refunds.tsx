/**
 * /refunds — the refund and cancellation policy the launch review flagged as a
 * legal blocker for charging Indian consumers.
 *
 * Written against what the billing code actually does. Because
 * `careers-billing-checkout` creates a one-time Stripe payment rather than a
 * subscription, there is genuinely nothing to cancel — and the policy says that
 * plainly instead of inventing a cancellation flow to look conventional.
 *
 * The 7-day window is a commercial commitment, not a technical one; it is stated
 * once, in `BILLING_FACTS`, so the pricing page, the FAQ and this page cannot
 * quote three different numbers.
 */

import { Link } from 'react-router';
import MarketingPage from '../../marketing/MarketingPage';
import { Faq, P, RelatedPages, Section, UL } from '../../marketing/ui';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../../shared/brand';
import { BILLING_FACTS, publicPageFor } from '../../shared/publicPages';
import { TOOL_COUNT_WORD } from '../../shared/toolCount';

const PATH = '/refunds';

export default function Refunds() {
  const page = publicPageFor(PATH);
  const days = BILLING_FACTS.refundWindowDays;

  return (
    <MarketingPage path={PATH}>
      <Section id="summary" title="The short version">
        <UL>
          <li>
            Nothing auto-renews. Each purchase covers one billing period and then simply stops.
          </li>
          <li>
            There is no cancellation to perform — not buying another period <em>is</em> cancelling.
          </li>
          <li>
            A first purchase can be refunded within {days} days if the paid features have not been
            substantially used.
          </li>
          <li>Approved refunds go back to the original payment method within two working days.</li>
        </UL>
        <P>
          The rest of this page is the same policy stated precisely enough to rely on. It applies to
          FinatriX Careers plans, the only paid product on the site — the {TOOL_COUNT_WORD} money tools are free
          and never charged for.
        </P>
      </Section>

      <Section id="cancellation" title="Cancellation">
        <P>
          FinatriX Careers is billed as a single payment covering one billing period. No recurring
          mandate is registered against your card and no payment method is stored for future
          charges, so there is no standing agreement to cancel.
        </P>
        <UL>
          <li>
            Your plan runs until the end of the period you paid for, and you keep full access for
            all of it.
          </li>
          <li>
            At the end of that period your account returns to the free tier automatically and paid
            Careers features lock.
          </li>
          <li>
            Nothing is deleted. Resumes, applications, notes and history remain in your account and
            are available again if you buy another period.
          </li>
          <li>
            If you want your data removed rather than dormant, ask us to delete the account — see{' '}
            <Link to="/privacy" className="fx-prose-link">
              Privacy
            </Link>
            .
          </li>
        </UL>
      </Section>

      <Section id="refunds" title="Refunds">
        <P>
          <strong className="text-ink">First purchase, within {days} days.</strong> If you buy a
          paid period and it is not what you expected, email us within {days} days of payment and we
          will refund it in full, provided the paid Careers features have not been substantially
          used. &ldquo;Substantially used&rdquo; means running a meaningful volume of job searches,
          AI analyses or resume tailoring against the plan&rsquo;s quota — trying the product is
          expected and is not a bar to a refund.
        </P>
        <P>
          <strong className="text-ink">Billing errors, always.</strong> A duplicate charge, a charge
          after an account was closed, a charge for a plan that never activated, or any amount that
          does not match the price on the{' '}
          <Link to="/pricing" className="fx-prose-link">
            Pricing page
          </Link>{' '}
          is refunded in full whenever we find out about it, inside the window or not.
        </P>
        <P>
          <strong className="text-ink">Service failure.</strong> If a paid feature is unavailable
          for an extended period through our fault, tell us and we will refund the affected period
          on a pro-rata basis, or extend it, whichever you prefer.
        </P>
      </Section>

      <Section id="not-refundable" title="What is not refundable">
        <UL>
          <li>Periods already used substantially, once the {days}-day window has passed.</li>
          <li>Repeat purchases of a period after you have already used a previous one.</li>
          <li>Accounts suspended or terminated for breaching the{' '}
            <Link to="/terms" className="fx-prose-link">
              Terms &amp; Conditions
            </Link>.
          </li>
          <li>
            Dissatisfaction with a job-search outcome. FinatriX Careers is a set of tools and does
            not promise an interview or an offer, which is why nothing on the site claims one.
          </li>
        </UL>
        <P>
          None of this limits rights you have under Indian consumer law, which apply regardless of
          what this page says.
        </P>
      </Section>

      <Section id="how-to-request" title="How to request a refund">
        <P>
          Email{' '}
          <a href={SUPPORT_MAILTO} className="fx-prose-link">
            {SUPPORT_EMAIL}
          </a>{' '}
          from the address on your account, with &ldquo;Billing&rdquo; at the start of the subject
          line. Include the payment date and the amount, or attach the receipt from your Billing
          page.
        </P>
        <UL>
          <li>We acknowledge billing emails within one working day.</li>
          <li>Approved refunds are processed within two working days of approval.</li>
          <li>
            Your bank or card issuer then posts it on its own timetable — typically five to ten
            working days in India.
          </li>
          <li>
            Refunds are always returned to the original payment method. We cannot send one anywhere
            else.
          </li>
        </UL>
      </Section>

      <Section id="disputes" title="If you disagree with a decision">
        <P>
          Reply to the same thread and say so — a person will re-read it rather than a policy engine.
          If we still cannot agree, you keep every right available to you under Indian consumer
          protection law and under your card issuer&rsquo;s own dispute process. We would much
          rather resolve it directly, and we will always tell you the actual reason for a decision.
        </P>
      </Section>

      {page?.faq && <Faq entries={page.faq} />}

      <RelatedPages paths={['/pricing', '/terms', '/support', '/contact', '/faq', '/privacy']} />
    </MarketingPage>
  );
}
