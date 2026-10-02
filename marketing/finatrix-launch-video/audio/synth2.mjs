// Score, sound design and narration mix for the 56.6 s film. Original music
// synthesized from code (no samples); the narration lines come from vo/48k
// (Kokoro-82M, see vo/README.md). Everything is placed from src/timeline2.json.
//   node audio/synth2.mjs → audio/mix2.wav (48 kHz stereo float, pre-master)
//                         + audio/stems2/{music,sfx,vo}.wav for inspection
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, '..');
const TL = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/timeline2.json'), 'utf8'));
const EXT = JSON.parse(fs.readFileSync(path.join(ROOT, 'vo/extents.json'), 'utf8'));
const SR = 48000, DUR = TL.frames / TL.fps, N = Math.round(DUR * SR);
const BEAT = 60 / TL.bpm, bT = (b) => b * BEAT, fT = (f) => f / TL.fps;
const TAU = Math.PI * 2, mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

/* ── buses ────────────────────────────────────────────────────────────── */
const bus = () => ({ L: new Float32Array(N), R: new Float32Array(N) });
const music = bus(), drums = bus(), sfx = bus(), vo = bus(), send = bus();
let seed = 20261002;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const noise = () => rnd() * 2 - 1;
function write(b, i, l, r) { if (i >= 0 && i < N) { b.L[i] += l; b.R[i] += r; } }
function voice(b, t0, len, fn, { gain = 1, pan = 0, sendAmt = 0 } = {}) {
  const i0 = Math.round(t0 * SR), n = Math.round(len * SR);
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2, gr = gain * Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
  for (let k = 0; k < n; k++) {
    const v = fn(k / SR, k);
    write(b, i0 + k, v * gl, v * gr);
    if (sendAmt) write(send, i0 + k, v * gl * sendAmt, v * gr * sendAmt);
  }
}
function biquad(type, f, q, gainDb = 0) {
  let b0, b1, b2, a1, a2, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const set = (f, q) => {
    const w = TAU * Math.min(f, SR * 0.45) / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q), A = Math.pow(10, gainDb / 40);
    let B0, B1, B2, A0, A1, A2;
    if (type === 'lp') { B0 = (1 - c) / 2; B1 = 1 - c; B2 = (1 - c) / 2; A0 = 1 + al; A1 = -2 * c; A2 = 1 - al; }
    else if (type === 'hp') { B0 = (1 + c) / 2; B1 = -(1 + c); B2 = (1 + c) / 2; A0 = 1 + al; A1 = -2 * c; A2 = 1 - al; }
    else if (type === 'peak') { B0 = 1 + al * A; B1 = -2 * c; B2 = 1 - al * A; A0 = 1 + al / A; A1 = -2 * c; A2 = 1 - al / A; }
    else { B0 = al; B1 = 0; B2 = -al; A0 = 1 + al; A1 = -2 * c; A2 = 1 - al; }
    b0 = B0 / A0; b1 = B1 / A0; b2 = B2 / A0; a1 = A1 / A0; a2 = A2 / A0;
  };
  set(f, q);
  const run = (x) => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  run.set = set;
  return run;
}
const decay = (t, tau) => Math.exp(-t / tau), attack = (t, a) => Math.min(1, t / a);
function saw(freq) { let ph = rnd(); return () => { ph += freq / SR; ph -= Math.floor(ph); return 2 * ph - 1; }; }

/* ── instruments ──────────────────────────────────────────────────────── */
function kick(t0, g = 1) {
  let ph = 0;
  voice(drums, t0, 0.45, (t) => { ph += (46 + 120 * Math.exp(-t / 0.032)) / SR; return Math.tanh(1.7 * (Math.sin(TAU * ph) * decay(t, 0.16) + (t < 0.004 ? noise() * (1 - t / 0.004) * 0.4 : 0))); }, { gain: 0.8 * g });
}
function clap(t0, g = 1) {
  const bp = biquad('bp', 1600, 0.9);
  voice(drums, t0, 0.3, (t) => bp(noise()) * ([0, 0.011, 0.022].reduce((a, o) => a + (t >= o ? decay(t - o, 0.006) : 0), 0) * 0.7 + decay(t, 0.09) * 0.5), { gain: 0.4 * g, sendAmt: 0.25 });
}
function hat(t0, g = 1, open = false, pan = 0.15) {
  const hp = biquad('hp', 7800, 0.7);
  voice(drums, t0, open ? 0.22 : 0.06, (t) => hp(noise()) * decay(t, open ? 0.07 : 0.016), { gain: 0.15 * g, pan });
}
function shaker(t0, g = 1) {
  const bp = biquad('bp', 6000, 1.2);
  voice(drums, t0, 0.09, (t) => bp(noise()) * Math.sin(Math.PI * Math.min(1, t / 0.09)), { gain: 0.12 * g, pan: -0.3 });
}
function pluck(t0, m, g = 1, pan = 0) {
  // Marimba-ish: sine + inharmonic overtone, fast decay.
  const f = mtof(m);
  voice(music, t0, 0.5, (t) => (Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * f * 3.98 * t) * decay(t, 0.03)) * decay(t, 0.16) * attack(t, 0.002), { gain: 0.16 * g, pan, sendAmt: 0.25 });
}
function pad(t0, t1, midis, g = 1, rel = 0.4, cutoff = 1500) {
  const len = t1 - t0 + rel;
  midis.forEach((m, j) => {
    const o = [saw(mtof(m) * 0.997), saw(mtof(m) * 1.003)], lp = biquad('lp', cutoff, 0.6);
    voice(music, t0, len, (t) => lp((o[0]() + o[1]()) * 0.5) * attack(t, 0.12) * (t > t1 - t0 ? decay(t - (t1 - t0), rel / 3) : 1),
      { gain: 0.045 * g, pan: (j / Math.max(1, midis.length - 1) - 0.5) * 0.8, sendAmt: 0.35 });
  });
}
function bassNote(t0, len, m, g = 1, tau = len * 0.9) {
  const o = saw(mtof(m)), lp = biquad('lp', 300, 0.9); let ph = 0;
  voice(music, t0, len, (t) => { lp.set(170 + 900 * Math.exp(-t / 0.05), 0.9); ph += mtof(m) / SR; return (lp(o()) * 0.7 + Math.sin(TAU * ph) * 0.6) * attack(t, 0.003) * decay(t, tau); }, { gain: 0.4 * g });
}
function sub(t0, f0 = 55, len = 0.9, g = 1) {
  let ph = 0;
  voice(sfx, t0, len, (t) => { ph += (f0 * (1 + 0.6 * Math.exp(-t / 0.05))) / SR; return Math.sin(TAU * ph) * decay(t, len / 3.2) * attack(t, 0.002); }, { gain: 0.85 * g });
}
function impact(t0, g = 1) {
  sub(t0, 46, 1.1, g);
  const lp = biquad('lp', 2400, 0.8);
  voice(sfx, t0, 0.5, (t) => { lp.set(300 + 2400 * Math.exp(-t / 0.03), 0.8); return lp(noise()) * decay(t, 0.07); }, { gain: 0.5 * g, sendAmt: 0.15 });
  voice(sfx, t0, 0.012, (t) => noise() * (1 - t / 0.012), { gain: 0.3 * g });
}
function snap(t0, g = 1) { const bp = biquad('bp', 3200, 1.2); voice(sfx, t0, 0.06, (t) => bp(noise()) * decay(t, 0.008), { gain: 0.45 * g }); sub(t0, 70, 0.2, 0.25 * g); }
function tick(t0, g = 1, f = 2350, pan = 0.1) { voice(sfx, t0, 0.07, (t) => (Math.sin(TAU * f * t) * 0.8 + Math.sin(TAU * f * 2.01 * t) * 0.2) * decay(t, 0.011), { gain: 0.22 * g, pan, sendAmt: 0.08 }); }
function pop(t0, g = 1) { let ph = 0; voice(sfx, t0, 0.12, (t) => { ph += (380 + 900 * Math.exp(-t / 0.012)) / SR; return Math.sin(TAU * ph) * decay(t, 0.035); }, { gain: 0.32 * g, sendAmt: 0.1 }); }
function keyclick(t0, g = 1) { const f = 1700 + rnd() * 500, bp = biquad('bp', 4200, 2); voice(sfx, t0, 0.03, (t) => (Math.sin(TAU * f * t) * 0.5 + bp(noise())) * decay(t, 0.005), { gain: 0.1 * g, pan: (rnd() - 0.5) * 0.3 }); }
function tap(t0, g = 1) { voice(sfx, t0, 0.12, (t) => Math.sin(TAU * (210 + 300 * Math.exp(-t / 0.01)) * t) * decay(t, 0.03), { gain: 0.42 * g }); tick(t0 + 0.004, 0.8 * g, 1250); }
function whoosh(t0, t1, g = 1) {
  const bp = biquad('bp', 400, 1.1), len = t1 - t0 + 0.12;
  voice(sfx, t0, len, (t) => { const p = t / len; bp.set(250 + 1300 * Math.sin(Math.PI * p), 1.1); return bp(noise()) * Math.sin(Math.PI * Math.min(1, p * 1.05)); }, { gain: 0.45 * g, sendAmt: 0.12 });
}
function riser(t0, t1, g = 1) {
  const len = t1 - t0, bp = biquad('bp', 500, 2); let ph = 0;
  voice(sfx, t0, len, (t) => { const p = t / len; bp.set(500 + 5500 * p * p, 2); ph += (220 + 660 * p * p) / SR; return (bp(noise()) * 0.8 + Math.sin(TAU * ph) * 0.12) * p * p; }, { gain: 0.5 * g, sendAmt: 0.2 });
}
function bite(t0, g = 1) {
  // A crunchy chomp: filtered noise burst with a quick downward thump.
  const bp = biquad('bp', 1100, 0.8);
  voice(sfx, t0, 0.16, (t) => bp(noise()) * decay(t, 0.025) * (1 + 0.6 * Math.sin(TAU * 38 * t)), { gain: 0.55 * g });
  let ph = 0; voice(sfx, t0, 0.14, (t) => { ph += (160 * Math.exp(-t / 0.04) + 60) / SR; return Math.sin(TAU * ph) * decay(t, 0.05); }, { gain: 0.4 * g });
}
function notif(t0, g = 1) { [0, 0.09].forEach((o, i) => voice(sfx, t0 + o, 0.4, (t) => Math.sin(TAU * mtof(i ? 81 : 76) * t) * decay(t, 0.12) * attack(t, 0.003), { gain: 0.16 * g, sendAmt: 0.3 })); }
function card(t0, g = 1) { whoosh(t0 - 0.05, t0 + 0.12, 0.35 * g); voice(sfx, t0 + 0.08, 0.08, (t) => noise() * decay(t, 0.01), { gain: 0.2 * g }); }
function thud(t0, g = 1) { sub(t0, 60, 0.35, 0.6 * g); const lp = biquad('lp', 500, 0.7); voice(sfx, t0, 0.2, (t) => lp(noise()) * decay(t, 0.04), { gain: 0.5 * g }); }
function suck(t0, t1, g = 1) {
  // A reverse swell that pulls into the drop.
  const len = t1 - t0, lp = biquad('lp', 400, 0.7);
  voice(sfx, t0, len, (t) => { const p = t / len; lp.set(300 + 7000 * p * p * p, 0.7); return lp(noise()) * Math.pow(p, 2.5); }, { gain: 0.7 * g, sendAmt: 0.25 });
}
function bell(t0, m, g = 1, len = 2.6, pan = 0) {
  const f = mtof(m), parts = [[1, 1], [2, 0.45], [3.01, 0.22], [4.2, 0.12], [5.43, 0.06]];
  voice(sfx, t0, len, (t) => parts.reduce((a, [r, amp]) => a + amp * Math.sin(TAU * f * r * t) * decay(t, len / (2.2 + r)), 0) * attack(t, 0.002), { gain: 0.15 * g, pan, sendAmt: 0.45 });
}
function fill(t0, t1, g = 1) {
  const len = t1 - t0 + 0.25, lp = biquad('lp', 600, 0.7); let ph = 0;
  voice(sfx, t0, len, (t) => { const p = Math.min(1, t / (t1 - t0)); lp.set(400 + 900 * p, 0.7); ph += mtof(50 + 7 * p) / SR; return (lp(noise()) * 0.5 + Math.sin(TAU * ph) * 0.35) * Math.pow(Math.sin(Math.PI * Math.min(1, t / len)), 0.7); }, { gain: 0.3 * g, sendAmt: 0.2 });
}
function pulse(t0, t1, g = 1) {
  const notes = [62, 66, 69, 74, 78, 81];
  for (let i = 0, t = t0; t < t1 - 0.02; i++, t += BEAT / 2) {
    const m = notes[Math.min(i, notes.length - 1)];
    voice(sfx, t, 0.22, (tt) => (Math.sin(TAU * mtof(m) * tt) + 0.3 * Math.sin(TAU * mtof(m) * 2 * tt)) * decay(tt, 0.06) * attack(tt, 0.003), { gain: (0.09 + 0.03 * i) * g, pan: i % 2 ? 0.25 : -0.25, sendAmt: 0.25 });
  }
}
function air(t0, t1, g = 1) {
  const len = t1 - t0 + 0.4, bp = biquad('bp', 900, 0.6);
  voice(sfx, t0, len, (t) => { const p = Math.min(1, t / (t1 - t0)); bp.set(700 + 4800 * p, 0.6); return bp(noise()) * Math.min(1, t / 0.3) * (0.3 + 0.7 * p) * (t > t1 - t0 ? decay(t - (t1 - t0), 0.12) : 1); }, { gain: 0.18 * g, sendAmt: 0.3 });
}

/* ── arrangement ──────────────────────────────────────────────────────── */
// Act one (0–8.9 s): playful plucks in D, a light kick/shaker pulse — the payday mood.
const PL = [62, 66, 69, 74, 69, 66, 71, 69];
for (let b = 2; b < 17.5; b += 0.5) pluck(bT(b), PL[Math.round(b * 2) % 8], b < 10 ? 1 : 0.85, (b * 2) % 2 ? 0.3 : -0.3);
for (let b = 2; b < 17.5; b++) { if (b % 2 === 0) kick(bT(b), 0.55); shaker(bT(b) + BEAT / 2, 0.9); }
pad(bT(2), bT(17.5), [50, 57, 62, 66], 0.6, 0.5, 1100);
// Chaos (8.9–13 s): the groove falls apart — low drone, broken hats, tension pad.
pad(bT(17.5), bT(25.7), [49, 55, 58, 64], 0.7, 0.3, 900);
for (let b = 18; b < 25.5; b += 0.75) hat(bT(b), 0.6 + 0.4 * rnd(), false, (rnd() - 0.5) * 0.8);
bassNote(bT(17.5), bT(25.7) - bT(17.5), 26, 0.5, 2.5);
// Product act (13–30.8 s): four-on-the-floor in D major, vi–IV–I–V.
const PROG = [[35, [59, 62, 66, 71]], [31, [55, 59, 62, 67]], [38, [57, 62, 66, 69]], [33, [57, 61, 64, 69]]];
function groove(b0, b1, g = 1) {
  for (let b = b0; b < b1; b += 4) {
    const [root, chord] = PROG[Math.floor((b - b0) / 4) % 4];
    pad(bT(b), bT(Math.min(b + 4, b1)), chord, g * 0.85, 0.3, 1600);
    for (let s = 0; s < 4 && b + s < b1; s += 0.5) bassNote(bT(b + s) + 0.004, BEAT * 0.42, root + (s % 1 ? 12 : 0), s % 1 ? 0.7 * g : g);
  }
  for (let b = b0; b < b1; b++) {
    kick(bT(b), g); if (b % 2 === 1) clap(bT(b), g);
    hat(bT(b) + BEAT / 2, g, b % 4 === 3);
    for (const s of [0.25, 0.75]) hat(bT(b) + BEAT * s, 0.35 * g, false, -0.2);
  }
}
groove(26, 61.7);
// Long view (30.85–34.55 s): breakdown — pad and air only.
pad(bT(61.7), bT(69), [50, 57, 62, 66, 71], 1, 0.5, 2400);
bassNote(bT(61.7), bT(69) - bT(61.7), 38, 0.7, 3);
for (let b = 62; b < 69; b += 0.5) pluck(bT(b), [74, 78, 81, 78][Math.round(b * 2) % 4], 0.55, (b * 2) % 2 ? 0.4 : -0.4);
// Toolkit and website (34.55–47.8 s): the groove returns, bigger, with an arp.
groove(69, 95.6, 1.05);
for (let b = 69; b < 95.5; b += 0.25) pluck(bT(b), [74, 78, 81, 86][Math.round(b * 4) % 4] + (Math.floor((b - 69) / 4) % 4 === 1 ? -2 : 0), 0.32, (b * 4) % 2 ? 0.45 : -0.45);
// Brand (48 s on): the resolve — D major bloom that decays before the last frame.
pad(bT(96), DUR - 1.4, [50, 57, 62, 64, 66, 69], 1.3, 1.1, 2600);
bassNote(bT(96), DUR - bT(96) - 0.1, 26, 1, 0.8);
for (let b = 97; b < 108; b += 1) pluck(bT(b), [74, 81, 78, 86][b % 4], 0.35 * (1 - (b - 97) / 12), b % 2 ? 0.3 : -0.3);

/* ── frame-locked cues ────────────────────────────────────────────────── */
for (const c of TL.cues) {
  const t = fT(c.f), t1 = c.to !== undefined ? fT(c.to) : t;
  switch (c.type) {
    case 'impact': impact(t); break;
    case 'notif': notif(t); break;
    case 'pop': pop(t); break;
    case 'whoosh': whoosh(t, t1, 0.8); break;
    case 'tick': tick(t); break;
    case 'bite': bite(t); break;
    case 'riserDark': riser(t, t1, 0.6); break;
    case 'chaosStart': break;
    case 'card': card(t); break;
    case 'thud': thud(t); break;
    case 'suck': suck(t, t1); break;
    case 'drop': impact(t, 1.2); bell(t, 74, 1, 3, -0.15); bell(t + 0.012, 78, 0.7, 2.8, 0.2); bell(t + 0.024, 81, 0.6, 2.6, 0); break;
    case 'snap': snap(t); break;
    case 'keys': for (let k = 0; k < 13; k++) keyclick(t + k * 2 / TL.fps); break;
    case 'tap': tap(t); break;
    case 'block': pop(t, 1.3); sub(t, 55, 0.25, 0.35); break;
    case 'fill': fill(t, t1); break;
    case 'pulse': pulse(t, t1); break;
    case 'result': bell(t, 81, 0.8, 1.2, 0.1); snap(t, 0.8); break;
    case 'lowhit': sub(t, 41, 2, 1); impact(t, 0.3); break;
    case 'air': air(t, t1); break;
    case 'riser': riser(t, t1, 0.9); break;
    case 'brand': impact(t, 1.15); bell(t, 74, 1.1, 3.4, -0.15); bell(t + 0.012, 78, 0.8, 3.2, 0.2); bell(t + 0.024, 81, 0.75, 3, 0); bell(t + 0.06, 86, 0.45, 2.6, 0.3); break;
    case 'badge': pop(t, 0.9); tick(t + 0.03, 0.7, 2800); break;
    default: throw new Error('unknown cue ' + c.type);
  }
}

/* ── narration: placed by speech onset, presence EQ, gentle levelling ── */
function readF32(file) {
  const b = fs.readFileSync(file); let i = 12, sr = 0;
  while (i < b.length) {
    const id = b.toString('ascii', i, i + 4), sz = b.readUInt32LE(i + 4);
    if (id === 'fmt ') sr = b.readUInt32LE(i + 12);
    if (id === 'data') return { a: new Float32Array(b.buffer.slice(b.byteOffset + i + 8, b.byteOffset + i + 8 + sz)), sr };
    i += 8 + sz;
  }
  throw new Error('no data chunk ' + file);
}
const voEnv = new Float32Array(N);
for (const { id, at } of TL.vo) {
  const { a, sr } = readF32(path.join(ROOT, 'vo/48k', `${id}.wav`));
  if (sr !== SR) throw new Error(`${id} is ${sr} Hz`);
  const hp = biquad('hp', 90, 0.7), pres = biquad('peak', 3200, 1, 2.5), body = biquad('peak', 220, 1, 1.0);
  let rms = 0; for (const x of a) rms += x * x; rms = Math.sqrt(rms / a.length);
  const g = 0.11 / Math.max(rms, 1e-4);
  const i0 = Math.round((at - EXT[id].start) * SR);
  for (let k = 0; k < a.length; k++) {
    const y = Math.tanh(body(pres(hp(a[k]))) * g * 1.3) / 1.3;
    write(vo, i0 + k, y, y);
    if (i0 + k >= 0 && i0 + k < N) voEnv[i0 + k] = Math.max(voEnv[i0 + k], Math.abs(y));
  }
}
// Smooth the voice envelope (fast attack, slow release) for ducking.
{ let e = 0; const at = Math.exp(-1 / (0.015 * SR)), rl = Math.exp(-1 / (0.35 * SR));
  for (let n = 0; n < N; n++) { const x = voEnv[n]; e = x > e ? at * e + (1 - at) * x : rl * e + (1 - rl) * x; voEnv[n] = e; } }

/* ── reverb on the send ───────────────────────────────────────────────── */
function reverb(inp, spread) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116].map((d) => Math.round(d * SR / 44100) + spread);
  const aps = [556, 441, 341, 225].map((d) => Math.round(d * SR / 44100) + spread);
  const out = new Float32Array(N);
  const cb = combs.map((d) => ({ buf: new Float32Array(d), i: 0, s: 0 })), ab = aps.map((d) => ({ buf: new Float32Array(d), i: 0 }));
  for (let n = 0; n < N; n++) {
    const x = inp[n] * 0.015; let y = 0;
    for (const c of cb) { const o = c.buf[c.i]; c.s = o * 0.65 + c.s * 0.35; c.buf[c.i] = x + c.s * 0.82; c.i = (c.i + 1) % c.buf.length; y += o; }
    for (const a of ab) { const o = a.buf[a.i]; const v = -y + o; a.buf[a.i] = y + o * 0.5; a.i = (a.i + 1) % a.buf.length; y = v; }
    out[n] = y;
  }
  return out;
}
const verb = { L: reverb(send.L, 0), R: reverb(send.R, 23) };

/* ── mix ──────────────────────────────────────────────────────────────── */
// Kick sidechain on the music; the voice ducks music and drums by up to ~9 dB.
const kicks = [];
for (let b = 2; b < 17.5; b += 2) kicks.push(bT(b));
for (let b = 26; b < 61.7; b++) kicks.push(bT(b));
for (let b = 69; b < 95.6; b++) kicks.push(bT(b));
const kdu = new Float32Array(N).fill(1);
for (const k of kicks) { const i0 = Math.round(k * SR); for (let j = 0; j < 0.3 * SR && i0 + j < N; j++) kdu[i0 + j] = Math.min(kdu[i0 + j], 1 - 0.5 * Math.exp(-j / SR / 0.07)); }
const out = bus();
for (let n = 0; n < N; n++) {
  const duck = 1 - 0.65 * Math.min(1, voEnv[n] / 0.12);
  for (const ch of ['L', 'R']) out[ch][n] = (music[ch][n] * kdu[n] + drums[ch][n] * 0.85) * duck * 0.9 + sfx[ch][n] * (0.75 + 0.25 * duck) + verb[ch][n] * 0.8 + vo[ch][n];
}
let peak = 0;
for (let n = 0; n < N; n++) peak = Math.max(peak, Math.abs(out.L[n]), Math.abs(out.R[n]));
const pre = 0.9 / peak, fadeN = Math.round(0.15 * SR);
for (let n = 0; n < N; n++) { const fd = n > N - fadeN ? (N - n) / fadeN : 1; for (const ch of ['L', 'R']) out[ch][n] = Math.tanh(out[ch][n] * pre * 1.1) / Math.tanh(1.1) * 0.92 * fd; }

/* ── write ────────────────────────────────────────────────────────────── */
function wav(file, b, gain = 1) {
  const data = Buffer.alloc(N * 8);
  for (let n = 0; n < N; n++) { data.writeFloatLE(b.L[n] * gain, n * 8); data.writeFloatLE(b.R[n] * gain, n * 8 + 4); }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 8, 28); h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}
wav(path.join(DIR, 'mix2.wav'), out);
fs.mkdirSync(path.join(DIR, 'stems2'), { recursive: true });
wav(path.join(DIR, 'stems2/vo.wav'), vo, pre);
wav(path.join(DIR, 'stems2/music.wav'), { L: music.L.map((v, i) => v + drums.L[i]), R: music.R.map((v, i) => v + drums.R[i]) }, pre);
wav(path.join(DIR, 'stems2/sfx.wav'), sfx, pre);
console.log(`mix2.wav ${DUR.toFixed(2)} s, pre-gain ${pre.toFixed(3)}`);
