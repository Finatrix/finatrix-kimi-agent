import { useSyncExternalStore } from 'react';

/**
 * One floating dock instead of three.
 *
 * The assistant launcher, the Wallet pill and the Expense Tracker's add button
 * were three separately-fixed elements: Wallet bottom-left, the other two
 * stacked bottom-right. Each was placed to avoid the others, and together they
 * covered a 120px column of whatever the page happened to scroll beneath them.
 *
 * The launcher's dock (ui/AiAssistant.tsx) now offers two slots and the other
 * two render into them, so all three share one row, one baseline and one set
 * of offsets. A page that mounts before the dock exists — or runs where the
 * assistant is unavailable and no dock is drawn — gets `null` and falls back
 * to its own fixed position on `document.body`, exactly as before.
 */
export type DockSlot = 'wallet' | 'add';

const slots: Record<DockSlot, HTMLElement | null> = { wallet: null, add: null };
const listeners = new Set<() => void>();

export function registerDockSlot(name: DockSlot, el: HTMLElement | null): void {
  if (slots[name] === el) return;
  slots[name] = el;
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export function useDockSlot(name: DockSlot): HTMLElement | null {
  return useSyncExternalStore(subscribe, () => slots[name], () => null);
}
