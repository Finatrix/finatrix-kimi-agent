/**
 * OCR fallback via Tesseract.js. Only runs when a PDF has no usable text
 * layer (scanned/image-only) and the user has OCR enabled. Everything is
 * self-hosted under /careers-ocr/ (worker, WASM core, English language
 * data) so it works under the strict CSP with no third-party calls.
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
