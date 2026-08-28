import { Link, useLocation } from 'react-router';
import { TOOLS } from '../lib/tools';
import { CAREERS_ROUTES } from '../careers/constants';

/**
 * The one row of navigation pills the whole site uses.
 *
 * WHY THIS COMPONENT EXISTS
 * -------------------------
 * There were two navigations. The landing page and every public page had a row
 * of pills — a coloured dot, the short tool name, a soft hover fill — that read
 * as one calm object. `/tools` had something else: the same idea, different
 * type, different spacing, and `overflow-x: auto`, so the moment a visitor
 * clicked into a tool the navigation turned into a horizontally scrolling strip
 * with items sliding off the edge. Two navigations for one site is a drift
 * problem before it is a design problem; whichever one someone edited, the
 * other stayed as it was.
 *
 * So both now render this. The pills are identical everywhere; only the
 * *destinations* differ, which is the one thing that genuinely should.
 *
 * IT WRAPS. IT NEVER SCROLLS SIDEWAYS.
 * ------------------------------------
 * A horizontally scrolling nav hides destinations behind a gesture with no
 * affordance — on a trackpad most people never discover the items past the
 * right edge exist. When the row runs out of width it now wraps to a second
 * line, which costs 34px and hides nothing. The active pill is therefore always
 * on screen, which is what makes the bar a position indicator rather than
 * decoration.
 */

export interface NavPillsProps {
  /**
   * Where this is rendered.
   *
   * `marketing` — the public site: the calculators plus Careers.
   * `app`       — inside `/tools`: the same calculators, plus the personalised
   *               hub and the workspace screens that only exist behind sign-in.
   */
  variant: 'marketing' | 'app';
  /** Accessible name for the nav landmark. */
  label?: string;
  /**
   * Width below which the row is hidden, because a narrower layout has its own
   * navigation (the bottom tab bar and the drawer).
   *
   * A prop with a media query in this component's own stylesheet, NOT a
   * Tailwind `hidden lg:flex` on the caller: `.fx-navpills { display: flex }`
   * is defined after `@tailwind utilities`, so at equal specificity it would
   * beat `.hidden` and the row would render at every width regardless.
   */
  hideBelow?: 'md' | 'lg';
  className?: string;
}

interface Pill {
  key: string;
  to: string;
  label: string;
  /** The dot colour. Gold for everything that is not a calculator. */
  color: string;
}

const GOLD = '#D4AF37';

export function NavPills({ variant, label = 'Tools', hideBelow, className }: NavPillsProps) {
  const { pathname } = useLocation();

  // The SHORT form everywhere. The full names ("Reverse Goal Planner") pushed
  // the in-app bar onto a second line at every realistic desktop width, which
  // is the difference between a navigation and a paragraph of links. The short
  // labels are what the landing page has always used, and using them in both
  // places is what makes the two bars the same object rather than two bars that
  // merely resemble each other.
  const tools: Pill[] = TOOLS.map((t) => ({
    key: t.id,
    to: t.href,
    label: t.short,
    color: t.color,
  }));

  const pills: Pill[] = variant === 'app'
    ? [
        { key: 'dashboard', to: '/tools/dashboard', label: 'Dashboard', color: GOLD },
        ...tools,
        { key: 'reports', to: '/tools/reports', label: 'Reports', color: GOLD },
        { key: 'calendar', to: '/tools/calendar', label: 'Calendar', color: GOLD },
        // In-app navigation goes to the WORKSPACE, not the public landing page
        // at /careers — inside the signed-in shell "Careers" means the section,
        // not the pitch.
        { key: 'careers', to: CAREERS_ROUTES.dashboard, label: 'Careers', color: GOLD },
      ]
    : [...tools, { key: 'careers', to: '/careers', label: 'Careers', color: GOLD }];

  /** The active tool id from the URL, so both variants highlight the same way. */
  const activeTool = /^\/tools\/([a-z]+)/i.exec(pathname)?.[1]?.toLowerCase() ?? '';

  return (
    <nav
      className={[
        'fx-navpills',
        hideBelow ? `fx-navpills-${hideBelow}` : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
      id={variant === 'app' ? 'mainNav' : undefined}
      aria-label={label}
    >
      {pills.map((p) => {
        const active = variant === 'app' && p.key === activeTool;
        return (
          <Link
            key={p.key}
            to={p.to}
            data-route={p.key}
            className={`fx-navpill${active ? ' on' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <span className="fx-navpill-dot" style={{ backgroundColor: p.color }} aria-hidden="true" />
            {p.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default NavPills;
