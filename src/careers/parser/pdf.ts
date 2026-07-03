/**
 * PDF text extraction via pdfjs-dist (the same engine `pdf-parse` wraps,
 * usable in the browser). Text extraction always runs first; rendering pages
 * to bitmaps for the OCR fallback only happens when a PDF has no usable
 * text layer.
 */

import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { CareersError } from '../utils/errors';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface PdfExtraction {
  text: string;
  pages: number;
}

async function openDocument(bytes: ArrayBuffer) {
  try {
    return await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
  } catch (e) {
    const name = (e as { name?: string })?.name ?? '';
    if (name === 'PasswordException') {
      throw new CareersError('validation', 'This PDF is password-protected. Please remove the password and upload again.');
    }
    if (name === 'InvalidPDFException') {
      throw new CareersError('validation', 'This PDF appears to be corrupted and cannot be read.');
    }
    throw new CareersError('extraction', 'Could not open this PDF. It may be damaged — try re-exporting it.');
  }
}

/** Extract the text layer of every page, preserving line breaks. */
export async function extractPdfText(bytes: ArrayBuffer): Promise<PdfExtraction> {
  const doc = await openDocument(bytes);
  try {
    const parts: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      let line = '';
      const lines: string[] = [];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        line += item.str;
        if (item.hasEOL) {
          lines.push(line);
          line = '';
        } else if (item.str && !item.str.endsWith(' ')) {
          line += ' ';
        }
      }
      if (line.trim()) lines.push(line);
      parts.push(lines.join('\n'));
    }
    return { text: parts.join('\n\n').trim(), pages: doc.numPages };
  } finally {
    void doc.loadingTask.destroy();
  }
}

/**
 * Render PDF pages to PNG blobs for the OCR fallback. Capped page count and
 * moderate scale keep memory in check on phones.
 */
export async function renderPdfPages(
  bytes: ArrayBuffer,
  maxPages = 6
): Promise<Blob[]> {
  const doc = await openDocument(bytes);
  try {
    const blobs: Blob[] = [];
    const count = Math.min(doc.numPages, maxPages);
    for (let p = 1; p <= count; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new CareersError('extraction', 'Could not prepare this PDF for OCR on this device.');
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      canvas.width = 0;
      canvas.height = 0;
      if (blob) blobs.push(blob);
    }
    return blobs;
  } finally {
    void doc.loadingTask.destroy();
  }
}
