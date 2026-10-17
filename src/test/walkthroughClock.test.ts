import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneClock } from '../walkthrough/motion';

/**
 * The intro's scene clock. Drives the parts CSS cannot (count-ups, typing,
 * the orb riding a line) and has to stay in step with the CSS animations.
 */

/** Stand-in for the silent Web Animation the clock uses as its time source. */
class FakeAnimation {
  static last: FakeAnimation | null = null;
  currentTime: number | null = 0;
  playState = 'idle';
  constructor() { FakeAnimation.last = this; }
  play() { this.playState = 'running'; }
  pause() { this.playState = 'paused'; }
  cancel() { this.playState = 'idle'; }
}

describe('SceneClock', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    FakeAnimation.last = null;
  });

  it('catches up to the shared timeline when frames were throttled (stays in step with CSS)', () => {
    vi.stubGlobal('Animation', FakeAnimation);
    vi.stubGlobal('KeyframeEffect', class {});
    // jsdom has no document timeline; the fake animation does not read it.
    const hadTimeline = 'timeline' in document;
    if (!hadTimeline) Object.defineProperty(document, 'timeline', { value: {}, configurable: true });
    const seen: number[] = [];
    const clock = new SceneClock(false);
    clock.tween(1000, 500, (p) => seen.push(p), (t) => t);
    clock.start();
    const master = FakeAnimation.last!;
    expect(master.playState).toBe('running');

    // The page composited CSS for 1.4s while no frame callback ran; the next
    // frame must land where the CSS is, not where the last frame left off.
    master.currentTime = 1400;
    vi.advanceTimersByTime(20);
    expect(seen.at(-1)).toBeCloseTo(0.8);

    clock.pause();
    expect(master.playState).toBe('paused');
    clock.start();
    expect(master.playState).toBe('running');
    clock.dispose();
    expect(master.playState).toBe('idle');
    if (!hadTimeline) delete (document as unknown as { timeline?: unknown }).timeline;
  });

  it('falls back to frame deltas where Web Animations is unavailable', () => {
    vi.stubGlobal('Animation', undefined);
    const fired = vi.fn();
    const clock = new SceneClock(false);
    clock.at(100, fired);
    clock.start();
    vi.advanceTimersByTime(60);
    expect(fired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(fired).toHaveBeenCalledTimes(1);
    clock.dispose();
  });

  it('holds time while paused (a hidden tab resumes where it stopped)', () => {
    vi.stubGlobal('Animation', undefined);
    const fired = vi.fn();
    const clock = new SceneClock(false);
    clock.at(100, fired);
    clock.start();
    vi.advanceTimersByTime(48);
    clock.pause();
    vi.advanceTimersByTime(1000);
    expect(fired).not.toHaveBeenCalled();
    clock.start();
    vi.advanceTimersByTime(200);
    expect(fired).toHaveBeenCalledTimes(1);
    clock.dispose();
  });

  it('reduced motion: lands every task on its end state, in timeline order, not registration order', () => {
    const order: string[] = [];
    const clock = new SceneClock(true);
    // Registered first (an illustration's effect runs before its scene's)…
    clock.tween(1150, 1100, (p) => order.push(`ride@${p}`));
    clock.at(2270, () => order.push('target'));
    // …registered last, but earliest on the timeline.
    clock.at(0, () => order.push('start'));
    expect(order).toEqual([]);
    clock.start();
    expect(order).toEqual(['start', 'ride@1', 'target']);
    // After start, late work lands immediately.
    clock.at(5000, () => order.push('late'));
    expect(order.at(-1)).toBe('late');
  });

  it('runs work registered after the timeline went idle', () => {
    vi.stubGlobal('Animation', undefined);
    const clock = new SceneClock(false);
    const first = vi.fn();
    clock.at(0, first);
    clock.start();
    vi.advanceTimersByTime(50);
    expect(first).toHaveBeenCalled();
    const late = vi.fn();
    clock.at(0, late);
    vi.advanceTimersByTime(50);
    expect(late).toHaveBeenCalledTimes(1);
    clock.dispose();
  });
});
