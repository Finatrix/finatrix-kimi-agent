import { useEffect } from 'react';
import { onLocalWrite } from './storage';
import { REMINDER_KEY } from './reminders';
import { syncReminders } from './reminderSync';

/** Records whose change can alter the plan. Anything else is not worth a re-plan. */
function affectsPlan(key: string): boolean {
  return key === REMINDER_KEY || key === 'fx_expenses' || key === 'fx_investmatch'
    || key === 'fx_goal' || key.startsWith('fx_bb_');
}

/**
 * Keeps the scheduled reminders in step with the records. Mounted once by the
 * tools shell. Debounced: an import writes hundreds of entries in a burst.
 */
export function useReminderSync(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void syncReminders().catch(() => {}), 1500);
    };
    run();
    const off = onLocalWrite((key) => { if (affectsPlan(key)) run(); });
    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      off();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
