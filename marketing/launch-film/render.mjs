// Render a scene of the launch film to video, frame by frame, in headless Chromium.
//
//   node render.mjs                      the 3D finale → out/finale.mp4 (with voiceover + score if present)
//   node render.mjs --stills 2.5,8,20.7  single frames → out/<name>-<t>.jpg, for review
//   node render.mjs --scale 0.5          half-resolution draft
//   node render.mjs --from 15 --to 22    a slice
//   node render.mjs --cues               only write audio/cues/<name>.json (the sound's cue sheet)
//   node render.mjs --page inserts/calendar.html?month=sep --name month-loop
//                                        an insert shot → out/month-loop.mp4
//
// A page renders a frame only when told to (window.__scene.renderAt), so the
// output is deterministic and never drops frames, however slow the GPU.

import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..'); // repo root: the page reads public/images/finatrix-lockup.png
const OUT = join(HERE, 'out');

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));
const scale = Number(args.scale ?? 1);
const width = Math.round(1920 * scale), height = Math.round(1080 * scale);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  const path = normalize(join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!path.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(await readFile(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PAGE = args.page ?? 'finale/index.html';
const NAME = args.name ?? 'finale';
const url = `http://127.0.0.1:${server.address().port}/marketing/launch-film/${PAGE}`;

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync'],
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error(`[page] ${m.text()}`); });
page.on('pageerror', (e) => console.error(`[page] ${e.message}`));
await page.goto(url);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180_000 });
const { duration, fps, cues } = await page.evaluate(() => window.__scene);
await mkdir(OUT, { recursive: true });
// Sound is cut to the same cue sheet the picture uses, derived cues included.
await mkdir(join(HERE, 'audio', 'cues'), { recursive: true });
await writeFile(join(HERE, 'audio', 'cues', `${NAME}.json`), `${JSON.stringify({ duration, fps, cues }, null, 2)}\n`);
if (args.cues) { await browser.close(); server.close(); process.exit(0); }

const shoot = async (t) => {
  await page.evaluate((time) => window.__scene.renderAt(time), t);
  return page.screenshot({ type: 'jpeg', quality: 96 });
};

if (args.stills) {
  for (const t of String(args.stills).split(',').map(Number)) {
    const file = join(OUT, `${NAME === 'finale' ? 'still' : NAME}-${t.toFixed(2)}.jpg`);
    await writeFile(file, await shoot(t));
    console.log(file);
  }
} else {
  const from = Number(args.from ?? 0), to = Math.min(Number(args.to ?? duration), duration);
  const frames = Math.round((to - from) * fps);
  const silent = join(OUT, scale === 1 && !args.from && !args.to ? `${NAME}-picture.mp4` : `${NAME}-draft-${from}-${to}.mp4`);
  const ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
  const started = Date.now();
  for (let f = 0; f < frames; f++) {
    const buf = await shoot(from + f / fps);
    if (!ffmpeg.stdin.write(buf)) await new Promise((r) => ffmpeg.stdin.once('drain', r));
    if (f % 30 === 0) {
      const rate = (f + 1) / ((Date.now() - started) / 1000);
      console.log(`frame ${f}/${frames}  ${rate.toFixed(2)} fps  eta ${((frames - f) / rate / 60).toFixed(1)} min`);
    }
  }
  ffmpeg.stdin.end();
  await new Promise((r, j) => ffmpeg.on('close', (code) => (code === 0 ? r() : j(new Error(`ffmpeg exited ${code}`)))));
  console.log(silent);

  const mix = join(HERE, 'audio', `${NAME}-mix.wav`);
  if (silent.endsWith(`${NAME}-picture.mp4`) && existsSync(mix)) {
    const final = join(OUT, `${NAME}.mp4`);
    await new Promise((r, j) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', mix, '-map', '0:v', '-map', '1:a',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', final], { stdio: 'inherit' })
      .on('close', (code) => (code === 0 ? r() : j(new Error(`mux exited ${code}`)))));
    console.log(final);
  }
}

await browser.close();
server.close();
