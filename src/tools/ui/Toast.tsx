import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/**
 * On-brand toast — a React port of the original `fxNotify`. Same visual style
 * (see .fx-toast in tools.css) and timing (auto-dismiss ~3.2s).
 */

export type ToastKind = 'info' | 'error' | 'ok';
interface ToastItem { id: number; msg: string; kind: ToastKind; leaving: boolean; }

interface ToastCtx {
  notify: (msg: string, kind?: ToastKind) => void;
}

const Ctx = createContext<ToastCtx | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const notify = useCallback((msg: string, kind: ToastKind = 'info') => {
    const id = ++seq.current;
    setToasts((prev) => [...prev, { id, msg, kind, leaving: false }]);
    timers.current.push(
      setTimeout(() => {
        setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
        timers.current.push(
          setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 320)
        );
      }, 3200)
    );
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return (
    <Ctx.Provider value={{ notify }}>
      {children}
      <div className="fx-toast-wrap" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`fx-toast ${t.kind === 'error' ? 'err' : t.kind === 'ok' ? 'ok' : ''} ${
              t.leaving ? '' : 'show'
            }`}
          >
            <span className="ti" aria-hidden="true">
              {t.kind === 'error' ? '!' : t.kind === 'ok' ? '✓' : 'i'}
            </span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast must be used within ToastProvider');
  return c;
}
