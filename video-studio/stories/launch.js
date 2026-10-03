// Launch teaser — all eight tools in one continuous shot, ending on the 14 October launch.
// The `variant` decides the sign-off: 'domain' shows finatrix.co, 'nodomain' does not.
import { W, H, C, clamp, lerp, ease, spring, rng, mix, lighten, darken, rgba, noise1 } from '../engine/core.js';
import { rr, softShadow, sphere, burst, ring, stars, floorShadow, pill, tabular } from '../engine/draw.js';
import { kinetic, label } from '../engine/text.js';
import { icon, iconTile } from '../engine/icons.js';
import { donut, lineChart, gauge } from '../engine/ui.js';
import { wordmark, logoTile } from '../engine/scenes.js';
import { TOOLS } from '../engine/tools.js';

const QUESTIONS = [
  'Where should my salary *go?*',
  'Where did it *actually* go?',
  'How should I *invest?*',
  'Where do I park *idle cash?*',
  'Am I *on track?*',
  'What should I save *each month?*',
  'Where will my choices *lead?*',
  'What am I *really* worth?',
];
const CX = W / 2;

// ---------------------------------------------------------------- helpers
const e = (x) => ease.inOutCubic(clamp(x));
const mixP = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), s: lerp(a.s, b.s, k), a: lerp(a.a, b.a, k), z: lerp(a.z, b.z, k), q: lerp(a.q ?? 0, b.q ?? 0, k) });

function space(ctx, T, tint, floor = 0.18) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#04040A');
  g.addColorStop(0.6, '#08081A');
  g.addColorStop(1, '#0E0C24');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // aurora blobs follow the active colour
  const blobs = [[0.25, 0.3, 700, 0.36], [0.8, 0.62, 800, 0.28], [0.45, 0.95, 900, 0.22]];
  blobs.forEach(([bx, by, r, a], i) => {
    const x = W * bx + noise1(T * 0.18, i) * 160;
    const y = H * by + noise1(T * 0.15 + 4, i) * 160;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, rgba(i === 1 ? lighten(tint, 0.2) : tint, a));
    rg.addColorStop(1, rgba(tint, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  });
  stars(ctx, T, { seed: 'launch', n: 90, area: [0, 0, W, H] });
  // perspective floor
  if (floor > 0.01) {
    const hy = 1260;
    ctx.save();
    ctx.globalAlpha = floor;
    ctx.strokeStyle = lighten(tint, 0.3);
    ctx.lineWidth = 2;
    for (let i = -12; i <= 12; i++) {
      ctx.beginPath();
      ctx.moveTo(CX + i * 18, hy);
      ctx.lineTo(CX + i * 260, H + 40);
      ctx.stroke();
    }
    const off = (T * 0.35) % 1;
    for (let k = 0; k < 14; k++) {
      const z = (k + off) / 14;
      const y = hy + Math.pow(z, 2.2) * (H - hy + 60);
      ctx.globalAlpha = floor * (0.25 + 0.75 * z);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** A glowing tool tile: tool colour, white icon, optional "?" mask. */
function tile(ctx, tl, x, y, size, alpha, q = 0, glow = 0.5) {
  if (size < 2 || alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (glow > 0) {
    const gg = ctx.createRadialGradient(x, y, size * 0.2, x, y, size * 1.25);
    gg.addColorStop(0, rgba(tl.color, 0.45 * glow));
    gg.addColorStop(1, rgba(tl.color, 0));
    ctx.fillStyle = gg;
    ctx.fillRect(x - size * 1.3, y - size * 1.3, size * 2.6, size * 2.6);
  }
  const base = mix(tl.color, '#3A3A48', q * 0.7);
  const g = ctx.createLinearGradient(x, y - size / 2, x, y + size / 2);
  g.addColorStop(0, lighten(base, 0.18));
  g.addColorStop(1, darken(base, 0.18));
  ctx.fillStyle = g;
  rr(ctx, x - size / 2, y - size / 2, size, size, size * 0.26);
  ctx.fill();
  // glass highlight
  const hg = ctx.createLinearGradient(x, y - size / 2, x, y);
  hg.addColorStop(0, 'rgba(255,255,255,0.35)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hg;
  rr(ctx, x - size / 2 + 4, y - size / 2 + 4, size - 8, size * 0.45, size * 0.22);
  ctx.fill();
  if (q > 0.5) label(ctx, '?', x, y + size * 0.03, { size: size * 0.6, weight: 900, color: 'rgba(255,255,255,0.9)' });
  else icon(ctx, tl.icon, x, y, size * 0.6, { color: '#fff', lw: 9 });
  ctx.restore();
}

/** Split-flap panel. */
function flap(ctx, x, y, w, h, text, p) {
  ctx.save();
  ctx.translate(x, y);
  softShadow(ctx, -w / 2, -h / 2, w, h, 26, { spread: 40, alpha: 0.5, dy: 24, color: '#000000' });
  ctx.fillStyle = '#17162A';
  rr(ctx, -w / 2, -h / 2, w, h, 26);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 3;
  ctx.stroke();
  const sy = Math.max(0.02, Math.abs(Math.cos((1 - ease.outCubic(clamp(p))) * Math.PI * 0.5 * 3)));
  ctx.save();
  ctx.scale(1, p >= 1 ? 1 : sy);
  tabular(ctx, text, 0, h * 0.04, h * 0.58, { weight: 900, color: '#FFFFFF' });
  ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(-w / 2, -2, w, 5);
  ctx.restore();
}

function shieldPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.bezierCurveTo(x + s * 0.55, y - s * 0.72, x + s * 0.85, y - s * 0.72, x + s * 0.85, y - s * 0.72);
  ctx.lineTo(x + s * 0.8, y + s * 0.05);
  ctx.bezierCurveTo(x + s * 0.72, y + s * 0.6, x + s * 0.3, y + s * 0.88, x, y + s);
  ctx.bezierCurveTo(x - s * 0.3, y + s * 0.88, x - s * 0.72, y + s * 0.6, x - s * 0.8, y + s * 0.05);
  ctx.lineTo(x - s * 0.85, y - s * 0.72);
  ctx.bezierCurveTo(x - s * 0.85, y - s * 0.72, x - s * 0.55, y - s * 0.72, x, y - s);
  ctx.closePath();
}

// ---------------------------------------------------------------- micro demos (card body)
const AGGR = ['#c2410c', '#1d7d46', '#0071e3', '#6e3bd4', '#b08a36', '#b3387a', '#0c8079'].map((c, i) => ({ n: String(i), p: [25, 22, 13, 15, 10, 10, 5][i], c }));
const DEMOS = [
  // Budget: 50/30/20
  (ctx, x, y, w, h, lt) => {
    const segs = [['Needs', 0.5, '#16A36A'], ['Wants', 0.3, '#2E90FA'], ['Savings', 0.2, '#F5A524']];
    let sx = x;
    segs.forEach(([n, p, c], i) => {
      const q = ease.outBack(clamp((lt - 0.2 - i * 0.2) / 0.4), 1.4);
      const sw = w * p - 10;
      ctx.save();
      ctx.translate(sx + sw / 2, y + h * 0.42);
      ctx.scale(q, q);
      ctx.fillStyle = c;
      rr(ctx, -sw / 2, -90, sw, 180, 26);
      ctx.fill();
      label(ctx, `${Math.round(p * 100)}%`, 0, -18, { size: 54, weight: 900, color: '#fff' });
      label(ctx, n, 0, 40, { size: 26, weight: 700, color: 'rgba(255,255,255,0.9)' });
      ctx.restore();
      sx += w * p;
    });
    label(ctx, 'of your take-home', x + w / 2, y + h * 0.88, { size: 30, weight: 600, color: C.mute });
  },
  // Expenses: four weeks of logging
  (ctx, x, y, w, h, lt) => {
    const R = rng('exp');
    const cell = w / 7;
    for (let i = 0; i < 28; i++) {
      const cx = x + (i % 7) * cell;
      const cy = y + 20 + Math.floor(i / 7) * cell * 0.9;
      const on = lt > 0.15 + i * 0.045;
      ctx.fillStyle = on ? '#FFF3E8' : '#F0EEE9';
      rr(ctx, cx + 5, cy + 5, cell - 10, cell * 0.9 - 10, 14);
      ctx.fill();
      if (on) {
        const n = 1 + Math.floor(R() * 2.2);
        for (let k = 0; k < n; k++) {
          ctx.fillStyle = '#FF7A1A';
          ctx.beginPath();
          ctx.arc(cx + 24 + k * 22, cy + 26, 8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    label(ctx, 'see the pattern, not just the total', x + w / 2, y + h * 0.9, { size: 28, weight: 600, color: C.mute });
  },
  // InvestMatch: allocation donut
  (ctx, x, y, w, h, lt) => {
    donut(ctx, x + w / 2, y + h * 0.42, 150, AGGR, { prog: clamp((lt - 0.1) / 1.0) });
    label(ctx, 'risk + horizon', x + w / 2, y + h * 0.42, { size: 30, weight: 800 });
    label(ctx, 'mapped to an allocation', x + w / 2, y + h * 0.9, { size: 28, weight: 600, color: C.mute });
  },
  // ParkSmart: ranked by what you keep
  (ctx, x, y, w, h, lt) => {
    const p = e((lt - 0.6) / 0.6);
    const rows = [['Short duration fund', '7.4%', '₹19,425'], ['Arbitrage fund', '7.1%', '₹21,300']];
    label(ctx, p < 0.5 ? 'Rate' : 'You keep · 30% slab', x + w, y + 10, { size: 24, weight: 700, color: p < 0.5 ? C.mute : '#FF6B5E', align: 'right' });
    rows.forEach((r, i) => {
      const yy = y + 50 + lerp(i, 1 - i, p) * 130;
      ctx.fillStyle = (p < 0.5 ? i === 0 : i === 1) ? '#FFF1EF' : '#F6F5F2';
      rr(ctx, x, yy, w, 110, 24);
      ctx.fill();
      label(ctx, r[0], x + 30, yy + 55, { size: 30, weight: 700, align: 'left' });
      label(ctx, p < 0.5 ? r[1] : r[2], x + w - 30, yy + 55, { size: 34, weight: 900, align: 'right' });
    });
    label(ctx, 'ranked by what you keep after tax', x + w / 2, y + h * 0.9, { size: 28, weight: 600, color: C.mute });
  },
  // PeerCompare: gauge vs benchmark
  (ctx, x, y, w, h, lt) => {
    const v = lerp(0.05, 0.62, ease.outElastic(clamp((lt - 0.2) / 1.4)));
    gauge(ctx, x + w / 2, y + h * 0.55, 170, v, { bench: 0.5, color: '#7C5CFF' });
    label(ctx, 'adjusted for your city', x + w / 2, y + h * 0.9, { size: 28, weight: 600, color: C.mute });
  },
  // Goals: back-solved progress ring
  (ctx, x, y, w, h, lt) => {
    const p = ease.outCubic(clamp((lt - 0.2) / 1.2));
    const cx = x + w / 2;
    const cy = y + h * 0.42;
    ctx.lineCap = 'round';
    ctx.lineWidth = 28;
    ctx.strokeStyle = '#EAF6F4';
    ctx.beginPath();
    ctx.arc(cx, cy, 140, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#14B8A6';
    ctx.beginPath();
    ctx.arc(cx, cy, 140, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
    ctx.stroke();
    icon(ctx, 'flag', cx, cy, 120, { color: '#0f877a', lw: 10 });
    label(ctx, 'goal first, SIP second', x + w / 2, y + h * 0.9, { size: 28, weight: 600, color: C.mute });
  },
  // LifeMap: two lives
  (ctx, x, y, w, h, lt) => {
    const sm = [[0, 0.06], [0.2, 0.14], [0.4, 0.26], [0.6, 0.42], [0.8, 0.66], [1, 0.95]];
    const im = [[0, 0.05], [0.2, 0.08], [0.4, 0.11], [0.6, 0.14], [0.8, 0.17], [1, 0.2]];
    const p = clamp((lt - 0.1) / 1.2);
    lineChart(ctx, x + 10, y + 20, w - 20, h * 0.62, [{ pts: sm, c: '#D4AF37', prog: p, width: 8 }, { pts: im, c: '#FF5A52', prog: p, width: 8, fill: false }], { grid: false });
    label(ctx, 'compare two lives, not a forecast', x + w / 2, y + h * 0.9, { size: 28, weight: 600, color: C.mute });
  },
  // Net Worth: own vs owe scale
  (ctx, x, y, w, h, lt) => {
    const tilt = 0.18 * ease.outElastic(clamp((lt - 0.2) / 1.6));
    const cx = x + w / 2;
    const cy = y + 80;
    ctx.strokeStyle = '#3A3A44';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy + 230);
    ctx.moveTo(cx - 90, cy + 230);
    ctx.lineTo(cx + 90, cy + 230);
    ctx.moveTo(cx - Math.cos(tilt) * 200, cy + Math.sin(tilt) * 200);
    ctx.lineTo(cx + Math.cos(tilt) * 200, cy - Math.sin(tilt) * 200);
    ctx.stroke();
    [[-1, 'Own', '#0EA5A5'], [1, 'Owe', '#C2413A']].forEach(([sd, n, c]) => {
      const px = cx + sd * Math.cos(tilt) * 200;
      const py = cy - sd * Math.sin(tilt) * 200 + 90;
      sphere(ctx, px, py, sd < 0 ? 58 : 42, c, { shadow: false });
      label(ctx, n, px, py + 2, { size: 26, weight: 800, color: '#fff' });
    });
    label(ctx, 'assets minus liabilities, month by month', x + w / 2, y + h * 0.9, { size: 28, weight: 600, color: C.mute });
  },
];

// ---------------------------------------------------------------- story
export function makeLaunch(variant) {
  return function story({ timeline, logo }) {
    const L = Object.fromEntries(timeline.lines.map((l) => [l.id, l]));
    const D = timeline.duration;
    const tS = (id) => L[id].start;
    const tE = (id) => L[id].end;
    const R0 = tS('reveal');
    const T1 = tS('t1');
    const SF = tS('safe');
    const WK = tS('weekly');
    const MO = tS('monthly');
    const WY = tS('why');
    const LA = tS('launch');
    const EN = tS('end');
    const toolStarts = TOOLS.map((_, i) => tS('t' + (i + 1)));

    /** Fractional index of the tool at the front of the carousel. */
    const front = (T) => toolStarts.slice(1).reduce((f, ts) => f + e((T - (ts - 0.5)) / 0.75), 0);

    // tile layouts
    const scatterR = rng('scatter');
    const SCAT = TOOLS.map(() => ({ x: 140 + scatterR() * 800, y: 620 + scatterR() * 900, ph: scatterR() * 6 }));
    const GRID = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
    const scatter = (k, T) => ({ x: SCAT[k].x + Math.sin(T * 0.5 + SCAT[k].ph) * 30, y: SCAT[k].y + Math.cos(T * 0.4 + SCAT[k].ph) * 40, s: 150, a: clamp(T / 0.6) * 0.85, z: 0, q: 1 });
    const grid = (k, cy, sp = 185) => ({ x: CX + GRID[k][0] * sp, y: cy + GRID[k][1] * sp, s: sp * 0.86, a: 1, z: 0.5, q: 0 });
    const ringP = (k, T) => {
      const a = (k - front(T)) * ((Math.PI * 2) / 8);
      const z = Math.cos(a);
      const d = (z + 1) / 2;
      return { x: CX + 440 * Math.sin(a), y: 1290 + 120 * z, s: 96 + 84 * d, a: 0.35 + 0.65 * d, z, q: 0 };
    };
    const orbit = (k, T) => {
      const a = (k / 8) * Math.PI * 2 + T * 0.55;
      return { x: CX + 410 * Math.cos(a), y: 930 + 410 * Math.sin(a), s: 104, a: 1, z: Math.sin(a), q: 0 };
    };
    const hidden = (k, T) => ({ ...orbit(k, T), x: CX, y: 930, s: 20, a: 0 });

    function tilePos(k, T) {
      let p = scatter(k, T);
      if (T > R0) p = mixP(p, grid(k, 820), e((T - R0 - k * 0.06) / 0.9));
      if (T > T1 - 0.7) p = mixP(p, ringP(k, T), e((T - (T1 - 0.7) - k * 0.03) / 0.9));
      if (T > SF - 0.4) p = mixP(p, orbit(k, T), e((T - (SF - 0.4)) / 0.9));
      if (T > WK - 0.3) p = mixP(p, hidden(k, T), e((T - (WK - 0.3)) / 0.6));
      if (T > LA - 0.3) p = mixP(p, grid(k, 700, 165), e((T - (LA - 0.3) - k * 0.05) / 0.9));
      return p;
    }

    function tint(T) {
      let c = '#5B4BFF';
      if (T > R0) c = mix(c, C.gold, e((T - R0) / 0.8));
      if (T > T1 - 0.5) {
        const f = front(T);
        const i = Math.min(7, Math.floor(f));
        const col = mix(TOOLS[i].color, TOOLS[Math.min(7, i + 1)].color, f - i);
        c = mix(c, col, e((T - (T1 - 0.5)) / 0.8));
      }
      if (T > SF - 0.3) c = mix(c, '#12B76A', e((T - SF + 0.3) / 0.8));
      if (T > WK - 0.3) c = mix(c, '#0A84FF', e((T - WK + 0.3) / 0.8));
      if (T > WY - 0.3) c = mix(c, '#FF9F1C', e((T - WY + 0.3) / 0.8));
      if (T > LA - 0.3) c = mix(c, '#7C5CFF', e((T - LA + 0.3) / 0.8));
      return c;
    }

    function draw(ctx, s) {
      const T = s.T;
      const floor = 0.12 + 0.4 * e((T - WY + 0.3) / 0.8) * (1 - e((T - LA) / 0.8));
      space(ctx, T, tint(T), floor);

      // ---- why: sunrise on the horizon, path from today to tomorrow
      const why = e((T - WY + 0.2) / 0.8) * (1 - e((T - LA + 0.1) / 0.6));
      if (why > 0.01) {
        ctx.save();
        ctx.globalAlpha = why;
        const sunY = lerp(1420, 1180, e((T - WY) / 2.2));
        const hg = ctx.createRadialGradient(CX, sunY, 60, CX, sunY, 620);
        hg.addColorStop(0, 'rgba(255,180,60,0.55)');
        hg.addColorStop(1, 'rgba(255,180,60,0)');
        ctx.fillStyle = hg;
        ctx.fillRect(0, 0, W, H);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, 1260);
        ctx.clip();
        sphere(ctx, CX, sunY, 210, '#FFB547', { shadow: false, gloss: 0.5 });
        ctx.restore();
        // the path
        const pp = e((T - WY - 0.3) / 1.6);
        ctx.strokeStyle = 'rgba(255,214,140,0.95)';
        ctx.lineWidth = 14;
        ctx.lineCap = 'round';
        ctx.beginPath();
        const steps = 40;
        for (let i = 0; i <= steps * pp; i++) {
          const u = i / steps;
          const x = CX + Math.sin(u * Math.PI * 2.2) * 160 * (1 - u);
          const y = lerp(H + 20, 1262, Math.pow(u, 0.75));
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
        label(ctx, 'STABILITY · TODAY', CX, 1780, { size: 30, weight: 800, color: rgba('#FFE2A8', why * e((T - WY - 0.4) / 0.5)), ls: 0.18 });
        label(ctx, 'FREEDOM · TOMORROW', CX, 1210 - 260, { size: 30, weight: 800, color: rgba('#FFE2A8', why * e((T - s.start - s.line('why').s - s.line('why').d * 0.55) / 0.5)), ls: 0.18 });
      }

      // ---- tiles: behind layer
      const posAll = TOOLS.map((tl, k) => ({ tl, k, p: tilePos(k, T) }));
      const inCarousel = T > T1 - 0.4 && T < SF - 0.2;
      const f = front(T);
      const act = Math.round(f);
      const cardA = inCarousel ? clamp(1 - Math.abs(f - act) * 3.2) * e((T - T1 + 0.3) / 0.5) * (1 - e((T - SF + 0.4) / 0.4)) : 0;
      posAll.filter((o) => o.p.z < 0.6).sort((a, b) => a.p.z - b.p.z).forEach(({ tl, k, p }) => tile(ctx, tl, p.x, p.y, p.s, p.a, p.q, 0.5));

      // grid centre (the logo's gold heart) + real logo crossfade
      const gridIn = e((T - R0 - 0.7) / 0.5) * (1 - e((T - T1 + 0.9) / 0.5));
      const gridIn2 = e((T - LA - 0.5) / 0.5);
      const centreA = Math.max(gridIn, gridIn2);
      if (centreA > 0.01) {
        const cy = gridIn2 > gridIn ? 700 : 820;
        const sz = gridIn2 > gridIn ? 142 : 160;
        ctx.save();
        ctx.globalAlpha = centreA;
        const g = ctx.createLinearGradient(CX, cy - sz / 2, CX, cy + sz / 2);
        g.addColorStop(0, '#F5C518');
        g.addColorStop(1, '#C9952B');
        ctx.fillStyle = g;
        rr(ctx, CX - sz / 2, cy - sz / 2, sz, sz, sz * 0.12);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(CX, cy, sz * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      const logoA1 = e((T - R0 - 1.2) / 0.4) * (1 - e((T - T1 + 1.0) / 0.4));
      const logoA2 = e((T - LA - 1.3) / 0.4);
      const logoA = Math.max(logoA1, logoA2);
      if (logoA > 0.01) {
        const cy = logoA2 > logoA1 ? 700 : 820;
        const sz = logoA2 > logoA1 ? 560 : 620;
        logoTile(ctx, logo, CX, cy, sz, { alpha: logoA, sweep: (T - (logoA2 > logoA1 ? LA + 1.3 : R0 + 1.2)) / 0.7 });
      }
      if (T > R0 + 1.1 && T < R0 + 1.6) burst(ctx, T - R0 - 1.1, CX, 820, { seed: 'snap', n: 34, colors: [C.gold, '#fff', '#7C5CFF'], speed: 1400, gravity: 700, size: 10, life: 1.2, shape: 'spark' });

      // ---- carousel card
      if (cardA > 0.01) {
        const tl = TOOLS[act];
        const lt = T - Math.max(toolStarts[act] - 0.2, 0);
        const cw = 700;
        const ch = 560;
        const cx = CX;
        const cy = 900;
        const pop = 0.92 + 0.08 * ease.outBack(clamp(lt / 0.4));
        ctx.save();
        ctx.globalAlpha = cardA;
        ctx.translate(cx, cy);
        ctx.scale(pop, pop);
        ctx.rotate(Math.sin(T * 0.8) * 0.012);
        const glow = ctx.createRadialGradient(0, 0, 200, 0, 0, 640);
        glow.addColorStop(0, rgba(tl.color, 0.35));
        glow.addColorStop(1, rgba(tl.color, 0));
        ctx.fillStyle = glow;
        ctx.fillRect(-700, -700, 1400, 1400);
        softShadow(ctx, -cw / 2, -ch / 2, cw, ch, 48, { spread: 60, alpha: 0.5, dy: 40, color: '#000000' });
        ctx.fillStyle = '#FFFFFF';
        rr(ctx, -cw / 2, -ch / 2, cw, ch, 48);
        ctx.fill();
        iconTile(ctx, tl.icon, -cw / 2 + 80, -ch / 2 + 80, 76, tl.color);
        label(ctx, tl.name, -cw / 2 + 140, -ch / 2 + 80, { size: 38, weight: 800, align: 'left' });
        pill(ctx, cw / 2 - 90, -ch / 2 + 80, 'FREE', { size: 24, bg: rgba(tl.color, 0.14), fg: darken(tl.color, 0.25), shadow: false });
        ctx.fillStyle = '#EEECE7';
        ctx.fillRect(-cw / 2 + 40, -ch / 2 + 150, cw - 80, 2);
        ctx.save();
        ctx.beginPath();
        rr(ctx, -cw / 2, -ch / 2, cw, ch, 48);
        ctx.clip();
        DEMOS[act](ctx, -cw / 2 + 60, -ch / 2 + 180, cw - 120, ch - 220, lt);
        ctx.restore();
        ctx.restore();
      }

      // ---- safe: glass shield with the tiles in orbit
      const sh = e((T - SF + 0.2) / 0.7) * (1 - e((T - WK + 0.3) / 0.5));
      if (sh > 0.01) {
        const sc = 300 * (0.6 + 0.4 * ease.outBack(clamp((T - SF + 0.2) / 0.8)));
        ctx.save();
        ctx.globalAlpha = sh;
        const sg = ctx.createRadialGradient(CX, 930, 50, CX, 930, 520);
        sg.addColorStop(0, 'rgba(18,183,106,0.45)');
        sg.addColorStop(1, 'rgba(18,183,106,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(0, 300, W, 1300);
        shieldPath(ctx, CX, 930, sc);
        const g = ctx.createLinearGradient(CX - sc, 930 - sc, CX + sc, 930 + sc);
        g.addColorStop(0, 'rgba(120,255,190,0.55)');
        g.addColorStop(1, 'rgba(10,120,80,0.75)');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = 'rgba(200,255,225,0.9)';
        ctx.lineWidth = 8;
        ctx.stroke();
        icon(ctx, 'lock', CX, 930, sc * 0.9, { color: '#FFFFFF', lw: 9 });
        ctx.restore();
        const chips = [['Encrypted in transit', 'lock', s.word('safe', 'encrypted')], ['No bank connection', 'unlink', s.word('safe', 'bank')], ['Nothing reads your accounts', 'shield', s.word('safe', 'nothing')]];
        chips.forEach(([n, ic, at], i) => {
          const q = ease.outBack(clamp((T - s.start - at + 0.1) / 0.35));
          if (q <= 0) return;
          const y = 1440 + i * 100;
          ctx.save();
          ctx.globalAlpha = sh * clamp(q);
          ctx.translate(CX, y);
          ctx.scale(q, q);
          ctx.font = '700 34px Geist';
          const tw = ctx.measureText(n).width + 140;
          ctx.fillStyle = 'rgba(255,255,255,0.1)';
          rr(ctx, -tw / 2, -40, tw, 80, 40);
          ctx.fill();
          ctx.strokeStyle = 'rgba(140,255,200,0.5)';
          ctx.lineWidth = 2;
          ctx.stroke();
          icon(ctx, ic, -tw / 2 + 50, 0, 40, { color: '#8CFFC8', lw: 11 });
          label(ctx, n, -tw / 2 + 86, 0, { size: 34, weight: 700, color: '#fff', align: 'left' });
          ctx.restore();
        });
      }
      // ---- tiles: front layer
      posAll.filter((o) => o.p.z >= 0.6).sort((a, b) => a.p.z - b.p.z).forEach(({ tl, k, p }) => tile(ctx, tl, p.x, p.y, p.s, p.a, p.q, inCarousel && k === act ? 1 : 0.5));
      if (inCarousel) {
        const tl = TOOLS[act];
        const q = ease.outBack(clamp((T - toolStarts[act] + 0.1) / 0.4)) * cardA;
        if (q > 0.01) {
          ctx.save();
          ctx.translate(CX, 1585);
          ctx.scale(q, q);
          ctx.font = '800 54px Geist';
          const tw = ctx.measureText(tl.name).width + 100;
          ctx.fillStyle = tl.color;
          rr(ctx, -tw / 2, -54, tw, 108, 54);
          ctx.fill();
          label(ctx, tl.name, 0, 3, { size: 54, weight: 800, color: '#fff' });
          ctx.restore();
          label(ctx, `${act + 1} / 8`, CX, 1700, { size: 30, weight: 700, color: 'rgba(255,255,255,0.55)', alpha: cardA });
        }
      }

      // orbiting tiles on top of the shield (front half)
      // (they are part of posAll; the shield is drawn after the back half for depth)

      // ---- cadence: weekly safety, monthly improvements
      const cd = e((T - WK + 0.1) / 0.6) * (1 - e((T - WY + 0.2) / 0.5));
      if (cd > 0.01) {
        ctx.save();
        ctx.globalAlpha = cd;
        // weekly: four weeks, a shield lands on each
        for (let i = 0; i < 4; i++) {
          const x = CX + (i - 1.5) * 235;
          const y = 740;
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          rr(ctx, x - 108, y - 140, 216, 280, 34);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.18)';
          ctx.lineWidth = 2;
          ctx.stroke();
          label(ctx, `WEEK ${i + 1}`, x, y - 80, { size: 24, weight: 800, color: 'rgba(255,255,255,0.6)', ls: 0.12 });
          const q = ease.outBack(clamp((T - WK - 0.4 - i * 0.35) / 0.35), 2);
          if (q > 0) {
            ctx.save();
            ctx.translate(x, y + 20);
            ctx.scale(q, q);
            shieldPath(ctx, 0, 0, 70);
            ctx.fillStyle = '#12B76A';
            ctx.fill();
            icon(ctx, 'check', 0, 2, 66, { color: '#fff', lw: 14 });
            ctx.restore();
          }
        }
        label(ctx, 'Safety & privacy update', CX, 950, { size: 32, weight: 700, color: 'rgba(255,255,255,0.75)' });
        // monthly: a year ring lighting up month by month
        const mq = e((T - MO + 0.2) / 0.5);
        const months = 'JFMAMJJASOND';
        for (let m = 0; m < 12; m++) {
          const a = -Math.PI / 2 + (m / 12) * Math.PI * 2;
          const x = CX + Math.cos(a) * 270;
          const y = 1420 + Math.sin(a) * 270;
          const on = T > MO + 0.1 + m * 0.11;
          ctx.globalAlpha = cd * mq;
          sphere(ctx, x, y, on ? 42 : 32, on ? '#0A84FF' : '#3A3A55', { shadow: false });
          label(ctx, months[m], x, y + 1, { size: 30, weight: 800, color: '#fff' });
          if (on && T < MO + 0.1 + m * 0.11 + 0.5) burst(ctx, T - (MO + 0.1 + m * 0.11), x, y, { seed: 'm' + m, n: 8, colors: ['#8EC5FF', '#fff'], speed: 400, gravity: 300, size: 6, life: 0.5, shape: 'spark' });
        }
        ctx.globalAlpha = cd * mq;
        label(ctx, '+ new', CX, 1400, { size: 64, weight: 900, color: '#fff' });
        label(ctx, 'every month', CX, 1466, { size: 34, weight: 700, color: 'rgba(255,255,255,0.7)' });
        ctx.restore();
      }

      // ---- launch: date + sign-off
      if (T > LA + 0.8) {
        const wq = ease.outQuint(clamp((T - LA - 0.9) / 0.6));
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 1010, W, 170);
        ctx.clip();
        wordmark(ctx, CX, 1095 + (1 - wq) * 170, 140, { dark: true });
        ctx.restore();
        label(ctx, 'COMING', CX, 1250, { size: 34, weight: 800, color: 'rgba(255,255,255,0.7)', ls: 0.3, alpha: e((T - s.start - s.word('launch', 'coming')) / 0.4) });
        const d1 = clamp((T - s.start - s.word('launch', 'october') + 0.1) / 0.5);
        const d2 = clamp((T - s.start - s.word('launch', 'fourteenth') + 0.05) / 0.5);
        if (d1 > 0 || d2 > 0) {
          flap(ctx, CX - 150, 1430, 250, 260, d2 > 0 ? '14' : '··', Math.max(d2, 0.01));
          flap(ctx, CX + 150, 1430, 250, 260, 'OCT', d1);
          if (d2 > 0) burst(ctx, T - s.start - s.word('launch', 'fourteenth'), CX, 1430, { seed: 'date', n: 40, colors: [C.gold, '#fff', '#7C5CFF'], speed: 1500, gravity: 900, size: 11, life: 1.4, shape: 'rect' });
        }
      }
      if (T > EN - 0.2) {
        const q = ease.outBack(clamp((T - EN + 0.2) / 0.45));
        ctx.save();
        ctx.translate(CX, 1680);
        ctx.scale(q, q);
        if (variant === 'domain') {
          const tw = 520;
          const g = ctx.createLinearGradient(-tw / 2, 0, tw / 2, 0);
          g.addColorStop(0, '#7C5CFF');
          g.addColorStop(1, '#0A84FF');
          ctx.fillStyle = g;
          rr(ctx, -tw / 2, -56, tw, 112, 56);
          ctx.fill();
          label(ctx, 'finatrix.co', 0, 3, { size: 56, weight: 800, color: '#fff' });
        } else {
          icon(ctx, 'calendar', -200, 0, 70, { color: C.gold, lw: 9 });
          label(ctx, 'Mark the date', 30, 2, { size: 56, weight: 800, color: '#fff' });
        }
        ctx.restore();
        label(ctx, '8 free money tools · Educational, not financial advice', CX, 1800, { size: 26, weight: 600, color: 'rgba(255,255,255,0.5)', alpha: clamp(q) });
      }

      // ---- words
      const head = (id, markup, o = {}) => {
        const Lr = s.line(id);
        const out = o.out != null ? o.out - s.start : null;
        kinetic(ctx, markup, CX, o.y ?? 300, T - s.start, { size: o.size ?? 84, color: '#FFFFFF', accent: o.accent ?? '#FFD27A', t0: (o.at ?? Lr.s) - 0.05, span: o.span ?? Lr.d * 0.7, out, anim: o.anim ?? 'rise', maxW: 940 });
      };
      if (T < R0 + 0.2) {
        head('hook', 'Eight money questions decide how *free* you’ll be.', { out: tS('hook2') - 0.25, size: 88 });
        head('hook2', 'Most of us never *answer* them.', { out: R0 - 0.2, size: 88 });
      }
      if (T > R0 - 0.3 && T < T1 + 0.2) {
        head('reveal', '_FinatriX_ answers *all eight.*', { out: T1 - 0.4, accent: C.gold, size: 92 });
        const fq = ease.outBack(clamp((T - s.start - s.word('reveal', 'free')) / 0.4));
        if (fq > 0 && T < T1 - 0.3) {
          ctx.save();
          ctx.translate(CX, 1300);
          ctx.scale(fq, fq);
          pill(ctx, 0, 0, 'Free. All eight.', { size: 44, bg: C.gold, fg: C.ink });
          ctx.restore();
        }
      }
      if (T > T1 - 0.4 && T < SF) {
        TOOLS.forEach((_, i) => {
          const next = i < 7 ? toolStarts[i + 1] - 0.35 : SF - 0.3;
          head('t' + (i + 1), QUESTIONS[i], { out: next, accent: lighten(TOOLS[i].color, 0.25), size: 80, span: 0.8 });
        });
      }
      if (T > SF - 0.3 && T < WK) head('safe', 'Safe and secure, *by design.*', { out: WK - 0.3, accent: '#8CFFC8', span: 0.7 });
      if (T > WK - 0.3 && T < WY) {
        head('weekly', 'Every week: *safety & privacy* updates.', { out: MO - 0.3, accent: '#8CFFC8', size: 76 });
        head('monthly', 'Every month: *new improvements.*', { out: WY - 0.3, accent: '#8EC5FF', size: 76, y: 300 });
      }
      if (T > WY - 0.3 && T < LA) head('why', 'Stability *today.* Freedom *tomorrow.*', { out: LA - 0.3, accent: '#FFD27A', size: 86, span: 1.6 });
    }

    const sc = (at, mood, sfx) => ({ at, mood, trans: 'cut', push: 0, grain: 1.3, draw, sfx });
    const rel = (s, abs) => abs - s.start;
    return [
      sc('hook', 'intro', (s) => [[0.05, 'riser', 0.5], ...TOOLS.map((_, k) => [0.1 + k * 0.08, 'pop', 0.25])]),
      sc('reveal', 'drop', (s) => [[0.0, 'whoosh', 0.8], [0.9, 'impact', 0.6], [1.1, 'chime', 0.8], [1.2, 'sparkle', 0.6], [s.word('reveal', 'free'), 'pop', 0.7]]),
      sc('t1', 'groove', (s) => toolStarts.map((ts, i) => [rel(s, ts) - 0.45, 'swoosh', i ? 0.5 : 0.3]).concat(toolStarts.map((ts) => [rel(s, ts), 'pop', 0.5]))),
      sc('safe', 'warm', (s) => [[0.0, 'swell', 0.6], [0.4, 'click', 0.8], [s.word('safe', 'encrypted'), 'pop', 0.5], [s.word('safe', 'bank'), 'pop', 0.5], [s.word('safe', 'nothing'), 'pop', 0.5]]),
      sc('weekly', 'warm', (s) => [0, 1, 2, 3].map((i) => [0.4 + i * 0.35, 'tick', 0.7]).concat([[rel(s, MO), 'sparkle', 0.6]])),
      sc('why', 'lift', (s) => [[0.1, 'swell', 0.6], [0.4, 'birds', 0.3]]),
      sc('launch', 'lift', (s) => [[0.3, 'whoosh', 0.6], [1.3, 'chime', 0.8], [s.word('launch', 'october'), 'flip', 0.9], [s.word('launch', 'fourteenth'), 'flip', 0.9], [s.word('launch', 'fourteenth') + 0.05, 'impact', 0.7], [s.word('launch', 'fourteenth') + 0.1, 'confetti', 0.6]]),
      sc('end', 'outro', (s) => [[0.0, 'ding', 0.7]]),
    ];
  };
}

export default makeLaunch('domain');
