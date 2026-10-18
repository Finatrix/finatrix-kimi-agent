import type { ReactElement } from 'react';
import type { Haptic } from '../lib/haptics';
import type { IconName } from '../tools/ui/Icon';
import type { OrbControl, OrbCue } from '../walkthrough/geometry';
import type { SceneClock } from '../walkthrough/motion';

/**
 * The product tour's authoring contract. A chapter is pure data plus one
 * illustration component; the engine (TourRoot, Spotlight, IntroScene) does
 * everything else. See AUTHORING.md before adding one.
 */

/** Props every chapter's intro illustration receives — the walkthrough's ArtProps, minus its fixed example set. */
export interface IntroArtProps {
  /** The scene timeline. Register count-ups and cues on it; never use timers. */
  clock: SceneClock;
  /** The persistent gold orb. Coordinates are art units (360×270). */
  orb: OrbControl;
  /** Currency-aware formatter for ILLUSTRATIVE literals (never computed figures). */
  fmt: (n: number) => string;
  /** Display currency code, to pick the rupee or the generic example set. */
  code: string;
  /** Native-only tick; a no-op on the web and under reduced motion. */
  haptic: (kind: Haptic) => void;
}

/** What an illustrative "good output" card inside a coach card receives. */
export interface OutputProps {
  fmt: (n: number) => string;
  code: string;
}

export interface IntroScene {
  /** Small caps line above the headline, e.g. "Plan the month". */
  eyebrow: string;
  /** The headline. Short; each word rises in on its own (masked reveal). */
  headline: string;
  /** One or two plain sentences: what the tool is for and why it helps. */
  body: string;
  /** The illustration: a 360×270 SVG showing what a good output looks like. */
  Art: (props: IntroArtProps) => ReactElement;
  /** Where the gold orb sits (and moves to) while the scene plays. */
  orb: OrbCue[];
  /** Roughly how long the choreography runs, ms (drives the progress fill). */
  duration: number;
}

/**
 * Conditions a step needs to make sense. A step whose needs are not met is
 * left out of the chapter entirely (it is not counted in "n of N").
 */
export type TourNeed =
  | 'web' | 'native'
  | 'signedIn' | 'signedOut'
  /** The user has saved something (any tool). */
  | 'data' | 'noData'
  /** Viewport at least 768px wide / narrower than that. */
  | 'wide' | 'narrow';

export interface TourEnv {
  native: boolean;
  signedIn: boolean;
  hasData: boolean;
  wide: boolean;
}

/** Helpers a step's `before` / `after` hook can use. All are safe to call when nothing matches. */
export interface TourHookContext {
  env: TourEnv;
  /** First visible element matching a selector. */
  query: (selector: string) => HTMLElement | null;
  /** Click the first visible match. Returns whether anything was clicked. */
  click: (selector: string) => boolean;
  /**
   * Open a collapsed thing: a `<details>` (sets `open`) or a toggle button
   * whose `aria-expanded` is "false" (clicks it). No-op if already open.
   */
  expand: (selector: string) => boolean;
  /**
   * Open whatever is hiding an element: every closed `<details>` around it,
   * and every `hidden` region around it whose toggle (`aria-controls`) says
   * `aria-expanded="false"`. Use this when a step's target sits inside a
   * collapsed section. Returns whether anything was opened.
   */
  reveal: (selector: string) => boolean;
  /** Resolves with the element once it is on screen, or null after `ms`. */
  waitFor: (selector: string, ms?: number) => Promise<HTMLElement | null>;
}

export type Placement = 'auto' | 'top' | 'bottom' | 'left' | 'right';

export interface TourStep {
  /** Stable id, unique in the chapter. Progress is stored by it — never rename a shipped id. */
  id: string;
  /**
   * `[data-tour="<chapter>-<thing>"]` on the REAL element. Omit only for a
   * step that deliberately has nothing to point at (a centred card).
   * When the selector matches nothing visible, the step is skipped silently.
   */
  target?: string;
  /** 2–6 words. */
  title: string;
  /** 1–2 short sentences: what it does and why it helps. */
  body: string;
  /** "Try it" line: one concrete thing to do. Adds a Try it button that makes the target usable. */
  hint?: string;
  /** Where the floating card prefers to sit on wide screens. Default 'auto'. */
  placement?: Placement;
  /** Runs before the step is shown (open a tab, expand a section). May be async. */
  before?: (ctx: TourHookContext) => void | Promise<void>;
  /** Runs when leaving the step, in either direction. */
  after?: (ctx: TourHookContext) => void | Promise<void>;
  /** A small illustrative "good output" card shown inside the coach card. */
  output?: (props: OutputProps) => ReactElement;
  /** Conditions for the step to appear at all. All must hold. */
  needs?: TourNeed[];
  /** The route the step lives on, when it is not the chapter's own. */
  route?: string;
}

export interface TourChapter {
  /** Stable id (also the route id for tool chapters). Never rename once shipped. */
  id: string;
  /** The tool or area's name, as the app names it. */
  title: string;
  /** Where the chapter runs: a route inside the tools shell. */
  route: string;
  /** One short line for the hub card. */
  tagline: string;
  /** Honest estimate, whole minutes. */
  minutes: number;
  /** Hub card icon (tools icon sprite). */
  icon: IconName;
  intro: IntroScene;
  /** In order. The last should be the "what good looks like" step. */
  steps: TourStep[];
}
