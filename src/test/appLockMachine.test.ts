/**
 * The app lock's rules (src/native/appLock/machine.ts): when the app is
 * covered, when it locks, and when the phone is asked again.
 */
import { describe, expect, it } from 'vitest';
import {
  LOCK_AFTER_MS,
  awayTooLong,
  initialLockState,
  lockReducer,
  type LockEvent,
  type LockState,
} from '../native/appLock/machine';

const T0 = 1_800_000_000_000;

function run(state: LockState, ...events: LockEvent[]): LockState {
  return events.reduce(lockReducer, state);
}

/** On, unlocked and in use. */
function inUse(): LockState {
  return run(initialLockState(true), { type: 'prompt' }, { type: 'unlocked' });
}

describe('app lock rules', () => {
  it('locks after a minute away', () => {
    expect(LOCK_AFTER_MS).toBe(60_000);
  });

  it('starts locked when the setting is on, and asks once', () => {
    expect(initialLockState(true)).toMatchObject({ phase: 'locked', engagement: 1, prompting: false });
  });

  it('starts open when the setting is off, and stays open whatever happens', () => {
    const off = initialLockState(false);
    expect(off.phase).toBe('open');
    const after = run(off, { type: 'hidden', at: T0 }, { type: 'shown', at: T0 + LOCK_AFTER_MS * 10 }, { type: 'prompt' });
    expect(after).toEqual(off);
  });

  it('opens when the phone confirms its owner', () => {
    expect(inUse()).toMatchObject({ phase: 'open', prompting: false, hiddenAt: null });
  });

  it('covers the app the moment it leaves the foreground', () => {
    expect(run(inUse(), { type: 'hidden', at: T0 })).toMatchObject({ phase: 'veiled', hiddenAt: T0 });
  });

  it('lifts the cover without a prompt when the app comes back within a minute', () => {
    const before = inUse();
    const back = run(before, { type: 'hidden', at: T0 }, { type: 'shown', at: T0 + LOCK_AFTER_MS - 1 });
    expect(back).toEqual(before);
  });

  it('locks, and asks again, when the app comes back after a minute', () => {
    const before = inUse();
    const back = run(before, { type: 'hidden', at: T0 }, { type: 'shown', at: T0 + LOCK_AFTER_MS });
    expect(back).toMatchObject({ phase: 'locked', hiddenAt: null, engagement: before.engagement + 1 });
  });

  it('counts the absence from the first sign of leaving', () => {
    const back = run(
      inUse(),
      { type: 'hidden', at: T0 },
      { type: 'hidden', at: T0 + 50_000 },
      { type: 'shown', at: T0 + LOCK_AFTER_MS },
    );
    expect(back.phase).toBe('locked');
  });

  it('locks when the clock went backwards or the time is unusable', () => {
    expect(awayTooLong(T0, T0 - 1)).toBe(true);
    expect(awayTooLong(T0, Number.NaN)).toBe(true);
    expect(awayTooLong(T0, T0)).toBe(false);
    expect(run(inUse(), { type: 'hidden', at: T0 }, { type: 'shown', at: T0 - 5_000 }).phase).toBe('locked');
  });

  it('does not take the unlock prompt for the user leaving', () => {
    // iOS makes the app inactive while the Face ID sheet is up, then active again.
    const prompting = run(initialLockState(true), { type: 'prompt' });
    const after = run(
      prompting,
      { type: 'hidden', at: T0 },
      { type: 'refused', reason: 'cancelled' },
      { type: 'shown', at: T0 + LOCK_AFTER_MS * 5 },
    );
    expect(after).toMatchObject({ phase: 'locked', prompting: false, engagement: prompting.engagement });
  });

  it('asks again when someone comes back to a locked app', () => {
    const waiting = run(initialLockState(true), { type: 'prompt' }, { type: 'refused', reason: 'cancelled' });
    const back = run(waiting, { type: 'hidden', at: T0 }, { type: 'shown', at: T0 + 2_000 });
    expect(back).toMatchObject({ phase: 'locked', engagement: waiting.engagement + 1 });
  });

  it('says when the phone refused, not when the user cancelled', () => {
    const prompting = run(initialLockState(true), { type: 'prompt' });
    expect(run(prompting, { type: 'refused', reason: 'cancelled' }).failed).toBe(false);
    const failed = run(prompting, { type: 'refused', reason: 'failed' });
    expect(failed).toMatchObject({ phase: 'locked', failed: true, prompting: false });
    expect(run(failed, { type: 'prompt' }).failed).toBe(false);
  });

  it('ignores an unlock, a refusal or a prompt that arrives while it is not locked', () => {
    const open = inUse();
    expect(run(open, { type: 'unlocked' }, { type: 'refused', reason: 'failed' }, { type: 'prompt' })).toEqual(open);
  });

  it('opens for good when the setting is switched off or cleared', () => {
    const off = run(initialLockState(true), { type: 'prompt' }, { type: 'disabled' });
    expect(off).toEqual(initialLockState(false));
  });

  it('starts open when the setting is switched on, then locks like any other time', () => {
    const on = run(initialLockState(false), { type: 'enabled' });
    expect(on).toMatchObject({ enabled: true, phase: 'open' });
    expect(run(on, { type: 'enabled' })).toBe(on);
    expect(run(on, { type: 'hidden', at: T0 }, { type: 'shown', at: T0 + LOCK_AFTER_MS }).phase).toBe('locked');
  });
});
