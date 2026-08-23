/**
 * /careers — the public, indexable landing page for FinatriX Careers.
 *
 * This URL used to render the signed-in dashboard behind an auth gate and a
 * paywall, and was `noindex` and absent from the sitemap. The launch review's
 * first blocker was the consequence: a ₹199–₹2,499/month product that no
 * prospective buyer could find, read about or price without first creating an
 * account. The workspace now lives at `/careers/dashboard` (where it was already
 * reachable), and this is what an anonymous visitor and a crawler get.
 *
 * The CTA is auth-aware rather than the page being auth-gated: a signed-in user
 * gets "Open your workspace", everyone else gets "Start with a free account".
 * Same content for everyone, which is both better UX and the only version of
 * this that is not cloaking.
 */

import { Link } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import MarketingPage from '../../marketing/MarketingPage';
import { Card, Facts, Faq, Grid, P, RelatedPages, Section, UL } from '../../marketing/ui';
import { CAREERS_FROM_PRICE, formatInr } from '../../shared/plans';
import { publicPageFor, RIVALS } from '../../shared/publicPages';
import { TOOL_COUNT_WORD } from '../../shared/toolCount';

const PATH = '/careers';

const STEPS = [
  {
    title: 'Upload your resume',
    body: 'It is parsed into skills, titles and experience. It stays in your account — it is never listed in a recruiter-searchable database and never sent to an employer.',
  },
  {
    title: 'Search several sources at once',
    body: 'One query hits multiple job providers, and the results are de-duplicated so the same role posted in three places appears once.',
  },
  {
    title: 'Read the match score',
    body: 'Every role is scored against your resume, requirement by requirement, with the matches and the gaps both shown. The same resume and job always produce the same score.',
  },
  {
    title: 'Track it through to an offer',
    body: 'Saved roles become applications, applications carry stages, tasks and interview notes, and offers get compared side by side.',
  },
];

export default function CareersLanding() {
  const { user } = useAuth();
  const page = publicPageFor(PATH);

  return (
    <MarketingPage path={PATH}>
      {/* The primary call to action sits above everything else on the page that
          a buyer has to scroll for. */}
      <div className="-mt-6 mb-14 flex flex-wrap items-center gap-3">
        <Link
          to={user ? '/careers/dashboard' : '/signup'}
          className="fx-btn-gold inline-flex items-center gap-2 rounded-full px-7 py-3.5 font-mono text-[12px] uppercase tracking-[0.1em]"
        >
          {user ? 'Open your workspace' : 'Start with a free account'}{' '}
          <span aria-hidden="true">→</span>
        </Link>
        <Link
          to="/pricing"
          className="fx-btn-ghost inline-flex items-center rounded-full px-6 py-3.5 font-mono text-[12px] uppercase tracking-[0.1em]"
        >
          See pricing
        </Link>
      </div>

      <Facts
        items={[
          { value: `${formatInr(CAREERS_FROM_PRICE)}/mo`, label: 'Plans from' },
          { value: 'Multi-source', label: 'Job search' },
          { value: 'Scored', label: 'Against your resume' },
          { value: 'Never shared', label: 'Your resume' },
        ]}
      />

      <Section
        id="problem"
        title="Job boards are optimised for volume. You are not."
        className="mt-16"
      >
        <P>
          The hard part of a job search is not finding listings — it is working out which of the
          four hundred you just scrolled past are actually worth an afternoon of tailoring. Job
          boards are not built to tell you that. Their incentive is engagement and employer supply,
          and a ranked feed you cannot inspect is the natural result.
        </P>
        <P>
          FinatriX Careers inverts it. Nothing is promoted, no employer is a customer, and every
          role carries a score you can open up and argue with. You spend your effort on the ten
          roles that fit rather than the four hundred that were merely listed.
        </P>
      </Section>

      <Section id="how-it-works" title="How it works">
        <ol className="space-y-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span
                aria-hidden="true"
                className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/[0.08] font-mono text-[11px] text-accent-text"
              >
                {i + 1}
              </span>
              <span>
                <span className="block text-[15px] font-semibold text-ink">{s.title}</span>
                <span className="mt-1 block max-w-[64ch] text-[14.5px] leading-[1.7] text-ink-2">
                  {s.body}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="whats-inside"
        title="What is in the workspace"
        intro="The full feature tour has its own page; this is the shape of it."
      >
        <Grid min={250}>
          <Card title="Search and match" eyebrow="Find">
            Multi-provider search, de-duplicated results, and a deterministic match score against
            your own resume with the reasoning shown.
          </Card>
          <Card title="Apply well" eyebrow="Prepare">
            Resume tailoring against a specific job description, cover-letter drafting, and an
            analysis of what the posting is really asking for.
          </Card>
          <Card title="Track everything" eyebrow="Run">
            Applications with stages, tasks and follow-ups, recruiter and contact records, and
            interview notes in one pipeline.
          </Card>
          <Card title="Prepare and decide" eyebrow="Close">
            Company research, interview preparation against the specific role, assessment tracking
            and side-by-side offer comparison.
          </Card>
        </Grid>
        <p className="mt-6">
          <Link
            to="/careers/features"
            className="fx-prose-link text-[14px]"
          >
            See every feature in detail →
          </Link>
        </p>
      </Section>

      <Section id="honest" title="What it does not do">
        <P>
          The things a job product is usually vague about, stated plainly — because knowing where a
          tool stops is what makes the rest of it trustworthy:
        </P>
        <UL>
          <li>
            <strong className="text-ink">It does not apply for you.</strong> You submit every
            application yourself, on the employer&rsquo;s own site. Nothing is sent in your name.
          </li>
          <li>
            <strong className="text-ink">It does not list your resume anywhere.</strong> No
            recruiter database, no employer marketplace, no sharing of any kind.
          </li>
          <li>
            <strong className="text-ink">It does not promise an interview or an offer.</strong> No
            tool honestly can, and any that claims to is selling something else.
          </li>
          <li>
            <strong className="text-ink">It is not a professional network.</strong> There is no
            social graph here — for referrals and reaching people directly, LinkedIn is the better
            tool, and the{' '}
            <Link to="/careers/compare/linkedin" className="fx-prose-link">
              comparison page
            </Link>{' '}
            says so.
          </li>
        </UL>
      </Section>

      <Section id="compare" title="How it compares">
        <P>
          FinatriX Careers is not trying to replace the job boards — it is the layer that decides
          what to do with them. Honest comparisons against the three platforms most people also use:
        </P>
        <ul className="mt-4 flex flex-wrap gap-2">
          {RIVALS.map((r) => (
            <li key={r.slug}>
              <Link
                to={`/careers/compare/${r.slug}`}
                className="inline-flex rounded-full border border-hairline px-4 py-2 text-[13.5px] text-ink-2 transition-colors hover:border-[color:var(--accent-text)] hover:text-ink"
              >
                vs {r.name}
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="pricing" title="Pricing">
        <P>
          Plans start at {formatInr(CAREERS_FROM_PRICE)} a month. Each purchase is a single payment
          covering one billing period — nothing auto-renews, and no mandate is stored against your
          card. The {TOOL_COUNT_WORD} FinatriX money tools stay free whether or not you ever use Careers.
        </P>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            to="/pricing"
            className="fx-btn-gold inline-flex items-center gap-2 rounded-full px-7 py-3.5 font-mono text-[12px] uppercase tracking-[0.1em]"
          >
            Compare plans <span aria-hidden="true">→</span>
          </Link>
          <Link
            to={user ? '/careers/dashboard' : '/signup'}
            className="fx-btn-ghost inline-flex items-center rounded-full px-6 py-3.5 font-mono text-[12px] uppercase tracking-[0.1em]"
          >
            {user ? 'Open workspace' : 'Create free account'}
          </Link>
        </div>
      </Section>

      {page?.faq && <Faq entries={page.faq} />}

      <RelatedPages
        paths={['/careers/features', '/careers/compare', '/pricing', '/refunds', '/security', '/about']}
      />
    </MarketingPage>
  );
}
