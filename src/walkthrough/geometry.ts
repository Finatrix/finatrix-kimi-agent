import type { Haptic } from '../lib/haptics';
import type { SceneClock } from './motion';
import type { WalkthroughExample } from './examples';

/**
 * The intro's shared coordinate space. Every illustration is drawn in one
 * 360×270 box — the same box the persistent gold orb travels across — so a
 * point named here (the donut's centre, the goal's target, the shield) is
 * exactly where the orb lands. That shared space is what lets one shape read
 * as the same object moving from scene to scene.
 */

export const ART_W = 360;
export const ART_H = 270;

/** Where the orb sits, in art units; `s` scales its 40-unit base disc. */
export interface OrbCue { at: number; x: number; y: number; s: number }

export interface OrbControl {
  /** Spring to a point, with a squash-and-stretch on the way. */
  move: (cue: OrbCue) => void;
  /** Follow a point frame by frame (no easing of its own), e.g. a line's tip. */
  ride: (x: number, y: number, s: number) => void;
}

export interface ArtProps {
  clock: SceneClock;
  orb: OrbControl;
  ex: WalkthroughExample;
  fmt: (n: number) => string;
  haptic: (kind: Haptic) => void;
}

export const DONUT = { cx: 112, cy: 132, r: 82 };

export const GOAL = { x0: 28, x1: 316, base: 232, top: 64 };

export const SHIELD = { x: 180, y: 120 };
