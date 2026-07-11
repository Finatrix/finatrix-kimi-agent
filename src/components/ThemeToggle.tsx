import { useTheme } from '../context/ThemeContext';

/**
 * ThemeToggle — a compact, accessible light/dark switch.
 *
 * Shows the *current* theme's icon (moon in dark, sun in light) with a smooth
 * rotate + crossfade morph; the accessible name announces the *action*. Uses
 * role="switch" + aria-checked so assistive tech reports on/off state. Motion
 * is neutralised under prefers-reduced-motion by the global safety net.
 */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const next = isDark ? 'light' : 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      role="switch"
      aria-checked={isDark}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={
        'group relative inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden ' +
        'rounded-full border border-hairline bg-[var(--tile-bg)] text-ink-2 ' +
        'transition-all duration-200 hover:text-accent-text ' +
        'hover:border-[color:var(--btn-ghost-border-hover)] ' +
        'hover:shadow-[0_4px_16px_-6px_rgba(212,175,55,0.5)] ' +
        className
      }
    >
      <span className="sr-only">
        Current theme: {theme}. Activate to switch to {next} theme.
      </span>

      {/* Sun (light) */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={
          'absolute h-[17px] w-[17px] transition-all duration-500 ease-spring ' +
          (isDark ? 'scale-50 -rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100')
        }
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>

      {/* Moon (dark) */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={
          'absolute h-[17px] w-[17px] transition-all duration-500 ease-spring ' +
          (isDark ? 'scale-100 rotate-0 opacity-100' : 'scale-50 rotate-90 opacity-0')
        }
      >
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    </button>
  );
}
