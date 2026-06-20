import { Link } from 'react-router';
import LegalPage, { H2, P, UL } from '../components/LegalPage';

export default function Terms() {
  return (
    <LegalPage title="Terms &amp; Conditions" updated="20 June 2026">
      <P>
        These Terms &amp; Conditions (&ldquo;Terms&rdquo;) govern your use of the FinatriX
        website and tools (the &ldquo;Service&rdquo;). By using the Service, or by ticking
        the consent box when you create an account, you agree to these Terms and to our{' '}
        <Link to="/privacy" className="text-[#D4AF37] hover:underline">
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
        <a href="mailto:finatrix.hub@gmail.com" className="text-[#D4AF37] hover:underline">
          finatrix.hub@gmail.com
        </a>
        .
      </P>
    </LegalPage>
  );
}
