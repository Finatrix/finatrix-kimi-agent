import { useEffect, useState } from 'react';

/**
 * The small amount of motion machinery the intro needs, with no dependency.
 *
 * Most of the choreography is CSS (keyframes with staggered delays, which the
 * compositor runs). JavaScript drives only what CSS cannot: numbers that count
 * up and text that types. Both write straight to the DOM through refs, so a
 * scene playing never re-renders React.
 */

function query(q: string): MediaQueryList | null {
  try {
    return typeof matchMedia === 'function' ? matchMedia(q) : null;
  } catch {
    return null;
  }
}

/** Live `prefers-reduced-motion: reduce`. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => query('(prefers-reduced-motion: reduce)')?.matches ?? false);
  useEffect(() => {
    const mq = query('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

/** False while the tab or app is in the background. */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return visible;
}

/* ── Easing ─────────────────────────────────────────────────────────── */

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
/** Matches `--wt-inout` in walkthrough.css, so JS can ride a CSS-drawn line. */
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ── Clock ──────────────────────────────────────────────────────────── */

interface Task {
  at: number;
  dur: number;
  ease: (t: number) => number;
  fn: (p: number) => void;
  done: boolean;
}

/**
 * A silent Web Animation used purely as a clock. Its `currentTime` advances on
 * the same document timeline as the scene's CSS animations, so the JS-driven
 * parts read the time the CSS is actually at — even when the browser keeps
 * compositing CSS while throttling requestAnimationFrame (a backgrounded or
 * half-visible page), the next frame simply catches up instead of drifting.
 * Null where the Web Animations constructor API is missing (jsdom, very old
 * engines); the clock then accumulates frame deltas instead.
 */
function createMasterClock(): Animation | null {
  try {
    if (typeof Animation !== 'function' || typeof KeyframeEffect !== 'function' || !document.timeline) return null;
    const a = new Animation(new KeyframeEffect(null, null, { duration: 3_600_000 }), document.timeline);
    a.play();
    return a;
  } catch {
    return null;
  }
}

/**
 * A pausable scene timeline. `at(ms, fn)` fires once; `tween(ms, dur, fn)`
 * calls `fn(progress)` every frame between. Time only advances while the clock
 * is running, so a backgrounded tab resumes exactly where it stopped, in step
 * with the CSS animations (which are paused by the same signal).
 *
 * With `instant`, every task runs to its end state at `start()`, in timeline
 * order — the reduced motion path, where a number simply reads its final value.
 */
export class SceneClock {
  private tasks: Task[] = [];
  private elapsed = 0;
  private last = 0;
  private raf = 0;
  private master: Animation | null = null;
  /** `start()` has been called (and not since disposed). */
  private started = false;
  /** Held by `pause()` — the tab is hidden. */
  private held = false;
  /** True on the reduced-motion path: tasks run to their end on registration. */
  readonly instant: boolean;

  constructor(instant: boolean) {
    this.instant = instant;
  }

  at(ms: number, fn: () => void): this {
    return this.tween(ms, 0, () => fn());
  }

  tween(ms: number, dur: number, fn: (p: number) => void, ease: (t: number) => number = easeOutCubic): this {
    if (this.instant && this.started) {
      fn(1);
      return this;
    }
    this.tasks.push({ at: ms, dur, ease, fn, done: false });
    if (this.instant) return this;
    // Work registered after the timeline went idle (an illustration
    // re-registering because a prop changed) must still run — a task whose
    // time has already passed simply lands on its end state next frame.
    if (this.started && !this.held) this.kick();
    return this;
  }

  start(): void {
    if (this.instant) {
      // Reduced motion: land every task on its end state, in TIMELINE order —
      // not registration order, which runs an illustration's tasks before the
      // scene's own cues (child effects first) and would leave, say, the orb at
      // the start of the goal line instead of its target.
      this.started = true;
      const due = this.tasks.filter((t) => !t.done).sort((a, b) => a.at + a.dur - (b.at + b.dur));
      for (const t of due) { t.fn(1); t.done = true; }
      return;
    }
    this.started = true;
    this.held = false;
    if (this.master) this.master.play();
    else this.master = createMasterClock();
    this.kick();
  }

  pause(): void {
    this.held = true;
    this.master?.pause();
    this.stopFrames();
  }

  /**
   * Stop and forget every task. Resets rather than retires the clock, because
   * React's development double-mount runs an effect's cleanup and then the
   * effect again on the same instance — a clock that refused to restart after
   * cleanup would leave the scene frozen in dev.
   */
  dispose(): void {
    this.stopFrames();
    this.master?.cancel();
    this.master = null;
    this.tasks = [];
    this.elapsed = 0;
    this.started = false;
  }

  private stopFrames(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.last = 0;
  }

  private kick(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    this.raf = 0;
    if (!this.started || this.held) return;
    const masterTime = this.master ? Number(this.master.currentTime) : NaN;
    if (Number.isFinite(masterTime)) this.elapsed = masterTime;
    else if (this.last) this.elapsed += Math.min(now - this.last, 64); // clamp: a dropped frame is not a jump
    this.last = now;
    let pending = false;
    for (const t of this.tasks) {
      if (t.done) continue;
      if (this.elapsed < t.at) { pending = true; continue; }
      const p = t.dur <= 0 ? 1 : Math.min(1, (this.elapsed - t.at) / t.dur);
      t.fn(t.ease(p));
      if (p >= 1) t.done = true;
      else pending = true;
    }
    if (pending) this.kick();
    // Idle: the next frame's delta must not include the time spent idle.
    else this.last = 0;
  };
}
