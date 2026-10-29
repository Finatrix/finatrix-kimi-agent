import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Breadcrumb } from './Breadcrumb';
import AppearanceMenu from './AppearanceMenu';
import { Wordmark } from './Wordmark';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../shared/brand';
import { publicPageFor } from '../shared/publicPages';
import { formatReviewDate } from '../lib/date';
import LandingFooter from '../sections/LandingFooter';

/**
 * Shared chrome for the two legal pages.
 *
 * The heading and the "last updated" date are read from the public-page
 * registry rather than passed in as props. They used to be hand-written here and
 * had already drifted: the page's H1 said "Terms & Conditions" while its
 * `<title>` said "Terms of Use", and the visible date was a string only this
 * file knew about — so nothing could check it against the `dateModified` in the
 * page's own structured data.
 */
export default function LegalPage({
  path,
  children,
}: {
  /** Registry path — must be a `kind: 'legal'` entry in `publicPages.ts`. */
  path: string;
  children: ReactNode;
}) {
  const page = publicPageFor(path);
  if (!page) {
    throw new Error(`LegalPage: "${path}" is not in PUBLIC_PAGES.`);
  }
  const title = page.name;
  const updated = formatReviewDate(page.updated);

  return (
    <div className="min-h-[100svh] bg-surface-base text-ink">
      <header className="sticky top-0 z-50 flex items-center justify-between h-14 px-4 sm:px-6 bg-[var(--nav-bg)] backdrop-blur-[14px] border-b border-hairline-2">
        <Link to="/" aria-label="FinatriX home" className="fx-nav-brand">
          <Wordmark logo={22} />
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <Link to="/" data-web-only className="fx-nav-text-link inline-flex">Home</Link>
          <Link to="/tools" className="fx-nav-text-link inline-flex">Tools</Link>
          <Link to="/privacy" className="fx-nav-text-link hidden sm:inline-flex">Privacy</Link>
          <Link to="/terms" className="fx-nav-text-link hidden sm:inline-flex">Terms</Link>
          <AppearanceMenu />
        </div>
      </header>

      {/* Not a <main>: App.tsx owns the single app-wide `main` landmark, and a
          nested one would give the page two (invalid, and it breaks landmark
          navigation for screen-reader users). */}
      <div className="mx-auto w-full max-w-[760px] px-5 sm:px-8 py-10 sm:py-16">
        <Breadcrumb current={title} className="mb-6" />
        <h1 className="text-[28px] sm:text-[36px] font-medium tracking-[-0.02em] text-ink">
          {title}
        </h1>
        <p className="mt-2 text-[13px] text-ink-3">
          Last updated: <time dateTime={page.updated}>{updated}</time>
        </p>
        <div className="legal-body mt-8 text-[15px] leading-[1.7] text-ink-2">
          {children}
        </div>

        <div className="mt-14 pt-8 border-t border-hairline">
          <p className="text-[15px] text-ink-2">Questions about this policy?</p>
          {/* A row of links, not three links inside a 13px sentence: each is
              a full-height target, and none sits on top of another. */}
          <div className="mt-1 flex flex-wrap gap-x-6">
            <a href={SUPPORT_MAILTO} className="fx-footer-link">Email {SUPPORT_EMAIL}</a>
            <Link to="/support" className="fx-footer-link">Support</Link>
            <Link to="/faq" className="fx-footer-link">FAQ</Link>
          </div>
        </div>
      </div>

      {/* The same footer as every other public page. Without it the two legal
          pages were dead ends: no link out to pricing, help, trust or the
          Careers surface, on URLs that search engines index and people land on
          directly. */}
      <LandingFooter />
    </div>
  );
}

export function H2({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2
      id={id}
      className="text-ink text-[18px] sm:text-[20px] font-medium mt-9 mb-3 tracking-[-0.01em]"
    >
      {children}
    </h2>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="mb-4">{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="mb-4 ml-5 list-disc space-y-2 marker:text-accent-text">{children}</ul>;
}
