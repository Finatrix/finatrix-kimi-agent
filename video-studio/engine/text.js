// Kinetic typography. Markup: *serif italic accent*, _accent colour_, ~muted~, | line break.
import { W, C, clamp, lerp, ease, luminance, readableOnPaper, auditText } from './core.js';

const SERIF = '"Instrument Serif"';

export function parse(markup) {
  const tokens = [];
  let style = 'sans';
  const re = /(\*|_|~|\||\s+|[^*_~|\s]+)/g;
  let m;
  let pendingBreak = false;
  while ((m = re.exec(markup))) {
    const s = m[0];
    if (s === '*') style = style === 'serif' ? 'sans' : 'serif';
    else if (s === '_') style = style === 'accent' ? 'sans' : 'accent';
    else if (s === '~') style = style === 'muted' ? 'sans' : 'muted';
    else if (s === '|') pendingBreak = true;
    else if (/^\s+$/.test(s)) continue;
    else {
      tokens.push({ text: s, style, br: pendingBreak });
      pendingBreak = false;
    }
  }
  return tokens;
}

function fontFor(style, size, weight) {
  if (style === 'serif') return { font: `italic 400 ${size * 1.2}px ${SERIF}`, ls: -0.005 * size };
  return { font: `${weight} ${size}px Geist`, ls: -0.04 * size };
}

/** Lay out markup into positioned words. Cached per (markup,size,maxW). */
const cache = new Map();
export function layout(ctx, markup, { size = 96, weight = 800, maxW = W - 160, lineH = 1.08, align = 'center' } = {}) {
  const key = [markup, size, weight, maxW, lineH, align].join('§');
  if (cache.has(key)) return cache.get(key);
  const toks = parse(markup);
  const space = size * 0.27;
  const lines = [[]];
  let lw = 0;
  for (const tk of toks) {
    const f = fontFor(tk.style, size, weight);
    ctx.font = f.font;
    ctx.letterSpacing = `${f.ls}px`;
    const w = ctx.measureText(tk.text).width;
    const cur = lines[lines.length - 1];
    if (tk.br || (cur.length && lw + space + w > maxW)) {
      lines.push([]);
      lw = 0;
    }
    const line = lines[lines.length - 1];
    line.push({ ...tk, w, f });
    lw += (line.length > 1 ? space : 0) + w;
  }
  const out = [];
  let i = 0;
  lines.forEach((line, li) => {
    const total = line.reduce((a, b) => a + b.w, 0) + space * (line.length - 1);
    let x = align === 'center' ? -total / 2 : align === 'right' ? -total : 0;
    for (const wd of line) {
      out.push({ ...wd, x, y: li * size * lineH, line: li, i: i++ });
      x += wd.w + space;
    }
  });
  const res = { words: out, lines: lines.length, height: lines.length * size * lineH, size, width: Math.max(...lines.map((l) => l.reduce((a, b) => a + b.w, 0) + space * (l.length - 1))) };
  cache.set(key, res);
  return res;
}

/**
 * Draw kinetic text. Words appear from t0 with `stagger` seconds between them
 * (or spread across `span`), and leave from `out` if given.
 * anim: 'pop' (scale+rise), 'rise' (masked slide-up per line), 'fade'.
 */
export function kinetic(ctx, markup, x, y, t, o = {}) {
  let { accent = '#FF6A13' } = o;
  const {
    size = 96, weight = 800, color = C.ink, muted = C.mute, t0 = 0, stagger = null, span = null,
    anim = 'pop', out = null, maxW = W - 160, align = 'center', lineH = 1.08, dur = 0.42, alpha = 1, shadow = null, valign = 'top',
  } = o;
  // Dark body text means a light background: keep accent words legible on it.
  if (color[0] === '#' && luminance(color) < 0.2 && accent[0] === '#' && luminance(accent) < 0.75) accent = readableOnPaper(accent);
  const L = layout(ctx, markup, { size, weight, maxW, lineH, align });
  const n = L.words.length;
  const st = stagger ?? (span ? span / Math.max(1, n) : 0.09);
  const yy = valign === 'middle' ? y - L.height / 2 + size * 0.8 : valign === 'bottom' ? y - L.height + size * 0.8 : y;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  for (const wd of L.words) {
    const ta = t - (t0 + wd.i * st);
    if (ta < 0) continue;
    let p = clamp(ta / dur);
    let a = 1;
    let sc = 1;
    let dy = 0;
    let rot = 0;
    if (anim === 'pop') {
      sc = lerp(0.45, 1, ease.outBack(p, 2.2));
      dy = (1 - ease.outCubic(p)) * size * 0.35;
      a = ease.outCubic(clamp(p * 2));
      rot = (1 - ease.outCubic(p)) * (wd.i % 2 ? 0.06 : -0.06);
    } else if (anim === 'rise') {
      dy = (1 - ease.outQuint(p)) * size * 1.1;
      a = 1;
    } else {
      a = ease.outCubic(p);
      dy = (1 - ease.outCubic(p)) * size * 0.15;
    }
    if (out != null && t > out) {
      // fast exit: fully gone ~0.28 s after `out`, so the next line never lands on it
      const q = ease.inCubic(clamp((t - out - wd.i * 0.008) / 0.2));
      a *= 1 - q;
      dy -= q * size * 0.5;
    }
    if (a <= 0.001) continue;
    ctx.save();
    ctx.globalAlpha = alpha * a;
    ctx.font = wd.f.font;
    ctx.letterSpacing = `${wd.f.ls}px`;
    ctx.fillStyle = wd.style === 'serif' || wd.style === 'accent' ? accent : wd.style === 'muted' ? muted : color;
    const wx = x + wd.x;
    const wy = yy + wd.y;
    if (anim === 'rise') {
      ctx.beginPath();
      ctx.rect(wx - 20, wy - size * 1.05, wd.w + 40, size * 1.4);
      ctx.clip();
    }
    ctx.translate(wx + wd.w / 2, wy + dy);
    ctx.rotate(rot);
    ctx.scale(sc, sc);
    if (shadow) {
      ctx.fillStyle = shadow;
      ctx.fillText(wd.text, -wd.w / 2, size * 0.04);
      ctx.fillStyle = wd.style === 'serif' || wd.style === 'accent' ? accent : wd.style === 'muted' ? muted : color;
    }
    ctx.fillText(wd.text, -wd.w / 2, 0);
    if (p >= 1) auditText(ctx, wd.text, -wd.w / 2, -size * (wd.style === 'serif' ? 0.78 : 0.74), wd.w / 2, size * 0.2);
    ctx.restore();
  }
  ctx.restore();
  return L;
}

/** Plain single-line text helper. */
export function label(ctx, str, x, y, { size = 32, weight = 600, color = C.ink, align = 'center', font = 'Geist', alpha = 1, ls = -0.01, baseline = 'middle', italic = false } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`;
  ctx.letterSpacing = `${ls * size}px`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(str, x, y);
  const w = ctx.measureText(str).width;
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  const top = baseline === 'middle' ? y - size * 0.38 : baseline === 'top' ? y + size * 0.1 : y - size * 0.74;
  auditText(ctx, str, x0, top, x0 + w, top + size * 0.76);
  ctx.restore();
  return w;
}

export const serif = (size) => `italic 400 ${size}px ${SERIF}`;

/** Typewriter: returns the visible prefix of `str` at time t. */
export function typed(str, t, t0, cps = 22) {
  const n = Math.floor(clamp((t - t0) * cps, 0, str.length));
  return str.slice(0, n);
}
