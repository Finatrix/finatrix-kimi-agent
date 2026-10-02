// FinatriX launch film — a deterministic timeline. `window.FILM.seek(frame)`
// paints exactly one frame; the renderer screenshots it. Every product pixel is
// a captured plate of the real app (see ../capture); this file only frames,
// masks and moves those plates and sets type around them.

const W = 1080, H = 1920;
const TL = await (await fetch('./timeline.json')).json();
const META = await (await fetch('../assets/plates/plates.json')).json();
const C = TL.cuts;
const DSF = META.dsf;

/* ── math ─────────────────────────────────────────────────────────────── */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const E = {
  lin: (t) => t,
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
};
/** 0→1 progress of frame f through [a, b], eased. */
const R = (f, a, b, e = E.lin) => e(clamp((f - a) / (b - a)));
const lerpRect = (p, q, t) => ({ x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t), w: lerp(p.w, q.w, t), h: lerp(p.h, q.h, t) });
const box = (plate, key) => META.plates[plate].boxes[key];
const centre = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/* ── dom helpers ──────────────────────────────────────────────────────── */
const stage = document.getElementById('stage');
function el(tag, cls, parent = stage, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent.appendChild(e);
  return e;
}
function put(e, { x = 0, y = 0, s = 1, sx, sy, r = 0, o = 1, blur = 0, rx = 0, ry = 0, persp = 0 } = {}) {
  const pre = persp ? `perspective(${persp}px) ` : '';
  e.style.transform = `${pre}translate(${x}px, ${y}px) rotateX(${rx}deg) rotateY(${ry}deg) rotate(${r}deg) scale(${sx ?? s}, ${sy ?? s})`;
  e.style.opacity = o;
  e.style.filter = blur > 0.05 ? `blur(${blur}px)` : 'none';
  e.style.visibility = o <= 0.001 ? 'hidden' : 'visible';
}
const hide = (...es) => es.forEach((e) => { e.style.visibility = 'hidden'; e.style.opacity = 0; });

/* ── background layers ────────────────────────────────────────────────── */
const glow = el('div', 'abs', stage); glow.id = 'glow';
const grain = el('canvas', 'abs', stage); grain.id = 'grain'; grain.width = 540; grain.height = 960;
grain.style.width = W + 'px'; grain.style.height = H + 'px';
const gctx = grain.getContext('2d');
function paintGrain(seed) {
  // Small deterministic LCG noise, re-seeded per frame, upscaled 2x.
  const img = gctx.createImageData(540, 960);
  let s = (seed * 2654435761) >>> 0;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const v = s >>> 24;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  gctx.putImageData(img, 0, 0);
}

/* ── headline factory ─────────────────────────────────────────────────── */
function headline(lines, { size = 156, top = 232, align = 'left' } = {}) {
  const wrap = el('div', 'abs hl');
  wrap.style.fontSize = size + 'px';
  wrap.style.textAlign = align;
  const ins = lines.map((html) => el('span', 'in', el('span', 'ln', wrap), html));
  return { wrap, ins, top, size };
}
/** Fit every line of a headline into 900px by shrinking the whole block. */
function fit(h, maxW = 900) {
  const widest = Math.max(...h.ins.map((i) => i.getBoundingClientRect().width / currentScale(i)));
  if (widest > maxW) { h.size = Math.floor(h.size * maxW / widest); h.wrap.style.fontSize = h.size + 'px'; }
}
function currentScale() { return 1; }
/**
 * Line-masked entrance (8 frames, 2-frame stagger) and a 6-frame exit.
 * `fin` = entrance start, `fout` = exit start.
 */
function showHeadline(h, f, fin, fout, { exitDir = -1 } = {}) {
  if (f < fin - 1 || f > fout + 8) { hide(h.wrap); return; }
  put(h.wrap, { x: 0, y: h.top });
  h.ins.forEach((inEl, i) => {
    const a = R(f, fin + i * 2, fin + i * 2 + 8, E.outExpo);
    const b = R(f, fout + i, fout + i + 6, E.inCubic);
    const y = (1 - a) * 105 + b * 105 * exitDir;
    inEl.style.transform = `translateY(${y}%)`;
  });
}
function kicker(text) { return el('div', 'abs kick', stage, text); }
function note(text) { return el('div', 'abs note', stage, text); }
function fadeText(e, f, fin, fout, { x = 0, y, dy = 24 } = {}) {
  const a = R(f, fin, fin + 8, E.outExpo), b = R(f, fout, fout + 5, E.inCubic);
  put(e, { x, y: y + (1 - a) * dy - b * dy, o: a * (1 - b) });
}

/* ── the screen plane ─────────────────────────────────────────────────── */
const DEV = { x: 90, y: 520, w: 900, h: 1080, pad: 12 };
const SCR = { w: DEV.w - 2 * DEV.pad, h: DEV.h - 2 * DEV.pad };
function makePlane(plateNames, { h = DEV.h, top = DEV.y } = {}) {
  const dev = el('div', 'abs device');
  dev.style.width = DEV.w + 'px'; dev.style.height = h + 'px';
  const S = { w: DEV.w - 2 * DEV.pad, h: h - 2 * DEV.pad };
  const scr = el('div', 'screen', dev);
  const imgs = {};
  for (const n of plateNames) {
    const im = el('img', '', scr);
    im.src = `../assets/plates/${n}.png`;
    im.style.visibility = 'hidden';
    imgs[n] = im;
  }
  const wipe = el('div', 'wipe', scr); const scan = el('div', 'scan', scr);
  const focus = el('div', 'focus', scr); const ripple = el('div', 'ripple', scr);
  const sheen = el('div', 'sheen', scr);
  hide(wipe, scan, focus, ripple, sheen);
  return { dev, scr, imgs, focus, ripple, wipe, scan, sheen, S, top };
}
/** Plate-space (CSS px of the 390-wide phone) → screen-space px for a camera. */
const toScr = (cam, p, S = SCR) => ({ x: S.w / 2 + (p.x - cam.cx) * cam.z, y: S.h / 2 + (p.y - cam.cy) * cam.z });
const rectToScr = (cam, b, S = SCR) => { const p = toScr(cam, b, S); return { x: p.x, y: p.y, w: b.w * cam.z, h: b.h * cam.z }; };
/**
 * Paint plate layers. Each layer: { plate, cam: {cx, cy, z}, o = 1, dy = 0 }.
 */
function paintLayers(P, layers) {
  for (const im of Object.values(P.imgs)) im.style.visibility = 'hidden';
  for (const L of layers) {
    const im = P.imgs[L.plate];
    const s = L.cam.z / DSF;
    const x = P.S.w / 2 - L.cam.cx * L.cam.z, y = P.S.h / 2 - L.cam.cy * L.cam.z + (L.dy || 0);
    im.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    im.style.opacity = L.o ?? 1;
    im.style.visibility = (L.o ?? 1) > 0.001 ? 'visible' : 'hidden';
    im.style.filter = L.blur ? `blur(${L.blur}px)` : 'none';
  }
}
function paintFocus(P, cam, rect, alpha, dim = 0.55, radius = 16) {
  if (!rect || alpha <= 0.001) { hide(P.focus); return; }
  const r = rectToScr(cam, rect, P.S);
  const pad = 6;
  Object.assign(P.focus.style, {
    left: r.x - pad + 'px', top: r.y - pad + 'px', width: r.w + 2 * pad + 'px', height: r.h + 2 * pad + 'px',
    borderRadius: radius * cam.z + pad + 'px', opacity: alpha, visibility: 'visible',
    boxShadow: `0 0 0 4000px rgba(6,6,7,${dim * alpha}), 0 0 48px rgba(212,175,55,${0.4 * alpha})`,
  });
}
function paintRipple(P, cam, pt, t) {
  if (t <= 0 || t >= 1) { hide(P.ripple); return; }
  const p = toScr(cam, pt, P.S); const r = lerp(20, 150, E.outCubic(t));
  Object.assign(P.ripple.style, { left: p.x - r + 'px', top: p.y - r + 'px', width: 2 * r + 'px', height: 2 * r + 'px',
    opacity: 1 - E.inCubic(t), visibility: 'visible' });
}
/** Dim everything right of the reveal edge inside `rect`, with a gold scan line on the edge. */
function paintReveal(P, cam, rect, t, scanAlpha = 1) {
  if (t >= 1 && scanAlpha <= 0) { hide(P.wipe, P.scan); return; }
  const r = rectToScr(cam, rect, P.S);
  const edge = r.x + r.w * clamp(t);
  Object.assign(P.wipe.style, { left: edge + 'px', top: r.y - 8 + 'px', width: Math.max(0, r.x + r.w - edge + 6) + 'px', height: r.h + 16 + 'px',
    visibility: t < 1 ? 'visible' : 'hidden', opacity: 1 });
  Object.assign(P.scan.style, { left: edge - 2 + 'px', top: r.y - 8 + 'px', height: r.h + 16 + 'px',
    opacity: scanAlpha * (t > 0 ? 1 : 0), visibility: scanAlpha > 0 && t > 0 && t < 1.02 ? 'visible' : 'hidden' });
}
function placeDevice(P, { x = 0, y = 0, s = 1, o = 1, rx = 0, ry = 0, blur = 0 } = {}) {
  put(P.dev, { x: DEV.x + x, y: P.top + y, s, o, rx, ry, blur, persp: rx || ry ? 2400 : 0 });
}
function paintSheen(P, t) {
  P.sheen.style.transform = `translateX(${lerp(-110, 110, t)}%)`;
  P.sheen.style.opacity = t > 0 && t < 1 ? 1 : 0;
  P.sheen.style.visibility = t > 0 && t < 1 ? 'visible' : 'hidden';
}

/* ═══ build scenes ═══════════════════════════════════════════════════════ */

/* Scene 0 — WHERE DID IT GO? */
const FIGS = ['−₹24,000', '−₹2,150', '−₹640', '−₹499', '−₹340', '−₹2,150', '−₹640'];
const figEls = FIGS.map((t) => el('div', 'abs fig', stage, t));
const FIG_PATHS = [ // y, size, speed px/frame, start x, gold?
  [300, 92, 150, -500], [520, 64, 190, 1200], [1350, 84, 170, -700], [1560, 70, 210, 1300],
  [180, 58, 230, 1500], [1720, 96, 160, -900], [440, 52, 250, -1100],
];
const q = headline(['WHERE', 'DID IT', 'GO<span class="gold">?</span>'], { size: 228, top: 0 });
q.wrap.style.textAlign = 'center';
const flash = el('div', 'abs', stage); flash.id = 'flash';

/* Scene 1 — SEE THE MONTH. */
const k1 = kicker('Dashboard');
const h1 = headline(['See the', 'month<span class="gold">.</span>']);
const n1 = note('Demo data');
const P1 = makePlane(['dashboard']);

/* Scene 2 — TRACK WHAT YOU SPEND. */
const k2 = kicker('Expense Tracker · Quick add');
const h2 = headline(['Track what', 'you spend<span class="gold">.</span>']);
const n2 = note('Demo data');
const KEYS = Array.from({ length: 14 }, (_, i) => `exp_key_${String(i).padStart(2, '0')}`);
const P2 = makePlane([...KEYS, 'exp_added', 'exp_after']);

/* Scene 3 — BUILD YOUR BUDGET. 50 / 30 / 20 */
const k3 = kicker('Budget Builder');
const h3 = headline(['Build your', 'budget<span class="gold">.</span>']);
const n3 = note('Demo data · ₹85,000 monthly income');
const P3 = makePlane(['budget']);
const blocks = ['50', '30', '20'].map((t) => el('div', 'abs blk', stage, t));
const slashes = [0, 1].map(() => el('div', 'abs slash', stage));

/* Scene 4 — TURN GOALS INTO A PLAN. */
const k4 = kicker('Reverse Goal Planner');
const h4 = headline(['Turn goals', 'into a plan<span class="gold">.</span>']);
const n4 = note('Illustrative example · returns assumed, not guaranteed');
const P4 = makePlane(['goals_input', 'goals_result']);

/* Scene 5 — SEE THE LONG VIEW. */
const k5 = kicker('LifeMap');
const h5 = headline(['See the', 'long view<span class="gold">.</span>']);
const chip5 = el('div', 'abs chip', stage, 'Illustrative model');
const n5 = note('A simulation of demo inputs — not a forecast');
const P5 = makePlane(['lifemap'], { h: 820, top: 590 });

/* Scene 6 — brand */
const bloom = el('div', 'abs', stage); bloom.id = 'bloom';
const goldLine = el('div', 'abs', stage); goldLine.id = 'goldLine';
const logoWrap = el('div', 'abs', stage); logoWrap.id = 'logoWrap';
el('img', '', logoWrap).src = '../assets/finatrix-logo.png';
const logoSheen = el('div', 'sheen', logoWrap);
const word = el('div', 'abs', stage, 'Finatri<span class="gold">X</span>'); word.id = 'word';
const tag1 = el('div', 'abs tag', stage, 'See where your money goes.');
const tag2 = el('div', 'abs tag gold', stage, 'Decide what comes next.');
const cta = el('div', 'abs cta', stage, 'Coming to the App Store &amp; Google Play');
const ctaRule = el('div', 'abs', stage); Object.assign(ctaRule.style, { width: '120px', height: '2px', background: 'var(--gold)' });
const disc = el('div', 'abs disc', stage, 'Educational tools · Illustrative screens');

const vignette = el('div', 'abs', stage); vignette.id = 'vignette';
stage.appendChild(flash); stage.appendChild(grain);

/* ── wait for every font and plate, then measure ──────────────────────── */
await document.fonts.ready;
// Wait for every plate to load. Decoding is per frame (see seek): Chromium's
// decoded-image budget cannot hold every 4x plate at once.
await Promise.all([...document.images].map((im) => (im.complete && im.naturalWidth ? null : new Promise((ok, no) => { im.onload = ok; im.onerror = () => no(new Error('plate failed: ' + im.src)); }))));
for (const h of [h1, h2, h3, h4, h5]) fit(h);
fit(q, 900);
const qH = q.wrap.getBoundingClientRect().height; q.top = (H - qH) / 2 - 20;
const wordW = word.getBoundingClientRect().width;
const chipW = chip5.getBoundingClientRect().width;

/* ═══ per-frame paint ═══════════════════════════════════════════════════ */
async function seek(f) {
  paint(f);
  const shown = [...document.images].filter((im) => im.style.visibility !== 'hidden' && im.closest('[style*="visibility: hidden"]') === null);
  for (const im of shown) {
    for (let i = 0; ; i++) {
      try { await im.decode(); break; } catch (e) { if (i > 20) throw new Error('decode failed ' + im.src + ' ' + e); await new Promise((r) => setTimeout(r, 50)); }
    }
  }
}
function paint(f) {
  // reset everything that is scene-owned; each scene re-shows what it needs
  hide(q.wrap, flash, k1, k2, k3, k4, k5, n1, n2, n3, n4, n5, chip5, ...figEls, ...blocks, ...slashes,
    P1.dev, P2.dev, P3.dev, P4.dev, P5.dev, bloom, goldLine, logoWrap, word, tag1, tag2, cta, ctaRule, disc);
  for (const h of [h1, h2, h3, h4, h5]) hide(h.wrap);
  paintGrain(f + 1);
  for (const P of [P1, P2, P3, P4, P5]) hide(P.sheen, P.ripple);
  stage.style.background = '#060607';
  glow.style.opacity = 0.55;

  if (f < C.s1 + 6) scene0(f);
  if (f >= C.s1 - 6 && f < C.s2 + 2) scene1(f);
  if (f >= C.s2 - 2 && f < C.s3) scene2(f);
  if (f >= C.s3 && f < C.s4 + 2) scene3(f);
  if (f >= C.s4 - 2 && f < C.s5) scene4(f);
  if (f >= C.s5 && f < C.s6) scene5(f);
  if (f >= C.s6) scene6(f);
}

function scene0(f) {
  // Readable on frame one: the question is already set, landing with a slam.
  const slam = R(f, 0, 5, E.outExpo);
  const punch = f >= 12 ? 1 - R(f, 12, 17, E.outExpo) : 0;
  const out = R(f, 21, C.s1 + 2, E.inExpo);
  const s = lerp(1.12, 1, slam) + 0.05 * punch + out * 1.6;
  put(q.wrap, { x: 0, y: q.top, s, o: 1 - R(f, 21, 25), blur: out * 14 });
  q.wrap.style.transformOrigin = '50% 50%';
  q.ins.forEach((i) => (i.style.transform = 'none'));
  // Fictional demo figures whip past behind it, then hard-stop on the punch.
  if (f < 12) {
    FIG_PATHS.forEach(([y, size, v, x0], i) => {
      const e = figEls[i];
      const dir = x0 < 0 ? 1 : -1;
      const x = x0 + dir * v * f;
      e.style.fontSize = size + 'px';
      e.style.color = i === 4 ? '#D4AF37' : '#9c9c96';
      e.style.textShadow = `${-dir * 40}px 0 0 rgba(156,156,150,.22), ${-dir * 90}px 0 0 rgba(156,156,150,.10)`;
      put(e, { x, y, o: 0.75, sx: 1.06, sy: 0.96 });
    });
  }
  // Impact frames: a one-frame warm flash on the punch, a softer one on frame 0.
  const fl = f === 12 ? 0.12 : f === 13 ? 0.04 : 0;
  put(flash, { o: fl });
  glow.style.opacity = 0.25 + 0.5 * punch;
  // The screen plane rushes in from beyond the frame: we push through it.
  if (f >= 19) {
    const t = R(f, 19, C.s1 + 4, E.outExpo);
    placeDevice(P1, { s: lerp(3.2, 1.0, t), o: R(f, 19, 23) });
    paintLayers(P1, [{ plate: 'dashboard', cam: cam1(C.s1), o: R(f, 23, C.s1 + 3) }]);
    hide(P1.focus);
  }
}

/* Scene 1 camera: a slow push from ~105% to ~118% of the opening framing. */
function cam1(f) {
  const t = R(f, C.s1, C.s2 - 4, E.inOutSine);
  const z0 = SCR.w / 372;
  return { cx: 195, cy: lerp(330, 468, t), z: z0 * lerp(1.05, 1.18, t) };
}
function scene1(f) {
  const enter = R(f, 19, C.s1 + 4, E.outExpo);
  const ex = R(f, C.s2 - 6, C.s2 + 1, E.inCubic);
  placeDevice(P1, { s: lerp(3.2, 1, enter), y: -ex * 1500, o: R(f, 19, 23) });
  const cam = cam1(f);
  paintLayers(P1, [{ plate: 'dashboard', cam, o: R(f, 23, C.s1 + 3), blur: ex * 6 }]);
  // Focus glides income → savings → spending → what's left, one per beat.
  const order = ['income', 'savings', 'spent', 'left'], at = [41, 55, 68, 82];
  let rect = box('dashboard', order[0]);
  for (let i = 1; i < order.length; i++) rect = lerpRect(rect, box('dashboard', order[i]), R(f, at[i] - 2, at[i] + 3, E.outQuart));
  const fa = R(f, at[0] - 3, at[0] + 1, E.outCubic) * (1 - ex);
  paintFocus(P1, cam, rect, fa, 0.6, 16);
  showHeadline(h1, f, C.s1 + 1, C.s2 - 6);
  fadeText(k1, f, C.s1 + 1, C.s2 - 6, { y: 172 });
  fadeText(n1, f, C.s1 + 8, C.s2 - 6, { y: 1606 });
}

/* Scene 2 — typing, tap, confirmation, whip to the month's totals, push into a card. */
function scene2(f) {
  const enter = R(f, C.s2 - 2, C.s2 + 7, E.outExpo);
  const card = box('exp_typed', 'card');
  const pushT = R(f, C.s2, 136, E.inOutSine);
  const qaB = box('exp_typed', 'qa');
  const camA = { cx: 195, cy: lerp(card.y + card.h / 2, qaB.y + qaB.h / 2 + 30, pushT), z: (SCR.w / 372) * lerp(1.0, 1.2, pushT) };
  // Keystrokes: one real captured state per keystroke, two frames apart.
  const key = f < 99 ? 0 : clamp(Math.floor((f - 99) / 2) + 1, 1, 13);
  const plateA = f >= 137 ? 'exp_added' : KEYS[key];
  // Whip: the confirmation slides out, the month's totals slide in.
  const w = R(f, 146, 152, E.inOutCubic);
  const tiles = box('exp_after', 'tiles');
  const camB0 = { cx: 195, cy: tiles.y + tiles.h / 2, z: SCR.w / 372 };
  const push = R(f, 157, C.s3, E.inExpo);
  const rem = centre(box('exp_after', 'remaining'));
  const camB = { cx: lerp(camB0.cx, rem.x, push), cy: lerp(camB0.cy, rem.y, push), z: camB0.z * lerp(1, 6.5, push) };
  const layers = [];
  if (w < 1) layers.push({ plate: plateA, cam: camA, dy: -w * SCR.h, blur: w * (1 - w) * 24 });
  if (w > 0) layers.push({ plate: 'exp_after', cam: camB, dy: (1 - w) * SCR.h, blur: w * (1 - w) * 24 });
  placeDevice(P2, { y: (1 - enter) * 1500, s: 1 + push * 1.25, o: 1 });
  paintLayers(P2, layers);
  // Tap feedback on the real Add button, then the confirmation it produced.
  const add = box('exp_typed', 'add');
  paintRipple(P2, camA, centre(add), R(f, 135, 145));
  if (w <= 0) {
    const ring = f >= 137 ? R(f, 137, 140, E.outCubic) * (1 - R(f, 144, 147)) : 0;
    paintFocus(P2, camA, add, ring, 0.0, 20);
  } else {
    paintFocus(P2, camB, box('exp_after', 'spent'), R(f, 151, 154, E.outCubic) * (1 - push), 0.45, 16);
  }
  showHeadline(h2, f, C.s2 + 1, 156);
  fadeText(k2, f, C.s2 + 1, 156, { y: 172 });
  fadeText(n2, f, C.s2 + 8, 156, { y: 1606 });
  if (push > 0) stage.style.background = '#060607';
}

/* Scene 3 — three blocks, then they split into the real 50/30/20 fields. */
function cam3() {
  const s = box('budget', 'split');
  return { cx: 195, cy: s.y + s.h / 2 - 6, z: SCR.w / 372 * 1.02 };
}
function scene3(f) {
  // The pushed-into card surface fades back to the brand dark.
  const bgT = R(f, C.s3, C.s3 + 8);
  stage.style.background = `rgb(${lerp(20, 6, bgT)}, ${lerp(20, 6, bgT)}, ${lerp(22, 7, bgT)})`;
  glow.style.opacity = 0.55 * bgT;
  const ex = R(f, C.s4 - 6, C.s4 + 1, E.inCubic);
  showHeadline(h3, f, C.s3 + 1, C.s4 - 6);
  fadeText(k3, f, C.s3 + 1, C.s4 - 6, { y: 172 });
  // Three oversized blocks, one per tick, laid out in output space.
  const BW = 270, BH = 400, BY = 700, GAP = 45, FS = 230;
  const bx = (i) => 90 + i * (BW + GAP);
  // Each lands on its real Budget Builder field, mapped through the camera.
  // Size, radius and type animate as layout (not a non-uniform scale), so the
  // numerals never squash on the way down.
  const cam = cam3();
  const keys = ['pn', 'pw', 'ps'];
  const m = R(f, 189, 199, E.inOutCubic);
  const planeIn = R(f, 187, 197, E.outExpo);
  const settle = R(f, 199, 204);
  const appFont = 17 * cam.z; // the field's own numeral size on screen
  blocks.forEach((b, i) => {
    const hit = [170, 177, 184][i];
    const tIn = R(f, hit - 1, hit + 4, E.outExpo);
    const r = rectToScr(cam, box('budget', keys[i]));
    const tx = DEV.x + DEV.pad + r.x, ty = P3.top + DEV.pad + r.y;
    Object.assign(b.style, {
      width: lerp(BW, r.w, m) + 'px', height: lerp(BH, r.h, m) + 'px',
      fontSize: lerp(FS, appFont, m) + 'px', borderRadius: lerp(44, 10 * cam.z, m) + 'px', color: '#F5F5F0',
    });
    const pop = lerp(1.22, 1, tIn);
    put(b, { x: lerp(bx(i), tx, m), y: lerp(BY + (1 - tIn) * 70, ty, m), s: pop, o: tIn * (1 - settle) });
    b.style.transformOrigin = '50% 50%';
  });
  slashes.forEach((sl, i) => {
    const a = R(f, [177, 184][i] - 1, [177, 184][i] + 4, E.outExpo) * (1 - R(f, 187, 192));
    put(sl, { x: bx(i + 1) - GAP / 2 - 3, y: BY + 90, r: 18, o: a });
  });
  // The real Budget Builder card arrives under the blocks.
  placeDevice(P3, { s: lerp(0.94, 1, planeIn), o: planeIn * (1 - ex), y: -ex * 40 });
  paintLayers(P3, [{ plate: 'budget', cam, o: 1 }]);
  // The allocation bar fills in left to right: a reveal of real pixels.
  const s = box('budget', 'split');
  const bar = { x: s.x + 24, y: box('budget', 'pn').y + 52, w: s.w - 48, h: 70 };
  const fill = R(f, 199, 214, E.inOutCubic);
  paintReveal(P3, cam, bar, f < 199 ? 0 : fill, 1 - R(f, 212, 217));
  if (f < 199) hide(P3.scan);
  fadeText(n3, f, 204, C.s4 - 6, { y: 1606 });
}

/* Scene 4 — target and deadline in, the planner's monthly path out. */
function scene4(f) {
  const enter = R(f, C.s4 - 2, C.s4 + 7, E.outExpo);
  const reset = R(f, 293, C.s5, E.inExpo);
  placeDevice(P4, { x: (1 - enter) * 1200, ry: (1 - enter) * -14, s: 1 - reset * 0.25, o: 1 - reset });
  const tgt = box('goals_input', 'target'), yrs = box('goals_input', 'years'), cta = box('goals_input', 'cta');
  const tIn = R(f, C.s4, 258, E.inOutSine);
  const camIn = { cx: 195, cy: lerp(tgt.y + 40, (tgt.y + cta.y + cta.h) / 2 + 10, tIn), z: SCR.w / 372 * 1.08 };
  const title = box('goals_result', 'title'), ag = box('goals_result', 'aggressive'), md = box('goals_result', 'moderate');
  const pan = R(f, 277, 287, E.inOutCubic);
  const zOut = SCR.w / 372 * 1.08, half = SCR.h / 2 / zOut;
  // Open with the goal's own headline in frame, then tilt to the next path.
  const camOut = { cx: 195, cy: lerp(title.y - 40 + half, md.y - 20 + half, pan), z: zOut };
  const swap = f >= 260;
  paintLayers(P4, [swap ? { plate: 'goals_result', cam: camOut } : { plate: 'goals_input', cam: camIn }]);
  if (!swap) {
    const rect = lerpRect(tgt, yrs, R(f, 248, 252, E.outQuart));
    const fa = R(f, 238, 242, E.outCubic) * (1 - R(f, 254, 257));
    paintFocus(P4, camIn, { x: rect.x, y: rect.y + 22, w: rect.w, h: rect.h - 22 }, fa, 0.5, 12);
    paintRipple(P4, camIn, centre(cta), R(f, 258, 266));
  } else {
    hide(P4.ripple);
    // Crisp result: a brief sheen, then focus on each path's monthly figure.
    paintSheen(P4, R(f, 260, 268));
    const sip = (b) => ({ x: b.x + 20, y: b.y + 110, w: 146, h: 80 });
    const onAg = R(f, 265, 269, E.outCubic) * (1 - R(f, 275, 278));
    const onMd = R(f, 287, 291, E.outCubic) * (1 - reset);
    paintFocus(P4, camOut, f < 282 ? sip(ag) : sip(md), Math.max(onAg, onMd), 0.4, 12);
  }
  showHeadline(h4, f, C.s4 + 1, 292);
  fadeText(k4, f, C.s4 + 1, 292, { y: 172 });
  fadeText(n4, f, 262, 292, { y: 1606 });
}

/* Scene 5 — LifeMap: trace the real projection, then return to dark. */
function scene5(f) {
  const enter = R(f, C.s5, C.s5 + 10, E.outExpo);
  const out = R(f, 362, C.s6, E.inOutSine);
  const chart = box('lifemap', 'chart'), canvas = box('lifemap', 'canvas');
  const drift = R(f, C.s5, 360, E.inOutSine);
  const cam = { cx: 195, cy: lerp(chart.y + chart.h / 2 + 24, chart.y + chart.h / 2 + 4, drift), z: SCR.w / 372 * lerp(1.03, 1.10, drift) };
  placeDevice(P5, { y: (1 - enter) * 220, s: lerp(0.9, 1, enter) * lerp(1, 0.92, out), o: enter * (1 - out) });
  paintLayers(P5, [{ plate: 'lifemap', cam }]);
  // Plot area only (inset past the axis labels), traced left to right.
  const plot = { x: canvas.x + 34, y: canvas.y, w: canvas.w - 36, h: canvas.h - 20 };
  paintReveal(P5, cam, plot, R(f, 308, 344, E.inOutSine), 1 - R(f, 342, 348));
  paintFocus(P5, cam, null, 0);
  showHeadline(h5, f, C.s5 + 1, 364);
  fadeText(k5, f, C.s5 + 1, 364, { y: 172 });
  const ca = R(f, 312, 320, E.outExpo) * (1 - R(f, 364, 370));
  put(chip5, { x: 990 - chipW, y: 162 + (1 - ca) * 14, o: ca });
  fadeText(n5, f, 316, 364, { y: 1606 });
  glow.style.opacity = 0.55 * (1 - out);
}

/* Scene 6 — gold-light logo assembly, then a long readable hold. */
function scene6(f) {
  const t = f - C.s6;
  glow.style.opacity = 0.35 + 0.45 * R(t, 0, 20, E.outCubic);
  const ICON = 300, iconY = 470;
  const lineT = R(t, 0, 7, E.outExpo), lineOut = R(t, 8, 16, E.inCubic);
  goldLine.style.width = '900px';
  put(goldLine, { x: 90, y: iconY + ICON / 2, sx: lineT * (1 - lineOut * 0.9), sy: 1 + lineOut * 2, o: 1 - lineOut });
  const b = R(t, 2, 14, E.outCubic), bOut = R(t, 14, 40, E.outCubic);
  put(bloom, { x: 40, y: iconY + ICON / 2 - 500, s: lerp(0.3, 1.05, b), o: b * (1 - bOut * 0.75) });
  const li = R(t, 3, 14, E.outExpo);
  put(logoWrap, { x: (W - ICON) / 2, y: iconY + (1 - li) * 30, s: lerp(0.82, 1, li), o: li });
  logoSheen.style.transform = `translateX(${lerp(-120, 120, R(t, 8, 20, E.inOutSine))}%)`;
  // Wordmark wipes in from the left behind a mask.
  const wi = R(t, 8, 20, E.outExpo);
  word.style.clipPath = `inset(-20% ${(1 - wi) * 100}% -20% 0)`;
  put(word, { x: (W - wordW) / 2 + (1 - wi) * -30, y: 830, o: wi > 0 ? 1 : 0 });
  const tg = (e, a, y) => { const p = R(t, a, a + 9, E.outExpo); put(e, { y: y + (1 - p) * 26, o: p }); };
  tg(tag1, 16, 1080); tg(tag2, 19, 1152);
  tg(cta, 24, 1352);
  const rl = R(t, 22, 32, E.outExpo);
  put(ctaRule, { x: (W - 120) / 2, y: 1316, sx: rl, o: rl });
  tg(disc, 30, 1570);
}

window.FILM = { frames: TL.frames, fps: TL.fps, seek, ready: true };
document.title = 'ready';
