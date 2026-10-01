/**
 * /editorial-standards — how the guides are written and reviewed.
 *
 * This is the page the `Organization` author node on every article points at,
 * which is the whole reason it has to be specific rather than reassuring. An
 * author entity that resolves to a paragraph of adjectives adds nothing a
 * search engine or a reader can assess; one that names the constraints — no
 * affiliate links, no invented bylines, every figure reproducible from the page
 * — is a claim that can be checked and, if we break it, held against us.
 *
 * Kept deliberately short. The standards are few because standards nobody can
 * recite are not enforced.
 */

import { Link } from 'react-router';
import MarketingPage from '../../marketing/MarketingPage';
import { Card, Faq, Grid, P, RelatedPages, Section, UL } from '../../marketing/ui';
import { SUPPORT_MAILTO } from '../../shared/brand';
import { publicPageFor } from '../../shared/publicPages';
import { ASSUMPTIONS_REVIEWED, reviewedLabel } from '../../shared/reviewed';
import { MARKET_LIST } from '../../tools/lib/markets';

const PATH = '/editorial-standards';

export default function EditorialStandards() {
  const page = publicPageFor(PATH);

  return (
    <MarketingPage path={PATH}>
      <Section id="rules" title="Five rules, and none of them are negotiable">
        <Grid min={250}>
          <Card title="Every number is reproducible" eyebrow="01">
            A figure in a guide is either arithmetic you can redo from inputs printed on the same
            page, or a rule set elsewhere that the page links to. We publish no proprietary market
            data, so we never present an estimate as a measurement.
          </Card>
          <Card title="The writer builds the tool" eyebrow="02">
            Guides describing a calculation are written against the code that runs it. When a guide
            prints a formula, it is the formula in the repository — not a simplified version of it.
          </Card>
          <Card title="Nothing is recommended" eyebrow="03">
            No fund, bank, insurer or scheme is ever named as a recommendation. Guides explain
            mechanisms and categories so you can evaluate a real product yourself, or ask a
            registered adviser a better question.
          </Card>
          <Card title="No money changes what we write" eyebrow="04">
            No affiliate links, no sponsored placements, no paid reviews, no guest posts. The
            Careers subscription is the only revenue source on this site.
          </Card>
          <Card title="Limits are stated, not buried" eyebrow="05">
            Every model has assumptions that break somewhere. Guides say where — in the body, not
            in a footnote — because a reader who does not know the limits cannot use the answer.
          </Card>
        </Grid>
      </Section>

      <Section id="who" title="Who is responsible">
        <P>
          The FinatriX team maintains the tools and educational guides. Questions and corrections
          go directly to <a href={SUPPORT_MAILTO} className="fx-prose-link">our published contact address</a>.
          Include the page, the input you used and the result you expected so we can reproduce the issue.
        </P>
        <P>
          Check the source links and assumptions alongside a result. These tools explain financial
          decisions; they do not replace an adviser who understands your circumstances.
        </P>
      </Section>

      <Section id="review" title="How pages are reviewed">
        <P>
          Guides show a review date so you can judge how current the information is.
          A review date does not mean a rate or rule will remain unchanged; check the linked source
          before relying on time-sensitive information.
        </P>
        <UL>
          <li>
            Pages stating a tax rule, statutory limit or official rate are reviewed when that rule
            changes, and the page links to the authority so you can check it yourself.
          </li>
          <li>
            Pages describing a calculation are reviewed whenever the underlying formula changes.
            Those formulas are parity-tested, so a change is a deliberate act rather than a drift.
          </li>
          <li>Everything else is reviewed at least once a year.</li>
        </UL>
      </Section>

      <Section
        id="sources"
        title="Where the market figures come from"
        intro={`Every market pack carries a review month and a source list, and both are shown inside the tools that use them. Reference layer reviewed across seven markets; individual records carry their own dates. Pack baseline: ${reviewedLabel(ASSUMPTIONS_REVIEWED)}.`}
      >
        <P>
          The calculators are arithmetic, and arithmetic needs inputs: deposit rates, tax
          treatments, long-run return assumptions, cost-of-living multipliers and peer benchmarks.
          Those are claims about the world rather than about your money, so each one is dated and
          attributed.
        </P>
        {/* A horizontally scrollable region must be reachable by keyboard, or a
            reader who cannot use a pointer simply cannot see the right-hand
            columns (axe: scrollable-region-focusable, WCAG 2.1.1). `tabIndex`
            makes it focusable and the role + label make it announced as the
            thing it is rather than an unnamed focus stop. */}
        <div
          className="overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Market packs, review months and sources"
        >
          <table className="w-full min-w-[520px] border-collapse text-left text-[14px] leading-[1.6]">
            <caption className="sr-only">
              Market packs, their review month and the sources behind their figures
            </caption>
            <thead>
              <tr className="border-b border-hairline">
                <th scope="col" className="py-2.5 pr-4 font-semibold text-ink">Market</th>
                <th scope="col" className="py-2.5 pr-4 font-semibold text-ink">Reviewed</th>
                <th scope="col" className="py-2.5 font-semibold text-ink">Sources</th>
              </tr>
            </thead>
            <tbody>
              {MARKET_LIST.map((m) => (
                <tr key={m.id} className="border-b border-hairline align-top">
                  <th scope="row" className="py-3 pr-4 font-medium text-ink-2 whitespace-nowrap">
                    <span aria-hidden="true">{m.flag}</span> {m.name}
                  </th>
                  <td className="py-3 pr-4 text-ink-2 whitespace-nowrap">{reviewedLabel(m.asOf)}</td>
                  <td className="py-3 text-ink-2">{m.sources.join('; ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <P className="mt-5">
          These are maintained by hand on the schedule above, not pulled live. A rate here is an
          indicative average for comparing options against each other, and the provider&rsquo;s own
          current rate is what you would actually receive — which is why every tool that uses one
          says so next to the result and links out.
        </P>
        <P>
          Peer benchmarks carry a further caveat, stated on the tool itself: they describe a
          modelled population — an age band, a cost-of-living tier, a market — and are not a survey
          of FinatriX users. Where a market&rsquo;s figures are estimates rather than a published
          statistic, PeerCompare says so in the panel above its results.
        </P>
      </Section>

      <Section id="corrections" title="Corrections">
        <P>
          If a guide is wrong, we would rather be corrected than be consistent. Email{' '}
          <a href={SUPPORT_MAILTO} className="fx-prose-link">
            support
          </a>{' '}
          with the page and the specific claim. Corrections affecting a calculation are made
          directly and the review date is updated with them.
        </P>
        <P>
          Nothing on FinatriX is financial advice, and none of it is personalised to your
          circumstances. That is a limitation of the format rather than a disclaimer bolted on at
          the end — see the{' '}
          <Link to="/terms" className="fx-prose-link">
            Terms
          </Link>{' '}
          for the full position.
        </P>
      </Section>

      {page?.faq && <Faq entries={page.faq} />}

      <RelatedPages paths={['/learn', '/about', '/security', '/faq']} />
    </MarketingPage>
  );
}
