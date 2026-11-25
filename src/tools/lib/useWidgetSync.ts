import { useEffect } from 'react';
import { isNativeApp } from '../../native/platform';
import { onLocalWrite } from './storage';
import { affectsWidget, currentWidgetPayload } from './widgetData';

/**
 * Keeps the home-screen and lock-screen widgets in step with the records.
 * Mounted once by the tools shell, next to `useReminderSync`, and only does
 * anything inside the installed apps. Debounced: an import writes hundreds of
 * entries in a burst. Re-published on return to the foreground so a new day's
 * list of figures is written as soon as the app is seen.
 */
export function useWidgetSync(): void {
  useEffect(() => {
    if (!isNativeApp()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const run = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void import('../../native/widget')
          .then(({ publishWidget }) => { if (!cancelled) return publishWidget(currentWidgetPayload()); })
          .catch(() => {});
      }, 800);
    };
    run();
    const off = onLocalWrite((key) => { if (affectsWidget(key)) run(); });
    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      off();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
