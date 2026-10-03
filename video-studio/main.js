// Boots one tool film and exposes a frame-stepping API to the renderer.
import { Film } from './engine/film.js';

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
  window.STUDIO_READY = true;
}
boot().catch((e) => {
  window.STUDIO_ERROR = String((e && e.stack) || e);
});
