// Reusable scene builders shared by all eight tool films.
import { W, H, C, clamp, lerp, ease, spring, shake, prog, rng, mix, lighten, darken, rgba, luminance, noise1 } from './core.js';
import { rr, softShadow, sphere, bubbles, burst, ring, makeShards, drawShards, stars, bgPaper, bgAccent, bgNight, floorShadow } from './draw.js';
import { kinetic, label } from './text.js';
import { icon, iconTile } from './icons.js';
import { TOOLS } from './tools.js';

/** Text colours that read on a given accent background. */
export function inkOn(accent) {
  const light = luminance(accent) > 0.36;
  return { fg: light ? C.ink : '#FFFFFF', alt: light ? '#FFFFFF' : C.ink };
}

// ---------------- brand ----------------
export function wordmark(ctx, x, y, size, { dark = false, alpha = 1, align = 'center' } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `900 ${size}px Geist`;
  ctx.letterSpacing = `${-0.035 * size}px`;
  const a = 'Finatri';
  const wa = ctx.measureText(a).width;
  const wx = ctx.measureText('X').width;
  const total = wa + wx;
  const x0 = align === 'center' ? x - total / 2 : x;
  ctx.translate(x0, y);
  ctx.transform(1, 0, -0.2, 1, 0, 0);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = dark ? '#FFFFFF' : C.ink;
  ctx.fillText(a, 0, 0);
  ctx.fillStyle = C.gold;
  ctx.fillText('X', wa, 0);
  ctx.restore();
  return total;
}

export function logoTile(ctx, img, x, y, size, { rot = 0, sweep = -1, alpha = 1, shadow = true } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  const r = size * 0.24;
  if (shadow) softShadow(ctx, -size / 2, -size / 2, size, size, r, { spread: size * 0.3, alpha: 0.28, dy: size * 0.12 });
  rr(ctx, -size / 2, -size / 2, size, size, r);
  ctx.clip();
  ctx.fillStyle = '#272727';
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  if (sweep >= 0 && sweep <= 1) {
    const sx = lerp(-size * 1.2, size * 1.2, sweep);
    const g = ctx.createLinearGradient(sx - size * 0.3, -size, sx + size * 0.3, size);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-size / 2, -size / 2, size, size);
  }
  ctx.restore();
}

// ---------------- 1. hook ----------------
const HOOK_ZOOM = 0.05;
/**
 * Accent background, a floating product card, the hook line popping in above.
 * `card(ctx, w, h, t)` draws card content in card-local coords (0,0 top-left).
 */
export function hookScene({ at = 'hook', text, card, accent, cardW = 820, cardH = 560, size = 92 }) {
  const { fg, alt } = inkOn(accent);
  return {
    at,
    mood: 'intro',
    push: 0,
    draw(ctx, s) {
      const { t } = s;
      bgAccent(ctx, accent);
      bubbles(ctx, t, { seed: 'hook', count: 9, color: lighten(accent, 0.35), area: [0, 500, W, 1400], minR: 18, maxR: 60, speed: 1.2 });
      const z = 1 + HOOK_ZOOM * ease.inOutQuad(clamp(t / s.d));
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(z, z);
      ctx.translate(-W / 2, -H / 2);
      drawFloatingCard(ctx, card, t, cardW, cardH, 1);
      ctx.restore();
      const L = s.line(at);
      kinetic(ctx, text, W / 2, 330, t, { size, color: fg, accent: alt, t0: L.s - 0.05, span: L.d * 0.75 });
    },
    sfx: (s) => [[0.05, 'riser', 0.6], [0.35, 'pop', 0.7]],
  };
}

/** Card placement shared by hook and slam so the shatter starts where the hook left off. */
export function cardPose(t, cardW, cardH) {
  const enter = spring(t - 0.05, 9, 0.55);
  const cx = W / 2;
  const cy = lerp(H + 400, H * 0.6, enter) + Math.sin(t * 1.7) * 14;
  const rot = -0.05 + Math.sin(t * 1.1) * 0.025;
  return { cx, cy, rot, x: cx - cardW / 2, y: cy - cardH / 2 };
}

function drawFloatingCard(ctx, card, t, w, h, alpha) {
  const p = cardPose(t, w, h);
  floorShadow(ctx, p.cx, p.cy + h / 2 + 110, w * 0.42, 34, 0.25);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(p.cx, p.cy);
  ctx.rotate(p.rot);
  ctx.transform(1, 0.02, -0.03, 1, 0, 0);
  ctx.translate(-w / 2, -h / 2);
  softShadow(ctx, 0, 0, w, h, 46, { spread: 60, alpha: 0.24, dy: 40 });
  ctx.fillStyle = '#FFFFFF';
  rr(ctx, 0, 0, w, h, 46);
  ctx.fill();
  ctx.save();
  rr(ctx, 0, 0, w, h, 46);
  ctx.clip();
  card(ctx, w, h, t);
  ctx.restore();
  ctx.restore();
}

// ---------------- 2. slam ----------------
/**
 * The card keeps floating while `pre` appears, then the big word smashes
 * through it: shards, flash, shake, and the serif tail writes on.
 */
export function slamScene({ at = 'lie', pre, word, needle, sub, card, accent, cardW = 820, cardH = 560, hookDur = 0, wordSize = 250 }) {
  const { fg, alt } = inkOn(accent);
  let cardImg = null;
  let shards = null;
  return {
    at,
    mood: 'hit',
    push: 0,
    draw(ctx, s) {
      const { t } = s;
      const ti = s.word(at, needle) - 0.04; // impact
      const after = t - ti;
      const [sx, sy] = shake(after, 30, 42, 6);
      bgAccent(ctx, accent);
      bubbles(ctx, s.T, { seed: 'hook', count: 9, color: lighten(accent, 0.35), area: [0, 500, W, 1400], minR: 18, maxR: 60, speed: 1.2 });
      ctx.save();
      ctx.translate(sx, sy);
      const ht = hookDur + t; // continue the hook card's float
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(1 + HOOK_ZOOM, 1 + HOOK_ZOOM);
      ctx.translate(-W / 2, -H / 2);
      if (after < 0) {
        drawFloatingCard(ctx, card, ht, cardW, cardH, 1);
      } else {
        if (!cardImg) {
          cardImg = new OffscreenCanvas(W, H);
          const c = cardImg.getContext('2d');
          drawFloatingCard(c, card, hookDur + ti, cardW, cardH, 1);
          const p = cardPose(hookDur + ti, cardW, cardH);
          shards = makeShards('shard' + word, p.x - 30, p.y - 30, cardW + 60, cardH + 60, 6, 8, [p.cx, p.cy - 60]);
        }
        drawShards(ctx, cardImg, shards, after * 0.9);
      }
      ctx.restore();
      // pre line
      const L = s.line(at);
      kinetic(ctx, pre, W / 2, 360, t, { size: 74, color: fg, accent: alt, t0: L.s - 0.05, span: Math.max(0.2, ti - L.s) * 0.85, out: null });
      if (after >= 0) {
        const p = clamp(after / 0.14);
        const sc = lerp(3.2, 1, ease.outQuart(p));
        ctx.save();
        ctx.translate(W / 2, H * 0.53);
        ctx.font = `900 ${wordSize}px Geist`;
        ctx.letterSpacing = `${-0.055 * wordSize}px`;
        const ww = ctx.measureText(word).width;
        const fit = Math.min(1, 960 / ww);
        ctx.scale(sc * fit, sc * fit);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // motion taps while flying in
        if (p < 1) {
          for (let k = 3; k >= 1; k--) {
            ctx.save();
            ctx.globalAlpha = 0.15 * (1 - p);
            ctx.scale(1 + 0.18 * k * (1 - p), 1 + 0.18 * k * (1 - p));
            ctx.fillStyle = C.ink;
            ctx.fillText(word, 0, 0);
            ctx.restore();
          }
        }
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillText(word, 6, 14);
        ctx.fillStyle = C.ink;
        ctx.fillText(word, 0, 0);
        ctx.restore();
        ring(ctx, after, W / 2, H * 0.53, { r0: 80, r1: 900, life: 0.55, color: '#fff', width: 16 });
        burst(ctx, after, W / 2, H * 0.53, { seed: 'dust', n: 34, colors: ['#ffffff', lighten(accent, 0.5), C.ink], speed: 1500, gravity: 1400, size: 9, life: 1.1, shape: 'spark' });
        // serif tail
        if (sub) {
          const tt = after - 0.22;
          if (tt > 0) {
            ctx.save();
            ctx.font = `italic 400 128px "Instrument Serif"`;
            ctx.fillStyle = alt;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const sw = ctx.measureText(sub).width;
            ctx.beginPath();
            ctx.rect(W / 2 - sw / 2 - 20, H * 0.53 + 120, (sw + 40) * ease.outCubic(clamp(tt / 0.45)), 200);
            ctx.clip();
            ctx.fillText(sub, W / 2, H * 0.53 + 205);
            ctx.restore();
          }
        }
      }
      ctx.restore();
      // impact flash
      if (after >= -0.03 && after < 0.2) {
        ctx.save();
        ctx.globalAlpha = after < 0 ? 0.3 : 0.75 * (1 - after / 0.2);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    },
    sfx: (s) => {
      const ti = s.word(at, needle) - 0.04;
      return [[ti - 0.25, 'whoosh', 0.7], [ti, 'impact', 1], [ti + 0.02, 'shatter', 0.8]];
    },
  };
}

// ---------------- 4. question ----------------
export function questionScene({ at = 'where', text, accent, arcText = null, size = 84 }) {
  return {
    at,
    trans: 'zoom',
    mood: 'tension',
    draw(ctx, s) {
      const { t } = s;
      bgPaper(ctx, accent);
      bubbles(ctx, t, { seed: 'q', count: 8, color: accent, area: [0, 300, W, 1500], minR: 8, maxR: 22 });
      const L = s.line(at);
      // glossy question mark
      const p = spring(t - 0.05, 10, 0.4);
      const wob = Math.sin(t * 3) * 0.04 * (1 - clamp(t / 2));
      const qx = W / 2;
      const qy = H * 0.56;
      ctx.save();
      ctx.translate(qx, qy);
      ctx.rotate(wob + (1 - p) * -0.5);
      ctx.scale(p, p);
      ctx.font = '900 760px Geist';
      ctx.letterSpacing = '0px';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const g = ctx.createLinearGradient(-220, -360, 220, 300);
      g.addColorStop(0, lighten(accent, 0.45));
      g.addColorStop(0.45, accent);
      g.addColorStop(1, darken(accent, 0.35));
      ctx.fillStyle = 'rgba(20,10,30,0.16)';
      ctx.fillText('?', 18, 30);
      ctx.fillStyle = g;
      ctx.fillText('?', 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.restore();
      // highlight stroke
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 6;
      ctx.strokeText('?', -6, -6);
      ctx.restore();
      floorShadow(ctx, qx, qy + 330, 150 * p, 26, 0.22);
      // text on an arc above
      const arc = arcText ?? null;
      if (arc) arcType(ctx, arc, qx, qy + 40, 470, t, L.s, L.d, accent);
      kinetic(ctx, text, W / 2, 330, t, { size, color: C.ink, accent, t0: L.s - 0.05, span: L.d * 0.7 });
    },
    sfx: (s) => [[0.08, 'pop', 1], [0.2, 'boing', 0.6]],
  };
}

function arcType(ctx, str, cx, cy, r, t, t0, d, accent) {
  ctx.save();
  ctx.font = '700 46px Geist';
  ctx.letterSpacing = '0px';
  ctx.fillStyle = C.mute;
  const ws = [...str].map((ch) => ctx.measureText(ch).width);
  const total = ws.reduce((a, b) => a + b, 0);
  let a = -Math.PI / 2 - total / r / 2;
  [...str].forEach((ch, i) => {
    const ta = t - (t0 + (i / str.length) * d * 0.8);
    a += ws[i] / 2 / r;
    if (ta > 0) {
      const q = ease.outBack(clamp(ta / 0.3));
      ctx.save();
      ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.rotate(a + Math.PI / 2);
      ctx.scale(q, q);
      ctx.textAlign = 'center';
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    }
    a += ws[i] / 2 / r;
  });
  ctx.restore();
}

// ---------------- night ----------------
export function nightScene({ at = 'night', text, accent, content = null, glow = '#5B4BFF', textY = 360, ticks = false }) {
  return {
    at,
    trans: 'drop',
    mood: 'dark',
    grain: 1.6,
    draw(ctx, s) {
      const { t } = s;
      bgNight(ctx, glow);
      stars(ctx, t, { seed: 'night', n: 80 });
      if (content) content(ctx, s);
      const L = s.line(at);
      kinetic(ctx, text, W / 2, textY, t, { size: 80, color: '#FFFFFF', accent: lighten(accent, 0.25), t0: L.s - 0.05, span: L.d * 0.8, anim: 'rise' });
    },
    sfx: (s) => [[0.0, 'whooshDown', 0.6], ...(ticks ? Array.from({ length: Math.floor(s.d / 0.5) }, (_, i) => [0.3 + i * 0.5, 'tick', 0.5]) : [])],
  };
}

/** Glowing clock face whose hands sweep to h:m. */
export function glowClock(ctx, cx, cy, r, t, { toH = 11, toM = 58, sweep = 1.4, digital = true, start = 0 } = {}) {
  const halo = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 2.2);
  halo.addColorStop(0, 'rgba(255,255,255,0.22)');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2);
  ctx.fill();
  sphere(ctx, cx, cy, r, '#E9E8F2', { shadow: false, gloss: 0.6 });
  ctx.save();
  ctx.strokeStyle = '#1B1A2A';
  ctx.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.lineWidth = i % 3 === 0 ? 8 : 4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8);
    ctx.lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9);
    ctx.stroke();
  }
  const p = ease.outQuint(clamp((t - start) / sweep));
  const totalMin = lerp(toH * 60 + toM - 300, toH * 60 + toM, p);
  const hA = ((totalMin / 60) % 12) / 12 * Math.PI * 2 - Math.PI / 2;
  const mA = ((totalMin % 60) / 60) * Math.PI * 2 - Math.PI / 2;
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(hA) * r * 0.48, cy + Math.sin(hA) * r * 0.48);
  ctx.stroke();
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(mA) * r * 0.72, cy + Math.sin(mA) * r * 0.72);
  ctx.stroke();
  ctx.fillStyle = C.loss;
  ctx.beginPath();
  ctx.arc(cx, cy, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (digital) {
    const hh = Math.floor(totalMin / 60) % 12 || 12;
    const mm = Math.floor(totalMin % 60);
    label(ctx, `${hh}:${String(mm).padStart(2, '0')} PM`, cx, cy + r + 80, { size: 44, weight: 700, color: 'rgba(255,255,255,0.75)' });
  }
}

// ---------------- reveal ----------------
export function revealScene({ at = 'reveal', toolName, accent, logo }) {
  return {
    at,
    trans: 'flash',
    mood: 'drop',
    draw(ctx, s) {
      const { t } = s;
      bgPaper(ctx, accent);
      // soft rays
      ctx.save();
      ctx.translate(W / 2, 760);
      ctx.rotate(t * 0.15);
      for (let i = 0; i < 12; i++) {
        ctx.rotate(Math.PI / 6);
        const g = ctx.createLinearGradient(0, 0, 0, -1100);
        g.addColorStop(0, rgba(accent, 0.12 * clamp(t / 0.6)));
        g.addColorStop(1, rgba(accent, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-90, -1100);
        ctx.lineTo(90, -1100);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      bubbles(ctx, t, { seed: 'rev', count: 12, color: accent, area: [0, 200, W, 1600], minR: 8, maxR: 26 });
      const L = s.line(at);
      kinetic(ctx, 'Meet', W / 2, 470, t, { size: 64, weight: 600, color: C.mute, t0: L.s - 0.1, stagger: 0.1, anim: 'rise' });
      const p = spring(t - 0.12, 11, 0.5);
      logoTile(ctx, logo, W / 2, 760, 300 * p, { rot: (1 - p) * -0.6, sweep: (t - 0.6) / 0.6 });
      burst(ctx, t - 0.3, W / 2, 760, { seed: 'logo', n: 22, colors: [accent, C.gold, '#fff'], speed: 1100, gravity: 900, size: 10, life: 1.2, shape: 'spark' });
      const wmT = s.word(at, 'finatrix');
      const wq = ease.outQuint(clamp((t - wmT) / 0.5));
      if (wq > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 990, W, 170);
        ctx.clip();
        wordmark(ctx, W / 2, 1075 + (1 - wq) * 160, 150);
        ctx.restore();
      }
      const nT = s.word(at, toolName.split(' ')[0]);
      const nq = spring(t - nT, 12, 0.5);
      if (t > nT) {
        ctx.save();
        ctx.translate(W / 2, 1270);
        ctx.scale(nq, nq);
        ctx.font = '800 68px Geist';
        ctx.letterSpacing = '-2px';
        const tw = ctx.measureText(toolName).width + 110;
        softShadow(ctx, -tw / 2, -62, tw, 124, 62, { spread: 30, alpha: 0.2, dy: 16 });
        const g = ctx.createLinearGradient(0, -62, 0, 62);
        g.addColorStop(0, lighten(accent, 0.12));
        g.addColorStop(1, darken(accent, 0.1));
        ctx.fillStyle = g;
        rr(ctx, -tw / 2, -62, tw, 124, 62);
        ctx.fill();
        ctx.fillStyle = inkOn(accent).fg;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(toolName, 0, 4);
        ctx.restore();
      }
    },
    sfx: (s) => [[0.15, 'chime', 1], [0.35, 'sparkle', 0.6], [s.word(at, toolName.split(' ')[0]), 'pop', 0.8]],
  };
}

// ---------------- morning ----------------
export function morningScene({ at = 'morning', text, accent, content = null, textY = 300, textSize = 72, cup = true }) {
  return {
    at,
    trans: 'whip',
    mood: 'warm',
    draw(ctx, s) {
      const { t } = s;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#FFF8EC');
      g.addColorStop(0.55, '#FFEBD2');
      g.addColorStop(1, '#FBD7B0');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // sun rising behind
      const sunY = lerp(1500, 1160, ease.outCubic(clamp(t / 2.2)));
      const halo = ctx.createRadialGradient(250, sunY, 60, 250, sunY, 520);
      halo.addColorStop(0, 'rgba(255,197,61,0.55)');
      halo.addColorStop(1, 'rgba(255,197,61,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, W, H);
      sphere(ctx, 250, sunY, 120, C.sun, { shadow: false });
      // coffee cup
      if (cup) drawCup(ctx, 880, 1640, t);
      if (content) content(ctx, s);
      const L = s.line(at);
      kinetic(ctx, text, W / 2, textY, t, { size: textSize, color: C.ink, accent: darken(accent, 0.05), t0: L.s - 0.05, span: L.d * 0.75 });
    },
    sfx: (s) => [[0.2, 'birds', 0.4]],
  };
}

function drawCup(ctx, x, y, t) {
  floorShadow(ctx, x, y + 110, 140, 22, 0.2);
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#2A2A33';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(x - 110, y - 70);
  ctx.lineTo(x + 110, y - 70);
  ctx.lineTo(x + 92, y + 100);
  ctx.quadraticCurveTo(x, y + 120, x - 92, y + 100);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + 128, y + 6, 40, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  ctx.strokeStyle = '#E8833A';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(x - 98, y - 40);
  ctx.lineTo(x + 98, y - 40);
  ctx.stroke();
  // steam
  ctx.strokeStyle = 'rgba(80,60,40,0.35)';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    const bx = x - 50 + k * 50;
    for (let i = 0; i <= 20; i++) {
      const yy = y - 100 - i * 9;
      const xx = bx + Math.sin(i * 0.45 + t * 3 + k) * 12;
      ctx.globalAlpha = 0.9 * (1 - i / 20);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------- tagline ----------------
export function taglineScene({ at = 'tag', a, b, needle = 'More', accent }) {
  const { fg, alt } = inkOn(accent);
  return {
    at,
    trans: 'whipUp',
    mood: 'lift',
    draw(ctx, s) {
      const { t } = s;
      const tb = s.word(at, needle);
      bgPaper(ctx, accent);
      kinetic(ctx, a, W / 2, H * 0.47, t, { size: 120, color: C.ink, accent, t0: s.line(at).s - 0.05, stagger: 0.12, anim: 'rise', out: tb - 0.05 });
      if (t > tb - 0.1) {
        const p = ease.inOutCubic(clamp((t - tb + 0.1) / 0.5));
        ctx.save();
        ctx.beginPath();
        ctx.arc(W / 2, H * 0.48, p * 1300, 0, Math.PI * 2);
        ctx.clip();
        bgAccent(ctx, accent);
        bubbles(ctx, t, { seed: 'tag', count: 12, color: lighten(accent, 0.35), minR: 14, maxR: 50 });
        kinetic(ctx, b, W / 2, H * 0.47, t, { size: 130, color: fg, accent: alt, t0: tb, stagger: 0.14, anim: 'pop' });
        ctx.restore();
        burst(ctx, t - tb - 0.3, W / 2, H * 0.45, { seed: 'tagb', n: 40, colors: ['#fff', C.gold, lighten(accent, 0.5)], speed: 1600, gravity: 1300, size: 12, life: 1.3, shape: 'rect' });
      }
    },
    sfx: (s) => [[s.word(at, needle) - 0.1, 'swell', 0.8], [s.word(at, needle) + 0.3, 'confetti', 0.6]],
  };
}

// ---------------- end card ----------------
export function endScene({ at = 'end', toolName, accent, logo, iconName, toolId = null }) {
  return {
    at,
    trans: 'zoom',
    mood: 'outro',
    draw(ctx, s) {
      const { t } = s;
      bgPaper(ctx, accent);
      bubbles(ctx, t, { seed: 'end', count: 10, color: accent, area: [0, 200, W, 1600], minR: 8, maxR: 24 });
      const p = spring(t - 0.05, 10, 0.55);
      logoTile(ctx, logo, W / 2, 620, 240 * p, { rot: (1 - p) * 0.4, sweep: (t - 0.5) / 0.6 });
      const q = ease.outQuint(clamp((t - 0.2) / 0.5));
      wordmark(ctx, W / 2, 870 + (1 - q) * 40, 128, { alpha: q });
      label(ctx, toolName, W / 2, 990, { size: 58, weight: 700, color: C.ink2, alpha: ease.outCubic(clamp((t - 0.45) / 0.4)) });
      // CTA
      const ct = 0.9;
      const cq = spring(t - ct, 12, 0.5);
      const click = s.word(at, 'Free') + 0.35;
      const press = t > click ? Math.max(0, 1 - (t - click) / 0.18) : 0;
      if (t > ct) {
        ctx.save();
        ctx.translate(W / 2, 1180);
        ctx.scale(cq * (1 - press * 0.05), cq * (1 - press * 0.05));
        const bw = 640;
        const bh = 136;
        softShadow(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2, { spread: 40, alpha: 0.28, dy: 22 });
        const g = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
        g.addColorStop(0, lighten(accent, 0.1));
        g.addColorStop(1, darken(accent, 0.12));
        ctx.fillStyle = g;
        rr(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
        ctx.fill();
        ctx.fillStyle = inkOn(accent).fg;
        ctx.font = '800 52px Geist';
        ctx.letterSpacing = '-1px';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Try it free  →', 0, 4);
        ctx.restore();
        label(ctx, 'finatrix.co', W / 2, 1320, { size: 54, weight: 700, color: C.ink, alpha: ease.outCubic(clamp((t - ct - 0.2) / 0.4)) });
      }
      ring(ctx, t - click, W / 2 + 120, 1200, { r0: 10, r1: 160, life: 0.5, color: accent, width: 10 });
      burst(ctx, t - click, W / 2 + 120, 1200, { seed: 'cta', n: 18, colors: [accent, C.gold], speed: 700, gravity: 600, size: 9, life: 0.9, shape: 'spark' });
      // cursor glides in and clicks
      const cp = ease.inOutCubic(clamp((t - (click - 0.7)) / 0.6));
      if (t > click - 0.75) {
        const cx = lerp(980, W / 2 + 120, cp);
        const cy = lerp(1650, 1196, cp);
        cursorArrow(ctx, cx, cy, press);
      }
      // the suite: one of eight free tools
      const rowT = 1.3;
      label(ctx, `One of ${TOOLS.length} free money tools`, W / 2, 1520, { size: 34, weight: 700, color: C.ink2, alpha: ease.outCubic(clamp((t - rowT) / 0.4)) });
      TOOLS.forEach((tl, i) => {
        const q = ease.outBack(clamp((t - rowT - 0.1 - i * 0.06) / 0.35), 2);
        const x = W / 2 + (i - 3.5) * 118;
        const me = tl.id === toolId;
        const sz = (me ? 100 : 84) * q;
        if (sz < 2) return;
        if (me) ring(ctx, ((t - rowT - 0.7) % 1.6), x, 1640, { r0: 40, r1: 90, life: 0.9, color: tl.color, width: 6 });
        iconTile(ctx, tl.icon, x, 1640, sz, tl.color);
      });
      label(ctx, 'Educational tools · Not financial advice', W / 2, 1770, { size: 28, weight: 600, color: C.mute, alpha: ease.outCubic(clamp((t - 1.6) / 0.5)) });
    },
    sfx: (s) => [[0.05, 'pop', 0.7], [0.9, 'pop', 0.6], [s.word(at, 'Free') + 0.35, 'click', 1], [s.word(at, 'Free') + 0.38, 'ding', 0.8]],
  };
}

function cursorArrow(ctx, x, y, press) {
  ctx.save();
  ctx.translate(x, y);
  const k = 1.3 * (1 - press * 0.12);
  ctx.scale(k, k);
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

/** Small "what's left" tracker pinned top-left, like the reference's mini blob. */
export function tracker(ctx, x, y, value, caption, accent, { alpha = 1, r = 46 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  sphere(ctx, x, y, r, accent, { shadow: false });
  ctx.font = `800 ${r * 0.42}px Geist`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(20,10,0,0.8)';
  const w = ctx.measureText(value).width;
  const k = Math.min(1, (r * 1.6) / w);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillText(value, 0, 2);
  ctx.restore();
  label(ctx, caption, x + r + 18, y, { size: 28, weight: 600, color: C.mute, align: 'left' });
  ctx.restore();
}
