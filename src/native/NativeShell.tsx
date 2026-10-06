import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { isNativeApp } from './platform';

/**
 * Starts the Android app's native bridge (./bridge.ts) from inside the router,
 * so BACK and deep links can navigate client-side. Renders nothing, and in a
 * browser does nothing at all — the bridge chunk is never even requested.
 */
export default function NativeShell() {
  const navigate = useNavigate();
  // The bridge is installed once for the life of the app; it reads the latest
  // `navigate` through this ref rather than being torn down on every render.
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    if (!isNativeApp()) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    void import('./bridge').then(({ startNativeBridge }) => {
      if (cancelled) return;
      dispose = startNativeBridge({ navigate: (to, opts) => navigateRef.current(to, opts) });
    });
    // A tapped reminder opens the screen it is about. Its own chunk: the
    // notifications plugin is not needed to start the app.
    let stopReminderTaps: (() => void) | undefined;
    void import('./reminders').then(({ listenForReminderTaps }) => {
      if (cancelled) return;
      stopReminderTaps = listenForReminderTaps((to) => navigateRef.current(to));
    }).catch(() => {});
    return () => {
      cancelled = true;
      dispose?.();
      stopReminderTaps?.();
    };
  }, []);

  return null;
}
