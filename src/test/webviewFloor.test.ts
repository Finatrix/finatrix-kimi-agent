import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

/**
 * The Android app checks the WebView version at launch and offers an update
 * below MainActivity.MIN_WEBVIEW_MAJOR. The gate is only honest while it
 * equals the build target, so the two are read from source and compared.
 */
const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

describe('Android WebView floor', () => {
  const activity = read('android/app/src/main/java/co/finatrix/app/MainActivity.java');
  const vite = read('vite.config.ts');

  it('pins the build target explicitly', () => {
    expect(vite).toMatch(/target:\s*\[[^\]]*"chrome\d+"/);
  });

  it('gates at exactly the Chrome version the bundle is compiled for', () => {
    const chrome = Number(/"chrome(\d+)"/.exec(vite)?.[1]);
    const gate = Number(/MIN_WEBVIEW_MAJOR\s*=\s*(\d+)/.exec(activity)?.[1]);
    expect(chrome).toBeGreaterThan(0);
    expect(gate).toBe(chrome);
  });

  it('reads the version from the WebView in use and offers the store page, not a dead end', () => {
    expect(activity).toMatch(/WebSettings\.getDefaultUserAgent/);
    expect(activity).toMatch(/market:\/\/details\?id=/);
    expect(activity).toMatch(/webview_outdated_close/);
    expect(activity).toMatch(/setCancelable\(false\)/);
    expect(activity).toMatch(/getButton\(AlertDialog\.BUTTON_POSITIVE\)\.setOnClickListener/);
  });

  it('loads the missing built-ins before the module graph starts', () => {
    const html = read('index.html');
    expect(html.indexOf('src="/compat.js"')).toBeGreaterThan(0);
    expect(html.indexOf('src="/compat.js"')).toBeLessThan(html.indexOf('src="/src/main.tsx"'));
    const result = runInNewContext(`Array.prototype.at = undefined; Object.hasOwn = undefined; ${read('public/compat.js')}; [1, 2, 3].at(-1) + Number(Object.hasOwn({ x: 1 }, 'x'))`);
    expect(result).toBe(4);
  });
});
