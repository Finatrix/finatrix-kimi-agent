import { lazy, Suspense, useEffect, useState, type CSSProperties } from 'react';
import { onLocalWrite } from '../tools/lib/storage';
import { APP_LOCK_KEY, isAppLockOn } from './appLock/setting';
import { isNativeApp } from './platform';

const AppLockRuntime = lazy(() => import('./appLock/AppLockRuntime'));

/** Covers the app for the moment it takes to fetch the lock's own code. */
const HOLD: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 2147483000,
  background: 'var(--surface-base)',
};

/**
 * The optional app lock (Settings, in the installed apps only): the app's
 * content stays covered until the phone confirms who is holding it.
 *
 * Mounted at the app root, above the routes, so a deep link or a tapped
 * notification still navigates but lands behind the lock.
 *
 * This file is all a browser ever loads of it, and there it renders nothing.
 * In the apps the lock's code is a separate chunk, fetched when the lock is on
 * at launch (`cold`: covered from the very first paint) or the first time it is
 * switched on (`warm`: the unlock that switched it on has just happened, so it
 * starts open). Once mounted it stays, and follows the setting from there.
 */
export default function AppLock() {
  const [start, setStart] = useState<'cold' | 'warm' | null>(() =>
    isNativeApp() && isAppLockOn() ? 'cold' : null,
  );

  useEffect(() => {
    if (start !== null || !isNativeApp()) return;
    return onLocalWrite((key) => {
      if (key === APP_LOCK_KEY && isAppLockOn()) setStart('warm');
    });
  }, [start]);

  if (start === null) return null;
  return (
    <Suspense fallback={start === 'cold' ? <div className="fx-applock-hold" aria-hidden="true" style={HOLD} /> : null}>
      <AppLockRuntime startLocked={start === 'cold'} />
    </Suspense>
  );
}
