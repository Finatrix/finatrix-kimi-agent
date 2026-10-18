import { useLocation } from 'react-router';
import { tourThisPage } from './launch';

/**
 * "Tour this page" — the one entry point every tools page shares.
 *
 * Rendered by the tools shell (ToolsLayout), not by each page, so a new
 * chapter needs no page edit to be reachable, and it is reachable in the
 * apps too (where the website's homepage does not exist). It knows nothing
 * about chapters — that would pull the registry into the shell's chunk —
 * and simply asks for the tour of the current path; the tour opens that
 * chapter, or the tutorial hub when a page has none yet.
 */
export function TourPageButton() {
  const { pathname } = useLocation();
  return (
    <button
      type="button"
      className="fx-tourbtn"
      data-tour="shell-tour"
      onClick={() => tourThisPage(pathname)}
      aria-haspopup="dialog"
    >
      <span className="fx-tourbtn-pill">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="9" />
          <path d="M10.2 8.6l5 3.4-5 3.4z" fill="currentColor" stroke="none" />
        </svg>
        <span>Tour this page</span>
      </span>
    </button>
  );
}
