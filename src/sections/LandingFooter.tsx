import { Link } from 'react-router';
import { LocalClock } from '../tools/ui/LocalClock';
import { SUPPORT_MAILTO } from '../shared/brand';
import { TOOLS } from '../lib/tools';
import { COMPARE_ROOT } from '../shared/comparisons';
import { COMPANIES_ROOT } from '../shared/companies';
import { LEARN_ROOT, PILLAR_TOPICS, topicPath } from '../shared/content';

/**
 * The site footer, and — since it renders on the landing page and on every
 * public marketing page — the main way a crawler discovers the public surface.
 *
 * It used to carry three links (Privacy, Terms and a `mailto:`). That was fine
 * when there were ten public URLs and every one of them was in the top nav; with
 * pricing, help, support, trust and the Careers marketing pages, a three-link
 * footer meant a dozen indexable pages reachable only from the sitemap. Search
 * engines treat a URL that nothing internally links to as one nothing vouches
 * for, and a visitor cannot find it at all.
 *
 * Grouped under real headings rather than one flat row: four columns of
 * unlabelled links is a navigation surface a screen-reader user has to read
 * end-to-end to understand.
 */

interface FooterLink {
  to: string;
  label: string;
}

const COLUMNS: Array<{ heading: string; links: FooterLink[] }> = [
  {
    heading: 'Money tools',
    // Generated from the tool registry so a new calculator appears here the day
    // it ships, rather than the day someone remembers this file exists.
    links: [
      ...TOOLS.map((t) => ({ to: t.href, label: t.name })),
      // NOT "Compare": the top nav already uses that word for PeerCompare
      // (`short: 'Compare'` in the tool registry), and two links a column apart
      // reading "Compare" and pointing at unrelated pages is the kind of
      // ambiguity a visitor resolves by clicking the wrong one.
      { to: COMPARE_ROOT, label: 'FinatriX vs alternatives' },
    ],
  },
  {
    heading: 'Careers',
    links: [
      { to: '/careers', label: 'FinatriX Careers' },
      { to: '/careers/features', label: 'Features' },
      { to: COMPANIES_ROOT, label: 'Company guides' },
      { to: '/careers/compare', label: 'Comparisons' },
      { to: '/pricing', label: 'Pricing' },
    ],
  },
  {
    heading: 'Learn',
    // The knowledge layer's entry point into the site graph. Generated from the
    // topic registry, so a new pillar topic is linked from every page the day it
    // ships — without this the articles would be reachable only from the hub,
    // and a hub nothing links to is a page search engines have no reason to
    // trust.
    //
    // PILLARS, not every topic. The registry holds dozens; listing all of them
    // here would put a wall of links under every page and split the internal
    // link equity of the footer across topics that do not need it. "All guides"
    // reaches the rest in one click — see the note on `Topic.pillar`.
    links: [
      { to: LEARN_ROOT, label: 'All guides' },
      ...PILLAR_TOPICS.map((t) => ({ to: topicPath(t), label: t.name })),
      { to: '/editorial-standards', label: 'Editorial standards' },
    ],
  },
  {
    heading: 'Support',
    links: [
      { to: '/help', label: 'Help Centre' },
      { to: '/faq', label: 'FAQ' },
      { to: '/support', label: 'Support' },
      { to: '/contact', label: 'Contact' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { to: '/about', label: 'About' },
      { to: '/security', label: 'Trust & security' },
      { to: '/privacy', label: 'Privacy' },
      { to: '/terms', label: 'Terms' },
      { to: '/refunds', label: 'Refunds' },
    ],
  },
];

export default function LandingFooter() {
  return (
    <footer className="relative z-10 border-t border-hairline bg-surface-footer">
      <div className="mx-auto max-w-[1280px] px-5 sm:px-6 py-12">
        {/* ONE navigation landmark, not one per column. Separate <nav>s would
            each be announced as a landmark, so a screen-reader user cycling
            landmarks would pass through the footer five times to leave it. The
            per-column <h2>s still give the same structure to anyone navigating
            by heading.

            Three breakpoints rather than two: at five columns, jumping straight
            from two to five puts each column at ~140px on a small tablet, which
            wraps most of the labels onto two lines. */}
        <nav
          aria-label="Footer"
          className="grid grid-cols-2 gap-8 sm:grid-cols-3 sm:gap-6 lg:grid-cols-5"
        >
          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                {col.heading}
              </h2>
              <ul className="mt-3.5 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.to}>
                    <Link
                      to={l.to}
                      className="text-[13.5px] text-ink-2 transition-colors hover:text-accent-text"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-hairline pt-6 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="7" y="7" width="10" height="10" rx="2.5" fill="#D4AF37" />
              <circle cx="12" cy="12" r="2.1" fill="var(--surface-footer)" />
            </svg>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
              © 2026 FinatriX
            </span>
          </div>

          <p className="max-w-[52ch] text-center font-mono text-[10px] uppercase leading-[1.7] tracking-[0.1em] text-ink-3 sm:text-left">
            Educational tools · not financial advice ·{' '}
            <a href={SUPPORT_MAILTO} className="transition-colors hover:text-accent-text">
              Email us
            </a>
            {/* TODO(brand): add official social links here once a profile exists.
                This slot held a link to https://twitter.com/finatrix_, which is not
                a registered handle (HTTP 404) — the site's only outbound social
                link sent visitors to an X error page, which reads as an abandoned
                brand on the one surface meant to prove the opposite. An absent
                link is strictly better than a broken one; add nothing here that
                has not been opened and confirmed. */}
          </p>

          <LocalClock compact />
        </div>
      </div>
    </footer>
  );
}
