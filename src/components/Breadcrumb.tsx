import { Link } from 'react-router';

/**
 * Home › optional section › current page, matching the actual route hierarchy.
 *
 * Website chrome only (`data-web-only`, hidden under `html.fx-native`): the apps
 * have no "Home" page to lead back to — `/` opens the dashboard — and they walk
 * back with Android's BACK and the iOS edge swipe instead. Marked here rather
 * than at each call site so a new page cannot forget it.
 */
export function Breadcrumb({ current, parent, className = '' }: {
  current: string;
  parent?: { label: string; to: string };
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" data-web-only className={`fx-crumbs ${className}`}>
      <Link to="/" className="fx-crumb">
        Home
      </Link>
      <span className="text-ink-3" aria-hidden="true">›</span>
      {parent && (
        <>
          <Link to={parent.to} className="fx-crumb">
            {parent.label}
          </Link>
          <span className="text-ink-3" aria-hidden="true">›</span>
        </>
      )}
      <span className="fx-crumb-current" aria-current="page">{current}</span>
    </nav>
  );
}
