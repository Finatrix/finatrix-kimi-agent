// Budget Builder — numbers from TOOL_GUIDES.budget.worked (₹80,000 take-home, 50/30/20).
import { W, H, C, clamp, lerp, ease, spring, inr, lighten, darken, rgba } from '../engine/core.js';
import { rr, softShadow, sphere, meltBlob, bubbles, burst, critter, bgPaper, floorShadow, stamp, pill, tabular, embossText, ring } from '../engine/draw.js';
import { kinetic, label } from '../engine/text.js';
import { icon } from '../engine/icons.js';
import { appWindow, field, gapBar, phone } from '../engine/ui.js';
import { hookScene, slamScene, questionScene, nightScene, glowClock, revealScene, morningScene, taglineScene, endScene, tracker } from '../engine/scenes.js';
import { bittenSphere, floatDelta, calendarChip, lunge, chompOpen, blink, countTo, HEAD_Y } from '../engine/kit.js';

const ACCENT = '#16A36A';
const RENT = '#7C5CFF';
const BILLS = '#2E90FA';
const WANTS = '#EE46BC';

/** In-app plan screen on the phone: the month already allocated. */
function appPlan(c, box, t, at) {
  const x = box.x + 34;
  const w = box.w - 68;
  label(c, 'October plan', x, box.y + 120, { size: 34, weight: 800, align: 'left' });
  label(c, 'Take-home ₹80,000', x, box.y + 168, { size: 24, weight: 600, color: C.mute, align: 'left' });
  const rows = [['Needs', 40000, ACCENT], ['Wants', 24000, '#2E90FA'], ['Savings', 16000, '#F5A524']];
  rows.forEach(([n, v, col], i) => {
    const q = ease.outBack(clamp((t - at - i * 0.18) / 0.35));
    const y = box.y + 250 + i * 150;
    c.save();
    c.globalAlpha = clamp(q);
    c.fillStyle = '#FFFFFF';
    rr(c, x, y, w, 124, 26);
    c.fill();
    c.strokeStyle = '#ECEAE4';
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = col;
    rr(c, x + 22, y + 30, 64, 64, 18);
    c.fill();
    icon(c, 'check', x + 54, y + 62, 40, { color: '#fff', lw: 14 });
    label(c, n, x + 110, y + 46, { size: 28, weight: 700, align: 'left' });
    label(c, 'has a job', x + 110, y + 84, { size: 22, weight: 600, color: C.mute, align: 'left' });
    label(c, inr(v), x + w - 22, y + 62, { size: 30, weight: 800, align: 'right' });
    c.restore();
  });
}

function hookCard(ctx, w, h, t) {
  label(ctx, 'This month', 56, 70, { size: 32, weight: 600, color: C.mute, align: 'left' });
  label(ctx, 'Take-home', w - 56, 70, { size: 32, weight: 600, color: C.mute, align: 'right' });
  tabular(ctx, '₹80,000', 56, 190, 132, { align: 'left', weight: 800 });
  // spent bar fills to 100% — the month ran out
  const p = ease.inOutCubic(clamp((t - 0.6) / 1.2));
  label(ctx, 'Spent', 56, 330, { size: 30, weight: 700, align: 'left' });
  label(ctx, `${Math.round(p * 100)}%`, w - 56, 330, { size: 30, weight: 800, align: 'right', color: p > 0.95 ? C.loss : C.ink });
  ctx.fillStyle = '#EFEDE8';
  rr(ctx, 56, 370, w - 112, 34, 17);
  ctx.fill();
  ctx.fillStyle = p > 0.95 ? C.loss : ACCENT;
  rr(ctx, 56, 370, (w - 112) * p, 34, 17);
  ctx.fill();
  label(ctx, p > 0.95 ? 'Day 20 of 30' : 'Day 1 of 30', 56, 460, { size: 28, weight: 600, color: C.mute, align: 'left' });
}

export default function story({ timeline, logo }) {
  const L = Object.fromEntries(timeline.lines.map((l) => [l.id, l]));
  const hookDur = L.lie.start - 0.12;

  return [
    hookScene({ text: "Your salary isn't *too small.*", card: hookCard, accent: ACCENT }),
    slamScene({ pre: 'Your budget is', word: 'LYING.', needle: 'lying', sub: 'to you.', card: hookCard, accent: ACCENT, hookDur }),

    // ---- lands → gone: the coin drops on the 1st, melts by the 20th
    {
      at: 'lands',
      trans: 'whip',
      mood: 'tension',
      draw(ctx, s) {
        const { t } = s;
        bgPaper(ctx, ACCENT);
        bubbles(ctx, t, { seed: 'coin', count: 8, color: ACCENT, area: [0, 400, W, 1300], minR: 8, maxR: 20 });
        const lands = s.line('lands');
        const gone = s.line('gone');
        const dropAt = s.word('lands', 'lands') - 0.15;
        const fall = clamp((t - dropAt) / 0.45);
        const y0 = lerp(-300, 980, ease.inQuad(fall));
        const bounce = t > dropAt + 0.45 ? spring(t - dropAt - 0.45, 16, 0.35) : 0;
        const squash = t > dropAt + 0.45 ? 1 - 0.18 * Math.sin(Math.min(1, (t - dropAt - 0.45) / 0.25) * Math.PI) : 1;
        const meltP = clamp((t - gone.s + 0.05) / (gone.d + 0.5));
        const val = Math.round(countTo(t, gone.s, gone.d + 0.4, 80000, 0) / 100) * 100;
        const R = 250;
        if (meltP <= 0) {
          sphere(ctx, W / 2, y0, R, ACCENT, { sx: 2 - squash, sy: squash, shadowY: 1250 });
          embossText(ctx, inr(80000), W / 2, y0 + 6, 104, { max: R * 1.6 });
          if (bounce) ring(ctx, t - dropAt - 0.45, W / 2, 1250, { r0: 60, r1: 420, life: 0.5, color: rgba(ACCENT, 0.6), width: 10 });
        } else {
          meltBlob(ctx, W / 2, 980, R, ACCENT, meltP, 1430, 'budgetmelt', val > 0 ? inr(val) : '₹0', 104);
        }
        calendarChip(ctx, 905, 560, t, '1', '20', gone.s - 0.1, { alpha: ease.outCubic(clamp((t - dropAt) / 0.3)) });
        kinetic(ctx, 'It lands on *the 1st.*', W / 2, HEAD_Y, t, { size: 92, accent: ACCENT, t0: lands.s - 0.05, span: lands.d * 0.7, out: gone.s - 0.25 });
        kinetic(ctx, 'By the 20th? *Gone.*', W / 2, HEAD_Y, t, { size: 92, accent: C.loss, t0: gone.s - 0.05, span: gone.d * 0.7 });
      },
      sfx: (s) => [[s.word('lands', 'lands') + 0.3, 'thud', 1], [s.line('gone').s, 'drip', 0.9], [s.line('gone').s + 0.6, 'drip', 0.6], [s.line('gone').s - 0.1, 'flip', 0.6]],
    },

    questionScene({ text: 'So where did it *go?*', accent: ACCENT }),

    // ---- the leaks: three critters take bites
    {
      at: 'l1',
      trans: 'whip',
      mood: 'groove',
      draw(ctx, s) {
        const { t } = s;
        bgPaper(ctx, ACCENT);
        bubbles(ctx, t, { seed: 'leak', count: 7, color: ACCENT, area: [0, 500, W, 1200], minR: 8, maxR: 18 });
        const ids = ['l1', 'l2', 'l3', 'l4'];
        const ln = ids.map((id) => s.line(id));
        const biteAt = [s.word('l1', 'took'), s.word('l2', 'twenty'), s.word('l3', 'another')];
        const amounts = [28000, 20000, 20000];
        const left = [80000, 52000, 32000, 12000];
        const critters = [
          { c: RENT, name: 'Rent', icon: 'house', side: -1 },
          { c: BILLS, name: 'Bills & groceries', icon: 'cart', side: 1 },
          { c: WANTS, name: 'Wants', icon: 'bag', side: -1 },
        ];
        // remaining value
        let remain = 80000;
        biteAt.forEach((bt, i) => {
          if (t > bt) remain = left[i + 1];
        });
        const bx = W / 2;
        const by = 1010;
        const shrinkT = ln[3].s;
        const R = lerp(250, 150, ease.inOutCubic(clamp((t - shrinkT) / 0.6))) * (0.94 + 0.06 * (remain / 80000));
        const bites = biteAt.map((bt, i) => ({ a: critters[i].side < 0 ? Math.PI + (i === 2 ? 0.5 : -0.25) : -0.3, t: t - bt, size: 0.9 }));
        // lineup row at the bottom once each critter has eaten
        critters.forEach((cr, i) => {
          const enter = ln[i].s - 0.25;
          if (t < enter) return;
          const restX = bx + cr.side * 400;
          const restY = 1060;
          const rowX = 220 + i * 320;
          const rowY = 1600;
          const toRow = ease.inOutCubic(clamp((t - (biteAt[i] + 0.55)) / 0.5));
          const inP = spring(t - enter, 11, 0.55);
          let x = lerp(bx + cr.side * 900, restX, inP);
          let y = restY;
          x += -cr.side * lunge(t, biteAt[i], 150);
          x = lerp(x, rowX, toRow);
          y = lerp(y, rowY, toRow);
          const r = lerp(115, 92, toRow);
          const look = toRow > 0.5 ? [0, -0.3] : [-cr.side, 0.1];
          critter(ctx, x, y - r, r, cr.c, {
            look,
            blink: blink(t, i * 3),
            mouth: toRow > 0.6 ? { type: 'grin' } : { type: 'chomp', open: chompOpen(t, biteAt[i]) },
            accessory: { draw: (c, rr0) => icon(c, cr.icon, 0, -rr0 * 1.25, rr0 * 0.75, { color: darken(cr.c, 0.3), lw: 10, fill: lighten(cr.c, 0.7) }) },
            sy: 1 + 0.06 * Math.sin(t * 6 + i),
          });
          const tagA = toRow;
          if (tagA > 0.05) {
            pill(ctx, x, y + 56, cr.name, { size: 28, bg: '#fff', alpha: tagA });
            label(ctx, '−' + inr(amounts[i]), x, y + 126, { size: 44, weight: 800, color: C.loss, alpha: tagA });
          }
          floatDelta(ctx, t - biteAt[i] - 0.05, bx + cr.side * 120, by - R - 60, '−' + inr(amounts[i]), { hold: 0.9 });
        });
        bittenSphere(ctx, bx, by, R, ACCENT, bites, { text: inr(remain), textSize: R * 0.4 });
        if (t > ln[3].s) {
          const q = ease.outBack(clamp((t - ln[3].s - 0.2) / 0.4));
          pill(ctx, bx, by + R + 70, 'Savings', { size: 28, bg: ACCENT, fg: '#fff', alpha: q });
        }
        tracker(ctx, 120, 150, inr(remain), 'left this month', ACCENT);
        const heads = ['Rent took *₹28,000.*', 'Bills & groceries, *₹20,000* more.', 'Wants, *another ₹20,000.*', 'And savings? Just *₹12,000.*'];
        heads.forEach((hd, i) => {
          kinetic(ctx, hd, W / 2, 420, t, { size: 80, accent: i === 3 ? ACCENT : C.loss, t0: ln[i].s - 0.05, span: ln[i].d * 0.6, out: i < 3 ? ln[i + 1].s - 0.22 : null, maxW: 920 });
        });
      },
      sfx: (s) => {
        const b = [s.word('l1', 'took'), s.word('l2', 'twenty'), s.word('l3', 'another')];
        return [
          ...['l1', 'l2', 'l3'].map((id) => [s.line(id).s - 0.25, 'slide', 0.6]),
          ...b.map((x) => [x, 'chomp', 1]),
          ...b.map((x) => [x + 0.08, 'coin', 0.5]),
          [s.line('l4').s + 0.1, 'sad', 0.7],
        ];
      },
    },

    nightScene({
      text: 'And you only find out at *midnight,* on the 20th.',
      accent: ACCENT,
      ticks: true,
      content(ctx, s) {
        glowClock(ctx, W / 2, 1100, 230, s.t, { toH: 11, toM: 59, sweep: 2.2 });
        calendarChip(ctx, 850, 1500, s.t, '20', '20', 99, { size: 0.8, alpha: ease.outCubic(clamp((s.t - 0.6) / 0.4)) });
      },
    }),

    revealScene({ toolName: 'Budget Builder', accent: ACCENT, logo }),

    // ---- the product: take-home → 50/30/20 → the gap
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
        const wy = lerp(H, 520, enter);
        const box = appWindow(ctx, 70, wy, 940, 980, { title: 'Budget Builder', accent: ACCENT, iconName: 'percent' });
        const typeAt = s.word('split', 'take-home');
        const typedN = Math.floor(clamp((t - typeAt) * 14, 0, 7));
        field(ctx, box.x, box.y, box.w, 'Monthly take-home', '₹80,000'.slice(0, typedN + 1).padEnd(1), { focus: t > typeAt - 0.2 && t < s.word('split', 'fifty') ? 1 : 0, accent: ACCENT });
        // 50/30/20 split bar
        const segs = [
          { n: 'Needs', p: 0.5, v: 40000, c: ACCENT, at: s.word('split', 'fifty') },
          { n: 'Wants', p: 0.3, v: 24000, c: '#2E90FA', at: s.word('split', 'thirty') },
          { n: 'Savings', p: 0.2, v: 16000, c: '#F5A524', at: s.word('split', 'twenty') },
        ];
        const toGap = ease.inOutCubic(clamp((t - gp.s + 0.1) / 0.5));
        const sy = box.y + 210;
        let sx = box.x;
        ctx.save();
        ctx.globalAlpha = 1 - toGap;
        segs.forEach((g) => {
          const q = ease.outBack(clamp((t - g.at) / 0.35), 1.4);
          const w = box.w * g.p - 8;
          if (q > 0) {
            ctx.save();
            ctx.translate(sx + w / 2, sy + 90);
            ctx.scale(q, q);
            const grad = ctx.createLinearGradient(0, -90, 0, 90);
            grad.addColorStop(0, lighten(g.c, 0.15));
            grad.addColorStop(1, darken(g.c, 0.1));
            ctx.fillStyle = grad;
            rr(ctx, -w / 2, -110, w, 220, 30);
            ctx.fill();
            label(ctx, `${Math.round(g.p * 100)}%`, 0, -30, { size: 66, weight: 900, color: '#fff' });
            label(ctx, g.n, 0, 42, { size: 30, weight: 700, color: 'rgba(255,255,255,0.9)' });
            ctx.restore();
            label(ctx, inr(g.v), sx + w / 2, sy + 270, { size: 40, weight: 800, alpha: q });
          }
          sx += box.w * g.p;
        });
        ctx.restore();
        // gap rows
        if (toGap > 0) {
          const rows = [
            { n: 'Needs', tg: 40000, ac: 48000, tag: '+₹8,000 over' },
            { n: 'Wants', tg: 24000, ac: 20000, tag: 'within' },
            { n: 'Savings', tg: 16000, ac: 12000, tag: '−₹4,000 short' },
          ];
          rows.forEach((r, i) => {
            const rp = clamp((t - gp.s - 0.2 - i * 0.18) / 0.6);
            gapBar(ctx, box.x, sy + 20 + i * 170 + (1 - toGap) * 60, box.w, r.n, r.tg, r.ac, 50000, { p: rp, color: i === 0 ? ACCENT : i === 1 ? '#2E90FA' : '#F5A524', alpha: toGap, tag: rp > 0.8 ? r.tag : '' });
          });
          // the score you don't get
          const sc = s.word('gap', 'not');
          const scP = ease.outBack(clamp((t - sc) / 0.3));
          if (scP > 0) {
            const x0 = box.x + box.w / 2;
            const y0 = sy + 545;
            ctx.save();
            ctx.globalAlpha = scP;
            pill(ctx, x0, y0, 'Budget score: 62/100', { size: 34, bg: '#F2F1ED', fg: C.mute, shadow: false });
            const strike = ease.outCubic(clamp((t - sc - 0.3) / 0.3));
            ctx.strokeStyle = C.loss;
            ctx.lineWidth = 8;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x0 - 220, y0);
            ctx.lineTo(x0 - 220 + 440 * strike, y0);
            ctx.stroke();
            ctx.restore();
          }
        }
        kinetic(ctx, 'It splits it *50 / 30 / 20.*', W / 2, 250, t, { size: 76, accent: ACCENT, t0: sp.s + sp.d * 0.35, span: sp.d * 0.5, out: gp.s - 0.2 });
        kinetic(ctx, 'Not a score. *The gap.*', W / 2, 250, t, { size: 84, accent: C.loss, t0: gp.s - 0.05, span: gp.d * 0.7 });
      },
      sfx: (s) => [
        [0.05, 'swoosh', 0.6],
        [s.word('split', 'take-home'), 'type', 0.6],
        [s.word('split', 'fifty'), 'pop', 0.8],
        [s.word('split', 'thirty'), 'pop', 0.8],
        [s.word('split', 'twenty'), 'pop', 0.8],
        [s.line('gap').s + 0.2, 'slide', 0.5],
        [s.word('gap', 'score') + 0.3, 'scratch', 0.7],
      ],
    },

    // ---- the verdict
    {
      at: 'stamp',
      trans: 'zoom',
      mood: 'drop',
      draw(ctx, s) {
        const { t } = s;
        bgPaper(ctx, ACCENT);
        const L1 = s.word('stamp', 'needs');
        const L2 = s.word('stamp', 'savings');
        const cards = [
          { at: L1, title: 'Needs', big: '+₹8,000', sub: 'over target', c: C.loss, y: 820 },
          { at: L2, title: 'Savings', big: '−₹4,000', sub: 'short of target', c: '#E8890C', y: 1260 },
        ];
        cards.forEach((cd) => {
          const p = spring(t - cd.at + 0.1, 12, 0.5);
          if (t < cd.at - 0.1) return;
          ctx.save();
          ctx.translate(W / 2, cd.y);
          ctx.scale(p, p);
          softShadow(ctx, -420, -170, 840, 340, 48, { spread: 50, alpha: 0.18, dy: 30 });
          ctx.fillStyle = '#fff';
          rr(ctx, -420, -170, 840, 340, 48);
          ctx.fill();
          label(ctx, cd.title, -360, -90, { size: 40, weight: 700, color: C.mute, align: 'left' });
          tabular(ctx, cd.big, -360, 20, 150, { align: 'left', color: cd.c, weight: 900 });
          label(ctx, cd.sub, -360, 120, { size: 32, weight: 600, color: C.ink2, align: 'left' });
          ctx.restore();
        });
        stamp(ctx, t - (L2 + 0.45), 790, 1075, 'THE GAP', { color: C.loss, size: 70, rot: -0.18 });
        const st = s.line('stamp');
        kinetic(ctx, 'Needs: *over.*', W / 2, 330, t, { size: 92, accent: C.loss, t0: L1 - 0.1, stagger: 0.12 });
        kinetic(ctx, 'Savings: *short.*', W / 2, 440, t, { size: 92, accent: '#E8890C', t0: L2 - 0.1, stagger: 0.12 });
      },
      sfx: (s) => [[s.word('stamp', 'needs') - 0.05, 'pop', 1], [s.word('stamp', 'savings') - 0.05, 'pop', 1], [s.word('stamp', 'savings') + 0.45, 'stamp', 1]],
    },

    // ---- the insight: it's the rent
    {
      at: 'feature',
      trans: 'whip',
      mood: 'groove',
      draw(ctx, s) {
        const { t } = s;
        bgPaper(ctx, ACCENT);
        const f = s.line('feature');
        const rentAt = s.word('feature', 'rent');
        const grocAt = s.word('feature', 'groceries');
        // spotlight on the rent critter
        const spot = ease.outCubic(clamp((t - rentAt + 0.2) / 0.4));
        ctx.save();
        ctx.fillStyle = `rgba(12,9,30,${0.82 * spot})`;
        ctx.fillRect(0, 0, W, H);
        if (spot > 0) {
          const g = ctx.createRadialGradient(320, 1150, 40, 320, 1150, 520);
          g.addColorStop(0, `rgba(255,248,220,${0.75 * spot})`);
          g.addColorStop(1, 'rgba(255,248,220,0)');
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, W, H);
        }
        ctx.restore();
        // groceries critter shakes its head ("not me")
        const gq = spring(t - 0.1, 10, 0.5);
        const no = t > grocAt ? Math.sin((t - grocAt) * 18) * 14 * Math.exp(-(t - grocAt) * 2.5) : 0;
        critter(ctx, 770 + no, 1260 - 165 * gq, 165 * gq, BILLS, { look: [-0.5, 0], blink: blink(t, 2), mouth: { type: 'flat' }, accessory: { draw: (c, r) => icon(c, 'cart', 0, -r * 1.25, r * 0.75, { color: darken(BILLS, 0.3), lw: 10, fill: lighten(BILLS, 0.7) }) } });
        pill(ctx, 770, 1340, 'Groceries ₹20,000', { size: 30, alpha: gq });
        const rq = spring(t - 0.25, 10, 0.5);
        const guilty = t > rentAt ? 1 : 0;
        critter(ctx, 320, 1260 - 195 * rq * (1 + 0.1 * guilty), 195 * rq, RENT, { look: [0.4, -0.2 + 0.4 * guilty], blink: blink(t, 5), mouth: guilty ? { type: 'o', open: 0.5 } : { type: 'smile' }, sx: 1 + 0.1 * guilty, sy: 1 + 0.1 * guilty, accessory: { draw: (c, r) => icon(c, 'house', 0, -r * 1.25, r * 0.75, { color: darken(RENT, 0.3), lw: 10, fill: lighten(RENT, 0.7) }) } });
        pill(ctx, 320, 1350, 'Rent ₹28,000', { size: 34, bg: guilty ? RENT : '#fff', fg: guilty ? '#fff' : C.ink, alpha: rq });
        if (guilty) {
          const q = ease.outCubic(clamp((t - rentAt) / 0.5));
          label(ctx, '58% of your needs', 320, 1450, { size: 40, weight: 800, color: '#fff', alpha: q });
        }
        kinetic(ctx, "It's not your *groceries.*", W / 2, 360, t, { size: 84, accent: BILLS, t0: f.s - 0.05, span: (rentAt - f.s) * 0.6, color: spot > 0.5 ? '#fff' : C.ink });
        kinetic(ctx, "It's your *rent.*", W / 2, 470, t, { size: 104, accent: lighten(RENT, 0.2), t0: rentAt - 0.35, stagger: 0.12, color: '#fff' });
      },
      sfx: (s) => [[s.word('feature', 'groceries'), 'nope', 0.6], [s.word('feature', 'rent') - 0.15, 'spotlight', 0.9]],
    },

    morningScene({
      text: 'Every rupee already has a *job.*',
      accent: ACCENT,
      content(ctx, s) {
        const { t } = s;
        const p = spring(t - 0.2, 9, 0.6);
        phone(ctx, 520, lerp(2300, 1090, p), 470, {
          lock: false,
          screenTop: '#FFFFFF',
          screenBot: '#F4F3EF',
          content(c, box) {
            appPlan(c, box, t, s.word('morning', 'rupee'));
          },
        });
      },
    }),

    taglineScene({ a: 'Less guessing.', b: 'More *saving.*', accent: ACCENT }),
    endScene({ toolName: 'Budget Builder', accent: ACCENT, logo, iconName: 'percent', toolId: 'budget' }),
  ];
}
