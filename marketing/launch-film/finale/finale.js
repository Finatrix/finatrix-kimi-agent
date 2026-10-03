// The FinatriX launch film — Act II, "The Turn".
//
// One continuous camera move, rendered deterministically: every visible thing
// is a pure function of time `t`, so `render.mjs` can step frame by frame and
// the same frame always comes out the same. Cue times come from
// `timeline.json`, written by `audio/voiceover.py`, so picture lands on word.
//
// Story beats (seconds are this file's local time; see timeline.json):
//   doors     the screen closes into the logo's gold core, then opens
//   life      LIFE GETS HARD — "HARD" drops with weight
//   pillars   budget, expenses, investments, future plans, net worth: five of
//             the logo's own tiles, one per idea
//   converge  the tiles lift and fly home; the other three tools join them
//   logo      the mark assembles, the wordmark wipes on
//   dive      the camera flies through the white node into 8 / 1 / ∞
//   back      and pulls back out through it to the launch card

import * as THREE from 'three';
import { TTFLoader } from 'three/addons/loaders/TTFLoader.js';
import { Font } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp01, range, lerp, smooth, easeIn, easeOut, easeInOut, easeOutExpo, easeOutBack, pulse, mulberry32 } from '../shared/motion.js';
import { filmFinish } from '../shared/film.js';

// ─── Motion ──────────────────────────────────────────────────────────────────

/** A heavy object dropped onto a floor: falls, lands, settles with a small rebound. Returns height 1 → 0. */
function heavyDrop(u) {
  const contact = 0.42;
  if (u < contact) return 1 - (u / contact) ** 2;
  const s = u - contact;
  return 0.07 * Math.exp(-9 * s) * Math.abs(Math.sin(16 * s));
}

// ─── Assets ──────────────────────────────────────────────────────────────────

const timeline = await fetch('./timeline.json').then((r) => r.json());
const cue = (id) => timeline.cues[id].start;
const cueEnd = (id) => timeline.cues[id].end;

const fontFile = (weight, style = 'normal') => `../node_modules/@fontsource/kanit/files/kanit-latin-${weight}-${style}.woff`;
const loadFont = async (url) => new Font(await new TTFLoader().loadAsync(url));
const [heavy, regular, semibold] = await Promise.all([fontFile(800), fontFile(400), fontFile(600)].map(loadFont));
const lockup = await new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = '../../../public/images/finatrix-lockup.png';
});

// ─── Cue sheet ───────────────────────────────────────────────────────────────

const PILLAR_CUES = ['budget', 'expenses', 'investments', 'future', 'networth'];
const T = {
  life: cue('life'),
  hard: cue('life') + 0.62,
  manage: cue('manage'),
  pillars: PILLAR_CUES.map(cue),
  converge: cue('converge'),
  lift: cue('lift'),
  snap: cueEnd('logo') - 0.72, // the mark locks as "FinatriX" is said
  dive: cueEnd('logo') + 0.1,
  eight: cue('eight'),
  one: cue('one'),
  infinite: cue('infinite'),
  back: cueEnd('infinite') + 0.15,
  available: cue('available'),
  date: cue('date'),
  end: timeline.duration,
};
T.cross1 = T.dive + 0.62; // camera passes through the white node, in
T.cross2 = T.back + 0.5; //  …and back out
T.settle = T.cross2 + 1.3;

// ─── Renderer, scene, look ───────────────────────────────────────────────────

const W = window.innerWidth;
const H = window.innerHeight;
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
// Khronos PBR Neutral keeps base colours true — the brand tiles must read as the logo's own colours.
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x060606, 0.028);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.85;

const camera = new THREE.PerspectiveCamera(34, W / H, 0.03, 400);
scene.add(camera);

const key = new THREE.DirectionalLight(0xfff0d8, 1.15);
key.position.set(-6, 9, 10);
const rim = new THREE.DirectionalLight(0x9cc2ff, 0.8);
rim.position.set(9, 3, -9);
const sweep = new THREE.PointLight(0xffe3a6, 0, 9, 1.4);
scene.add(key, rim, sweep);

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(160, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x050505) }, mid: { value: new THREE.Color(0x17140f) }, low: { value: new THREE.Color(0x020202) } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top, mid, low; varying vec3 vDir;
      void main(){ float y = vDir.y; vec3 c = mix(mid, top, smoothstep(0.0, 0.55, y)); c = mix(c, low, smoothstep(0.0, -0.45, y)); gl_FragColor = vec4(c, 1.0); }`,
  }),
);
scene.add(sky);

// Tiles keep the artwork's flat, saturated colour: low environment, a thin clear coat.
const glossy = (color, extra = {}) => new THREE.MeshPhysicalMaterial({
  color, roughness: 0.36, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.18, envMapIntensity: 0.4,
  emissive: new THREE.Color(color).multiplyScalar(0.1), ...extra,
});
// The gold core is metal: reflections take its colour instead of washing it out.
const goldLeaf = (color) => new THREE.MeshPhysicalMaterial({ color, metalness: 0.9, roughness: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.2, envMapIntensity: 1.0 });
// Type gets a lit face and darker returns, so letters read as solid objects, not glow.
const WHITE = () => [
  new THREE.MeshPhysicalMaterial({ color: 0xd2d2d2, roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.14, envMapIntensity: 0.45, transparent: true }),
  new THREE.MeshPhysicalMaterial({ color: 0x5c5c5c, roughness: 0.45, clearcoat: 0.4, envMapIntensity: 0.5, transparent: true }),
];
const SOFT = () => [
  new THREE.MeshPhysicalMaterial({ color: 0xb0b0b0, roughness: 0.38, clearcoat: 0.5, envMapIntensity: 0.5, transparent: true }),
  new THREE.MeshPhysicalMaterial({ color: 0x4a4a4a, roughness: 0.5, envMapIntensity: 0.4, transparent: true }),
];
const GOLD = () => new THREE.MeshPhysicalMaterial({ color: 0xd4af37, metalness: 1, roughness: 0.24, clearcoat: 0.5, clearcoatRoughness: 0.1, emissive: 0x2a1e04, transparent: true });

// ─── Geometry helpers ────────────────────────────────────────────────────────

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** A bevelled, rounded slab centred on the origin; its front face sits at +depth/2 + bevel. */
function slab(w, h, r, depth, bevel) {
  const g = new THREE.ExtrudeGeometry(roundedRect(w - 2 * bevel, h - 2 * bevel, Math.max(0.002, r - bevel)), {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, curveSegments: 12,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/**
 * A line of 3D type, one mesh per letter so each can move on its own.
 * Each letter sits in a holder centred on the glyph, so rotations pivot on the letter.
 */
function typeLine(text, font, { size, depth = size * 0.24, tracking = 0, material }) {
  const group = new THREE.Group();
  const res = font.data.resolution;
  const bevel = size * 0.03;
  const letters = [];
  let x = 0;
  for (const ch of text) {
    const glyph = font.data.glyphs[ch] ?? font.data.glyphs['?'];
    const advance = (glyph.ha / res) * size;
    if (ch !== ' ') {
      const g = new TextGeometry(ch, { font, size, depth, curveSegments: 7, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.55, bevelSegments: 3 });
      g.computeBoundingBox();
      const bb = g.boundingBox;
      const cx = (bb.min.x + bb.max.x) / 2;
      const cy = size * 0.36;
      g.translate(-cx, -cy, -depth / 2);
      const holder = new THREE.Group();
      holder.position.set(x + cx, cy, 0);
      holder.userData.home = holder.position.clone();
      holder.add(new THREE.Mesh(g, material()));
      group.add(holder);
      letters.push(holder);
    }
    x += advance + tracking * size;
  }
  const width = x - tracking * size;
  for (const l of letters) { l.position.x -= width / 2; l.userData.home.x -= width / 2; }
  group.userData = { letters, width };
  return group;
}

function setOpacity(holder, a) {
  holder.visible = a > 0.002;
  holder.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.opacity = a;
  });
}

// ─── The FinatriX mark, measured from public/images/finatrix-lockup.png ─────
// Boxes are pixel bounds in the 2565² artwork; 340 px = 1 world unit, origin
// on the white node. Glyphs are lifted from the artwork itself, not redrawn.

const PX = 340, NODE_X = 1270, NODE_Y = 1095;
const box = (x0, x1, y0, y1) => ({
  x0, x1, y0, y1,
  w: (x1 - x0) / PX, h: (y1 - y0) / PX,
  cx: ((x0 + x1) / 2 - NODE_X) / PX, cy: -((y0 + y1) / 2 - NODE_Y) / PX,
});
const TILE_SPECS = {
  rupee: { color: '#00B894', ...box(753, 1036, 552, 848) },
  chart: { color: '#0CEC90', ...box(1140, 1401, 451, 794) },
  dollar: { color: '#0984E3', ...box(1510, 1793, 552, 848) },
  clock: { color: '#74DBBE', ...box(632, 947, 947, 1224) },
  code: { color: '#59A7F6', ...box(1600, 1914, 947, 1224) },
  piggy: { color: '#FA9C86', ...box(771, 1018, 1325, 1612) },
  ai: { color: '#958DF8', ...box(1149, 1397, 1410, 1727) },
  bars: { color: '#B2BEC3', ...box(1523, 1793, 1324, 1612) },
};
const CORE_SPECS = [
  { color: '#F1C40F', ...box(1072, 1266, 895, 1093) },
  { color: '#F6CE76', ...box(1268, 1477, 895, 1093) },
  { color: '#F4BA2D', ...box(1072, 1266, 1097, 1286) },
  { color: '#CD9A31', ...box(1268, 1477, 1097, 1286) },
];
const WORDMARK = box(614, 1902, 1831, 2065);
const TILE_DEPTH = 0.16, TILE_BEVEL = 0.03, TILE_FRONT = TILE_DEPTH / 2 + TILE_BEVEL;

const hexRGB = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Lift a tile's glyph off its colour: alpha = distance from the tile colour, edges un-premultiplied. */
function glyphTexture(spec) {
  const inset = 8, radius = 26;
  const w = spec.x1 - spec.x0 - 2 * inset, h = spec.y1 - spec.y0 - 2 * inset;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(lockup, spec.x0 + inset, spec.y0 + inset, w, h, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const p = img.data;
  const bg = hexRGB(spec.color);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // Outside the tile's rounded corner is page background, never glyph.
      const dx = Math.max(radius - x, x - (w - 1 - radius), 0), dy = Math.max(radius - y, y - (h - 1 - radius), 0);
      const inside = dx * dx + dy * dy <= (radius - 2) ** 2;
      const dist = Math.max(Math.abs(p[i] - bg[0]), Math.abs(p[i + 1] - bg[1]), Math.abs(p[i + 2] - bg[2]));
      const a = inside ? clamp01((dist - 18) / 70) : 0;
      if (a > 0) for (let k = 0; k < 3; k++) p[i + k] = Math.min(255, Math.max(0, (p[i + k] - (1 - a) * bg[k]) / a));
      p[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, w: w / PX, h: h / PX };
}

function wordmarkTexture() {
  const pad = 6;
  const w = WORDMARK.x1 - WORDMARK.x0 + 2 * pad, h = WORDMARK.y1 - WORDMARK.y0 + 2 * pad;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(lockup, WORDMARK.x0 - pad, WORDMARK.y0 - pad, w, h, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const p = img.data, bg = [40, 40, 39];
  for (let i = 0; i < p.length; i += 4) {
    const dist = Math.max(Math.abs(p[i] - bg[0]), Math.abs(p[i + 1] - bg[1]), Math.abs(p[i + 2] - bg[2]));
    const a = clamp01((dist - 14) / 110);
    if (a > 0) for (let k = 0; k < 3; k++) p[i + k] = Math.min(255, Math.max(0, (p[i + k] - (1 - a) * bg[k]) / a));
    p[i + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, w: w / PX, h: h / PX };
}

function makeTile(spec) {
  const tile = new THREE.Group();
  tile.add(new THREE.Mesh(slab(spec.w, spec.h, 0.095, TILE_DEPTH, TILE_BEVEL), glossy(spec.color)));
  const glyph = glyphTexture(spec);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(glyph.w, glyph.h),
    new THREE.MeshBasicMaterial({ map: glyph.tex, transparent: true, depthWrite: false, color: 0xf4f4f4 }),
  );
  face.position.z = TILE_FRONT + 0.004;
  tile.add(face);
  return tile;
}

// ─── Act II opener: the screen closes into the gold core ─────────────────────
// Four panels in the core's four golds, locked to the camera, meet in the
// middle with the white node between them — then swing open like doors.

const doors = new THREE.Group();
doors.position.z = -2;
camera.add(doors);
const halfH = 2 * Math.tan(THREE.MathUtils.degToRad(34 / 2));
const halfW = halfH * (W / H);
const DOOR_W = halfW + 0.3, DOOR_H = halfH + 0.3;
const doorPanels = CORE_SPECS.map((spec, i) => {
  const sx = i % 2 === 0 ? -1 : 1, sy = i < 2 ? 1 : -1;
  const pivot = new THREE.Group();
  const panel = new THREE.Mesh(slab(DOOR_W, DOOR_H, 0.06, 0.08, 0.02), goldLeaf(spec.color));
  pivot.add(panel);
  doors.add(pivot);
  return { pivot, sx, sy, closed: new THREE.Vector2(sx * (DOOR_W / 2 + 0.006), sy * (DOOR_H / 2 + 0.006)) };
});
const doorNode = new THREE.Mesh(new THREE.CircleGeometry(0.075, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.4, 1.4), transparent: true }));
doorNode.position.z = 0.09;
doors.add(doorNode);

function animateDoors(t) {
  doors.visible = t < 1.75;
  if (!doors.visible) return;
  doorPanels.forEach(({ pivot, sx, sy, closed }, i) => {
    const inU = easeOutExpo(range(t, 0.06 + i * 0.045, 0.62 + i * 0.045));
    const outU = easeIn(range(t, 0.92, 1.55));
    pivot.position.x = lerp(closed.x + sx * 2.6, closed.x, inU) + sx * 2.8 * outU;
    pivot.position.y = lerp(closed.y + sy * 1.7, closed.y, inU) + sy * 1.5 * outU;
    pivot.position.z = 0.8 * outU;
    pivot.rotation.z = (1 - inU) * 0.5 * sx * sy;
    pivot.rotation.y = (1 - inU) * -0.9 * sx + outU * 1.25 * sx;
    pivot.rotation.x = outU * -0.8 * sy;
  });
  const nodeIn = easeOutBack(range(t, 0.5, 0.78), 2.2);
  const nodeOut = easeIn(range(t, 0.92, 1.32));
  doorNode.scale.setScalar(Math.max(0.0001, nodeIn * (1 + 9 * nodeOut)));
  doorNode.material.opacity = 1 - nodeOut;
}

// ─── Scene 1: LIFE GETS HARD ─────────────────────────────────────────────────

const act1 = new THREE.Group();
scene.add(act1);
const headline = typeLine('LIFE GETS HARD', heavy, { size: 0.7, tracking: 0.06, material: WHITE });
headline.position.y = 0.28;
act1.add(headline);
const subA = typeLine("when you can't manage", regular, { size: 0.27, depth: 0.05, tracking: 0.02, material: SOFT });
const subB = typeLine('your money.', semibold, { size: 0.27, depth: 0.06, tracking: 0.02, material: GOLD });
const subGap = 0.12;
const subWidth = subA.userData.width + subGap + subB.userData.width;
subA.position.set(-subWidth / 2 + subA.userData.width / 2, -0.5, 0);
subB.position.set(subWidth / 2 - subB.userData.width / 2, -0.5, 0);
act1.add(subA, subB);
const subLetters = [...subA.userData.letters, ...subB.userData.letters];

/** When "HARD" lands, the camera feels it. */
let landShake = 0;
function animateAct1(t) {
  act1.visible = t > 1 && t < 9;
  if (!act1.visible) return;
  const leave = 1 - smooth(range(t, 6.2, 7.4));
  headline.userData.letters.forEach((l, i) => {
    const home = l.userData.home;
    if (i < 8) { // LIFE GETS — out of the dark, tipping upright
      const s = T.life - 0.18 + i * 0.035;
      const e = easeOutExpo(range(t, s, s + 0.75));
      l.position.set(home.x, home.y, lerp(-2.6, 0, e));
      l.rotation.x = lerp(-1.15, 0, e);
      setOpacity(l, smooth(range(t, s, s + 0.4)) * leave);
    } else { // HARD — dropped, with weight
      const s = T.hard + (i - 8) * 0.055;
      const u = range(t, s, s + 0.62);
      l.position.set(home.x, home.y + 3.4 * heavyDrop(u), 0);
      l.rotation.z = (1 - smooth(range(u, 0, 0.42))) * 0.22 * (i % 2 ? 1 : -1);
      setOpacity(l, range(t, s, s + 0.06) * leave);
    }
  });
  subLetters.forEach((l, i) => {
    const s = T.manage + 0.05 + i * 0.03;
    const e = easeOut(range(t, s, s + 0.4));
    const home = l.userData.home;
    l.position.set(home.x, home.y - 0.16 * (1 - e), 0);
    l.scale.setScalar(lerp(0.7, 1, e));
    setOpacity(l, e * leave);
  });
  const land = T.hard + 0.62 * 0.42;
  const since = t - land;
  landShake = since > 0 ? 0.045 * Math.exp(-since * 8) * Math.sin(since * 55) : 0;
}

// ─── Scene 2: the five pillars — five of the mark's own tiles ────────────────

const PILLARS = [
  { tile: 'rupee', label: 'BUDGET' },
  { tile: 'dollar', label: 'EXPENSES' },
  { tile: 'chart', label: 'INVESTMENTS' },
  { tile: 'clock', label: 'FUTURE PLANS' },
  { tile: 'bars', label: 'NET WORTH' },
];
const PILLAR_X0 = 7.5, PILLAR_STEP = 4.4, PILLAR_Z = -1.6, PILLAR_SCALE = 1.85, PILLAR_TURN = -0.2;
const pillarX = (i) => PILLAR_X0 + i * PILLAR_STEP;

const tiles = Object.fromEntries(Object.entries(TILE_SPECS).map(([id, spec]) => {
  const tile = makeTile(spec);
  scene.add(tile);
  return [id, tile];
}));

const pillarLabels = PILLARS.map((p, i) => {
  const label = typeLine(p.label, heavy, { size: 0.28, depth: 0.07, tracking: 0.14, material: WHITE });
  const h = TILE_SPECS[p.tile].h * PILLAR_SCALE;
  label.position.set(pillarX(i), -h / 2 - 0.42, PILLAR_Z + 0.25);
  label.rotation.y = PILLAR_TURN;
  scene.add(label);
  return label;
});

const threadMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.15, 0.45), transparent: true });
const threads = PILLARS.slice(1).map((_, k) => {
  const i = k + 1;
  const len = PILLAR_STEP;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, len, 8), threadMat);
  m.geometry.rotateZ(Math.PI / 2);
  m.geometry.translate(len / 2, 0, 0);
  m.position.set(pillarX(i - 1), -1.55, PILLAR_Z);
  scene.add(m);
  return { mesh: m, i };
});

// ─── Scene 3–4: convergence and the mark ─────────────────────────────────────

const LOGO = new THREE.Vector3(pillarX(2), 5.2, -3.2);
const logo = new THREE.Group(); // only the pieces that never fly: core, node, connectors, wordmark
logo.position.copy(LOGO);
scene.add(logo);

const core = CORE_SPECS.map((spec) => {
  const q = new THREE.Mesh(slab(spec.w, spec.h, 0.03, 0.2, 0.025), goldLeaf(spec.color));
  scene.add(q);
  return { mesh: q, spec };
});

const node = new THREE.Mesh(new THREE.CylinderGeometry(0.174, 0.174, 0.05, 72), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.35, 1.35, 1.35) }));
node.rotation.x = Math.PI / 2;
node.position.z = 0.15;
logo.add(node);

const greyMat = new THREE.MeshStandardMaterial({ color: 0x7d7d7d, roughness: 0.45, metalness: 0.3 });
// Connectors: from the core's edge out to each middle tile, ring at the tile end.
const CONNECTORS = [
  { from: [0, (NODE_Y - 895) / PX], to: [0, (NODE_Y - 821) / PX] },
  { from: [0, (NODE_Y - 1286) / PX], to: [0, (NODE_Y - 1375) / PX] },
  { from: [(1072 - NODE_X) / PX, 0], to: [(973 - NODE_X) / PX, 0] },
  { from: [(1477 - NODE_X) / PX, 0], to: [(1573 - NODE_X) / PX, 0] },
];
const connectors = CONNECTORS.map(({ from, to }) => {
  const g = new THREE.Group();
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 10), greyMat);
  bar.geometry.translate(0, len / 2, 0);
  bar.rotation.z = Math.atan2(dx, dy) * -1;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.013, 12, 40), greyMat);
  ring.position.set(dx, dy, 0);
  g.add(bar, ring);
  g.position.set(from[0], from[1], 0.02);
  logo.add(g);
  return { g, bar, ring };
});

const wm = wordmarkTexture();
const wordmarkMat = (shade) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { map: { value: wm.tex }, reveal: { value: 0 }, shine: { value: -1 }, opacity: { value: 1 }, shade: { value: shade } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D map; uniform float reveal, shine, opacity, shade; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(map, vUv);
      float x = vUv.x - (vUv.y - 0.5) * 0.14;          // follow the wordmark's italic slant
      float shown = 1.0 - smoothstep(reveal - 0.07, reveal, x);
      float glint = exp(-pow((x - shine) / 0.045, 2.0));
      vec3 rgb = c.rgb * shade + glint * 0.9 * shade;
      gl_FragColor = vec4(rgb, c.a * shown * opacity);
    }`,
});
const wordmark = new THREE.Group();
const WM_LAYERS = 8; // stacked, darkened copies read as extrusion when the camera is off-axis
for (let i = WM_LAYERS; i >= 0; i--) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(wm.w, wm.h), wordmarkMat(i === 0 ? 1.0 : 0.16 + 0.02 * (WM_LAYERS - i)));
  m.position.z = -i * 0.011;
  m.renderOrder = WM_LAYERS - i;
  wordmark.add(m);
}
wordmark.position.set(WORDMARK.cx, WORDMARK.cy, 0.1);
logo.add(wordmark);

const EXTRAS = { code: new THREE.Vector3(9, 1.5, 3), piggy: new THREE.Vector3(-8, -5.5, 4), ai: new THREE.Vector3(0.5, -8.5, 2) };
const PILLAR_OF = Object.fromEntries(PILLARS.map((p, i) => [p.tile, i]));

const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), eul = new THREE.Euler();

/** Where every tile is at time t: rising as a pillar, flying home, or locked into the mark. */
function animateTiles(t, logoScale, logoLift) {
  const snapPop = 1 + 0.04 * pulse(t, T.snap - 0.04, 0.1, 0.45);
  const markScale = logoScale * snapPop;
  for (const [id, tile] of Object.entries(tiles)) {
    const spec = TILE_SPECS[id];
    const home = new THREE.Vector3(LOGO.x + spec.cx * markScale, LOGO.y + logoLift + spec.cy * markScale, LOGO.z);
    const i = PILLAR_OF[id];
    let start, startRotY, startScale, c0, c1, visibleFrom;
    if (i !== undefined) {
      const enter = T.pillars[i] - 0.45;
      const u = range(t, enter, enter + 0.95);
      start = new THREE.Vector3(pillarX(i), 0.25, PILLAR_Z);
      startRotY = PILLAR_TURN;
      startScale = PILLAR_SCALE;
      c0 = T.converge + 0.14 * i;
      c1 = T.snap - 0.26 + 0.04 * i;
      visibleFrom = enter;
      if (t < c0) {
        tile.visible = t >= visibleFrom;
        tile.position.set(start.x, start.y + lerp(-3.9, 0, easeOutBack(u, 1.25)), start.z);
        tile.rotation.set(lerp(-1.45, 0, easeOut(u)), startRotY, 0);
        tile.scale.setScalar(startScale);
        continue;
      }
    } else {
      const k = Object.keys(EXTRAS).indexOf(id);
      start = LOGO.clone().add(EXTRAS[id]);
      startRotY = 1.6 * (k % 2 ? 1 : -1);
      startScale = 1.4;
      c0 = T.converge + 1.0 + 0.22 * k;
      c1 = T.snap - 0.18;
    }
    const u = range(t, c0, c1);
    const e = easeInOut(u);
    tile.visible = u > 0 || i !== undefined;
    const arc = Math.sin(Math.PI * u);
    tile.position.set(
      lerp(start.x, home.x, e),
      lerp(start.y, home.y, e) + arc * (1.4 + 0.25 * (i ?? 2)),
      lerp(start.z, home.z, e) + arc * 1.8,
    );
    const dir = (i ?? 1) % 2 ? 1 : -1;
    qa.setFromEuler(eul.set(0, startRotY, 0));
    qb.identity();
    tile.quaternion.slerpQuaternions(qa, qb, e);
    tile.rotateY(arc * 1.1 * dir);
    tile.rotateX(arc * 0.35 * dir);
    tile.scale.setScalar(lerp(startScale, markScale, e));
  }
  core.forEach(({ mesh, spec }, k) => {
    const home = new THREE.Vector3(LOGO.x + spec.cx * markScale, LOGO.y + logoLift + spec.cy * markScale, LOGO.z);
    const from = home.clone().add(new THREE.Vector3(spec.cx * 9, spec.cy * 9, -12));
    const u = range(t, T.lift - 0.2 + k * 0.08, T.snap);
    const e = easeInOut(u);
    mesh.visible = u > 0;
    mesh.position.lerpVectors(from, home, e);
    mesh.rotation.set(0, 0, (1 - e) * 2.4 * (k % 2 ? 1 : -1));
    mesh.scale.setScalar(markScale);
  });
}

// ─── Scene 5: 8 / 1 / ∞ — behind the mark, through the node ─────────────────

const numerals = new THREE.Group();
numerals.position.set(LOGO.x, LOGO.y - 0.25, LOGO.z - 14);
scene.add(numerals);
const COLS = [-2.7, 0, 2.7];
const eight = typeLine('8', heavy, { size: 1.55, depth: 0.42, material: WHITE });
const one = typeLine('1', heavy, { size: 1.55, depth: 0.42, material: WHITE });
eight.position.x = COLS[0];
one.position.x = COLS[1];
numerals.add(eight, one);

class Lemniscate extends THREE.Curve {
  getPoint(u, target = new THREE.Vector3()) {
    const a = Math.PI * 2 * u + Math.PI / 2;
    const d = 1 + Math.sin(a) ** 2;
    return target.set((0.98 * Math.cos(a)) / d, (0.98 * Math.sin(a) * Math.cos(a)) / d * 1.25, 0.16 * Math.sin(a));
  }
}
const infinityGeo = new THREE.TubeGeometry(new Lemniscate(), 420, 0.13, 28, true);
const infinity = new THREE.Mesh(infinityGeo, GOLD());
infinity.position.x = COLS[2];
numerals.add(infinity);
const INF_INDEXES = infinityGeo.index.count;

const colLabels = ['TOOLS', 'PLACE', 'SOLUTIONS'].map((text, i) => {
  const l = typeLine(text, semibold, { size: 0.27, depth: 0.05, tracking: 0.2, material: i === 2 ? GOLD : SOFT });
  l.position.set(COLS[i], -1.2, 0);
  numerals.add(l);
  return l;
});

function popIn(group, t, at) {
  const u = range(t, at - 0.08, at + 0.62);
  group.userData.letters.forEach((l) => {
    l.rotation.y = lerp(-Math.PI / 2, 0, easeOutBack(u, 1.3));
    l.position.z = lerp(-1.6, 0, easeOut(u));
    setOpacity(l, smooth(range(u, 0, 0.35)));
  });
}
function typeIn(group, t, at) {
  group.userData.letters.forEach((l, i) => {
    const s = at + i * 0.035;
    const e = easeOut(range(t, s, s + 0.4));
    l.position.y = l.userData.home.y - 0.2 * (1 - e);
    setOpacity(l, e);
  });
}

function animateNumerals(t) {
  numerals.visible = t > T.dive && t < T.cross2 + 0.1;
  if (!numerals.visible) return;
  popIn(eight, t, T.eight);
  popIn(one, t, T.one);
  typeIn(colLabels[0], t, T.eight + 0.18);
  typeIn(colLabels[1], t, T.one + 0.18);
  typeIn(colLabels[2], t, T.infinite + 0.3);
  const draw = easeInOut(range(t, T.infinite - 0.1, T.infinite + 0.95));
  infinity.visible = draw > 0.001;
  infinityGeo.setDrawRange(0, Math.floor((draw * INF_INDEXES) / 3) * 3);
  infinity.rotation.y = 0.28 * Math.sin((t - T.infinite) * 0.9);
  infinity.rotation.x = 0.12;
  [eight, one].forEach((g, i) => { g.rotation.y = 0.1 * Math.sin((t - T.eight) * 0.7 + i); });
}

// ─── End card ────────────────────────────────────────────────────────────────

const dateLine = typeLine('OCTOBER 14', heavy, { size: 0.34, depth: 0.09, tracking: 0.16, material: GOLD });
scene.add(dateLine);

const END_SCALE = 0.78, END_LIFT = 1.3;
function endcardAmount(t) { return easeInOut(range(t, T.cross2 + 0.05, T.settle)); }

function animateLogo(t) {
  const endAmt = endcardAmount(t);
  const scale = lerp(1, END_SCALE, endAmt);
  const lift = lerp(0, END_LIFT, endAmt);
  const markShown = !(t > T.cross1 - 0.02 && t < T.cross2);
  logo.visible = markShown && t > T.snap - 0.25;
  logo.scale.setScalar(scale);
  logo.position.set(LOGO.x, LOGO.y + lift, LOGO.z);

  animateTiles(t, scale, lift);
  if (!markShown) {
    Object.values(tiles).forEach((tile) => { tile.visible = false; });
    core.forEach(({ mesh }) => { mesh.visible = false; });
  }

  const nodeU = range(t, T.snap - 0.06, T.snap + 0.38);
  node.scale.setScalar(Math.max(0.0001, easeOutBack(nodeU, 2.4)));
  connectors.forEach(({ g }, i) => {
    const u = easeOut(range(t, T.snap + 0.05 + i * 0.04, T.snap + 0.45 + i * 0.04));
    g.scale.setScalar(Math.max(0.0001, u));
  });

  const reveal = lerp(-0.12, 1.12, easeInOut(range(t, T.snap + 0.12, T.snap + 0.95)));
  const shine = lerp(-0.2, 1.25, range(t, T.snap + 0.7, T.snap + 1.5)) + (t > T.date ? lerp(-0.2, 1.25, range(t, T.date + 0.25, T.date + 1.15)) + 1.45 : 0);
  wordmark.children.forEach((m) => { m.material.uniforms.reveal.value = reveal; m.material.uniforms.shine.value = shine; });

  dateLine.visible = t > T.date - 0.2;
  dateLine.position.set(LOGO.x, LOGO.y - 1.55, LOGO.z + 0.12);
  dateLine.userData.letters.forEach((l, i) => {
    const s = T.date + i * 0.04;
    const e = easeOutBack(range(t, s, s + 0.5), 1.6);
    l.position.y = l.userData.home.y + 0.5 * (1 - e);
    l.rotation.x = (1 - e) * -1.2;
    setOpacity(l, smooth(range(t, s, s + 0.25)));
  });
}

function animatePillarLabels(t) {
  pillarLabels.forEach((label, i) => {
    const at = T.pillars[i];
    const gone = smooth(range(t, T.converge - 0.1 + i * 0.06, T.converge + 0.6 + i * 0.06));
    label.visible = t > at - 0.2 && gone < 1;
    label.userData.letters.forEach((l, k) => {
      const s = at - 0.05 + k * 0.03;
      const e = easeOutBack(range(t, s, s + 0.45), 1.8);
      l.scale.setScalar(Math.max(0.0001, e));
      l.position.y = l.userData.home.y + gone * (0.6 + 0.05 * k);
      setOpacity(l, clamp01(e) * (1 - gone));
    });
  });
  threads.forEach(({ mesh, i }) => {
    const grow = easeInOut(range(t, T.pillars[i] - 0.5, T.pillars[i] + 0.25));
    const gone = smooth(range(t, T.converge, T.converge + 0.7));
    mesh.visible = grow > 0.001 && gone < 1;
    mesh.scale.x = Math.max(0.0001, grow);
    mesh.material.opacity = 1 - gone;
  });
}

// ─── Gold dust ───────────────────────────────────────────────────────────────

const DUST = 1700;
const rand = mulberry32(14);
const dustBase = new Float32Array(DUST * 5);
for (let i = 0; i < DUST; i++) {
  dustBase.set([lerp(-9, 36, rand()), lerp(-5, 11, rand()), lerp(-26, 7, rand()), lerp(0.08, 0.32, rand()), rand() * 6.28], i * 5);
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST * 3), 3));
const dotCanvas = document.createElement('canvas');
dotCanvas.width = dotCanvas.height = 64;
{
  const g = dotCanvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.35, 'rgba(255,255,255,0.55)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
}
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
  size: 0.05, map: new THREE.CanvasTexture(dotCanvas), color: 0xe0b85a, transparent: true, opacity: 0.6,
  depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
}));
scene.add(dust);
function animateDust(t) {
  const pos = dustGeo.attributes.position.array;
  for (let i = 0; i < DUST; i++) {
    const [x, y, z, v, ph] = dustBase.subarray(i * 5, i * 5 + 5);
    pos[i * 3] = x + 0.18 * Math.sin(t * 0.35 + ph);
    pos[i * 3 + 1] = ((((y - v * t + 5) % 16) + 16) % 16) - 5;
    pos[i * 3 + 2] = z + 0.12 * Math.cos(t * 0.27 + ph);
  }
  dustGeo.attributes.position.needsUpdate = true;
  dust.material.opacity = 0.55 * smooth(range(t, 0.8, 2.2));
}

// ─── Camera: one continuous move ─────────────────────────────────────────────
// Hermite through keyframes [pos.xyz, look.xyz, roll°, fov]; tangents from the
// neighbours (Catmull-Rom on real time), so it never stops between marks.

function hermiteTrack(keys) {
  const tangents = keys.map((k, i) => {
    if (k.hold || i === 0 || i === keys.length - 1) return k.v.map(() => 0);
    const a = keys[i - 1], b = keys[i + 1];
    return k.v.map((_, j) => (0.85 * (b.v[j] - a.v[j])) / (b.t - a.t));
  });
  return (t) => {
    if (t <= keys[0].t) return keys[0].v.slice();
    if (t >= keys[keys.length - 1].t) return keys[keys.length - 1].v.slice();
    let i = 0;
    while (t > keys[i + 1].t) i++;
    const a = keys[i], b = keys[i + 1], h = b.t - a.t, s = (t - a.t) / h;
    const s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    return a.v.map((_, j) => h00 * a.v[j] + h10 * h * tangents[i][j] + h01 * b.v[j] + h11 * h * tangents[i + 1][j]);
  };
}

const L = LOGO;
const flight = hermiteTrack([
  { t: 0, v: [0, 0.35, 13.6, 0, 0.15, 0, 0, 34] },
  { t: 1.5, v: [0, 0.28, 10.7, 0, 0.1, 0, -1.2, 34] },
  { t: cueEnd('manage') + 0.3, v: [0.2, 0.12, 9.3, 0.12, -0.05, 0, 0, 34] },
  ...T.pillars.map((at, i) => ({ t: at - 0.1, v: [pillarX(i) - 0.85, 0.5, 5.6, pillarX(i) + 0.15, -0.1, PILLAR_Z, 0, 34] })),
  { t: T.converge + 0.35, v: [pillarX(4) + 0.4, 1.0, 7.0, pillarX(4) - 1.4, 0.9, PILLAR_Z, 0, 34] },
  { t: T.lift + 0.25, v: [L.x + 4.2, L.y - 1.6, L.z + 13.4, L.x + 0.8, L.y - 0.6, L.z, 2.2, 36] },
  { t: T.snap, v: [L.x, L.y - 0.42, L.z + 10.8, L.x, L.y - 0.42, L.z, 0, 34], hold: true },
  { t: T.dive, v: [L.x, L.y - 0.38, L.z + 10.1, L.x, L.y - 0.38, L.z, 0, 34], hold: true },
]);

const NUM_Z0 = L.z - 5.7;
function placeCamera(t) {
  let px, py, pz, lx, ly, lz, roll = 0, fov = 34;
  if (t < T.dive) {
    [px, py, pz, lx, ly, lz, roll, fov] = flight(t);
  } else if (t < T.back) { // into the node, out the other side, drift on the numerals
    px = L.x;
    if (t < T.cross1) {
      const u = range(t, T.dive, T.cross1);
      pz = lerp(L.z + 10.1, L.z + 0.1, easeIn(u));
      py = lerp(L.y - 0.38, L.y, smooth(u));
    } else {
      const u = range(t, T.cross1, T.cross1 + 0.85);
      pz = lerp(L.z + 0.1, NUM_Z0, easeOut(u)) - 0.35 * smooth(range(t, T.cross1 + 0.85, T.back));
      py = lerp(L.y, L.y - 0.25, smooth(u));
    }
    lx = px; ly = py; lz = pz - 10;
  } else { // back out through the node to the launch card
    const zNum = NUM_Z0 - 0.35;
    px = L.x;
    if (t < T.cross2) {
      const u = range(t, T.back, T.cross2);
      pz = lerp(zNum, L.z + 0.1, easeIn(u));
      py = lerp(L.y - 0.25, L.y, smooth(u));
    } else {
      const u = range(t, T.cross2, T.settle);
      pz = lerp(L.z + 0.1, L.z + 12.3, easeOut(u)) - 0.9 * easeInOut(range(t, T.settle, T.end));
      py = lerp(L.y, L.y + 0.2, easeInOut(u));
    }
    lx = px; ly = py; lz = pz - 10;
  }
  camera.position.set(px, py + landShake, pz);
  camera.lookAt(lx, ly + landShake * 0.5, lz);
  camera.rotateZ(THREE.MathUtils.degToRad(roll));
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  sky.position.copy(camera.position);
}

// ─── Light sweeps ────────────────────────────────────────────────────────────

function animateLights(t) {
  const a = pulse(t, T.snap, 0.25, 1.0);
  const b = pulse(t, T.date + 0.1, 0.3, 1.1);
  const c = pulse(t, T.infinite, 0.4, 1.2);
  if (b > 0) {
    sweep.position.set(lerp(L.x - 3, L.x + 3, range(t, T.date, T.date + 1.4)), L.y - 0.4, L.z + 1.8);
    sweep.intensity = 16 * b;
  } else if (c > 0) {
    sweep.position.set(L.x + 2.7 + lerp(-0.9, 0.9, range(t, T.infinite, T.infinite + 1.6)), L.y - 0.2, L.z - 12.6);
    sweep.intensity = 6 * c;
  } else {
    sweep.position.set(lerp(L.x - 3, L.x + 3, range(t, T.snap, T.snap + 1.25)), L.y + 0.4, L.z + 3.2);
    sweep.intensity = 3.5 * a; // a glint, not a flood: the bright tiles bloom past ~4
  }
}

// ─── Post: bloom, then the shared film finish ────────────────────────────────

const target = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, target);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.32, 0.55, 1.0); // only HDR emitters (node, thread, gold glints) bloom
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = filmFinish(W, H, { vignette: 0.38, grain: 0.035 });
composer.addPass(finish);

// ─── DOM layers ──────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const bars = document.querySelectorAll('.bar');
function animateOverlays(t, fade) {
  const open = easeInOut(range(t, 1.0, 1.95));
  bars.forEach((b) => { b.style.height = `${12.83 * (1 - open)}vh`; });
  const flash = Math.max(
    0.22 * pulse(t, 0.95, 0.12, 0.45),
    pulse(t, T.cross1 - 0.1, 0.1, 0.42),
    pulse(t, T.cross2 - 0.1, 0.1, 0.5),
    0.06 * pulse(t, T.snap - 0.03, 0.06, 0.4),
  );
  $('flash').style.opacity = flash.toFixed(3);
  const cta = easeOut(range(t, T.available + 0.05, T.available + 0.75));
  $('cta').style.opacity = (cta * (1 - fade)).toFixed(3);
  $('cta').style.transform = `translateY(${(1 - cta) * 1.6}vh)`;
  $('legal').style.opacity = (0.9 * smooth(range(t, T.available + 0.6, T.available + 1.4)) * (1 - fade)).toFixed(3);
}

// ─── Frame ───────────────────────────────────────────────────────────────────

const FPS = 30;
function renderAt(t) {
  const fade = easeInOut(range(t, T.end - 0.85, T.end - 0.05));
  animateDoors(t);
  animateAct1(t);
  animatePillarLabels(t);
  animateLogo(t);
  animateNumerals(t);
  animateDust(t);
  animateLights(t);
  placeCamera(t);
  bloom.strength = 0.32 + 0.2 * pulse(t, T.snap - 0.02, 0.08, 0.7) + 0.25 * pulse(t, T.infinite + 0.6, 0.3, 0.9);
  finish.uniforms.frame.value = Math.round(t * FPS);
  finish.uniforms.fade.value = fade;
  animateOverlays(t, fade);
  composer.render();
}

await document.fonts.ready;
window.__scene = { renderAt, duration: T.end, fps: FPS, cues: T };
renderAt(0);
window.__ready = true;

if (new URLSearchParams(location.search).has('play')) {
  const t0 = performance.now();
  const loop = () => { renderAt(((performance.now() - t0) / 1000) % T.end); requestAnimationFrame(loop); };
  loop();
}
