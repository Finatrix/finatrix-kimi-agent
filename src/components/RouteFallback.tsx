/**
 * Branded route-loading state shown while a lazy route chunk downloads.
 *
 * Replaces the previous blank dark screen: a centered FinatriX mark with a slim
 * indeterminate top bar, matching the dark/gold identity so code-splitting no
 * longer costs a jarring blank flash on direct navigations.
 *
 * Accessibility:
 *  - `role="status"` + `aria-busy` announce the loading state.
 *  - An `sr-only` message gives screen-reader users a spoken label.
 *  - All motion is disabled under `prefers-reduced-motion: reduce`.
 */
export default function RouteFallback() {
  return (
    <div
      className="min-h-screen bg-surface-base flex flex-col items-center justify-center gap-6"
      role="status"
      aria-busy="true"
    >
      <style>{`
        @keyframes fxBar {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        @keyframes fxPulse {
          0%, 100% { opacity: 0.55; transform: scale(0.96); }
          50%      { opacity: 1;    transform: scale(1);    }
        }
        .fx-fallback-bar  { animation: fxBar 1.1s var(--fx-ease, cubic-bezier(0.4,0,0.2,1)) infinite; }
        .fx-fallback-mark { animation: fxPulse 1.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .fx-fallback-bar  { animation: none; transform: translateX(0); width: 100%; }
          .fx-fallback-mark { animation: none; opacity: 1; transform: none; }
        }
      `}</style>

      {/* Slim indeterminate progress bar, pinned to the top edge */}
      <div className="fixed inset-x-0 top-0 h-[2px] overflow-hidden bg-hairline-2">
        <div className="fx-fallback-bar h-full w-1/4 rounded-full bg-[#D4AF37]" />
      </div>

      {/* FinatriX mark */}
      <svg
        className="fx-fallback-mark"
        width="46"
        height="46"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <rect x="6" y="6" width="12" height="12" rx="3" fill="#D4AF37" />
        <circle cx="12" cy="12" r="2.4" fill="var(--surface-base)" />
      </svg>

      <span className="sr-only">Loading FinatriX…</span>
    </div>
  );
}
