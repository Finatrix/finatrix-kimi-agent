// Original score + sound design for the FinatriX launch film, synthesized from
// scratch (no samples, no third-party audio). Every cue is read from
// ../src/timeline.json, so hits land on the exact frames the picture uses.
//   node audio/synth.mjs → audio/mix.wav (48 kHz stereo float, pre-loudnorm)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const TL = JSON.parse(fs.readFileSync(path.join(DIR, '../src/timeline.json'), 'utf8'));
const SR = 48000;
const DUR = TL.frames / TL.fps; // 16.0 s
const N = Math.round(DUR * SR);
const BEAT = 60 / TL.bpm;
const fT = (f) => f / TL.fps;
const bT = (b) => b * BEAT;
const TAU = Math.PI * 2;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

/* ── buses ────────────────────────────────────────────────────────────── */
const bus = () => ({ L: new Float32Array(N), R: new Float32Array(N) });
const drums = bus(), music = bus(), sfx = bus(), verbSend = bus();

let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const noise = () => rnd() * 2 - 1;

function write(b, i, l, r) { if (i >= 0 && i < N) { b.L[i] += l; b.R[i] += r; } }
/** Render `fn(tLocal, i)` for `len` seconds from `t0` into bus `b`, with pan/gain/send. */
function voice(b, t0, len, fn, { gain = 1, pan = 0, send = 0 } = {}) {
  const i0 = Math.round(t0 * SR), n = Math.round(len * SR);
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let k = 0; k < n; k++) {
    const v = fn(k / SR, k);
    write(b, i0 + k, v * gl * Math.SQRT2, v * gr * Math.SQRT2);
    if (send) write(verbSend, i0 + k, v * gl * send * Math.SQRT2, v * gr * send * Math.SQRT2);
  }
}

/* ── tiny DSP kit ─────────────────────────────────────────────────────── */
function biquad(type, f, q) {
  let b0, b1, b2, a1, a2, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const set = (f, q) => {
    const w = TAU * Math.min(f, SR * 0.45) / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
    let B0, B1, B2; const A0 = 1 + al;
    if (type === 'lp') { B0 = (1 - c) / 2; B1 = 1 - c; B2 = (1 - c) / 2; }
    else if (type === 'hp') { B0 = (1 + c) / 2; B1 = -(1 + c); B2 = (1 + c) / 2; }
    else { B0 = al; B1 = 0; B2 = -al; } // band-pass (0 dB peak)
    b0 = B0 / A0; b1 = B1 / A0; b2 = B2 / A0; a1 = -2 * c / A0; a2 = (1 - al) / A0;
  };
  set(f, q);
  const run = (x) => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  run.set = set;
  return run;
}
const decay = (t, tau) => Math.exp(-t / tau);
const attack = (t, a) => Math.min(1, t / a);
/** Band-limited-ish saw via 1-pole smoothing of a naive saw (fine under a low-pass). */
function saw(freq) { let ph = rnd(); return () => { ph += freq / SR; ph -= Math.floor(ph); return 2 * ph - 1; }; }

/* ── drum kit ─────────────────────────────────────────────────────────── */
function kick(t0, g = 1) {
  let ph = 0;
  voice(drums, t0, 0.45, (t) => {
    const f = 46 + 110 * Math.exp(-t / 0.035);
    ph += f / SR;
    const body = Math.sin(TAU * ph) * decay(t, 0.16);
    const click = (t < 0.004 ? noise() * (1 - t / 0.004) : 0) * 0.35;
    return Math.tanh(1.6 * (body + click));
  }, { gain: 0.78 * g });
}
function clap(t0, g = 1) {
  const bp = biquad('bp', 1500, 0.9);
  voice(drums, t0, 0.32, (t) => {
    const bursts = [0, 0.011, 0.022].reduce((a, o) => a + (t >= o ? decay(t - o, 0.006) : 0), 0);
    return bp(noise()) * (bursts * 0.7 + decay(t, 0.09) * 0.55);
  }, { gain: 0.42 * g, send: 0.22 });
}
function hat(t0, g = 1, open = false, pan = 0.15) {
  const hp = biquad('hp', 7500, 0.7);
  voice(drums, t0, open ? 0.22 : 0.06, (t) => hp(noise()) * decay(t, open ? 0.07 : 0.017), { gain: 0.16 * g, pan });
}

/* ── sfx kit ──────────────────────────────────────────────────────────── */
function sub(t0, f0 = 62, len = 0.9, g = 1) {
  let ph = 0;
  voice(sfx, t0, len, (t) => { ph += (f0 * (1 + 0.6 * Math.exp(-t / 0.05))) / SR; return Math.sin(TAU * ph) * decay(t, len / 3.2) * attack(t, 0.002); }, { gain: 0.9 * g });
}
function impact(t0, g = 1) {
  sub(t0, 48, 1.1, 1.0 * g);
  const lp = biquad('lp', 2400, 0.8);
  voice(sfx, t0, 0.5, (t) => { lp.set(300 + 2200 * Math.exp(-t / 0.03), 0.8); return lp(noise()) * decay(t, 0.07); }, { gain: 0.55 * g, send: 0.15 });
  voice(sfx, t0, 0.012, (t) => noise() * (1 - t / 0.012), { gain: 0.35 * g });
}
function snap(t0, g = 1) {
  const bp = biquad('bp', 3200, 1.2);
  voice(sfx, t0, 0.06, (t) => bp(noise()) * decay(t, 0.008), { gain: 0.5 * g });
  sub(t0, 70, 0.22, 0.32 * g);
}
function tick(t0, g = 1, f = 2350, pan = 0) {
  voice(sfx, t0, 0.07, (t) => (Math.sin(TAU * f * t) * 0.8 + Math.sin(TAU * f * 2.01 * t) * 0.2) * decay(t, 0.011), { gain: 0.24 * g, pan, send: 0.08 });
}
function key(t0, g = 1) {
  const f = 1700 + rnd() * 500;
  const bp = biquad('bp', 4200, 2);
  voice(sfx, t0, 0.03, (t) => (Math.sin(TAU * f * t) * 0.5 + bp(noise())) * decay(t, 0.005), { gain: 0.12 * g, pan: (rnd() - 0.5) * 0.3 });
}
function tap(t0, g = 1) {
  voice(sfx, t0, 0.12, (t) => Math.sin(TAU * (210 + 300 * Math.exp(-t / 0.01)) * t) * decay(t, 0.03), { gain: 0.45 * g });
  tick(t0 + 0.004, 0.8 * g, 1250);
}
function whoosh(t0, t1, g = 1) {
  const bp = biquad('bp', 400, 1.1); const len = t1 - t0 + 0.12;
  voice(sfx, t0, len, (t) => {
    const p = t / len; bp.set(250 + 1100 * Math.sin(Math.PI * p), 1.1);
    return bp(noise()) * Math.sin(Math.PI * Math.min(1, p * 1.05));
  }, { gain: 0.5 * g, send: 0.12 });
}
function riser(t0, t1, g = 1) {
  const len = t1 - t0, bp = biquad('bp', 500, 2); let ph = 0;
  voice(sfx, t0, len, (t) => {
    const p = t / len; bp.set(500 + 5500 * p * p, 2);
    ph += (220 + 660 * p * p) / SR;
    return (bp(noise()) * 0.8 + Math.sin(TAU * ph) * 0.12) * p * p;
  }, { gain: 0.55 * g, send: 0.2 });
}
function block(t0, m, g = 1) {
  // A woody "tock": two partials, quick decay; pitch steps up per block.
  const f = mtof(m);
  voice(sfx, t0, 0.18, (t) => (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 2.76 * t) * decay(t, 0.012)) * decay(t, 0.045), { gain: 0.42 * g, send: 0.12 });
  sub(t0, 55, 0.25, 0.35 * g);
}
function fill(t0, t1, g = 1) {
  const len = t1 - t0 + 0.25, lp = biquad('lp', 600, 0.7); let ph = 0;
  voice(sfx, t0, len, (t) => {
    const p = Math.min(1, t / (t1 - t0)); lp.set(400 + 900 * p, 0.7);
    ph += mtof(50 + 7 * p) / SR;
    const env = Math.sin(Math.PI * Math.min(1, t / len)) ** 0.7;
    return (lp(noise()) * 0.5 + Math.sin(TAU * ph) * 0.35) * env;
  }, { gain: 0.32 * g, send: 0.2 });
}
function bell(t0, m, g = 1, len = 2.6, pan = 0) {
  const f = mtof(m), parts = [[1, 1], [2.0, 0.45], [3.01, 0.22], [4.2, 0.12], [5.43, 0.06]];
  voice(sfx, t0, len, (t) => parts.reduce((a, [r, amp]) => a + amp * Math.sin(TAU * f * r * t) * decay(t, len / (2.2 + r)), 0) * attack(t, 0.002),
    { gain: 0.16 * g, pan, send: 0.45 });
}
function pulse(t0, t1, g = 1) {
  // Ascending pulse: D minor arpeggio climbing on 8th notes.
  const notes = [62, 65, 69, 72, 74, 77]; const step = BEAT / 2;
  for (let i = 0, t = t0; t < t1 - 0.02; i++, t += step) {
    const m = notes[Math.min(i, notes.length - 1)];
    voice(sfx, t, 0.22, (tt) => (Math.sin(TAU * mtof(m) * tt) + 0.3 * Math.sin(TAU * mtof(m) * 2 * tt)) * decay(tt, 0.06) * attack(tt, 0.003),
      { gain: (0.10 + 0.03 * i) * g, pan: i % 2 ? 0.25 : -0.25, send: 0.25 });
  }
}
function air(t0, t1, g = 1) {
  const len = t1 - t0 + 0.4, bp = biquad('bp', 900, 0.6);
  voice(sfx, t0, len, (t) => {
    const p = Math.min(1, t / (t1 - t0)); bp.set(700 + 4800 * p, 0.6);
    return bp(noise()) * Math.min(1, t / 0.3) * (0.3 + 0.7 * p) * (t > t1 - t0 ? decay(t - (t1 - t0), 0.12) : 1);
  }, { gain: 0.2 * g, send: 0.3, pan: 0 });
}

/* ── music: bass, pad, groove ─────────────────────────────────────────── */
const CHORDS = [ // [startBeat, endBeat, bassMidi, padMidis]
  [2, 6, 38, [50, 53, 57, 60, 64]],    // Dm9
  [6, 10, 34, [46, 50, 53, 57]],       // Bbmaj7
  [10, 14, 41, [53, 57, 60, 64]],      // Fmaj7
  [14, 18, 36, [48, 52, 55, 62]],      // C(add9)
  [18, 22, 38, [50, 53, 57, 60, 64]],  // Dm9
  [22, 26, 34, [46, 50, 53, 57]],      // Bbmaj7
  [26, 28, 31, [43, 46, 50, 53, 57]],  // Gm9 — the lift into the brand
];
const BRAND = [50, 57, 62, 64, 66, 69]; // D add9 with the major third: the resolve

function pad(t0, t1, midis, g = 1, rel = 0.35, cutoff = 1400) {
  const len = t1 - t0 + rel;
  midis.forEach((m, j) => {
    const oscs = [saw(mtof(m) * 0.997), saw(mtof(m) * 1.003)]; const lp = biquad('lp', cutoff, 0.6);
    voice(music, t0, len, (t) => {
      const env = attack(t, 0.08) * (t > t1 - t0 ? decay(t - (t1 - t0), rel / 3) : 1);
      return lp((oscs[0]() + oscs[1]()) * 0.5) * env;
    }, { gain: 0.05 * g, pan: (j / (midis.length - 1) - 0.5) * 0.8, send: 0.35 });
  });
}
function bassNote(t0, len, m, g = 1, tau = len * 0.9) {
  const o = saw(mtof(m)), lp = biquad('lp', 300, 0.9); let ph = 0;
  voice(music, t0, len, (t) => {
    lp.set(160 + 900 * Math.exp(-t / 0.05), 0.9);
    ph += mtof(m) / SR;
    return (lp(o()) * 0.7 + Math.sin(TAU * ph) * 0.6) * attack(t, 0.003) * decay(t, tau);
  }, { gain: 0.42 * g });
}

for (const [b0, b1, bassM, padM] of CHORDS) {
  const quiet = b0 >= 22 ? 0.75 : 1;
  pad(bT(b0), bT(b1), padM, quiet, 0.3, b0 >= 22 ? 1900 : 1300);
  // Bass: driving 8ths in the groove section, sustained in the long-view section.
  if (b0 < 22) for (let b = b0; b < b1; b += 0.5) bassNote(bT(b) + 0.004, BEAT * 0.45, bassM + (b % 2 === 1.5 ? 12 : 0), b % 1 ? 0.75 : 1);
  else bassNote(bT(b0), bT(b1) - bT(b0), bassM, 0.8);
}
// Groove: four on the floor from the first UI cut until the long view.
for (let b = 2; b < 22; b++) {
  kick(bT(b));
  if (b % 2 === 1) clap(bT(b));
  hat(bT(b) + BEAT / 2, 1, b % 4 === 3);
  for (const s of [0.25, 0.75]) hat(bT(b) + BEAT * s, 0.4, false, -0.2);
}
// The long view: half-time pulse, then air before the brand.
kick(bT(22), 1.1); kick(bT(24), 0.7);
for (let b = 22; b < 28; b++) hat(bT(b) + BEAT / 2, 0.5, false, 0.3);

// Brand resolve: long Dadd9 bloom that decays to a deliberate tail.
// It swells, holds under the end card, then decays to silence before the
// last frame rather than being cut off by it.
pad(bT(28), DUR - 1.5, BRAND, 1.3, 1.2, 2600);
bassNote(bT(28), DUR - bT(28) - 0.1, 26, 1.0, 0.75);

/* ── frame-locked cues ────────────────────────────────────────────────── */
let blockN = 0;
for (const c of TL.cues) {
  const t = fT(c.f), t1 = c.to !== undefined ? fT(c.to) : t;
  switch (c.type) {
    case 'impact': impact(t); break;
    case 'punch': impact(t, 0.55); snap(t, 0.8); break;
    case 'riser': riser(t, t1); break;
    case 'snap': snap(t); break;
    case 'tick': tick(t, 1, 2350, 0.1); break;
    case 'key': key(t); break;
    case 'tap': tap(t); break;
    case 'whoosh': whoosh(t, t1, 0.85); break;
    case 'block': block(t, [62, 66, 69][blockN++ % 3]); break;
    case 'fill': fill(t, t1); break;
    case 'pulse': pulse(t, t1); break;
    case 'result': bell(t, 81, 0.9, 1.2, 0.1); snap(t, 0.9); sub(t, 60, 0.4, 0.5); break;
    case 'reset': whoosh(t - 0.05, t + 0.18, 0.4); break;
    case 'lowhit': sub(t, 41, 2.2, 1.1); impact(t, 0.35); break;
    case 'air': air(t, t1); break;
    case 'brand':
      impact(t, 1.15);
      bell(t, 74, 1.1, 3.4, -0.15); bell(t + 0.012, 78, 0.8, 3.2, 0.2); bell(t + 0.024, 81, 0.75, 3.0, 0); bell(t + 0.06, 86, 0.45, 2.6, 0.3);
      break;
    default: throw new Error('unknown cue ' + c.type);
  }
}

/* ── reverb (Freeverb-style) on the send bus ──────────────────────────── */
function reverb(inL, inR, room = 0.82, damp = 0.35) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116].map((d) => Math.round(d * SR / 44100));
  const aps = [556, 441, 341, 225].map((d) => Math.round(d * SR / 44100));
  const run = (input, spread) => {
    const out = new Float32Array(N);
    const cb = combs.map((d) => ({ buf: new Float32Array(d + spread), i: 0, s: 0 }));
    const ab = aps.map((d) => ({ buf: new Float32Array(d + spread), i: 0 }));
    for (let n = 0; n < N; n++) {
      const x = input[n] * 0.015; let y = 0;
      for (const c of cb) { const o = c.buf[c.i]; c.s = o * (1 - damp) + c.s * damp; c.buf[c.i] = x + c.s * room; c.i = (c.i + 1) % c.buf.length; y += o; }
      for (const a of ab) { const o = a.buf[a.i]; const v = -y + o; a.buf[a.i] = y + o * 0.5; a.i = (a.i + 1) % a.buf.length; y = v; }
      out[n] = y;
    }
    return out;
  };
  return { L: run(inL, 0), R: run(inR, 23) };
}
const verb = reverb(verbSend.L, verbSend.R);

/* ── mix: sidechain the music to the kick, automate, sum, limit ───────── */
const kickTimes = [];
for (let b = 2; b < 22; b++) kickTimes.push(bT(b));
kickTimes.push(bT(22), bT(24));
function duck(t) {
  let g = 1;
  for (const k of kickTimes) if (t >= k && t < k + 0.3) g = Math.min(g, 1 - 0.55 * Math.exp(-(t - k) / 0.07));
  return g;
}
function musicAuto(t) {
  // Intro: music enters on the first cut. Negative-space reset before the
  // long view. Pull down slightly before the brand beat, then the resolve.
  let g = t < fT(TL.cuts.s1) - 0.02 ? 0 : 1;
  const r0 = fT(293), r1 = fT(TL.cuts.s5);
  if (t >= r0 && t < r1) g *= 0.25 + 0.75 * (1 - (t - r0) / (r1 - r0)) ** 2;
  const p0 = fT(350), p1 = fT(TL.cuts.s6);
  if (t >= p0 && t < p1) g *= 1 - 0.3 * (t - p0) / (p1 - p0);
  return g;
}
const out = bus();
for (let n = 0; n < N; n++) {
  const t = n / SR;
  const mg = musicAuto(t) * duck(t);
  const dg = musicAuto(t);
  for (const ch of ['L', 'R']) {
    out[ch][n] = music[ch][n] * mg + drums[ch][n] * dg * 0.9 + sfx[ch][n] + verb[ch][n] * 0.9;
  }
}
// Gentle bus glue + soft clip, then a final 120 ms fade so the tail ends clean.
let peak = 0;
for (let n = 0; n < N; n++) for (const ch of ['L', 'R']) peak = Math.max(peak, Math.abs(out[ch][n]));
const pre = 0.9 / peak;
const fadeN = Math.round(0.12 * SR);
for (let n = 0; n < N; n++) {
  const fade = n > N - fadeN ? (N - n) / fadeN : 1;
  for (const ch of ['L', 'R']) out[ch][n] = Math.tanh(out[ch][n] * pre * 1.15) / Math.tanh(1.15) * 0.92 * fade;
}

/* ── write 32-bit float WAV ───────────────────────────────────────────── */
const data = Buffer.alloc(N * 2 * 4);
for (let n = 0; n < N; n++) { data.writeFloatLE(out.L[n], n * 8); data.writeFloatLE(out.R[n], n * 8 + 4); }
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12);
hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(3, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(SR, 24);
hdr.writeUInt32LE(SR * 8, 28); hdr.writeUInt16LE(8, 32); hdr.writeUInt16LE(32, 34); hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
fs.writeFileSync(path.join(DIR, 'mix.wav'), Buffer.concat([hdr, data]));
console.log(`mix.wav ${DUR}s, pre-gain ${pre.toFixed(3)}`);
