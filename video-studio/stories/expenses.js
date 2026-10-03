// Expense Tracker — numbers from TOOL_GUIDES.expenses.worked (₹4,000 guessed vs ₹11,200 logged, 34 orders).
import { W, H, C, clamp, lerp, ease, spring, inr, rng, lighten, darken, rgba } from '../engine/core.js';
import { rr, softShadow, sphere, bubbles, burst, critter, floorShadow, stamp, pill, tabular, embossText, ring, bgPaper } from '../engine/draw.js';
import { kinetic, label } from '../engine/text.js';
import { icon, iconTile } from '../engine/icons.js';
import { appWindow, field, chip, phone } from '../engine/ui.js';
import { hookScene, slamScene, questionScene, nightScene, revealScene, morningScene, taglineScene, endScene, tracker } from '../engine/scenes.js';
import { floatDelta, blink, countTo, headlines, paper, popSphere, HEAD_Y } from '../engine/kit.js';

const ACCENT = '#1FAE5A';
const FOOD = '#FF7A1A';
const SUB = '#7C5CFF';

function hookCard(ctx, w, h, t) {
  iconTile(ctx, 'food', 92, 96, 84, FOOD);
  label(ctx, 'Food delivery', 156, 80, { size: 38, weight: 700, align: 'left' });
  label(ctx, 'My estimate', 156, 122, { size: 28, weight: 600, color: C.mute, align: 'left' });
  const nw = tabular(ctx, '₹4,000', 56, 270, 140, { align: 'left', weight: 800 });
  label(ctx, '/ month', 56 + nw + 18, 300, { size: 40, weight: 600, color: C.mute, align: 'left' });
  // a confident little flat sparkline
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 20; i++) {
    const x = 56 + i * ((w - 112) / 20);
    const y = 430 + Math.sin(i * 0.9 + t) * 6;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.stroke();
  pill(ctx, w - 150, 80, 'Feels right', { size: 26, bg: '#EAF8EF', fg: darken(ACCENT, 0.2), shadow: false });
}

/** 4-week grid, cells filling with orders. */
function weekGrid(ctx, x, y, cell, t, t0, { orders = 34, alpha = 1, scale = 1 } = {}) {
  const R = rng('orders');
  const days = Array.from({ length: 28 }, () => 0);
  for (let i = 0; i < orders; i++) {
    // weekends and late weeknights get more orders
    let d;
    do d = Math.floor(R() * 28);
    while (d % 7 < 3 && R() < 0.55);
    days[d]++;
  }
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const fill = clamp((t - t0) / 1.6);
  let shown = 0;
  ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((d, i) => label(ctx, d, i * cell + cell / 2, -34, { size: 24, weight: 700, color: C.mute }));
  for (let i = 0; i < 28; i++) {
    const cx = (i % 7) * cell;
    const cy = Math.floor(i / 7) * cell;
    const on = i / 28 < fill;
    ctx.fillStyle = on ? '#FFFFFF' : '#ECEAE4';
    rr(ctx, cx + 6, cy + 6, cell - 12, cell - 12, 18);
    ctx.fill();
    if (on) {
      for (let k = 0; k < days[i]; k++) {
        const q = ease.outBack(clamp((fill - i / 28) * 10 - k * 0.3));
        ctx.fillStyle = FOOD;
        ctx.beginPath();
        ctx.arc(cx + 26 + (k % 2) * 30, cy + 26 + Math.floor(k / 2) * 30, 11 * q, 0, Math.PI * 2);
        ctx.fill();
        shown++;
      }
    }
  }
  ctx.restore();
  return shown;
}

function bag(ctx, x, y, s, rot = 0, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  const g = ctx.createLinearGradient(0, -40, 0, 50);
  g.addColorStop(0, lighten(FOOD, 0.25));
  g.addColorStop(1, darken(FOOD, 0.1));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-40, -20);
  ctx.lineTo(40, -20);
  ctx.lineTo(34, 50);
  ctx.lineTo(-34, 50);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = darken(FOOD, 0.35);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-16, -20);
  ctx.bezierCurveTo(-16, -50, 16, -50, 16, -20);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(-20, 6, 40, 10);
  ctx.restore();
}

function subCard(ctx, x, y, name, color, asleep, t, alpha = 1, rot = 0) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  softShadow(ctx, -110, -140, 220, 280, 32, { spread: 24, alpha: 0.16, dy: 14, steps: 4 });
  ctx.fillStyle = asleep ? '#F0EEE9' : '#FFFFFF';
  rr(ctx, -110, -140, 220, 280, 32);
  ctx.fill();
  const r = 56;
  critter(ctx, 0, -40 - r * 0.2, r, asleep ? mixGrey(color) : color, { look: [0, 0.2], blink: asleep ? 1 : blink(t, name.length), mouth: asleep ? { type: 'flat' } : { type: 'smile' }, shadow: false });
  label(ctx, name, 0, 70, { size: 26, weight: 700, color: asleep ? C.mute : C.ink });
  label(ctx, asleep ? 'unused' : 'active', 0, 106, { size: 22, weight: 700, color: asleep ? C.loss : ACCENT });
  if (asleep) {
    const z = (t * 0.8) % 1;
    label(ctx, 'z', 52 + z * 30, -120 - z * 50, { size: 30 + z * 16, weight: 800, color: C.mute, alpha: 1 - z });
  }
  ctx.restore();
}
const mixGrey = (c) => lighten(darken(c, 0.25), 0.45);

export default function story({ timeline, logo }) {
  const L = Object.fromEntries(timeline.lines.map((l) => [l.id, l]));
  const hookDur = L.lie.start - 0.12;

  return [
    hookScene({ text: 'You think delivery costs you *₹4,000* a month.', card: hookCard, accent: ACCENT, size: 84 }),
    slamScene({ pre: "You're", word: 'LYING.', needle: 'lying', sub: 'to yourself.', card: hookCard, accent: ACCENT, hookDur }),

    // ---- four weeks of logging → the real number
    {
      at: 'lands',
      trans: 'whip',
      mood: 'tension',
      draw(ctx, s) {
        const { t } = s;
        paper(ctx, t, ACCENT, 'grid');
        const ln = s.line('lands');
        const gn = s.line('gone');
        const toBall = ease.inOutCubic(clamp((t - gn.s + 0.3) / 0.5));
        const shown = weekGrid(ctx, W / 2 - 3.5 * 130, 700, 130, t, ln.s + 0.3, { alpha: 1 - toBall });
        if (toBall < 0.05) label(ctx, `${shown} orders logged`, W / 2, 1300, { size: 44, weight: 800, color: FOOD });
        // the estimate balloons into the real number
        if (t > gn.s - 0.35) {
          const v = countTo(t, gn.s, gn.d * 0.8, 4000, 11200);
          const k = v / 11200;
          const r = lerp(150, 290, k);
          const p = spring(t - gn.s + 0.35, 10, 0.5);
          critter(ctx, W / 2, 1180 - r * p, r * p, FOOD, { look: [0, -0.3], blink: 0, mouth: { type: 'o', open: k }, eyeScale: 0.8 + 0.5 * k, shadowY: 1200, sx: 1 + 0.04 * Math.sin(t * 9) * k });
          embossText(ctx, inr(Math.round(v / 100) * 100), W / 2, 1180 - r * p + r * 0.62 * p, 66 * p, { max: r * 1.4 });
          burst(ctx, t - gn.e, W / 2, 1180 - r, { seed: 'pop', n: 26, colors: [FOOD, '#fff', C.gold], speed: 1300, gravity: 1200, size: 10, life: 1, shape: 'spark' });
        }
        headlines(ctx, s, [['lands', 'Log it for *four weeks.*'], ['gone', '*₹11,200.*', { size: 150 }]], { accent: ACCENT });
        if (t > gn.s + 0.4) label(ctx, 'not ₹4,000', W / 2, 520, { size: 44, weight: 700, color: C.mute, alpha: ease.outCubic(clamp((t - gn.s - 0.4) / 0.4)) });
      },
      sfx: (s) => [[s.line('lands').s + 0.3, 'type', 0.7], [s.line('lands').s + 1.0, 'type', 0.6], [s.line('gone').s - 0.3, 'pop', 0.8], [s.line('gone').s, 'riser', 0.5], [s.line('gone').e, 'impact', 0.6]],
    },

    questionScene({ text: 'But *how?*', accent: FOOD, size: 110 }),

    // ---- no splurge: small orders, many of them; and sleeping subscriptions
    {
      at: 'l1',
      trans: 'whip',
      mood: 'groove',
      draw(ctx, s) {
        const { t } = s;
        paper(ctx, t, ACCENT, 'orders');
        const [a, b, c, d] = ['l1', 'l2', 'l3', 'l4'].map((id) => s.line(id));
        // receipts
        const recOut = ease.inCubic(clamp((t - c.s + 0.3) / 0.4));
        const receipts = [
          { at: a.s + 0.05, x: 290, title: 'Biggest order', v: '₹890' },
          { at: b.s + 0.05, x: 790, title: 'Typical order', v: '₹310' },
        ];
        receipts.forEach((r, i) => {
          if (t < r.at - 0.2) return;
          const p = spring(t - r.at + 0.2, 11, 0.5);
          ctx.save();
          ctx.translate(r.x + (i ? 1 : -1) * recOut * 900, 1080 + recOut * 200);
          ctx.rotate((i ? 0.06 : -0.06) * p + (i ? 1 : -1) * recOut * 0.6);
          ctx.scale(p * 1.18, p * 1.18);
          softShadow(ctx, -190, -260, 380, 520, 30, { spread: 30, alpha: 0.16, dy: 20 });
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.moveTo(-190, -260);
          ctx.lineTo(190, -260);
          for (let k = 0; k <= 10; k++) ctx.lineTo(190 - k * 38, 260 + (k % 2 ? -16 : 0));
          ctx.closePath();
          ctx.fill();
          iconTile(ctx, 'food', 0, -170, 90, FOOD);
          label(ctx, r.title, 0, -60, { size: 32, weight: 700, color: C.mute });
          tabular(ctx, r.v, 0, 40, 110, { weight: 900 });
          ctx.setLineDash([8, 10]);
          ctx.strokeStyle = C.line;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(-150, 130);
          ctx.lineTo(150, 130);
          ctx.stroke();
          ctx.setLineDash([]);
          label(ctx, i ? 'median' : 'not crazy', 0, 185, { size: 30, weight: 700, color: ACCENT });
          ctx.restore();
        });
        // 34 bags rain into a pile
        const rainT = c.s - 0.1;
        let landed = 0;
        if (t > rainT) {
          const R = rng('bags');
          for (let i = 0; i < 34; i++) {
            const delay = i * 0.045;
            const col = i % 7;
            const row = Math.floor(i / 7);
            const tx = W / 2 + (col - 3) * 118 + (row % 2) * 30;
            const ty = 1560 - row * 104;
            const fall = clamp((t - rainT - delay) / 0.5);
            if (fall <= 0) continue;
            const y = lerp(-200, ty, ease.outBounce ? fall : ease.inQuad(fall));
            const fade = 1 - ease.inCubic(clamp((t - d.s + 0.2) / 0.4)) * 0.85;
            bag(ctx, tx, fall < 1 ? lerp(-200, ty, ease.inQuad(fall)) : ty, 1.1, (R() - 0.5) * 0.4, fade);
            if (fall >= 1) landed++;
          }
          const cq = ease.outBack(clamp((t - rainT) / 0.3));
          const cFade = 1 - ease.inCubic(clamp((t - d.s + 0.2) / 0.4));
          ctx.save();
          ctx.globalAlpha = cFade;
          ctx.translate(W / 2, 760);
          ctx.scale(cq, cq);
          tabular(ctx, String(Math.max(1, landed)), 0, 0, 300, { weight: 900, color: FOOD });
          ctx.restore();
          label(ctx, 'orders', W / 2, 920, { size: 48, weight: 700, color: C.ink2, alpha: cq * (1 - ease.inCubic(clamp((t - d.s + 0.2) / 0.4))) });
        }
        // subscriptions fan out
        if (t > d.s - 0.15) {
          const subs = [['Music', false], ['Video', true], ['Cloud', false], ['Gym app', true], ['News', false], ['Games', true], ['Video 2', false]];
          subs.forEach(([n, asleep], i) => {
            const q = spring(t - d.s - i * 0.07, 10, 0.55);
            const ang = (i % 2 ? 1 : -1) * 0.035;
            const x = i < 4 ? W / 2 + (i - 1.5) * 250 : W / 2 + (i - 5) * 250;
            const y = i < 4 ? 900 : 1280;
            const sleepT = s.word('l4', 'three');
            ctx.save();
            ctx.translate(x, y + (1 - q) * 900);
            ctx.scale(1.02, 1.02);
            subCard(ctx, 0, 0, n, SUB, asleep && t > sleepT, t, 1, ang * q);
            ctx.restore();
          });
        }
        headlines(ctx, s, [
          ['l1', 'Biggest order? *₹890.*'],
          ['l2', 'Typical? *₹310.*'],
          ['l3', 'There were *34* of them.'],
          ['l4', '7 subscriptions. *3 unused.*'],
        ], { accent: FOOD, y: 330 });
      },
      sfx: (s) => [
        [s.word('l1', 'biggest') - 0.2, 'slide', 0.6], [s.word('l2', 'typical') - 0.2, 'slide', 0.6],
        ...Array.from({ length: 12 }, (_, i) => [s.line('l3').s - 0.1 + 0.4 + i * 0.13, 'pop', 0.35]),
        [s.line('l4').s, 'whoosh', 0.6], [s.word('l4', 'three'), 'sad', 0.5],
      ],
    },

    nightScene({
      text: 'Cash and UPI? No statement *remembers* them.',
      accent: ACCENT,
      content(ctx, s) {
        const { t } = s;
        const R = rng('ghosts');
        for (let i = 0; i < 9; i++) {
          const x = 140 + R() * 800;
          const y0 = 900 + R() * 800;
          const y = y0 - t * (60 + R() * 60);
          const a = clamp(1 - t / 3.2 + R() * 0.3) * 0.9;
          const name = i % 3 === 0 ? 'qr' : 'cash';
          icon(ctx, name, x, y, 120 + R() * 60, { color: `rgba(190,255,215,${a})`, lw: 6, rot: (R() - 0.5) * 0.6 });
          if (i % 2 === 0) label(ctx, ['₹120', '₹60', '₹450', '₹35', '₹200'][i % 5], x, y + 100, { size: 34, weight: 700, color: `rgba(190,255,215,${a * 0.8})` });
        }
        // the statement with blank rows
        const p = spring(t - 0.4, 9, 0.6);
        ctx.save();
        ctx.translate(W / 2, lerp(2300, 1350, p));
        ctx.rotate(-0.04);
        ctx.fillStyle = '#F4F2EC';
        rr(ctx, -300, -260, 600, 520, 24);
        ctx.fill();
        label(ctx, 'Bank statement', -250, -205, { size: 30, weight: 800, align: 'left' });
        for (let k = 0; k < 6; k++) {
          const y = -140 + k * 66;
          const blank = k % 2 === 1;
          ctx.fillStyle = blank ? 'rgba(239,65,53,0.12)' : '#E2DFD7';
          rr(ctx, -250, y, blank ? 500 : 320, 34, 10);
          ctx.fill();
          if (blank) label(ctx, 'missing', 0, y + 17, { size: 22, weight: 700, color: C.loss });
        }
        ctx.restore();
      },
    }),

    revealScene({ toolName: 'Expense Tracker', accent: ACCENT, logo }),

    // ---- log as you go; frequent categories float to the front
    {
      at: 'split',
      trans: 'zoom',
      mood: 'drop',
      draw(ctx, s) {
        const { t } = s;
        bgPaper(ctx, ACCENT);
        const sp = s.line('split');
        const gp = s.line('gap');
        const enter = spring(t - 0.05, 10, 0.6);
        const box = appWindow(ctx, 70, lerp(H, 500, enter), 940, 1000, { title: 'Expense Tracker', accent: ACCENT, iconName: 'receipt' });
        const toMonth = ease.inOutCubic(clamp((t - gp.s + 0.1) / 0.5));
        ctx.save();
        ctx.globalAlpha = 1 - toMonth;
        const typeAt = sp.s + 0.3;
        const amt = '₹310'.slice(0, Math.floor(clamp((t - typeAt) * 10, 0, 4)));
        field(ctx, box.x, box.y, box.w, 'Amount', amt || ' ', { focus: t > typeAt - 0.1 && t < typeAt + 0.8 ? 1 : 0, accent: ACCENT });
        label(ctx, 'Category', box.x, box.y + 200, { size: 26, weight: 600, color: C.mute, align: 'left', baseline: 'top' });
        // chips reorder: Food delivery jumps to the front
        const cats = ['Groceries', 'Transport', 'Bills', 'Food delivery', 'Shopping'];
        const before = [0, 1, 2, 3, 4];
        const after = [3, 0, 1, 2, 4];
        const fr = s.word('split', 'frequent');
        const rp = ease.inOutCubic(clamp((t - fr) / 0.6));
        ctx.font = '700 28px Geist';
        const widths = cats.map((c) => ctx.measureText(c).width + 28 * 1.6);
        const posOf = (order, idx) => {
          let x = 0;
          let y = 0;
          for (const j of order) {
            if (x + widths[j] > box.w) {
              x = 0;
              y += 90;
            }
            if (j === idx) return [x, y];
            x += widths[j] + 16;
          }
          return [0, 0];
        };
        cats.forEach((c, i) => {
          const [ax, ay] = posOf(before, i);
          const [bx, by] = posOf(after, i);
          const x = lerp(ax, bx, rp);
          const y = lerp(ay, by, rp) - (i === 3 ? Math.sin(rp * Math.PI) * 60 : 0);
          chip(ctx, box.x + x + widths[i] / 2, box.y + 280 + y, c, { on: i === 3 ? clamp(rp * 2) : 0, accent: FOOD, size: 28 });
        });
        if (rp > 0.9) label(ctx, '★ frequent', box.x + widths[3] / 2, box.y + 340, { size: 22, weight: 700, color: FOOD });
        // logged entries list
        const rows = [['Food delivery', '₹310', 'Fri 9:42 pm'], ['Food delivery', '₹245', 'Thu 10:15 pm'], ['Groceries', '₹1,180', 'Thu 6:02 pm']];
        rows.forEach((r, i) => {
          const q = ease.outCubic(clamp((t - fr - 0.6 - i * 0.12) / 0.4));
          const y = box.y + 480 + i * 110;
          ctx.save();
          ctx.globalAlpha *= q;
          ctx.fillStyle = '#F7F6F3';
          rr(ctx, box.x, y, box.w, 92, 22);
          ctx.fill();
          iconTile(ctx, r[0] === 'Groceries' ? 'cart' : 'food', box.x + 50, y + 46, 56, r[0] === 'Groceries' ? '#2E90FA' : FOOD);
          label(ctx, r[0], box.x + 100, y + 32, { size: 28, weight: 700, align: 'left' });
          label(ctx, r[2], box.x + 100, y + 64, { size: 22, weight: 600, color: C.mute, align: 'left' });
          label(ctx, r[1], box.x + box.w - 28, y + 46, { size: 32, weight: 800, align: 'right' });
          ctx.restore();
        });
        ctx.restore();
        // month view: pattern, not total
        if (toMonth > 0) {
          ctx.save();
          ctx.globalAlpha = toMonth;
          label(ctx, 'October · by pattern', box.x, box.y + 10, { size: 30, weight: 800, align: 'left', baseline: 'top' });
          weekGrid(ctx, box.x + 32, box.y + 140, 118, t, gp.s - 2, { scale: 1 });
          const hl = ease.outCubic(clamp((t - s.word('gap', 'pattern')) / 0.4));
          ctx.strokeStyle = rgba(FOOD, hl);
          ctx.lineWidth = 6;
          rr(ctx, box.x + 32 + 4 * 118, box.y + 130, 3 * 118 + 4, 4 * 118 + 20, 26);
          ctx.stroke();
          label(ctx, 'Fri–Sun nights', box.x + 32 + 5.5 * 118, box.y + 640, { size: 28, weight: 800, color: FOOD, alpha: hl });
          const tot = ease.outCubic(clamp((t - s.word('gap', 'total')) / 0.4));
          ctx.globalAlpha = toMonth * (1 - 0.6 * tot);
          label(ctx, 'Total ₹11,200', box.x, box.y + 750, { size: 40, weight: 800, align: 'left' });
          ctx.restore();
        }
        headlines(ctx, s, [['split', 'Log it *as you go.*'], ['gap', 'Read the *pattern,* not the total.']], { accent: FOOD, y: 270, size: 76 });
      },
      sfx: (s) => [[0.05, 'swoosh', 0.6], [s.line('split').s + 0.3, 'type', 0.6], [s.word('split', 'frequent'), 'slide', 0.6], [s.word('split', 'frequent') + 0.55, 'pop', 0.7], [s.line('gap').s, 'swoosh', 0.5], [s.word('gap', 'pattern'), 'ding', 0.5]],
    },

    // ---- size vs frequency
    {
      at: 'stamp',
      trans: 'zoom',
      mood: 'drop',
      draw(ctx, s) {
        const { t } = s;
        paper(ctx, t, ACCENT, 'freq');
        const a1 = s.word('stamp', 'size');
        const a2 = s.word('stamp', 'frequency');
        const cards = [
          { at: a1, title: 'Size', big: '₹310', sub: 'a typical order', ok: true, y: 820 },
          { at: a2, title: 'Frequency', big: '34×', sub: 'in one month', ok: false, y: 1260 },
        ];
        cards.forEach((cd) => {
          if (t < cd.at - 0.1) return;
          const p = spring(t - cd.at + 0.1, 12, 0.5);
          ctx.save();
          ctx.translate(W / 2, cd.y);
          ctx.scale(p, p);
          softShadow(ctx, -420, -170, 840, 340, 48, { spread: 50, alpha: 0.18, dy: 30 });
          ctx.fillStyle = '#fff';
          rr(ctx, -420, -170, 840, 340, 48);
          ctx.fill();
          label(ctx, cd.title, -360, -90, { size: 40, weight: 700, color: C.mute, align: 'left' });
          tabular(ctx, cd.big, -360, 20, 150, { align: 'left', color: cd.ok ? C.ink : FOOD, weight: 900 });
          label(ctx, cd.sub, -360, 120, { size: 32, weight: 600, color: C.ink2, align: 'left' });
          iconTile(ctx, cd.ok ? 'check' : 'cross', 300, 0, 120, cd.ok ? ACCENT : C.loss);
          ctx.restore();
        });
        stamp(ctx, t - (a2 + 0.5), 760, 1090, 'THE REAL LEAK', { color: C.loss, size: 56, rot: -0.14 });
        headlines(ctx, s, [['stamp', "The problem isn't *size.*", { span: 0.9 }], ['stamp', "It's *frequency.*", { at: a2 - 0.25, span: 0.5, keep: true }]], { accent: FOOD, size: 92, y: 360 });
      },
      sfx: (s) => [[s.word('stamp', 'size') - 0.1, 'pop', 0.9], [s.word('stamp', 'frequency') - 0.1, 'pop', 1], [s.word('stamp', 'frequency') + 0.5, 'stamp', 1]],
    },

    // ---- privacy: there is no bank feed
    {
      at: 'feature',
      trans: 'whip',
      mood: 'groove',
      draw(ctx, s) {
        const { t } = s;
        paper(ctx, t, ACCENT, 'priv');
        const cut = s.word('feature', 'connection');
        const k = ease.outBack(clamp((t - 0.1) / 0.5));
        iconTile(ctx, 'bank', 230, 1040, 220 * k, '#5B6170');
        iconTile(ctx, 'receipt', 850, 1040, 220 * k, ACCENT);
        // the cable that never connects
        const snap = ease.outCubic(clamp((t - cut) / 0.35));
        ctx.save();
        ctx.strokeStyle = '#9A9AA5';
        ctx.lineWidth = 14;
        ctx.lineCap = 'round';
        ctx.setLineDash([2, 26]);
        ctx.beginPath();
        ctx.moveTo(360, 1040);
        ctx.lineTo(lerp(720, 470, snap), 1040 + snap * 60);
        ctx.moveTo(720, 1040);
        ctx.lineTo(lerp(360, 610, snap), 1040 + snap * 60);
        ctx.stroke();
        ctx.restore();
        if (t > cut) {
          burst(ctx, t - cut, W / 2, 1060, { seed: 'snap', n: 18, colors: [C.loss, '#fff'], speed: 700, gravity: 900, size: 9, life: 0.8, shape: 'spark' });
          const q = spring(t - cut - 0.1, 12, 0.5);
          ctx.save();
          ctx.translate(W / 2, 1040);
          ctx.scale(q, q);
          sphere(ctx, 0, 0, 90, C.loss, { shadow: false });
          icon(ctx, 'unlink', 0, 0, 100, { color: '#fff', lw: 10 });
          ctx.restore();
        }
        const sh = s.word('feature', 'nothing');
        const sq = spring(t - sh, 10, 0.5);
        if (t > sh) {
          ctx.save();
          ctx.translate(W / 2, 1450);
          ctx.scale(sq, sq);
          icon(ctx, 'shield', 0, 0, 220, { color: ACCENT, lw: 8, fill: '#EAF8EF' });
          ctx.restore();
          label(ctx, 'Nothing can read your accounts', W / 2, 1640, { size: 40, weight: 800, alpha: clamp(sq) });
        }
        headlines(ctx, s, [['feature', 'No bank *connection.*', { span: 0.7 }]], { accent: C.loss, size: 96, y: 380 });
      },
      sfx: (s) => [[s.word('feature', 'connection'), 'scratch', 0.6], [s.word('feature', 'connection') + 0.1, 'pop', 0.8], [s.word('feature', 'nothing'), 'chime', 0.4]],
    },

    morningScene({
      text: 'You finally know where it *all goes.*',
      accent: FOOD,
      content(ctx, s) {
        const { t } = s;
        const p = spring(t - 0.2, 9, 0.6);
        phone(ctx, 520, lerp(2300, 1090, p), 470, {
          lock: false,
          screenTop: '#FFFFFF',
          screenBot: '#F4F3EF',
          content(c, box) {
            const x = box.x + 34;
            const w = box.w - 68;
            label(c, 'October, by category', x, box.y + 120, { size: 30, weight: 800, align: 'left' });
            const rows = [['Food delivery', 11200, FOOD, 'food'], ['Groceries', 6400, '#2E90FA', 'cart'], ['Transport', 3100, '#7C5CFF', 'car'], ['Subscriptions', 2200, SUB, 'card']];
            rows.forEach(([n, v, col, ic], i) => {
              const q = ease.outCubic(clamp((t - s.word('morning', 'finally') - i * 0.15) / 0.5));
              const y = box.y + 190 + i * 140;
              c.save();
              c.globalAlpha = clamp(q * 1.5);
              iconTile(c, ic, x + 36, y + 40, 64, col);
              label(c, n, x + 86, y + 26, { size: 26, weight: 700, align: 'left' });
              label(c, inr(v), x + w, y + 26, { size: 26, weight: 800, align: 'right' });
              c.fillStyle = '#EDEBE6';
              rr(c, x + 86, y + 54, w - 86, 16, 8);
              c.fill();
              c.fillStyle = col;
              rr(c, x + 86, y + 54, (w - 86) * (v / 11200) * q, 16, 8);
              c.fill();
              c.restore();
            });
          },
        });
      },
    }),

    taglineScene({ a: 'Fewer surprises.', b: 'More *left over.*', accent: ACCENT }),
    endScene({ toolName: 'Expense Tracker', accent: ACCENT, logo, iconName: 'receipt', toolId: 'expenses' }),
  ];
}
