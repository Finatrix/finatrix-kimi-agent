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

const OCR_BASE = '/careers-ocr';

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
  try {
    worker = await createWorker('eng', 1, {
      workerPath: `${OCR_BASE}/worker.min.js`,
      corePath: OCR_BASE,
      langPath: `${OCR_BASE}/lang`,
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
    });
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
    if (worker) await worker.terminate().catch(() => undefined);
  }
}
