// Drawing primitives: glossy spheres, critters, melt, shards, particles, cards.
import { W, H, C, clamp, lerp, ease, rng, mix, lighten, darken, rgba, noise1, prog, auditText, auditRect } from './core.js';

export function rr(ctx, x, y, w, h, r) {
  auditRect(ctx, x, y, w, h);
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Cheap soft shadow: stacked translucent rounded rects (no shadowBlur — it is slow in software raster). */
export function softShadow(ctx, x, y, w, h, r, { spread = 40, alpha = 0.16, dy = 26, color = '#1a1430', steps = 7 } = {}) {
  ctx.save();
  for (let i = steps; i >= 1; i--) {
    const s = (spread * i) / steps;
    ctx.fillStyle = rgba(color, (alpha / steps) * 1.6 * (1 - i / (steps + 1)));
    rr(ctx, x - s / 2, y - s / 2 + dy * (0.4 + (0.6 * i) / steps), w + s, h + s, r + s / 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Elliptical contact shadow under an object resting/floating above `y`. */
export function floorShadow(ctx, x, y, rx, ry, alpha = 0.22) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(20,16,40,${alpha})`);
  g.addColorStop(0.55, `rgba(20,16,40,${alpha * 0.45})`);
  g.addColorStop(1, 'rgba(20,16,40,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Body gradient for a glossy sphere centred at (x,y) radius r. */
export function sphereFill(ctx, x, y, r, base) {
  const g = ctx.createRadialGradient(x - r * 0.38, y - r * 0.46, r * 0.04, x - r * 0.08, y - r * 0.08, r * 1.12);
  g.addColorStop(0, lighten(base, 0.62));
  g.addColorStop(0.22, lighten(base, 0.22));
  g.addColorStop(0.62, base);
  g.addColorStop(1, darken(base, 0.32));
  return g;
}

/** Specular highlight + bounce light, drawn over any sphere-ish body. */
export function sphereGloss(ctx, x, y, r, base, k = 1) {
  ctx.save();
  // bounce light from the floor
  const b = ctx.createRadialGradient(x + r * 0.15, y + r * 0.95, 0, x, y + r * 0.55, r * 0.95);
  b.addColorStop(0, rgba(lighten(base, 0.45), 0.42 * k));
  b.addColorStop(1, rgba(base, 0));
  ctx.fillStyle = b;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.985, 0, Math.PI * 2);
  ctx.fill();
  // main specular
  ctx.translate(x - r * 0.36, y - r * 0.5);
  ctx.rotate(-0.55);
  const s = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.34);
  s.addColorStop(0, `rgba(255,255,255,${0.9 * k})`);
  s.addColorStop(0.45, `rgba(255,255,255,${0.35 * k})`);
  s.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.scale(1, 0.58);
  ctx.fillStyle = s;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // tiny sparkle
  ctx.fillStyle = `rgba(255,255,255,${0.85 * k})`;
  ctx.beginPath();
  ctx.arc(x - r * 0.18, y - r * 0.66, r * 0.045, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Glossy 3D sphere. `sx`/`sy` squash around the sphere's bottom contact point.
 */
export function sphere(ctx, x, y, r, base, { sx = 1, sy = 1, shadow = true, shadowY = null, gloss = 1, alpha = 1 } = {}) {
  if (r <= 0.5) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (shadow) {
    const fy = shadowY ?? y + r * sy * 1.02;
    const lift = shadowY != null ? clamp(1 - (shadowY - (y + r)) / (r * 3), 0.25, 1) : 1;
    floorShadow(ctx, x, fy, r * 0.92 * sx * (0.6 + 0.4 * lift), r * 0.16, 0.26 * lift);
  }
  ctx.translate(x, y + r);
  ctx.scale(sx, sy);
  ctx.translate(-x, -y - r);
  ctx.fillStyle = sphereFill(ctx, x, y, r, base);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  sphereGloss(ctx, x, y, r, base, gloss);
  ctx.restore();
}

/** Text embossed onto a sphere: dark ink with a light lower edge, like a pressed coin. */
export function embossText(ctx, str, x, y, size, { color = 'rgba(20,10,0,0.78)', font = 'Geist', weight = 800, max = Infinity } = {}) {
  ctx.save();
  let s = size;
  ctx.font = `${weight} ${s}px ${font}`;
  ctx.letterSpacing = `${-0.03 * s}px`;
  let w = ctx.measureText(str).width;
  if (w > max) {
    s = (s * max) / w;
    ctx.font = `${weight} ${s}px ${font}`;
    ctx.letterSpacing = `${-0.03 * s}px`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText(str, x, y + s * 0.045);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  const em = ctx.measureText(str);
  auditText(ctx, str, x - em.width / 2, y - s * 0.38, x + em.width / 2, y + s * 0.38);
  ctx.restore();
}

/**
 * A character: glossy body + eyes + mouth. Expressions are data, so a scene can
 * animate them: o.look (dx,dy in -1..1), o.blink 0..1, o.mouth {type, open}.
 */
export function critter(ctx, x, y, r, base, o = {}) {
  const { look = [0, 0], blink = 0, mouth = { type: 'smile', open: 0 }, sx = 1, sy = 1, tilt = 0, shadow = true, shadowY = null, brow = 0, eyeScale = 1, accessory = null } = o;
  ctx.save();
  if (shadow) floorShadow(ctx, x, shadowY ?? y + r * sy * 1.02, r * 0.9 * sx, r * 0.15, 0.24);
  ctx.translate(x, y + r);
  ctx.rotate(tilt);
  ctx.scale(sx, sy);
  ctx.translate(0, -r);
  if (accessory && accessory.behind) accessory.draw(ctx, r);
  ctx.fillStyle = sphereFill(ctx, 0, 0, r, base);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  sphereGloss(ctx, 0, 0, r, base, 0.8);
  // eyes
  const er = r * 0.2 * eyeScale;
  for (const side of [-1, 1]) {
    const ex = side * r * 0.3 + look[0] * r * 0.06;
    const ey = -r * 0.16 + look[1] * r * 0.05;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.scale(1, Math.max(0.08, 1 - blink));
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(0, 0, er, er * 1.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = r * 0.015;
    ctx.stroke();
    ctx.fillStyle = '#0B0B10';
    const px = look[0] * er * 0.42;
    const py = look[1] * er * 0.42;
    ctx.beginPath();
    ctx.arc(px, py, er * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(px - er * 0.2, py - er * 0.22, er * 0.17, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (brow) {
      ctx.save();
      ctx.strokeStyle = darken(base, 0.55);
      ctx.lineCap = 'round';
      ctx.lineWidth = r * 0.07;
      ctx.beginPath();
      ctx.moveTo(ex - er * 0.9, ey - er * 1.45 - side * brow * er * 0.5);
      ctx.lineTo(ex + er * 0.9, ey - er * 1.45 + side * brow * er * 0.5);
      ctx.stroke();
      ctx.restore();
    }
  }
  drawMouth(ctx, r, base, mouth);
  if (accessory && !accessory.behind) accessory.draw(ctx, r);
  ctx.restore();
}

function drawMouth(ctx, r, base, m) {
  const my = r * 0.36;
  ctx.save();
  ctx.lineCap = 'round';
  const dark = darken(base, 0.62);
  switch (m.type) {
    case 'chomp': {
      const open = clamp(m.open ?? 0);
      const mw = r * 0.62;
      const mh = r * (0.06 + 0.5 * open);
      ctx.fillStyle = '#3B0A12';
      ctx.beginPath();
      ctx.ellipse(0, my, mw / 2, mh / 2 + r * 0.02, 0, 0, Math.PI * 2);
      ctx.fill();
      if (open > 0.15) {
        ctx.fillStyle = '#FF7A8A';
        ctx.beginPath();
        ctx.ellipse(0, my + mh * 0.28, mw * 0.26, mh * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        for (let i = -2; i <= 2; i++) {
          const tx = (i * mw) / 6.2;
          ctx.beginPath();
          ctx.moveTo(tx - r * 0.045, my - mh / 2 + r * 0.01);
          ctx.lineTo(tx + r * 0.045, my - mh / 2 + r * 0.01);
          ctx.lineTo(tx, my - mh / 2 + r * 0.1 * open);
          ctx.fill();
        }
      }
      break;
    }
    case 'o': {
      const o = m.open ?? 0.6;
      ctx.fillStyle = '#2A0810';
      ctx.beginPath();
      ctx.ellipse(0, my, r * (0.1 + 0.06 * o), r * (0.08 + 0.12 * o), 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'sad':
    case 'smile':
    case 'flat': {
      ctx.strokeStyle = dark;
      ctx.lineWidth = r * 0.065;
      ctx.beginPath();
      const k = m.type === 'smile' ? 1 : m.type === 'sad' ? -1 : 0;
      ctx.moveTo(-r * 0.2, my);
      ctx.quadraticCurveTo(0, my + k * r * 0.18, r * 0.2, my);
      ctx.stroke();
      break;
    }
    case 'grin': {
      ctx.fillStyle = '#2A0810';
      ctx.beginPath();
      ctx.moveTo(-r * 0.26, my - r * 0.04);
      ctx.quadraticCurveTo(0, my + r * 0.34, r * 0.26, my - r * 0.04);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-r * 0.2, my - r * 0.04, r * 0.4, r * 0.06);
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

/**
 * A blob that melts: floats at (x,y), loses mass into drips that fall into a
 * puddle on `floorY`. p = 0 solid … 1 mostly melted.
 */
export function meltBlob(ctx, x, y, r, base, p, floorY, seed = 'melt', label = null, labelSize = 0) {
  const R = rng(seed);
  const pe = ease.inOutCubic(clamp(p));
  const rr0 = r * (1 - 0.2 * pe);
  const sy = 1 - 0.1 * pe;
  const sx = 1 + 0.06 * pe;
  const by = y + r * 0.15 * pe;
  // puddle
  const pw = r * (0.2 + 1.5 * pe);
  if (pe > 0.02) {
    ctx.save();
    const pg = ctx.createLinearGradient(x, floorY - 20, x, floorY + 30);
    pg.addColorStop(0, lighten(base, 0.18));
    pg.addColorStop(1, darken(base, 0.18));
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.ellipse(x, floorY, pw, pw * 0.12 + 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(x - pw * 0.25, floorY - pw * 0.04, pw * 0.35, pw * 0.025 + 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // drips (drawn under the body so they emerge from it)
  const n = 6;
  const drips = [];
  for (let i = 0; i < n; i++) {
    drips.push({ dx: (R() - 0.5) * 1.3, w: 0.1 + R() * 0.1, len: 0.5 + R() * 0.9, delay: R() * 0.35 });
  }
  ctx.save();
  for (const d of drips) {
    const dp = ease.inOutQuad(clamp((pe - d.delay) / (1 - d.delay)));
    if (dp <= 0) continue;
    const dx = x + d.dx * rr0 * 0.8;
    const top = by + Math.sqrt(Math.max(0, 1 - d.dx * d.dx * 0.6)) * rr0 * 0.55;
    const len = d.len * r * 1.4 * dp;
    const bottom = Math.min(floorY, top + len);
    const w = d.w * r;
    const g = ctx.createLinearGradient(dx - w, 0, dx + w, 0);
    g.addColorStop(0, darken(base, 0.18));
    g.addColorStop(0.4, lighten(base, 0.12));
    g.addColorStop(1, darken(base, 0.22));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(dx - w, top);
    ctx.lineTo(dx - w * 0.75, bottom - w * 0.6);
    ctx.arc(dx, bottom - w * 0.6, w * 0.82, Math.PI, 0, true);
    ctx.lineTo(dx + w, top);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(dx - w * 0.45, top, w * 0.18, Math.max(0, bottom - top - w));
  }
  ctx.restore();
  sphere(ctx, x, by, rr0, base, { sx, sy, shadow: false });
  if (label) embossText(ctx, label, x, by + rr0 * (1 - sy) * 0.5, labelSize || rr0 * 0.42, { max: rr0 * 1.55 });
}

/** Drifting glossy bubbles in the background (like the reference). */
export function bubbles(ctx, t, { seed = 'b', count = 10, color = '#FF7A1A', alpha = 1, area = [0, 0, W, H], minR = 10, maxR = 34, speed = 1 } = {}) {
  const R = rng(seed);
  for (let i = 0; i < count; i++) {
    const bx = area[0] + R() * area[2];
    const by = area[1] + R() * area[3];
    const r = minR + R() * (maxR - minR);
    const ph = R() * 10;
    const sp = (0.3 + R() * 0.7) * speed;
    const x = bx + noise1(t * 0.35 * sp + ph, i) * 40;
    const y = by + noise1(t * 0.3 * sp + ph + 3, i + 9) * 50 - t * 8 * sp;
    sphere(ctx, x, y, r, color, { shadow: false, alpha: alpha * (0.75 + 0.25 * R()) });
  }
}

/** Radial burst of particles (confetti / sparks / crumbs). t is time since burst. */
export function burst(ctx, t, x, y, { seed = 'p', n = 26, colors = ['#fff'], speed = 900, gravity = 1800, size = 10, life = 1.0, shape = 'circle', spread = Math.PI * 2, dir = -Math.PI / 2, drag = 1.6 } = {}) {
  if (t < 0 || t > life) return;
  const R = rng(seed);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const a = dir + (R() - 0.5) * spread;
    const v = speed * (0.35 + R() * 0.75);
    const k = (1 - Math.exp(-drag * t)) / drag;
    const px = x + Math.cos(a) * v * k;
    const py = y + Math.sin(a) * v * k + 0.5 * gravity * t * t;
    const s = size * (0.5 + R()) * (1 - t / life);
    const rot = (R() - 0.5) * 12 * t;
    ctx.fillStyle = colors[i % colors.length];
    ctx.globalAlpha = clamp(1.4 - t / life);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    if (shape === 'rect') ctx.fillRect(-s, -s * 0.45, s * 2, s * 0.9);
    else if (shape === 'spark') {
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.6);
      ctx.lineTo(s * 0.35, 0);
      ctx.lineTo(0, s * 1.6);
      ctx.lineTo(-s * 0.35, 0);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

/** Expanding ring, e.g. on impact or click. */
export function ring(ctx, t, x, y, { r0 = 20, r1 = 260, life = 0.6, color = '#fff', width = 8 } = {}) {
  if (t < 0 || t > life) return;
  const p = ease.outCubic(t / life);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 1 - p;
  ctx.lineWidth = width * (1 - p) + 1;
  ctx.beginPath();
  ctx.arc(x, y, lerp(r0, r1, p), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Precomputed shard set for shattering a rectangle (jittered triangle grid). */
export function makeShards(seed, x, y, w, h, cols = 5, rows = 7, impact = null) {
  const R = rng(seed);
  const pts = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const edge = i === 0 || j === 0 || i === cols || j === rows;
      pts.push([x + (i / cols) * w + (edge ? 0 : (R() - 0.5) * (w / cols) * 0.7), y + (j / rows) * h + (edge ? 0 : (R() - 0.5) * (h / rows) * 0.7)]);
    }
  }
  const ix = impact ? impact[0] : x + w / 2;
  const iy = impact ? impact[1] : y + h / 2;
  const shards = [];
  const P = (i, j) => pts[j * (cols + 1) + i];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const tris = R() > 0.5 ? [[P(i, j), P(i + 1, j), P(i + 1, j + 1)], [P(i, j), P(i + 1, j + 1), P(i, j + 1)]] : [[P(i, j), P(i + 1, j), P(i, j + 1)], [P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)]];
      for (const tri of tris) {
        const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
        const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
        const dx = cx - ix;
        const dy = cy - iy;
        const d = Math.hypot(dx, dy) + 1;
        const sp = 700 + R() * 1300;
        shards.push({ tri, cx, cy, vx: (dx / d) * sp + (R() - 0.5) * 300, vy: (dy / d) * sp - 300 - R() * 500, av: (R() - 0.5) * 9, vz: R() * 0.8 });
      }
    }
  }
  return shards;
}

/** Draw shards flying apart `t` seconds after impact, sampling from `img` (a canvas). */
export function drawShards(ctx, img, shards, t, { gravity = 2400, ox = 0, oy = 0 } = {}) {
  for (const s of shards) {
    const px = s.vx * t;
    const py = s.vy * t + 0.5 * gravity * t * t;
    const rot = s.av * t;
    const sc = 1 + s.vz * t;
    const [a, b, c] = s.tri;
    const minx = Math.min(a[0], b[0], c[0]);
    const miny = Math.min(a[1], b[1], c[1]);
    const maxx = Math.max(a[0], b[0], c[0]);
    const maxy = Math.max(a[1], b[1], c[1]);
    ctx.save();
    ctx.translate(s.cx + px, s.cy + py);
    ctx.rotate(rot);
    ctx.scale(sc, sc);
    ctx.translate(-s.cx, -s.cy);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(c[0], c[1]);
    ctx.closePath();
    ctx.save();
    ctx.clip();
    ctx.drawImage(img, minx - ox - 2, miny - oy - 2, maxx - minx + 4, maxy - miny + 4, minx - 2, miny - 2, maxx - minx + 4, maxy - miny + 4);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

/** Twinkling stars for night scenes. */
export function stars(ctx, t, { seed = 's', n = 70, area = [0, 0, W, H * 0.75], color = '#ffffff' } = {}) {
  const R = rng(seed);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const x = area[0] + R() * area[2];
    const y = area[1] + R() * area[3];
    const s = 1 + R() * 2.6;
    const tw = 0.45 + 0.55 * Math.sin(t * (1 + R() * 3) + R() * 10);
    ctx.globalAlpha = clamp(tw);
    ctx.fillStyle = color;
    if (s > 3) {
      // four-point sparkle
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        ctx.rotate(Math.PI / 2);
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(s * 0.4, s * 0.4, 0, s * 3.2);
        ctx.quadraticCurveTo(-s * 0.4, s * 0.4, 0, 0);
      }
      ctx.fill();
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Full-frame background fills. */
export function bgPaper(ctx, tint = null) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#F7F6F2');
  g.addColorStop(1, '#ECEAE4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (tint) {
    const r = ctx.createRadialGradient(W * 0.5, H * 0.38, 0, W * 0.5, H * 0.38, H * 0.7);
    r.addColorStop(0, rgba(tint, 0.08));
    r.addColorStop(1, rgba(tint, 0));
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, W, H);
  }
}
export function bgAccent(ctx, accent) {
  const g = ctx.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.45, H * 0.85);
  g.addColorStop(0, lighten(accent, 0.12));
  g.addColorStop(0.6, accent);
  g.addColorStop(1, darken(accent, 0.22));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
export function bgNight(ctx, glow = '#5B4BFF') {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#05050B');
  g.addColorStop(0.65, '#0D0B22');
  g.addColorStop(1, '#1A1440');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const r = ctx.createRadialGradient(W * 0.5, H * 0.95, 0, W * 0.5, H * 0.95, H * 0.6);
  r.addColorStop(0, rgba(glow, 0.28));
  r.addColorStop(1, rgba(glow, 0));
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, W, H);
}

let _vig = null;
let _grain = null;
/** Vignette + film grain, applied over every frame. */
export function finish(ctx, frame, { vignette = 0.16, grain = 0.045 } = {}) {
  if (!_vig) {
    _vig = new OffscreenCanvas(W, H);
    const v = _vig.getContext('2d');
    const g = v.createRadialGradient(W / 2, H * 0.48, H * 0.25, W / 2, H * 0.5, H * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    v.fillStyle = g;
    v.fillRect(0, 0, W, H);
    _grain = [];
    const R = rng('grain');
    for (let k = 0; k < 4; k++) {
      const c = new OffscreenCanvas(270, 480);
      const gx = c.getContext('2d');
      const im = gx.createImageData(270, 480);
      for (let i = 0; i < im.data.length; i += 4) {
        const n = R() * 255;
        im.data[i] = im.data[i + 1] = im.data[i + 2] = n;
        im.data[i + 3] = 255;
      }
      gx.putImageData(im, 0, 0);
      _grain.push(c);
    }
  }
  ctx.save();
  ctx.globalAlpha = vignette;
  ctx.drawImage(_vig, 0, 0);
  ctx.globalAlpha = grain;
  ctx.globalCompositeOperation = 'overlay';
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(_grain[frame % 4], 0, 0, W, H);
  ctx.restore();
}

/** Rubber stamp that slams in. p is time since slam start. */
export function stamp(ctx, t, x, y, text, { color = C.loss, size = 64, rot = -0.14, life = 99 } = {}) {
  if (t < 0 || t > life) return;
  const p = ease.outQuart(clamp(t / 0.22));
  const sc = lerp(2.6, 1, p);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(sc, sc);
  ctx.globalAlpha = clamp(t / 0.08) * 0.92;
  ctx.font = `900 ${size}px Geist`;
  ctx.letterSpacing = `${size * 0.04}px`;
  const w = ctx.measureText(text).width + size * 0.9;
  const h = size * 1.45;
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.09;
  rr(ctx, -w / 2, -h / 2, w, h, size * 0.22);
  ctx.stroke();
  ctx.lineWidth = size * 0.035;
  rr(ctx, -w / 2 + size * 0.14, -h / 2 + size * 0.14, w - size * 0.28, h - size * 0.28, size * 0.14);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, size * 0.04);
  // worn ink texture
  ctx.globalCompositeOperation = 'destination-out';
  const R = rng('stamp' + text);
  for (let i = 0; i < 40; i++) {
    ctx.globalAlpha = 0.25 + R() * 0.4;
    ctx.beginPath();
    ctx.arc((R() - 0.5) * w, (R() - 0.5) * h, 1 + R() * size * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A pill with text, e.g. labels under critters or deltas. */
export function pill(ctx, x, y, text, { bg = '#fff', fg = C.ink, size = 30, weight = 700, padX = 0.7, alpha = 1, align = 'center', font = 'Geist', border = null, shadow = true } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.letterSpacing = `${-0.01 * size}px`;
  const w = ctx.measureText(text).width + size * padX * 2;
  const h = size * 1.75;
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  if (shadow) softShadow(ctx, x0, y - h / 2, w, h, h / 2, { spread: 16, alpha: 0.1, dy: 8, steps: 4 });
  ctx.fillStyle = bg;
  rr(ctx, x0, y - h / 2, w, h, h / 2);
  ctx.fill();
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x0 + w / 2, y + size * 0.04);
  ctx.restore();
  return w;
}

/** Number drawn with fixed-width digit cells, so counters never jitter. */
export function tabular(ctx, str, x, y, size, { weight = 800, color = C.ink, align = 'center', font = 'Geist', baseline = 'middle' } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.letterSpacing = '0px';
  ctx.textBaseline = baseline;
  ctx.fillStyle = color;
  const cell = ctx.measureText('0').width * 0.98;
  const widths = [...str].map((ch) => (/[0-9]/.test(ch) ? cell : ctx.measureText(ch).width * 0.96));
  const total = widths.reduce((a, b) => a + b, 0);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  ctx.textAlign = 'center';
  const left = cx;
  [...str].forEach((ch, i) => {
    ctx.fillText(ch, cx + widths[i] / 2, y);
    cx += widths[i];
  });
  const top = baseline === 'middle' ? y - size * 0.38 : baseline === 'alphabetic' ? y - size * 0.72 : y;
  auditText(ctx, str, left, top, left + total, top + size * 0.76);
  ctx.restore();
  return total;
}

/** Mask-wipe helper: run `fn` clipped to a horizontal reveal of width p. */
export function wipe(ctx, x, y, w, h, p, fn) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w * clamp(p), h);
  ctx.clip();
  fn();
  ctx.restore();
}

export { prog };
