// Renders src/film.html frame by frame.
//   node render.mjs stills 0,27,95      → renders/review/f0000.png …
//   node render.mjs video               → renders/master/picture.mov (PNG-in-MOV, lossless)
// The final MP4 (with audio) is assembled by build.sh.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { if (!req.url.endsWith('favicon.ico')) console.error('404', req.url); res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const port = server.address().port;

const [mode = 'stills', list = '0'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none'],
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => { console.error('PAGEERR', e.message); process.exit(1); });
page.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', m.text()));
const FILM_PAGE = process.env.FILM || 'film';
await page.goto(`http://localhost:${port}/src/${FILM_PAGE}.html`);
await page.waitForFunction(() => window.FILM && window.FILM.ready, null, { timeout: 60000 });
const frames = await page.evaluate(() => window.FILM.frames);

async function shoot(f) {
  await page.evaluate((f) => window.FILM.seek(f), f);
  // two rAFs so style, image transforms and the grain canvas are committed
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
}

if (mode === 'rects') {
  await page.evaluate((f) => window.FILM.seek(f), Number(list));
  console.log(JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.badge, .badge svg, .disc, .tag, .word')].map((e) => { const r = e.getBoundingClientRect(); return [e.className.baseVal ?? e.className, Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; }))));
} else if (mode === 'safe') {
  // Every readable piece of copy must sit inside the phone-safe area:
  // 90 px left/right, 160 px top, 260 px bottom.
  const bad = {};
  for (let f = 0; f < frames; f++) {
    await page.evaluate((f) => window.FILM.seek(f), f);
    const v = await page.evaluate(() => {
      const op = (e) => { let o = 1; for (; e && e.id !== 'stage'; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.visibility === 'hidden') return 0; o *= +cs.opacity; } return o; };
      return [...document.querySelectorAll('.hl .in, .kick, .note, .chip, #word, .word, .tag, .cta, .disc, .badge, .mchip, .bigchip, .xchip')]
        .filter((e) => op(e) > 0.6)
        .map((e) => { const rg = document.createRange(); rg.selectNodeContents(e);
          // a range over inline SVG reports the glyph's own coordinate box, so measure the element
          const r = e.querySelector('svg') ? e.getBoundingClientRect() : rg.getBoundingClientRect();
          // a line's mask (overflow: hidden) clips what is outside it
          const m = e.closest('.ln'); if (m) { const c = m.getBoundingClientRect(); if (r.bottom <= c.top || r.top >= c.bottom) return null; return { t: e.textContent.trim().slice(0, 28), l: r.left, r: r.right, top: Math.max(r.top, c.top), b: Math.min(r.bottom, c.bottom) }; } return { t: e.textContent.trim().slice(0, 28), l: r.left, r: r.right, top: r.top, b: r.bottom }; })
        .filter((r) => r && (r.l < 89.5 || r.r > 990.5 || r.top < 159.5 || r.b > 1660.5));
    });
    for (const x of v) (bad[x.t] ||= []).push(`${f}[${Math.round(x.l)},${Math.round(x.top)}-${Math.round(x.r)},${Math.round(x.b)}]`);
  }
  for (const [t, fs] of Object.entries(bad)) console.log(JSON.stringify(t), fs.length, 'frames, e.g.', fs.slice(0, 3).join(' '));
  console.log('safe-zone check done;', Object.keys(bad).length, 'offending strings');
} else if (mode === 'stills') {
  const dir = path.join(ROOT, 'renders/review');
  fs.mkdirSync(dir, { recursive: true });
  const want = list === 'all' ? [...Array(frames).keys()] : list.split(',').map(Number);
  for (const f of want) fs.writeFileSync(path.join(dir, `f${String(f).padStart(4, '0')}.png`), await shoot(f));
  console.log('stills', want.length);
} else {
  const out = path.join(ROOT, `renders/master/${FILM_PAGE === 'film' ? 'picture' : FILM_PAGE + '-picture'}.mov`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'png', '-i', '-',
    '-c:v', 'png', '-pix_fmt', 'rgb24', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let f = 0; f < frames; f++) {
    const buf = await shoot(f);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 60 === 0) console.log(`frame ${f}/${frames}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log('wrote', out);
}
await browser.close();
server.close();
