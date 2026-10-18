import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { currentClientHints, passesFirstRunPrecheck, safeRead, shouldAutoShowWalkthrough } from './gating';
import { WALKTHROUGH_REPLAY_EVENT } from './replay';
import { tourRequestFromState } from '../tour/launch';
import type { WalkthroughMode } from './Walkthrough';

/**
 * Mounted once by the tools shell, after its data has loaded. Decides whether
 * this is a brand-new user at the front door and, only then, fetches the
 * intro. Everyone else pays for this component and nothing more: the scenes,
 * their stylesheet and the settings module used for the data check are all
 * separate chunks requested on demand.
 *
 * Also listens for `replayWalkthrough()` (./replay) so Settings can show the
 * intro again.
 */

const Walkthrough = lazy(() => import('./Walkthrough'));

export default function WalkthroughGate() {
  const { pathname, state } = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<WalkthroughMode | null>(null);
  // The path the shell was entered on. Only that first landing counts: moving
  // to the dashboard later in the session is not a first run.
  const [entryPath] = useState(pathname);
  // Arrived asking for the product tour (the landing page's "Full tutorial"):
  // the tour opens instead, and the two are never stacked.
  const [tourRequested] = useState(() => tourRequestFromState(state) != null);

  useEffect(() => {
    const input = {
      pathname: entryPath,
      client: currentClientHints(),
      testRun: import.meta.env.MODE === 'test',
      read: safeRead,
    };
    if (tourRequested || !passesFirstRunPrecheck(input)) return;
    let cancelled = false;
    import('../tools/lib/settings')
      .then(({ hasAnyData }) => {
        // The full rule again, now with the data check — storage may also have
        // changed while the chunk loaded (another tab finished setup).
        if (!cancelled && shouldAutoShowWalkthrough({ ...input, hasData: hasAnyData })) setMode('first-run');
      })
      .catch(() => { /* offline chunk fetch — skip the intro rather than block */ });
    return () => { cancelled = true; };
  }, [entryPath, tourRequested]);

  useEffect(() => {
    const onReplay = () => setMode('replay');
    window.addEventListener(WALKTHROUGH_REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(WALKTHROUGH_REPLAY_EVENT, onReplay);
  }, []);

  const close = useCallback(() => setMode(null), []);
  const setup = useCallback(() => {
    setMode(null);
    navigate('/welcome');
  }, [navigate]);

  if (!mode) return null;
  return (
    <Suspense fallback={null}>
      <Walkthrough mode={mode} onClose={close} onSetup={setup} />
    </Suspense>
  );
}
