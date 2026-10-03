// InvestMatch — allocations, risk note and projection are the real outputs of
// computeInvestMatch({ risk: 'aggressive', monthly: 20000 }) for horizons '10+' and '1-3'.
import { W, H, C, clamp, lerp, ease, spring, inr, lakhCr, rng, lighten, darken, rgba } from '../engine/core.js';
import { rr, softShadow, sphere, bubbles, burst, critter, floorShadow, stamp, pill, tabular, embossText, ring, bgPaper, bgNight, stars } from '../engine/draw.js';
import { kinetic, label } from '../engine/text.js';
import { icon, iconTile } from '../engine/icons.js';
import { appWindow, field, donut, lerpSlices, segmented, lineChart, phone, cursor } from '../engine/ui.js';
import { hookScene, slamScene, questionScene, nightScene, revealScene, morningScene, taglineScene, endScene } from '../engine/scenes.js';
import { blink, countTo, headlines, paper, HEAD_Y } from '../engine/kit.js';

const ACCENT = '#0A84FF';
const WORRY = '#FF9F0A';

// src/tools/lib/investmatch.ts IN_INVEST.alloc
const AGGR = [
  { n: 'Small-cap funds', p: 25, c: '#c2410c' }, { n: 'Mid-cap funds', p: 22, c: '#1d7d46' },
  { n: 'Large-cap funds', p: 13, c: '#0071e3' }, { n: 'International / US equity', p: 15, c: '#6e3bd4' },
  { n: 'ELSS (tax saver)', p: 10, c: '#b08a36' }, { n: 'Sectoral / thematic', p: 10, c: '#b3387a' },
  { n: 'High-risk / crypto', p: 5, c: '#0c8079' },
];
const CONS = [
  { n: 'Large-cap index fund', p: 25, c: '#0071e3' }, { n: 'Debt / bond funds', p: 30, c: '#1d7d46' },
  { n: 'PPF', p: 15, c: '#0c8079' }, { n: 'Fixed deposits', p: 15, c: '#b08a36' },
  { n: 'Gold (SGBs / ETF)', p: 10, c: '#c2410c' }, { n: 'Liquid fund', p: 5, c: '#6e3bd4' },
];
const RISK_NOTE = 'Your horizon is under 3 years, so we dialled the allocation to conservative — equity needs 5+ years to ride out volatility.';
// computeInvestMatch, aggressive, ₹20,000/mo, '10+' → 15 years
const FV = 12257076;
const REAL_FV = 5114449;
const INVESTED = 3600000;

function hookCard(ctx, w, h, t) {
  label(ctx, 'Risk quiz · Q3', 56, 70, { size: 30, weight: 600, color: C.mute, align: 'left' });
  label(ctx, 'How brave do you feel?', 56, 140, { size: 48, weight: 800, align: 'left' });
  const opts = ['Conservative', 'Moderate', 'Aggressive'];
  const pick = clamp((t - 1.0) / 0.3);
  opts.forEach((o, i) => {
    const y = 220 + i * 100;
    const on = i === 2 ? pick : 0;
    ctx.fillStyle = on ? rgba(ACCENT, 0.12 * on + 0.0) : '#F5F4F0';
    rr(ctx, 56, y, w - 112, 80, 22);
    ctx.fill();
    if (on) {
      ctx.strokeStyle = rgba(ACCENT, on);
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    ctx.strokeStyle = on > 0.5 ? ACCENT : '#C9C6BE';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(100, y + 40, 16, 0, Math.PI * 2);
    ctx.stroke();
    if (on > 0.5) {
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.arc(100, y + 40, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    label(ctx, o, 136, y + 40, { size: 34, weight: 700, align: 'left' });
  });
  if (t > 0.5 && t < 1.6) cursor(ctx, lerp(w - 80, 300, ease.inOutCubic(clamp((t - 0.5) / 0.5))), lerp(560, 445, ease.inOutCubic(clamp((t - 0.5) / 0.5))), { scale: 0.9, press: t > 1.0 && t < 1.15 ? 1 : 0 });
}

/** Illustrative market path (normalised): rise, crash, slow recovery. */
const PATH = [[0, 0.46], [0.08, 0.52], [0.16, 0.57], [0.24, 0.62], [0.3, 0.42], [0.36, 0.16], [0.44, 0.2], [0.52, 0.27], [0.6, 0.33], [0.7, 0.42], [0.8, 0.5], [0.9, 0.58], [1, 0.66]];

function chartY(px) {
  for (let i = 1; i < PATH.length; i++) {
    if (px <= PATH[i][0]) {
      const [x0, y0] = PATH[i - 1];
      const [x1, y1] = PATH[i];
      return lerp(y0, y1, (px - x0) / (x1 - x0));
    }
  }
  return PATH[PATH.length - 1][1];
}

export default function story({ timeline, logo }) {
  const L = Object.fromEntries(timeline.lines.map((l) => [l.id, l]));
  const hookDur = L.lie.start - 0.12;

  return [
    hookScene({ text: 'Every risk quiz asks how *brave* you feel.', card: hookCard, accent: ACCENT, size: 86 }),
    slamScene({ pre: "That's the", word: 'WRONG.', needle: 'wrong', sub: 'question.', card: hookCard, accent: ACCENT, hookDur }),

    // ---- twins: same answers, different deadlines
    {
      at: 'lands',
      trans: 'whip',
      mood: 'tension',
      draw(ctx, s) {
        const { t } = s;
        paper(ctx, t, ACCENT, 'twins');
        const ln = s.line('lands');
        const gn = s.line('gone');
        const same = s.word('lands', 'same');
        const shortAt = s.word('gone', 'other');
        [[300, 'A', '10+ years', 1.0, s.word('gone', 'ten')], [780, 'B', '1–3 years', 0.22, shortAt]].forEach(([x, nm, hz, len, at], i) => {
          const p = spring(t - ln.s - i * 0.12, 10, 0.5);
          const worried = i === 1 && t > shortAt + 0.2;
          const shiver = worried ? Math.sin(t * 40) * 4 : 0;
          critter(ctx, x + shiver, 1150 - 175 * p, 175 * p, worried ? lighten(ACCENT, 0.15) : ACCENT, {
            look: worried ? [-0.6, -0.4] : [i ? -0.3 : 0.3, 0.1],
            blink: blink(t, i * 4),
            mouth: worried ? { type: 'o', open: 0.6 } : { type: 'smile' },
            brow: worried ? 0.8 : 0,
          });
          if (worried) {
            // sweat drop
            const d = ((t - shortAt) * 1.2) % 1;
            ctx.fillStyle = rgba('#7CC4FF', 1 - d);
            ctx.beginPath();
            ctx.arc(x + 150, 860 + d * 120, 16, 0, Math.PI * 2);
            ctx.fill();
          }
          const tq = ease.outBack(clamp((t - same) / 0.35));
          pill(ctx, x, 1240, 'Aggressive · ₹20,000/mo', { size: 30, alpha: tq });
          // horizon bar
          const hq = ease.outCubic(clamp((t - at) / 0.6));
          if (t > at - 0.05) {
            const bw = 380;
            ctx.fillStyle = '#E8E6E0';
            rr(ctx, x - bw / 2, 1330, bw, 30, 15);
            ctx.fill();
            ctx.fillStyle = i ? WORRY : ACCENT;
            rr(ctx, x - bw / 2, 1330, bw * len * hq, 30, 15);
            ctx.fill();
            label(ctx, hz, x, 1410, { size: 44, weight: 900, color: i ? WORRY : ACCENT, alpha: hq });
            label(ctx, 'until they need it', x, 1460, { size: 26, weight: 600, color: C.mute, alpha: hq });
          }
        });
        headlines(ctx, s, [['lands', 'Same answers. *Same appetite.*'], ['gone', 'Different *deadlines.*']], { accent: ACCENT, size: 88 });
      },
      sfx: (s) => [[s.line('lands').s, 'pop', 0.7], [s.line('lands').s + 0.12, 'pop', 0.7], [s.word('gone', 'ten'), 'slide', 0.6], [s.word('gone', 'other'), 'nope', 0.6]],
    },

    questionScene({ text: 'Same *portfolio?*', accent: ACCENT, size: 100 }),

    // ---- the crash, the deadline, the panic sale
    {
      at: 'l1',
      trans: 'whip',
      mood: 'tension',
      draw(ctx, s) {
        const { t } = s;
        paper(ctx, t, ACCENT, 'crash');
        const [a, b, c, d] = ['l1', 'l2', 'l3', 'l4'].map((id) => s.line(id));
        const cx = 90;
        const cy = 640;
        const cw = 900;
        const ch = 640;
        // chart grows to the crash during l1, then to the 3-year marker in l2
        const prog = t < b.s ? lerp(0, 0.4, ease.inOutCubic(clamp((t - a.s) / (a.d * 0.9)))) : lerp(0.4, 0.62, ease.inOutCubic(clamp((t - b.s) / (b.d * 0.8))));
        ctx.save();
        softShadow(ctx, cx - 30, cy - 40, cw + 60, ch + 100, 40, { spread: 40, alpha: 0.12, dy: 20 });
        ctx.fillStyle = '#fff';
        rr(ctx, cx - 30, cy - 40, cw + 60, ch + 100, 40);
        ctx.fill();
        ctx.restore();
        const pts = PATH.filter((p) => p[0] <= prog).concat([[prog, chartY(prog)]]);
        const crashed = prog > 0.26;
        lineChart(ctx, cx, cy, cw, ch, [{ pts: pts.map(([x, y]) => [x, y]), c: crashed ? C.loss : C.gain, prog: 1 }], { fill: true });
        label(ctx, 'Illustrative market path', cx + cw - 10, cy + ch + 34, { size: 22, weight: 600, color: C.mute, align: 'right' });
        // 3-year deadline marker
        if (t > b.s - 0.1) {
          const q = ease.outCubic(clamp((t - b.s + 0.1) / 0.4));
          const mx = cx + cw * 0.6;
          ctx.save();
          ctx.globalAlpha = q;
          ctx.setLineDash([14, 12]);
          ctx.strokeStyle = WORRY;
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(mx, cy - 20);
          ctx.lineTo(mx, cy + ch);
          ctx.stroke();
          ctx.setLineDash([]);
          pill(ctx, mx, cy - 20, 'Year 3: you need it', { size: 26, bg: WORRY, fg: '#fff' });
          // pre-crash level, not yet recovered
          ctx.strokeStyle = rgba(C.ink, 0.25);
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 8]);
          const ly = cy + ch - 0.62 * ch;
          ctx.beginPath();
          ctx.moveTo(cx, ly);
          ctx.lineTo(cx + cw, ly);
          ctx.stroke();
          ctx.setLineDash([]);
          label(ctx, 'pre-crash', cx + 8, ly - 20, { size: 22, weight: 600, color: C.mute, align: 'left' });
          ctx.restore();
        }
        // the brave one rides the line
        const bx = cx + cw * Math.min(prog, 0.36);
        const by = cy + ch - chartY(Math.min(prog, 0.36)) * ch;
        const panic = t > c.s - 0.1;
        const sh = panic ? Math.sin(t * 50) * 6 : 0;
        critter(ctx, bx + sh, by - 100, 80, panic ? WORRY : ACCENT, { look: panic ? [0.6, -0.5] : [0.4, 0.3], blink: blink(t, 2), mouth: panic ? { type: 'o', open: 0.9 } : crashed ? { type: 'sad' } : { type: 'smile' }, brow: panic ? 1 : 0, shadow: false });
        // SELL
        if (t > d.s - 0.15) {
          const q = spring(t - d.s + 0.15, 12, 0.5);
          const press = t > s.word('l4', 'sells') && t < s.word('l4', 'sells') + 0.18 ? 1 : 0;
          ctx.save();
          ctx.translate(W / 2, 1560);
          ctx.scale(q * (1 - press * 0.08), q * (1 - press * 0.08));
          softShadow(ctx, -200, -70, 400, 140, 70, { spread: 30, alpha: 0.25, dy: 14 });
          ctx.fillStyle = C.loss;
          rr(ctx, -200, -70, 400, 140, 70);
          ctx.fill();
          label(ctx, 'SELL', 0, 4, { size: 64, weight: 900, color: '#fff', ls: 0.06 });
          ctx.restore();
          stamp(ctx, t - s.word('l4', 'bottom'), bx + 120, by - 260, 'SOLD AT THE BOTTOM', { color: C.loss, size: 40, rot: -0.12 });
          ring(ctx, t - s.word('l4', 'sells'), W / 2, 1560, { r0: 100, r1: 300, life: 0.5, color: C.loss, width: 10 });
        }
        headlines(ctx, s, [
          ['l1', "A bad quarter doesn't care how *brave* you felt.", { size: 76 }],
          ['l2', '3 years may not be *enough.*'],
          ['l3', 'So the brave one *panics,*', { accent: WORRY }],
          ['l4', 'and sells at the *bottom.*', { accent: C.loss }],
        ], { accent: ACCENT, y: 300 });
      },
      sfx: (s) => [[s.line('l1').s + s.line('l1').d * 0.6, 'whooshDown', 0.8], [s.line('l1').s + s.line('l1').d * 0.75, 'thud', 0.8], [s.line('l2').s, 'tick', 0.6], [s.line('l3').s, 'boing', 0.4], [s.word('l4', 'sells'), 'click', 1], [s.word('l4', 'bottom'), 'stamp', 1], [s.word('l4', 'bottom') + 0.1, 'sad', 0.5]],
    },

    nightScene({
      text: 'Appetite is what you feel on a *calm* day.',
      accent: ACCENT,
      glow: '#2B5BFF',
      content(ctx, s) {
        const { t } = s;
        // moon + calm sea
        const my = 860;
        const halo = ctx.createRadialGradient(W / 2, my, 60, W / 2, my, 420);
        halo.addColorStop(0, 'rgba(200,220,255,0.35)');
        halo.addColorStop(1, 'rgba(200,220,255,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, W, H);
        sphere(ctx, W / 2, my, 150, '#E8EEFF', { shadow: false, gloss: 0.4 });
        const seaY = 1240;
        const g = ctx.createLinearGradient(0, seaY, 0, H);
        g.addColorStop(0, '#13204A');
        g.addColorStop(1, '#070B1C');
        ctx.fillStyle = g;
        ctx.fillRect(0, seaY, W, H - seaY);
        for (let k = 0; k < 14; k++) {
          const y = seaY + 20 + k * k * 3.6;
          ctx.strokeStyle = `rgba(160,190,255,${0.22 - k * 0.012})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          for (let x = 0; x <= W; x += 20) {
            const yy = y + Math.sin(x * 0.012 + t * 1.2 + k) * (3 + k * 0.6);
            if (x) ctx.lineTo(x, yy);
            else ctx.moveTo(x, yy);
          }
          ctx.stroke();
        }
        // moon reflection
        for (let k = 0; k < 10; k++) {
          const y = seaY + 30 + k * 34;
          const w = 160 - k * 10 + Math.sin(t * 2 + k) * 20;
          ctx.fillStyle = `rgba(232,238,255,${0.35 - k * 0.03})`;
          rr(ctx, W / 2 - w / 2, y, w, 8, 4);
          ctx.fill();
        }
      },
    }),

    revealScene({ toolName: 'InvestMatch', accent: ACCENT, logo }),

    // ---- the questionnaire → allocation
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
        const box = appWindow(ctx, 70, lerp(H, 470, enter), 940, 1180, { title: 'InvestMatch', accent: ACCENT, iconName: 'chart' });
        const toAlloc = ease.inOutCubic(clamp((t - gp.s + 0.1) / 0.5));
        ctx.save();
        ctx.globalAlpha = 1 - toAlloc;
        label(ctx, 'Risk appetite', box.x, box.y, { size: 26, weight: 600, color: C.mute, align: 'left', baseline: 'top' });
        segmented(ctx, box.x, box.y + 40, box.w, ['Conservative', 'Moderate', 'Aggressive'], lerp(0, 2, ease.inOutCubic(clamp((t - sp.s - 0.2) / 0.5))), { accent: ACCENT, size: 26 });
        label(ctx, 'Horizon', box.x, box.y + 170, { size: 26, weight: 600, color: C.mute, align: 'left', baseline: 'top' });
        segmented(ctx, box.x, box.y + 210, box.w, ['1–3 yrs', '3–5 yrs', '5–10 yrs', '10+ yrs'], lerp(0, 3, ease.inOutCubic(clamp((t - sp.s - 0.7) / 0.5))), { accent: ACCENT, size: 26 });
        const typeAt = s.word('split', 'sustain') - 0.3;
        const v = '₹20,000'.slice(0, Math.floor(clamp((t - typeAt) * 12, 0, 7)));
        field(ctx, box.x, box.y + 340, box.w, 'How much can you invest monthly? (₹)', v || ' ', { focus: t > typeAt - 0.1 && t < typeAt + 0.9 ? 1 : 0, accent: ACCENT });
        if (t > typeAt + 0.6) {
          const q = ease.outBack(clamp((t - typeAt - 0.6) / 0.3));
          ctx.save();
          ctx.translate(box.x + box.w - 60, box.y + 428);
          ctx.scale(q, q);
          sphere(ctx, 0, 0, 30, C.gain, { shadow: false });
          icon(ctx, 'check', 0, 0, 34, { color: '#fff', lw: 14 });
          ctx.restore();
          label(ctx, 'Sustainable every month', box.x, box.y + 540, { size: 28, weight: 700, color: C.gain, align: 'left', alpha: q });
        }
        ctx.restore();
        if (toAlloc > 0) {
          ctx.save();
          ctx.globalAlpha = toAlloc;
          label(ctx, 'Aggressive · 10+ years', box.x, box.y, { size: 34, weight: 800, align: 'left', baseline: 'top' });
          donut(ctx, box.x + box.w / 2, box.y + 330, 250, AGGR, { prog: clamp((t - gp.s) / 0.9) });
          label(ctx, 'Equity-heavy', box.x + box.w / 2, box.y + 330, { size: 40, weight: 800 });
          AGGR.forEach((sl, i) => {
            const q = ease.outCubic(clamp((t - gp.s - 0.4 - i * 0.07) / 0.3));
            const col = i % 2;
            const row = Math.floor(i / 2);
            const lx = box.x + col * (box.w / 2);
            const ly = box.y + 640 + row * 64;
            ctx.save();
            ctx.globalAlpha *= q;
            ctx.fillStyle = sl.c;
            rr(ctx, lx, ly - 14, 28, 28, 8);
            ctx.fill();
            label(ctx, `${sl.n}`, lx + 42, ly, { size: 24, weight: 600, align: 'left' });
            label(ctx, `${sl.p}%`, lx + box.w / 2 - 30, ly, { size: 24, weight: 800, align: 'right' });
            ctx.restore();
          });
          ctx.restore();
        }
        headlines(ctx, s, [['split', 'Answer *honestly.*'], ['gap', '10+ years? It stays *aggressive.*', { size: 76 }]], { accent: ACCENT, y: 250 });
      },
      sfx: (s) => [[0.05, 'swoosh', 0.6], [s.line('split').s + 0.2, 'slide', 0.5], [s.line('split').s + 0.7, 'slide', 0.5], [s.word('split', 'sustain') - 0.3, 'type', 0.6], [s.word('split', 'sustain') + 0.3, 'pop', 0.7], [s.line('gap').s, 'swoosh', 0.6]],
    },

    // ---- shorten the horizon: the allocation de-risks
    {
      at: 'stamp',
      trans: 'cut',
      mood: 'drop',
      push: 0,
      draw(ctx, s) {
        const { t } = s;
        bgPaper(ctx, ACCENT);
        const box = appWindow(ctx, 70, 470, 940, 1180, { title: 'InvestMatch', accent: ACCENT, iconName: 'chart' });
        const sw = s.word('stamp', 'switch');
        const p = ease.inOutCubic(clamp((t - sw - 0.1) / 0.6));
        segmented(ctx, box.x, box.y, box.w, ['1–3 yrs', '3–5 yrs', '5–10 yrs', '10+ yrs'], lerp(3, 0, p), { accent: p > 0.5 ? WORRY : ACCENT, size: 26 });
        const morph = ease.inOutCubic(clamp((t - sw - 0.4) / 0.9));
        const slices = lerpSlices(AGGR, CONS, morph);
        donut(ctx, box.x + box.w / 2, box.y + 400, 250, slices, { prog: 1 });
        label(ctx, morph < 0.5 ? 'Aggressive' : 'Conservative', box.x + box.w / 2, box.y + 400, { size: 44, weight: 800, color: morph < 0.5 ? C.ink : darken(WORRY, 0.2) });
        // the tool's own explanation
        const nq = ease.outCubic(clamp((t - s.word('stamp', 'conservative')) / 0.4));
        if (nq > 0) {
          ctx.save();
          ctx.globalAlpha = nq;
          ctx.fillStyle = '#FFF6E8';
          rr(ctx, box.x, box.y + 720, box.w, 200, 26);
          ctx.fill();
          icon(ctx, 'shield', box.x + 60, box.y + 820, 64, { color: WORRY, lw: 9 });
          wrapText(ctx, RISK_NOTE, box.x + 120, box.y + 770, box.w - 150, 28, 38);
          ctx.restore();
        }
        stamp(ctx, t - s.word('stamp', 'same'), W / 2, 760, 'SAME APPETITE', { color: ACCENT, size: 52, rot: -0.12 });
        headlines(ctx, s, [['stamp', 'Within 3 years? It *de-risks.*', { span: 1.2 }]], { accent: WORRY, y: 300, size: 84 });
      },
      sfx: (s) => [[s.word('stamp', 'switch'), 'slide', 0.8], [s.word('stamp', 'switch') + 0.4, 'swoosh', 0.6], [s.word('stamp', 'same'), 'stamp', 1]],
    },

    // ---- the projection, before and after inflation
    {
      at: 'feature',
      trans: 'whip',
      mood: 'groove',
      draw(ctx, s) {
        const { t } = s;
        paper(ctx, t, ACCENT, 'proj');
        const f = s.line('feature');
        const pr = s.word('feature', 'projects');
        const cx = 110;
        const cy = 720;
        const cw = 860;
        const ch = 620;
        ctx.save();
        softShadow(ctx, cx - 50, cy - 80, cw + 100, ch + 200, 40, { spread: 40, alpha: 0.12, dy: 20 });
        ctx.fillStyle = '#fff';
        rr(ctx, cx - 50, cy - 80, cw + 100, ch + 200, 40);
        ctx.fill();
        ctx.restore();
        const n = 16;
        const rN = 0.14 / 12;
        const fv = (y) => 20000 * ((Math.pow(1 + rN, y * 12) - 1) / rN) * (1 + rN);
        const real = (y) => fv(y) / Math.pow(1.06, y);
        const nom = Array.from({ length: n }, (_, y) => [y / 15, fv(y) / FV]);
        const rl = Array.from({ length: n }, (_, y) => [y / 15, real(y) / FV]);
        const inv = Array.from({ length: n }, (_, y) => [y / 15, (20000 * 12 * y) / FV]);
        const p1 = clamp((t - f.s - 0.3) / Math.max(1.2, pr - f.s + 0.6));
        const p2 = clamp((t - s.word('feature', 'after')) / 1.0);
        lineChart(ctx, cx, cy, cw, ch, [
          { pts: inv, c: '#B9B6AE', prog: p1, fill: false, width: 5, dash: [10, 10] },
          { pts: nom, c: ACCENT, prog: p1 },
          { pts: rl, c: '#7C5CFF', prog: p2, fill: false },
        ]);
        const lq = ease.outBack(clamp((t - pr) / 0.3));
        if (lq > 0) pill(ctx, cx + cw - 130, cy + 30, lakhCr(FV), { size: 34, bg: ACCENT, fg: '#fff', alpha: clamp(lq) });
        const rq = ease.outBack(clamp((t - s.word('feature', 'after') - 0.8) / 0.3));
        if (rq > 0) pill(ctx, cx + cw - 130, cy + ch - REAL_FV / FV * ch - 50, lakhCr(REAL_FV) + " in today's money", { size: 32, bg: '#7C5CFF', fg: '#fff', alpha: clamp(rq), align: 'right' });
        label(ctx, `Invested ${lakhCr(INVESTED)} over 15 years · ₹20,000/mo`, cx, cy + ch + 60, { size: 26, weight: 600, color: C.mute, align: 'left', alpha: p1 });
        label(ctx, 'Illustrative · not a forecast', cx + cw, cy + ch + 96, { size: 22, weight: 600, color: C.mute, align: 'right', alpha: p1 });
        headlines(ctx, s, [['feature', 'Horizon is a *fact.*', { span: 0.6 }], ['feature', 'Before and after *inflation.*', { at: pr - 0.1, keep: true, size: 80 }]], { accent: ACCENT, y: 330, size: 96 });
      },
      sfx: (s) => [[s.word('feature', 'fact'), 'pop', 0.8], [s.word('feature', 'projects'), 'riser', 0.4], [s.word('feature', 'projects') + 1.0, 'ding', 0.6], [s.word('feature', 'after') + 0.8, 'pop', 0.7]],
    },

    morningScene({
      text: 'Educational. *Not advice.*',
      accent: ACCENT,
      textSize: 92,
      content(ctx, s) {
        const { t } = s;
        const p = spring(t - 0.2, 9, 0.6);
        phone(ctx, 520, lerp(2300, 1100, p), 470, {
          lock: false,
          screenTop: '#FFFFFF',
          screenBot: '#F4F3EF',
          content(c, box) {
            const x = box.x + 34;
            label(c, 'Your allocation', x, box.y + 120, { size: 30, weight: 800, align: 'left' });
            donut(c, box.x + box.w / 2, box.y + 330, 140, AGGR, { prog: clamp((t - 0.6) / 0.8) });
            const tags = [['No fund names', 'cross'], ['Categories only', 'check'], ['The logic, visible', 'spark']];
            tags.forEach(([n, ic], i) => {
              const q = ease.outBack(clamp((t - s.word('morning', 'fund') + 0.2 - i * 0.25) / 0.35));
              const y = box.y + 540 + i * 100;
              c.save();
              c.globalAlpha = clamp(q);
              c.fillStyle = '#F2F6FF';
              rr(c, x, y, box.w - 68, 80, 22);
              c.fill();
              icon(c, ic, x + 44, y + 40, 40, { color: ACCENT, lw: 12 });
              label(c, n, x + 84, y + 40, { size: 26, weight: 700, align: 'left' });
              c.restore();
            });
          },
        });
      },
    }),

    taglineScene({ a: 'Less guessing.', b: 'More *conviction.*', accent: ACCENT }),
    endScene({ toolName: 'InvestMatch', accent: ACCENT, logo, iconName: 'chart', toolId: 'investmatch' }),
  ];
}

function wrapText(ctx, str, x, y, maxW, size, lineH) {
  ctx.save();
  ctx.font = `600 ${size}px Geist`;
  ctx.fillStyle = C.ink2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let line = '';
  let yy = y;
  for (const w of str.split(' ')) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lineH;
    } else line = test;
  }
  ctx.fillText(line, x, yy);
  ctx.restore();
}
