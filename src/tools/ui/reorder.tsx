/**
 * Reordering primitives shared by Budget Builder's category and income lists.
 *
 * Drag-and-drop is the fast path, but it is only ever the *second* way to
 * reorder: pointer dragging is unusable with a keyboard, a screen reader or a
 * tremor, so every draggable row also carries real Move up / Move down buttons.
 * Both paths call the same `onMove`, so ordering behaves identically however it
 * was performed, and each move is announced through a live region.
 */

/**
 * Keyboard-operable move controls. `name` is the item being moved so the
 * buttons read as "Move Groceries up" rather than a row of anonymous arrows.
 */
export function MoveButtons({
  index, count, name, onMove,
}: {
  index: number;
  count: number;
  name: string;
  onMove: (from: number, to: number) => void;
}) {
  return (
    <span className="fx-move">
      <button
        type="button"
        className="fx-move-btn"
        aria-label={`Move ${name} up`}
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
      </button>
      <button
        type="button"
        className="fx-move-btn"
        aria-label={`Move ${name} down`}
        disabled={index >= count - 1}
        onClick={() => onMove(index, index + 1)}
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
    </span>
  );
}

/** The grab affordance. Purely decorative — the buttons above do the real work. */
export function DragHandle({ label }: { label: string }) {
  return (
    <span className="fx-grip" title={label} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" focusable="false">
        <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
        <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
        <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
      </svg>
    </span>
  );
}
