import { createContext, useContext, type ReactNode } from 'react';

const MonthContext = createContext<string | null>(null);

/** Carries the page's selected month to every nested assistant trigger. */
export function AiMonthScope({ month, children }: { month: string; children: ReactNode }) {
  return <MonthContext.Provider value={month}>{children}</MonthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAiMonth(): string | null {
  return useContext(MonthContext);
}
