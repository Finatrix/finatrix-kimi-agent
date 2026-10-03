// Render a tool film: node render.mjs <tool> [--stills t1,t2,...] [--fps 30] [--from s --to s]
// Frames are drawn by the page (index.html + engine/) at exact times and piped to ffmpeg.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const PUBLIC = path.join(ROOT, '..', 'public');
const args = process.argv.slice(2);
const tool = args[0];
const opt = (k, d) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : d;
};
const FPS = Number(opt('fps', 30));
const MIME = { '.woff2': 'font/woff2', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      // Brand assets (Geist fonts, logo) are shared with the site: serve them from ../public.
      let p = path.join(ROOT, rel);
      if (!fs.existsSync(p)) p = path.join(PUBLIC, rel);
      if (!(p.startsWith(ROOT) || p.startsWith(PUBLIC)) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
        rsp.writeHead(404);
        return rsp.end();
      }
      rsp.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(p).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

const srv = await serve();
const port = srv.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--force-color-profile=srgb'] });
const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html?tool=${tool}`);
await page.waitForFunction(() => window.STUDIO_READY || window.STUDIO_ERROR, null, { timeout: 60000 });
const err = await page.evaluate(() => window.STUDIO_ERROR);
if (err) {
  console.error(err);
  process.exit(1);
}
const duration = await page.evaluate(() => window.STUDIO.duration);
const outDir = path.join(ROOT, 'out', tool);
fs.writeFileSync(path.join(outDir, 'cues.json'), JSON.stringify(await page.evaluate(() => window.STUDIO.cues()), null, 1));

if (args.includes('--audit')) {
  const issues = await page.evaluate(() => window.STUDIO.audit(0.25));
  // keep issues that persist >= 2 consecutive samples
  const key = (i) => `${i.kind}|${i.at}|${i.a}|${i.b ?? ''}`;
  const byKey = new Map();
  for (const i of issues) {
    if (!byKey.has(key(i))) byKey.set(key(i), []);
    byKey.get(key(i)).push(i);
  }
  const rows = [];
  for (const [k, list] of byKey) if (list.length >= 2) rows.push(`${list[0].T.toFixed(2)}-${list[list.length - 1].T.toFixed(2)}  ${k}${list[0].spill ? '  spill=' + list[0].spill : ''}${list[0].box ? '  ' + list[0].box : ''}`);
  console.log(rows.sort().join('\n') || 'clean');
  await browser.close();
  srv.close();
  process.exit(0);
}
const stills = opt('stills', null);
if (stills) {
  fs.mkdirSync(path.join(outDir, 'stills'), { recursive: true });
  for (const ts of stills.split(',')) {
    const t = Number(ts);
    const url = await page.evaluate(([t, f]) => window.STUDIO.jpeg(t, f, 0.9), [t, Math.round(t * FPS)]);
    fs.writeFileSync(path.join(outDir, 'stills', `t${t.toFixed(2)}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log(`stills → ${outDir}/stills`);
} else {
  const from = Number(opt('from', 0));
  const to = Number(opt('to', duration));
  const n = Math.round((to - from) * FPS);
  const out = opt('out', path.join(outDir, 'silent.mp4'));
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const t = from + i / FPS;
    const url = await page.evaluate(([t, f]) => window.STUDIO.jpeg(t, f, 0.94), [t, i]);
    const buf = Buffer.from(url.split(',')[1], 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`${tool} ${i}/${n} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log(`${tool}: ${n} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s → ${out}`);
}
await browser.close();
srv.close();
