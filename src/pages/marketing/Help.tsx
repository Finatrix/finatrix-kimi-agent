/**
 * /help — the Help Centre.
 *
 * Task-oriented, and deliberately distinct from its two neighbours: `/faq`
 * answers "what is this and can I trust it", `/support` answers "how do I reach
 * a human", and this page answers "how do I get a useful answer out of the
 * thing". Three pages that each answered a bit of all three would be three thin
 * pages competing for the same queries.
 *
 * The per-tool guidance is not written here — it is `TOOL_GUIDES`, the same
 * content the tool pages themselves render below the calculator. A help centre
 * whose instructions have quietly diverged from the product is worse than none.
 */

import { Link } from 'react-router';
import MarketingPage from '../../marketing/MarketingPage';
import { Card, Grid, P, RelatedPages, Section, UL } from '../../marketing/ui';
import { TOOLS } from '../../lib/tools';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../../shared/brand';
import type { ToolId } from '../../shared/routes';
import { TOOL_GUIDES } from '../../shared/toolGuides';

const PATH = '/help';

export default function Help() {
  return (
    <MarketingPage path={PATH}>
      <Section
        id="getting-started"
        title="Getting started"
        intro="Three things that make everything else easier."
      >
        <Grid min={250}>
          <Card title="You do not need an account" eyebrow="01">
            Every money tool works signed out, with your figures held in your own browser. Start
            with <Link to="/tools/budget" className="fx-prose-link">Budget
            Builder</Link> and add an account later if you want the same numbers on your phone.
          </Card>
          <Card title="Sign in to sync" eyebrow="02">
            A free account syncs your data across devices and unlocks the dashboard, reports and
            exports. It is also what the Careers workspace is attached to.
          </Card>
          <Card title="Your data stays yours" eyebrow="03">
            Export to spreadsheet, PDF or Word at any time, and delete everything from your profile
            whenever you like. Deletion is permanent, not a hidden flag.
          </Card>
        </Grid>
      </Section>

      <Section
        id="tool-guides"
        title="Guides for each tool"
        intro="What each calculator is for, and the fastest route to a useful answer. Each guide continues on the tool's own page, below the calculator."
      >
        <ul className="space-y-3">
          {TOOLS.map((t) => {
            const guide = TOOL_GUIDES[t.id as ToolId];
            return (
              <li key={t.id}>
                <Link
                  to={t.href}
                  className="group block rounded-[16px] border border-hairline p-5 transition-colors hover:border-[color:var(--accent-text)] focus-visible:border-[color:var(--accent-text)]"
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: t.color }}
                    />
                    <span className="text-[15px] font-semibold text-ink transition-colors group-hover:text-accent-text">
                      {t.name}
                    </span>
                  </span>
                  <span className="mt-2 block max-w-[68ch] text-[14px] leading-[1.65] text-ink-2">
                    {guide.purpose}
                  </span>
                  <span className="mt-2.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                    First step: {guide.steps[0]}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section id="careers-help" title="FinatriX Careers">
        <P>
          Careers is the paid workspace for finding and tracking jobs. The{' '}
          <Link to="/careers/features" className="fx-prose-link">
            feature overview
          </Link>{' '}
          walks through each part of it, and{' '}
          <Link to="/pricing" className="fx-prose-link">
            Pricing
          </Link>{' '}
          explains what a plan includes and how billing works.
        </P>
        <UL>
          <li>
            <strong className="text-ink">Upload a resume first.</strong> Match scoring compares
            roles against your resume, so nothing scores meaningfully until one is uploaded.
          </li>
          <li>
            <strong className="text-ink">Search broad, then filter.</strong> The match score does
            the narrowing better than an over-specified query does.
          </li>
          <li>
            <strong className="text-ink">Track from the first application.</strong> The pipeline is
            far more useful started early than reconstructed later.
          </li>
        </UL>
      </Section>

      <Section id="troubleshooting" title="Common problems">
        <div className="divide-y divide-hairline border-y border-hairline">
          {[
            {
              q: 'My data disappeared after I cleared my browser',
              a: 'Data entered while signed out lives only in that browser, so clearing site data removes it. This is the trade-off that keeps guest use completely private. Signing in syncs your data to your account, where clearing a browser does not touch it.',
            },
            {
              q: 'My numbers are not the same on my phone and my laptop',
              a: 'Sync requires being signed in on both. Guest data never leaves the device it was entered on — there is nothing to move it, by design.',
            },
            {
              q: 'A page will not load, or the layout looks broken',
              a: 'A hard refresh usually fixes it after a release. If it persists, tell us the page, the browser and the device, and we will reproduce it.',
            },
            {
              q: 'I paid but Careers is still locked',
              a: 'Activation happens moments after payment. If the Billing page still shows the free tier after a refresh, email support with the payment receipt and we will fix it manually the same day.',
            },
            {
              q: 'I did not get the confirmation email',
              a: 'Check spam first. If it is genuinely missing, email us from the address you signed up with and we will confirm the account by hand.',
            },
          ].map((item) => (
            <details key={item.q} className="group">
              <summary className="flex cursor-pointer items-start justify-between gap-4 py-4 text-[15px] font-medium text-ink marker:content-[''] [&::-webkit-details-marker]:hidden">
                <span className="max-w-[62ch]">{item.q}</span>
                <span
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-accent-text transition-transform duration-200 group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mb-5 max-w-[68ch] text-[14.5px] leading-[1.75] text-ink-2">{item.a}</p>
            </details>
          ))}
        </div>
      </Section>

      <Section id="ask" title="Still need a hand?">
        <P>
          Email{' '}
          <a href={SUPPORT_MAILTO} className="fx-prose-link">
            {SUPPORT_EMAIL}
          </a>{' '}
          and a person will read it.{' '}
          <Link to="/support" className="fx-prose-link">
            Support
          </Link>{' '}
          explains what to include so we can answer on the first reply rather than the third.
        </P>
      </Section>

      <RelatedPages paths={['/faq', '/support', '/contact', '/pricing', '/careers/features', '/security']} />
    </MarketingPage>
  );
}
