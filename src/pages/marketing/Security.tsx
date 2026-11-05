/**
 * /security — Trust & Security.
 *
 * Written to be checkable rather than reassuring. Every control described here
 * corresponds to something real in the codebase (row-level security on the
 * tables, storage folders owned by `auth.uid()`, a canonical-host HTTPS redirect
 * at the edge, a Content-Security-Policy served as a header, Stripe-hosted
 * checkout), and the page ends with an honest list of what has NOT been done.
 * A security page with no limitations section is a marketing page.
 */

import { Link } from 'react-router';
import MarketingPage from '../../marketing/MarketingPage';
import { Card, Faq, Grid, P, RelatedPages, Section, UL } from '../../marketing/ui';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../../shared/brand';
import { publicPageFor } from '../../shared/publicPages';

const PATH = '/security';

export default function Security() {
  const page = publicPageFor(PATH);

  return (
    <MarketingPage path={PATH}>
      <Section id="short-answers" title="The short answers">
        <Grid min={250}>
          <Card title="Who stores my data?">
            Signed out, only your device. Signed in, Supabase also stores it, on Amazon Web Services
            in Sydney, Australia. Stripe handles card payments.
          </Card>
          <Card title="Who can see it?">
            No other account. Your records are not end-to-end encrypted, so people who administer our
            database can technically access them. The app&rsquo;s own admin role cannot open your
            finance records or resumes.
          </Card>
          <Card title="How good are those providers?">
            Supabase is SOC 2 Type 2 compliant and encrypts stored data with AES-256. Those are its
            results, not ours: FinatriX has no certification of its own or outside security test yet.
          </Card>
        </Grid>
      </Section>

      <Section id="principles" title="Three things that shape everything else">
        <Grid min={250}>
          <Card title="Collect as little as possible" eyebrow="01">
            The safest data is the data that was never collected. There is no bank connection, no
            device fingerprinting and no advertising network anywhere on the site.
          </Card>
          <Card title="Enforce in the database" eyebrow="02">
            Access rules live in Postgres, not in the app&rsquo;s pages. A bug in a page cannot hand
            one account another account&rsquo;s rows, because the database refuses to return them. A
            few server functions, such as account deletion, use an admin key and must check the
            account themselves.
          </Card>
          <Card title="Never hold what we do not need" eyebrow="03">
            Card details go straight to Stripe and never touch a FinatriX server. We could not leak
            a card number if we tried, because we do not have one.
          </Card>
        </Grid>
      </Section>

      <Section id="your-data" title="Where your data lives">
        <P>
          <strong className="text-ink">Signed out</strong>, everything you type stays in your own
          browser&rsquo;s storage. It is never transmitted, so there is nothing on our side to
          secure, subpoena or lose.
        </P>
        <P>
          <strong className="text-ink">Signed in</strong>, your data is stored in a Postgres database
          run by Supabase on Amazon Web Services in Sydney, Australia, and any files you upload go to
          private object storage with the same provider. Both are isolated per account:
        </P>
        <UL>
          <li>
            Every table holding user data has row-level security keyed to your account id, applied
            in the database itself rather than in a query the application remembers to write.
          </li>
          <li>
            Uploaded files — resumes in particular — live in a storage folder owned by your account
            id, and the ownership check runs on every read.
          </li>
          <li>
            Tables that only backend jobs touch fail closed: with no policy granting access, the
            database returns nothing to anyone signing in as a user.
          </li>
          <li>Data is encrypted in transit and at rest by our database and storage providers.</li>
        </UL>
      </Section>

      <Section id="application" title="Application and transport security">
        <UL>
          <li>
            <strong className="text-ink">HTTPS everywhere.</strong> Plain HTTP and every
            non-canonical hostname are redirected at the edge before any content is served, and the
            site sends a long-lived HSTS policy so browsers refuse plain HTTP on their own.
          </li>
          <li>
            <strong className="text-ink">Content Security Policy.</strong> Scripts, styles, fonts
            and network destinations are restricted to a named allowlist, delivered as an HTTP
            header. An injected third-party script has nowhere to load from and nowhere to send to.
          </li>
          <li>
            <strong className="text-ink">Authentication.</strong> Sessions use signed tokens issued
            by our identity provider. Passwords are never stored by FinatriX in any form, and
            sign-in with Google is a full-page redirect rather than an embedded frame.
          </li>
          <li>
            <strong className="text-ink">Secrets stay server-side.</strong> No API key for any AI
            or job-search provider is present in the code your browser downloads — every one of
            those calls is proxied by a server function.
          </li>
          <li>
            <strong className="text-ink">Payment webhooks are verified.</strong> Payment
            notifications are accepted only with a valid signature inside a short replay window, so
            a forged callback cannot grant a paid plan.
          </li>
        </UL>
      </Section>

      <Section id="privacy-by-design" title="What we deliberately do not do">
        <UL>
          <li>No advertising cookies, no tracking cookies, no third-party ad or analytics network.</li>
          <li>
            No device fingerprinting. We never read your user agent, screen, canvas, fonts or any
            other device signal to identify you.
          </li>
          <li>
            No cross-session identity in analytics. Product analytics carry a route template such as{' '}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[13px]">/tools/:tool</code> and
            never the amounts you enter, and they switch off entirely when your browser sends Do Not
            Track or Global Privacy Control.
          </li>
          <li>No bank or UPI connection, so nothing here can read or move money.</li>
          <li>No selling, renting or sharing of personal data. There is no data-broker relationship.</li>
        </UL>
        <P>
          The{' '}
          <Link to="/privacy" className="fx-prose-link">
            Privacy Policy
          </Link>{' '}
          lists exactly what is stored, for how long, and how to remove it.
        </P>
      </Section>

      <Section
        id="ai"
        title="What FinatriX AI sends, and where"
        intro="The one part of FinatriX that sends your data to an AI company. It asks your permission first, and nothing is sent until you use it."
      >
        <P>
          When you ask FinatriX AI a question, your question and a snapshot of the financial figures
          relevant to it are sent to our server, which forwards them to an external model provider
          and returns the answer. That is a real transfer of personal financial information to a
          third party, so here is exactly what it involves.
        </P>
        <UL>
          <li>
            <strong className="text-ink">The browser never holds a provider key.</strong> Every
            request goes through our own authenticated edge function, which checks your session,
            meters your daily usage and enforces a model allowlist and token cap before forwarding
            anything.
          </li>
          <li>
            <strong className="text-ink">What is sent.</strong> Your question, the recent
            conversation, and figures derived from your own records — monthly totals, category
            splits, budget targets, detected recurring payments. Merchant names and notes you typed
            are sanitised before they leave the device, because they are both personal and a
            prompt-injection route.
          </li>
          <li>
            <strong className="text-ink">What is never sent.</strong> Your name, your email, your
            account id, or any identifier that would let a provider connect a snapshot to a person.
            The payload is figures and a question, plus anything you type into the question itself.
          </li>
          <li>
            <strong className="text-ink">Careers is different.</strong> Resume features send your
            resume text, so any name, email or phone number written in it reaches the model. Your
            account id is still not sent.
          </li>
          <li>
            <strong className="text-ink">Storage and training.</strong> We send each request with a
            setting that limits it to model providers whose stated policy is not to store prompts or
            train on them. That relies on those providers&rsquo; policies, which we cannot inspect
            ourselves.
          </li>
          <li>
            <strong className="text-ink">The model does not do the arithmetic.</strong> Every number
            in an AI answer is computed on your device by the same functions the dashboard renders.
            The model ranks, explains and phrases; it never authors a figure. That is what makes
            &ldquo;it will not invent numbers&rdquo; a property of the system rather than a hope
            about the model.
          </li>
          <li>
            <strong className="text-ink">Chat history is yours.</strong> It is kept on your device
            when you are signed in, and clearing it there does not delete anything a provider has
            already logged on its own side — which is true of every AI product and worth saying
            plainly.
          </li>
        </UL>
        <P>
          You never have to use it. Every calculator, the dashboard and all your records work with
          the assistant untouched, and the privacy controls in{' '}
          <Link to="/tools/settings" className="fx-prose-link">
            Settings
          </Link>{' '}
          list what each surface shares.
        </P>
      </Section>

      <Section id="limitations" title="What we have not done yet">
        <P>
          Being straight about the gaps is part of being trustworthy about the rest. As of the
          review date on this page:
        </P>
        <UL>
          <li>
            <strong className="text-ink">No third-party penetration test has been performed.</strong>{' '}
            The controls above are implemented and tested by us, and have not been independently
            attacked.
          </li>
          <li>
            <strong className="text-ink">No formal certification.</strong> FinatriX holds no
            ISO 27001, SOC 2 or equivalent audit, and does not claim to.
          </li>
          <li>
            <strong className="text-ink">No published bug-bounty programme.</strong> Reports are
            welcome and are triaged ahead of the queue, but there is no reward scheme.
          </li>
          <li>
            <strong className="text-ink">No end-to-end encryption.</strong> Stored data is encrypted
            by our providers, but it can be decrypted on their systems, and people who administer our
            database can technically access it.
          </li>
          <li>
            <strong className="text-ink">No separate lock on your device.</strong> Data on your device
            relies on your device&rsquo;s own lock and encryption. FinatriX adds no passcode or
            biometric lock.
          </li>
          <li>
            <strong className="text-ink">Backups are limited.</strong> Point-in-time recovery is off
            and we have not yet run a restore drill. Keep your own copy of anything important using
            the backup in Settings.
          </li>
        </UL>
      </Section>

      <Section id="report" title="Reporting a vulnerability">
        <P>
          Email{' '}
          <a href={SUPPORT_MAILTO} className="fx-prose-link">
            {SUPPORT_EMAIL}
          </a>{' '}
          with &ldquo;Security&rdquo; at the start of the subject line. Please include enough detail
          to reproduce the issue, and give us a reasonable window to fix it before disclosing
          publicly. We will confirm receipt on the same working day, keep you updated, and credit
          you if you would like to be credited.
        </P>
      </Section>

      {page?.faq && <Faq entries={page.faq} />}

      <RelatedPages paths={['/privacy', '/terms', '/about', '/faq', '/support', '/refunds']} />
    </MarketingPage>
  );
}
