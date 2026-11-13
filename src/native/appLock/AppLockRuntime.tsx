import { useCallback, useEffect, useReducer, useRef } from 'react';
import { createPortal } from 'react-dom';
import AppLockScreen from './AppLockScreen';
import { startLockController, type LockController } from './controller';
import { initialLockState, lockReducer, type LockState } from './machine';

function startState(startLocked: boolean): LockState {
  // Switched on from Settings while the app is running: the unlock that turned
  // it on is the proof, so it starts open.
  return startLocked ? initialLockState(true) : lockReducer(initialLockState(false), { type: 'enabled' });
}

/**
 * The running lock: state from ./machine.ts, events from ./controller.ts, and
 * the cover on top of everything. Fetched only inside the installed apps, and
 * only once the lock has been switched on (see ../AppLock.tsx).
 *
 * Portalled to `body` so no transformed ancestor can turn "fixed" into
 * "fixed to that ancestor" and leave a strip of the page showing.
 */
export default function AppLockRuntime({ startLocked }: { startLocked: boolean }) {
  const [state, dispatch] = useReducer(lockReducer, startLocked, startState);
  const controller = useRef<LockController | null>(null);

  useEffect(() => {
    const started = startLockController(dispatch);
    controller.current = started;
    return () => {
      controller.current = null;
      started.dispose();
    };
  }, []);

  // Ask the phone once each time the lock engages. After that the Unlock button
  // asks. Declared after the effect above, so the controller exists by the time
  // this first runs.
  const locked = state.phase === 'locked';
  useEffect(() => {
    if (locked) controller.current?.unlock();
  }, [locked, state.engagement]);

  const unlock = useCallback(() => controller.current?.unlock(), []);
  const leave = useCallback(() => controller.current?.leave(), []);

  if (state.phase === 'open') return null;
  return createPortal(
    <AppLockScreen locked={locked} failed={state.failed} onUnlock={unlock} onLeave={leave} />,
    document.body,
  );
}
