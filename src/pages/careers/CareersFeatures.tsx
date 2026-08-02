/**
 * /careers/features — the feature overview.
 *
 * Public and indexable, sitting one level under `/careers`. Its job is the one
 * the landing page cannot do without becoming a wall of text: describe each part
 * of the workspace concretely enough that someone can decide whether it is worth
 * ₹199 a month, including the parts that are deliberately narrow.
 *
 * Every feature listed here corresponds to a route that exists in the Careers
 * app. Nothing on this page is aspirational — `careersFeatures.test.tsx` asserts
 * that each `section` named here is a real Careers route, so a feature cannot be
 * advertised before it ships or survive after it is removed.
 */

import { Link } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import MarketingPage from '../../marketing/MarketingPage';
import { P, RelatedPages, Section, UL } from '../../marketing/ui';
import { CAREERS_FEATURES } from '../../shared/careersFeatures';
import { CAREERS_FROM_PRICE, formatInr } from '../../shared/plans';

const PATH = '/careers/features';

export default function CareersFeatures() {
  const { user } = useAuth();

  return (
    <MarketingPage path={PATH}>
      <Section id="overview" title="One workspace, eight parts">
        <P>
          FinatriX Careers is built around a single idea: the search, the applications, the
          preparation and the decision belong in one place, because they are one process. Each part
          below is a real screen in the workspace, and each one comes with the honest limit of what
          it can do.
        </P>
      </Section>

      <div className="mt-10 divide-y divide-hairline border-t border-hairline">
        {CAREERS_FEATURES.map((f) => (
          <section
            key={f.section}
            aria-labelledby={`feature-${f.section}`}
            className="py-8"
          >
            <h2
              id={`feature-${f.section}`}
              className="scroll-mt-24 text-[19px] font-semibold tracking-[-0.02em] text-ink"
            >
              {f.name}
            </h2>
            <p className="mt-3 max-w-[68ch] text-[15px] leading-[1.7] text-ink-2">{f.what}</p>
            <p className="mt-3 max-w-[68ch] text-[14.5px] leading-[1.7] text-ink-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-accent-text">
                Why it matters
              </span>
              <br />
              {f.why}
            </p>
            <p className="mt-3 max-w-[68ch] text-[14.5px] leading-[1.7] text-ink-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                The limit
              </span>
              <br />
              {f.limit}
            </p>
          </section>
        ))}
      </div>

      <Section id="privacy" title="What happens to your resume">
        <UL>
          <li>It is stored in your own account and is readable by nobody else.</li>
          <li>It is never listed in a recruiter-searchable database.</li>
          <li>It is never sent to an employer, a recruiter or a job board.</li>
          <li>You can delete any version, or the whole account, at any time.</li>
        </UL>
        <P>
          The <Link to="/security" className="fx-prose-link">Trust &amp;
          Security</Link> page describes how that isolation is enforced at the database level rather
          than by application code remembering to check.
        </P>
      </Section>

      <Section id="get-started" title="Getting started">
        <P>
          Plans start at {formatInr(CAREERS_FROM_PRICE)} a month, charged once per billing period
          with no auto-renewal. Create a free account first — the money tools are free either way,
          and the same account carries both halves of FinatriX.
        </P>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            to={user ? '/careers/dashboard' : '/signup'}
            className="fx-btn-gold inline-flex items-center gap-2 rounded-full px-7 py-3.5 font-mono text-[12px] uppercase tracking-[0.1em]"
          >
            {user ? 'Open your workspace' : 'Create a free account'}{' '}
            <span aria-hidden="true">→</span>
          </Link>
          <Link
            to="/pricing"
            className="fx-btn-ghost inline-flex items-center rounded-full px-6 py-3.5 font-mono text-[12px] uppercase tracking-[0.1em]"
          >
            Compare plans
          </Link>
        </div>
      </Section>

      <RelatedPages
        paths={['/careers', '/careers/compare', '/pricing', '/security', '/refunds', '/help']}
      />
    </MarketingPage>
  );
}
