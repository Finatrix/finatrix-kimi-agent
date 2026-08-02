/**
 * The chrome every public page renders inside — marketing, trust, legal-adjacent
 * and the whole knowledge layer.
 *
 * Extracted from `MarketingPage` when the knowledge layer arrived. The
 * alternative was a second shell for `/learn/*`, and the design charter's own
 * test for that is the right one: a visitor arriving on an article from a search
 * result and clicking through to /pricing should not be able to tell that they
 * changed page templates. Two shells drift; one does not.
 *
 * `MarketingPage` is now a thin wrapper that resolves a `PublicPage` registry
 * entry into these props. The knowledge layer passes them directly, because its
 * pages are described by `content.ts` rather than by the marketing registry —
 * two registries, one chrome.
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router';
import LandingNav from '../sections/LandingNav';
import LandingFooter from '../sections/LandingFooter';
import { formatReviewDate } from '../lib/date';

/** One ancestor crumb. The current page is appended by the shell and is never a link. */
export interface Crumb {
  name: string;
  path: string;
}

export interface PageShellProps {
  /** Visible H1. */
  heading: string;
  /** Short label for the last breadcrumb — the page's own name, not its H1. */
  name: string;
  /** The one-sentence lede under the H1. */
  lede?: string;
  /** Ancestors between Home and this page, outermost first. Mirrors the BreadcrumbList JSON-LD. */
  crumbs?: readonly Crumb[];
  /** ISO review date. Renders the visible half of the page's `dateModified`. */
  updated?: string;
  /** Label for the date stamp — articles say "Updated", everything else "Last reviewed". */
  updatedLabel?: string;
  /** Extra metadata rendered beside the date stamp (reading time, author). */
  meta?: ReactNode;
  /** Content between the header and the body. */
  hero?: ReactNode;
  /** Wider column, for comparison tables and article layouts with a sidebar. */
  wide?: boolean;
  children: ReactNode;
}

function Trail({ crumbs, name }: { crumbs: readonly Crumb[]; name: string }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">
        <li>
          <Link to="/" className="hover:text-accent-text transition-colors">
            Home
          </Link>
        </li>
        {crumbs.map((c) => (
          <li key={c.path} className="flex items-center gap-2">
            <span aria-hidden="true">›</span>
            <Link to={c.path} className="hover:text-accent-text transition-colors">
              {c.name}
            </Link>
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span aria-hidden="true">›</span>
          {/* The current page is text, not a link: a breadcrumb whose last crumb
              navigates to the page you are already on is a keyboard-tab stop
              that does nothing. */}
          <span className="text-ink normal-case tracking-normal text-[12px]" aria-current="page">
            {name}
          </span>
        </li>
      </ol>
    </nav>
  );
}

export default function PageShell({
  heading,
  name,
  lede,
  crumbs = [],
  updated,
  updatedLabel = 'Last reviewed',
  meta,
  hero,
  wide = false,
  children,
}: PageShellProps) {
  return (
    <div className="relative bg-surface-base min-h-screen flex flex-col">
      <LandingNav />

      {/* pt-14 clears the fixed nav; the ambient gradient is the same one the
          landing hero uses, so the pages read as one site. */}
      <div className="relative flex-1 pt-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
          style={{
            background:
              'radial-gradient(120% 100% at 50% 0%, rgba(212,175,55,0.10), transparent 62%)',
          }}
        />

        <div
          className={`relative mx-auto w-full px-5 sm:px-8 pt-8 sm:pt-12 pb-20 ${
            wide ? 'max-w-[1080px]' : 'max-w-[820px]'
          }`}
        >
          <Trail crumbs={crumbs} name={name} />

          <header className="mt-7">
            <h1 className="text-[clamp(30px,5vw,44px)] font-semibold leading-[1.08] tracking-[-0.025em] text-ink">
              {heading}
            </h1>
            {lede && (
              <p className="mt-4 max-w-[64ch] text-[16px] leading-[1.65] text-ink-2">{lede}</p>
            )}
            {/* A visible review date is the human half of the `dateModified` in
                this page's JSON-LD. Both read the same field, which is what
                makes the claim checkable rather than decorative — and it is the
                signal an AI answer engine uses to decide how current a citation
                is. */}
            {updated && (
              <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                <span>
                  {updatedLabel} <time dateTime={updated}>{formatReviewDate(updated)}</time>
                </span>
                {meta}
              </p>
            )}
          </header>

          {hero}

          <div className="mt-12">{children}</div>
        </div>
      </div>

      <LandingFooter />
    </div>
  );
}
