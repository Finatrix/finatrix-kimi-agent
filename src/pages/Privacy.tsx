import { Link } from 'react-router';
import LegalPage, { H2, P, UL } from '../components/LegalPage';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../shared/brand';

export default function Privacy() {
  return (
    <LegalPage path="/privacy">
      <P>
        This Privacy Policy explains what information FinatriX (&ldquo;we&rdquo;,
        &ldquo;us&rdquo;) collects when you use our website and financial education tools
        (the &ldquo;Service&rdquo;), how we use it, and the choices and rights you have. By
        using the Service you agree to this policy and to our{' '}
        <Link to="/terms" className="fx-prose-link">
          Terms &amp; Conditions
        </Link>
        .
      </P>

      <H2>Who we are</H2>
      <P>
        FinatriX is an independent, educational personal-finance toolset operated from
        India. We are not a bank, broker, exchange, or a registered investment or tax
        adviser. You can contact us at{' '}
        <a href={SUPPORT_MAILTO} className="fx-prose-link">
          {SUPPORT_EMAIL}
        </a>
        .
      </P>

      <H2>Information we collect</H2>
      <UL>
        <li>
          <strong>Account information</strong> — if you create an account, your email
          address and a securely hashed password (handled by our authentication provider),
          plus an optional display name you choose. If you sign in with Google instead,
          Google shares your name, email address and a link to your profile picture with us,
          and those are stored with your account.
        </li>
        <li>
          <strong>Tool data you enter</strong> — figures you type into the tools (for
          example income, expenses, savings, debt, goals and your currency preference)
          across Budget Builder, Expense Tracker, InvestMatch, ParkSmart, PeerCompare,
          Reverse Goal Planner, LifeMap and the Net Worth tracker.
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
          <strong>When signed in:</strong> the data you enter into the tools and your
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
        data), <strong>Cloudflare</strong> (website hosting and global content delivery) and,
        only when you use FinatriX AI, <strong>OpenRouter</strong> and the AI model provider
        it routes your request to (see below). These providers process data on our behalf
        under their own security and privacy terms. We do not share your data with anyone
        else except where required by law.
      </P>

      <H2 id="ai">FinatriX AI</H2>
      <P>
        FinatriX AI is optional and available when you are signed in. When you ask it a
        question, your question, the recent conversation and the figures from your tools
        that are relevant to it are sent over an encrypted connection to OpenRouter, which
        passes them to an AI model provider to generate the answer. We send no name, email
        address or account identifier with the request. Answers about your own figures are
        checked against your records before they are shown.
      </P>
      <P>
        Statement import uses the same service for one narrow job: when you import a bank
        statement while signed in, the descriptions of merchants it does not recognise are
        sent so they can be named and categorised. Amounts, dates, balances, account numbers
        and the file itself never leave your device.
      </P>
      <P>
        Nothing is sent to an AI provider until you allow it. The first time either feature
        would send data, FinatriX asks for your permission; you can withdraw it at any time
        in Settings &rarr; Privacy, after which it asks again before sending anything.
      </P>
      <P>
        What we keep: a copy of each answer is stored with your account so that the same
        question asked again within 15 minutes is answered without a second AI request (the
        question itself is kept only as a one-way fingerprint for that match). Old copies are
        cleared out automatically, and all of them are deleted with your account. For each
        request we also record which model answered and how many tokens it used — not the
        question or the answer — to apply daily limits. The conversation you see in the panel
        is saved only on your device, and you can clear it in Settings.
      </P>
      <P>
        Reporting an answer: every AI answer has a <b>Report</b> control. A report sends us
        only the reason you picked (for example &ldquo;Wrong or misleading&rdquo;) — never the
        answer or your figures — and it is sent even if you have turned product analytics
        off, because you asked for it to be. If you choose to add details by email, your mail
        app opens with the answer filled in so you can read and edit it before anything is
        sent.
      </P>

      <H2 id="analytics">Product analytics</H2>
      <P>
        We count how the product is used — which screens are opened and which features are
        used — with our own cookieless analytics. When something breaks we record the type
        of error and the screen it happened on, never the error message. Events carry no
        amounts, no text you type and no identifier that persists beyond a single visit (in
        the app, a single launch), and we never read device fingerprints. Analytics are switched off automatically when your browser sends Do
        Not Track or Global Privacy Control, and you can turn them off in Settings.
      </P>

      <H2>Cookies &amp; local storage</H2>
      <P>
        We do not use advertising cookies. We use your browser&rsquo;s local storage for two
        purposes: to keep you signed in (a session token) and to hold your tool data. These
        are essential to how the Service works.
      </P>

      <H2 id="apps">The Android and iOS apps</H2>
      <P>
        The FinatriX apps are the same Service and this policy applies to them in full.
        They keep your tool data on your phone in the same way a browser does, and sync it
        only when you sign in. Neither app contains advertising or third-party analytics
        SDKs, neither tracks you across other companies&rsquo; apps or websites, and purchases
        are not offered in either. Links to other websites open in an in-app browser, where
        that site&rsquo;s own privacy policy applies.
      </P>
      <P>
        <b>Permissions.</b> The Android app asks for no device permission beyond internet
        access. The iOS app asks for one, and only at the moment you use it: if you choose
        &ldquo;Take&nbsp;Photo&rdquo; to import a bank statement, it asks for the camera. That photo
        is read by text recognition running on your phone and is never uploaded to us or to
        anyone else. Neither app asks for location, contacts, microphone or storage; files
        you import are chosen by you through the system file picker, which gives access to
        the chosen file only.
      </P>
      <P>
        <b>Device backup.</b> On Android, the app&rsquo;s on-device data moves with you when
        you transfer to a new phone directly from your old one, but it is not included in
        Android&rsquo;s cloud backup to your Google account, because that data also holds your
        sign-in. If you use the app without an account, a lost or reset phone therefore
        cannot restore it from that backup &mdash; sign in if you want your figures kept in
        your account. On iOS, the app&rsquo;s data may be included in your iCloud or encrypted
        local backup. Those backups are your own, held under your Google or Apple account
        rather than ours, and can be turned off in your phone&rsquo;s settings.
      </P>

      <H2>Data retention</H2>
      <P>
        We keep your account and saved data until you ask us to delete it or delete your
        account. Guest data remains on your device until you clear your browser storage or
        uninstall the app.
      </P>

      <H2 id="delete-account">Deleting your account</H2>
      <P>
        You can delete your account yourself, on the website or in either app: sign in,
        open <b>Profile</b>, choose <b>Delete account</b> and confirm with your email address.
        This immediately and permanently deletes your login, your synced tool data, your
        Careers records and any files you uploaded. Nothing is kept for later recovery.
        Payment records held by our payment processor are retained by that processor as the
        law requires. If you cannot sign in, email{' '}
        <a href={SUPPORT_MAILTO} className="fx-prose-link">
          {SUPPORT_EMAIL}
        </a>{' '}
        from the address on the account and we will delete it for you.
      </P>

      <H2>Your rights</H2>
      <P>
        Depending on where you live (including under India&rsquo;s Digital Personal Data
        Protection Act and the EU/UK GDPR), you may have the right to access, correct,
        export or delete your personal data, and to withdraw consent. You can delete your
        account at any time as described above. To exercise any other right, email us at{' '}
        <a href={SUPPORT_MAILTO} className="fx-prose-link">
          {SUPPORT_EMAIL}
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
