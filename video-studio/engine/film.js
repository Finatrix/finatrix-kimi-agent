// Film composer: schedules scenes against the voiceover timeline and blends
// them with transitions. Scenes draw into an offscreen buffer at local time.
import { W, H, clamp, lerp, ease } from './core.js';
import { finish } from './draw.js';

const LEAD = 0.12; // visuals lead the voice slightly, like an editor would cut

export class Film {
  /**
   * @param timeline {duration, lines:[{id,text,start,end}]}
   * @param scenes   [{at, trans, draw(ctx,s), sfx?(s) => [[t,type,gain]], grain?}]
   */
  constructor(timeline, scenes, ctx = {}) {
    this.tl = timeline;
    this.duration = timeline.duration;
    this.lines = Object.fromEntries(timeline.lines.map((l) => [l.id, l]));
    this.ctxData = ctx;
    this.scenes = scenes.map((sc, i) => {
      const l = this.lines[sc.at];
      if (!l) throw new Error(`scene ${i} references unknown line "${sc.at}"`);
      return { ...sc, start: i === 0 ? 0 : l.start - LEAD + (sc.offset || 0) };
    });
    this.scenes.forEach((sc, i) => {
      sc.end = i + 1 < this.scenes.length ? this.scenes[i + 1].start : this.duration;
      sc.d = sc.end - sc.start;
    });
    this.bufA = new OffscreenCanvas(W, H);
    this.bufB = new OffscreenCanvas(W, H);
  }

  /** State object handed to a scene's draw function. */
  state(sc, T, frame) {
    const t = T - sc.start;
    const line = (id) => {
      const l = this.lines[id];
      if (!l) throw new Error('unknown line ' + id);
      return { s: l.start - sc.start, e: l.end - sc.start, d: l.end - l.start, text: l.text };
    };
    /** Estimated local time a word is spoken (by character position in the line). */
    const word = (id, needle, occurrence = 0) => {
      const l = line(id);
      const lower = l.text.toLowerCase();
      let idx = -1;
      for (let k = 0; k <= occurrence; k++) idx = lower.indexOf(needle.toLowerCase(), idx + 1);
      if (idx < 0) throw new Error(`word "${needle}" not in line ${id}`);
      return l.s + (idx / Math.max(1, l.text.length)) * l.d;
    };
    return { t, d: sc.d, T, frame, line, word, start: sc.start, end: sc.end, ...this.ctxData };
  }

  sceneAt(T) {
    let i = this.scenes.findIndex((sc) => T >= sc.start && T < sc.end);
    if (i < 0) i = this.scenes.length - 1;
    return i;
  }

  renderScene(sc, T, frame, buf) {
    const c = buf.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.filter = 'none';
    c.clearRect(0, 0, W, H);
    const st = this.state(sc, T, frame);
    const push = sc.push ?? 0.03;
    if (push) {
      const z = 1 + push * ease.inOutQuad(clamp(st.t / Math.max(0.5, sc.d)));
      c.translate(W / 2, H * 0.48);
      c.scale(z, z);
      c.translate(-W / 2, -H * 0.48);
    }
    sc.draw(c, st);
    return buf;
  }

  frame(ctx, T, frame) {
    const i = this.sceneAt(T);
    const cur = this.scenes[i];
    const next = this.scenes[i + 1];
    // transition window around the boundary into `next` (or from prev into cur)
    let from = null;
    let to = null;
    let p = 0;
    let kind = 'cut';
    const win = (sc) => sc.transDur ?? TR[sc.trans || 'cut'] ?? 0;
    if (next && T > next.start - win(next) / 2) {
      from = cur;
      to = next;
      kind = next.trans || 'cut';
      p = (T - (next.start - win(next) / 2)) / win(next);
    } else if (i > 0 && T < cur.start + win(cur) / 2) {
      from = this.scenes[i - 1];
      to = cur;
      kind = cur.trans || 'cut';
      p = (T - (cur.start - win(cur) / 2)) / win(cur);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (!from || kind === 'cut' || win(to) === 0) {
      ctx.drawImage(this.renderScene(cur, T, frame, this.bufA), 0, 0);
    } else {
      p = clamp(p);
      const A = this.renderScene(from, T, frame, this.bufA);
      const B = this.renderScene(to, T, frame, this.bufB);
      TRANS[kind](ctx, A, B, p);
    }
    const g = (this.scenes[i].grain ?? 1);
    finish(ctx, frame, { vignette: 0.14 * g + 0.04, grain: 0.04 * g });
  }

  /** Absolute sound-effect cues for the audio mixer. */
  events() {
    const out = [];
    this.scenes.forEach((sc, i) => {
      const s = this.state(sc, sc.start, 0);
      if (i > 0 && TRANS_SFX[sc.trans]) out.push({ t: sc.start - (TR[sc.trans] || 0) / 2, type: TRANS_SFX[sc.trans], gain: 0.8 });
      for (const [t, type, gain = 1] of sc.sfx ? sc.sfx(s) : []) {
        if (t >= -0.3 && t <= sc.d + 0.3) out.push({ t: Math.max(0, sc.start + t), type, gain });
      }
    });
    return out.sort((a, b) => a.t - b.t);
  }

  /** Music section markers for the mixer, from the scene graph. */
  sections() {
    return this.scenes.map((sc) => ({ t: sc.start, mood: sc.mood || 'groove' }));
  }
}

// transition durations (seconds, centred on the cut)
const TR = { cut: 0, whip: 0.34, whipUp: 0.34, zoom: 0.4, flash: 0.36, drop: 0.42, iris: 0.5, fade: 0.4 };
const TRANS_SFX = { whip: 'whoosh', whipUp: 'whoosh', zoom: 'swoosh', flash: 'flash', drop: 'drop', iris: 'swell' };

/** Draw `img` several times along a motion vector — directional motion blur. */
function smear(ctx, img, x, y, dx, dy, taps, alpha = 1, sc = 1) {
  if (taps <= 1 || Math.hypot(dx, dy) < 2) {
    ctx.globalAlpha = alpha;
    drawScaled(ctx, img, x, y, sc);
    return;
  }
  for (let k = 0; k < taps; k++) {
    const f = k / (taps - 1) - 0.5;
    ctx.globalAlpha = (alpha * 1.6) / taps;
    drawScaled(ctx, img, x + dx * f, y + dy * f, sc);
  }
  ctx.globalAlpha = 1;
}
function drawScaled(ctx, img, x, y, sc) {
  if (sc === 1) ctx.drawImage(img, x, y);
  else ctx.drawImage(img, x + (W - W * sc) / 2, y + (H - H * sc) / 2, W * sc, H * sc);
}

const TRANS = {
  cut(ctx, A, B, p) {
    ctx.drawImage(p < 0.5 ? A : B, 0, 0);
  },
  whip(ctx, A, B, p) {
    const e = ease.inOutCubic(p);
    const v = Math.sin(p * Math.PI); // speed profile
    const blur = 260 * v;
    ctx.save();
    smear(ctx, A, -e * W, 0, blur, 0, 6);
    smear(ctx, B, (1 - e) * W, 0, blur, 0, 6);
    ctx.restore();
  },
  whipUp(ctx, A, B, p) {
    const e = ease.inOutCubic(p);
    const v = Math.sin(p * Math.PI);
    ctx.save();
    smear(ctx, A, 0, -e * H, 0, 300 * v, 6);
    smear(ctx, B, 0, (1 - e) * H, 0, 300 * v, 6);
    ctx.restore();
  },
  zoom(ctx, A, B, p) {
    ctx.save();
    if (p < 0.5) {
      const q = ease.inCubic(p * 2);
      ctx.drawImage(A, 0, 0);
      for (let k = 1; k <= 4; k++) {
        ctx.globalAlpha = 0.22 * q;
        drawScaled(ctx, A, 0, 0, 1 + q * 0.25 * k);
      }
    } else {
      const q = ease.outCubic((p - 0.5) * 2);
      ctx.globalAlpha = 1;
      drawScaled(ctx, B, 0, 0, lerp(1.35, 1, q));
      for (let k = 1; k <= 3; k++) {
        ctx.globalAlpha = 0.22 * (1 - q);
        drawScaled(ctx, B, 0, 0, lerp(1.35, 1, q) * (1 + 0.12 * k * (1 - q)));
      }
    }
    ctx.restore();
  },
  flash(ctx, A, B, p) {
    ctx.save();
    ctx.drawImage(p < 0.5 ? A : B, 0, 0);
    const a = p < 0.5 ? ease.inCubic(p * 2) : 1 - ease.outCubic((p - 0.5) * 2);
    ctx.globalAlpha = a;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  },
  drop(ctx, A, B, p) {
    const e = ease.outCubic(p);
    ctx.save();
    ctx.drawImage(A, 0, 0);
    ctx.globalAlpha = 0.5 * e;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    smear(ctx, B, 0, -(1 - e) * H, 0, 220 * (1 - e), 5);
    ctx.restore();
  },
  iris(ctx, A, B, p) {
    const e = ease.inOutCubic(p);
    ctx.save();
    ctx.drawImage(A, 0, 0);
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.5, e * Math.hypot(W, H) * 0.56, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(B, 0, 0);
    ctx.restore();
  },
  fade(ctx, A, B, p) {
    ctx.save();
    ctx.drawImage(A, 0, 0);
    ctx.globalAlpha = ease.inOutQuad(p);
    ctx.drawImage(B, 0, 0);
    ctx.restore();
  },
};
