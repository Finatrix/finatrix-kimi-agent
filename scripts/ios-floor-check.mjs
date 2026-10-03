#!/usr/bin/env node
/**
 * Does the shipped web bundle still run on the OLDEST iOS the app declares?
 *
 *   node scripts/ios-floor-check.mjs <simulator-udid-or-name> [bundle-dir]
 *
 * The app's iOS floor is 15.4 (IPHONEOS_DEPLOYMENT_TARGET, the Vite build
 * target and `public/compat.js` all say so), and nothing else exercises it:
 * Playwright's WebKit is current WebKit, and the iOS Simulator runtime that
 * ships with Xcode is current iOS. This opens every route in Mobile Safari on a
 * real iOS 15.4 runtime and reports, per route, any uncaught error or console
 * error, any horizontal overflow, a blank page, and whether the collapsed
 * sections and the Expenses "+" → add-transaction flow still work.
 *
 * WHAT THIS DOES NOT COVER. It tests the iOS 15.4 *engine* with the web bundle
 * in Mobile Safari; it does not run the native shell (Capacitor plugins,
 * status bar, keyboard, camera). Launching the real app on that runtime shows
 * the shell starts and renders; the rest needs a device.
 *
 * SETUP. Xcode 26 no longer lists iOS 15 runtimes, but Apple still serves
 * them. See docs/IOS.md §9 "Testing the iOS 15.4 floor" for the one-time
 * install, then:
 *
 *   xcrun simctl create "iOS 15.4 SE" com.apple.CoreSimulator.SimDeviceType.iPhone-SE-3rd-generation com.apple.CoreSimulator.SimRuntime.iOS-15-4
 *   xcrun simctl boot "iOS 15.4 SE"
 *
 * The harness serves the bundle with the CSP meta tag removed and a reporter
 * injected so it can read errors back. That is a test-only copy: nothing here
 * is written into the bundle on disk.
 *
 * Exit status: 0 when every route is clean, 1 otherwise.
 */
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const [device, bundleArg] = process.argv.slice(2);
if (!device) {
  console.error('usage: node scripts/ios-floor-check.mjs <simulator-udid-or-name> [bundle-dir]');
  process.exit(2);
}
const root = resolve(bundleArg || 'dist');
if (!existsSync(join(root, 'index.html'))) {
  console.error(`No index.html in ${root}. Build first (npm run build), or pass the bundle directory.`);
  process.exit(2);
}

const ALL_ROUTES = [
  '/', '/tools/dashboard', '/tools/budget', '/tools/expenses', '/tools/goals', '/tools/networth',
  '/tools/investmatch', '/tools/parksmart', '/tools/peercompare', '/tools/lifemap',
  '/login', '/signup', '/welcome', '/privacy', '/terms', '/support', '/about', '/faq', '/help',
  '/learn', '/compare', '/pricing', '/security',
];
/** FX_ROUTES=/,/tools/budget limits a run while debugging one page. */
const ROUTES = process.env.FX_ROUTES ? process.env.FX_ROUTES.split(',') : ALL_ROUTES;

/** Runs inside Mobile Safari. ES2017 on purpose — it must not be the thing that fails on an old engine. */
const REPORTER = `(function () {
  var errs = [];
  function note(kind, m) { errs.push(kind + ': ' + String(m).slice(0, 240)); }
  window.addEventListener('error', function (e) { note('error', (e.message || 'resource') + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno); }, true);
  window.addEventListener('unhandledrejection', function (e) { note('rejection', e.reason && (e.reason.stack || e.reason.message || e.reason)); });
  var ce = console.error; console.error = function () { note('console.error', [].slice.call(arguments).join(' ')); return ce.apply(console, arguments); };
  function post(o) { try { fetch('/__r', { method: 'POST', body: JSON.stringify(o), keepalive: true }); } catch (e) {} }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function setVal(el, v) {
    var proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function feat() {
    var f = {};
    try { f.dvh = CSS.supports('height', '100dvh'); } catch (e) { f.dvh = 'err'; }
    f.decompressionStream = typeof DecompressionStream; f.abortTimeout = typeof (window.AbortSignal && AbortSignal.timeout);
    f.structuredClone = typeof structuredClone; f.toSorted = typeof [].toSorted;
    return f;
  }
  async function scenario() {
    var out = {};
    var tog = [].slice.call(document.querySelectorAll('button[aria-expanded="false"]')).filter(function (b) { return /calculation|examples|FAQ|explor|what.?if/i.test(b.textContent || ''); })[0];
    if (tog) { tog.click(); await sleep(500); out.disclosure = tog.getAttribute('aria-expanded') === 'true' ? 'ok' : 'FAILED'; }
    if (location.pathname === '/tools/expenses') {
      var fab = document.querySelector('[aria-label="Add expense"]');
      out.fab = fab ? 'ok' : 'MISSING';
      if (fab) {
        fab.click(); await sleep(900);
        var dlgs = [].slice.call(document.querySelectorAll('[role="dialog"]'));
        var dlg = dlgs.filter(function (d) { return d.querySelector('input'); })[0];
        out.sheet = dlg ? 'ok' : 'MISSING';
        if (dlg) {
          var amt = [].slice.call(dlg.querySelectorAll('input')).filter(function (i) { return i.inputMode === 'decimal'; })[0];
          if (amt) setVal(amt, '340');
          var save = [].slice.call(dlg.querySelectorAll('button')).filter(function (b) { return /^\\s*(save|add)/i.test(b.textContent || ''); }).pop();
          if (save) { await sleep(300); save.click(); await sleep(1200); }
          out.addFlow = amt && save && /340/.test(document.body.innerText) && !document.body.contains(dlg) ? 'ok' : 'FAILED';
        }
      }
    }
    return out;
  }
  window.addEventListener('load', function () {
    setTimeout(async function () {
      var sc = {}; try { sc = await scenario(); } catch (e) { sc = { scenarioError: String(e) }; }
      var de = document.documentElement; var m = navigator.userAgent.match(/OS [0-9_]+/);
      post({ path: location.pathname, title: document.title.slice(0, 40), blank: !(document.getElementById('root') || {}).childElementCount,
        overflowPx: Math.max(0, de.scrollWidth - de.clientWidth), os: m && m[0], feat: feat(), scenario: sc, errors: errs.slice(0, 6), errorCount: errs.length });
    }, 4500);
  });
})();`;

const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
const reports = [];
let requested = '';

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/__r') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try { reports.push({ ...JSON.parse(body), requested }); } catch { /* a malformed report is a missing route, reported below */ }
      res.writeHead(204).end();
    });
    return;
  }
  let file = join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    if (/\.[a-z0-9]{2,5}$/i.test(url.pathname)) { res.writeHead(404).end('not found'); return; }
    file = join(root, 'index.html'); // SPA fallback, like the Worker
  }
  let body = readFileSync(file);
  if (file.endsWith('index.html')) {
    body = body.toString('utf8')
      .replace(/<meta[^>]+http-equiv="Content-Security-Policy"[^>]*>/i, '')
      .replace(/<head>/i, `<head><script>${REPORTER}</script>`);
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(body);
});

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
// A fresh port per run is a fresh origin. The app registers a service worker that
// serves hashed assets cache-first, so reusing an origin tests whatever an
// EARLIER run cached — a bundle edited in place passed as if it were unchanged.
await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
const PORT = server.address().port;

for (const route of ROUTES) {
  const before = reports.length;
  requested = route;
  try {
    execFileSync('xcrun', ['simctl', 'openurl', device, `http://localhost:${PORT}${route}`], { stdio: 'ignore' });
  } catch {
    console.error(`Could not open ${route} on "${device}" — is the Simulator booted?`);
    server.close();
    process.exit(2);
  }
  for (let waited = 0; reports.length === before && waited < 25_000; waited += 500) await sleep(500);
}
server.close();

let failures = 0;
const os = new Set(reports.map((r) => r.os).filter(Boolean));
console.log(`iOS Safari engine: ${[...os].join(', ') || 'unknown'} | bundle: ${root}\n`);
for (const route of ROUTES) {
  // Keyed by the route we asked for: a redirect lands on a different path.
  const r = reports.find((x) => x.requested === route);
  const problems = [];
  if (!r) problems.push('no report');
  else {
    if (r.blank) problems.push('blank page');
    if (r.overflowPx) problems.push(`${r.overflowPx}px horizontal overflow`);
    if (r.errorCount) problems.push(...r.errors);
    for (const [k, v] of Object.entries(r.scenario || {})) if (/FAILED|MISSING|Error/i.test(String(v)) || k === 'scenarioError') problems.push(`${k}: ${v}`);
  }
  if (problems.length) failures++;
  const checks = r ? Object.entries(r.scenario || {}).map(([k, v]) => `${k}=${v}`).join(' ') : '';
  console.log(`${problems.length ? '✗' : '✓'} ${route.padEnd(20)} ${checks}${problems.length ? ` — ${problems.join('; ')}` : ''}`);
}
const first = reports[0]?.feat;
if (first) console.log(`\nEngine features: ${Object.entries(first).map(([k, v]) => `${k}=${v}`).join(' ')}`);
console.log(failures ? `\n${failures} route(s) failed on ${[...os].join(', ')}.` : `\nAll ${ROUTES.length} routes are clean on ${[...os].join(', ')}.`);
process.exitCode = failures ? 1 : 0;
