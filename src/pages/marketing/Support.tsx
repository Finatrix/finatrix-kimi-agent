/**
 * /support — how to reach a human, what to expect back, and by when.
 *
 * The response targets stated here are commitments the team can actually keep at
 * this size, and they are labelled as targets rather than dressed up as an SLA.
 * A published "24/7 support" promise that is quietly a single inbox is a trust
 * liability the first time someone tests it.
 */

import { Link } from 'react-router';
import MarketingPage from '../../marketing/MarketingPage';
import { Card, Faq, Grid, P, RelatedPages, Section, UL } from '../../marketing/ui';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../../shared/brand';
import { publicPageFor } from '../../shared/publicPages';

const PATH = '/support';

/** Subject-line prefixes that route a mail to the right place fastest. */
const CHANNELS = [
  {
    subject: 'Billing',
    title: 'Billing and refunds',
    body: 'Payment problems, receipts, refund requests, or a plan that has not activated after payment.',
    target: 'Within 1 working day',
  },
  {
    subject: 'Bug',
    title: 'Something is broken',
    body: 'A page that will not load, a calculation that looks wrong, or data that is not syncing.',
    target: 'Within 2 working days',
  },
  {
    subject: 'Privacy',
    title: 'Privacy and data requests',
    body: 'A copy of your data, correction of something we hold, or deletion of your account.',
    target: 'Within 5 working days',
  },
  {
    subject: 'Security',
    title: 'Security reports',
    body: 'A suspected vulnerability. Triaged ahead of the queue — please give us a window to fix it before disclosing publicly.',
    target: 'Same working day',
  },
];

export default function Support() {
  const page = publicPageFor(PATH);

  return (
    <MarketingPage path={PATH}>
      <Section
        id="how-to-reach-us"
        title="How to reach us"
        intro="One address, read by the people who build FinatriX. Put the matching word at the front of your subject line and it gets to the right place faster."
      >
        <p className="mb-6">
          <a
            href={SUPPORT_MAILTO}
            className="fx-btn-gold inline-flex items-center gap-2 rounded-full px-6 py-3 font-mono text-[12px] uppercase tracking-[0.1em]"
          >
            Email {SUPPORT_EMAIL}
          </a>
        </p>

        <Grid min={250}>
          {CHANNELS.map((c) => (
            <Card key={c.subject} title={c.title} eyebrow={`Subject: ${c.subject}`}>
              <p>{c.body}</p>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-accent-text">
                Target: {c.target}
              </p>
            </Card>
          ))}
        </Grid>
      </Section>

      <Section id="response-times" title="What to expect">
        <P>
          FinatriX is a small team, and support is answered by the people who wrote the code rather
          than by a script. The targets above are the ones we hold ourselves to — they are honest
          intentions, not a contractual service level, and we would rather publish a number we meet
          than one that sounds better.
        </P>
        <UL>
          <li>Working days are Monday to Friday, Indian Standard Time, excluding public holidays.</li>
          <li>Every email gets a human reply. There is no ticket-deflection bot in front of it.</li>
          <li>
            If something is broken for everyone, fixing it comes before answering individually about
            it — and we will say so.
          </li>
        </UL>
      </Section>

      <Section id="what-to-include" title="What to include">
        <P>
          Most support threads take three replies because the first one is missing the same four
          things. Including them up front usually turns it into one:
        </P>
        <UL>
          <li>The page or tool you were on, and what you were trying to do.</li>
          <li>What you expected to happen, and what actually happened.</li>
          <li>Your device and browser — &ldquo;iPhone, Safari&rdquo; is enough.</li>
          <li>A screenshot, if there is anything visible to see.</li>
        </UL>
        <P>
          <strong className="text-ink">Never send your password.</strong> Nobody at FinatriX will
          ever ask for it, and no support problem requires it. The same goes for card numbers — we
          never see them, so we cannot use them to help.
        </P>
      </Section>

      <Section id="self-serve" title="Faster than emailing">
        <P>
          Several things are quicker to solve yourself. The{' '}
          <Link to="/help" className="fx-prose-link">Help Centre</Link> covers
          the common problems,{' '}
          <Link to="/faq" className="fx-prose-link">the FAQ</Link> answers what
          the product does and where data lives, and{' '}
          <Link to="/refunds" className="fx-prose-link">
            Refunds &amp; cancellations
          </Link>{' '}
          sets out the billing policy in full.
        </P>
      </Section>

      {page?.faq && <Faq entries={page.faq} />}

      <RelatedPages paths={['/help', '/faq', '/contact', '/refunds', '/security', '/privacy']} />
    </MarketingPage>
  );
}
