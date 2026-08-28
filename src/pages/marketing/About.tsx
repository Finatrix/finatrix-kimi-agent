/**
 * /about — who builds FinatriX, why, and how it makes money.
 *
 * The "how it makes money" section is the point of the page. A free finance site
 * with no visible business model reads, correctly, as one whose business model
 * is the reader; saying plainly that a Careers subscription is the only revenue
 * source is the single most useful trust signal available here — and it is the
 * claim every other privacy promise on the site depends on.
 */

import MarketingPage from '../../marketing/MarketingPage';
import { Card, CtaRow, Facts, Grid, P, RelatedPages, Section, UL } from '../../marketing/ui';
import { CAREERS_FROM_PRICE, formatInr } from '../../shared/plans';
import { TOOL_COUNT } from '../../shared/toolCount';

const PATH = '/about';

export default function About() {
  return (
    <MarketingPage path={PATH}>
      <Section id="why" title="Why FinatriX exists">
        <P>
          Most financial tools available in India are attached to someone selling something. A SIP
          calculator on a fund house&rsquo;s site exists to sell that fund. A &ldquo;free&rdquo;
          budgeting app is often a lead-generation form for a loan. The arithmetic is usually
          correct; the framing rarely is.
        </P>
        <P>
          FinatriX is the version without that conflict. Every calculator here shows its working,
          states its assumptions on the page, and stops at the point where a decision is yours to
          make. There is no product to sell you at the end of it, because there is no product —
          the money tools are free and there is nothing on the site that pays us a commission.
        </P>
        <Facts
          items={[
            { value: String(TOOL_COUNT), label: 'Free money tools' },
            { value: '0', label: 'Ad or tracking cookies' },
            { value: '0', label: 'Affiliate links' },
            { value: 'India', label: 'Tax and instrument logic' },
          ]}
        />
      </Section>

      <Section id="business-model" title="How FinatriX makes money">
        <P>
          One way: <strong className="text-ink">FinatriX Careers subscriptions</strong>, from{' '}
          {formatInr(CAREERS_FROM_PRICE)} a month. That is the entire business model.
        </P>
        <P>It is worth being specific about what that rules out, because these are the things a
          finance site usually does instead:
        </P>
        <UL>
          <li>No advertising, and no advertising networks embedded in the pages.</li>
          <li>No affiliate or referral commission on any product mentioned anywhere on the site.</li>
          <li>No selling, renting or sharing of user data. There is no data-broker relationship.</li>
          <li>No lead generation — your details are never passed to a bank, broker or insurer.</li>
          <li>No paid placement. No fund, bank or employer can buy its way into a result.</li>
        </UL>
        <P>
          This is why the money tools can stay free without a catch: they are not the revenue, and
          they are not the funnel. They are the reason to trust the part that is paid.
        </P>
      </Section>

      <Section id="principles" title="The principles behind every tool">
        <Grid min={250}>
          <Card title="Education first" eyebrow="01">
            Every calculator is a model you can inspect, with its assumptions stated on the page.
            None of it is advice, and the site says so wherever it matters rather than in a footer
            nobody reads.
          </Card>
          <Card title="Built for India" eyebrow="02">
            Indian tax slabs, SIPs, lakh and crore formatting, and instruments that actually exist
            here. Generic international tools quietly get Indian tax treatment wrong.
          </Card>
          <Card title="Private by default" eyebrow="03">
            Signed out, your figures never leave your browser. Signed in, they are isolated to your
            account at the database level. No fingerprinting, no cross-session tracking.
          </Card>
          <Card title="Honest about limits" eyebrow="04">
            Where a tool cannot know something, it says so. Where a projection is illustrative, it
            is labelled illustrative. Confidence you have not earned is the most expensive thing a
            finance product can sell.
          </Card>
        </Grid>
      </Section>

      <Section id="what-we-are-not" title="What FinatriX is not">
        <P>
          FinatriX is not a bank, a broker, an exchange, or a SEBI-registered investment adviser. It
          does not execute trades, hold money, connect to your bank accounts, or manage anything on
          your behalf. Nothing on the site is a recommendation to buy, sell or hold any security or
          product, and using it creates no advisory or fiduciary relationship.
        </P>
        <P>
          Calculations, projections, tax figures and rates are illustrative, are based on
          assumptions believed accurate when written, and can become outdated — tax rules change.
          Before any decision that matters, confirm the numbers and speak to a qualified,
          licensed professional.
        </P>
      </Section>

      <Section id="the-two-halves" title="Money and careers, in one place">
        <P>
          FinatriX has two halves that share one account. The money tools help you understand what
          you have and what to do with it. FinatriX Careers helps you increase the number those
          tools operate on — because for most people, at most stages, income is the largest single
          lever on a financial plan, and it is the one personal-finance software almost always
          ignores.
        </P>
        <CtaRow
          primary={{ to: '/tools', label: 'Open the free tools' }}
          secondary={{ to: '/careers', label: 'See FinatriX Careers' }}
        />
      </Section>

      <RelatedPages paths={['/pricing', '/security', '/faq', '/careers', '/privacy', '/contact']} />
    </MarketingPage>
  );
}
