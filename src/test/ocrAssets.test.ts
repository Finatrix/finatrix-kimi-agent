/**
 * Where OCR loads its language data from, per platform.
 *
 * The Android build tools decompress `.gz` assets while packaging and drop the
 * extension, so THAT app has `eng.traineddata` and a 404 for
 * `eng.traineddata.gz` (found on the emulator: every statement photo failed to
 * scan in the app while the website worked).
 *
 * Nothing else does that. Xcode copies `public/` into the iOS bundle verbatim,
 * so the iOS app — like the website — contains only `eng.traineddata.gz`, and
 * the Android workaround applied there would 404 every scan instead. These
 * three cases are the whole reason `ocr.ts` reads the platform rather than
 * `isNativeApp()`; `ios.test.ts` guards the file list the claim rests on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A stand-in worker. The parameters are declared even though the happy path
 * ignores them, because the stall tests below replace the implementation and
 * need the real arity — `createWorker(lang, oem, options)` — to reach `options.logger`.
 */
type WorkerOptions = { logger?: () => void };
type FakeWorker = {
  recognize: () => Promise<{ data: { text: string } }>;
  terminate: () => Promise<void>;
};

const h = vi.hoisted(() => ({
  // The arity lives in the type, not in unused parameters: the default
  // implementation has no use for them, and the stall tests below supply their
  // own implementation that does.
  createWorker: vi.fn<(lang: string, oem: number, options: WorkerOptions) => Promise<FakeWorker>>(
    async () => ({
      recognize: async () => ({ data: { text: 'PAID 340' } }),
      terminate: async () => {},
    }),
  ),
}));
vi.mock('tesseract.js', () => ({ createWorker: h.createWorker }));

import { ocrImages } from '../lib/ocr';

type CapWindow = Window & {
  Capacitor?: { isNativePlatform: () => boolean; getPlatform: () => string };
};

/** Pretend to be one of the installed apps, the way Capacitor's bridge does. */
const asApp = (platform: 'android' | 'ios') => {
  (window as CapWindow).Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => platform,
  };
};

afterEach(() => {
  delete (window as CapWindow).Capacitor;
  h.createWorker.mockClear();
});

const optionsUsed = () => (h.createWorker.mock.calls[0] as unknown as [string, number, Record<string, unknown>])[2];

describe('OCR language data', () => {
  it('downloads the gzipped file on the website', async () => {
    await ocrImages([new Blob(['x'])]);
    expect(optionsUsed()).toMatchObject({ gzip: true, langPath: '/careers-ocr/lang', workerBlobURL: false });
  });

  it('reads the plain file the APK actually contains in the Android app', async () => {
    asApp('android');
    expect(await ocrImages([new Blob(['x'])])).toBe('PAID 340');
    expect(optionsUsed()).toMatchObject({ gzip: false, langPath: '/careers-ocr/lang' });
  });

  it('reads the gzipped file the iOS bundle actually contains', async () => {
    asApp('ios');
    expect(await ocrImages([new Blob(['x'])])).toBe('PAID 340');
    expect(optionsUsed()).toMatchObject({ gzip: true, langPath: '/careers-ocr/lang' });
  });

  it('never loads the worker from a blob: URL — the CSP ships in index.html, so it applies in both apps', async () => {
    asApp('ios');
    await ocrImages([new Blob(['x'])]);
    expect(optionsUsed()).toMatchObject({ workerBlobURL: false, workerPath: '/careers-ocr/worker.min.js' });
  });
});

/**
 * A worker that never starts.
 *
 * `new Worker()` does not throw for a script it cannot load — it hands back an
 * object that never runs — so `createWorker` never settles and the import screen
 * spins for ever with nothing logged anywhere. That has already happened once in
 * production (a CSP-blocked `blob:` worker) and is the shape iOS would fail in if
 * WKWebView refused a worker from the app's custom scheme.
 */
describe('a worker that never starts', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('gives up with a readable error instead of hanging for ever', async () => {
    // Never resolves, and never calls the progress logger — exactly the
    // silent-failure mode.
    h.createWorker.mockImplementationOnce(() => new Promise<never>(() => {}));
    const scan = ocrImages([new Blob(['x'])]);
    const settled = expect(scan).rejects.toThrow(/could not start/i);
    await vi.advanceTimersByTimeAsync(31_000);
    await settled;
  });

  it('keeps waiting for a slow device, as long as it is still making progress', async () => {
    let finish: ((w: FakeWorker) => void) | undefined;
    h.createWorker.mockImplementationOnce((_lang: string, _oem: number, opts: WorkerOptions) => {
      // A slow but healthy start: progress every 20s, well inside the stall
      // window, for far longer than any fixed total timeout would allow.
      for (const at of [20_000, 40_000, 60_000, 80_000]) setTimeout(() => opts.logger?.(), at);
      return new Promise<FakeWorker>((resolve) => {
        finish = resolve;
        setTimeout(() => resolve({
          recognize: async () => ({ data: { text: 'PAID 340' } }),
          terminate: async () => {},
        }), 90_000);
      });
    });
    const scan = ocrImages([new Blob(['x'])]);
    await vi.advanceTimersByTimeAsync(95_000);
    expect(finish).toBeDefined();
    await expect(scan).resolves.toBe('PAID 340');
  });
});
