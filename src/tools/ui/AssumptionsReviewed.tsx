import { Link } from 'react-router';
import { ASSUMPTIONS_REVIEWED, reviewedLabel } from '../../shared/reviewed';

/**
 * "Financial assumptions reviewed — June 2026."
 *
 * What replaced the footer clock. The clock told visitors the time on their own
 * device, once a second, forever; this tells them how current the numbers they
 * are about to rely on actually are, which is the one date a personal-finance
 * site owes its readers in a place they can always find it.
 *
 * Two callers, two dates, and the difference is deliberate:
 *
 *   • Inside a tool, pass the ACTIVE MARKET's `asOf`. The reader is looking at
 *     that market's rates, so that market's review date is the precise answer.
 *   • On the marketing footer, pass nothing. There is no active market there,
 *     and the honest site-wide statement is the OLDEST pack's date — see
 *     `shared/reviewed.ts`.
 *
 * The date links to Editorial Standards, where "reviewed" is defined, because a
 * date with no stated review process is decoration.
 *
 * Static text: no timer, no re-render, nothing to clean up.
 */
export function AssumptionsReviewed({
  asOf = ASSUMPTIONS_REVIEWED,
  scope,
  compact = false,
}: {
  /** `YYYY-MM`. Defaults to the site-wide (oldest) review date. */
  asOf?: string;
  /** Names the market when there is one — "for the United Kingdom". */
  scope?: string;
  /** Single inline line, for slim bars. */
  compact?: boolean;
}) {
  const label = reviewedLabel(asOf);
  const text = scope
    ? `Financial assumptions for ${scope} reviewed ${label}`
    : `Financial assumptions reviewed ${label}`;

  if (compact) {
    return (
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
        {text} ·{' '}
        <Link to="/editorial-standards" className="transition-colors hover:text-accent-text underline underline-offset-2">
          How we review
        </Link>
      </span>
    );
  }

  return (
    <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 py-3 text-center">
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--ink-3, #8b8b90)"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M9 11l2 2 4-4" />
        <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
      </svg>
      <span className="font-mono text-[11px] tracking-[0.02em]" style={{ color: 'var(--ink-3, #8b8b90)' }}>
        {text}
      </span>
      <Link
        to="/editorial-standards"
        className="font-mono text-[11px] underline underline-offset-2"
        style={{ color: 'var(--accent-text, #C9A23C)' }}
      >
        How we review
      </Link>
    </p>
  );
}
