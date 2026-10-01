import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The Android app checks the WebView version at launch and offers an update
 * below MainActivity.MIN_WEBVIEW_MAJOR — because below the engines the bundle
 * is compiled for, it does not degrade, it renders nothing (measured: WebView
 * 91 stops at the first `Array.prototype.at`). The gate is only honest while it
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
    expect(activity).toMatch(/webview_outdated_continue/);
  });
});
