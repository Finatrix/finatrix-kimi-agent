// FinatriX launch film (56.6 s). A deterministic timeline: FILM.seek(frame)
// paints exactly one frame. Every product pixel is a captured plate of the real
// app (../capture); this file frames, masks and moves them, and draws the type,
// the coin character, the chaos pile and the brand moments around them.

const W = 1080, H = 1920;
const TL = await (await fetch('./timeline2.json')).json();
const M1 = await (await fetch('../assets/plates/plates.json')).json();
const M2 = await (await fetch('../assets/plates2/plates.json')).json();
const SC = TL.scenes;
const F = (s) => Math.round(s * TL.fps);
const WD = Object.fromEntries(Object.entries(TL.words).map(([k, v]) => [k, F(v)]));

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
  outBack: (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
};
const R = (f, a, b, e = E.lin) => e(clamp((f - a) / (b - a)));
const lerpRect = (p, q, t) => ({ x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t), w: lerp(p.w, q.w, t), h: lerp(p.h, q.h, t) });
const centre = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const inScene = (f, k, pre = 0, post = 0) => f >= SC[k][0] - pre && f < SC[k][1] + post;

/* ── plates ───────────────────────────────────────────────────────────── */
function plateInfo(name) {
  if (M2.plates[name]) return { src: `../assets/plates2/${name}.png`, dsf: name.startsWith('desk_') ? 2 : 4, m: M2.plates[name] };
  if (name.startsWith('exp_key_')) return { src: `../assets/plates/${name}.png`, dsf: 4, m: M1.plates.exp_typed };
  return { src: `../assets/plates/${name}.png`, dsf: 4, m: M1.plates[name] };
}
const box = (name, key) => plateInfo(name).m.boxes[key];

/* ── dom ──────────────────────────────────────────────────────────────── */
const stage = document.getElementById('stage');
function el(tag, cls, parent = stage, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent.appendChild(e);
  return e;
}
const all = [];
function reg(e) { all.push(e); return e; }
function put(e, { x = 0, y = 0, s = 1, sx, sy, r = 0, o = 1, blur = 0, rx = 0, ry = 0, z = 0, persp = 0, origin } = {}) {
  const pre = persp ? `perspective(${persp}px) ` : '';
  e.style.transform = `${pre}translate3d(${x}px, ${y}px, ${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotate(${r}deg) scale(${sx ?? s}, ${sy ?? s})`;
  if (origin) e.style.transformOrigin = origin;
  e.style.opacity = o;
  e.style.filter = blur > 0.05 ? `blur(${blur}px)` : 'none';
  e.style.visibility = o <= 0.001 ? 'hidden' : 'visible';
}
const hide = (...es) => es.forEach((e) => { e.style.visibility = 'hidden'; e.style.opacity = 0; });
const mbx = document.getElementById('mbxv');
const setMotionBlur = (px) => mbx.setAttribute('stdDeviation', `${px} 0`);

/* ── backgrounds ──────────────────────────────────────────────────────── */
const paper = el('div', 'abs full'); paper.id = 'paper';
const glow = el('div', 'abs full'); glow.id = 'glow';
const iris = el('div', 'abs full'); iris.id = 'iris';
const grain = el('canvas', 'abs full'); grain.id = 'grain'; grain.width = 540; grain.height = 960;
const gctx = grain.getContext('2d');
function paintGrain(seed) {
  const img = gctx.createImageData(540, 960);
  let s = (seed * 2654435761) >>> 0;
  for (let i = 0; i < img.data.length; i += 4) { s = (s * 1664525 + 1013904223) >>> 0; const v = s >>> 24; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  gctx.putImageData(img, 0, 0);
}

/* ── type ─────────────────────────────────────────────────────────────── */
function headline(lines, { size = 132, top = 232, align = 'left', color } = {}) {
  const wrap = reg(el('div', 'abs hl'));
  wrap.style.fontSize = size + 'px';
  wrap.style.textAlign = align;
  if (color) wrap.style.color = color;
  if (align === 'center') { wrap.style.left = '60px'; wrap.style.width = '960px'; }
  const ins = lines.map((html) => el('span', 'in', el('span', 'ln', wrap), html));
  return { wrap, ins, top, size };
}
function fit(h, maxW = 900) {
  const widest = Math.max(...h.ins.map((i) => i.getBoundingClientRect().width));
  if (widest > maxW) { h.size = Math.floor(h.size * maxW / widest); h.wrap.style.fontSize = h.size + 'px'; }
}
/** Line-masked entrance with a small overshoot; 6-frame exit. */
function showHL(h, f, fin, fout, { exitDir = -1, stagger = 3 } = {}) {
  if (f < fin - 1 || f > fout + 9) { hide(h.wrap); return; }
  put(h.wrap, { x: 0, y: h.top });
  h.ins.forEach((inEl, i) => {
    const a = R(f, fin + i * stagger, fin + i * stagger + 9, E.outBack);
    const b = R(f, fout + i, fout + i + 6, E.inCubic);
    inEl.style.transform = `translateY(${(1 - a) * 110 + b * 110 * exitDir}%) skewY(${(1 - a) * 6}deg)`;
  });
}
const kicker = (t) => reg(el('div', 'abs kick', stage, t));
const note = (t) => reg(el('div', 'abs note', stage, t));
function fadeText(e, f, fin, fout, { x = 0, y, dy = 24 } = {}) {
  const a = R(f, fin, fin + 8, E.outExpo), b = R(f, fout, fout + 5, E.inCubic);
  put(e, { x, y: y + (1 - a) * dy - b * dy, o: a * (1 - b) });
}

/* ── screens (phone or browser) ───────────────────────────────────────── */
function makeScreen(names, { kind = 'phone', w = 900, h = 1080, url = 'finatrix.co' } = {}) {
  const dev = reg(el('div', 'abs device' + (kind === 'browser' ? ' browser' : '')));
  dev.style.width = w + 'px'; dev.style.height = h + 'px';
  if (kind === 'browser') {
    const bar = el('div', 'bar', dev); el('i', '', bar); el('i', '', bar); el('i', '', bar); el('div', 'url', bar, url);
  }
  const scr = el('div', 'screen', dev);
  const S = kind === 'browser' ? { w, h: h - 64 } : { w: w - 24, h: h - 24 };
  const imgs = {};
  for (const n of names) { const im = el('img', '', scr); im.src = plateInfo(n).src; im.style.visibility = 'hidden'; imgs[n] = im; }
  const wipe = el('div', 'wipe', scr), scan = el('div', 'scan', scr), focus = el('div', 'focus', scr), ripple = el('div', 'ripple', scr), sheen = el('div', 'sheen', scr);
  return { dev, scr, imgs, focus, ripple, wipe, scan, sheen, S, w, h, kind };
}
const toScr = (P, cam, p) => ({ x: P.S.w / 2 + (p.x - cam.cx) * cam.z, y: P.S.h / 2 + (p.y - cam.cy) * cam.z });
const rectToScr = (P, cam, b) => { const p = toScr(P, cam, b); return { x: p.x, y: p.y, w: b.w * cam.z, h: b.h * cam.z }; };
/** Screen-space → stage-space, for an untransformed device centred at (cx, cy). */
const scrToStage = (P, at, p) => ({ x: at.x - P.w / 2 + (P.kind === 'browser' ? 0 : 12) + p.x, y: at.y - P.h / 2 + (P.kind === 'browser' ? 64 : 12) + p.y });
function paintLayers(P, layers) {
  for (const im of Object.values(P.imgs)) im.style.visibility = 'hidden';
  for (const L of layers) {
    const im = P.imgs[L.plate], dsf = plateInfo(L.plate).dsf;
    const x = P.S.w / 2 - L.cam.cx * L.cam.z + (L.dx || 0), y = P.S.h / 2 - L.cam.cy * L.cam.z + (L.dy || 0);
    im.style.transform = `translate(${x}px, ${y}px) scale(${L.cam.z / dsf})`;
    im.style.opacity = L.o ?? 1;
    im.style.visibility = (L.o ?? 1) > 0.001 ? 'visible' : 'hidden';
    im.style.filter = L.blur ? `blur(${L.blur}px)` : L.mb ? 'url(#mbx)' : 'none';
  }
}
function paintFocus(P, cam, rect, alpha, dim = 0.55, radius = 16) {
  if (!rect || alpha <= 0.001) { hide(P.focus); return; }
  const r = rectToScr(P, cam, rect), pad = 6;
  Object.assign(P.focus.style, {
    left: r.x - pad + 'px', top: r.y - pad + 'px', width: r.w + 2 * pad + 'px', height: r.h + 2 * pad + 'px',
    borderRadius: radius * cam.z + pad + 'px', opacity: alpha, visibility: 'visible',
    boxShadow: `0 0 0 4000px rgba(6,6,7,${dim * alpha}), 0 0 48px rgba(212,175,55,${0.45 * alpha})`,
  });
}
function paintRipple(P, cam, pt, t) {
  if (t <= 0 || t >= 1) { hide(P.ripple); return; }
  const p = toScr(P, cam, pt), r = lerp(20, 150, E.outCubic(t));
  Object.assign(P.ripple.style, { left: p.x - r + 'px', top: p.y - r + 'px', width: 2 * r + 'px', height: 2 * r + 'px', opacity: 1 - E.inCubic(t), visibility: 'visible' });
}
function paintReveal(P, cam, rect, t, scanAlpha = 1) {
  if ((t >= 1 && scanAlpha <= 0) || t <= 0) { hide(P.wipe, P.scan); if (t <= 0) { /* fully dimmed until it starts */ } }
  const r = rectToScr(P, cam, rect), edge = r.x + r.w * clamp(t);
  Object.assign(P.wipe.style, { left: edge + 'px', top: r.y - 8 + 'px', width: Math.max(0, r.x + r.w - edge + 6) + 'px', height: r.h + 16 + 'px', visibility: t < 1 ? 'visible' : 'hidden', opacity: 1 });
  Object.assign(P.scan.style, { left: edge - 2 + 'px', top: r.y - 8 + 'px', height: r.h + 16 + 'px', opacity: scanAlpha, visibility: scanAlpha > 0 && t > 0 && t < 1 ? 'visible' : 'hidden' });
}
function paintSheen(P, t) { P.sheen.style.transform = `translateX(${lerp(-110, 110, t)}%)`; const v = t > 0 && t < 1; P.sheen.style.opacity = v ? 1 : 0; P.sheen.style.visibility = v ? 'visible' : 'hidden'; }
/** Place a screen by its centre. */
function place(P, { x = 540, y = 1060, s = 1, o = 1, rx = 0, ry = 0, r = 0, blur = 0, z = 0 } = {}) {
  put(P.dev, { x: x - P.w / 2, y: y - P.h / 2, s, o, rx, ry, r, blur, z, persp: rx || ry || z ? 2600 : 0, origin: '50% 50%' });
}
const resetScreen = (P) => { hide(P.dev, P.focus, P.ripple, P.wipe, P.scan, P.sheen); };

/* ═══ build ══════════════════════════════════════════════════════════════ */

/* Act one — payday, the coin, the bites */
const payday = reg(el('div', 'abs', stage, 'PAYDAY<span class="gdeep">.</span>'));
Object.assign(payday.style, { width: '1080px', textAlign: 'center', font: "850 236px 'Geist'", letterSpacing: '-.055em', color: '#0A0A0A' });
const underline = reg(el('div', 'abs')); Object.assign(underline.style, { width: '760px', height: '16px', borderRadius: '8px', background: 'linear-gradient(90deg,#F0D779,#C9A23C)', transformOrigin: '0 50%' });
const notif = reg(el('div', 'abs notif', stage, '<div class="ic">₹</div><div><b>Salary credited</b><span>₹85,000 · just now</span></div>'));
const coinShadow = reg(el('div', 'abs')); Object.assign(coinShadow.style, { width: '420px', height: '60px', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(60,45,0,.32), rgba(60,45,0,0))' });
const coin = reg(el('div', 'abs'));
coin.style.width = coin.style.height = '560px';
coin.innerHTML = `<svg viewBox="0 0 560 560" width="560" height="560">
  <defs>
    <radialGradient id="cg" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#FFF1BF"/><stop offset=".45" stop-color="#E6C766"/><stop offset=".8" stop-color="#C9A23C"/><stop offset="1" stop-color="#9C7A26"/></radialGradient>
    <mask id="bites"><rect width="560" height="560" fill="#fff"/><g id="biteHoles"></g></mask>
  </defs>
  <g mask="url(#bites)">
    <circle cx="280" cy="280" r="268" fill="url(#cg)"/>
    <circle cx="280" cy="280" r="236" fill="none" stroke="#A8841F" stroke-width="5" opacity=".45"/>
    <g id="eyes">
      <g id="eyeL"><ellipse cx="208" cy="214" rx="38" ry="44" fill="#fff"/><circle id="pupL" cx="212" cy="222" r="19" fill="#141414"/></g>
      <g id="eyeR"><ellipse cx="352" cy="214" rx="38" ry="44" fill="#fff"/><circle id="pupR" cx="356" cy="222" r="19" fill="#141414"/></g>
    </g>
    <path id="mouth" d="M246 292 Q280 318 314 292" stroke="#3a2c06" stroke-width="9" fill="none" stroke-linecap="round"/>
    <text id="amt" x="280" y="402" text-anchor="middle" font-family="Geist" font-weight="820" font-size="84" letter-spacing="-3" fill="#0A0A0A">₹85,000</text>
  </g>
</svg>`;
const biteHoles = coin.querySelector('#biteHoles');
const [eyeL, eyeR, pupL, pupR, mouth, amt] = ['#eyeL', '#eyeR', '#pupL', '#pupR', '#mouth', '#amt'].map((s) => coin.querySelector(s));
const BITES = [ // word, label, amount, colour, angle (deg), bite radius
  ['rent', 'Rent', 24000, '#FF5A52', -38, 150],
  ['groceries', 'Groceries', 2150, '#1d7d46', 205, 96],
  ['rides', 'Transport', 640, '#0071e3', 140, 70],
  ['subs', 'Subscriptions', 499, '#8856d8', 28, 62],
  ['lunch', 'Eating Out', 340, '#c2410c', 92, 56],
];
const biteEls = BITES.map(() => { const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('fill', '#000'); biteHoles.appendChild(c); return c; });
const xchips = BITES.map(([, l, a, c]) => reg(el('div', 'abs xchip', stage, `<i style="background:${c}"></i>${l} <em>−₹${a.toLocaleString('en-IN')}</em>`)));
const crumbs = Array.from({ length: 30 }, () => reg(el('div', 'abs')));
crumbs.forEach((c) => Object.assign(c.style, { width: '16px', height: '16px', borderRadius: '50%', background: '#D4AF37' }));
const twoWeeks = reg(el('div', 'abs serif', stage, 'Two weeks later…'));
Object.assign(twoWeeks.style, { width: '1080px', textAlign: 'center', fontSize: '104px', color: '#0A0A0A' });
const dayCounter = reg(el('div', 'abs day', stage, 'DAY 01'));
Object.assign(dayCounter.style, { width: '1080px', textAlign: 'center' });
const hWhere = headline(['Where did it', '<span class="serif gdeep">all</span> go?'], { size: 150, top: 190, align: 'center', color: '#0A0A0A' });

/* Chaos */
const CH = [];
const chaosCard = (cls, html, at, x, y, zz, rx, ry, rz) => { const e = reg(el('div', 'abs ' + cls, stage, html)); CH.push({ e, at, x, y, z: zz, rx, ry, rz }); return e; };
chaosCard('sms', '<small>BANK · 09:41</small>Debited ₹24,000 · Rent transfer', F(9.0), 70, 700, -200, 6, -14, -4);
chaosCard('sms', '<small>BANK · 13:02</small>₹2,150 spent on card at a grocery store', F(9.2), 380, 930, -320, -4, 12, 5);
chaosCard('sms', '<small>UPI · 13:15</small>Paid ₹340 · lunch', F(9.35), 120, 1160, -120, 8, -8, -3);
chaosCard('shot', '<small style="font:500 22px Geist Mono;color:#8b8b90">SCREENSHOT</small><b>₹499</b><u></u><u style="width:70%"></u><u style="width:85%"></u><u style="width:50%"></u>', F(9.62), 650, 640, -260, -6, -20, 9);
chaosCard('shot', '<small style="font:500 22px Geist Mono;color:#8b8b90">SCREENSHOT</small><b>₹640</b><u></u><u style="width:60%"></u><u style="width:90%"></u>', F(9.8), 40, 1250, -380, 5, 18, -10);
const sheet = chaosCard('sheet', `<div class="t">budget_final_v3 (2).xlsx</div><table>
  <tr><td>1</td><td>Rent</td><td>24000</td></tr><tr><td>2</td><td>Food??</td><td></td></tr><tr><td>3</td><td>Uber</td><td>640</td></tr>
  <tr><td>4</td><td>Netflix</td><td>499</td></tr><tr><td>5</td><td>TOTAL</td><td class="err">#REF!</td></tr></table>`, F(10.85), 180, 1160, 40, 4, -6, -3);
const hChaos = [
  headline(['Bank texts.'], { size: 140, top: 200 }),
  headline(['Screenshots.'], { size: 140, top: 200 }),
  headline(['A spreadsheet', 'you <span class="serif gold">stopped</span>', 'opening.'], { size: 132, top: 190 }),
];
const dust = Array.from({ length: 40 }, () => reg(el('div', 'abs dot')));

/* Meet — the logo builds from its own tiles */
const LOGO = 420;
const logoBg = reg(el('div', 'abs')); logoBg.id = 'logoBg'; logoBg.style.width = logoBg.style.height = LOGO + 'px';
const TILE_RECTS = [ // favicon.svg grid (32 units) — the outer eight tiles, then the core with its connectors
  [4.5, 4.5, 6, 6], [21.5, 4.5, 6, 6], [4.5, 21.5, 6, 6], [21.5, 21.5, 6, 6],
  [13.25, 3, 5.5, 7], [13.25, 22, 5.5, 7], [2, 13.25, 7, 5.5], [23, 13.25, 7, 5.5], [9.6, 9.6, 12.8, 12.8],
];
const tiles = TILE_RECTS.map(([x, y, w, h]) => {
  const m = 0.45, u = LOGO / 32, t = reg(el('div', 'abs tile'));
  const r = { x: (x - m) * u, y: (y - m) * u, w: (w + 2 * m) * u, h: (h + 2 * m) * u };
  Object.assign(t.style, { width: r.w + 'px', height: r.h + 'px', borderRadius: 1.4 * u + 'px' });
  const im = el('img', '', t); im.src = '../assets/finatrix-logo.png';
  Object.assign(im.style, { width: LOGO + 'px', height: LOGO + 'px', left: -r.x + 'px', top: -r.y + 'px' });
  return { t, r };
});
const meetWord = reg(el('div', 'abs serif', stage, 'Meet')); Object.assign(meetWord.style, { width: '1080px', textAlign: 'center', fontSize: '96px', color: '#F0D779' });
const wordmark = reg(el('div', 'abs word', stage, 'Finatri<span class="gold">X</span>')); wordmark.style.fontSize = '168px';
const bloom = reg(el('div', 'abs')); Object.assign(bloom.style, { width: '1100px', height: '1100px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(240,215,121,.5), rgba(212,175,55,.14) 35%, rgba(212,175,55,0) 65%)' });
const coreDot = reg(el('div', 'abs')); Object.assign(coreDot.style, { width: '40px', height: '40px', borderRadius: '50%', background: '#FFF6D8', boxShadow: '0 0 60px 30px rgba(240,215,121,.8)' });

/* Product act */
const k7 = kicker('Dashboard · on the web'), h7 = headline(['Your whole month.', '<span class="serif gold">One screen.</span>']);
const B7 = makeScreen(['desk_dash'], { kind: 'browser', w: 980, h: 720 });
const miniCoin = reg(el('div', 'abs')); miniCoin.innerHTML = '<svg viewBox="0 0 100 100" width="150" height="150"><circle cx="50" cy="50" r="48" fill="#D4AF37"/><circle cx="50" cy="50" r="40" fill="none" stroke="#9C7A26" stroke-width="3" opacity=".6"/><text x="50" y="60" text-anchor="middle" font-family="Geist" font-weight="800" font-size="30" fill="#0A0A0A">₹</text></svg>';
const n7 = note('Demo data · the same ₹57,371 left after spending');

const k8 = kicker('Expense Tracker · Quick add'), h8 = headline(['Log it in', '<span class="serif gold">one line.</span>']);
const KEYS = Array.from({ length: 14 }, (_, i) => `exp_key_${String(i).padStart(2, '0')}`);
const P8 = makeScreen([...KEYS, 'exp_added', 'forecast'], { w: 900, h: 1080 });
const bigchips = ['₹340', 'Eating Out', 'Today', 'UPI'].map((t) => reg(el('div', 'abs bigchip', stage, t)));
const n8 = note('Demo data');
const k9 = kicker('Expense Tracker · Analytics'), h9 = headline(['See the month-end', '<span class="serif gold">coming.</span>']);
const n9 = note('A projection from this month’s pace · demo data');

const k10 = kicker('Budget Builder'), h10 = headline(['A budget that', '<span class="serif gold">adds up.</span>']);
const P10 = makeScreen(['budget'], { w: 900, h: 1080 });
const blocks = ['50', '30', '20'].map((t) => reg(el('div', 'abs blk', stage, t)));
const slashes = [0, 1].map(() => reg(el('div', 'abs slash')));
const n10 = note('Demo data · ₹85,000 monthly income');

const k11 = kicker('Reverse Goal Planner'), h11 = headline(['Any goal,', '<span class="serif gold">made monthly.</span>']);
const P11 = makeScreen(['goals_input', 'goals_result'], { w: 900, h: 1080 });
const n11 = note('Illustrative example · returns assumed, not guaranteed');

const k12 = kicker('LifeMap'), h12 = headline(['See the', '<span class="serif gold">long view.</span>']);
const chip12 = reg(el('div', 'abs chip', stage, 'Illustrative model'));
const P12 = makeScreen(['lifemap'], { w: 900, h: 820 });
const n12 = note('A simulation of demo inputs — not a forecast');

const TOOLS = [
  { plate: 'networth', key: 'kpis', word: 'nw', name: 'Net Worth', blurb: 'What you own, minus what you owe.', note: 'Demo data · three demo accounts' },
  { plate: 'invest', key: 'alloc', word: 'invest', name: 'InvestMatch', blurb: 'A portfolio matched to your risk.', note: 'Illustrative allocation · not investment advice' },
  { plate: 'park', key: 'best', word: 'park', name: 'ParkSmart', blurb: 'Best post-tax home for idle cash.', note: 'Indicative rates · ₹1 L for 3–6 months, demo' },
  { plate: 'peer', key: 'ring', word: 'peer', name: 'PeerCompare', blurb: 'See how you stack up against peers.', note: 'Benchmarks are medians · demo profile' },
];
for (const t of TOOLS) {
  t.P = makeScreen([t.plate], { w: 780, h: 1040 });
  t.k = kicker(t.name);
  t.h = headline([t.blurb.replace(/, /, ',<br>')], { size: 92, top: 236 });
  t.h.ins[0].style.whiteSpace = 'normal'; t.h.ins[0].style.lineHeight = '1';
  t.n = note(t.note);
}

const k14 = kicker('finatrix.co'), h14 = headline(['Eight free', '<span class="serif gold">money tools.</span>']);
const B14 = makeScreen(['desk_tools', 'desk_hero'], { kind: 'browser', w: 980, h: 760 });
const markets = ['India', 'US', 'UK', 'UAE'].map((t) => reg(el('div', 'abs mchip', stage, t)));
const h15 = headline(['No account', '<span class="serif gold">needed to start.</span>']);

/* Brand + CTA */
const brandLine = reg(el('div', 'abs')); Object.assign(brandLine.style, { width: '900px', height: '3px', background: 'linear-gradient(90deg, rgba(212,175,55,0), #F0D779 30%, #D4AF37 70%, rgba(212,175,55,0))' });
const tag1 = reg(el('div', 'abs tag', stage, 'See where your money goes.'));
const tag2 = reg(el('div', 'abs tag serif gold', stage, 'Decide what comes next.')); tag2.style.fontSize = '84px';
const comingSoon = reg(el('div', 'abs serif', stage, 'Coming soon to')); Object.assign(comingSoon.style, { width: '1080px', textAlign: 'center', fontSize: '64px', color: '#F5F5F0' });
const svgOf = async (p) => (await (await fetch(p)).text()).replace(/<title>.*?<\/title>/, '');
const badgeApp = reg(el('div', 'abs badge', stage, `${await svgOf('../assets/icon-appstore.svg')}<div><small>Coming soon to the</small><b>App Store</b></div>`));
const badgePlay = reg(el('div', 'abs badge', stage, `${await svgOf('../assets/icon-googleplay.svg')}<div><small>Coming soon to</small><b>Google Play</b></div>`));
const disc = reg(el('div', 'abs disc', stage, 'Educational tools · Illustrative screens · Demo data'));

const vignette = el('div', 'abs full'); vignette.id = 'vignette';
const flash = el('div', 'abs full'); flash.id = 'flash';
stage.appendChild(grain);

/* ── wait for fonts + images, then measure ─────────────────────────────── */
await document.fonts.ready;
await Promise.all([...document.images].map((im) => (im.complete && im.naturalWidth ? null : new Promise((ok, no) => { im.onload = ok; im.onerror = () => no(new Error('image failed: ' + im.src)); }))));
for (const h of [h7, h8, h9, h10, h11, h12, h14, h15, ...hChaos]) fit(h);
fit(hWhere, 960);
for (const t of TOOLS) fit(t.h);
const wordW = wordmark.getBoundingClientRect().width;
const chipW = chip12.getBoundingClientRect().width;
const bApp = badgeApp.getBoundingClientRect().width, bPlay = badgePlay.getBoundingClientRect().width;
const mW = markets.map((m) => m.getBoundingClientRect().width);
const bcW = bigchips.map((m) => m.getBoundingClientRect().width);
const xcW = xchips.map((m) => m.getBoundingClientRect().width);

/* ═══ per-frame paint ═════════════════════════════════════════════════════ */
async function seek(f) {
  paint(f);
  const shown = [...document.images].filter((im) => im.style.visibility !== 'hidden' && im.closest('[style*="visibility: hidden"]') === null);
  for (const im of shown) for (let i = 0; ; i++) { try { await im.decode(); break; } catch (e) { if (i > 20) throw new Error('decode failed ' + im.src); await new Promise((r) => setTimeout(r, 50)); } }
}
function paint(f) {
  hide(...all);
  for (const P of [B7, P8, P10, P11, P12, B14, ...TOOLS.map((t) => t.P)]) resetScreen(P);
  for (const t of tiles) hide(t.t);
  paintGrain(f + 1);
  setMotionBlur(0);
  // Backgrounds: paper world until the iris, then the brand dark.
  const irisT = R(f, 262, 277, E.inCubic);
  put(paper, { o: f < 280 ? 1 : 0 });
  iris.style.clipPath = `circle(${irisT * 2300}px at 540px 820px)`;
  put(iris, { o: f >= 262 ? 1 : 0 });
  glow.style.opacity = f < 270 ? 0 : 0.55;
  vignette.style.opacity = f < 270 ? 0.25 : 1;
  put(flash, { o: 0 });

  if (f < SC.chaos[0] + 12) actOne(f);
  if (inScene(f, 'chaos', 0, 4)) chaos(f);
  if (inScene(f, 'meet', 6, 6)) meet(f);
  if (inScene(f, 'month', 2, 0)) month(f);
  if (inScene(f, 'quick', 2, 0) || inScene(f, 'forecast')) quickAndForecast(f);
  if (inScene(f, 'budget', 0, 2)) budget(f);
  if (inScene(f, 'goals', 2, 0)) goals(f);
  if (inScene(f, 'long')) long(f);
  if (inScene(f, 'tools', 4, 0)) tools(f);
  if (inScene(f, 'eight', 2, 0) || inScene(f, 'free')) website(f);
  if (f >= SC.brand[0] - 8) brand(f);
}

/* ── act one ──────────────────────────────────────────────────────────── */
const COIN = { x: 540, y: 880 };
function coinAt(f) {
  // Where the coin sits: centre stage, then up a little to make room for receipts.
  const up = R(f, 150, 166, E.inOutCubic);
  return { x: COIN.x, y: lerp(COIN.y, 800, up) + Math.sin(f / 9) * 8 };
}
function actOne(f) {
  // PAYDAY — readable on frame one, slams, then lifts away as the coin arrives.
  const slam = R(f, 0, 6, E.outExpo), lift = R(f, 28, 40, E.inCubic);
  put(payday, { x: 0, y: 560 - lift * 420, s: lerp(1.1, 1, slam) * lerp(1, 0.6, lift), o: 1 - lift, origin: '50% 50%' });
  put(underline, { x: 160, y: 830 - lift * 420, sx: R(f, 3, 12, E.outExpo), o: 1 - lift });
  const ni = R(f, 9, 18, E.outBack), no = R(f, 30, 38, E.inCubic);
  put(notif, { x: 160, y: lerp(-200, 980, ni) + no * -40, s: lerp(1, 0.4, no), o: Math.min(ni * 3, 1) * (1 - no), origin: '50% 50%' });

  // The coin: pops on "eighty-five thousand", wobbles, looks around, gets bitten.
  if (f >= 30 && f < 280) {
    const c = coinAt(f), pop = R(f, 31, 42, E.outBack);
    const out = R(f, 262, 276, E.inCubic);
    const squash = 1 + 0.06 * Math.sin(f / 5) * R(f, 42, 60) * (1 - R(f, 60, 80));
    put(coin, { x: c.x - 280, y: c.y - 280, sx: pop * squash * (1 - out * 0.4), sy: pop / squash * (1 - out * 0.4), o: 1 - out, origin: '50% 50%', r: Math.sin(f / 13) * 2 });
    put(coinShadow, { x: c.x - 210, y: COIN.y + 300, s: pop * (0.95 + Math.sin(f / 9) * 0.05), o: 0.9 * (1 - out) });
    // eyes: blink, glance left/right while asking "where did it go", worried at the end
    const blink = [58, 136, 230].some((b) => f >= b && f < b + 4) ? 0.12 : 1;
    eyeL.setAttribute('transform', `translate(208 214) scale(1 ${blink}) translate(-208 -214)`);
    eyeR.setAttribute('transform', `translate(352 214) scale(1 ${blink}) translate(-352 -214)`);
    const look = f < 96 ? 0 : f < 150 ? Math.sin((f - 96) / 7) : 0;
    const worried = R(f, 245, 255);
    const px = look * 14, py = lerp(0, 12, worried);
    pupL.setAttribute('cx', 212 + px); pupR.setAttribute('cx', 356 + px); pupL.setAttribute('cy', 222 + py); pupR.setAttribute('cy', 222 + py);
    mouth.setAttribute('d', worried > 0.5 ? 'M250 306 Q280 290 310 306' : 'M246 292 Q280 318 314 292');
    // Bites: each expense chip flies to the rim, takes its bite, then drops into the receipt list.
    let left = 85000;
    BITES.forEach(([w, , a, , ang, br], i) => {
      const hit = WD[w];
      const bt = R(f, hit, hit + 4, E.outBack);
      const rad = (ang * Math.PI) / 180;
      biteEls[i].setAttribute('cx', 280 + Math.cos(rad) * 292); biteEls[i].setAttribute('cy', 280 + Math.sin(rad) * 292);
      biteEls[i].setAttribute('r', br * bt);
      if (f >= hit) left -= a;
      // chip path: enters from the side 6 frames early, touches the rim, falls to its slot
      const ch = xchips[i], cw = xcW[i];
      const rim = { x: c.x + Math.cos(rad) * 300, y: c.y + Math.sin(rad) * 300 };
      const from = { x: i % 2 ? 1200 : -cw - 100, y: rim.y };
      const slot = { x: 540 - cw / 2, y: 1200 + i * 92 };
      const tIn = R(f, hit - 7, hit, E.inCubic), tOut = R(f, hit + 3, hit + 13, E.outCubic);
      const p = f < hit ? { x: lerp(from.x, rim.x - cw / 2, tIn), y: lerp(from.y, rim.y - 40, tIn) } : { x: lerp(rim.x - cw / 2, slot.x, tOut), y: lerp(rim.y - 40, slot.y, tOut) };
      put(ch, { x: p.x, y: p.y, o: f >= hit - 7 ? 1 - out : 0, r: (1 - tOut) * (i % 2 ? -8 : 8) * (f >= hit ? 1 : 0) });
    });
    amt.textContent = '₹' + left.toLocaleString('en-IN');
    // crumbs
    crumbs.forEach((cr, j) => {
      const i = j % 5, hit = WD[BITES[i][0]], t = R(f, hit, hit + 14);
      if (t <= 0 || t >= 1) return;
      const rnd = rng(j * 31 + 7), rad = (BITES[i][4] * Math.PI) / 180;
      const vx = Math.cos(rad) * (8 + rnd() * 10) + (rnd() - 0.5) * 10, vy = Math.sin(rad) * (8 + rnd() * 10) - 6;
      const k = (f - hit);
      put(cr, { x: c.x + Math.cos(rad) * 280 + vx * k, y: c.y + Math.sin(rad) * 280 + vy * k + 0.9 * k * k, s: 1 - t, o: 1 - t });
    });
  }
  // "Two weeks later…" and the day counter, then the question.
  const tw = R(f, 90, 99, E.outExpo), two = R(f, 116, 122, E.inCubic);
  put(twoWeeks, { y: 230 + (1 - tw) * 40 - two * 40, o: tw * (1 - two) });
  const day = Math.round(lerp(1, 14, R(f, 95, 113, E.inOutSine)));
  dayCounter.textContent = `DAY ${String(day).padStart(2, '0')}`;
  put(dayCounter, { y: 380, o: R(f, 95, 99) * (1 - two) });
  showHL(hWhere, f, 118, 258);
}

/* ── chaos ────────────────────────────────────────────────────────────── */
function chaos(f) {
  const suck = R(f, 362, 389, E.inExpo);
  CH.forEach(({ e, at, x, y, z, rx, ry, rz }, i) => {
    const a = R(f, at, at + 9, E.outBack);
    if (f < at - 1) return;
    const drift = (f - at) * 0.6;
    const thud = e === sheet ? R(f, WD.stopped, WD.stopped + 8, E.inCubic) : 0;
    const bw = e.offsetWidth, bh = e.offsetHeight;
    const cx = x + bw / 2, cy = y + bh / 2;
    const tx = lerp(cx, 540, suck) - bw / 2, ty = lerp(cy + thud * 180, 900, suck) - bh / 2;
    put(e, { x: tx, y: ty, z: lerp(-900, z, a) + drift * 2, rx: rx * (1 - suck), ry: ry + (1 - a) * 40, r: rz + suck * 220 * (i % 2 ? 1 : -1) + thud * 9,
      s: (1 - suck) * lerp(0.6, 1, a), o: Math.min(1, a * 2) * (e === sheet ? 1 - thud * 0.5 : 1), persp: 1400, origin: '50% 50%' });
    if (e === sheet) e.style.filter = `grayscale(${thud}) brightness(${1 - thud * 0.45})`;
  });
  // Big words for each phrase.
  showHL(hChaos[0], f, WD.bankTexts, WD.screenshots - 6);
  showHL(hChaos[1], f, WD.screenshots, WD.spreadsheet - 6);
  showHL(hChaos[2], f, WD.spreadsheet, 360);
  // The pile collapses into a point of gold light.
  const d = R(f, 366, 390);
  put(coreDot, { x: 520, y: 880, s: lerp(0, 1.6, E.inExpo(d)), o: d > 0 ? 1 : 0, origin: '50% 50%' });
  dust.forEach((p, i) => {
    const rnd = rng(i * 13 + 3), ang = rnd() * Math.PI * 2, r0 = 300 + rnd() * 700, t = R(f, 360 + rnd() * 10, 390, E.inCubic);
    if (t <= 0) return;
    put(p, { x: 540 + Math.cos(ang + t * 2) * r0 * (1 - t), y: 900 + Math.sin(ang + t * 2) * r0 * (1 - t), o: t < 1 ? Math.min(1, t * 3) : 0 });
  });
}

/* ── meet FinatriX ────────────────────────────────────────────────────── */
const LOGO_AT = { x: 540, y: 760 };
function meet(f) {
  const t0 = SC.meet[0] + 3; // 390, the drop
  logoBg.style.width = logoBg.style.height = LOGO + 'px'; logoBg.style.backgroundImage = 'none';
  wordmark.style.fontSize = '168px';
  put(flash, { o: f === t0 ? 0.55 : f === t0 + 1 ? 0.2 : 0 });
  const out = R(f, 443, 453, E.inCubic);
  const b = R(f, t0, t0 + 10, E.outCubic);
  put(bloom, { x: LOGO_AT.x - 550, y: LOGO_AT.y - 550, s: lerp(0.3, 1.1, b), o: b * (1 - R(f, 410, 445) * 0.6) * (1 - out) });
  const u = 1; // tiles carry their own scale
  tiles.forEach(({ t, r }, i) => {
    const rnd = rng(i * 97 + 11), at = t0 + 1 + i * 1.6;
    const p = R(f, at, at + 11, E.outBack);
    const sx = (rnd() - 0.5) * 1500, sy = (rnd() - 0.5) * 1700, rot = (rnd() - 0.5) * 220;
    const lx = LOGO_AT.x - LOGO / 2 + r.x, ly = LOGO_AT.y - LOGO / 2 + r.y;
    put(t, { x: lerp(lx + sx, lx, p) * u, y: lerp(ly + sy, ly, p) - out * 300, r: rot * (1 - p), s: lerp(2.2, 1, p) * (1 - out * 0.5), o: f >= at ? 1 - out : 0, origin: '50% 50%' });
  });
  const bgIn = R(f, 404, 413, E.outCubic);
  put(logoBg, { x: LOGO_AT.x - LOGO / 2, y: LOGO_AT.y - LOGO / 2 - out * 300, s: lerp(0.9, 1, bgIn) * (1 - out * 0.5), o: bgIn * (1 - out), origin: '50% 50%' });
  fadeText(meetWord, f, 391, 440, { y: 470, dy: 30 });
  const wi = R(f, 401, 413, E.outExpo);
  wordmark.style.clipPath = `inset(-20% ${(1 - wi) * 100}% -20% 0)`;
  put(wordmark, { x: (W - wordW) / 2 + (1 - wi) * -40, y: 1040 - out * 300, o: wi > 0 ? 1 - out : 0 });
  put(coreDot, { x: 520, y: 880, s: 1.6 * (1 - R(f, t0, t0 + 6)), o: f < t0 + 6 ? 1 : 0, origin: '50% 50%' });
}

/* ── product: dashboard on the web ───────────────────────────────────── */
function month(f) {
  const a = SC.month[0];
  showHL(h7, f, a + 1, SC.month[1] - 7);
  fadeText(k7, f, a + 1, SC.month[1] - 7, { y: 172 });
  const enter = R(f, a - 2, a + 12, E.outExpo), ex = R(f, SC.month[1] - 6, SC.month[1] + 1, E.inCubic);
  place(B7, { x: 540 - ex * 1300, y: 1010, ry: lerp(-32, -5, enter) + R(f, a + 12, SC.month[1]) * 4, s: lerp(0.86, 1, enter), o: enter > 0 ? 1 : 0, rx: 4 * (1 - enter) });
  const hero = box('desk_dash', 'hero'), left = box('desk_dash', 'left'), kpis = box('desk_dash', 'kpis');
  const push = R(f, a + 20, a + 40, E.inOutCubic);
  const z0 = B7.S.w / (hero.w + 40), z1 = B7.S.w / (kpis.w + 60);
  const cam = { cx: lerp(hero.x + hero.w / 2, kpis.x + kpis.w / 2, push), cy: lerp(hero.y + hero.h / 2 + 130, kpis.y + kpis.h / 2, push), z: lerp(z0, z1, push) };
  paintLayers(B7, [{ plate: 'desk_dash', cam }]);
  paintFocus(B7, cam, left, R(f, a + 40, a + 44, E.outCubic) * (1 - ex), 0.5, 10);
  // The coin's ₹57,371 lands in the matching tile.
  const ct = R(f, a + 28, a + 42, E.inOutCubic), cb = R(f, a + 42, a + 50);
  const tgt = scrToStage(B7, { x: 540, y: 1010 }, toScr(B7, cam, centre(left)));
  put(miniCoin, { x: lerp(540, tgt.x, ct) - 75, y: lerp(1720, tgt.y, ct) - 75 - Math.sin(ct * Math.PI) * 160, s: lerp(1, 0.4, ct) * (1 + cb), o: f >= a + 28 ? 1 - cb : 0, r: ct * 360, origin: '50% 50%' });
  fadeText(n7, f, a + 44, SC.month[1] - 7, { y: 1606 });
}

/* ── product: Quick add, then the month-end forecast ─────────────────── */
function quickAndForecast(f) {
  const a = SC.quick[0], fa = SC.forecast[0], fb = SC.forecast[1];
  const enter = R(f, a - 2, a + 9, E.outExpo), ex = R(f, fb - 7, fb + 1, E.inCubic);
  place(P8, { y: 1080 + (1 - enter) * 1400, rx: (1 - enter) * 20, x: 540 + ex * 1300, ry: ex * 30 });
  const card = box('exp_typed', 'card'), qa = box('exp_typed', 'qa'), add = box('exp_typed', 'add');
  const push = R(f, a, a + 40, E.inOutSine);
  const camA = { cx: 195, cy: lerp(card.y + card.h / 2, qa.y + qa.h / 2 + 30, push), z: (P8.S.w / 372) * lerp(1, 1.2, push) };
  const key = f < 530 ? 0 : clamp(Math.floor((f - 530) / 2) + 1, 1, 13);
  const plateA = f >= 599 ? 'exp_added' : KEYS[key];
  // Whip to the forecast (vertical, with motion blur).
  const w = R(f, fa - 2, fa + 5, E.inOutCubic);
  const fc = box('forecast', 'card'), fig = box('forecast', 'figure'), adv = box('forecast', 'advice');
  const camB = { cx: 195, cy: fc.y + fc.h / 2 + 4, z: P8.S.w / 372 };
  const layers = [];
  if (w < 1) layers.push({ plate: plateA, cam: camA, dy: -w * P8.S.h, blur: w * (1 - w) * 30 });
  if (w > 0) layers.push({ plate: 'forecast', cam: camB, dy: (1 - w) * P8.S.h, blur: w * (1 - w) * 30 });
  paintLayers(P8, layers);
  if (f < fa) {
    paintRipple(P8, camA, centre(add), R(f, 597, 607));
    paintFocus(P8, camA, add, f >= 599 ? R(f, 599, 602) * (1 - R(f, 616, 620)) : 0, 0, 20);
    // The parse, popped out of the phone: the four chips the app showed.
    const row = { x: qa.x + 10, y: qa.y + qa.h - 26 };
    const origin = scrToStage(P8, { x: 540, y: 1080 }, toScr(P8, camA, row));
    const dest = [{ x: 90, y: 1300 }, { x: 330, y: 1300 }, { x: 90, y: 1420 }, { x: 330, y: 1420 }];
    bigchips.forEach((c, i) => {
      const t0 = 571 + i * 5, p = R(f, t0, t0 + 9, E.outBack), back = R(f, 592, 598, E.inCubic);
      const d = { x: i === 1 ? 90 + bcW[0] + 24 : i === 3 ? 90 + bcW[2] + 24 : 90, y: dest[i].y };
      put(c, { x: lerp(origin.x + i * 60, d.x, p), y: lerp(origin.y, d.y, p) + back * 60, s: lerp(0.3, 1, p) * (1 - back * 0.3), o: f >= t0 ? 1 - back : 0, z: 0, ry: (1 - p) * -30, persp: 1600 });
    });
    showHL(h8, f, a + 1, fa - 6);
    fadeText(k8, f, a + 1, fa - 6, { y: 172 });
    fadeText(n8, f, a + 8, fa - 6, { y: 1606 });
  } else {
    paintFocus(P8, camB, f < 668 ? fig : adv, R(f, 646, 650, E.outCubic) * (1 - ex), 0.5, 10);
    showHL(h9, f, fa + 1, fb - 6);
    fadeText(k9, f, fa + 1, fb - 6, { y: 172 });
    fadeText(n9, f, fa + 8, fb - 6, { y: 1606 });
  }
}

/* ── product: Budget Builder and 50 / 30 / 20 ────────────────────────── */
function budget(f) {
  const a = SC.budget[0], b = SC.budget[1];
  const s = box('budget', 'split');
  const enter = R(f, a - 2, a + 9, E.outExpo), ex = R(f, b - 6, b + 2, E.inCubic);
  const recede = R(f, 783, 792, E.inOutCubic) * (1 - R(f, 818, 828, E.inOutCubic));
  place(P10, { x: 540 - (1 - enter) * 1300, ry: (1 - enter) * -30, s: 1 - recede * 0.1, o: 1 - ex, y: 1080 });
  P10.dev.style.filter = recede > 0 ? `brightness(${1 - recede * 0.6})` : 'none';
  const pan = R(f, a, 778, E.inOutSine);
  const cam = { cx: 195, cy: lerp(s.y - 170, s.y + s.h / 2 - 6, pan), z: P10.S.w / 372 * 1.02 };
  paintLayers(P10, [{ plate: 'budget', cam }]);
  showHL(h10, f, a + 1, b - 6);
  fadeText(k10, f, a + 1, b - 6, { y: 172 });
  // Blocks on "fifty", "thirty", "twenty"; then they land on the real fields.
  const BW = 270, BH = 400, BY = 760, GAP = 45, FS = 230;
  const bx = (i) => 90 + i * (BW + GAP);
  const m = R(f, 823, 833, E.inOutCubic), settle = R(f, 833, 838);
  const appFont = 17 * cam.z;
  ['pn', 'pw', 'ps'].forEach((k, i) => {
    const hit = [WD.fifty, WD.thirty, WD.twenty][i];
    const tIn = R(f, hit - 1, hit + 4, E.outExpo);
    const r = rectToScr(P10, cam, box('budget', k));
    const at = scrToStage(P10, { x: 540, y: 1080 }, r);
    const el = blocks[i];
    Object.assign(el.style, { width: lerp(BW, r.w, m) + 'px', height: lerp(BH, r.h, m) + 'px', fontSize: lerp(FS, appFont, m) + 'px', borderRadius: lerp(44, 10 * cam.z, m) + 'px', color: '#F5F5F0' });
    put(el, { x: lerp(bx(i), at.x, m), y: lerp(BY + (1 - tIn) * 70, at.y, m), s: lerp(1.25, 1, tIn), o: tIn * (1 - settle), origin: '50% 50%' });
  });
  slashes.forEach((sl, i) => {
    const hit = [WD.thirty, WD.twenty][i], al = R(f, hit - 1, hit + 4, E.outExpo) * (1 - R(f, 821, 826));
    put(sl, { x: bx(i + 1) - GAP / 2 - 3, y: BY + 90, r: 18, o: al });
  });
  const bar = { x: s.x + 24, y: box('budget', 'pn').y + 52, w: s.w - 48, h: 70 };
  if (f >= 829) paintReveal(P10, cam, bar, R(f, 830, 845, E.inOutCubic), 1 - R(f, 843, 848));
  fadeText(n10, f, 836, b - 6, { y: 1606 });
}

/* ── product: goals ───────────────────────────────────────────────────── */
function goals(f) {
  const a = SC.goals[0], b = SC.goals[1];
  const enter = R(f, a - 2, a + 8, E.outExpo), reset = R(f, b - 6, b + 1, E.inExpo);
  place(P11, { x: 540 + (1 - enter) * 1300, ry: (1 - enter) * 30, s: 1 - reset * 0.2, o: 1 - reset, y: 1080 });
  const tgt = box('goals_input', 'target'), yrs = box('goals_input', 'years'), cta = box('goals_input', 'cta');
  const z = P11.S.w / 372 * 1.08, half = P11.S.h / 2 / z;
  const camIn = { cx: 195, cy: lerp(tgt.y + 40, (tgt.y + cta.y + cta.h) / 2 + 10, R(f, a, 876, E.inOutSine)), z };
  const title = box('goals_result', 'title'), ag = box('goals_result', 'aggressive');
  const camOut = { cx: 195, cy: title.y - 40 + half, z };
  const swap = f >= 880;
  paintLayers(P11, [swap ? { plate: 'goals_result', cam: camOut } : { plate: 'goals_input', cam: camIn }]);
  if (!swap) {
    paintFocus(P11, camIn, lerpRect(tgt, yrs, R(f, 866, 870, E.outQuart)), R(f, 856, 860, E.outCubic) * (1 - R(f, 874, 877)), 0.5, 12);
    paintRipple(P11, camIn, centre(cta), R(f, 878, 886));
  } else {
    paintSheen(P11, R(f, 880, 889));
    paintFocus(P11, camOut, { x: ag.x + 20, y: ag.y + 110, w: 146, h: 80 }, R(f, 886, 890, E.outCubic) * (1 - reset), 0.4, 12);
  }
  showHL(h11, f, a + 1, b - 6);
  fadeText(k11, f, a + 1, b - 6, { y: 172 });
  fadeText(n11, f, 884, b - 6, { y: 1606 });
}

/* ── product: the long view ───────────────────────────────────────────── */
function long(f) {
  const a = SC.long[0], b = SC.long[1];
  const enter = R(f, a, a + 12, E.outExpo), out = R(f, b - 8, b, E.inCubic);
  const chart = box('lifemap', 'chart'), canvas = box('lifemap', 'canvas');
  const drift = R(f, a, b, E.inOutSine);
  const cam = { cx: 195, cy: lerp(chart.y + chart.h / 2 + 24, chart.y + chart.h / 2 + 4, drift), z: P12.S.w / 372 * lerp(1.03, 1.12, drift) };
  place(P12, { y: 1000 + (1 - enter) * 240, s: lerp(0.88, 1, enter) * (1 - out * 0.15), o: enter * (1 - out), rx: lerp(18, 4, enter) - drift * 4 });
  paintLayers(P12, [{ plate: 'lifemap', cam }]);
  const plot = { x: canvas.x + 34, y: canvas.y, w: canvas.w - 36, h: canvas.h - 20 };
  paintReveal(P12, cam, plot, f < a + 8 ? 0 : R(f, a + 8, a + 50, E.inOutSine), 1 - R(f, a + 48, a + 54));
  showHL(h12, f, a + 1, b - 8);
  fadeText(k12, f, a + 1, b - 8, { y: 172 });
  const ca = R(f, a + 10, a + 18, E.outExpo) * (1 - R(f, b - 8, b - 2));
  put(chip12, { x: 990 - chipW, y: 160 + (1 - ca) * 14, o: ca });
  fadeText(n12, f, a + 14, b - 8, { y: 1606 });
}

/* ── product: the rest of the toolkit, as a carousel ─────────────────── */
function tools(f) {
  const a = SC.tools[0], b = SC.tools[1];
  const starts = TOOLS.map((t) => WD[t.word] - 5);
  // Carousel angle: one 90° step per phrase, eased over 8 frames.
  let k = 0;
  for (let i = 1; i < 4; i++) k += R(f, starts[i] - 6, starts[i] + 2, E.inOutCubic);
  const enter = R(f, a - 4, a + 8, E.outExpo), ex = R(f, b - 7, b + 1, E.inCubic);
  TOOLS.forEach((t, i) => {
    const th = (i - k) * 40; // degrees around the ring
    const rad = (th * Math.PI) / 180, RAD = 660;
    const x = 540 + Math.sin(rad) * RAD, zz = (Math.cos(rad) - 1) * RAD;
    const front = clamp(1 - Math.abs(i - k));
    place(t.P, { x: x + (1 - enter) * 1200 - ex * 1200, y: 1090, z: zz, ry: th, o: Math.abs(i - k) < 1.8 ? 1 : 0 });
    t.P.dev.style.filter = `brightness(${0.3 + 0.7 * front}) blur(${(1 - front) * 3}px)`;
    t.P.dev.style.zIndex = String(Math.round(front * 10));
    const bx = box(t.plate, t.key);
    const cam = { cx: 195, cy: bx.y + bx.h / 2, z: t.P.S.w / 372 * 1.02 };
    paintLayers(t.P, [{ plate: t.plate, cam }]);
    const on = i === 0 ? a : starts[i], off = i === 3 ? b - 6 : starts[i + 1] - 6;
    showHL(t.h, f, on, off);
    fadeText(t.k, f, on, off, { y: 172 });
    fadeText(t.n, f, on + 6, off, { y: 1606 });
  });
}

/* ── the website: eight tools, four markets, no account ──────────────── */
function website(f) {
  const a = SC.eight[0], m = SC.free[0], b = SC.free[1];
  const enter = R(f, a - 2, a + 12, E.outExpo), ex = R(f, b - 6, b + 2, E.inCubic);
  const sw = R(f, m - 3, m + 4, E.inOutCubic);
  place(B14, { y: 990, ry: lerp(28, 4, enter) - R(f, a, b) * 6, rx: 3, s: lerp(0.85, 1, enter) * (1 - ex * 0.1), o: (enter > 0 ? 1 : 0) * (1 - ex) });
  const sec = box('desk_tools', 'section');
  const zt = B14.S.w / 860;
  const pan = R(f, a + 6, m - 6, E.inOutSine);
  const camT = { cx: 580, cy: lerp(300, 960, pan), z: zt };
  const hero = box('desk_hero', 'h1'), prev = box('desk_hero', 'preview');
  const camH = { cx: (hero.x + prev.x + prev.w) / 2, cy: 380, z: B14.S.w / (prev.x + prev.w - hero.x + 80) };
  const layers = [];
  if (sw < 1) layers.push({ plate: 'desk_tools', cam: camT, dx: -sw * B14.S.w, mb: sw > 0 && sw < 1 });
  if (sw > 0) layers.push({ plate: 'desk_hero', cam: camH, dx: (1 - sw) * B14.S.w, mb: sw < 1 });
  setMotionBlur(sw > 0 && sw < 1 ? 40 * Math.sin(sw * Math.PI) : 0);
  paintLayers(B14, layers);
  if (f < m) {
    showHL(h14, f, a + 1, m - 6);
    fadeText(k14, f, a + 1, b - 6, { y: 172 });
    let x = 90;
    markets.forEach((c, i) => {
      const hit = [WD.india, WD.us, WD.uk, WD.uae][i], p = R(f, hit - 1, hit + 6, E.outBack), out = R(f, m - 6, m, E.inCubic);
      put(c, { x, y: 1460 + (1 - p) * 40 - out * 30, s: lerp(0.6, 1, p), o: f >= hit - 1 ? 1 - out : 0, origin: '0 50%' });
      x += mW[i] + 20;
    });
  } else {
    showHL(h15, f, m + 1, b - 6);
    fadeText(k14, f, a + 1, b - 6, { y: 172 });
  }
}

/* ── brand and the coming-soon card ───────────────────────────────────── */
function brand(f) {
  const a = SC.brand[0] + 6; // 1441, the brand hit
  glow.style.opacity = 0.4 + 0.4 * R(f, a, a + 20, E.outCubic);
  const ICON = 300, iy = 420;
  const lt = R(f, a, a + 7, E.outExpo), lo = R(f, a + 8, a + 16, E.inCubic);
  put(brandLine, { x: 90, y: iy + ICON / 2, sx: lt * (1 - lo * 0.9), sy: 1 + lo * 2, o: f >= a ? 1 - lo : 0, origin: '50% 50%' });
  const bl = R(f, a + 2, a + 14, E.outCubic);
  put(bloom, { x: 540 - 550, y: iy + ICON / 2 - 550, s: lerp(0.3, 1.05, bl), o: bl * (1 - R(f, a + 14, a + 40) * 0.75) });
  const li = R(f, a + 3, a + 14, E.outExpo);
  logoBg.style.width = logoBg.style.height = ICON + 'px';
  put(logoBg, { x: 540 - ICON / 2, y: iy + (1 - li) * 30, s: lerp(0.82, 1, li), o: li, origin: '50% 50%' });
  logoBg.style.backgroundImage = 'url(../assets/finatrix-logo.png)'; logoBg.style.backgroundSize = 'cover';
  const wi = R(f, a + 8, a + 20, E.outExpo);
  wordmark.style.fontSize = '176px';
  wordmark.style.clipPath = `inset(-20% ${(1 - wi) * 100}% -20% 0)`;
  put(wordmark, { x: (W - wordW * 176 / 168) / 2, y: 770, o: wi > 0 ? 1 : 0 });
  const tg = (e, at, y) => { const p = R(f, at, at + 9, E.outExpo); put(e, { y: y + (1 - p) * 26, o: p }); };
  tg(tag1, WD.tagSee - 2, 1000); tg(tag2, WD.tagDecide - 2, 1078);
  const bw = bApp + bPlay + 30, bx = (W - bw) / 2;
  const pa = R(f, 1558, 1568, E.outBack), pp = R(f, 1566, 1576, E.outBack);
  put(badgeApp, { x: bx, y: 1250 + (1 - pa) * 60, o: Math.min(1, pa * 2) });
  put(badgePlay, { x: bx + bApp + 30, y: 1250 + (1 - pp) * 60, o: Math.min(1, pp * 2) });
  tg(disc, 1580, 1590);
}

window.FILM = { frames: TL.frames, fps: TL.fps, seek, ready: true };
document.title = 'ready';
