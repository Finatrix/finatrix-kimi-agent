// Boots one tool film and exposes a frame-stepping API to the renderer.
import { Film } from './engine/film.js';
import { AUDIT, W as CW, H as CH } from './engine/core.js';

const tool = new URLSearchParams(location.search).get('tool') || 'budget';

async function boot() {
  await Promise.all([
    document.fonts.load('800 100px Geist'),
    document.fonts.load('400 100px Geist'),
    document.fonts.load('italic 400 100px "Instrument Serif"'),
    document.fonts.load('600 100px "Geist Mono"'),
  ]);
  const logo = await createImageBitmap(await (await fetch('images/finatrix-logo.png')).blob(), { resizeWidth: 600, resizeHeight: 600, resizeQuality: 'high' });
  const timeline = await (await fetch(`out/${tool}/timeline.json`)).json();
  const story = await import(`./stories/${tool}.js`);
  const scenes = story.default({ timeline, logo });
  const film = new Film(timeline, scenes, { logo, tool });
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  window.STUDIO = {
    duration: film.duration,
    cues: () => ({ events: film.events(), sections: film.sections(), scenes: film.scenes.map((s) => ({ at: s.at, start: s.start, end: s.end, mood: s.mood || 'groove' })) }),
    draw: (t, f) => film.frame(ctx, t, f),
    jpeg: (t, f, q = 0.93) => {
      film.frame(ctx, t, f);
      return canvas.toDataURL('image/jpeg', q);
    },
  };
  const abuf = new OffscreenCanvas(1080, 1920);
  window.STUDIO.audit = (step = 0.25) => {
    const out = [];
    const ov = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
    const area = (a) => (a[2] - a[0]) * (a[3] - a[1]);
    for (let T = 0; T < film.duration; T += step) {
      const sc = film.scenes[film.sceneAt(T)];
      if (T - sc.start < 0.35 || sc.end - T < 0.3) continue; // skip transition windows
      AUDIT.on = true;
      AUDIT.texts = [];
      AUDIT.rects = [];
      film.renderScene(sc, T, Math.round(T * 30), abuf);
      AUDIT.on = false;
      const tx = AUDIT.texts.filter((t) => t.scale > 0.97 && t.scale < 1.6 && t.rot < 0.09 && t.box[3] > 0 && t.box[1] < CH && t.box[2] > 0 && t.box[0] < CW);
      for (let i = 0; i < tx.length; i++) {
        const a = tx[i];
        const b0 = a.box;
        if (b0[0] < 14 || b0[2] > CW - 14 || b0[1] < 0 || b0[3] > CH) out.push({ T, at: sc.at, kind: 'edge', a: a.str, box: b0.map(Math.round) });
        for (let j = i + 1; j < tx.length; j++) {
          const b = tx[j];
          const o = ov(b0, b.box);
          if (o > 0.12 * Math.min(area(b0), area(b.box))) out.push({ T, at: sc.at, kind: 'text-overlap', a: a.str, b: b.str });
        }
        // container: smallest rect containing the text centre that is bigger than the text
        const cx = (b0[0] + b0[2]) / 2;
        const cy = (b0[1] + b0[3]) / 2;
        const cands = AUDIT.rects.filter((r) => cx > r[0] && cx < r[2] && cy > r[1] && cy < r[3] && area(r) > area(b0) * 1.2);
        if (cands.length) {
          const r = cands.sort((p, q) => area(p) - area(q))[0];
          const spill = Math.max(r[0] - b0[0], b0[2] - r[2], r[1] - b0[1], b0[3] - r[3]);
          if (spill > 4) out.push({ T, at: sc.at, kind: 'overflow', a: a.str, spill: Math.round(spill) });
        }
      }
    }
    return out;
  };
  window.STUDIO_READY = true;
}
boot().catch((e) => {
  window.STUDIO_ERROR = String((e && e.stack) || e);
});
