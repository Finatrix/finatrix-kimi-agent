/**
 * /faq — the twelve questions people actually ask, in one indexable place.
 *
 * The list is not written here: it is `PUBLIC_PAGES['/faq'].faq`, the same array
 * `seo.ts` turns into the page's `FAQPage` JSON-LD. That is deliberate — Google
 * requires FAQ markup to describe Q&A visible on the page, and rendering from
 * the same array is the only version of that rule that cannot rot.
 */

import { Link } from 'react-router';
import MarketingPage from '../../marketing/MarketingPage';
import { Faq, P, RelatedPages, Section } from '../../marketing/ui';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../../shared/brand';
import { publicPageFor } from '../../shared/publicPages';

const PATH = '/faq';

export default function FaqPage() {
  const page = publicPageFor(PATH);

  return (
    <MarketingPage path={PATH}>
      {page?.faq && <Faq entries={page.faq} id="questions" />}

      <Section id="still-stuck" title="Still stuck?" className="border-t border-hairline pt-10">
        <P>
          The <Link to="/help" className="fx-prose-link">Help Centre</Link> has
          step-by-step guides for each tool, and{' '}
          <Link to="/support" className="fx-prose-link">Support</Link> explains
          what to include so we can answer on the first reply. If you would rather just write to a
          person, email{' '}
          <a href={SUPPORT_MAILTO} className="fx-prose-link">
            {SUPPORT_EMAIL}
          </a>
          .
        </P>
      </Section>

      <RelatedPages paths={['/help', '/support', '/pricing', '/security', '/about', '/privacy']} />
    </MarketingPage>
  );
}
