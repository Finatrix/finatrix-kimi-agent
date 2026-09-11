import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { loadMarket, marketFor, saveMarket, MARKET_KEY, type MarketId, type MarketPack } from './lib/markets';
import { onLocalWrite } from './lib/storage';

/**
 * The active market — whose instruments, tax rules and peer benchmarks the
 * tools should be using.
 *
 * Mounted alongside `CurrencyProvider` and deliberately independent of it. The
 * two settings seed each other and are then owned separately by the user; see
 * the note in `lib/markets/index.ts` for why a market change does not quietly
 * rewrite a currency choice.
 *
 * Reacts to external writes exactly as the currency does, so a cloud-sync pull
 * or a change made in another tab lands here without a reload.
 */

interface MarketCtx {
  id: MarketId;
  market: MarketPack;
  setMarket: (id: MarketId) => void;
  /** True when the market was guessed from the browser rather than chosen. */
  detected: boolean;
}

const Ctx = createContext<MarketCtx | undefined>(undefined);

export function MarketProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<MarketId>(loadMarket);
  // Whether the value on screen came from a guess. Read once: it can only stop
  // being true, and it stops when `setMarket` runs.
  const [detected, setDetected] = useState<boolean>(() => {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem(MARKET_KEY) === null;
    } catch {
      return true;
    }
  });

  const setMarket = useCallback((next: MarketId) => {
    setId(next);
    setDetected(false);
    saveMarket(next);
  }, []);

  useEffect(() => {
    const sync = () => {
      const next = loadMarket();
      setId((prev) => (prev === next ? prev : next));
    };
    const off = onLocalWrite((key) => {
      if (key === MARKET_KEY) sync();
    });
    const onStorage = (e: StorageEvent) => {
      if (e.key === MARKET_KEY) sync();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      off();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const value = useMemo<MarketCtx>(
    () => ({ id, market: marketFor(id), setMarket, detected }),
    [id, setMarket, detected],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMarket(): MarketCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useMarket must be used within MarketProvider');
  return c;
}

/**
 * The active market, or `undefined` outside a provider — for components shared
 * with surfaces that have no market (the Careers workspace, the shell's ⌘K).
 * Mirrors `useOptionalCurrency`.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useOptionalMarket(): MarketCtx | undefined {
  return useContext(Ctx);
}
