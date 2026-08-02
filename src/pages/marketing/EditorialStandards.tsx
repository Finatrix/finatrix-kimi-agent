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

      <Section id="who" title="Who writes this">
        <P>
          FinatriX is written and reviewed by the people who build it. There are no invented author
          personas here: a byline naming a person who does not exist would be the exact opposite of
          the trust the rest of this site is built on, and a schema field is not a good enough
          reason to publish one.
        </P>
        <P>
          What that costs is the appearance of a large newsroom. What it buys is that every guide
          describing a calculation was written by someone who could open the file and check.
        </P>
      </Section>

      <Section id="review" title="How pages are reviewed">
        <P>
          Every guide carries a visible review date, and that date is the same field that fills{' '}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[13px]">dateModified</code> in
          the page&rsquo;s structured data. They cannot disagree, because they are one value.
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
