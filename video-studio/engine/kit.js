// Story helpers shared across tool films.
import { W, H, C, clamp, lerp, ease, spring, rng, lighten, darken, rgba } from './core.js';
import { rr, softShadow, sphere, embossText, burst, floorShadow, pill } from './draw.js';
import { label } from './text.js';

let _bite = null;
/**
 * A sphere with bites taken out of it. bites: [{a: angle toward the biter, t: seconds since bite}].
 */
export function bittenSphere(ctx, x, y, r, color, bites, { text = null, textSize = null, shadow = true } = {}) {
  const S = Math.ceil(r * 2 + 80);
  if (!_bite || _bite.width < S) _bite = new OffscreenCanvas(S, S);
  const b = _bite.getContext('2d');
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.clearRect(0, 0, _bite.width, _bite.height);
  const cx = S / 2;
  sphere(b, cx, cx, r, color, { shadow: false });
  if (text) embossText(b, text, cx, cx + r * 0.02, textSize || r * 0.36, { max: r * 1.55 });
  b.globalCompositeOperation = 'destination-out';
  for (const bite of bites) {
    if (bite.t < 0) continue;
    const k = ease.outBack(clamp(bite.t / 0.12), 2);
    const bx = cx + Math.cos(bite.a) * r * 0.98;
    const by = cx + Math.sin(bite.a) * r * 0.98;
    const br = r * 0.3 * k * (bite.size || 1);
    for (const off of [-0.55, 0, 0.55]) {
      const pa = bite.a + Math.PI / 2;
      b.beginPath();
      b.arc(bx + Math.cos(pa) * br * off * 1.3, by + Math.sin(pa) * br * off * 1.3, br * (off === 0 ? 1.1 : 0.85), 0, Math.PI * 2);
      b.fill();
    }
  }
  b.globalCompositeOperation = 'source-over';
  if (shadow) floorShadow(ctx, x, y + r * 1.04, r * 0.9, r * 0.15, 0.24);
  ctx.drawImage(_bite, 0, 0, S, S, x - S / 2, y - S / 2, S, S);
  for (const bite of bites) {
    burst(ctx, bite.t, x + Math.cos(bite.a) * r, y + Math.sin(bite.a) * r, { seed: 'crumb' + bite.a.toFixed(2), n: 14, colors: [color, lighten(color, 0.3), darken(color, 0.2)], speed: 650, gravity: 2200, size: 9, life: 0.9, dir: bite.a, spread: 1.8 });
  }
}

/** A delta label that pops then drifts upward. */
export function floatDelta(ctx, t, x, y, text, { color = C.loss, size = 64, hold = 99 } = {}) {
  if (t < 0) return;
  const p = ease.outBack(clamp(t / 0.3), 2);
  const fade = t > hold ? 1 - clamp((t - hold) / 0.3) : 1;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(x, y - ease.outCubic(clamp(t / 0.8)) * 60);
  ctx.scale(p, p);
  ctx.font = `900 ${size}px Geist`;
  ctx.letterSpacing = `${-0.03 * size}px`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = size * 0.16;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineJoin = 'round';
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** Tear-off calendar chip; flips from `a` to `b` at time `flipAt`. */
export function calendarChip(ctx, x, y, t, a, b, flipAt, { month = 'OCT', size = 1, alpha = 1, color = C.loss } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.scale(size, size);
  softShadow(ctx, -90, -100, 180, 200, 30, { spread: 30, alpha: 0.18, dy: 16 });
  ctx.fillStyle = '#fff';
  rr(ctx, -90, -100, 180, 200, 30);
  ctx.fill();
  ctx.save();
  rr(ctx, -90, -100, 180, 200, 30);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(-90, -100, 180, 56);
  ctx.restore();
  label(ctx, month, 0, -72, { size: 30, weight: 800, color: '#fff', ls: 0.08 });
  const p = clamp((t - flipAt) / 0.35);
  const showB = p > 0.5;
  const sy = Math.abs(Math.cos(p * Math.PI));
  ctx.save();
  ctx.translate(0, 34);
  ctx.scale(1, Math.max(0.02, sy));
  label(ctx, showB ? b : a, 0, 0, { size: 104, weight: 800, color: C.ink, ls: -0.04 });
  ctx.restore();
  ctx.restore();
}

/** Simple entrance: returns position along a slide-in with spring. */
export function slideIn(t, from, to, k = 10, z = 0.5) {
  const p = spring(t, k, z);
  return [lerp(from[0], to[0], p), lerp(from[1], to[1], p)];
}

/** Lunge offset toward a target at time `at` (bite): quick in, slow out. */
export function lunge(t, at, dist = 120) {
  const d = t - at;
  if (d < -0.18 || d > 0.45) return 0;
  if (d < 0) return ease.inCubic((d + 0.18) / 0.18) * dist;
  return (1 - ease.outCubic(d / 0.45)) * dist;
}

/** Mouth open amount for a chomp at time `at`. */
export function chompOpen(t, at) {
  const d = t - at;
  if (d < -0.3 || d > 0.25) return 0.05;
  if (d < 0) return 0.05 + 0.95 * ease.outCubic((d + 0.3) / 0.3);
  return 1 - ease.outCubic(d / 0.25) * 0.95;
}

/** Blink curve: closes briefly every few seconds (deterministic per seed). */
export function blink(t, seed = 0) {
  const period = 2.6 + (seed % 5) * 0.37;
  const ph = (t + seed * 0.71) % period;
  return ph < 0.12 ? Math.sin((ph / 0.12) * Math.PI) : 0;
}

/** Light paper scene background with bubbles in the accent colour. */
export { pill };

/** Animated number between a and b over [t0, t0+d] with ease. */
export function countTo(t, t0, d, a, b) {
  return lerp(a, b, ease.outCubic(clamp((t - t0) / d)));
}

/** Big headline at top, shared positioning for the middle scenes. */
export const HEAD_Y = 300;

import { kinetic } from './text.js';
import { bgPaper, bubbles as _bubbles } from './draw.js';

/**
 * Headlines that follow the voice: each [lineId, markup, opts] shows from its
 * line's start and leaves just before the next one begins.
 */
export function headlines(ctx, s, list, { y = HEAD_Y, size = 84, accent = '#16A36A', color = C.ink, maxW = 940, anim = 'pop' } = {}) {
  list.forEach(([id, markup, o = {}], i) => {
    const L = s.line(id);
    const next = list[i + 1];
    const out = o.keep ? null : next ? (next[2]?.at ?? s.line(next[0]).s) - 0.22 : null;
    kinetic(ctx, markup, W / 2, o.y ?? y, s.t, { size: o.size ?? size, color: o.color ?? color, accent: o.accent ?? accent, t0: (o.at ?? L.s) - 0.05, span: o.span ?? L.d * 0.65, out, maxW, anim: o.anim ?? anim });
  });
}

/** Paper background with drifting accent bubbles. */
export function paper(ctx, t, accent, seed = 'p', count = 8) {
  bgPaper(ctx, accent);
  _bubbles(ctx, t, { seed, count, color: accent, area: [0, 640, W, 1200], minR: 8, maxR: 20 });
}

/** A sphere that pops in with a spring at `at`. Returns current radius. */
export function popSphere(ctx, t, at, x, y, r, color, text = null, { textSize = null, shadow = true, k = 11, z = 0.45 } = {}) {
  if (t < at) return 0;
  const p = spring(t - at, k, z);
  const rr0 = r * p;
  sphere(ctx, x, y, rr0, color, { shadow });
  if (text && rr0 > 10) embossText(ctx, text, x, y + rr0 * 0.02, (textSize || r * 0.36) * p, { max: rr0 * 1.6 });
  return rr0;
}

/** Crown icon that floats above a winner. */
export function crown(ctx, x, y, size, t, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y + Math.sin(t * 4) * 6);
  ctx.rotate(Math.sin(t * 2.2) * 0.06);
  const s = size / 100;
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(-46, 26);
  ctx.lineTo(-52, -26);
  ctx.lineTo(-20, 2);
  ctx.lineTo(0, -38);
  ctx.lineTo(20, 2);
  ctx.lineTo(52, -26);
  ctx.lineTo(46, 26);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -38, 0, 26);
  g.addColorStop(0, '#FFE27A');
  g.addColorStop(1, '#E0A800');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#9A6B00';
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fillStyle = '#fff';
  for (const [cx, cy] of [[-52, -26], [0, -38], [52, -26]]) {
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
