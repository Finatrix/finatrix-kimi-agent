// Net Worth — the four-account first month from TOOL_GUIDES.networth.worked:
// assets ₹59,70,000 − liabilities ₹32,00,000 = ₹27,70,000.
import { W, H, C, clamp, lerp, ease, spring, inr, lakhCr, rng, lighten, darken, rgba } from '../engine/core.js';
import { rr, softShadow, sphere, bubbles, burst, critter, floorShadow, stamp, pill, tabular, embossText, ring, bgPaper } from '../engine/draw.js';
import { kinetic, label } from '../engine/text.js';
import { icon, iconTile } from '../engine/icons.js';
import { appWindow, lineChart, phone, chip } from '../engine/ui.js';
import { hookScene, slamScene, questionScene, nightScene, revealScene, morningScene, taglineScene, endScene } from '../engine/scenes.js';
import { blink, countTo, headlines, paper, HEAD_Y } from '../engine/kit.js';

const ACCENT = '#0EA5A5';
const DEBT = '#C2413A';
const OWN = [
  { n: 'Salary account', v: 140000, short: '₹1.4 L', c: '#2E90FA', ic: 'bank' },
  { n: 'Equity mutual funds', v: 620000, short: '₹6.2 L', c: '#7C5CFF', ic: 'chart' },
  { n: 'EPF balance', v: 410000, short: '₹4.1 L', c: '#F5A524', ic: 'shield' },
  { n: 'Flat, conservatively valued', v: 4800000, short: '₹48 L', c: ACCENT, ic: 'house' },
];
const LOAN = 3200000;
const ASSETS = 5970000;
const NET = 2770000;

function hookCard(ctx, w, h, t) {
  iconTile(ctx, 'bank', 92, 96, 84, '#2E90FA');
  label(ctx, 'Salary account', 156, 80, { size: 38, weight: 700, align: 'left' });
  label(ctx, 'Available balance', 156, 122, { size: 28, weight: 600, color: C.mute, align: 'left' });
  tabular(ctx, '₹1,40,000', 56, 270, 130, { align: 'left', weight: 800 });
  const q = ease.outBack(clamp((t - 1.0) / 0.4));
  if (q > 0) {
    ctx.save();
    ctx.translate(w / 2, 430);
    ctx.scale(q, q);
    ctx.fillStyle = '#E6F6F6';
    rr(ctx, -330, -50, 660, 100, 50);
    ctx.fill();
    label(ctx, '= what I’m worth?', 0, 0, { size: 38, weight: 800, color: darken(ACCENT, 0.25) });
    ctx.restore();
  }
}

/** Balance scale. tilt in radians (+ = left pan down). Returns pan centres. */
function scale(ctx, cx, cy, tilt, { beam = 330, drop = 250, alpha = 1, dark = false } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  const col = dark ? 'rgba(255,255,255,0.85)' : '#3A3A44';
  // post
  ctx.fillStyle = col;
  rr(ctx, cx - 14, cy, 28, 820, 14);
  ctx.fill();
  rr(ctx, cx - 160, cy + 800, 320, 34, 17);
  ctx.fill();
  const lx = cx - Math.cos(tilt) * beam;
  const ly = cy + Math.sin(tilt) * beam;
  const rx = cx + Math.cos(tilt) * beam;
  const ry = cy - Math.sin(tilt) * beam;
  ctx.strokeStyle = col;
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(lx, ly);
  ctx.lineTo(rx, ry);
  ctx.stroke();
  ctx.fillStyle = C.gold;
  ctx.beginPath();
  ctx.arc(cx, cy, 26, 0, Math.PI * 2);
  ctx.fill();
  const pans = [[lx, ly + drop], [rx, ry + drop]];
  for (const [px, py] of pans) {
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(px, py - drop);
    ctx.lineTo(px - 150, py);
    ctx.moveTo(px, py - drop);
    ctx.lineTo(px + 150, py);
    ctx.stroke();
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.9)' : '#4A4A55';
    ctx.beginPath();
    ctx.ellipse(px, py, 170, 30, 0, 0, Math.PI);
    ctx.fill();
  }
  ctx.restore();
  return pans;
}

export default function story({ timeline, logo }) {
  const L = Object.fromEntries(timeline.lines.map((l) => [l.id, l]));
  const hookDur = L.lie.start - 0.12;

  return [
    hookScene({ text: 'What are you *actually* worth?', card: hookCard, accent: ACCENT, size: 92 }),
    slamScene({ pre: 'Your bank balance is', word: 'LYING.', needle: 'lying', sub: 'to you.', card: hookCard, accent: ACCENT, hookDur }),

    // ---- one number out of five
    {
      at: 'lands',
      trans: 'whip',
      mood: 'tension',
      draw(ctx, s) {
        const { t } = s;
        paper(ctx, t, ACCENT, 'one');
        const ln = s.line('lands');
        const gn = s.line('gone');
        const toRow = ease.inOutCubic(clamp((t - gn.s) / 0.6));
        const p = spring(t - ln.s, 10, 0.5);
        const r = lerp(250, 90, toRow) * p;
        const x = lerp(W / 2, 140, toRow);
        const y = lerp(1040, 1060, toRow);
        if (r > 2) {
          sphere(ctx, x, y, r, '#2E90FA', { shadowY: y + r + 30 });
          embossText(ctx, '₹1.4 L', x, y, 100 * (r / 250), { max: r * 1.5, color: 'rgba(255,255,255,0.92)' });
        }
        if (toRow < 0.5) pill(ctx, W / 2, 1380, 'Salary account', { size: 32, alpha: 1 - toRow * 2 });
        // four empty slots
        for (let i = 1; i < 5; i++) {
          const q = ease.outBack(clamp((t - gn.s - 0.3 - i * 0.1) / 0.35));
          if (q <= 0) continue;
          const sx = 140 + i * 200;
          ctx.save();
          ctx.translate(sx, 1060);
          ctx.scale(q, q);
          ctx.setLineDash([12, 10]);
          ctx.strokeStyle = '#B5B2AA';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(0, 0, 90, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          label(ctx, '?', 0, 4, { size: 80, weight: 900, color: '#B5B2AA' });
          ctx.restore();
        }
        if (toRow > 0.5) label(ctx, '1 of 5', W / 2, 1260, { size: 48, weight: 900, color: darken(ACCENT, 0.2), alpha: (toRow - 0.5) * 2 });
        headlines(ctx, s, [['lands', '₹1.4 lakh in the *salary account.*', { size: 80 }], ['gone', 'One number *out of five.*']], { accent: ACCENT });
      },
      sfx: (s) => [[s.line('lands').s, 'pop', 0.8], [s.line('gone').s, 'swoosh', 0.6], ...[1, 2, 3, 4].map((i) => [s.line('gone').s + 0.3 + i * 0.1, 'pop', 0.4])],
    },

    questionScene({ text: 'What about *the rest?*', accent: ACCENT, size: 96 }),

    // ---- the scale fills: own vs owe
    {
      at: 'l1',
      trans: 'whip',
      mood: 'groove',
      draw(ctx, s) {
        const { t } = s;
        paper(ctx, t, ACCENT, 'scale');
        const [a, b, c, d] = ['l1', 'l2', 'l3', 'l4'].map((id) => s.line(id));
        const drops = [{ ...OWN[0], at: -9 }, { ...OWN[1], at: a.s }, { ...OWN[2], at: b.s }, { ...OWN[3], at: c.s }];
        let own = 0;
        drops.forEach((it) => {
          if (t > it.at + 0.45) own += it.v;
        });
        const owe = t > d.s + s.line('l4').d * 0.55 ? LOAN : 0;
        // each landing nudges the beam with a damped spring (positive = OWN side down)
        const K = 0.32 / 6000000;
        const loanAt = d.s + s.line('l4').d * 0.35 + 0.45;
        let tilt = OWN[0].v * K;
        drops.slice(1).forEach((it) => (tilt += it.v * K * spring(t - it.at - 0.45, 9, 0.35)));
        tilt -= LOAN * K * spring(t - loanAt, 9, 0.35);
        tilt += Math.sin(t * 7) * 0.004;
        const pans = scale(ctx, W / 2, 700, tilt);
        label(ctx, 'OWN', pans[0][0], pans[0][1] + 90, { size: 36, weight: 900, color: darken(ACCENT, 0.2) });
        label(ctx, 'OWE', pans[1][0], pans[1][1] + 90, { size: 36, weight: 900, color: DEBT });
        // items in the OWN pan
        const slots = [[-108, -52, 56], [0, -60, 62], [108, -52, 56], [0, -235, 105]];
        drops.forEach((it, i) => {
          const fall = clamp((t - it.at) / 0.45);
          if (fall <= 0) return;
          const [ox, oy, r] = slots[i];
          const x = pans[0][0] + ox;
          const y = lerp(-200, pans[0][1] + oy, ease.inQuad(fall));
          sphere(ctx, x, y, r, it.c, { shadow: false });
          if (i === 3) {
            icon(ctx, 'house', x, y - 22, 80, { color: '#fff', lw: 9 });
            label(ctx, it.short, x, y + 50, { size: 34, weight: 900, color: '#fff' });
          } else label(ctx, it.short, x, y, { size: r * 0.5, weight: 900, color: '#fff' });
        });
        // the loan monster
        if (t > d.s - 0.1) {
          const fall = clamp((t - d.s - s.line('l4').d * 0.35) / 0.45);
          const x = pans[1][0];
          const y = lerp(-300, pans[1][1] - 120, ease.inQuad(fall));
          critter(ctx, x, y - 10, 120, DEBT, { look: [-0.6, 0.2], blink: blink(t, 3), mouth: { type: 'chomp', open: 0.4 + 0.3 * Math.sin(t * 8) }, brow: 0.8, shadow: false });
          if (fall > 0.9) pill(ctx, x - 40, y - 205, 'Home loan ₹32 L', { size: 28, bg: DEBT, fg: '#fff' });
          burst(ctx, t - d.s - s.line('l4').d * 0.35 - 0.45, x, pans[1][1], { seed: 'thud', n: 18, colors: [DEBT, '#fff'], speed: 700, gravity: 1400, size: 9, life: 0.8 });
        }
        // running totals
        label(ctx, `Own ${lakhCr(Math.max(own, 140000))}`, 120, 1640, { size: 40, weight: 800, align: 'left', color: darken(ACCENT, 0.2) });
        label(ctx, `Owe ${owe ? lakhCr(owe) : '₹0'}`, 960, 1640, { size: 40, weight: 800, align: 'right', color: DEBT });
        headlines(ctx, s, [
          ['l1', 'Mutual funds: *₹6.2 lakh.*'],
          ['l2', 'EPF: *₹4.1 lakh.*'],
          ['l3', 'The flat: *₹48 lakh.*'],
          ['l4', 'The home loan? *₹32 lakh.*', { accent: DEBT }],
        ], { accent: ACCENT, y: 300 });
      },
      sfx: (s) => [...['l1', 'l2', 'l3'].map((id) => [s.line(id).s + 0.45, 'thud', 0.8]), ...['l1', 'l2', 'l3'].map((id) => [s.line(id).s + 0.47, 'coin', 0.4]), [s.line('l4').s + s.line('l4').d * 0.35 + 0.45, 'impact', 0.7], [s.line('l4').s + s.line('l4').d * 0.35 + 0.5, 'chomp', 0.7]],
    },

    nightScene({
      text: 'Count one side without the other, and it’s *just wrong.*',
      accent: ACCENT,
      glow: '#D6453D',
      content(ctx, s) {
        const { t } = s;
        // the scale with only one side counted lurches back and forth
        const swing = Math.sin(t * 3.2) * 0.38 * Math.exp(-t * 0.15);
        scale(ctx, W / 2, 820, swing, { dark: true, beam: 340 });
        const xq = spring(t - s.word('night', 'wrong'), 12, 0.5);
        if (t > s.word('night', 'wrong')) {
          ctx.save();
          ctx.translate(W / 2, 1200);
          ctx.scale(xq, xq);
          sphere(ctx, 0, 0, 120, C.loss, { shadow: false });
          icon(ctx, 'cross', 0, 0, 120, { color: '#fff', lw: 16 });
          ctx.restore();
        }
        label(ctx, 'Loan without the flat · flat without the loan', W / 2, 1740, { size: 30, weight: 600, color: 'rgba(255,255,255,0.6)' });
      },
    }),

    revealScene({ toolName: 'Net Worth', accent: ACCENT, logo }),

    // ---- own / owe columns, then one subtraction
    {
      at: 'split',
      trans: 'zoom',
      mood: 'drop',
      push: 0,
      draw(ctx, s) {
        const { t } = s;
        bgPaper(ctx, ACCENT);
        const sp = s.line('split');
        const gp = s.line('gap');
        const enter = spring(t - 0.05, 10, 0.6);
        const box = appWindow(ctx, 70, lerp(H, 440, enter), 940, 1180, { title: 'Net Worth · October', accent: ACCENT, iconName: 'scale' });
        const ownAt = s.word('split', 'own');
        const oweAt = s.word('split', 'owe');
        const emiAt = s.word('split', 'emi');
        label(ctx, 'What you own', box.x, box.y, { size: 30, weight: 800, align: 'left', baseline: 'top', color: darken(ACCENT, 0.2) });
        OWN.forEach((it, i) => {
          const q = ease.outCubic(clamp((t - ownAt - i * 0.12) / 0.35));
          const y = box.y + 60 + i * 104;
          ctx.save();
          ctx.globalAlpha = q;
          ctx.translate((1 - q) * 60, 0);
          ctx.fillStyle = '#F6F5F2';
          rr(ctx, box.x, y, box.w, 88, 22);
          ctx.fill();
          iconTile(ctx, it.ic, box.x + 48, y + 44, 56, it.c);
          label(ctx, it.n, box.x + 96, y + 44, { size: 28, weight: 700, align: 'left' });
          label(ctx, inr(it.v), box.x + box.w - 28, y + 44, { size: 32, weight: 800, align: 'right' });
          ctx.restore();
        });
        label(ctx, 'What you owe', box.x, box.y + 500, { size: 30, weight: 800, align: 'left', baseline: 'top', color: DEBT, alpha: ease.outCubic(clamp((t - oweAt) / 0.3)) });
        const lq = ease.outCubic(clamp((t - oweAt - 0.1) / 0.35));
        ctx.save();
        ctx.globalAlpha = lq;
        const ly = box.y + 560;
        ctx.fillStyle = '#FBEFEE';
        rr(ctx, box.x, ly, box.w, 88, 22);
        ctx.fill();
        iconTile(ctx, 'house', box.x + 48, ly + 44, 56, DEBT);
        label(ctx, 'Home loan · outstanding', box.x + 96, ly + 44, { size: 28, weight: 700, align: 'left' });
        label(ctx, inr(LOAN), box.x + box.w - 28, ly + 44, { size: 32, weight: 800, align: 'right', color: DEBT });
        ctx.restore();
        // EMI is not the balance
        const eq = ease.outBack(clamp((t - emiAt) / 0.35));
        if (eq > 0) {
          ctx.save();
          ctx.translate(box.x + box.w - 170, ly + 150);
          ctx.scale(eq, eq);
          pill(ctx, 0, 0, 'Monthly EMI', { size: 28, bg: '#F2F1ED', fg: C.mute, shadow: false });
          ctx.strokeStyle = C.loss;
          ctx.lineWidth = 7;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-120, 0);
          ctx.lineTo(120, 0);
          ctx.stroke();
          ctx.restore();
          label(ctx, 'Enter the balance, not the EMI', box.x, ly + 150, { size: 26, weight: 700, color: C.ink2, align: 'left', alpha: clamp(eq) });
        }
        // the subtraction
        const gq = ease.outCubic(clamp((t - gp.s) / 0.4));
        if (gq > 0) {
          ctx.save();
          ctx.globalAlpha = gq;
          ctx.fillStyle = C.line;
          ctx.fillRect(box.x, box.y + 800, box.w, 3);
          label(ctx, `${inr(ASSETS)}  −  ${inr(LOAN)}`, box.x + box.w / 2, box.y + 880, { size: 44, weight: 800 });
          label(ctx, '=', box.x + box.w / 2, box.y + 950, { size: 50, weight: 900, color: ACCENT });
          ctx.restore();
        }
        headlines(ctx, s, [['split', 'Own. Owe. *The balance.*'], ['gap', 'One *subtraction.*']], { accent: ACCENT, y: 270, size: 88 });
      },
      sfx: (s) => [[0.05, 'swoosh', 0.6], [s.word('split', 'own'), 'pop', 0.6], [s.word('split', 'owe'), 'pop', 0.6], [s.word('split', 'emi'), 'scratch', 0.6], [s.line('gap').s, 'slide', 0.6]],
    },

    // ---- the real number
    {
      at: 'stamp',
      trans: 'zoom',
      mood: 'drop',
      draw(ctx, s) {
        const { t } = s;
        paper(ctx, t, ACCENT, 'real');
        const st = s.line('stamp');
        const v = countTo(t, st.s, 1.1, 0, NET);
        const p = spring(t - st.s + 0.1, 10, 0.5);
        ctx.save();
        ctx.translate(W / 2, 1000);
        ctx.scale(p, p);
        softShadow(ctx, -440, -170, 880, 340, 70, { spread: 50, alpha: 0.24, dy: 30 });
        const g = ctx.createLinearGradient(0, -170, 0, 170);
        g.addColorStop(0, lighten(ACCENT, 0.12));
        g.addColorStop(1, darken(ACCENT, 0.15));
        ctx.fillStyle = g;
        rr(ctx, -440, -170, 880, 340, 70);
        ctx.fill();
        label(ctx, 'Net worth', 0, -95, { size: 36, weight: 700, color: 'rgba(255,255,255,0.85)' });
        tabular(ctx, inr(Math.round(v / 1000) * 1000), 0, 20, 132, { weight: 900, color: '#fff' });
        ctx.restore();
        stamp(ctx, t - s.word('stamp', 'real'), 820, 1210, 'REAL', { color: C.loss, size: 84, rot: -0.16 });
        const dq = ease.outCubic(clamp((t - st.s - 1.2) / 0.5));
        label(ctx, 'Debt is 54% of assets', W / 2, 1400, { size: 40, weight: 800, color: C.ink2, alpha: dq });
        label(ctx, 'ordinary for a recent home purchase', W / 2, 1460, { size: 30, weight: 600, color: C.mute, alpha: dq });
        burst(ctx, t - st.s - 1.1, W / 2, 900, { seed: 'nw', n: 30, colors: [ACCENT, C.gold, '#fff'], speed: 1300, gravity: 1100, size: 11, life: 1.2, shape: 'rect' });
        headlines(ctx, s, [['stamp', 'The *real* one.', { at: s.word('stamp', 'real') - 0.3, span: 0.4 }]], { accent: C.loss, y: 400, size: 110 });
      },
      sfx: (s) => [[s.line('stamp').s, 'riser', 0.5], [s.line('stamp').s + 1.1, 'impact', 0.6], [s.line('stamp').s + 1.15, 'confetti', 0.6], [s.word('stamp', 'real'), 'stamp', 1]],
    },

    // ---- carry-forward months
    {
      at: 'feature',
      trans: 'whip',
      mood: 'groove',
      draw(ctx, s) {
        const { t } = s;
        paper(ctx, t, ACCENT, 'months');
        const f = s.line('feature');
        const months = ['Oct', 'Nov', 'Dec', 'Jan'];
        const rows = ['Salary account', 'Mutual funds', 'EPF', 'Flat', 'Home loan'];
        // which cells were actually edited (the rest carry forward)
        const edited = { 'Nov:Salary account': 1, 'Nov:Mutual funds': 1, 'Dec:Salary account': 1, 'Dec:Home loan': 1, 'Jan:Salary account': 1, 'Jan:Mutual funds': 1, 'Jan:EPF': 1 };
        const x0 = 330;
        const cw = 170;
        const y0 = 720;
        const rh = 130;
        months.forEach((m, j) => label(ctx, m, x0 + j * cw + cw / 2, y0 - 50, { size: 34, weight: 800, color: C.ink2 }));
        rows.forEach((r, i) => {
          label(ctx, r, 70, y0 + i * rh + 50, { size: 30, weight: 700, align: 'left', color: r === 'Home loan' ? DEBT : C.ink });
          months.forEach((m, j) => {
            const appear = f.s + 0.2 + j * (f.d / 5);
            const q = ease.outBack(clamp((t - appear - i * 0.04) / 0.3));
            if (q <= 0) return;
            const cx = x0 + j * cw + cw / 2;
            const cy = y0 + i * rh + 50;
            const isEdit = j === 0 || edited[`${m}:${r}`];
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(q, q);
            ctx.fillStyle = isEdit ? (r === 'Home loan' ? '#FBEFEE' : '#E6F6F6') : '#F2F1ED';
            rr(ctx, -70, -44, 140, 88, 22);
            ctx.fill();
            if (isEdit) icon(ctx, 'check', 0, 0, 44, { color: r === 'Home loan' ? DEBT : ACCENT, lw: 14 });
            else icon(ctx, 'arrowR', 0, 0, 52, { color: '#B5B2AA', lw: 10 });
            ctx.restore();
          });
        });
        const lq = ease.outCubic(clamp((t - s.word('feature', 'carries')) / 0.4));
        ctx.save();
        ctx.globalAlpha = lq;
        icon(ctx, 'check', 140, 1450, 40, { color: ACCENT, lw: 14 });
        label(ctx, 'updated', 180, 1450, { size: 30, weight: 700, align: 'left' });
        icon(ctx, 'arrowR', 470, 1450, 46, { color: '#B5B2AA', lw: 10 });
        label(ctx, 'carried forward', 510, 1450, { size: 30, weight: 700, align: 'left' });
        ctx.restore();
        headlines(ctx, s, [['feature', 'Update only *what moved.*', { span: 0.8 }], ['feature', 'The rest *carries forward.*', { at: s.word('feature', 'everything') - 0.1, keep: true }]], { accent: ACCENT, y: 330, size: 86 });
      },
      sfx: (s) => [0, 1, 2, 3].map((j) => [s.line('feature').s + 0.2 + j * (s.line('feature').d / 5), 'pop', 0.5]),
    },

    morningScene({
      text: 'Just your numbers, and *the trend.*',
      accent: ACCENT,
      content(ctx, s) {
        const { t } = s;
        const p = spring(t - 0.2, 9, 0.6);
        phone(ctx, 520, lerp(2300, 1100, p), 470, {
          lock: false,
          screenTop: '#FFFFFF',
          screenBot: '#F2F7F7',
          content(c, box) {
            const x = box.x + 34;
            label(c, 'Net worth · 6 months', x, box.y + 120, { size: 28, weight: 800, align: 'left' });
            lineChart(c, x, box.y + 180, box.w - 68, 330, [{ pts: [[0, 0.3], [0.2, 0.36], [0.4, 0.34], [0.6, 0.48], [0.8, 0.55], [1, 0.68]], c: ACCENT, prog: clamp((t - 0.6) / 1.2), width: 6 }]);
            const chips = [['No bank connection', 'unlink'], ['No market feed', 'cross'], ['Every figure is yours', 'check']];
            chips.forEach(([n, ic], i) => {
              const q = ease.outBack(clamp((t - s.word('morning', 'connection') + 0.2 - i * 0.3) / 0.35));
              const y = box.y + 570 + i * 86;
              c.save();
              c.globalAlpha = clamp(q);
              c.fillStyle = '#E9F6F6';
              rr(c, x, y, box.w - 68, 70, 20);
              c.fill();
              icon(c, ic, x + 40, y + 35, 36, { color: darken(ACCENT, 0.2), lw: 12 });
              label(c, n, x + 76, y + 35, { size: 24, weight: 700, align: 'left' });
              c.restore();
            });
          },
        });
      },
    }),

    taglineScene({ a: 'Less guessing.', b: 'More *knowing.*', accent: ACCENT }),
    endScene({ toolName: 'Net Worth', accent: ACCENT, logo, iconName: 'scale', toolId: 'networth' }),
  ];
}
