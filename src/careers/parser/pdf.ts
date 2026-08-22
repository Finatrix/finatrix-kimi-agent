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

/**
 * Page ceiling for a résumé. Deliberately far tighter than the statement
 * importer's 500: `numPages` comes from the file's own page tree, so a few
 * kilobytes of PDF can declare tens of thousands of pages and freeze the tab on
 * a document a user was invited to upload. No real CV is close to 60 pages, and
 * a portfolio that is gets an honest message rather than a hung browser.
 */
const MAX_RESUME_PAGES = 60;

async function openDocument(bytes: ArrayBuffer) {
  try {
    const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
    if (doc.numPages > MAX_RESUME_PAGES) {
      void doc.loadingTask.destroy();
      throw new CareersError(
        'validation',
        `This PDF has ${doc.numPages} pages. Please upload a résumé of ${MAX_RESUME_PAGES} pages or fewer.`,
      );
    }
    return doc;
  } catch (e) {
    // A page-count rejection is already the right answer for the user; the
    // catch below exists to translate pdf.js failures, not to re-label ours.
    if (e instanceof CareersError) throw e;
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
