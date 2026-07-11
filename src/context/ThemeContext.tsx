import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

/**
 * ThemeContext — the single source of truth for light vs dark at runtime.
 *
 * The no-flash boot script in index.html sets html[data-theme] before first
 * paint (from localStorage, else the OS preference). This provider reconciles
 * React state with that attribute, persists explicit choices, keeps the
 * <meta name="theme-color"> in sync, and follows OS changes *only* while the
 * user hasn't made an explicit choice. Gold stays the accent in both themes;
 * only surfaces, ink, hairlines and ambient lighting flip (see tokens.css).
 */
export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'fx_theme';
const THEME_COLOR: Record<Theme, string> = { dark: '#060607', light: '#F4F2EC' };

interface ThemeContextValue {
  theme: Theme;
  /** Set an explicit theme (persisted). */
  setTheme: (theme: Theme) => void;
  /** Flip between light and dark (persisted). */
  toggleTheme: () => void;
}

// A safe, inert default so components that read the theme never crash when
// rendered outside a provider (e.g. isolated unit tests, or any subtree mounted
// before the provider). The real ThemeProvider supplies live values in the app.
const FALLBACK: ThemeContextValue = {
  theme: 'dark',
  setTheme: () => {},
  toggleTheme: () => {},
};

const ThemeContext = createContext<ThemeContextValue>(FALLBACK);

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function getInitialTheme(): Theme {
  // Trust the attribute the boot script already resolved (prevents any flash
  // or state/DOM mismatch on hydration).
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
  }
  const stored = readStored();
  if (stored) return stored;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

/** Apply a theme to <html> + the theme-color meta. `animate` triggers the
 *  brief global crossfade defined in index.css (removed after it runs). */
function applyTheme(theme: Theme, animate: boolean) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (animate && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('theme-anim');
    window.setTimeout(() => root.classList.remove('theme-anim'), 360);
  }
  root.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[theme]);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next, true);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode / storage disabled — theme still applies for the session */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(themeRef.current === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  // Follow OS scheme changes, but only while no explicit choice is stored.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => {
      if (readStored()) return; // user chose explicitly — don't override
      const next: Theme = e.matches ? 'light' : 'dark';
      setThemeState(next);
      applyTheme(next, true);
    };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
