/**
 * Reading text out of an image, on the device.
 *
 * Tesseract.js with self-hosted assets under `/careers-ocr/` — the worker, the
 * WASM core and the English language data. Nothing is uploaded: a photograph of
 * somebody's bank statement is about as sensitive as a file gets, and it never
 * leaves the tab.
 *
 * WHY THE ASSET PATH SAYS "CAREERS"
 * ---------------------------------
 * OCR arrived for résumés first, and the deployment carries `/careers-ocr/`
 * with a matching `public/_headers` entry that deliberately attaches no CSP to
 * that prefix — a blanket policy blocks the WASM the worker instantiates. The
 * path is therefore load-bearing infrastructure, not a name: renaming it means
 * moving the assets AND the headers entry in the same change, and a rename that
 * misses either one fails silently (see `workerBlobURL` below for how quietly
 * this subsystem can fail). It is shared rather than duplicated because a second
 * copy of the WASM core is 4MB of the same bytes.
 */

import { nativePlatform } from '../native/platform';

const OCR_BASE = '/careers-ocr';

/**
 * How long text recognition may make NO progress at all before it is treated as
 * dead rather than slow.
 *
 * Not a total timeout: a six-page scan on an old phone legitimately takes
 * minutes, and cutting that off would break a working feature. The timer is
 * armed at the start and reset by every progress callback Tesseract makes, so it
 * only fires when nothing has happened for half a minute — which is the shape of
 * the failure this guards against, not the shape of a slow device.
 *
 * WHY IT IS NEEDED. This subsystem fails silently by design of the platform:
 * `new Worker()` does not throw for a URL it cannot load — it returns an object
 * that never runs — so `createWorker` simply never settles and the import screen
 * spins for ever with no error, nothing in the console and nothing to report.
 * That has already happened once here (a CSP-blocked `blob:` worker, see
 * `workerBlobURL` below). The same shape would appear on iOS if WKWebView ever
 * refused to serve a worker script from the app's custom scheme. A bounded stall
 * turns "the app is broken and silent" into a sentence the user can act on.
 */
const STALL_MS = 30_000;

export class OcrError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    // The cause is carried rather than dropped. What the user is told is
    // deliberately about their photo; what a developer needs is the reason the
    // worker refused to start, and losing it turns "OCR does not work" into an
    // afternoon of guessing.
    super(message, options);
    this.name = 'OcrError';
  }
}

/**
 * Recognise text across a set of images, in order.
 *
 * One worker for the whole batch: starting Tesseract costs a WASM instantiation
 * and a language load, and paying that per page turns a six-page scan into a
 * minute of waiting.
 */
export async function ocrImages(
  images: readonly Blob[],
  onProgress?: (pct: number) => void,
): Promise<string> {
  if (!images.length) throw new OcrError('There are no pages here that can be scanned.');

  const { createWorker } = await import('tesseract.js');
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  /** Reset by Tesseract's progress callbacks; see STALL_MS. */
  let rearm: () => void = () => {};
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const starting = createWorker('eng', 1, {
      workerPath: `${OCR_BASE}/worker.min.js`,
      corePath: OCR_BASE,
      langPath: `${OCR_BASE}/lang`,
      // Android ONLY. The Android build tools decompress any `.gz` asset while
      // packaging the APK and drop the extension, so in that app the language
      // file exists only as `eng.traineddata` — asking for `eng.traineddata.gz`
      // there is a 404 and every scan fails (verified on-device). The APK is a
      // zip, so the uncompressed file costs nothing to ship.
      //
      // Nothing else behaves that way. Xcode copies `public/` into the iOS
      // bundle byte for byte, so the iOS app contains `eng.traineddata.gz` and
      // nothing else — the same file the website serves — and must therefore ask
      // for it by that name. Tesseract inflates it in the worker either way (it
      // bundles its own zlib), so the only thing this flag decides is the URL.
      // Reading the platform, not merely "is this an app", is what keeps the
      // Android workaround from silently breaking iOS.
      gzip: nativePlatform() !== 'android',
      // Load the worker from its own URL instead of the Blob shim tesseract.js
      // builds by default (`workerBlobURL` defaults to TRUE, which wraps
      // workerPath in `new Worker(URL.createObjectURL(blob))`).
      //
      // Self-hosting the assets was never enough on its own: a blob: URL is not
      // matched by `'self'`, so the CSP blocked the worker whatever the path
      // pointed at. And it blocked it SILENTLY — `new Worker()` does not throw
      // for a policy-blocked blob URL, it hands back an object that never runs.
      // The only trace is a `securitypolicyviolation` event naming worker-src;
      // from the app's side, OCR simply never answered.
      //
      // With this false the worker is fetched from /careers-ocr/worker.min.js —
      // same-origin, which `'self'` does match.
      workerBlobURL: false,
      // Only ever used to prove liveness — the payload is ignored.
      logger: () => rearm(),
    });
    // If the worker never starts, `starting` never settles. Race it against the
    // stall timer so the caller gets an error instead of an endless spinner.
    worker = await Promise.race([
      starting,
      new Promise<never>((_, reject) => {
        rearm = () => {
          clearTimeout(stallTimer);
          stallTimer = setTimeout(
            () => reject(new OcrError('Text recognition could not start on this device. Please try again.')),
            STALL_MS,
          );
        };
        rearm();
      }),
    ]);
    // The worker is up: stop watching for a stall, and stop the logger arming
    // any more timers. Recognition itself is allowed to take as long as it takes.
    clearTimeout(stallTimer);
    rearm = () => {};
    // The race is over; make sure a worker that arrives late is still cleaned up
    // rather than left holding a WASM instance for the life of the tab.
    void starting.then((late) => {
      if (late !== worker) void late.terminate().catch(() => undefined);
    }).catch(() => undefined);

    const parts: string[] = [];
    for (let i = 0; i < images.length; i += 1) {
      const { data } = await worker.recognize(images[i]);
      parts.push(data.text.trim());
      onProgress?.(Math.round(((i + 1) / images.length) * 100));
    }
    return parts.join('\n\n').trim();
  } catch (e) {
    if (e instanceof OcrError) throw e;
    throw new OcrError(
      'Text recognition failed on this image. A sharper, straighter photo usually works.',
      { cause: e },
    );
  } finally {
    clearTimeout(stallTimer);
    if (worker) await worker.terminate().catch(() => undefined);
  }
}
