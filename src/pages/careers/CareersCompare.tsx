/**
 * /careers/compare and /careers/compare/<rival> — the comparison surface.
 *
 * Two components, one data source (`RIVALS`), so a hub that lists four rivals
 * and three pages that exist is not a state this can reach.
 *
 * The editorial rule these pages follow, and state openly to the reader: every
 * claim about the OTHER product is category-level — a professional network, a
 * national job board, a global aggregator — never a claim about a specific
 * feature, price or number. Those change without notice, and a comparison page
 * quietly asserting something false about a competitor is a trust problem long
 * before it is an SEO one. Each page leads with where the rival is genuinely
 * stronger, because a comparison that finds the author's product better at
 * everything is not read as a comparison.
 */

import { Link, useParams } from 'react-router';
import MarketingPage from '../../marketing/MarketingPage';
import { P, RelatedPages, Section } from '../../marketing/ui';
import NotFound from '../NotFound';
import { RIVALS, rivalFor } from '../../shared/publicPages';

/* ------------------------------------------------------------------------- *
 * Hub
 * ------------------------------------------------------------------------- */

export function CareersCompareIndex() {
  return (
    <MarketingPage path="/careers/compare">
      <Section id="how-we-compare" title="How these comparisons are written">
        <P>
          Three rules, so you know what you are reading. First, every page leads with what the other
          product does better — if that section were empty the comparison would be an
          advertisement. Second, nothing here claims a specific feature, price or number about
          another company; those change weekly and a stale claim is worse than no claim. Third, the
          honest answer is usually &ldquo;use both&rdquo;, and where that is true the page says so.
        </P>
        <P>
          FinatriX Careers is not a job board. It does not have employer relationships, a social
          graph, or an index of its own. It is the layer that decides what to do with the listings
          the boards already have — which is why comparing it to them is genuinely a question of
          &ldquo;for what&rdquo; rather than &ldquo;which is better&rdquo;.
        </P>
      </Section>

      <Section id="comparisons" title="The comparisons">
        <ul className="space-y-3">
          {RIVALS.map((r) => (
            <li key={r.slug}>
              <Link
                to={`/careers/compare/${r.slug}`}
                className="group block rounded-[16px] border border-hairline p-5 transition-colors hover:border-[color:var(--accent-text)] focus-visible:border-[color:var(--accent-text)]"
              >
                <span className="text-[15px] font-semibold text-ink transition-colors group-hover:text-accent-text">
                  FinatriX Careers vs {r.name}
                </span>
                <span className="mt-2 block max-w-[68ch] text-[14px] leading-[1.65] text-ink-2">
                  {r.verdict}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <RelatedPages paths={['/careers', '/careers/features', '/pricing', '/about', '/security', '/faq']} />
    </MarketingPage>
  );
}

/* ------------------------------------------------------------------------- *
 * Per-rival page
 * ------------------------------------------------------------------------- */

function Column({
  title,
  eyebrow,
  items,
}: {
  title: string;
  eyebrow: string;
  items: readonly string[];
}) {
  const id = `col-${eyebrow.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <section aria-labelledby={id} className="fx-glass rounded-[18px] p-6">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent-text">
        {eyebrow}
      </span>
      <h2 id={id} className="mt-2 text-[17px] font-semibold tracking-[-0.01em] text-ink">
        {title}
      </h2>
      <ul className="mt-4 space-y-3 text-[14px] leading-[1.65] text-ink-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5">
            <span aria-hidden="true" className="mt-[2px] shrink-0 text-accent-text">
              ✓
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function CareersCompareRival() {
  const { rival: slug } = useParams();
  const rival = rivalFor(slug);

  // An unknown slug is a genuine 404, not a redirect to the hub: the URL was
  // never valid, and the edge Worker already answers 404 for it. Rendering the
  // hub instead would make a broken inbound link look like a working page.
  if (!rival) return <NotFound />;

  const path = `/careers/compare/${rival.slug}`;

  return (
    <MarketingPage path={path} wide>
      <Section id="short-answer" title="The short answer">
        <P className="text-ink text-[16px]">{rival.verdict}</P>
        <P>
          {rival.name} is {rival.category}. FinatriX Careers is a workspace that searches several
          job sources at once, scores each role against your own resume, and tracks the process
          through to an offer. They overlap on &ldquo;where do I find roles&rdquo; and barely at all
          on anything else.
        </P>
      </Section>

      <Section id="side-by-side" title="Where each one is stronger">
        <div className="grid gap-4 md:grid-cols-2">
          <Column
            eyebrow={rival.name}
            title={`What ${rival.name} does better`}
            items={rival.theirStrengths}
          />
          <Column
            eyebrow="FinatriX Careers"
            title="What FinatriX Careers does differently"
            items={rival.ourStrengths}
          />
        </div>
      </Section>

      <Section id="using-both" title="Using both">
        <P>
          Most people should. Keep {rival.name} for what it is genuinely best at, and use FinatriX
          Careers for the decision layer on top: scoring the roles you found against your actual
          resume, tailoring the application, and tracking every one of them through to an outcome.
          Nothing about running both is duplicated effort — they do different jobs.
        </P>
        <P className="text-ink-3 text-[13.5px]">
          A note on fairness: everything above about {rival.name} describes the kind of product it
          is, not a snapshot of its current feature list or pricing — those change often, and we
          would rather say less than say something that quietly stopped being true. Check their site
          for what they offer today. Everything said about FinatriX Careers is what it does now, and{' '}
          <Link to="/careers/features" className="fx-prose-link">
            the feature page
          </Link>{' '}
          states the limits of each part.
        </P>
      </Section>

      <Section id="next" title="Try it">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/signup"
            className="fx-btn-gold inline-flex items-center gap-2 rounded-full px-7 py-3.5 font-mono text-[12px] uppercase tracking-[0.1em]"
          >
            Create a free account <span aria-hidden="true">→</span>
          </Link>
          <Link
            to="/pricing"
            className="fx-btn-ghost inline-flex items-center rounded-full px-6 py-3.5 font-mono text-[12px] uppercase tracking-[0.1em]"
          >
            See pricing
          </Link>
        </div>
      </Section>

      <RelatedPages
        paths={[
          ...RIVALS.filter((r) => r.slug !== rival.slug).map((r) => `/careers/compare/${r.slug}`),
          '/careers/features',
          '/careers',
          '/pricing',
        ]}
      />
    </MarketingPage>
  );
}
