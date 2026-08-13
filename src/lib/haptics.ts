/**
 * Haptic feedback for the moments that deserve one.
 *
 * WHY THIS IS A MODULE AND NOT A `navigator.vibrate` CALL
 * ------------------------------------------------------
 * Three rules have to hold everywhere, and each is easy to forget at a call
 * site:
 *
 *  1. It must never throw. `vibrate` is absent on iOS Safari and on desktop,
 *     and it throws outright inside some embedded webviews.
 *  2. It must respect `prefers-reduced-motion`. Vestibular and sensory
 *     sensitivities are the reason that setting exists; a device buzzing in
 *     someone's hand is exactly the kind of feedback it is asking to stop.
 *  3. It must be quiet. Haptics that fire on every tap stop meaning anything
 *     and get the whole app muted at the OS level — so this exposes a small,
 *     named set of events rather than a general "buzz(ms)".
 *
 * Vibration is confirmation, never information: every event here is also
 * conveyed visually and to assistive technology. Nothing is haptic-only.
 */

/** The named moments. Anything not on this list does not get a haptic. */
export type Haptic =
  /** A value was committed — a spend logged, a change saved. */
  | 'success'
  /** Something was removed. Distinct so it is not mistaken for a save. */
  | 'remove'
  /** A rejected action: failed validation, a blocked submit. */
  | 'warn'
  /** A light tick for discrete selection (a category chip, a tab). */
  | 'select';

/**
 * Patterns in milliseconds, `[vibrate, pause, vibrate, …]`.
 *
 * Kept short deliberately. Anything past ~40ms reads as a buzz rather than a
 * tick, and Android renders long patterns much more harshly than iOS does.
 */
const PATTERNS: Record<Haptic, number | number[]> = {
  success: 18,
  remove: [14, 40, 14],
  warn: [26, 50, 26],
  select: 8,
};

function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Fire a haptic, if the platform has one and the user wants it.
 *
 * Returns whether anything actually happened — useful in tests, and honest
 * about the fact that this is a no-op on most desktops.
 */
export function haptic(kind: Haptic): boolean {
  if (reducedMotion()) return false;
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (!nav || typeof nav.vibrate !== 'function') return false;
    return nav.vibrate(PATTERNS[kind]);
  } catch {
    return false;
  }
}
