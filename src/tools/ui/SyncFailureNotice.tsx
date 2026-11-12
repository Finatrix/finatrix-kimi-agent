import { useEffect, useRef } from 'react';
import type { SyncStatus } from '../cloudSync';
import { useOptionalToast } from './Toast';

/**
 * Says so when saving to the account starts failing.
 *
 * The only sign of a failed save was the words "Sync error" beside the account
 * menu, and that label is hidden below 1024px — so on a phone, which is where
 * most people use the tools, a save that had stopped working looked exactly
 * like one that was working. Someone could go on entering a month of spending
 * on a device that was no longer backing any of it up.
 *
 * One message per failure, not one per attempt: it is raised when the status
 * becomes `error` and not again until a save has succeeded in between. The data
 * itself is untouched either way — every tool writes to this device first.
 */
export function SyncFailureNotice({ sync }: { sync: SyncStatus }) {
  const { notify } = useOptionalToast();
  const told = useRef(false);

  useEffect(() => {
    if (sync === 'saved') told.current = false;
    if (sync !== 'error' || told.current) return;
    told.current = true;
    notify(
      'Saved on this device, but not to your account yet. FinatriX will keep trying; export a backup if this keeps appearing.',
      'error',
    );
  }, [sync, notify]);

  return null;
}
