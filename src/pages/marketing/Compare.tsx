/**
 * /compare and /compare/<alternative> — the money-tool comparison surface.
 *
 * Two components, one data source (`ALTERNATIVES`), so a hub listing six
 * comparisons and five pages that exist is not a state this can reach.
 *
 * The editorial rules are stated to the reader rather than only to future
 * maintainers, because a comparison page asks to be trusted about a competitor
 * and the only way to earn that is to say what you will and will not claim. No
 * prices, category-level claims only, their strengths first, and the FinatriX
 * limitation stated on every page — see the note at the top of
 * `src/shared/comparisons.ts`.
 */

import { Link, useParams } from 'react-router';
import MarketingPage from '../../marketing/MarketingPage';
import { P, RelatedPages, Section } from '../../marketing/ui';
import NotFound from '../NotFound';
import { TOOLS } from '../../lib/tools';
import {
  ALTERNATIVES,
  COMPARE_ROOT,
  alternativeFor,
  alternativePath,
  otherAlternatives,
} from '../../shared/comparisons';
// The long-form copy. A plain import: this component is already `lazy()` in
// App.tsx, so the bundler places the copy in this route's chunk rather than on
// the landing critical path — see the note at the top of that module.
import { ALTERNATIVE_COPY, OUR_SIDE, alternativeCopyFor } from '../../content/comparisons';

/* ------------------------------------------------------------------------- *
 * Hub
 * ------------------------------------------------------------------------- */

export function CompareIndex() {
  return (
    <MarketingPage path={COMPARE_ROOT}>
      <Section id="how-we-compare" title="How these comparisons are written">
        <P>
          Four rules, so you know what you are reading. Every page leads with what the other product
          does <strong className="font-semibold text-ink">better</strong> — if that section were
          empty the page would be an advertisement. Nothing here quotes a price, because every
          product on this list changes its pricing and tiers without notice and a stale figure is
          worse than none; the pricing <em>model</em> is described instead, with a link to check the
          current one. Claims about other products are category-level rather than feature-by-feature,
          for the same reason. And every page states the honest FinatriX limitation, which is the
          same on all of them.
        </P>
        <div className="mt-6 rounded-[16px] border border-hairline bg-surface-2 p-5">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent-text">
            The limitation, stated once
          </h3>
          <p className="mt-3 max-w-[68ch] text-[14.5px] leading-[1.7] text-ink-2">
            {OUR_SIDE.limitation}
          </p>
        </div>
      </Section>

      <Section
        id="comparisons"
        title="The comparisons"
        intro="Each page answers the same question: which of these is the right tool for what you are actually trying to work out?"
      >
        <ul className="space-y-3">
          {ALTERNATIVES.map((a) => (
            <li key={a.slug}>
              <Link
                to={alternativePath(a)}
                className="group block rounded-[16px] border border-hairline p-5 transition-colors hover:border-[color:var(--accent-text)] focus-visible:border-[color:var(--accent-text)]"
              >
                <span className="text-[15px] font-semibold text-ink transition-colors group-hover:text-accent-text">
                  FinatriX vs {a.name}
                </span>
                <span className="mt-2 block max-w-[68ch] text-[14px] leading-[1.65] text-ink-2">
                  {ALTERNATIVE_COPY[a.slug].verdict}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="what-we-are"
        title="What is being compared, on our side"
        intro={OUR_SIDE.whatItIs}
      >
        <ul className="flex flex-wrap gap-2.5">
          {TOOLS.map((tool) => (
            <li key={tool.id}>
              <Link
                to={tool.href}
                className="inline-flex rounded-full border border-hairline px-4 py-2 text-[13px] text-ink-2 transition-colors hover:border-[color:var(--accent-text)] hover:text-accent-text focus-visible:border-[color:var(--accent-text)]"
              >
                {tool.name}
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <RelatedPages paths={['/pricing', '/security', '/privacy', '/learn', '/about', '/faq']} />
    </MarketingPage>
  );
}

/* ------------------------------------------------------------------------- *
 * Per-alternative page
 * ------------------------------------------------------------------------- */

function Column({
  title,
  eyebrow,
  items,
  marker = '✓',
}: {
  title: string;
  eyebrow: string;
  items: readonly string[];
  marker?: string;
}) {
  const id = `col-${eyebrow.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <section aria-labelledby={id} className="fx-glass rounded-[18px] p-6">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent-text">
        {eyebrow}
      </span>
      <h3 id={id} className="mt-2 text-[17px] font-semibold tracking-[-0.01em] text-ink">
        {title}
      </h3>
      <ul className="mt-4 space-y-3 text-[14px] leading-[1.65] text-ink-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2.5">
            <span aria-hidden="true" className="mt-[2px] shrink-0 text-accent-text">
              {marker}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function CompareAlternative() {
  const { alternative: slug } = useParams();
  const alt = alternativeFor(slug);
  const copy = alternativeCopyFor(slug);

  // An unknown slug is a genuine 404, not a redirect to the hub: the URL was
  // never valid, and the edge Worker already answers 404 for it. Rendering the
  // hub instead would make a broken inbound link look like a working page.
  if (!alt || !copy) return <NotFound />;

  return (
    <MarketingPage path={alternativePath(alt)} wide>
      <Section id="short-answer" title="The short answer">
        <P className="text-ink text-[16px]">{copy.verdict}</P>
      </Section>

      <Section
        id="at-a-glance"
        title="At a glance"
        intro="Pricing is described as a model rather than a figure — see the note at the foot of this page."
      >
        <div className="overflow-x-auto rounded-[14px] border border-hairline">
          <table className="w-full border-collapse text-left text-[14px]">
            <caption className="caption-bottom px-4 py-3 text-left text-[12.5px] leading-[1.6] text-ink-3">
              {alt.name} and the FinatriX calculators, compared on the things that do not change
              monthly.
            </caption>
            <thead>
              <tr className="border-b border-hairline bg-surface-2">
                {['', alt.name, 'FinatriX calculators'].map((h, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="px-4 py-3 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['What it is', alt.category, OUR_SIDE.whatItIs],
                ['Pricing model', copy.pricingModel, OUR_SIDE.pricingModel],
                ['Your data', copy.dataModel, OUR_SIDE.dataModel],
                ['Best for', copy.bestFor.them, copy.bestFor.us],
              ].map((row, i) => (
                <tr key={i} className={i ? 'border-t border-hairline' : ''}>
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className={`px-4 py-3 align-top leading-[1.6] ${
                        j === 0 ? 'whitespace-nowrap font-medium text-ink' : 'text-ink-2'
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="side-by-side" title="Where each one is stronger">
        <div className="grid gap-4 md:grid-cols-2">
          <Column
            eyebrow={alt.name}
            title={`What ${alt.name} does better`}
            items={copy.theirStrengths}
          />
          <Column
            eyebrow="FinatriX"
            title="What the calculators do differently"
            items={copy.ourStrengths}
          />
        </div>
      </Section>

      <Section
        id="trade-offs"
        title="The trade-offs, both directions"
        intro="Neither side of this comparison is free of them, and a page that only listed one product's would not be worth reading."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Column
            eyebrow={`${alt.name} — limits`}
            title={`Where ${alt.name} costs you something`}
            items={copy.theirLimits}
            marker="—"
          />
          <Column
            eyebrow="FinatriX — limits"
            title="Where the calculators cost you something"
            items={[OUR_SIDE.limitation]}
            marker="—"
          />
        </div>
      </Section>

      <Section id="using-both" title="Using both">
        <P>
          Frequently the right answer. {alt.name} and a set of calculators are not substitutes for
          each other — one is where you record and observe, the other is where you work out what a
          number should be. Nothing about running both is duplicated effort.
        </P>
        <P className="text-ink-3 text-[13.5px]">
          A note on fairness. Everything above about {alt.name} describes the kind of product it is,
          not a snapshot of its current features, tiers or prices — those change often, and we would
          rather say less than say something that quietly stopped being true. Check{' '}
          <a
            href={alt.site}
            target="_blank"
            rel="noopener noreferrer"
            className="fx-prose-link"
          >
            their own site
            <span className="sr-only"> (opens in a new tab)</span>
            <span aria-hidden="true" className="ml-0.5 text-[0.85em]">
              ↗
            </span>
          </a>{' '}
          for what they offer today. Everything said about FinatriX is what it does now, and{' '}
          <Link to="/pricing" className="fx-prose-link">
            the pricing page
          </Link>{' '}
          states the terms in full.
        </P>
      </Section>

      <Section id="next" title="Try the calculators">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/tools/budget"
            className="fx-btn-gold inline-flex items-center gap-2 rounded-full px-7 py-3.5 font-mono text-[12px] uppercase tracking-[0.1em]"
          >
            Open Budget Builder <span aria-hidden="true">→</span>
          </Link>
          <Link
            to="/learn"
            className="fx-btn-ghost inline-flex items-center rounded-full px-6 py-3.5 font-mono text-[12px] uppercase tracking-[0.1em]"
          >
            Read the guides
          </Link>
        </div>
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
          Free · no account needed · nothing stored until you sync
        </p>
      </Section>

      {/* Every other comparison, derived — so the set stays fully connected as
          it grows, with no edit to the pages that already exist. */}
      <RelatedPages
        paths={[
          ...otherAlternatives(alt.slug).map(alternativePath),
          COMPARE_ROOT,
          '/pricing',
          '/security',
        ]}
        title="Other comparisons"
      />
    </MarketingPage>
  );
}
