import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * The Expense Tracker's floating "+": adding a spend is always one tap away.
 *
 * WHY FLOATING
 * ------------
 * The "Add an expense" card sits partway down the Overview tab, and the other
 * three tabs have no add control at all. Someone reading their transaction
 * list or their analytics who remembers a spend had to scroll back up, or
 * switch tabs, to log it — on a phone, a long way. The button stays in the
 * corner of the screen instead.
 *
 * NO LOGIC OF ITS OWN
 * -------------------
 * It calls the page's own `openAdd`, which opens the same `TransactionModal`
 * the in-page button and the list's Add button open: one form, one save path,
 * one set of validation rules. This component only decides where the control
 * sits and when it stands down.
 *
 * PLACEMENT
 * ---------
 * Stacked directly above the FinatriX AI launcher in the bottom-right corner,
 * clear of the Wallet dock on the left and of the undo toast in the centre.
 * Both docks sit at `--z-fab`, below `--z-modal`, so an open dialog always
 * covers them, and the dialog's `inert` takes them out of reach. It stands
 * down with the other docks while the navigation drawer or the on-screen
 * keyboard is open (tools.css, index.css). The body class set here lets the
 * page reserve room at its foot, so the last row of content can always be
 * scrolled clear of the stack rather than sitting under it.
 *
 * PORTALED
 * --------
 * A `position: fixed` element inside a transform-animated ancestor is fixed to
 * that ancestor, not the viewport — the Wallet dock was once pinned 5,000px
 * down a phone page that way. So it renders into `document.body`, re-applying
 * `fx-tools fx-scope` for the colour tokens.
 */
export function AddExpenseFab({ onAdd }: { onAdd: () => void }) {
  useEffect(() => {
    document.body.classList.add('fx-has-add-fab');
    return () => document.body.classList.remove('fx-has-add-fab');
  }, []);

  return createPortal(
    <div className="fx-tools fx-scope fx-add-dock">
      <button
        type="button"
        className="fx-add-fab"
        // Safari and WKWebView do not focus a button that is clicked or
        // tapped, so the sheet would record <body> as its opener and drop
        // focus there on close. Focusing first gives VoiceOver users their
        // place back. Pointer-initiated, so no focus ring is drawn.
        onClick={(e) => { e.currentTarget.focus(); onAdd(); }}
        aria-label="Add expense"
        aria-haspopup="dialog"
        title="Add expense"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>,
    document.body,
  );
}
