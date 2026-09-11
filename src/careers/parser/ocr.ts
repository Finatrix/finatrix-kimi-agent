/**
 * OCR for Careers documents — a scanned or photographed résumé.
 *
 * The worker setup itself lives in `src/lib/ocr.ts`, shared with the Expense
 * Tracker's statement import. This is the Careers-facing wrapper: it exists to
 * translate the failure into a `CareersError`, which is the error the rest of
 * this feature knows how to present.
 */

import { ocrImages as runOcr } from '../../lib/ocr';
import { CareersError } from '../utils/errors';

export async function ocrImages(
  images: Blob[],
  onProgress?: (pct: number) => void
): Promise<string> {
  if (!images.length) {
    throw new CareersError('extraction', 'This document has no pages that can be scanned.');
  }
  try {
    return await runOcr(images, onProgress);
  } catch {
    throw new CareersError('extraction', 'Text recognition failed on this scanned document. Try a clearer copy or a text-based PDF.');
  }
}
