import { useLocation, useNavigate } from 'react-router';

/**
 * Back navigation for pages nested below the top level.
 *
 * Two rules make it trustworthy rather than decorative:
 *
 * 1. It only appears when there is somewhere to go back *to* — the homepage and
 *    other top-level pages never show it, so it never becomes a no-op control.
 * 2. It prefers real browser history, so Back means the same thing whether the
 *    user presses this, the browser chrome, or a phone's system gesture. On a
 *    cold load (a shared link, a bookmark) there is no in-app history to pop —
 *    react-router reports the default location key — so it falls back to Home
 *    instead of bouncing the user out of the site.
 */
export function BackButton({ className = '', fallback = '/' }: { className?: string; fallback?: string }) {
  const navigate = useNavigate();
  const { pathname, key } = useLocation();

  // Navigation depth: "/" → 0, "/profile" → 1, "/tools/budget" → 2.
  const depth = pathname.split('/').filter(Boolean).length;
  if (depth <= 1) return null;

  const goBack = () => {
    const cameFromInApp = key !== 'default' && typeof window !== 'undefined' && window.history.length > 1;
    if (cameFromInApp) navigate(-1);
    else navigate(fallback);
  };

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="Go back to the previous page"
      className={`fx-backbtn ${className}`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
      </svg>
      <span>Back</span>
    </button>
  );
}
