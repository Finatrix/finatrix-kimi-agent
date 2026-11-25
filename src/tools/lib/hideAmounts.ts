/**
 * Hide amounts: one switch that turns every amount the money tools print into
 * "₹ ••••", for a public place or a shared screen.
 *
 * The switch lives here and is read by `cfmt` / `cfmtSh` (lib/format.ts), so
 * every screen that formats through them follows it with no code of its own.
 * `CurrencyProvider` subscribes, so the whole workspace re-renders when it
 * flips. Screens that print amounts their own way call `amountsHidden()` or
 * `useAmountsHidden()` themselves.
 *
 * Device-only on purpose (not in `SYNC_KEYS`): hiding numbers on a phone in a
 * café should not hide them on the laptop at home. It is a display choice,
 * never applied to stored data, and a field someone is typing into stays
 * readable (ui/MoneyField.tsx).
 */
import { useSyncExternalStore } from 'react';
import { onLocalWrite, store } from './storage';

export const HIDE_AMOUNTS_KEY = 'fx_hide_amounts';

/** What a hidden amount shows in place of its digits. */
export const AMOUNT_MASK = '••••';

let cached: boolean | null = null;

function read(): boolean {
  return store.get(HIDE_AMOUNTS_KEY, '') === '1';
}

/** True while amounts are hidden on this device. Cheap: read once, then cached. */
export function amountsHidden(): boolean {
  if (cached === null) cached = read();
  return cached;
}

export function setAmountsHidden(on: boolean): void {
  cached = on;
  store.set(HIDE_AMOUNTS_KEY, on ? '1' : '0');
  emit();
}

const listeners = new Set<() => void>();
let wired = false;

function emit() {
  for (const l of listeners) l();
}

/**
 * Subscribe to the switch. Picks up a change made in another tab (`storage`)
 * and a write through the store from anywhere in this one.
 */
export function subscribeAmountsHidden(listener: () => void): () => void {
  if (!wired && typeof window !== 'undefined') {
    wired = true;
    const refresh = () => {
      const next = read();
      if (next !== cached) { cached = next; emit(); }
    };
    window.addEventListener('storage', (e) => { if (e.key === HIDE_AMOUNTS_KEY || e.key === null) refresh(); });
    onLocalWrite((key) => { if (key === HIDE_AMOUNTS_KEY) refresh(); });
  }
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The switch as React state, for components that print amounts without `cfmt`. */
export function useAmountsHidden(): boolean {
  return useSyncExternalStore(subscribeAmountsHidden, amountsHidden, () => false);
}

/** Test seam: forget the cached value so the next read comes from storage. */
export function resetAmountsHiddenCache(): void {
  cached = null;
}
