import { Link } from 'react-router';
import LegalPage, { H2, P, UL } from '../components/LegalPage';

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="20 June 2026">
      <P>
        This Privacy Policy explains what information FinatriX (&ldquo;we&rdquo;,
        &ldquo;us&rdquo;) collects when you use our website and financial education tools
        (the &ldquo;Service&rdquo;), how we use it, and the choices and rights you have. By
        using the Service you agree to this policy and to our{' '}
        <Link to="/terms" className="text-[#D4AF37] hover:underline">
          Terms &amp; Conditions
        </Link>
        .
      </P>

      <H2>Who we are</H2>
      <P>
        FinatriX is an independent, educational personal-finance toolset operated from
        India. We are not a bank, broker, exchange, or a registered investment or tax
        adviser. You can contact us at{' '}
        <a href="mailto:finatrix.hub@gmail.com" className="text-[#D4AF37] hover:underline">
          finatrix.hub@gmail.com
        </a>
        .
      </P>

      <H2>Information we collect</H2>
      <UL>
        <li>
          <strong>Account information</strong> — if you create an account, your email
          address and a securely hashed password (handled by our authentication provider),
          plus an optional display name you choose.
        </li>
        <li>
          <strong>Tool data you enter</strong> — figures you type into Budget Builder,
          Expense Tracker and LifeMap (for example income, expenses, savings, debt and
          your currency preference). The other calculators run in your browser and their
          inputs are not stored on our servers.
        </li>
        <li>
          <strong>Technical data</strong> — standard server logs kept by our hosting and
          backend providers (such as IP address and timestamps) for security and
          reliability.
        </li>
      </UL>
      <P>
        We do <strong>not</strong> sell your data, we do <strong>not</strong> show ads, and
        we do <strong>not</strong> use third-party advertising or analytics trackers.
      </P>

      <H2>Where your data is stored (and the device-vs-cloud distinction)</H2>
      <UL>
        <li>
          <strong>As a guest (not signed in):</strong> your tool data stays only in your
          browser&rsquo;s local storage on that device and is never sent to us.
        </li>
        <li>
          <strong>When signed in:</strong> your Budget, Expense and LifeMap data and
          currency preference are saved to your account in our cloud database so they sync
          across the devices where you sign in.
        </li>
      </UL>

      <H2>How we use your information</H2>
      <UL>
        <li>To provide the tools and save and sync your data to your account.</li>
        <li>To create and secure your account and verify your email address.</li>
        <li>To maintain, protect and improve the Service and prevent abuse.</li>
        <li>To respond to your support or privacy requests.</li>
      </UL>

      <H2>Service providers</H2>
      <P>
        We use trusted processors to run the Service: <strong>Supabase</strong> (account
        authentication, email verification and the database that stores your saved tool
        data) and <strong>Netlify</strong> (website hosting). These providers process data
        on our behalf under their own security and privacy terms. We do not share your data
        with anyone else except where required by law.
      </P>

      <H2>Cookies &amp; local storage</H2>
      <P>
        We do not use advertising cookies. We use your browser&rsquo;s local storage for two
        purposes: to keep you signed in (a session token) and to hold your tool data. These
        are essential to how the Service works.
      </P>

      <H2>Data retention</H2>
      <P>
        We keep your account and saved data until you ask us to delete it or delete your
        account. Guest data remains on your device until you clear your browser storage.
      </P>

      <H2>Your rights</H2>
      <P>
        Depending on where you live (including under India&rsquo;s Digital Personal Data
        Protection Act and the EU/UK GDPR), you may have the right to access, correct,
        export or delete your personal data, and to withdraw consent. To exercise any of
        these — including deleting your account and all associated data — email us at{' '}
        <a href="mailto:finatrix.hub@gmail.com" className="text-[#D4AF37] hover:underline">
          finatrix.hub@gmail.com
        </a>{' '}
        and we will action your request within a reasonable period.
      </P>

      <H2>Security</H2>
      <P>
        Data is encrypted in transit (HTTPS), and database access is protected by row-level
        security so that each account can only read and write its own data. No method of
        transmission or storage is perfectly secure, so we cannot guarantee absolute
        security.
      </P>

      <H2>Children</H2>
      <P>
        The Service is intended for adults (18+) and is not directed at children. We do not
        knowingly collect personal data from minors; if you believe a minor has provided us
        data, contact us and we will remove it.
      </P>

      <H2>International users</H2>
      <P>
        We operate from India and our providers may process data in other countries. By
        using the Service you consent to your data being processed in those locations with
        appropriate safeguards.
      </P>

      <H2>Changes to this policy</H2>
      <P>
        We may update this policy from time to time. We will revise the &ldquo;Last
        updated&rdquo; date above and, for material changes, take reasonable steps to notify
        you.
      </P>
    </LegalPage>
  );
}
