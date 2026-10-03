// LifeMap — curves are calcWealth(smart / impulsive) and scores are calcScore / calcHealth from
// src/tools/lib/lifemap.ts for an example profile (age 30, ₹1L/mo income, tech career).
import { W, H, C, clamp, lerp, ease, spring, inr, rng, lighten, darken, rgba } from '../engine/core.js';
import { rr, softShadow, sphere, bubbles, burst, critter, floorShadow, stamp, pill, tabular, embossText, ring, bgPaper, stars } from '../engine/draw.js';
import { kinetic, label } from '../engine/text.js';
import { icon, iconTile } from '../engine/icons.js';
import { appWindow, field, chip, toggle, lineChart, phone } from '../engine/ui.js';
import { hookScene, slamScene, nightScene, revealScene, morningScene, taglineScene, endScene } from '../engine/scenes.js';
import { blink, countTo, headlines, paper, HEAD_Y } from '../engine/kit.js';

const ACCENT = '#D4AF37';
const SMART = '#D4AF37';
const IMP = '#FF5A52';
// calcWealth(..., applied = {big_wedding, buy_car_loan, lifestyle_creep}, age 30..60, smart / impulsive)
const SMART_C = [1120000, 1878560, 2733462, 3695787, 4777886, 5993535, 7358091, 8888680, 10604394, 12526523, 14678806, 17087708, 19782743, 22796814, 26166612, 29933044, 34141724, 38843511, 44095110, 49959752, 56507935, 63818268, 71978397, 81086049, 91250188, 102592312, 115247888, 129367963, 145120954, 162694648, 182298425];
const IMP_C = [800000, 938400, 1088078, 1249464, 1423001, 1609152, 1808396, 2021230, 2248171, 2489755, 2746539, 3019099, 3308036, 3613972, 3937552, 4279448, 4640355, 5020996, 5422120, 5844506, 6288962, 6756327, 7247470, 7763297, 8304744, 8872785, 9468430, 10092730, 10746772, 11431687, 12148648];
const MAX = SMART_C[30];
const pts = (arr) => arr.map((v, i) => [i / 30, v / MAX]);
// LM_GOALS labels
const GOALS = ['Own a home', 'Early retire', 'Buy a car', 'Study abroad', 'Start a biz', 'Travel world', 'Dream wedding', 'Debt-free', 'Passive income', 'Support family', 'Higher studies'];
const PICKED = ['Own a home', 'Study abroad', 'Early retire'];
// calcHealth without impulsive decisions; calcScore = 51
const HEALTH = [['Savings', 80], ['Investment', 72], ['Debt', 92], ['Protection', 58], ['Growth', 35]];
const STAGES = [[30, 'Peak growth'], [35, 'Mid-career'], [45, 'Wealth prime'], [55, 'Pre-retire'], [60, 'Retire']];

function crystal(ctx, x, y, r, t, crack = 0) {
  const halo = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 1.8);
  halo.addColorStop(0, 'rgba(190,170,255,0.45)');
  halo.addColorStop(1, 'rgba(190,170,255,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
  ctx.fill();
  sphere(ctx, x, y, r, '#B9A8FF', { shadow: false, gloss: 1 });
  // swirling mist inside
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.96, 0, Math.PI * 2);
  ctx.clip();
  for (let k = 0; k < 3; k++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.25 - k * 0.06})`;
    ctx.lineWidth = r * 0.08;
    ctx.beginPath();
    ctx.arc(x + Math.cos(t * 1.4 + k * 2) * r * 0.2, y + Math.sin(t * 1.1 + k) * r * 0.15, r * (0.35 + k * 0.15), t * 2 + k, t * 2 + k + 2.4);
    ctx.stroke();
  }
  label(ctx, '?', x, y + r * 0.05, { size: r * 0.9, weight: 900, color: 'rgba(255,255,255,0.75)' });
  if (crack > 0) {
    const R = rng('crack');
    ctx.strokeStyle = 'rgba(30,20,60,0.85)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    for (let c = 0; c < 4; c++) {
      let px = x + (R() - 0.5) * r * 0.2;
      let py = y - r;
      ctx.beginPath();
      ctx.moveTo(px, py);
      const steps = Math.floor(8 * crack);
      for (let i = 0; i < steps; i++) {
        px += (R() - 0.5) * r * 0.35;
        py += r * 0.26;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
  floorShadow(ctx, x, y + r * 1.25, r * 0.8, r * 0.14, 0.22);
}

function hookCard(ctx, w, h, t) {
  iconTile(ctx, 'pin', 92, 96, 84, '#B08A1E');
  label(ctx, 'Net worth at 60', 156, 96, { size: 40, weight: 700, align: 'left' });
  const R = rng('slot' + Math.floor(t * 12));
  const digits = Array.from({ length: 6 }, () => Math.floor(R() * 10)).join('');
  tabular(ctx, '₹' + digits.slice(0, 2) + ',' + digits.slice(2, 4) + ',' + digits.slice(4) + '??', 56, 260, 104, { align: 'left', weight: 800, color: C.ink2 });
  label(ctx, 'forecasting…', 56, 380, { size: 32, weight: 600, color: C.mute, align: 'left' });
  ctx.fillStyle = '#F1EEE4';
  rr(ctx, 56, 420, w - 112, 22, 11);
  ctx.fill();
  ctx.fillStyle = ACCENT;
  rr(ctx, 56, 420, (w - 112) * ((t * 0.37) % 1), 22, 11);
  ctx.fill();
}

const accessory = (name, col) => ({ draw: (c, r) => icon(c, name, 0, -r * 1.3, r * 0.8, { color: darken(col, 0.35), lw: 10, fill: lighten(col, 0.7) }) });

export default function story({ timeline, logo }) {
  const L = Object.fromEntries(timeline.lines.map((l) => [l.id, l]));
  const hookDur = L.lie.start - 0.12;

  return [
    hookScene({ text: 'What will you be worth at *sixty?*', card: hookCard, accent: ACCENT, size: 92 }),
    slamScene({ pre: 'Any app that tells you is', word: 'LYING.', needle: 'lying', sub: null, card: hookCard, accent: ACCENT, hookDur }),

    // ---- the crystal ball cracks; one life becomes two
    {
      at: 'lands',
      trans: 'whip',
      mood: 'tension',
      draw(ctx, s) {
        const { t } = s;
        paper(ctx, t, ACCENT, 'ball');
        const ln = s.line('lands');
        const gn = s.line('gone');
        const crack = clamp((t - s.word('lands', 'forecast')) / 0.8);
        const split = ease.inOutCubic(clamp((t - gn.s - 0.1) / 0.7));
        if (split < 0.15) crystal(ctx, W / 2, 1000, 260 * spring(t - ln.s + 0.2, 10, 0.5), t, crack);
        if (split > 0) {
          burst(ctx, t - gn.s - 0.1, W / 2, 1000, { seed: 'glass', n: 30, colors: ['#D9CFFF', '#fff', '#B9A8FF'], speed: 1300, gravity: 1500, size: 12, life: 1.0, shape: 'spark' });
          const r = lerp(60, 170, ease.outBack(split));
          critter(ctx, lerp(W / 2, 290, split), 1170 - r, r, SMART, { look: [0.5, 0], blink: blink(t, 1), mouth: { type: 'smile' } });
          critter(ctx, lerp(W / 2, 790, split), 1170 - r, r, IMP, { look: [-0.5, 0], blink: blink(t, 4), mouth: { type: 'smile' } });
          pill(ctx, 290, 1260, 'Life A', { size: 30, alpha: split });
          pill(ctx, 790, 1260, 'Life B', { size: 30, alpha: split });
        }
        headlines(ctx, s, [['lands', 'Nobody can forecast *40 years.*'], ['gone', 'But you can compare *two lives.*']], { accent: darken(ACCENT, 0.25), size: 84 });
      },
      sfx: (s) => [[s.line('lands').s, 'chime', 0.4], [s.word('lands', 'forecast'), 'shatter', 0.4], [s.line('gone').s + 0.1, 'shatter', 0.7], [s.line('gone').s + 0.3, 'pop', 0.8], [s.line('gone').s + 0.4, 'pop', 0.8]],
    },

    // ---- same start; one life picks up the expensive habits
    {
      at: 'where',
      trans: 'cut',
      mood: 'groove',
      draw(ctx, s) {
        const { t } = s;
        paper(ctx, t, ACCENT, 'lives');
        const w = s.line('where');
        const [a, b, c, d] = ['l1', 'l2', 'l3', 'l4'].map((id) => s.line(id));
        // start line
        ctx.strokeStyle = '#CFCBC0';
        ctx.lineWidth = 6;
        ctx.setLineDash([16, 14]);
        ctx.beginPath();
        ctx.moveTo(80, 1200);
        ctx.lineTo(1000, 1200);
        ctx.stroke();
        ctx.setLineDash([]);
        label(ctx, 'Age 30 · same income · same savings', W / 2, 1250, { size: 30, weight: 700, color: C.mute });
        const loads = [[a, 'ring', 'Finance a big-fat wedding'], [b, 'car', 'Buy car on loan'], [c, 'bag', 'Upgrade lifestyle with every raise']];
        const n = loads.filter(([ln]) => t > ln.s - 0.1).length;
        const heavy = n / 3;
        const r = 170;
        critter(ctx, 290, 1170 - r, r, SMART, { look: t > d.s ? [0, -0.2] : [0.6, 0], blink: blink(t, 1), mouth: { type: t > d.s ? 'grin' : 'smile' } });
        critter(ctx, 790, 1170 - r * (1 - 0.12 * heavy), r, IMP, { look: [-0.2, -0.6], blink: blink(t, 4), mouth: heavy > 0.6 ? { type: 'o', open: 0.6 } : { type: 'smile' }, sx: 1 + 0.12 * heavy, sy: 1 - 0.12 * heavy, brow: heavy > 0.6 ? 0.6 : 0 });
        // decisions stack onto life B
        loads.forEach(([ln, ic, txt], i) => {
          if (t < ln.s - 0.1) return;
          const q = spring(t - ln.s + 0.1, 11, 0.5);
          const y = 760 - i * 120;
          ctx.save();
          ctx.translate(790, lerp(-200, y, q));
          iconTile(ctx, ic === 'bag' ? 'bag' : ic, -0, 0, 96, IMP);
          ctx.restore();
          ctx.save();
          ctx.globalAlpha = clamp(q);
          const tw = pill(ctx, 520, lerp(-200, y, q), txt, { size: 26, align: 'right', fg: C.ink2 });
          ctx.restore();
          burst(ctx, t - ln.s - 0.2, 790, y, { seed: 'dec' + i, n: 10, colors: [IMP, '#fff'], speed: 500, gravity: 800, size: 8, life: 0.7, shape: 'spark' });
        });
        if (t > d.s) {
          const q = ease.outBack(clamp((t - d.s) / 0.4));
          ctx.save();
          ctx.translate(290, 770);
          ctx.scale(q, q);
          pill(ctx, 0, 0, 'Skips all three', { size: 30, bg: ACCENT, fg: C.ink });
          ctx.restore();
          burst(ctx, t - d.s - 0.1, 290, 1000, { seed: 'calm', n: 18, colors: [C.gold, '#fff'], speed: 700, gravity: 600, size: 9, life: 1.1, shape: 'spark' });
        }
        headlines(ctx, s, [
          ['where', 'Same person. *Same start.*'],
          ['l1', 'One finances a *big wedding,*', { accent: IMP }],
          ['l2', 'a *car on EMI,*', { accent: IMP }],
          ['l3', 'and lets *lifestyle creep* in.', { accent: IMP }],
          ['l4', 'The other *doesn’t.*'],
        ], { accent: darken(ACCENT, 0.25), y: 300, size: 84 });
      },
      sfx: (s) => [[s.line('where').s, 'pop', 0.7], ...['l1', 'l2', 'l3'].map((id) => [s.line(id).s - 0.05, 'thud', 0.7]), [s.line('l4').s, 'chime', 0.6]],
    },

    nightScene({
      text: '30 years later, the gap is *the whole story.*',
      accent: ACCENT,
      glow: '#B08A1E',
      content(ctx, s) {
        const { t } = s;
        const p = clamp((t - 0.2) / 1.7);
        const x = 100;
        const y = 760;
        const w = 880;
        const h = 760;
        // gap shading between the curves
        const upto = Math.floor(30 * p);
        if (upto > 1) {
          ctx.save();
          ctx.beginPath();
          for (let i = 0; i <= upto; i++) ctx.lineTo(x + (i / 30) * w, y + h - (SMART_C[i] / MAX) * h);
          for (let i = upto; i >= 0; i--) ctx.lineTo(x + (i / 30) * w, y + h - (IMP_C[i] / MAX) * h);
          ctx.closePath();
          ctx.fillStyle = 'rgba(212,175,55,0.16)';
          ctx.fill();
          ctx.restore();
        }
        lineChart(ctx, x, y, w, h, [{ pts: pts(SMART_C), c: SMART, prog: p, fill: false, width: 10 }, { pts: pts(IMP_C), c: IMP, prog: p, fill: false, width: 10 }], { grid: false });
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x + w, y + h);
        ctx.stroke();
        label(ctx, 'Age 30', x, y + h + 44, { size: 28, weight: 700, color: 'rgba(255,255,255,0.6)', align: 'left' });
        label(ctx, '60', x + w, y + h + 44, { size: 28, weight: 700, color: 'rgba(255,255,255,0.6)', align: 'right' });
        if (p > 0.95) {
          const q = ease.outBack(clamp((t - 0.2 - 1.7) / 0.4));
          pill(ctx, x + w - 120, y + 40, 'Smart', { size: 30, bg: SMART, fg: C.ink, alpha: clamp(q) });
          pill(ctx, x + w - 120, y + h - 120, 'Impulsive', { size: 30, bg: IMP, fg: '#fff', alpha: clamp(q) });
          // the gap bracket
          ctx.save();
          ctx.globalAlpha = clamp(q);
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 5;
          const gx = x + w + 30;
          ctx.beginPath();
          ctx.moveTo(gx - 16, y);
          ctx.lineTo(gx, y);
          ctx.lineTo(gx, y + h - (IMP_C[30] / MAX) * h);
          ctx.lineTo(gx - 16, y + h - (IMP_C[30] / MAX) * h);
          ctx.stroke();
          ctx.restore();
          label(ctx, 'the gap', x + w - 140, y + h * 0.45, { size: 44, weight: 800, color: '#FFE27A', alpha: clamp(q), italic: false });
        }
        label(ctx, 'Illustrative · same assumptions, one difference', W / 2, 1640, { size: 26, weight: 600, color: 'rgba(255,255,255,0.5)' });
      },
    }),

    revealScene({ toolName: 'LifeMap', accent: ACCENT, logo }),

    // ---- profile → goals
    {
      at: 'split',
      trans: 'zoom',
      mood: 'drop',
      push: 0,
      draw(ctx, s) {
        const { t } = s;
        bgPaper(ctx, ACCENT);
        const gp = s.line('gap');
        const enter = spring(t - 0.05, 10, 0.6);
        const box = appWindow(ctx, 70, lerp(H, 440, enter), 940, 1180, { title: 'LifeMap', accent: ACCENT, iconName: 'pin' });
        const toGoals = ease.inOutCubic(clamp((t - gp.s + 0.1) / 0.5));
        ctx.save();
        ctx.globalAlpha = 1 - toGoals;
        const ats = [s.word('split', 'age'), s.word('split', 'income'), s.word('split', 'career'), s.word('split', 'today')];
        [['Age', '30'], ['Monthly income', '₹1,00,000'], ['Career field', 'Tech  ▾'], ['Savings + investments', '₹8,00,000']].forEach(([lab, v], i) => {
          const n = Math.floor(clamp((t - ats[i]) * 14, 0, v.length));
          field(ctx, box.x, box.y + i * 175, box.w, lab, v.slice(0, n) || ' ', { focus: t > ats[i] - 0.1 && t < ats[i] + 0.7 ? 1 : 0, accent: ACCENT, alpha: ease.outCubic(clamp((t - ats[i] + 0.3) / 0.3)) });
        });
        ctx.restore();
        if (toGoals > 0) {
          ctx.save();
          ctx.globalAlpha = toGoals;
          label(ctx, 'Your life goals', box.x, box.y, { size: 34, weight: 800, align: 'left', baseline: 'top' });
          let x = 0;
          let y = 0;
          GOALS.forEach((g, i) => {
            ctx.font = '700 30px Geist';
            const w = ctx.measureText(g).width + 30 * 1.6;
            if (x + w > box.w) {
              x = 0;
              y += 96;
            }
            const pickAt = PICKED.includes(g) ? s.word('gap', g === 'Own a home' ? 'home' : g === 'Study abroad' ? 'study' : 'early') : 99;
            const on = ease.outBack(clamp((t - pickAt) / 0.3));
            const q = ease.outBack(clamp((t - gp.s - i * 0.04) / 0.3), 2);
            ctx.save();
            ctx.translate(box.x + x + w / 2, box.y + 120 + y);
            ctx.scale(q * (1 + 0.08 * Math.sin(on * Math.PI)), q * (1 + 0.08 * Math.sin(on * Math.PI)));
            chip(ctx, 0, 0, g, { on: clamp(on), accent: darken(ACCENT, 0.15), size: 30 });
            ctx.restore();
            x += w + 16;
          });
          label(ctx, 'Each has a cost and a timing the simulation respects.', box.x, box.y + 560, { size: 28, weight: 600, color: C.mute, align: 'left' });
          ctx.restore();
        }
        headlines(ctx, s, [['split', 'Where you are *today.*'], ['gap', 'The goals that are *really yours.*', { size: 76 }]], { accent: darken(ACCENT, 0.25), y: 250, size: 84 });
      },
      sfx: (s) => [[0.05, 'swoosh', 0.6], [s.word('split', 'age'), 'type', 0.5], [s.word('split', 'income'), 'type', 0.5], [s.word('split', 'career'), 'type', 0.5], [s.word('gap', 'home'), 'pop', 0.8], [s.word('gap', 'study'), 'pop', 0.8], [s.word('gap', 'early'), 'pop', 0.8]],
    },

    // ---- health at every stage
    {
      at: 'stamp',
      trans: 'cut',
      mood: 'drop',
      push: 0,
      draw(ctx, s) {
        const { t } = s;
        bgPaper(ctx, ACCENT);
        const box = appWindow(ctx, 70, 440, 940, 1180, { title: 'LifeMap', accent: ACCENT, iconName: 'pin' });
        const st = s.line('stamp');
        // stage timeline
        const tx = box.x + 20;
        const tw = box.w - 40;
        ctx.strokeStyle = '#E4E0D4';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(tx, box.y + 60);
        ctx.lineTo(tx + tw, box.y + 60);
        ctx.stroke();
        const runP = ease.inOutCubic(clamp((t - st.s) / (st.d * 0.8)));
        ctx.strokeStyle = ACCENT;
        ctx.beginPath();
        ctx.moveTo(tx, box.y + 60);
        ctx.lineTo(tx + tw * runP, box.y + 60);
        ctx.stroke();
        STAGES.forEach(([age, l], i) => {
          const sx = tx + ((age - 30) / 30) * tw;
          const on = runP * 30 + 30 >= age;
          ctx.fillStyle = on ? ACCENT : '#E4E0D4';
          ctx.beginPath();
          ctx.arc(sx, box.y + 60, 18, 0, Math.PI * 2);
          ctx.fill();
          label(ctx, String(age), sx, box.y + 110, { size: 28, weight: 800, color: on ? C.ink : C.mute });
          label(ctx, l, sx, box.y + 146, { size: 20, weight: 600, color: C.mute });
        });
        // health bars
        const hs = s.word('stamp', 'scores');
        label(ctx, 'Financial health', box.x, box.y + 230, { size: 32, weight: 800, align: 'left', baseline: 'top' });
        HEALTH.forEach(([n, v], i) => {
          const y = box.y + 310 + i * 110;
          const q = ease.outCubic(clamp((t - hs - i * 0.1) / 0.6));
          label(ctx, n, box.x, y, { size: 28, weight: 700, align: 'left', baseline: 'top' });
          label(ctx, String(Math.round(v * q)), box.x + box.w, y, { size: 28, weight: 800, align: 'right', baseline: 'top' });
          ctx.fillStyle = '#EFECE3';
          rr(ctx, box.x, y + 44, box.w, 24, 12);
          ctx.fill();
          ctx.fillStyle = v >= 70 ? C.gain : v >= 50 ? '#E8A317' : C.loss;
          rr(ctx, box.x, y + 44, (box.w * v * q) / 100, 24, 12);
          ctx.fill();
        });
        const sq = ease.outBack(clamp((t - hs - 0.6) / 0.4));
        if (sq > 0) {
          ctx.save();
          ctx.translate(box.x + box.w - 120, box.y + 250);
          ctx.scale(sq, sq);
          sphere(ctx, 0, 0, 74, ACCENT, { shadow: false });
          label(ctx, '51', 0, 2, { size: 56, weight: 900, color: C.ink });
          ctx.restore();
        }
        headlines(ctx, s, [['stamp', 'Compounds. Amortises. *Scores.*', { size: 76 }]], { accent: darken(ACCENT, 0.25), y: 270 });
      },
      sfx: (s) => [[s.line('stamp').s, 'slide', 0.5], [s.word('stamp', 'scores'), 'pop', 0.6], [s.word('stamp', 'scores') + 0.6, 'ding', 0.6]],
    },

    // ---- flip one decision
    {
      at: 'feature',
      trans: 'zoom',
      mood: 'groove',
      draw(ctx, s) {
        const { t } = s;
        paper(ctx, t, ACCENT, 'flip');
        const f = s.line('feature');
        const flipAt = s.word('feature', 're-run') - 0.3;
        const decs = [['ring', 'Finance a big-fat wedding', 1], ['car', 'Buy car on loan', 1], ['bag', 'Upgrade lifestyle with every raise', 0]];
        decs.forEach(([ic, txt, stay], i) => {
          const y = 700 + i * 170;
          const q = ease.outCubic(clamp((t - 0.05 - i * 0.08) / 0.4));
          const on = stay ? 1 : 1 - ease.inOutCubic(clamp((t - flipAt) / 0.3));
          ctx.save();
          ctx.globalAlpha = q;
          softShadow(ctx, 90, y, 900, 136, 34, { spread: 20, alpha: 0.1, dy: 10, steps: 4 });
          ctx.fillStyle = '#fff';
          rr(ctx, 90, y, 900, 136, 34);
          ctx.fill();
          if (!stay) {
            ctx.strokeStyle = rgba(ACCENT, 1 - on);
            ctx.lineWidth = 5;
            ctx.stroke();
          }
          iconTile(ctx, ic, 160, y + 68, 76, on > 0.5 ? IMP : '#B9B6AE');
          label(ctx, txt, 220, y + 68, { size: 30, weight: 700, align: 'left', color: on > 0.5 ? C.ink : C.mute });
          toggle(ctx, 860, y + 68, on, { accent: IMP, size: 0.9 });
          ctx.restore();
        });
        // score dial 24 → 38 (calcScore)
        const sc = Math.round(countTo(t, flipAt + 0.3, 0.9, 24, 38));
        const dq = ease.outBack(clamp((t - 0.3) / 0.4));
        ctx.save();
        ctx.translate(W / 2, 1420);
        ctx.scale(dq, dq);
        ctx.lineWidth = 34;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#ECE8DC';
        ctx.beginPath();
        ctx.arc(0, 0, 170, Math.PI * 0.8, Math.PI * 2.2);
        ctx.stroke();
        ctx.strokeStyle = sc >= 38 ? '#E8A317' : C.loss;
        ctx.beginPath();
        ctx.arc(0, 0, 170, Math.PI * 0.8, Math.PI * 0.8 + Math.PI * 1.4 * (sc / 100));
        ctx.stroke();
        tabular(ctx, String(sc), 0, -10, 110, { weight: 900 });
        label(ctx, 'health score', 0, 70, { size: 28, weight: 700, color: C.mute });
        ctx.restore();
        if (t > flipAt + 1.2) label(ctx, '+14 from one decision', W / 2, 1660, { size: 36, weight: 800, color: darken(ACCENT, 0.3), alpha: ease.outCubic(clamp((t - flipAt - 1.2) / 0.4)) });
        headlines(ctx, s, [['feature', 'Change *one* decision.', { span: 0.5 }], ['feature', 'The difference is *the answer.*', { at: s.word('feature', 'difference') - 0.1, keep: true, size: 78 }]], { accent: darken(ACCENT, 0.25), y: 330, size: 92 });
      },
      sfx: (s) => [[s.word('feature', 're-run') - 0.3, 'click', 1], [s.word('feature', 're-run'), 'riser', 0.4], [s.word('feature', 're-run') + 0.9, 'ding', 0.7]],
    },

    morningScene({
      text: 'Not a forecast. A *comparison.*',
      accent: ACCENT,
      content(ctx, s) {
        const { t } = s;
        const p = spring(t - 0.2, 9, 0.6);
        phone(ctx, 520, lerp(2300, 1100, p), 470, {
          lock: false,
          screenTop: '#FFFFFF',
          screenBot: '#F7F4EA',
          content(c, box) {
            const x = box.x + 34;
            label(c, 'Smart vs impulsive you', x, box.y + 120, { size: 28, weight: 800, align: 'left' });
            lineChart(c, x, box.y + 180, box.w - 68, 360, [{ pts: pts(SMART_C), c: SMART, prog: clamp((t - 0.5) / 1.2), width: 6 }, { pts: pts(IMP_C), c: IMP, prog: clamp((t - 0.5) / 1.2), width: 6, fill: false }], { grid: true });
            const q = ease.outBack(clamp((t - 1.8) / 0.4));
            c.save();
            c.globalAlpha = clamp(q);
            c.fillStyle = '#FFF7DC';
            rr(c, x, box.y + 600, box.w - 68, 120, 26);
            c.fill();
            icon(c, 'check', x + 50, box.y + 660, 44, { color: '#B08A1E', lw: 14 });
            label(c, 'Same assumptions,', x + 96, box.y + 642, { size: 22, weight: 700, align: 'left' });
            label(c, 'one decision apart.', x + 96, box.y + 676, { size: 22, weight: 700, align: 'left' });
            c.restore();
          },
        });
      },
    }),

    taglineScene({ a: 'Fewer guesses.', b: 'Better *decades.*', needle: 'Better', accent: ACCENT }),
    endScene({ toolName: 'LifeMap', accent: ACCENT, logo, iconName: 'pin', toolId: 'lifemap' }),
  ];
}
