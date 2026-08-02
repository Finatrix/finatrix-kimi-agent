/**
 * /companies and /companies/<slug> — the company intelligence surface.
 *
 * Two components, one data source (`COMPANIES`), so a hub listing twelve
 * employers and eleven pages that exist is not a state this can reach.
 *
 * Every page renders `COMPANY_CAVEAT` verbatim, and that is not boilerplate. A
 * structured page about a named employer reads as authoritative whether or not
 * it claims to be, and a reader who assumed these figures came from inside the
 * firm would be misled by omission. Saying plainly what the page is not — no
 * deadlines, no salaries, no relationship with the employer — is the price of
 * publishing it at all.
 */

import { Link, useParams } from 'react-router';
import MarketingPage from '../../marketing/MarketingPage';
import { P, RelatedPages, Section } from '../../marketing/ui';
import NotFound from '../NotFound';
import {
  COMPANIES_ROOT,
  SECTORS,
  companiesInSector,
  companyFor,
  companyPath,
  peersOf,
  readingForCompany,
  type Sector,
} from '../../shared/companies';
// The long-form copy. A plain import: this component is already `lazy()` in
// App.tsx, so the bundler places the copy in this route's chunk rather than on
// the landing critical path — see the note at the top of that module.
import { COMPANY_CAVEAT, companyCopyFor } from '../../content/companies';
import { LEARN_ROOT } from '../../shared/content';

/* ------------------------------------------------------------------------- *
 * Hub
 * ------------------------------------------------------------------------- */

function SectorSection({ sector }: { sector: Sector }) {
  const companies = companiesInSector(sector);
  if (!companies.length) return null;
  const meta = SECTORS[sector];

  return (
    <Section id={`sector-${sector}`} title={meta.name} intro={meta.blurb}>
      <ul
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))' }}
      >
        {companies.map((c) => (
          <li key={c.slug}>
            <Link
              to={companyPath(c)}
              className="group flex h-full flex-col rounded-[16px] border border-hairline p-5 transition-colors hover:border-[color:var(--accent-text)] focus-visible:border-[color:var(--accent-text)]"
            >
              <span className="text-[16px] font-semibold tracking-[-0.01em] text-ink transition-colors group-hover:text-accent-text">
                {c.name}
              </span>
              <span className="mt-2 flex-1 text-[14px] leading-[1.65] text-ink-2">{c.overview}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function CompaniesIndex() {
  return (
    <MarketingPage path={COMPANIES_ROOT}>
      <Section id="what-these-are" title="What these pages contain">
        <P>
          Each page describes how one employer is organised, what its divisions actually do, what
          shape its graduate hiring takes, the stages of its process, and where a career inside it
          tends to go. They are written to be useful when you are choosing what to apply to and
          preparing for the stages after that.
        </P>
        <div className="mt-6 rounded-[16px] border border-hairline bg-surface-2 p-5">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent-text">
            What they deliberately do not contain
          </h3>
          <p className="mt-3 max-w-[68ch] text-[14.5px] leading-[1.7] text-ink-2">
            {COMPANY_CAVEAT}
          </p>
        </div>
      </Section>

      <SectorSection sector="universal-bank" />
      <SectorSection sector="investment-bank" />
      <SectorSection sector="professional-services" />

      <RelatedPages
        paths={[
          `${LEARN_ROOT}/banking-careers`,
          `${LEARN_ROOT}/graduate-programs`,
          `${LEARN_ROOT}/interview-preparation`,
          '/careers',
          '/careers/features',
        ]}
        title="Where to prepare"
      />
    </MarketingPage>
  );
}

/* ------------------------------------------------------------------------- *
 * Per-company page
 * ------------------------------------------------------------------------- */

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <ul className="ml-5 max-w-[68ch] list-disc space-y-2.5 text-[15px] leading-[1.7] text-ink-2 marker:text-accent-text">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default function CompanyPage() {
  const { company: slug } = useParams();
  const company = companyFor(slug);
  const copy = companyCopyFor(slug);

  // An unknown slug is a genuine 404, not a redirect to the hub: the edge
  // Worker already answers 404 for it, and rendering the hub instead would make
  // a broken inbound link look like a working page.
  if (!company || !copy) return <NotFound />;

  return (
    <MarketingPage path={companyPath(company)}>
      <Section id="business-areas" title="What the business actually does">
        <Bullets items={copy.businessAreas} />
        <p className="mt-5 max-w-[68ch] text-[14.5px] leading-[1.7] text-ink-3">
          Choosing between these matters more than choosing between employers —{' '}
          <Link to={`${LEARN_ROOT}/banking-careers/banking-divisions`} className="fx-prose-link">
            the divisions of a bank
          </Link>{' '}
          sets out why the gap between two divisions is wider than the gap between two firms.
        </p>
      </Section>

      <Section
        id="graduate-programs"
        title="Graduate programmes"
        intro="The shape of the intake, not this year's dates — those live on the firm's own careers site."
      >
        <Bullets items={copy.graduatePrograms} />
      </Section>

      <Section
        id="hiring-process"
        title="The hiring process"
        intro="The stages candidates typically move through, in order. Each one screens for something different."
      >
        <ol className="ml-5 max-w-[68ch] list-decimal space-y-2.5 text-[15px] leading-[1.7] text-ink-2 marker:text-accent-text">
          {copy.hiringProcess.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        <p className="mt-5 max-w-[68ch] text-[14.5px] leading-[1.7] text-ink-3">
          What each stage is actually filtering for, and how to prepare for it, is in{' '}
          <Link
            to={`${LEARN_ROOT}/graduate-programs/application-stages`}
            className="fx-prose-link"
          >
            every graduate application stage
          </Link>
          .
        </p>
      </Section>

      <Section id="career-paths" title="Career paths">
        <Bullets items={copy.careerPaths} />
      </Section>

      <Section id="interview-prep" title="What to prepare for this employer">
        <Bullets items={copy.interviewPrep} />
      </Section>

      <Section id="official" title="The official source">
        <P>
          Anything current — open roles, application windows, locations, the specifics of a
          programme — belongs to the employer, not to us.
        </P>
        <a
          href={company.careersSite}
          target="_blank"
          rel="noopener noreferrer"
          className="fx-btn-ghost mt-2 inline-flex items-center rounded-full px-6 py-3.5 font-mono text-[12px] uppercase tracking-[0.1em]"
        >
          {company.name} careers site
          <span className="sr-only"> (opens in a new tab)</span>
          <span aria-hidden="true" className="ml-1.5">
            ↗
          </span>
        </a>
        <p className="mt-6 max-w-[68ch] border-t border-hairline pt-5 text-[13.5px] leading-[1.7] text-ink-3">
          {COMPANY_CAVEAT}
        </p>
      </Section>

      {/* Both strips derived: the guides from the company's sector, the peers
          from the sector membership. Adding a company or a guide wires it into
          the existing pages with no edit to any of them. */}
      <RelatedPages
        paths={readingForCompany(company).map((key) => `${LEARN_ROOT}/${key}`)}
        title="Read before you apply"
      />

      <RelatedPages
        paths={[...peersOf(company).map(companyPath), COMPANIES_ROOT]}
        title="Similar employers"
      />
    </MarketingPage>
  );
}
