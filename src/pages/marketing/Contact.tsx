/**
 * /contact — the addressable facts about who to write to and about what.
 *
 * No contact FORM, deliberately. A form here would mean collecting a name and
 * an email address into our own store for a message that a `mailto:` delivers
 * with no collection at all — which would contradict the data-minimisation
 * promise made on every other page. The trade is a slightly less polished
 * interaction in exchange for a claim that stays true.
 */

import { Link } from 'react-router';
import MarketingPage from '../../marketing/MarketingPage';
import { P, RelatedPages, Section, UL } from '../../marketing/ui';
import { BRAND_NAME, SUPPORT_EMAIL, SUPPORT_MAILTO } from '../../shared/brand';

const PATH = '/contact';

const REASONS = [
  {
    label: 'Product support',
    subject: 'Bug',
    detail: 'Something is broken, a calculation looks wrong, or data is not syncing.',
  },
  {
    label: 'Billing and refunds',
    subject: 'Billing',
    detail: 'Payments, receipts, refund requests, or a plan that has not activated.',
  },
  {
    label: 'Privacy and data requests',
    subject: 'Privacy',
    detail: 'A copy of your data, a correction, or deletion of your account.',
  },
  {
    label: 'Security reports',
    subject: 'Security',
    detail: 'A suspected vulnerability. Triaged ahead of everything else.',
  },
  {
    label: 'Press and partnerships',
    subject: 'Press',
    detail: 'Media enquiries, or an organisation interested in working together.',
  },
];

export default function Contact() {
  return (
    <MarketingPage path={PATH}>
      <Section id="email" title="Email">
        <P>
          Every enquiry goes to one address, read by the people who build {BRAND_NAME}. Start the
          subject line with the word that matches your reason and it reaches the right person
          faster.
        </P>
        <p className="mb-8">
          <a
            href={SUPPORT_MAILTO}
            className="fx-btn-gold inline-flex items-center gap-2 rounded-full px-6 py-3 font-mono text-[12px] uppercase tracking-[0.1em]"
          >
            {SUPPORT_EMAIL}
          </a>
        </p>

        <dl className="divide-y divide-hairline border-y border-hairline">
          {REASONS.map((r) => (
            <div key={r.subject} className="flex flex-col gap-1 py-4 sm:flex-row sm:gap-6">
              <dt className="sm:w-[220px] sm:shrink-0">
                <a
                  href={`${SUPPORT_MAILTO}?subject=${encodeURIComponent(`${r.subject}: `)}`}
                  className="text-[15px] font-medium text-ink hover:text-accent-text transition-colors"
                >
                  {r.label}
                </a>
                <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                  Subject: {r.subject}
                </span>
              </dt>
              <dd className="text-[14px] leading-[1.65] text-ink-2">{r.detail}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="no-form" title="Why there is no contact form">
        <P>
          A contact form would mean storing your name and email address in our own database to
          deliver a message that email delivers without storing anything. Every other page on this
          site promises we collect as little as possible; a form here would be the first place that
          promise quietly stopped being true.
        </P>
      </Section>

      <Section id="what-we-cannot-help-with" title="What we cannot help with">
        <P>
          Some requests we have to decline, and it is fairer to say so here than in a reply three
          days later:
        </P>
        <UL>
          <li>
            <strong className="text-ink">Personal financial advice.</strong> {BRAND_NAME} is not a
            registered adviser and cannot tell you what to invest in, or whether a specific product
            suits you.
          </li>
          <li>
            <strong className="text-ink">Anything involving your money.</strong> We have no bank
            connection and cannot move, hold or recover funds.
          </li>
          <li>
            <strong className="text-ink">Passwords.</strong> We never ask for one and cannot read
            yours. Use the reset link on the sign-in page.
          </li>
          <li>
            <strong className="text-ink">Applying to jobs on your behalf.</strong> Careers prepares
            applications; you submit them yourself on the employer&rsquo;s own site.
          </li>
        </UL>
      </Section>

      <Section id="response" title="When you will hear back">
        <P>
          Response targets by category are set out on the{' '}
          <Link to="/support" className="fx-prose-link">
            Support page
          </Link>
          , along with what to include so the first reply can be a useful one.
        </P>
      </Section>

      <RelatedPages paths={['/support', '/help', '/faq', '/privacy', '/security', '/about']} />
    </MarketingPage>
  );
}
