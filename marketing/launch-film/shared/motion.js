// Motion shared by every rendered scene of the launch film: easing, a seeded
// RNG, handheld drift. Dependency-free, so DOM-only scenes can use it too.

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const range = (t, a, b) => clamp01((t - a) / (b - a));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (x) => x * x * (3 - 2 * x);
export const easeIn = (x) => x * x * x;
export const easeOut = (x) => 1 - Math.pow(1 - x, 3);
export const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const easeOutExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
export const easeOutBack = (x, s = 1.5) => (x <= 0 ? 0 : 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2));
/** 0 → 1 → 0 over [a, a+rise, a+rise+fall]. */
export const pulse = (t, a, rise, fall) => (t < a ? 0 : t < a + rise ? smooth((t - a) / rise) : 1 - smooth(range(t, a + rise, a + rise + fall)));

export function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Handheld camera drift: a few incommensurate sines, so it never visibly loops. */
export function handheld(t, amount = 1) {
  const s = (f, p) => Math.sin(t * f + p);
  return {
    x: amount * (0.006 * s(1.3, 0.2) + 0.003 * s(2.9, 1.7) + 0.0015 * s(6.1, 0.4)),
    y: amount * (0.005 * s(1.1, 2.1) + 0.0025 * s(3.3, 0.9) + 0.0012 * s(7.3, 2.6)),
    roll: amount * (0.0016 * s(0.9, 1.1) + 0.0008 * s(2.3, 0.3)),
  };
}
