// Reverse Goal Planner — figures are computeGoalPlanner({ targetToday: 30,00,000, years: 15, existing: 0 })
// from src/tools/lib/goals.ts, with inflation off and on (6%).
import { W, H, C, clamp, lerp, ease, spring, inr, lakhCr, rng, lighten, darken, rgba } from '../engine/core.js';
import { rr, softShadow, sphere, bubbles, burst, critter, floorShadow, stamp, pill, tabular, embossText, ring, bgPaper } from '../engine/draw.js';
import { kinetic, label } from '../engine/text.js';
import { icon, iconTile } from '../engine/icons.js';
import { appWindow, field, toggle, phone } from '../engine/ui.js';
import { hookScene, slamScene, questionScene, nightScene, revealScene, morningScene, taglineScene, endScene } from '../engine/scenes.js';
import { blink, countTo, headlines, paper, HEAD_Y } from '../engine/kit.js';

const ACCENT = '#14B8A6';
const TARGET = 7189675;
const SIP_FLAT = 5946; // moderate path, inflation off
const SIP_REAL = 14249; // moderate path, inflation on
const PATHS = [
  { n: 'Aggressive', rate: '14%', sip: 11732, c: '#c2410c' },
  { n: 'Moderate', rate: '12%', sip: 14249, c: '#b08a36' },
  { n: 'Conservative', rate: '8%', sip: 20640, c: '#0c8079' },
];
const STEP_START = 8280; // moderate path, 10% yearly step-up

function hookCard(ctx, w, h, t) {
  iconTile(ctx, 'flag', 92, 96, 84, ACCENT);
  label(ctx, 'My goal', 156, 80, { size: 38, weight: 700, align: 'left' });
  label(ctx, 'in 15 years', 156, 122, { size: 28, weight: 600, color: C.mute, align: 'left' });
  tabular(ctx, '₹30,00,000', 56, 260, 120, { align: 'left', weight: 800 });
  const q = ease.outBack(clamp((t - 1.0) / 0.4));
  if (q > 0) {
    ctx.save();
    ctx.globalAlpha = clamp(q);
    ctx.fillStyle = '#E9F8F5';
    rr(ctx, 56, 360, w - 112, 130, 30);
    ctx.fill();
    label(ctx, 'SIP calculator says', 92, 400, { size: 26, weight: 600, color: C.mute, align: 'left' });
    label(ctx, '₹5,946 / month', 92, 448, { size: 40, weight: 800, align: 'left' });
    iconTile(ctx, 'check', w - 120, 425, 70, C.gain);
    ctx.restore();
  }
}

export default function story({ timeline, logo }) {
  const L = Object.fromEntries(timeline.lines.map((l) => [l.id, l]));
  const hookDur = L.lie.start - 0.12;

  return [
    hookScene({ text: 'You want *₹30 lakh,* in 15 years.', card: hookCard, accent: ACCENT, size: 88 }),
    slamScene({ pre: 'Your SIP calculator is', word: 'LYING.', needle: 'lying', sub: 'to you.', card: hookCard, accent: ACCENT, hookDur }),

    // ---- ₹30 L today vs ₹30 L then
    {
      at: 'lands',
      trans: 'whip',
      mood: 'tension',
      draw(ctx, s) {
        const { t } = s;
        paper(ctx, t, ACCENT, 'today');
        const ln = s.line('lands');
        const gn = s.line('gone');
        const p = spring(t - ln.s, 10, 0.5);
        const warp = ease.inOutCubic(clamp((t - gn.s) / 0.9));
        const year = Math.round(lerp(2026, 2041, warp));
        const r = 260 * p * lerp(1, Math.sqrt(0.417), warp);
        if (r > 2) {
          sphere(ctx, W / 2, 1060, r, ACCENT, { shadowY: 1360 });
          embossText(ctx, '₹30 L', W / 2, 1060, 110 * (r / 260), { max: r * 1.5 });
        }
        pill(ctx, W / 2, 680, String(year), { size: 52, bg: warp > 0 ? C.ink : '#fff', fg: warp > 0 ? '#fff' : C.ink, alpha: clamp(p) });
        if (warp > 0.6) {
          const q = ease.outCubic(clamp((warp - 0.6) / 0.4));
          label(ctx, 'buys what ₹12.5 L buys today', W / 2, 1440, { size: 40, weight: 800, color: C.loss, alpha: q });
          label(ctx, 'at 6% inflation', W / 2, 1495, { size: 30, weight: 600, color: C.mute, alpha: q });
        }
        // speed lines while time-warping
        if (warp > 0 && warp < 1) {
          const R = rng('warp');
          ctx.save();
          ctx.strokeStyle = rgba(ACCENT, 0.35 * Math.sin(warp * Math.PI));
          ctx.lineWidth = 4;
          for (let i = 0; i < 26; i++) {
            const a = R() * Math.PI * 2;
            const r0 = 340 + R() * 200 + warp * 300;
            ctx.beginPath();
            ctx.moveTo(W / 2 + Math.cos(a) * r0, 1060 + Math.sin(a) * r0);
            ctx.lineTo(W / 2 + Math.cos(a) * (r0 + 120), 1060 + Math.sin(a) * (r0 + 120));
            ctx.stroke();
          }
          ctx.restore();
        }
        headlines(ctx, s, [['lands', '₹30 lakh *today*'], ['gone', "won't be ₹30 lakh *then.*"]], { accent: ACCENT });
      },
      sfx: (s) => [[s.line('lands').s, 'pop', 0.8], [s.line('gone').s, 'whoosh', 0.7], [s.line('gone').s + 0.9, 'sad', 0.4]],
    },

    questionScene({ text: 'At *6%* inflation?', accent: ACCENT, size: 100 }),

    // ---- the balloon: ₹30 L → ₹71.9 L, funded 42%
    {
      at: 'l1',
      trans: 'whip',
      mood: 'groove',
      draw(ctx, s) {
        const { t } = s;
        paper(ctx, t, ACCENT, 'balloon');
        const [a, b, c, d] = ['l1', 'l2', 'l3', 'l4'].map((id) => s.line(id));
        const grow = clamp((t - a.s) / (a.d * 0.95));
        const v = lerp(3000000, TARGET, ease.inOutCubic(grow));
        const r = 200 * Math.sqrt(v / 3000000) * 0.82;
        const bob = Math.sin(t * 2) * 10;
        const cy = 820 + bob;
        // string
        ctx.strokeStyle = '#9B988F';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(W / 2, cy + r);
        ctx.bezierCurveTo(W / 2 + 30, cy + r + 80, W / 2 - 30, cy + r + 140, W / 2, cy + r + 200);
        ctx.stroke();
        sphere(ctx, W / 2, cy, r, ACCENT, { shadow: false, sy: 1.06 });
        embossText(ctx, lakhCr(v), W / 2, cy, 92 * Math.min(1.3, r / 200), { max: r * 1.5 });
        label(ctx, `Year ${Math.round(15 * ease.inOutCubic(grow))}`, W / 2, cy + r + 250, { size: 36, weight: 800, color: C.mute });
        // funding meter
        const mq = ease.outCubic(clamp((t - b.s + 0.1) / 0.4));
        if (mq > 0) {
          const mx = 100;
          const my = 1440;
          const mw = 880;
          ctx.save();
          ctx.globalAlpha = mq;
          label(ctx, 'Goal in 2041: ₹71,89,675', mx, my - 50, { size: 32, weight: 700, align: 'left' });
          ctx.fillStyle = '#ECEAE4';
          rr(ctx, mx, my, mw, 72, 36);
          ctx.fill();
          const fp = ease.outCubic(clamp((t - c.s) / 0.9)) * 0.417;
          ctx.fillStyle = ACCENT;
          rr(ctx, mx, my, mw * Math.max(fp, 0.0001), 72, 36);
          ctx.fill();
          if (fp > 0.05) label(ctx, `${Math.round((fp / 0.417) * 42)}% funded`, mx + 24, my + 36, { size: 30, weight: 800, color: '#fff', align: 'left' });
          // shortfall hatch
          const sq = ease.outCubic(clamp((t - d.s) / 0.5));
          if (sq > 0) {
            ctx.save();
            ctx.beginPath();
            rr(ctx, mx + mw * 0.417, my, mw * 0.583 * sq, 72, 36);
            ctx.clip();
            ctx.fillStyle = 'rgba(239,65,53,0.15)';
            ctx.fillRect(mx, my, mw, 72);
            ctx.strokeStyle = 'rgba(239,65,53,0.6)';
            ctx.lineWidth = 6;
            for (let k = -10; k < 40; k++) {
              ctx.beginPath();
              ctx.moveTo(mx + k * 30, my + 72);
              ctx.lineTo(mx + k * 30 + 72, my);
              ctx.stroke();
            }
            ctx.restore();
            label(ctx, 'Shortfall ₹41.9 L', mx + mw, my + 120, { size: 36, weight: 800, color: C.loss, align: 'right', alpha: sq });
          }
          label(ctx, 'Planned: ₹30 L', mx, my + 120, { size: 32, weight: 700, color: C.ink2, align: 'left' });
          ctx.restore();
        }
        headlines(ctx, s, [
          ['l1', 'It becomes *₹71.9 lakh.*'],
          ['l2', 'Plan for ₹30 lakh,'],
          ['l3', 'and you fund *42%.*', { accent: ACCENT }],
          ['l4', 'The rest? *A shortfall.*', { accent: C.loss }],
        ], { accent: ACCENT, y: 300 });
      },
      sfx: (s) => [[s.line('l1').s, 'riser', 0.6], [s.line('l1').e, 'pop', 0.8], [s.line('l2').s, 'slide', 0.5], [s.line('l3').s + 0.3, 'coin', 0.5], [s.line('l4').s, 'sad', 0.6]],
    },

    nightScene({
      text: 'And you find out in *year fifteen.*',
      accent: ACCENT,
      content(ctx, s) {
        const { t } = s;
        // years flipping like an airport board
        const yv = Math.min(15, Math.floor(clamp((t - 0.3) / 2.0) * 15) + 1);
        const p = spring(t - 0.2, 9, 0.6);
        ctx.save();
        ctx.translate(W / 2, 1120);
        ctx.scale(p, p);
        ctx.fillStyle = '#16142B';
        rr(ctx, -300, -220, 600, 440, 50);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 4;
        ctx.stroke();
        label(ctx, 'YEAR', 0, -140, { size: 40, weight: 800, color: 'rgba(255,255,255,0.55)', ls: 0.2 });
        tabular(ctx, String(yv).padStart(2, '0'), 0, 40, 260, { weight: 900, color: yv === 15 ? '#FF6B5E' : '#FFFFFF' });
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(-300, 38, 600, 6);
        ctx.restore();
        if (yv === 15) {
          const a = 0.5 + 0.5 * Math.sin(t * 10);
          label(ctx, 'Shortfall: ₹41.9 L', W / 2, 1460, { size: 48, weight: 800, color: rgba('#FF6B5E', 0.6 + 0.4 * a) });
        }
      },
      ticks: true,
    }),

    revealScene({ toolName: 'Reverse Goal Planner', accent: ACCENT, logo }),

    // ---- reverse the arrow, then the inputs
    {
      at: 'split',
      trans: 'zoom',
      mood: 'drop',
      draw(ctx, s) {
        const { t } = s;
        paper(ctx, t, ACCENT, 'reverse');
        const sp = s.line('split');
        const gp = s.line('gap');
        const toForm = ease.inOutCubic(clamp((t - gp.s + 0.1) / 0.5));
        ctx.save();
        ctx.globalAlpha = 1 - toForm;
        const q = spring(t - 0.1, 10, 0.55);
        // SIP tile → goal tile, then the arrow flips
        const flip = ease.inOutCubic(clamp((t - s.word('split', 'not') + 0.2) / 0.6));
        [[250, 'SIP', '₹ ?', 'Monthly SIP'], [830, 'flag', '₹30 L', 'Goal']].forEach(([x, ic, v, n], i) => {
          ctx.save();
          ctx.translate(x, 1050);
          ctx.scale(q, q);
          softShadow(ctx, -170, -190, 340, 380, 44, { spread: 30, alpha: 0.16, dy: 20 });
          ctx.fillStyle = '#fff';
          rr(ctx, -170, -190, 340, 380, 44);
          ctx.fill();
          if (ic === 'SIP') label(ctx, 'SIP', 0, -80, { size: 64, weight: 900, color: ACCENT });
          else iconTile(ctx, 'flag', 0, -80, 110, ACCENT);
          label(ctx, v, 0, 50, { size: 54, weight: 900 });
          label(ctx, n, 0, 120, { size: 30, weight: 600, color: C.mute });
          ctx.restore();
        });
        const dir = flip < 0.5 ? 1 : -1;
        const ax = W / 2;
        ctx.save();
        ctx.translate(ax, 1050);
        ctx.scale(dir * (1 - 2 * Math.min(flip, 1 - flip)) || 0.001, 1);
        icon(ctx, 'arrowR', 0, 0, 170, { color: flip < 0.5 ? '#B9B6AE' : ACCENT, lw: 12 });
        ctx.restore();
        if (flip > 0.6) label(ctx, 'works backwards', W / 2, 1310, { size: 40, weight: 800, color: darken(ACCENT, 0.2), alpha: ease.outCubic((flip - 0.6) / 0.4) });
        ctx.restore();
        if (toForm > 0) {
          const box = appWindow(ctx, 70, lerp(H, 520, toForm), 940, 900, { title: 'Reverse Goal Planner', accent: ACCENT, iconName: 'flag' });
          const f = [[s.word('gap', 'target'), 'Target in today’s money', '₹30,00,000'], [s.word('gap', 'years'), 'Years to goal', '15'], [s.word('gap', 'already'), 'Already saved', '₹0']];
          f.forEach(([at, lab, v], i) => {
            const n = Math.floor(clamp((t - at) * 14, 0, v.length));
            field(ctx, box.x, box.y + i * 180, box.w, lab, v.slice(0, n) || ' ', { focus: t > at - 0.1 && t < at + 0.7 ? 1 : 0, accent: ACCENT });
          });
        }
        headlines(ctx, s, [['split', 'Start from the *goal.*'], ['gap', 'Target. Years. *Saved.*']], { accent: ACCENT, y: 300, size: 88 });
      },
      sfx: (s) => [[0.1, 'pop', 0.7], [s.word('split', 'not'), 'swoosh', 0.8], [s.line('gap').s, 'whoosh', 0.5], [s.word('gap', 'target'), 'type', 0.5], [s.word('gap', 'years'), 'type', 0.5]],
    },

    // ---- inflation on: the real SIP
    {
      at: 'stamp',
      trans: 'zoom',
      mood: 'drop',
      push: 0,
      draw(ctx, s) {
        const { t } = s;
        bgPaper(ctx, ACCENT);
        const box = appWindow(ctx, 70, 440, 940, 1160, { title: 'Reverse Goal Planner', accent: ACCENT, iconName: 'flag' });
        const on = ease.inOutCubic(clamp((t - s.word('stamp', 'inflation')) / 0.4));
        label(ctx, 'Adjust for inflation (6%)', box.x, box.y + 40, { size: 34, weight: 700, align: 'left' });
        toggle(ctx, box.x + box.w - 104, box.y + 40, on, { accent: ACCENT });
        label(ctx, 'Target becomes', box.x, box.y + 150, { size: 28, weight: 600, color: C.mute, align: 'left' });
        const tv = lerp(3000000, TARGET, ease.outCubic(clamp((t - s.word('stamp', 'inflation') - 0.2) / 0.8)));
        tabular(ctx, inr(tv), box.x, box.y + 225, 84, { align: 'left', weight: 900, color: on > 0.5 ? darken(ACCENT, 0.2) : C.ink });
        ctx.fillStyle = C.line;
        ctx.fillRect(box.x, box.y + 310, box.w, 3);
        label(ctx, 'Moderate path · monthly SIP', box.x, box.y + 380, { size: 30, weight: 700, color: C.mute, align: 'left' });
        const back = s.word('stamp', 'backwards');
        const strike = ease.outCubic(clamp((t - back) / 0.35));
        tabular(ctx, '₹5,946', box.x, box.y + 470, 72, { align: 'left', weight: 800, color: strike > 0.5 ? C.mute : C.ink });
        if (strike > 0) {
          ctx.strokeStyle = C.loss;
          ctx.lineWidth = 8;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(box.x - 10, box.y + 470);
          ctx.lineTo(box.x - 10 + 300 * strike, box.y + 470);
          ctx.stroke();
          label(ctx, 'inflation off', box.x + 320, box.y + 470, { size: 26, weight: 600, color: C.mute, align: 'left', alpha: strike });
        }
        const rq = spring(t - back - 0.35, 12, 0.5);
        if (t > back + 0.35) {
          ctx.save();
          ctx.translate(box.x + box.w / 2, box.y + 680);
          ctx.scale(rq, rq);
          softShadow(ctx, -400, -110, 800, 220, 50, { spread: 30, alpha: 0.2, dy: 16 });
          const g = ctx.createLinearGradient(0, -110, 0, 110);
          g.addColorStop(0, lighten(ACCENT, 0.1));
          g.addColorStop(1, darken(ACCENT, 0.12));
          ctx.fillStyle = g;
          rr(ctx, -400, -110, 800, 220, 50);
          ctx.fill();
          label(ctx, 'Real monthly SIP', 0, -50, { size: 30, weight: 700, color: 'rgba(255,255,255,0.85)' });
          tabular(ctx, '₹14,249', 0, 30, 110, { weight: 900, color: '#fff' });
          ctx.restore();
          label(ctx, 'to fully fund ₹71,89,675 in 15 years', W / 2, box.y + 860, { size: 28, weight: 600, color: C.ink2, alpha: clamp(rq) });
        }
        headlines(ctx, s, [['stamp', 'Inflation *on.*', { span: 0.6 }], ['stamp', 'Then it works *backwards.*', { at: back - 0.4, keep: true, size: 80 }]], { accent: ACCENT, y: 290, size: 96 });
      },
      sfx: (s) => [[s.word('stamp', 'inflation'), 'click', 1], [s.word('stamp', 'inflation') + 0.2, 'riser', 0.4], [s.word('stamp', 'backwards'), 'scratch', 0.5], [s.word('stamp', 'backwards') + 0.35, 'pop', 1], [s.word('stamp', 'backwards') + 0.4, 'coin', 0.5]],
    },

    // ---- three paths + step-up
    {
      at: 'feature',
      trans: 'whip',
      mood: 'groove',
      draw(ctx, s) {
        const { t } = s;
        paper(ctx, t, ACCENT, 'paths');
        const f = s.line('feature');
        const su = s.word('feature', 'step-up');
        const toStep = ease.inOutCubic(clamp((t - su + 0.6) / 0.5));
        ctx.save();
        ctx.globalAlpha = 1 - toStep;
        PATHS.forEach((p, i) => {
          const q = spring(t - f.s - i * 0.15, 11, 0.55);
          const y = 720 + i * 260;
          ctx.save();
          ctx.translate(W / 2, y + (1 - q) * 300);
          ctx.globalAlpha *= clamp(q);
          softShadow(ctx, -440, -100, 880, 200, 40, { spread: 30, alpha: 0.14, dy: 16 });
          ctx.fillStyle = '#fff';
          rr(ctx, -440, -100, 880, 200, 40);
          ctx.fill();
          ctx.fillStyle = p.c;
          rr(ctx, -440, -100, 24, 200, 12);
          ctx.fill();
          label(ctx, `${p.n} path`, -380, -30, { size: 40, weight: 800, align: 'left' });
          label(ctx, `assumes ${p.rate} a year`, -380, 30, { size: 28, weight: 600, color: C.mute, align: 'left' });
          tabular(ctx, inr(p.sip), 400, -10, 64, { align: 'right', weight: 900 });
          label(ctx, '/ month', 400, 50, { size: 26, weight: 600, color: C.mute, align: 'right' });
          ctx.restore();
        });
        label(ctx, 'Illustrative long-run returns, not forecasts', W / 2, 1560, { size: 26, weight: 600, color: C.mute });
        ctx.restore();
        if (toStep > 0) {
          ctx.save();
          ctx.globalAlpha = toStep;
          label(ctx, 'Moderate path · +10% every year', W / 2, 660, { size: 36, weight: 800 });
          const n = 15;
          const bw = 46;
          const gap = 10;
          const x0 = W / 2 - (n * (bw + gap)) / 2;
          const maxV = STEP_START * Math.pow(1.1, 14);
          for (let y = 0; y < n; y++) {
            const v = STEP_START * Math.pow(1.1, y);
            const q = ease.outBack(clamp((t - su - y * 0.06) / 0.3));
            const h = (v / maxV) * 600 * q;
            const g = ctx.createLinearGradient(0, 1400 - h, 0, 1400);
            g.addColorStop(0, lighten(ACCENT, 0.2));
            g.addColorStop(1, darken(ACCENT, 0.1));
            ctx.fillStyle = g;
            rr(ctx, x0 + y * (bw + gap), 1400 - h, bw, h, 10);
            ctx.fill();
          }
          label(ctx, 'Start at', x0, 1470, { size: 28, weight: 600, color: C.mute, align: 'left' });
          tabular(ctx, '₹8,280', x0, 1530, 64, { align: 'left', weight: 900, color: darken(ACCENT, 0.2) });
          label(ctx, 'instead of ₹14,249', x0 + 260, 1530, { size: 30, weight: 700, color: C.ink2, align: 'left' });
          ctx.restore();
        }
        headlines(ctx, s, [['feature', 'Three *return paths.*'], ['feature', 'Income rising? *Step up.*', { at: su - 0.6, keep: true, size: 80 }]], { accent: ACCENT, y: 330, size: 88 });
      },
      sfx: (s) => [[s.line('feature').s, 'pop', 0.6], [s.line('feature').s + 0.15, 'pop', 0.6], [s.line('feature').s + 0.3, 'pop', 0.6], [s.word('feature', 'step-up') - 0.5, 'whoosh', 0.6], [s.word('feature', 'step-up'), 'riser', 0.4], [s.word('feature', 'step-up') + 0.9, 'ding', 0.5]],
    },

    morningScene({
      text: 'Price it right. Fund it *fully.*',
      accent: ACCENT,
      cup: false,
      content(ctx, s) {
        const { t } = s;
        // mountain with the flag at the top
        const p = ease.outCubic(clamp((t - 0.2) / 1.0));
        ctx.save();
        ctx.translate(0, (1 - p) * 500);
        const g = ctx.createLinearGradient(0, 760, 0, 1600);
        g.addColorStop(0, lighten(ACCENT, 0.15));
        g.addColorStop(1, darken(ACCENT, 0.25));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(60, 1600);
        ctx.lineTo(560, 780);
        ctx.lineTo(1040, 1600);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.moveTo(560, 780);
        ctx.lineTo(640, 910);
        ctx.lineTo(590, 890);
        ctx.lineTo(545, 930);
        ctx.lineTo(500, 880);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        const fq = spring(t - 1.1, 12, 0.5);
        if (t > 1.1) {
          ctx.save();
          ctx.translate(560, 780);
          ctx.scale(fq, fq);
          ctx.strokeStyle = C.ink;
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, -170);
          ctx.stroke();
          ctx.fillStyle = C.loss;
          ctx.beginPath();
          ctx.moveTo(0, -170);
          ctx.quadraticCurveTo(70, -150 + Math.sin(t * 6) * 8, 120, -140);
          ctx.lineTo(0, -100);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          burst(ctx, t - 1.15, 560, 640, { seed: 'peak', n: 26, colors: [C.gold, '#fff', ACCENT], speed: 900, gravity: 900, size: 10, life: 1.2, shape: 'rect' });
        }
        const bq = ease.outCubic(clamp((t - 1.4) / 0.6));
        ctx.save();
        ctx.globalAlpha = bq;
        ctx.fillStyle = '#fff';
        rr(ctx, 140, 1660, 800, 70, 35);
        ctx.fill();
        ctx.fillStyle = ACCENT;
        rr(ctx, 140, 1660, 800 * bq, 70, 35);
        ctx.fill();
        label(ctx, '100% funded', W / 2, 1695, { size: 34, weight: 800, color: '#fff' });
        ctx.restore();
      },
    }),

    taglineScene({ a: 'Less hoping.', b: 'More *planning.*', accent: ACCENT }),
    endScene({ toolName: 'Reverse Goal Planner', accent: ACCENT, logo, iconName: 'flag', toolId: 'goals' }),
  ];
}
