// PeerCompare — benchmarks and percentiles are computePeerCompare() output for an example
// profile (age 30, ₹1,50,000/mo income, ₹75,000/mo expenses, ₹3L savings, ₹5L invested, 30% savings rate).
import { W, H, C, clamp, lerp, ease, spring, inr, rng, lighten, darken, rgba } from '../engine/core.js';
import { rr, softShadow, sphere, bubbles, burst, critter, floorShadow, stamp, pill, tabular, embossText, ring, bgPaper } from '../engine/draw.js';
import { kinetic, label } from '../engine/text.js';
import { icon, iconTile } from '../engine/icons.js';
import { appWindow, field, chip, phone } from '../engine/ui.js';
import { hookScene, slamScene, questionScene, nightScene, revealScene, morningScene, taglineScene, endScene } from '../engine/scenes.js';
import { blink, countTo, headlines, paper, HEAD_Y, calendarChip } from '../engine/kit.js';

const ACCENT = '#7C5CFF';
const AMBER = '#F59E0B';

// src/tools/lib/peercompare.ts PC_CITIES
const CITIES = [
  ['Mumbai', 1.15], ['Delhi NCR', 1.1], ['Bengaluru', 1.12], ['Hyderabad', 1.02], ['Chennai', 1.0], ['Kolkata', 0.9], ['Pune', 0.98],
  ['Ahmedabad', 1.02], ['Jaipur', 0.98], ['Kochi', 1.0], ['Chandigarh', 1.05], ['Lucknow', 0.95], ['Indore', 0.95], ['Coimbatore', 0.97],
  ['Other Tier-2 city', 1.0], ['Tier-3 / small town', 1.0],
];
// computePeerCompare(..., cityKey: 'indore').metrics
const METRICS = [
  { l: 'Monthly income', pct: 91, st: 'ahead' },
  { l: 'Total savings', pct: 27, st: 'behind' },
  { l: 'Investments', pct: 65, st: 'ahead' },
  { l: 'Savings rate', pct: 71, st: 'ahead' },
  { l: 'Net worth', pct: 54, st: 'on track' },
  { l: 'Monthly expenses', pct: 15, st: 'behind' },
];
const stColor = (st) => (st === 'ahead' ? C.gain : st === 'on track' ? AMBER : C.loss);

function hookCard(ctx, w, h, t) {
  iconTile(ctx, 'users', 92, 96, 84, ACCENT);
  label(ctx, 'My numbers', 156, 96, { size: 38, weight: 700, align: 'left' });
  label(ctx, 'Income', 56, 200, { size: 30, weight: 600, color: C.mute, align: 'left' });
  tabular(ctx, '₹18 L / yr', 56, 262, 80, { align: 'left', weight: 800 });
  label(ctx, 'Spending', 56, 350, { size: 30, weight: 600, color: C.mute, align: 'left' });
  tabular(ctx, '₹75,000 / mo', 56, 412, 80, { align: 'left', weight: 800 });
  const q = ease.outBack(clamp((t - 1.2) / 0.4));
  if (q > 0) {
    ctx.save();
    ctx.translate(w - 250, 120);
    ctx.rotate(0.06);
    ctx.scale(q, q);
    ctx.fillStyle = '#F2EEFF';
    rr(ctx, -200, -50, 400, 100, 50);
    ctx.fill();
    label(ctx, 'Is that good?', 0, 0, { size: 38, weight: 800, color: ACCENT });
    ctx.restore();
  }
}

/** Benchmark vs you, as two horizontal bars. */
function compareBars(ctx, x, y, w, bench, you, max, p, { city, accent = ACCENT }) {
  label(ctx, `${city} benchmark`, x, y, { size: 38, weight: 700, color: C.mute, align: 'left' });
  label(ctx, inr(bench), x + w, y, { size: 48, weight: 800, align: 'right' });
  ctx.fillStyle = '#ECEAE4';
  rr(ctx, x, y + 44, w, 60, 30);
  ctx.fill();
  ctx.fillStyle = '#9C98A8';
  rr(ctx, x, y + 44, (w * bench * ease.outCubic(p)) / max, 60, 30);
  ctx.fill();
  label(ctx, 'You', x, y + 180, { size: 38, weight: 700, color: C.mute, align: 'left' });
  label(ctx, inr(you), x + w, y + 180, { size: 48, weight: 800, align: 'right' });
  ctx.fillStyle = '#ECEAE4';
  rr(ctx, x, y + 224, w, 60, 30);
  ctx.fill();
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, lighten(accent, 0.2));
  g.addColorStop(1, accent);
  ctx.fillStyle = g;
  rr(ctx, x, y + 224, (w * you * ease.outCubic(p)) / max, 60, 30);
  ctx.fill();
}

function cityCard(ctx, x, y, name, sub, q, { tilt = 0, color = ACCENT } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(q, q);
  softShadow(ctx, -200, -150, 400, 300, 40, { spread: 30, alpha: 0.16, dy: 20 });
  ctx.fillStyle = '#fff';
  rr(ctx, -200, -150, 400, 300, 40);
  ctx.fill();
  icon(ctx, 'pin', 0, -50, 110, { color, lw: 8, fill: lighten(color, 0.8) });
  label(ctx, name, 0, 60, { size: 44, weight: 800 });
  label(ctx, sub, 0, 108, { size: 26, weight: 600, color: C.mute });
  ctx.restore();
}

export default function story({ timeline, logo }) {
  const L = Object.fromEntries(timeline.lines.map((l) => [l.id, l]));
  const hookDur = L.lie.start - 0.12;

  return [
    hookScene({ text: '₹18 lakh a year. *₹75,000* a month, spent.', card: hookCard, accent: ACCENT, size: 84 }),
    slamScene({ pre: 'Is that good? The internet is', word: 'LYING.', needle: 'lying', sub: 'to you.', card: hookCard, accent: ACCENT, hookDur }),

    // ---- two cities → Mumbai
    {
      at: 'lands',
      trans: 'whip',
      mood: 'tension',
      draw(ctx, s) {
        const { t } = s;
        paper(ctx, t, ACCENT, 'cities');
        const ln = s.line('lands');
        const gn = s.line('gone');
        const toBars = ease.inOutCubic(clamp((t - gn.s + 0.1) / 0.5));
        const qa = spring(t - ln.s, 10, 0.5);
        const qb = spring(t - ln.s - 0.15, 10, 0.5);
        cityCard(ctx, lerp(290, W / 2, toBars), lerp(1000, 720, toBars), 'Mumbai', 'Metro · ×1.15', qa * lerp(1.15, 0.85, toBars), { tilt: lerp(-0.04, 0, toBars) });
        ctx.save();
        ctx.globalAlpha = 1 - toBars;
        cityCard(ctx, 790, 1000, 'Indore', 'Tier-2 · ×0.95', qb * 1.15, { tilt: 0.04 });
        ctx.restore();
        if (toBars > 0) {
          ctx.save();
          ctx.globalAlpha = toBars;
          compareBars(ctx, 120, 1000, 840, 59800, 75000, 80000, clamp((t - gn.s - 0.2) / 0.8), { city: 'Mumbai' });
          const cq = ease.outBack(clamp((t - s.word('gone', 'close')) / 0.35));
          if (cq > 0) pill(ctx, W / 2, 1400, 'Close to benchmark', { size: 36, bg: '#FFF4DE', fg: darken(AMBER, 0.3), alpha: clamp(cq) });
          ctx.restore();
        }
        label(ctx, 'Monthly expenses · age 30', W / 2, 1520, { size: 28, weight: 600, color: C.mute, alpha: toBars });
        headlines(ctx, s, [['lands', 'Same numbers. *Two cities.*'], ['gone', 'Mumbai: *₹59,800* benchmark.', { size: 80 }]], { accent: ACCENT });
      },
      sfx: (s) => [[s.line('lands').s, 'pop', 0.8], [s.line('lands').s + 0.15, 'pop', 0.8], [s.line('gone').s, 'swoosh', 0.6], [s.word('gone', 'close'), 'ding', 0.5]],
    },

    questionScene({ text: 'In *Indore?*', accent: ACCENT, size: 120 }),

    // ---- Indore, and the two verdicts
    {
      at: 'l1',
      trans: 'whip',
      mood: 'groove',
      draw(ctx, s) {
        const { t } = s;
        paper(ctx, t, ACCENT, 'indore');
        const [a, b, c, d] = ['l1', 'l2', 'l3', 'l4'].map((id) => s.line(id));
        const toVerdict = ease.inOutCubic(clamp((t - b.s + 0.1) / 0.5));
        ctx.save();
        ctx.globalAlpha = 1 - toVerdict;
        cityCard(ctx, W / 2, 720, 'Indore', 'Tier-2 · ×0.95', 0.85);
        compareBars(ctx, 120, 1000, 840, 34200, 75000, 80000, clamp((t - a.s) / 0.9), { city: 'Indore' });
        const xq = ease.outBack(clamp((t - s.word('l1', 'double')) / 0.35), 2);
        if (xq > 0) {
          ctx.save();
          ctx.translate(W / 2, 1440);
          ctx.scale(xq, xq);
          sphere(ctx, 0, 0, 110, C.loss, { shadow: false });
          label(ctx, '2.2×', 0, 4, { size: 70, weight: 900, color: '#fff' });
          ctx.restore();
        }
        ctx.restore();
        if (toVerdict > 0) {
          // same salary = same spend = two verdicts
          const rowsY = [760, 900];
          [['Salary', '₹18 L / yr', b], ['Spend', '₹75,000 / mo', c]].forEach(([n, v, ln], i) => {
            const q = ease.outBack(clamp((t - ln.s + 0.05) / 0.35));
            if (q <= 0) return;
            ctx.save();
            ctx.globalAlpha = toVerdict * clamp(q);
            label(ctx, n, 110, rowsY[i], { size: 34, weight: 700, color: C.mute, align: 'left' });
            label(ctx, v, 470, rowsY[i], { size: 40, weight: 800, align: 'center' });
            label(ctx, '=', 680, rowsY[i], { size: 56, weight: 800, color: ACCENT });
            label(ctx, v, 870, rowsY[i], { size: 40, weight: 800, align: 'center' });
            ctx.restore();
          });
          const vq = [spring(t - d.s, 11, 0.5), spring(t - d.s - 0.15, 11, 0.5)];
          [['Mumbai', 'Close to benchmark', AMBER, 290], ['Indore', 'More than double', C.loss, 790]].forEach(([city, verdict, col, x], i) => {
            if (t < d.s + i * 0.15) return;
            ctx.save();
            ctx.translate(x, 1250);
            ctx.scale(vq[i], vq[i]);
            softShadow(ctx, -220, -170, 440, 340, 40, { spread: 30, alpha: 0.16, dy: 20 });
            ctx.fillStyle = '#fff';
            rr(ctx, -220, -170, 440, 340, 40);
            ctx.fill();
            ctx.fillStyle = col;
            rr(ctx, -220, -170, 440, 18, 9);
            ctx.fill();
            label(ctx, city, 0, -90, { size: 44, weight: 800 });
            iconTile(ctx, i ? 'cross' : 'check', 0, 10, 90, col);
            label(ctx, verdict, 0, 110, { size: 30, weight: 800, color: darken(col, 0.15) });
            ctx.restore();
          });
        }
        headlines(ctx, s, [
          ['l1', 'Indore: *₹34,200.*'],
          ['l2', 'Same salary.'],
          ['l3', 'Same spend.'],
          ['l4', 'Two *verdicts.*'],
        ], { accent: C.loss, y: 300, size: 92 });
      },
      sfx: (s) => [[s.line('l1').s, 'slide', 0.6], [s.word('l1', 'double'), 'impact', 0.6], [s.line('l2').s, 'pop', 0.6], [s.line('l3').s, 'pop', 0.6], [s.line('l4').s, 'pop', 0.8], [s.line('l4').s + 0.15, 'pop', 0.8]],
    },

    nightScene({
      text: 'Comparing with friends measures *noise.*',
      accent: ACCENT,
      glow: '#9B5CFF',
      content(ctx, s) {
        const { t } = s;
        const msgs = ['I save 60%!', 'Just bought a car', 'My SIP is ₹50k', 'Crypto 10x', 'New phone again', 'I spend nothing', 'Promoted!', 'Moving to Dubai', 'Index funds only', 'F&O is easy'];
        const R = rng('chat');
        msgs.forEach((m, i) => {
          const x0 = 120 + R() * 840;
          const y0 = 760 + R() * 900;
          const sp = 0.6 + R();
          const x = x0 + Math.sin(t * sp * 2 + i) * 60;
          const y = y0 + Math.cos(t * sp * 1.6 + i * 2) * 40;
          const q = ease.outBack(clamp((t - 0.1 - i * 0.12) / 0.3));
          if (q <= 0) return;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.sin(t * 3 + i) * 0.08);
          ctx.scale(q, q);
          ctx.font = '700 34px Geist';
          const w = ctx.measureText(m).width + 60;
          ctx.fillStyle = i % 2 ? 'rgba(124,92,255,0.9)' : 'rgba(255,255,255,0.92)';
          rr(ctx, -w / 2, -38, w, 76, 38);
          ctx.fill();
          label(ctx, m, 0, 0, { size: 34, weight: 700, color: i % 2 ? '#fff' : C.ink });
          ctx.restore();
        });
        // TV static
        const R2 = rng('static' + (s.frame % 6));
        ctx.save();
        ctx.globalAlpha = 0.12;
        for (let k = 0; k < 400; k++) {
          ctx.fillStyle = R2() > 0.5 ? '#fff' : '#000';
          ctx.fillRect(R2() * W, 600 + R2() * 1320, 2 + R2() * 6, 2);
        }
        ctx.restore();
      },
    }),

    revealScene({ toolName: 'PeerCompare', accent: ACCENT, logo }),

    // ---- inputs → cost-of-living adjusted
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
        const box = appWindow(ctx, 70, lerp(H, 440, enter), 940, 1220, { title: 'PeerCompare', accent: ACCENT, iconName: 'users' });
        const toCities = ease.inOutCubic(clamp((t - gp.s + 0.1) / 0.5));
        ctx.save();
        ctx.globalAlpha = 1 - toCities;
        const fieldsAt = [s.word('split', 'age'), s.word('split', 'city'), s.word('split', 'income'), s.word('split', 'few')];
        const vals = [['Age', '30'], ['City', 'Indore  ▾'], ['Monthly income', '₹1,50,000'], ['Monthly expenses', '₹75,000']];
        vals.forEach(([lab, v], i) => {
          const q = ease.outCubic(clamp((t - fieldsAt[i] + 0.1) / 0.3));
          const n = Math.floor(clamp((t - fieldsAt[i]) * 14, 0, v.length));
          field(ctx, box.x, box.y + i * 170, box.w, lab, v.slice(0, n) || ' ', { focus: t > fieldsAt[i] - 0.1 && t < fieldsAt[i] + 0.7 ? 1 : 0, accent: ACCENT, alpha: q });
        });
        label(ctx, '+ savings, investments, debt, savings rate', box.x, box.y + 720, { size: 26, weight: 600, color: C.mute, align: 'left', alpha: ease.outCubic(clamp((t - fieldsAt[3] - 0.3) / 0.4)) });
        ctx.restore();
        if (toCities > 0) {
          ctx.save();
          ctx.globalAlpha = toCities;
          label(ctx, 'Cost-of-living multiplier', box.x, box.y, { size: 30, weight: 800, align: 'left', baseline: 'top' });
          let x = 0;
          let y = 0;
          CITIES.forEach(([n, col], i) => {
            const txt = `${n} ×${col.toFixed(2)}`;
            ctx.font = '700 26px Geist';
            const w = ctx.measureText(txt).width + 26 * 1.6;
            if (x + w > box.w) {
              x = 0;
              y += 84;
            }
            const q = ease.outBack(clamp((t - gp.s - 0.1 - i * 0.07) / 0.3), 2);
            if (q > 0) {
              ctx.save();
              ctx.translate(box.x + x + w / 2, box.y + 110 + y);
              ctx.scale(q, q);
              chip(ctx, 0, 0, txt, { on: n === 'Indore' || n === 'Mumbai' ? 1 : 0, accent: ACCENT, size: 26 });
              ctx.restore();
            }
            x += w + 14;
          });
          ctx.restore();
        }
        headlines(ctx, s, [['split', 'Your age. Your *city.*'], ['gap', '14 cities. Plus tier *2 and 3.*']], { accent: ACCENT, y: 250, size: 80 });
      },
      sfx: (s) => [[0.05, 'swoosh', 0.6], [s.word('split', 'age'), 'type', 0.5], [s.word('split', 'city'), 'type', 0.5], [s.word('split', 'income'), 'type', 0.5], [s.line('gap').s + 0.1, 'sparkle', 0.6]],
    },

    // ---- each metric on its own scale
    {
      at: 'stamp',
      trans: 'cut',
      mood: 'drop',
      push: 0,
      draw(ctx, s) {
        const { t } = s;
        bgPaper(ctx, ACCENT);
        const box = appWindow(ctx, 70, 440, 940, 1220, { title: 'PeerCompare · Indore, age 30', accent: ACCENT, iconName: 'users' });
        const st = s.line('stamp');
        METRICS.forEach((m, i) => {
          const y = box.y + 20 + i * 150;
          const q = ease.outCubic(clamp((t - st.s - i * (st.d / 7)) / 0.5));
          ctx.save();
          ctx.globalAlpha = clamp(q * 2);
          label(ctx, m.l, box.x, y, { size: 30, weight: 700, align: 'left', baseline: 'top' });
          label(ctx, m.st, box.x + box.w, y, { size: 26, weight: 800, align: 'right', baseline: 'top', color: stColor(m.st) });
          const by = y + 56;
          ctx.fillStyle = '#EFEDE8';
          rr(ctx, box.x, by, box.w, 26, 13);
          ctx.fill();
          ctx.fillStyle = stColor(m.st);
          rr(ctx, box.x, by, (box.w * m.pct * q) / 100, 26, 13);
          ctx.fill();
          ctx.fillStyle = C.ink;
          ctx.fillRect(box.x + box.w * 0.5 - 2, by - 10, 4, 46);
          ctx.restore();
        });
        label(ctx, '│ = benchmark for your bracket and city', box.x, box.y + 930, { size: 24, weight: 600, color: C.mute, align: 'left' });
        headlines(ctx, s, [['stamp', 'Each on its *own scale.*', { at: st.s + st.d * 0.6, span: 0.6 }]], { accent: ACCENT, y: 270, size: 84 });
      },
      sfx: (s) => Array.from({ length: 6 }, (_, i) => [s.line('stamp').s + i * (s.line('stamp').d / 7), 'pop', 0.45]),
    },

    // ---- start with the weakest
    {
      at: 'feature',
      trans: 'zoom',
      mood: 'groove',
      draw(ctx, s) {
        const { t } = s;
        paper(ctx, t, ACCENT, 'weak');
        const f = s.line('feature');
        const ex = s.word('feature', 'expenses');
        const p = spring(t - 0.1, 10, 0.55);
        ctx.save();
        ctx.translate(W / 2, 1050);
        ctx.scale(p, p);
        softShadow(ctx, -440, -260, 880, 520, 50, { spread: 50, alpha: 0.2, dy: 30 });
        ctx.fillStyle = '#fff';
        rr(ctx, -440, -260, 880, 520, 50);
        ctx.fill();
        const glow = 0.5 + 0.5 * Math.sin(t * 6);
        ctx.strokeStyle = rgba(C.loss, t > ex ? 0.5 + 0.5 * glow : 0);
        ctx.lineWidth = 8;
        rr(ctx, -440, -260, 880, 520, 50);
        ctx.stroke();
        label(ctx, 'Weakest metric', -380, -170, { size: 32, weight: 700, color: C.mute, align: 'left' });
        label(ctx, 'Monthly expenses', -380, -100, { size: 52, weight: 800, align: 'left' });
        tabular(ctx, '15th', -380, 40, 140, { align: 'left', weight: 900, color: C.loss });
        label(ctx, 'percentile vs benchmark', -380, 150, { size: 30, weight: 600, color: C.ink2, align: 'left' });
        ctx.restore();
        const sq = spring(t - ex - 0.1, 12, 0.5);
        if (t > ex) {
          ctx.save();
          ctx.translate(780, 1340);
          ctx.rotate(-0.08);
          ctx.scale(sq, sq);
          ctx.fillStyle = C.loss;
          rr(ctx, -150, -46, 300, 92, 46);
          ctx.fill();
          label(ctx, 'Start here', 0, 2, { size: 38, weight: 800, color: '#fff' });
          ctx.restore();
        }
        headlines(ctx, s, [['feature', 'Start with the *weakest.*', { span: 0.7 }]], { accent: C.loss, y: 380, size: 92 });
      },
      sfx: (s) => [[0.1, 'pop', 0.8], [s.word('feature', 'expenses'), 'ding', 0.7], [s.word('feature', 'expenses') + 0.1, 'pop', 0.8]],
    },

    morningScene({
      text: 'Check back in a few *months.*',
      accent: ACCENT,
      content(ctx, s) {
        const { t } = s;
        const p = spring(t - 0.2, 9, 0.6);
        phone(ctx, 520, lerp(2300, 1100, p), 470, {
          lock: false,
          screenTop: '#FFFFFF',
          screenBot: '#F4F3EF',
          content(c, box) {
            const x = box.x + 34;
            const w = box.w - 68;
            icon(c, 'lock', box.x + box.w / 2, box.y + 210, 120, { color: ACCENT, lw: 9, fill: '#F2EEFF' });
            label(c, 'Private by design', box.x + box.w / 2, box.y + 330, { size: 30, weight: 800 });
            const lines = ["No one else's data", 'is read to compare you.', 'Benchmarks are a', 'calibrated model.'];
            lines.forEach((ln, i) => label(c, ln, box.x + box.w / 2, box.y + 390 + i * 36, { size: 24, weight: 600, color: C.ink2, alpha: ease.outCubic(clamp((t - 0.6 - i * 0.1) / 0.4)) }));
          },
        });
        calendarChip(ctx, 880, 820, t, 'Oct', 'Jan', s.word('morning', 'months') - 0.2, { month: 'RE-CHECK', size: 0.9, color: ACCENT, alpha: ease.outCubic(clamp((t - 1) / 0.4)) });
      },
    }),

    taglineScene({ a: 'Less comparing.', b: 'More *clarity.*', accent: ACCENT }),
    endScene({ toolName: 'PeerCompare', accent: ACCENT, logo, iconName: 'users', toolId: 'peercompare' }),
  ];
}
