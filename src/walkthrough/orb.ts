import { useMemo, useState, type RefObject } from 'react';
import { ART_H, ART_W, type OrbControl, type OrbCue } from './geometry';

/**
 * The gold orb's motion, shared by the first-run intro and the product tour's
 * chapter intros so both films move the same object the same way.
 *
 * `track` is a box the size of the art frame, translated by percentages of
 * itself (= percentages of the frame); `dot` is the disc centred on its
 * origin. Transform-only, so the orb travels on the compositor. The disc's
 * current scale is kept in a ref, so a re-render never resets it mid-flight.
 * The refs are only read inside the returned callbacks, never during render.
 */
export function useOrbControl(
  track: RefObject<HTMLDivElement | null>,
  dot: RefObject<HTMLDivElement | null>,
  reduced: boolean,
): OrbControl {
  // A plain holder rather than a ref: it is only ever read inside the
  // returned callbacks, and it must survive re-renders.
  // Starts at 0.6 and transparent, not at scale(0): nothing in the interface
  // grows out of a point (it reads as appearing from nowhere).
  const [scale] = useState(() => ({ current: 0.6 }));
  return useMemo(() => createControl(track, dot, scale, reduced), [track, dot, scale, reduced]);
}

function createControl(
  track: RefObject<HTMLDivElement | null>,
  dot: RefObject<HTMLDivElement | null>,
  scale: { current: number },
  reduced: boolean,
): OrbControl {
  const place = (x: number, y: number, riding: boolean) => {
    const el = track.current;
    if (!el) return;
    el.classList.toggle('is-riding', riding);
    el.style.transform = `translate3d(${(x / ART_W) * 100}%, ${(y / ART_H) * 100}%, 0)`;
  };
  return {
    move: (cue: OrbCue) => {
      place(cue.x, cue.y, false);
      const disc = dot.current;
      const from = scale.current;
      const to = cue.s;
      if (!disc || from === to) return;
      scale.current = to;
      disc.style.transform = `scale(${to})`;
      disc.style.opacity = '1';
      if (reduced || typeof disc.animate !== 'function') return;
      // A little squash and stretch mid-flight, then it settles on its size —
      // no overshoot on landing, because each move answers a tap on Next.
      const mid = (from + to) / 2;
      disc.animate(
        [
          { transform: `scale(${from})` },
          { transform: `scale(${mid * 1.06}, ${mid * 0.95})`, offset: 0.45 },
          { transform: `scale(${to})` },
        ],
        { duration: 300, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
      );
    },
    ride: (x: number, y: number, s: number) => {
      place(x, y, true);
      const disc = dot.current;
      if (!disc) return;
      scale.current = s;
      disc.style.transform = `scale(${s})`;
      disc.style.opacity = '1';
    },
  };
}
