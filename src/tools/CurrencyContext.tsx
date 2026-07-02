import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  CURRENCIES,
  cfmt as cfmtBase,
  cfmtSh as cfmtShBase,
  fmt as fmtBase,
  currencySym,
} from './lib/format';
import { store, onLocalWrite } from './lib/storage';

/**
 * Active display currency for the tools. Persists to `fx_currency` (a SYNC_KEY,
 * so it follows the user across devices exactly as before) and reacts to
 * external writes (cloud-sync pull, other tabs).
 *
 * Note: only Budget, Expense and LifeMap are currency-aware in the original —
 * the other four tools always render ₹ via `fmt`. That is preserved: those tools
 * import `fmt` directly, only these three consume `cfmt`/`cfmtSh` from here.
 */

function readCode(): string {
  const c = store.get('fx_currency', 'INR') || 'INR';
  return CURRENCIES[c] ? c : 'INR';
}

interface CurrencyCtx {
  code: string;
  sym: string;
  setCode: (code: string) => void;
  fmt: (n: number) => string;
  cfmt: (n: number) => string;
  cfmtSh: (n: number) => string;
}

const Ctx = createContext<CurrencyCtx | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [code, setCodeState] = useState<string>(readCode);

  const setCode = useCallback((next: string) => {
    if (!CURRENCIES[next]) return;
    setCodeState(next);
    store.set('fx_currency', next);
  }, []);

  useEffect(() => {
    const sync = () => {
      const c = readCode();
      setCodeState((prev) => (prev === c ? prev : c));
    };
    const off = onLocalWrite((key) => {
      if (key === 'fx_currency') sync();
    });
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'fx_currency') sync();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      off();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const value: CurrencyCtx = {
    code,
    sym: currencySym(code),
    setCode,
    fmt: fmtBase,
    cfmt: (n) => cfmtBase(n, code),
    cfmtSh: (n) => cfmtShBase(n, code),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCurrency(): CurrencyCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCurrency must be used within CurrencyProvider');
  return c;
}
