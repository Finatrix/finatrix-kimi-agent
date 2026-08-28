/**
 * OCR fallback via Tesseract.js. Only runs when a PDF has no usable text
 * layer (scanned/image-only) and the user has OCR enabled. Everything is
 * self-hosted under /careers-ocr/ (worker, WASM core, English language
 * data), so there are no third-party calls.
 *
 * Self-hosting is necessary for the CSP but was NOT sufficient — see
 * `workerBlobURL` below, which is the option that actually decides whether the
 * worker is allowed to start.
 */

import { CareersError } from '../utils/errors';

const OCR_BASE = '/careers-ocr';

export async function ocrImages(
  images: Blob[],
  onProgress?: (pct: number) => void
): Promise<string> {
  if (!images.length) {
    throw new CareersError('extraction', 'This document has no pages that can be scanned.');
  }
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
      // from the app's side, OCR simply never answered, and the catch below
      // told the user their scan was too unclear.
      //
      // With this false, the worker is fetched from /careers-ocr/worker.min.js —
      // same-origin, which `'self'` does match. Verified in Chromium against
      // both the current policy and the one that preceded `worker-src`: the
      // blob form violates worker-src under each, the path form under neither.
      workerBlobURL: false,
    });
    const parts: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const { data } = await worker.recognize(images[i]);
      parts.push(data.text.trim());
      onProgress?.(Math.round(((i + 1) / images.length) * 100));
    }
    return parts.join('\n\n').trim();
  } catch (e) {
    if (e instanceof CareersError) throw e;
    throw new CareersError('extraction', 'Text recognition failed on this scanned document. Try a clearer copy or a text-based PDF.');
  } finally {
    if (worker) await worker.terminate().catch(() => undefined);
  }
}
