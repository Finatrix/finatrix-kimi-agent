/**
 * The visible half of ⌘K.
 *
 * A shortcut nobody can see is a shortcut only its author uses, so the palette
 * gets a real control in the app bar with its own key hint — and the hint is
 * rendered per-platform, because "Ctrl K" on a Mac is simply wrong. Below `lg`
 * it collapses to the icon alone (there is no keyboard to hint at on a phone)
 * and keeps its accessible name.
 *
 * Shared by both shells so the control cannot drift into two versions of
 * itself.
 */
export function CommandPaletteTrigger({ onOpen }: { onOpen: () => void }) {
  const mac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || '');
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Search tools, guides and actions"
      aria-keyshortcuts={mac ? 'Meta+K' : 'Control+K'}
      aria-haspopup="dialog"
      className="flex items-center gap-2 rounded-full border border-hairline px-2.5 sm:px-3 py-1.5 min-h-6 text-ink-3 hover:text-ink hover:border-hairline-2 transition-colors"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
      </svg>
      <span className="hidden lg:inline font-mono text-[10px] uppercase tracking-[0.08em]">Search</span>
      <kbd className="hidden lg:inline font-mono text-[10px] tracking-[0.04em] text-ink-3 border border-hairline-2 rounded px-1 py-px">
        {mac ? '⌘K' : 'Ctrl K'}
      </kbd>
    </button>
  );
}
