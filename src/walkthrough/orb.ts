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
  const [scale] = useState(() => ({ current: 0 }));
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
      if (reduced || typeof disc.animate !== 'function') return;
      // Squash and stretch: wider and flatter mid-flight, overshoot on landing.
      const mid = (from + to) / 2;
      disc.animate(
        [
          { transform: `scale(${from})` },
          { transform: `scale(${mid * 1.14}, ${mid * 0.88})`, offset: 0.42 },
          { transform: `scale(${to * 1.06})`, offset: 0.78 },
          { transform: `scale(${to})` },
        ],
        { duration: 860, easing: 'cubic-bezier(.3,.7,.2,1)' },
      );
    },
    ride: (x: number, y: number, s: number) => {
      place(x, y, true);
      const disc = dot.current;
      if (!disc) return;
      scale.current = s;
      disc.style.transform = `scale(${s})`;
    },
  };
}
