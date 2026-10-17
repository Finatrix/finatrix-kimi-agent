/**
 * The walkthrough's public surface for the rest of the app, kept free of
 * imports so that calling it from Settings costs nothing.
 *
 *   import { replayWalkthrough } from '../../walkthrough/replay';
 *   <button onClick={replayWalkthrough}>Replay intro</button>
 *
 * The intro itself is mounted once by the tools shell (`WalkthroughGate`),
 * which listens for this event. Replaying ignores every first-run rule: the
 * person asked for it.
 */

/** Window event the mounted gate listens for. */
export const WALKTHROUGH_REPLAY_EVENT = 'fx:walkthrough-replay';

/** Open the intro again, from anywhere inside the tools shell. */
export function replayWalkthrough(): void {
  try {
    window.dispatchEvent(new CustomEvent(WALKTHROUGH_REPLAY_EVENT));
  } catch {
    /* no window (SSR / worker) — nothing to replay into */
  }
}
