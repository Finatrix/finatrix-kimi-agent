import { useEffect } from 'react';
import { nativePlatform } from '../../native/platform';
import { onLocalWrite } from './storage';
import { affectsWatch, currentWatchContext } from './watchData';
import { ingestWatchExpenses } from './watchInbox';

/**
 * Keeps the Apple Watch app in step with the records, and takes in expenses
 * added on the watch. Mounted once by the tools shell next to `useWidgetSync`;
 * does nothing outside the iPhone app. Debounced like the widget: an import
 * writes hundreds of entries in a burst.
 *
 * Taking in is idempotent (watchInbox.ts), so running it on every foreground,
 * on every "new from the watch" event and on mount cannot add an entry twice.
 */
export function useWatchSync(): void {
  useEffect(() => {
    if (nativePlatform() !== 'ios') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    let busy = false;

    const take = async () => {
      if (busy) return;
      busy = true;
      try {
        const { drainWatchInbox, ackWatchExpenses } = await import('../../native/watch');
        const raw = await drainWatchInbox();
        if (cancelled || raw.length === 0) return;
        const result = ingestWatchExpenses(raw);
        await ackWatchExpenses(result.ack);
      } catch {
        /* Left in the native inbox; tried again next time. */
      } finally {
        busy = false;
      }
    };

    const publish = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void import('../../native/watch')
          .then(({ publishWatch }) => { if (!cancelled) return publishWatch(currentWatchContext()); })
          .catch(() => {});
      }, 800);
    };

    void take();
    publish();
    const off = onLocalWrite((key) => { if (affectsWatch(key)) publish(); });
    const onVisible = () => { if (document.visibilityState === 'visible') { void take(); publish(); } };
    document.addEventListener('visibilitychange', onVisible);
    let offInbox = () => {};
    void import('../../native/watch').then(({ onWatchExpenses }) => {
      if (!cancelled) offInbox = onWatchExpenses(() => { void take(); });
    }).catch(() => {});
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      off();
      offInbox();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
