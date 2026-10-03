// Deterministic animation core: every value is a pure function of time, so a
// frame rendered twice is identical and the renderer can seek anywhere.

export const W = 1080;
export const H = 1920;

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a));
/** 0→1 progress of `t` through the window [a, a + d]. */
export const prog = (t, a, d) => clamp((t - a) / d);
export const mapRange = (v, a, b, c, d) => lerp(c, d, invLerp(a, b, v));

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  inOutQuint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  inOutExpo: (t) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  inBack: (t, s = 1.70158) => (s + 1) * t * t * t - s * t * t,
  outElastic: (t) =>
    t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
};

/** Damped spring settling from 0 to 1. `k` stiffness-ish, `z` damping ratio. */
export function spring(t, k = 14, z = 0.42) {
  if (t <= 0) return 0;
  const w = k;
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
}

/** Decaying shake offset, deterministic. */
export function shake(t, amp = 20, freq = 38, decay = 7) {
  if (t < 0) return [0, 0];
  const a = amp * Math.exp(-decay * t);
  return [a * Math.sin(t * freq * 1.13 + 1.7), a * Math.cos(t * freq * 0.97 + 0.3)];
}

/** Seeded RNG (mulberry32). */
export function rng(seed) {
  let a = typeof seed === 'string' ? hashStr(seed) : seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Smooth deterministic 1-D noise in [-1, 1]. */
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n) => {
    const s = Math.sin((n + seed * 57.13) * 127.1) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u);
}

// ---------- colour ----------
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbToHex = ([r, g, b]) =>
  '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
export function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]);
}
export const lighten = (c, t) => mix(c, '#ffffff', t);
export const darken = (c, t) => mix(c, '#000000', t);
export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
/** Relative luminance, for choosing ink on a coloured background. */
export function luminance(hex) {
  const c = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

// ---------- money ----------
/** Indian digit grouping: 7189675 → "71,89,675". */
export function inGroup(n) {
  const s = Math.round(Math.abs(n)).toString();
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return rest + ',' + last3;
}
export const inr = (n, sign = false) => (sign && n > 0 ? '+' : n < 0 ? '−' : '') + '₹' + inGroup(n);

/** Shared palette. Tool accents come from src/lib/tools.ts. */
export const C = {
  paper: '#F3F2EE',
  paper2: '#E9E7E1',
  card: '#FFFFFF',
  ink: '#0D0D12',
  ink2: '#2A2A33',
  mute: '#8B8A94',
  line: '#E4E2DC',
  loss: '#EF4135',
  gain: '#12B76A',
  night: '#07070E',
  night2: '#16133A',
  gold: '#F2C200',
  sun: '#FFC53D',
};

/** ₹ in lakh / crore shorthand: 12257076 → "₹1.23 Cr", 5114449 → "₹51.1 L". */
export function lakhCr(n) {
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
  return '₹' + (n / 1e5).toFixed(1).replace(/\.0$/, '') + ' L';
}

/** WCAG contrast ratio between two hex colours. */
export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Darken an accent until it reads on the paper background (≥ 3.6:1, above WCAG large-text 3:1). */
const _readable = new Map();
export function readableOnPaper(c, min = 3.6) {
  if (!c || c[0] !== '#') return c;
  if (_readable.has(c)) return _readable.get(c);
  let x = c;
  for (let i = 0; i < 20 && contrast(x, '#F3F2EE') < min; i++) x = darken(x, 0.06);
  _readable.set(c, x);
  return x;
}
