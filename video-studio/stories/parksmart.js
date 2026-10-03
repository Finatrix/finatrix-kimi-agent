// ParkSmart — every figure is computeParkSmart(500000, '6-12' (9 months), slab) from src/tools/lib/parksmart.ts.
import { W, H, C, clamp, lerp, ease, spring, inr, rng, lighten, darken, rgba } from '../engine/core.js';
import { rr, softShadow, sphere, meltBlob, bubbles, burst, critter, floorShadow, stamp, pill, tabular, embossText, ring, bgPaper } from '../engine/draw.js';
import { kinetic, label } from '../engine/text.js';
import { icon, iconTile } from '../engine/icons.js';
import { appWindow, field, segmented, rankList, phone, chip } from '../engine/ui.js';
import { hookScene, slamScene, questionScene, nightScene, revealScene, morningScene, taglineScene, endScene } from '../engine/scenes.js';
import { blink, countTo, headlines, paper, crown, HEAD_Y } from '../engine/kit.js';

const ACCENT = '#FF6B5E';
const A_COL = '#FF8A3D'; // short duration fund
const B_COL = '#7C5CFF'; // arbitrage fund

// ranked by headline rate, then by what you keep at a 30% slab (top six of the real ranking)
const ROWS = [
  { n: 'Short duration fund', rate: '7.4%', keep: '₹19,425', liquid: true },
  { n: 'Arbitrage fund', rate: '7.1%', keep: '₹21,300', liquid: true },
  { n: 'Liquid mutual fund', rate: '7.0%', keep: '₹18,375', liquid: true },
  { n: 'Bank FD (1 yr)', rate: '7.0%', keep: '₹18,375', liquid: false },
  { n: 'Ultra short duration', rate: '7.0%', keep: '₹18,375', liquid: true },
  { n: 'Money market fund', rate: '6.8%', keep: '₹17,850', liquid: true },
];

function hookCard(ctx, w, h, t) {
  iconTile(ctx, 'park', 92, 96, 84, ACCENT);
  label(ctx, 'Idle cash', 156, 80, { size: 38, weight: 700, align: 'left' });
  label(ctx, 'Savings account', 156, 122, { size: 28, weight: 600, color: C.mute, align: 'left' });
  tabular(ctx, '₹5,00,000', 56, 270, 132, { align: 'left', weight: 800 });
  // parking meter ticking through nine months
  const m = Math.min(9, Math.floor(clamp((t - 0.4) / 2.2) * 9) + 1);
  label(ctx, 'Parked for', 56, 400, { size: 30, weight: 600, color: C.mute, align: 'left' });
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = i < m ? ACCENT : '#ECEAE4';
    rr(ctx, 56 + i * 76, 440, 64, 26, 8);
    ctx.fill();
  }
  label(ctx, `${m} month${m > 1 ? 's' : ''}`, w - 56, 400, { size: 30, weight: 800, align: 'right' });
}

/** The two funds as spheres; returns nothing. State drives size/labels/crown. */
function duo(ctx, t, { aVal, bVal, aSub, bSub, aScale = 1, bScale = 1, crownOn = 0, crownT = 0, enter = 1, aMelt = 0, glowB = 0 }) {
  const ax = 300;
  const bx = 780;
  const y = 1040;
  const ar = 210 * aScale * enter;
  const br = 210 * bScale * enter;
  if (aMelt > 0) meltBlob(ctx, ax, y, 210 * aScale, A_COL, aMelt * 0.55, 1300, 'psmelt', aVal, 76);
  else if (ar > 2) {
    sphere(ctx, ax, y, ar, A_COL, { shadowY: 1270 });
    embossText(ctx, aVal, ax, y, 76 * enter * aScale, { max: ar * 1.5 });
  }
  if (glowB > 0) {
    const g = ctx.createRadialGradient(bx, y, br * 0.8, bx, y, br * 1.8);
    g.addColorStop(0, rgba('#FFE27A', 0.55 * glowB));
    g.addColorStop(1, rgba('#FFE27A', 0));
    ctx.fillStyle = g;
    ctx.fillRect(bx - br * 2, y - br * 2, br * 4, br * 4);
  }
  if (br > 2) {
    sphere(ctx, bx, y, br, B_COL, { shadowY: 1270 });
    embossText(ctx, bVal, bx, y, 76 * enter * bScale, { max: br * 1.5, color: 'rgba(255,255,255,0.92)' });
  }
  pill(ctx, ax, 1370, 'Short duration fund', { size: 28, alpha: enter });
  pill(ctx, bx, 1370, 'Arbitrage fund', { size: 28, alpha: enter });
  if (aSub) label(ctx, aSub, ax, 1450, { size: 30, weight: 700, color: C.ink2, alpha: enter });
  if (bSub) label(ctx, bSub, bx, 1450, { size: 30, weight: 700, color: C.ink2, alpha: enter });
  if (crownOn > 0) {
    const cx = lerp(ax, bx, ease.inOutCubic(crownT));
    const hop = Math.sin(crownT * Math.PI) * 220;
    const r = lerp(ar, br, crownT);
    crown(ctx, cx, y - r - 90 - hop, 150 * crownOn, t);
  }
}

export default function story({ timeline, logo }) {
  const L = Object.fromEntries(timeline.lines.map((l) => [l.id, l]));
  const hookDur = L.lie.start - 0.12;

  return [
    hookScene({ text: '₹5 lakh. Parked for *nine months.*', card: hookCard, accent: ACCENT, size: 88 }),
    slamScene({ pre: 'Every rate comparison is', word: 'LYING.', needle: 'lying', sub: 'to you.', card: hookCard, accent: ACCENT, hookDur }),

    // ---- two funds, the higher rate "wins"
    {
      at: 'lands',
      trans: 'whip',
      mood: 'tension',
      draw(ctx, s) {
        const { t } = s;
        paper(ctx, t, ACCENT, 'duo');
        const ln = s.line('lands');
        const gn = s.line('gone');
        const ea = spring(t - ln.s, 10, 0.5);
        const eb = spring(t - s.word('lands', 'arbitrage') + 0.1, 10, 0.5);
        const ax = 300;
        const bx = 780;
        if (ea > 0.01) {
          sphere(ctx, ax, 1040, 220 * ea, A_COL, { shadowY: 1270 });
          embossText(ctx, '7.4%', ax, 1040, 84 * ea);
          pill(ctx, ax, 1370, 'Short duration fund', { size: 28, alpha: clamp(ea) });
        }
        if (eb > 0.01) {
          sphere(ctx, bx, 1040, 210 * eb, B_COL, { shadowY: 1270 });
          embossText(ctx, '7.1%', bx, 1040, 84 * eb, { color: 'rgba(255,255,255,0.92)' });
          pill(ctx, bx, 1370, 'Arbitrage fund', { size: 28, alpha: clamp(eb) });
        }
        const cr = spring(t - gn.s - 0.1, 12, 0.45);
        if (t > gn.s - 0.1) crown(ctx, ax, 1040 - 220 - 90 - (1 - cr) * 300, 150, t, clamp(cr));
        label(ctx, 'headline rate', W / 2, 1520, { size: 28, weight: 600, color: C.mute, alpha: clamp(eb) });
        headlines(ctx, s, [['lands', '*7.4%* vs *7.1%*', { size: 110 }], ['gone', 'Higher rate wins. *Obviously.*']], { accent: ACCENT });
      },
      sfx: (s) => [[s.line('lands').s, 'pop', 0.8], [s.word('lands', 'arbitrage') - 0.1, 'pop', 0.8], [s.line('gone').s, 'coin', 0.6], [s.line('gone').s + 0.1, 'ding', 0.5]],
    },

    questionScene({ text: '*Right?*', accent: ACCENT, size: 130 }),

    // ---- add the slab: the winner flips
    {
      at: 'l1',
      trans: 'whip',
      mood: 'groove',
      draw(ctx, s) {
        const { t } = s;
        paper(ctx, t, ACCENT, 'flip');
        const [a, b, c, d] = ['l1', 'l2', 'l3', 'l4'].map((id) => s.line(id));
        // slab selector
        const sq = ease.outBack(clamp((t - a.s) / 0.4));
        const sel = t < c.s ? 0 : ease.inOutCubic(clamp((t - c.s) / 0.4));
        ctx.save();
        ctx.translate(W / 2, 560);
        ctx.scale(sq, sq);
        label(ctx, 'Your tax slab', 0, -70, { size: 30, weight: 700, color: C.mute });
        segmented(ctx, -260, -42, 520, ['5%', '30%'], sel, { accent: sel > 0.5 ? C.loss : C.gain, h: 92, size: 40 });
        ctx.restore();
        const showKeep = t > b.s - 0.1;
        const aMelt = clamp((t - c.s - 0.2) / 0.9);
        const flip = clamp((t - s.word('l4', 'winner') + 0.1) / 0.7);
        const aVal = !showKeep ? '7.4%' : t < c.s + 0.4 ? '₹26,363' : '₹19,425';
        duo(ctx, t, {
          aVal,
          bVal: showKeep ? '₹21,300' : '7.1%',
          aSub: showKeep ? (t < c.s + 0.4 ? 'keeps 7.03%' : 'keeps 5.18%') : null,
          bSub: showKeep ? 'keeps 5.68%' : null,
          aScale: lerp(1, 0.78, ease.inOutCubic(aMelt)) * (showKeep && t < c.s ? 1.06 : 1),
          bScale: 1 + 0.08 * ease.outBack(flip),
          crownOn: 1,
          crownT: ease.inOutCubic(flip),
          aMelt: aMelt > 0 && aMelt < 1 ? aMelt : 0,
          glowB: flip,
        });
        if (t > c.s + 0.3) burst(ctx, t - c.s - 0.3, 300, 900, { seed: 'tax', n: 16, colors: [C.loss, '#fff'], speed: 600, gravity: 1200, size: 9, life: 0.9 });
        headlines(ctx, s, [
          ['l1', 'Add your *tax slab.*'],
          ['l2', 'At 5%? *₹26,363* kept.'],
          ['l3', 'At 30%? *₹19,425.*', { accent: C.loss }],
          ['l4', 'Arbitrage keeps *₹21,300.*', { accent: B_COL }],
          ['l4', 'The winner *flips.*', { at: s.word('l4', 'winner') - 0.15, accent: B_COL, keep: true }],
        ], { accent: A_COL, y: 300 });
        label(ctx, 'on ₹5,00,000 over 9 months', W / 2, 1530, { size: 28, weight: 600, color: C.mute, alpha: showKeep ? 1 : 0 });
      },
      sfx: (s) => [[s.line('l1').s, 'pop', 0.8], [s.line('l2').s, 'coin', 0.6], [s.line('l3').s, 'slide', 0.8], [s.line('l3').s + 0.3, 'drip', 0.8], [s.word('l4', 'winner') - 0.1, 'whoosh', 0.7], [s.word('l4', 'winner') + 0.6, 'chime', 0.7]],
    },

    nightScene({
      text: 'Rate tables never show you *that column.*',
      accent: ACCENT,
      glow: '#FF4D6D',
      content(ctx, s) {
        const { t } = s;
        const p = spring(t - 0.2, 9, 0.6);
        ctx.save();
        ctx.translate(0, (1 - p) * 600);
        const x0 = 90;
        const y0 = 760;
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        rr(ctx, x0, y0, 900, 760, 30);
        ctx.fill();
        label(ctx, 'Option', x0 + 40, y0 + 60, { size: 30, weight: 800, color: 'rgba(255,255,255,0.7)', align: 'left' });
        label(ctx, 'Rate', x0 + 560, y0 + 60, { size: 30, weight: 800, color: 'rgba(255,255,255,0.7)', align: 'center' });
        ROWS.forEach((r, i) => {
          const y = y0 + 140 + i * 100;
          label(ctx, r.n, x0 + 40, y, { size: 30, weight: 600, color: 'rgba(255,255,255,0.85)', align: 'left' });
          label(ctx, r.rate, x0 + 560, y, { size: 34, weight: 800, color: '#FFFFFF' });
        });
        // the missing after-tax column
        const blink = 0.5 + 0.5 * Math.sin(t * 6);
        ctx.setLineDash([12, 10]);
        ctx.strokeStyle = rgba(ACCENT, 0.5 + 0.5 * blink);
        ctx.lineWidth = 5;
        rr(ctx, x0 + 660, y0 + 20, 210, 720, 24);
        ctx.stroke();
        ctx.setLineDash([]);
        label(ctx, 'After tax', x0 + 765, y0 + 60, { size: 28, weight: 800, color: ACCENT });
        ROWS.forEach((r, i) => label(ctx, '?', x0 + 765, y0 + 140 + i * 100, { size: 44, weight: 900, color: rgba(ACCENT, 0.4 + 0.6 * blink) }));
        ctx.restore();
      },
    }),

    revealScene({ toolName: 'ParkSmart', accent: ACCENT, logo }),

    // ---- inputs → ranked by what you keep
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
        const box = appWindow(ctx, 70, lerp(H, 440, enter), 940, 1220, { title: 'ParkSmart', accent: ACCENT, iconName: 'park' });
        const toRank = ease.inOutCubic(clamp((t - gp.s + 0.1) / 0.5));
        ctx.save();
        ctx.globalAlpha = 1 - toRank;
        const amtAt = s.word('split', 'amount');
        const v = '₹5,00,000'.slice(0, Math.floor(clamp((t - amtAt) * 14, 0, 9)));
        field(ctx, box.x, box.y, box.w, 'Amount to park', v || ' ', { focus: t > amtAt - 0.1 && t < s.word('split', 'horizon') ? 1 : 0, accent: ACCENT });
        label(ctx, 'Horizon', box.x, box.y + 180, { size: 26, weight: 600, color: C.mute, align: 'left', baseline: 'top' });
        segmented(ctx, box.x, box.y + 220, box.w, ['<1 mo', '1–3 mo', '3–6 mo', '6–12 mo', '1 yr+'], lerp(0, 3, ease.inOutCubic(clamp((t - s.word('split', 'horizon')) / 0.5))), { accent: ACCENT, size: 24 });
        label(ctx, 'Income-tax slab', box.x, box.y + 350, { size: 26, weight: 600, color: C.mute, align: 'left', baseline: 'top' });
        segmented(ctx, box.x, box.y + 390, box.w, ['5%', '10%', '20%', '30%'], lerp(0, 3, ease.inOutCubic(clamp((t - s.word('split', 'slab')) / 0.5))), { accent: C.loss, size: 28 });
        ctx.restore();
        if (toRank > 0) {
          ctx.save();
          ctx.globalAlpha = toRank;
          label(ctx, 'Option', box.x + 88, box.y + 4, { size: 24, weight: 700, color: C.mute, align: 'left', baseline: 'top' });
          const rp = ease.inOutCubic(clamp((t - s.word('gap', 'keep')) / 0.8));
          label(ctx, rp < 0.5 ? 'Rate' : 'You keep', box.x + box.w - 32, box.y + 4, { size: 24, weight: 700, color: rp < 0.5 ? C.mute : ACCENT, align: 'right', baseline: 'top' });
          rankList(ctx, box.x, box.y + 50, box.w, ROWS, [0, 1, 2, 3, 4, 5], [1, 0, 2, 3, 4, 5], rp, {
            accent: ACCENT,
            valueA: ROWS.map((r) => r.rate),
            valueB: ROWS.map((r) => r.keep),
            rowH: 112,
          });
          label(ctx, '₹5,00,000 · 9 months · 30% slab', box.x, box.y + 760, { size: 26, weight: 600, color: C.mute, align: 'left', alpha: toRank });
          ctx.restore();
        }
        headlines(ctx, s, [['split', 'Amount. Horizon. *Slab.*'], ['gap', 'Ranked by what you *keep.*']], { accent: ACCENT, y: 250, size: 80 });
      },
      sfx: (s) => [[0.05, 'swoosh', 0.6], [s.word('split', 'amount'), 'type', 0.6], [s.word('split', 'horizon'), 'slide', 0.5], [s.word('split', 'slab'), 'slide', 0.5], [s.word('gap', 'keep'), 'whoosh', 0.6], [s.word('gap', 'keep') + 0.8, 'ding', 0.6]],
    },

    // ---- read the post-tax column
    {
      at: 'stamp',
      trans: 'cut',
      mood: 'drop',
      push: 0,
      draw(ctx, s) {
        const { t } = s;
        bgPaper(ctx, ACCENT);
        const box = appWindow(ctx, 70, 440, 940, 1220, { title: 'ParkSmart', accent: ACCENT, iconName: 'park' });
        label(ctx, 'Option', box.x + 88, box.y + 4, { size: 24, weight: 700, color: C.mute, align: 'left', baseline: 'top' });
        label(ctx, 'You keep', box.x + box.w - 32, box.y + 4, { size: 24, weight: 700, color: ACCENT, align: 'right', baseline: 'top' });
        rankList(ctx, box.x, box.y + 50, box.w, ROWS, [1, 0, 2, 3, 4, 5], [1, 0, 2, 3, 4, 5], 1, { accent: ACCENT, valueA: ROWS.map((r) => r.keep), valueB: ROWS.map((r) => r.keep), rowH: 112 });
        // highlight the column
        const hl = ease.outCubic(clamp((t - s.word('stamp', 'post-tax')) / 0.4));
        ctx.save();
        ctx.strokeStyle = rgba(ACCENT, hl);
        ctx.lineWidth = 8;
        rr(ctx, box.x + box.w - 220, box.y - 10, 220, 740, 26);
        ctx.stroke();
        ctx.restore();
        // the rate you were sold, crossed out
        const xq = ease.outCubic(clamp((t - s.word('stamp', 'rate')) / 0.4));
        if (xq > 0) {
          pill(ctx, box.x + 200, box.y + 850, 'Headline rate', { size: 34, bg: '#F2F1ED', fg: C.mute, shadow: false });
          ctx.strokeStyle = C.loss;
          ctx.lineWidth = 8;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(box.x + 70, box.y + 850);
          ctx.lineTo(box.x + 70 + 260 * xq, box.y + 850);
          ctx.stroke();
        }
        stamp(ctx, t - s.word('stamp', 'post-tax') - 0.3, box.x + box.w - 160, box.y + 860, 'READ THIS', { color: ACCENT, size: 54, rot: -0.12 });
        headlines(ctx, s, [['stamp', 'Read *after tax.* Not the rate.', { span: 1.2 }]], { accent: ACCENT, y: 270, size: 80 });
      },
      sfx: (s) => [[s.word('stamp', 'post-tax'), 'pop', 0.8], [s.word('stamp', 'post-tax') + 0.3, 'stamp', 1], [s.word('stamp', 'rate'), 'scratch', 0.6]],
    },

    // ---- liquidity flags
    {
      at: 'feature',
      trans: 'whip',
      mood: 'groove',
      draw(ctx, s) {
        const { t } = s;
        paper(ctx, t, ACCENT, 'liq');
        const f = s.line('feature');
        const lq = s.word('feature', 'liquidity');
        ROWS.slice(0, 5).forEach((r, i) => {
          const order = [1, 0, 2, 3, 4][i];
          const row = ROWS[order];
          const y = 700 + i * 150;
          const q = ease.outCubic(clamp((t - 0.1 - i * 0.08) / 0.4));
          ctx.save();
          ctx.globalAlpha = q;
          softShadow(ctx, 90, y, 900, 120, 30, { spread: 20, alpha: 0.1, dy: 10, steps: 4 });
          ctx.fillStyle = '#fff';
          rr(ctx, 90, y, 900, 120, 30);
          ctx.fill();
          label(ctx, row.n, 140, y + 60, { size: 34, weight: 700, align: 'left' });
          const bq = ease.outBack(clamp((t - lq - i * 0.12) / 0.35), 2);
          if (bq > 0) {
            ctx.save();
            ctx.translate(860, y + 60);
            ctx.scale(bq, bq);
            const ok = row.liquid;
            const w = 200;
            ctx.fillStyle = ok ? '#E8F8EF' : '#FDECEA';
            rr(ctx, -w / 2, -34, w, 68, 34);
            ctx.fill();
            icon(ctx, ok ? 'check' : 'lock', -w / 2 + 40, 0, 34, { color: ok ? C.gain : C.loss, lw: 12 });
            label(ctx, ok ? 'Liquid' : 'Locked', 12, 0, { size: 30, weight: 800, color: ok ? C.gain : C.loss });
            ctx.restore();
          }
          ctx.restore();
        });
        headlines(ctx, s, [['feature', 'Flags *liquidity,* too.', { span: 0.8 }]], { accent: ACCENT, size: 96, y: 380 });
        label(ctx, 'so you can actually exit', W / 2, 500, { size: 40, weight: 700, color: C.ink2, alpha: ease.outCubic(clamp((t - s.word('feature', 'exit') + 0.4) / 0.4)) });
      },
      sfx: (s) => [[s.word('feature', 'liquidity'), 'pop', 0.7], [s.word('feature', 'liquidity') + 0.36, 'pop', 0.7], [s.word('feature', 'liquidity') + 0.48, 'nope', 0.5]],
    },

    morningScene({
      text: 'Idle cash, finally *working.*',
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
            label(c, 'Best after tax', x, box.y + 120, { size: 30, weight: 800, align: 'left' });
            const q = ease.outBack(clamp((t - 0.8) / 0.4));
            c.save();
            c.globalAlpha = clamp(q);
            c.fillStyle = '#F5F2FF';
            rr(c, x, box.y + 170, w, 300, 30);
            c.fill();
            sphere(c, x + 80, box.y + 260, 46, B_COL, { shadow: false });
            label(c, 'Arbitrage fund', x + 150, box.y + 240, { size: 28, weight: 800, align: 'left' });
            label(c, 'Liquid · low risk', x + 150, box.y + 280, { size: 22, weight: 600, color: C.mute, align: 'left' });
            tabular(c, '₹21,300', x + 30, box.y + 390, 64, { align: 'left', weight: 900 });
            label(c, 'kept in 9 months', x + 30, box.y + 440, { size: 22, weight: 600, color: C.mute, align: 'left' });
            c.restore();
            label(c, 'Representative category rates,', x, box.y + 560, { size: 20, weight: 600, color: C.mute, align: 'left', alpha: clamp(q) });
            label(c, 'not live quotes.', x, box.y + 588, { size: 20, weight: 600, color: C.mute, align: 'left', alpha: clamp(q) });
          },
        });
      },
    }),

    taglineScene({ a: 'Less tax drag.', b: 'More *return.*', accent: ACCENT }),
    endScene({ toolName: 'ParkSmart', accent: ACCENT, logo, iconName: 'park', toolId: 'parksmart' }),
  ];
}
