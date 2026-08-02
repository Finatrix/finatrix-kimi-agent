import { Link } from 'react-router';
import LegalPage, { H2, P, UL } from '../components/LegalPage';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../shared/brand';
import { BILLING_FACTS } from '../shared/publicPages';

export default function Terms() {
  return (
    // Title and review date both come from the public-page registry — the same
    // entry that supplies this URL's <title>, description and sitemap row.
    <LegalPage path="/terms">
      <P>
        These Terms &amp; Conditions (&ldquo;Terms&rdquo;) govern your use of the FinatriX
        website and tools (the &ldquo;Service&rdquo;). By using the Service, or by ticking
        the consent box when you create an account, you agree to these Terms and to our{' '}
        <Link to="/privacy" className="fx-prose-link">
          Privacy Policy
        </Link>
        . If you do not agree, please do not use the Service.
      </P>

      <H2 id="disclaimer">Educational use only — not financial advice</H2>
      <P>
        FinatriX is an <strong>educational and informational</strong> toolset. Nothing on
        the Service constitutes financial, investment, tax, accounting, or legal advice, a
        recommendation, an offer, or a solicitation to buy or sell any security or product,
        and using it does not create an advisory or fiduciary relationship. FinatriX is not
        a bank, broker, exchange, or a SEBI-registered investment adviser, and does not
        execute trades or manage money.
      </P>
      <P>
        Calculations, projections, tax figures, rates and category examples are
        <strong> illustrative</strong>, are based on assumptions and information believed
        accurate at the time, may become outdated (for example tax rules change), and may
        not fit your circumstances. Always do your own research and consult a qualified,
        licensed professional before making any financial decision. You are solely
        responsible for decisions you make.
      </P>

      <H2>Your account</H2>
      <UL>
        <li>You must be at least 18 years old to create an account.</li>
        <li>
          Provide accurate information, keep your password secure, and you are responsible
          for activity under your account.
        </li>
        <li>Tell us promptly at the contact below if you suspect unauthorised access.</li>
      </UL>

      <H2 id="billing">Paid plans, billing and refunds</H2>
      <P>
        The FinatriX money tools are free. <strong>FinatriX Careers</strong> is a paid
        product, and these terms apply to it. Current prices are on the{' '}
        <Link to="/pricing" className="fx-prose-link">
          Pricing page
        </Link>
        .
      </P>
      <UL>
        <li>
          <strong>One payment per period, no auto-renewal.</strong> A plan purchase is a
          single payment covering one billing period. No recurring mandate is created
          against your payment method and nothing is charged again unless you choose to
          buy another period.
        </li>
        <li>
          <strong>What you are charged.</strong> The price shown at checkout, in Indian
          rupees, is the total amount charged — nothing is added at the payment step. A
          payment receipt is issued for each purchase and is available from your Billing
          page.
        </li>
        <li>
          <strong>Payment processing.</strong> Payments are processed by Stripe. Your card
          details are entered on Stripe&rsquo;s own payment page and are never received or
          stored by FinatriX.
        </li>
        <li>
          <strong>When a period ends.</strong> Access to paid Careers features ends and
          your account returns to the free tier. Your data is retained and becomes
          available again if you purchase another period.
        </li>
        <li>
          <strong>Cancellation.</strong> Because nothing auto-renews, there is no
          subscription to cancel — simply do not purchase another period.
        </li>
        <li>
          <strong>Refunds.</strong> A first purchase may be refunded within{' '}
          {BILLING_FACTS.refundWindowDays} days if the paid features have not been
          substantially used, and billing errors are refunded in full at any time. The{' '}
          <Link to="/refunds" className="fx-prose-link">
            Refunds &amp; Cancellations policy
          </Link>{' '}
          forms part of these Terms and sets out the full detail, including what is not
          refundable.
        </li>
        <li>
          <strong>Price changes.</strong> We may change prices for future periods. A change
          never affects a period you have already paid for, and the price you are charged
          is always the one shown at checkout.
        </li>
        <li>
          <strong>Quotas and fair use.</strong> Each plan includes stated monthly limits on
          AI analyses, storage, resume versions and tracked applications. We may suspend
          access for use that is automated, abusive, or clearly intended to circumvent
          those limits.
        </li>
        <li>
          <strong>No outcome is promised.</strong> FinatriX Careers provides tools for
          searching, preparing and tracking job applications. It does not apply to jobs on
          your behalf and does not guarantee an interview, an offer or any employment
          outcome.
        </li>
      </UL>
      <P>
        Nothing in this section limits your rights under Indian consumer protection law.
      </P>

      <H2>Acceptable use</H2>
      <P>
        You agree not to misuse the Service — including attempting to break security or
        access other users&rsquo; data, scraping, overloading, reverse-engineering, or using
        the Service for unlawful purposes.
      </P>

      <H2>&ldquo;As is&rdquo; &amp; no warranties</H2>
      <P>
        The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without
        warranties of any kind, express or implied, including accuracy, fitness for a
        particular purpose, or uninterrupted availability. We do not warrant that outputs
        are error-free or current.
      </P>

      <H2>Limitation of liability</H2>
      <P>
        To the maximum extent permitted by law, FinatriX and its operators will not be
        liable for any indirect, incidental, special or consequential damages, or for any
        loss (including financial loss) arising from your use of, or reliance on, the
        Service. Where liability cannot be excluded, it is limited to the maximum extent
        permitted by law.
      </P>

      <H2>Intellectual property</H2>
      <P>
        The FinatriX name, branding, design and content are owned by us or our licensors and
        may not be copied or reused without permission. Data you enter remains yours.
      </P>

      <H2>Changes &amp; termination</H2>
      <P>
        We may update these Terms or change, suspend or discontinue the Service at any time.
        Continued use after changes means you accept the updated Terms. You may stop using
        the Service and request deletion of your account at any time.
      </P>

      <H2>Governing law</H2>
      <P>
        These Terms are governed by the laws of India, and the courts of India will have
        jurisdiction, subject to any mandatory consumer-protection rights in your place of
        residence.
      </P>

      <H2>Contact</H2>
      <P>
        Questions about these Terms? Email{' '}
        <a href={SUPPORT_MAILTO} className="fx-prose-link">
          {SUPPORT_EMAIL}
        </a>
        .
      </P>
    </LegalPage>
  );
}
