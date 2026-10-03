// Product UI kit — simplified FinatriX tool surfaces, drawn on canvas.
import { C, clamp, lerp, ease, mix, lighten, darken, rgba, inr } from './core.js';
import { rr, softShadow, tabular } from './draw.js';
import { label } from './text.js';
import { iconTile, icon } from './icons.js';

/** App window card. Returns the content box. */
export function appWindow(ctx, x, y, w, h, { title = '', accent = '#16A36A', iconName = 'chart', alpha = 1, live = true, radius = 44 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  softShadow(ctx, x, y, w, h, radius, { spread: 70, alpha: 0.2, dy: 40 });
  ctx.fillStyle = '#FFFFFF';
  rr(ctx, x, y, w, h, radius);
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,15,30,0.06)';
  ctx.lineWidth = 2;
  ctx.stroke();
  iconTile(ctx, iconName, x + 70, y + 72, 64, accent);
  label(ctx, title, x + 122, y + 72, { size: 36, weight: 700, align: 'left' });
  if (live) {
    ctx.fillStyle = C.gain;
    ctx.beginPath();
    ctx.arc(x + w - 120, y + 72, 8, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, 'Live', x + w - 104, y + 72, { size: 26, weight: 600, color: C.mute, align: 'left' });
  }
  ctx.fillStyle = C.line;
  ctx.fillRect(x + 36, y + 128, w - 72, 2);
  ctx.restore();
  return { x: x + 48, y: y + 160, w: w - 96, h: h - 190 };
}

/** Labelled input with a typed value and focus ring. */
export function field(ctx, x, y, w, lab, value, { focus = 0, accent = '#16A36A', alpha = 1, h = 96, prefix = '' } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  label(ctx, lab, x, y, { size: 26, weight: 600, color: C.mute, align: 'left', baseline: 'top' });
  const fy = y + 40;
  ctx.fillStyle = '#F6F5F2';
  rr(ctx, x, fy, w, h, 22);
  ctx.fill();
  ctx.strokeStyle = mix('#E4E2DC', accent, focus);
  ctx.lineWidth = 2 + 3 * focus;
  ctx.stroke();
  if (focus > 0) {
    ctx.strokeStyle = rgba(accent, 0.18 * focus);
    ctx.lineWidth = 12;
    rr(ctx, x - 6, fy - 6, w + 12, h + 12, 26);
    ctx.stroke();
  }
  label(ctx, prefix + value, x + 28, fy + h / 2, { size: 40, weight: 700, align: 'left' });
  ctx.restore();
  return fy + h;
}

export function toggle(ctx, x, y, on, { accent = '#16A36A', size = 1, alpha = 1 } = {}) {
  const w = 104 * size;
  const h = 60 * size;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = mix('#D7D5CF', accent, on);
  rr(ctx, x, y - h / 2, w, h, h / 2);
  ctx.fill();
  const kx = lerp(x + h / 2, x + w - h / 2, ease.outBack(clamp(on), 1.4));
  softShadow(ctx, kx - h * 0.42, y - h * 0.42, h * 0.84, h * 0.84, h * 0.42, { spread: 8, alpha: 0.2, dy: 4, steps: 3 });
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(kx, y, h * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Slider with labelled stops; p in 0..1 along the track. */
export function slider(ctx, x, y, w, p, { accent = '#0A84FF', stops = [], alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = '#E6E4DF';
  rr(ctx, x, y - 8, w, 16, 8);
  ctx.fill();
  ctx.fillStyle = accent;
  rr(ctx, x, y - 8, w * p, 16, 8);
  ctx.fill();
  stops.forEach((s, i) => {
    const sx = x + (w * i) / Math.max(1, stops.length - 1);
    label(ctx, s, sx, y + 52, { size: 24, weight: 600, color: C.mute });
  });
  const kx = x + w * p;
  softShadow(ctx, kx - 26, y - 26, 52, 52, 26, { spread: 10, alpha: 0.25, dy: 6, steps: 3 });
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(kx, y, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.restore();
}

/**
 * Target-vs-actual bar. `max` scales both. p animates the fill.
 */
export function gapBar(ctx, x, y, w, lab, target, actual, max, { p = 1, color = '#16A36A', showActual = true, alpha = 1, tag = null, highlight = 0 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  label(ctx, lab, x, y, { size: 30, weight: 700, align: 'left', baseline: 'top' });
  if (tag) label(ctx, tag, x + w, y, { size: 28, weight: 700, align: 'right', baseline: 'top', color: tag.startsWith('+') || tag.startsWith('−') || tag.includes('over') ? C.loss : C.mute });
  const by = y + 50;
  ctx.fillStyle = '#EFEDE8';
  rr(ctx, x, by, w, 46, 14);
  ctx.fill();
  const tw = (w * target) / max;
  // target outline
  ctx.fillStyle = rgba(color, 0.22);
  rr(ctx, x, by, tw * ease.outCubic(clamp(p * 1.4)), 46, 14);
  ctx.fill();
  if (showActual) {
    const aw = (w * actual * ease.outCubic(clamp(p))) / max;
    const over = actual > target;
    const g = ctx.createLinearGradient(x, by, x, by + 46);
    const base = over ? C.loss : color;
    g.addColorStop(0, lighten(base, 0.15));
    g.addColorStop(1, darken(base, 0.08));
    ctx.fillStyle = g;
    rr(ctx, x, by + 8, aw, 30, 10);
    ctx.fill();
  }
  // target marker
  ctx.fillStyle = C.ink;
  ctx.fillRect(x + tw - 2, by - 8, 4, 62);
  if (highlight > 0) {
    ctx.strokeStyle = rgba(C.loss, highlight);
    ctx.lineWidth = 5;
    rr(ctx, x - 14, y - 12, w + 28, 120, 22);
    ctx.stroke();
  }
  ctx.restore();
}

/** Donut chart; slices [{p, c, n}], prog sweeps it in. */
export function donut(ctx, cx, cy, r, slices, { prog = 1, thick = 0.34, gap = 0.012, alpha = 1, rot = -Math.PI / 2 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  const total = slices.reduce((a, s) => a + s.p, 0);
  let a0 = rot;
  const sweep = Math.PI * 2 * ease.outCubic(clamp(prog));
  for (const s of slices) {
    const a1 = a0 + (s.p / total) * Math.PI * 2;
    const e0 = Math.min(a0, rot + sweep);
    const e1 = Math.min(a1 - gap, rot + sweep);
    if (e1 > e0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, e0, e1);
      ctx.arc(cx, cy, r * (1 - thick), e1, e0, true);
      ctx.closePath();
      const g = ctx.createRadialGradient(cx, cy, r * (1 - thick), cx, cy, r);
      g.addColorStop(0, darken(s.c, 0.1));
      g.addColorStop(1, lighten(s.c, 0.12));
      ctx.fillStyle = g;
      ctx.fill();
    }
    a0 = a1;
  }
  ctx.restore();
}

/** Interpolate two donut slice sets by p (same length not required). */
export function lerpSlices(A, B, p) {
  const keys = [...new Set([...A.map((s) => s.n), ...B.map((s) => s.n)])];
  return keys.map((n) => {
    const a = A.find((s) => s.n === n);
    const b = B.find((s) => s.n === n);
    return { n, c: (b || a).c, p: lerp(a ? a.p : 0, b ? b.p : 0, p) };
  });
}

/**
 * Ranked list whose rows animate between two orders.
 * rows: [{n, v (display), sub, badge}] ; orderA/orderB arrays of row indices.
 */
export function rankList(ctx, x, y, w, rows, orderA, orderB, p, { rowH = 104, accent = '#FF6B5E', alpha = 1, winnerGlow = 1, valueA = null, valueB = null, show = 99 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  const e = ease.inOutCubic(clamp(p));
  const pos = rows.map((_, i) => lerp(orderA.indexOf(i), orderB.indexOf(i), e));
  const draw = rows.map((r, i) => ({ r, i, pos: pos[i] })).sort((a, b) => b.pos - a.pos);
  for (const { r, i, pos: ps } of draw) {
    if (Math.min(orderA.indexOf(i), orderB.indexOf(i)) >= show) continue;
    const ry = y + ps * rowH;
    const top = ps < 0.5;
    ctx.save();
    if (top) softShadow(ctx, x, ry, w, rowH - 14, 24, { spread: 26, alpha: 0.14 * winnerGlow, dy: 14, steps: 4 });
    ctx.fillStyle = top ? '#FFFFFF' : '#F7F6F3';
    rr(ctx, x, ry, w, rowH - 14, 24);
    ctx.fill();
    if (top) {
      ctx.strokeStyle = rgba(accent, 0.9 * winnerGlow);
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    const rank = Math.round(ps) + 1;
    label(ctx, String(rank), x + 44, ry + (rowH - 14) / 2, { size: 30, weight: 800, color: top ? accent : C.mute });
    label(ctx, r.n, x + 88, ry + (rowH - 14) / 2 - (r.sub ? 14 : 0), { size: 32, weight: 700, align: 'left' });
    if (r.sub) label(ctx, r.sub, x + 88, ry + (rowH - 14) / 2 + 22, { size: 22, weight: 600, color: C.mute, align: 'left' });
    const val = valueA && valueB ? (e < 0.5 ? valueA[i] : valueB[i]) : r.v;
    label(ctx, val, x + w - 32, ry + (rowH - 14) / 2, { size: 34, weight: 800, align: 'right', color: top ? C.ink : C.ink2 });
    ctx.restore();
  }
  ctx.restore();
}

/** Smooth line chart through normalised points [0..1]; prog draws it on. */
export function lineChart(ctx, x, y, w, h, series, { prog = 1, alpha = 1, grid = true, fill = true, width = 8 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (grid) {
    ctx.strokeStyle = 'rgba(15,15,30,0.07)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x, y + (h * i) / 4);
      ctx.lineTo(x + w, y + (h * i) / 4);
      ctx.stroke();
    }
  }
  for (const s of series) {
    const pts = s.pts;
    const n = pts.length;
    const upto = (n - 1) * clamp(s.prog ?? prog);
    const path = [];
    for (let i = 0; i <= Math.floor(upto); i++) path.push(pts[i]);
    const frac = upto - Math.floor(upto);
    if (frac > 0 && Math.floor(upto) + 1 < n) {
      const a = pts[Math.floor(upto)];
      const b = pts[Math.floor(upto) + 1];
      path.push([lerp(a[0], b[0], frac), lerp(a[1], b[1], frac)]);
    }
    if (path.length < 2) continue;
    const P = path.map(([px, py]) => [x + px * w, y + h - py * h]);
    const trace = () => {
      ctx.moveTo(P[0][0], P[0][1]);
      for (let i = 1; i < P.length; i++) {
        const [x0, y0] = P[i - 1];
        const [x1, y1] = P[i];
        const mx = (x0 + x1) / 2;
        ctx.bezierCurveTo(mx, y0, mx, y1, x1, y1);
      }
    };
    if (fill && s.fill !== false) {
      ctx.beginPath();
      trace();
      ctx.lineTo(P[P.length - 1][0], y + h);
      ctx.lineTo(P[0][0], y + h);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, rgba(s.c, 0.28));
      g.addColorStop(1, rgba(s.c, 0));
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.beginPath();
    trace();
    ctx.strokeStyle = s.c;
    ctx.lineWidth = s.width ?? width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (s.dash) ctx.setLineDash(s.dash);
    ctx.stroke();
    ctx.setLineDash([]);
    const end = P[P.length - 1];
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(end[0], end[1], 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = s.c;
    ctx.beginPath();
    ctx.arc(end[0], end[1], 9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Semi-circular gauge with a benchmark tick; v and bench in 0..1. */
export function gauge(ctx, cx, cy, r, v, { bench = 0.5, color = '#7C5CFF', alpha = 1, label: lab = '', sub = '' } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.2;
  ctx.strokeStyle = '#ECEAE5';
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 0);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, Math.PI + Math.PI * clamp(v));
  ctx.stroke();
  const ba = Math.PI + Math.PI * bench;
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(ba) * r * 0.78, cy + Math.sin(ba) * r * 0.78);
  ctx.lineTo(cx + Math.cos(ba) * r * 1.22, cy + Math.sin(ba) * r * 1.22);
  ctx.stroke();
  const na = Math.PI + Math.PI * clamp(v);
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(na) * r * 0.7, cy + Math.sin(na) * r * 0.7);
  ctx.stroke();
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.arc(cx, cy, 14, 0, Math.PI * 2);
  ctx.fill();
  if (lab) label(ctx, lab, cx, cy + 56, { size: 30, weight: 700 });
  if (sub) label(ctx, sub, cx, cy + 96, { size: 24, weight: 600, color: C.mute });
  ctx.restore();
}

/** Phone mock with a lock screen; `content(ctx, box)` draws inside the screen. */
export function phone(ctx, cx, cy, w, { time = '7:02', alpha = 1, content = null, tilt = 0, screenTop = '#2B2350', screenBot = '#F2A65A', lock = true } = {}) {
  const h = w * 2.05;
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  ctx.translate(-cx, -cy);
  softShadow(ctx, x, y, w, h, w * 0.16, { spread: 80, alpha: 0.28, dy: 50 });
  ctx.fillStyle = '#121218';
  rr(ctx, x, y, w, h, w * 0.16);
  ctx.fill();
  const sx = x + w * 0.045;
  const sy = y + w * 0.045;
  const sw = w * 0.91;
  const sh = h - w * 0.09;
  const g = ctx.createLinearGradient(0, sy, 0, sy + sh);
  g.addColorStop(0, screenTop);
  g.addColorStop(1, screenBot);
  ctx.fillStyle = g;
  rr(ctx, sx, sy, sw, sh, w * 0.12);
  ctx.fill();
  ctx.fillStyle = '#000';
  rr(ctx, cx - w * 0.15, sy + w * 0.04, w * 0.3, w * 0.085, w * 0.045);
  ctx.fill();
  if (lock) {
    label(ctx, time, cx, sy + sh * 0.2, { size: w * 0.24, weight: 700, color: '#fff', ls: -0.03 });
    label(ctx, 'Monday, 7 October', cx, sy + sh * 0.11, { size: w * 0.055, weight: 600, color: 'rgba(255,255,255,0.8)' });
  }
  if (content) {
    ctx.save();
    rr(ctx, sx, sy, sw, sh, w * 0.12);
    ctx.clip();
    content(ctx, { x: sx, y: sy, w: sw, h: sh });
    ctx.restore();
  }
  ctx.restore();
}

/** iOS-style notification card. */
export function notif(ctx, x, y, w, { title = 'FinatriX', body = '', accent = '#16A36A', iconName = 'chart', alpha = 1, scale = 1, lines = null } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  const h = (lines ? 92 + lines.length * 34 : 150) * scale;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  rr(ctx, x, y, w, h, 30 * scale);
  ctx.fill();
  iconTile(ctx, iconName, x + 50 * scale, y + 50 * scale, 52 * scale, accent);
  label(ctx, title, x + 92 * scale, y + 42 * scale, { size: 26 * scale, weight: 700, align: 'left' });
  label(ctx, 'now', x + w - 24 * scale, y + 42 * scale, { size: 22 * scale, weight: 600, align: 'right', color: C.mute });
  const ls = lines || [body];
  ls.forEach((ln, i) => label(ctx, ln, x + 92 * scale, y + (84 + i * 34) * scale, { size: 25 * scale, weight: 500, align: 'left', color: C.ink2 }));
  ctx.restore();
  return h;
}

/** Selectable chip. */
export function chip(ctx, x, y, text, { on = 0, accent = '#D4AF37', size = 30, alpha = 1, iconName = null } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `700 ${size}px Geist`;
  ctx.letterSpacing = `${-0.01 * size}px`; // match label(): stale spacing would mis-size the chip
  const tw = ctx.measureText(text).width;
  const w = tw + size * 1.6 + (iconName ? size * 1.2 : 0);
  const h = size * 2;
  ctx.fillStyle = mix('#FFFFFF', accent, on);
  rr(ctx, x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.strokeStyle = mix('#E2E0DA', accent, on);
  ctx.lineWidth = 3;
  ctx.stroke();
  const fg = on > 0.5 ? '#fff' : C.ink;
  let tx = x - w / 2 + size * 0.8;
  if (iconName) {
    icon(ctx, iconName, tx + size * 0.45, y, size * 0.95, { color: fg, lw: 10 });
    tx += size * 1.2;
  }
  label(ctx, text, tx, y, { size, weight: 700, color: fg, align: 'left' });
  ctx.restore();
  return w;
}

/** Cursor arrow (for clicks/drags). */
export function cursor(ctx, x, y, { scale = 1, press = 0, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.scale(scale * (1 - press * 0.12), scale * (1 - press * 0.12));
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 64);
  ctx.lineTo(16, 50);
  ctx.lineTo(28, 76);
  ctx.lineTo(40, 70);
  ctx.lineTo(28, 46);
  ctx.lineTo(48, 44);
  ctx.closePath();
  ctx.fillStyle = '#111';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

export { inr, tabular };

/** Segmented control; `sel` may be fractional to animate the thumb between options. */
export function segmented(ctx, x, y, w, options, sel, { accent = '#0A84FF', h = 84, size = 28, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = '#F1EFEA';
  rr(ctx, x, y, w, h, h / 2);
  ctx.fill();
  const seg = w / options.length;
  const tx = x + seg * sel;
  softShadow(ctx, tx + 6, y + 6, seg - 12, h - 12, (h - 12) / 2, { spread: 10, alpha: 0.18, dy: 4, steps: 3 });
  ctx.fillStyle = accent;
  rr(ctx, tx + 6, y + 6, seg - 12, h - 12, (h - 12) / 2);
  ctx.fill();
  options.forEach((o, i) => {
    const on = clamp(1 - Math.abs(sel - i));
    label(ctx, o, x + seg * i + seg / 2, y + h / 2, { size, weight: 700, color: mix(C.ink2, '#FFFFFF', on) });
  });
  ctx.restore();
}
