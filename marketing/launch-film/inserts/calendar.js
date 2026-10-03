// Calendar insert — "the month goes like that".
//
// A paper month calendar on a plaster wall. Window light sweeps across it once
// per day, faster and faster, while a red marker crosses the days off; the
// time-lapse settles on the day that matters, circled by hand.
//
//   ?month=sep   September: days 1–29 crossed, the 30th — payday — circled green
//   ?month=oct   October:   days 1–9 crossed, the 10th — money gone — circled red
//
// Dates and amounts are drawn, not generated: AI video can't be trusted to
// render a legible calendar. Every frame is a pure function of t.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { range, lerp, smooth, easeInOut, mulberry32, handheld, clamp01 } from '../shared/motion.js';
import { filmFinish } from '../shared/film.js';

const MONTHS = {
  sep: { name: 'SEPTEMBER', year: 2026, index: 8, crossThrough: 29, circle: { day: 30, color: '#1e9a54' }, daysEnd: 4.9, duration: 6.3, lean: 0.55 },
  oct: { name: 'OCTOBER', year: 2026, index: 9, crossThrough: 9, circle: { day: 10, color: '#c62828' }, daysEnd: 2.6, duration: 4.3, lean: 0.3 },
};
const M = MONTHS[new URLSearchParams(location.search).get('month')] ?? MONTHS.sep;
const FPS = 30;

// Days elapse faster and faster: D(t) = n·(t/end)^1.6. Day i is crossed off as D passes it.
const ACCEL = 1.6;
const daysAt = (t) => M.crossThrough * Math.pow(clamp01(t / M.daysEnd), ACCEL);
const crossAt = (day) => M.daysEnd * Math.pow((day - 0.15) / M.crossThrough, 1 / ACCEL);
const CROSS_TIMES = Array.from({ length: M.crossThrough }, (_, i) => crossAt(i + 1));
const CIRCLE_AT = M.daysEnd + 0.35;

// ─── Renderer ────────────────────────────────────────────────────────────────

const W = window.innerWidth, H = window.innerHeight;
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('stage'), antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0a09);
const camera = new THREE.PerspectiveCamera(30, W / H, 0.05, 100);

// ─── The wall ────────────────────────────────────────────────────────────────

function plasterTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#cfc6b6';
  g.fillRect(0, 0, 1024, 1024);
  const rand = mulberry32(3);
  for (let i = 0; i < 260; i++) { // soft blotches: an old, repainted wall
    const x = rand() * 1024, y = rand() * 1024, r = 30 + rand() * 160;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const tone = rand() < 0.5 ? '255,250,240' : '120,110,95';
    grad.addColorStop(0, `rgba(${tone},${0.035 + rand() * 0.04})`);
    grad.addColorStop(1, `rgba(${tone},0)`);
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  const img = g.getImageData(0, 0, 1024, 1024);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * 22;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  return tex;
}
const plaster = plasterTexture();
const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), new THREE.MeshStandardMaterial({ map: plaster, bumpMap: plaster, bumpScale: 0.6, roughness: 0.96 }));
wall.receiveShadow = true;
scene.add(wall);

// ─── The calendar page ───────────────────────────────────────────────────────

const PAGE_W = 3.0, PAGE_H = 1.9;
const TEX_W = 2400, TEX_H = 1520;
const GRID = { x0: 90, y0: 345, w: 2220, rows: 5, bottom: TEX_H - 80 };
const CELL_W = GRID.w / 7, CELL_H = (GRID.bottom - GRID.y0) / GRID.rows;
const firstWeekday = (new Date(M.year, M.index, 1).getDay() + 6) % 7; // Monday-first
const daysInMonth = new Date(M.year, M.index + 1, 0).getDate();
const cellOf = (day) => {
  const k = firstWeekday + day - 1;
  return { x: GRID.x0 + (k % 7) * CELL_W, y: GRID.y0 + Math.floor(k / 7) * CELL_H };
};

await document.fonts.load('700 70px Inter');
await document.fonts.load('500 90px Inter');

const base = document.createElement('canvas');
base.width = TEX_W; base.height = TEX_H;
{
  const g = base.getContext('2d');
  g.fillStyle = '#f3efe6';
  g.fillRect(0, 0, TEX_W, TEX_H);
  const rand = mulberry32(11);
  for (let i = 0; i < 9000; i++) { // paper fibre
    g.fillStyle = `rgba(90,80,60,${rand() * 0.05})`;
    g.fillRect(rand() * TEX_W, rand() * TEX_H, 1 + rand() * 2, 1);
  }
  g.fillStyle = '#1d1d1d';
  g.font = '700 124px Inter';
  g.textBaseline = 'alphabetic';
  g.fillText(M.name, 90, 195);
  g.fillStyle = '#8a8378';
  g.font = '500 92px Inter';
  g.textAlign = 'right';
  g.fillText(String(M.year), 2310, 195);
  g.textAlign = 'left';
  g.fillStyle = '#b23a32';
  g.fillRect(90, 228, 2220, 6);
  g.font = '700 36px Inter';
  ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].forEach((d, i) => {
    g.fillStyle = i === 6 ? '#b23a32' : '#6d675d';
    g.textAlign = 'center';
    g.fillText(d, GRID.x0 + (i + 0.5) * CELL_W, 305);
  });
  g.textAlign = 'left';
  g.strokeStyle = '#cbc4b6';
  g.lineWidth = 3;
  for (let r = 0; r <= GRID.rows; r++) { g.beginPath(); g.moveTo(GRID.x0, GRID.y0 + r * CELL_H); g.lineTo(GRID.x0 + GRID.w, GRID.y0 + r * CELL_H); g.stroke(); }
  for (let c = 0; c <= 7; c++) { g.beginPath(); g.moveTo(GRID.x0 + c * CELL_W, GRID.y0); g.lineTo(GRID.x0 + c * CELL_W, GRID.bottom); g.stroke(); }
  g.font = '700 70px Inter';
  for (let d = 1; d <= daysInMonth; d++) {
    const { x, y } = cellOf(d);
    const sunday = (firstWeekday + d - 1) % 7 === 6;
    g.fillStyle = sunday ? '#b23a32' : '#262626';
    g.fillText(String(d), x + 26, y + 84);
  }
}

const pageCanvas = document.createElement('canvas');
pageCanvas.width = TEX_W; pageCanvas.height = TEX_H;
const pg = pageCanvas.getContext('2d');
const pageTex = new THREE.CanvasTexture(pageCanvas);
pageTex.colorSpace = THREE.SRGBColorSpace;
pageTex.anisotropy = 8;

const jitter = mulberry32(29);
const CROSS_SHAPES = CROSS_TIMES.map(() => Array.from({ length: 8 }, () => (jitter() - 0.5) * 2));

/** A felt-tip stroke from a to b, drawn up to fraction p, wobbling through a jittered midpoint. */
function markerStroke(ax, ay, bx, by, p, wob, color, width) {
  if (p <= 0) return;
  const mx = (ax + bx) / 2 + wob[0] * 14, my = (ay + by) / 2 + wob[1] * 14;
  const steps = 24;
  pg.strokeStyle = color;
  pg.lineCap = 'round';
  for (const [w, a, off] of [[width, 0.88, 0], [width * 0.6, 0.45, 2.5]]) {
    pg.globalAlpha = a;
    pg.lineWidth = w;
    pg.beginPath();
    for (let i = 0; i <= Math.ceil(steps * p); i++) {
      const s = Math.min(i / steps, p);
      const x = (1 - s) ** 2 * ax + 2 * (1 - s) * s * mx + s * s * bx + off;
      const y = (1 - s) ** 2 * ay + 2 * (1 - s) * s * my + s * s * by;
      if (i === 0) pg.moveTo(x, y); else pg.lineTo(x, y);
    }
    pg.stroke();
  }
  pg.globalAlpha = 1;
}

function drawPage(t) {
  pg.drawImage(base, 0, 0);
  CROSS_TIMES.forEach((at, i) => {
    const next = CROSS_TIMES[i + 1] ?? at + 0.3;
    const dur = Math.min(0.24, Math.max(0.07, (next - at) * 0.85));
    const p = range(t, at, at + dur);
    if (p <= 0) return;
    const { x, y } = cellOf(i + 1);
    const j = CROSS_SHAPES[i];
    const l = x + 64, r = x + CELL_W - 38, top = y + 56, bot = y + CELL_H - 34; // clear of the day number
    markerStroke(l + j[2] * 8, top + j[3] * 6, r + j[4] * 8, bot + j[5] * 6, clamp01(p * 2), j, 'rgb(186,28,30)', 15);
    markerStroke(r + j[6] * 8, top + j[7] * 6, l + j[2] * 8, bot + j[4] * 6, clamp01(p * 2 - 1), [j[1], j[0]], 'rgb(186,28,30)', 15);
  });
  const cp = smooth(range(t, CIRCLE_AT, CIRCLE_AT + 0.75));
  if (cp > 0) {
    const { x, y } = cellOf(M.circle.day);
    const cx = x + CELL_W / 2, cy = y + CELL_H / 2;
    const start = -2.3, sweep = Math.PI * 2 * 1.12 * cp; // a hand circle overshoots its own start
    pg.strokeStyle = M.circle.color;
    pg.lineCap = 'round';
    for (const [w, a] of [[15, 0.9], [9, 0.45]]) {
      pg.lineWidth = w;
      pg.globalAlpha = a;
      pg.beginPath();
      for (let i = 0; i <= 90; i++) {
        const th = start + (sweep * i) / 90;
        const r = 1 + 0.04 * Math.sin(3 * th + 0.7) + 0.05 * (th - start) / (Math.PI * 2);
        const px = cx + Math.cos(th) * CELL_W * 0.44 * r, py = cy + Math.sin(th) * CELL_H * 0.42 * r;
        if (i === 0) pg.moveTo(px, py); else pg.lineTo(px, py);
      }
      pg.stroke();
    }
    pg.globalAlpha = 1;
  }
  pageTex.needsUpdate = true;
}

// The page bows off the wall below its binding; two pages of the year behind it.
function pageGeometry(lift) {
  const g = new THREE.PlaneGeometry(PAGE_W, PAGE_H, 60, 40);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const fromTop = (PAGE_H / 2 - y) / PAGE_H;
    pos.setZ(i, 0.012 + lift * fromTop ** 1.6 + 0.012 * Math.sin(Math.PI * (x / PAGE_W + 0.5)) * fromTop);
  }
  g.computeVertexNormals();
  return g;
}
const calendar = new THREE.Group();
const page = new THREE.Mesh(pageGeometry(0.075), new THREE.MeshStandardMaterial({ map: pageTex, roughness: 0.88 }));
page.castShadow = true;
page.receiveShadow = true;
calendar.add(page);
[0.05, 0.03].forEach((lift, i) => {
  const under = new THREE.Mesh(pageGeometry(lift), new THREE.MeshStandardMaterial({ color: i ? 0xe2ddd1 : 0xebe6da, roughness: 0.9 }));
  under.position.set(0.006 * (i + 1), -0.008 * (i + 1), -0.004 * (i + 1));
  under.castShadow = true;
  calendar.add(under);
});
const wire = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.8, roughness: 0.35 });
for (let i = 0; i < 22; i++) { // twin-wire binding along the top
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 8, 20, Math.PI * 1.25), wire);
  ring.rotation.set(0, Math.PI / 2, Math.PI * 0.62);
  ring.position.set(-PAGE_W / 2 + 0.12 + i * ((PAGE_W - 0.24) / 21), PAGE_H / 2 - 0.005, 0.03);
  ring.castShadow = true;
  calendar.add(ring);
}
const nail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 12), wire);
nail.rotation.x = Math.PI / 2;
nail.position.set(0, PAGE_H / 2 + 0.09, 0.03);
nail.castShadow = true;
const hanger = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.004, 6, 40, Math.PI), wire);
hanger.position.set(0, PAGE_H / 2 + 0.0, 0.03);
hanger.castShadow = true;
calendar.add(nail, hanger);
scene.add(calendar);

// ─── Light: a window's worth of sun, once per day ───────────────────────────

function windowCookie() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 512, 512);
  g.filter = 'blur(6px)';
  g.fillStyle = '#fff';
  const pane = (x, y) => g.fillRect(x, y, 170, 170);
  pane(76, 76); pane(266, 76); pane(76, 266); pane(266, 266);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const sun = new THREE.SpotLight(0xfff2dc, 0, 0, 0.42, 0.55, 0);
sun.map = windowCookie();
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.radius = 4;
scene.add(sun, sun.target);
const lamp = new THREE.PointLight(0xffb066, 0, 0, 2);
lamp.position.set(3.2, -0.6, 3.0);
const fill = new THREE.HemisphereLight(0xb8c4d6, 0x2a231c, 0.35);
scene.add(lamp, fill);

const warm = new THREE.Color(0xffa860), noon = new THREE.Color(0xfff4e2);
function animateLight(t) {
  const D = daysAt(t);
  const rate = M.crossThrough * ACCEL / M.daysEnd * Math.pow(clamp01(t / M.daysEnd), ACCEL - 1);
  // Past ~3 days a second the cycle would strobe; let it blur into an even, flickering grey.
  const cycle = 1 - smooth(range(rate, 2.2, 5.5));
  const phase = D - Math.floor(D);
  const daylight = Math.max(0, Math.sin(Math.PI * Math.min(1, phase / 0.72)));
  const day = lerp(0.42, daylight, cycle);
  const settle = smooth(range(t, M.daysEnd - 0.2, CIRCLE_AT)); // the circled day: evening, lamp on
  const sx = lerp(-7, 7, lerp(phase, 0.85, 1 - cycle));
  sun.position.set(sx, 3.4, 6.5);
  sun.target.position.set(sx * 0.18, -0.1, 0);
  sun.color.copy(warm).lerp(noon, Math.sin(Math.PI * phase) * cycle + (1 - cycle) * 0.5);
  sun.intensity = 7.5 * day * (1 - 0.85 * settle);
  lamp.intensity = lerp(14 * (1 - day), 22, settle);
  fill.intensity = lerp(0.18, 0.42, day) * (1 - 0.35 * settle);
}

// ─── Camera, post, frame ─────────────────────────────────────────────────────

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }));
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new OutputPass());
const finish = filmFinish(W, H, { vignette: 0.45, grain: 0.04 });
composer.addPass(finish);

const circleCell = cellOf(M.circle.day);
const circleWorld = new THREE.Vector2(
  ((circleCell.x + CELL_W / 2) / TEX_W - 0.5) * PAGE_W,
  (0.5 - (circleCell.y + CELL_H / 2) / TEX_H) * PAGE_H,
);

function renderAt(t) {
  drawPage(t);
  animateLight(t);
  const push = easeInOut(range(t, 0, M.duration));
  const lean = smooth(range(t, M.daysEnd - 0.4, CIRCLE_AT + 0.9)); // drift toward the day that matters
  const hh = handheld(t, 1.4);
  const look = new THREE.Vector3(lerp(0, circleWorld.x * M.lean, lean) + hh.x, lerp(-0.08, circleWorld.y * M.lean, lean) + hh.y, 0);
  camera.position.set(look.x * 0.4 + lerp(0.0, 0.18, push), look.y * 0.3 - 0.05, lerp(5.4, 3.9, push) - 0.5 * lean);
  camera.lookAt(look);
  camera.rotateZ(hh.roll);
  finish.uniforms.frame.value = Math.round(t * FPS);
  composer.render();
}

window.__scene = { renderAt, duration: M.duration, fps: FPS, cues: { crosses: CROSS_TIMES, circle: CIRCLE_AT } };
renderAt(0);
window.__ready = true;
