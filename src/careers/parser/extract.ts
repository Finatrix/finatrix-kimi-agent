/**
 * Extraction orchestrator: file in, clean text out.
 *
 * Routing: PDF → text layer first, OCR only when the text layer is missing
 * or trivially small (never OCR a normal PDF). DOCX → mammoth. Legacy DOC →
 * binary run scan (or mammoth when it is secretly OOXML). Format modules are
 * loaded dynamically so pdfjs/mammoth/tesseract stay out of the main bundle.
 */

import type { ExtractionResult } from '../types';
import { CareersError } from '../utils/errors';
import { sanitizeText } from '../utils/sanitize';
import { validateResumeFile } from './validate';

/** Below this many characters a PDF is treated as image-only. */
const MIN_TEXT_CHARS = 120;

export interface ExtractOptions {
  /** Allow the OCR fallback for image-only PDFs. */
  ocrEnabled: boolean;
  /** OCR progress 0–100 (OCR is by far the slowest path). */
  onOcrProgress?: (pct: number) => void;
}

export async function extractResumeText(
  file: File,
  { ocrEnabled, onOcrProgress }: ExtractOptions
): Promise<ExtractionResult> {
  const { kind } = await validateResumeFile(file);
  const bytes = await file.arrayBuffer();

  if (kind === 'pdf') {
    const { extractPdfText, renderPdfPages } = await import('./pdf');
    const { text, pages } = await extractPdfText(bytes);
    if (text.length >= MIN_TEXT_CHARS) {
      return { text: finalize(text), method: 'pdf-text', pages };
    }
    if (!ocrEnabled) {
      throw new CareersError(
        'validation',
        'This PDF contains no selectable text (it looks scanned). Enable OCR in Careers → Settings or upload a text-based PDF.'
      );
    }
    const { ocrImages } = await import('./ocr');
    const images = await renderPdfPages(bytes);
    const ocrText = await ocrImages(images, onOcrProgress);
    if (ocrText.length < MIN_TEXT_CHARS) {
      throw new CareersError(
        'extraction',
        'OCR could not recover readable text from this scanned PDF. Try a clearer scan or a text-based export.'
      );
    }
    return { text: finalize(ocrText), method: 'ocr', pages };
  }

  if (kind === 'docx') {
    const { extractDocxText } = await import('./docx');
    const text = await extractDocxText(bytes);
    if (text.length < MIN_TEXT_CHARS) {
      throw new CareersError('extraction', 'This document appears to be empty. Please check the file and try again.');
    }
    return { text: finalize(text), method: 'docx', pages: null };
  }

  // Legacy binary .doc
  const { extractDocText } = await import('./doc');
  return { text: finalize(extractDocText(bytes)), method: 'doc', pages: null };
}

function finalize(text: string): string {
  const clean = sanitizeText(text);
  if (clean.length < MIN_TEXT_CHARS) {
    throw new CareersError('extraction', 'Too little readable text was found in this file to analyse.');
  }
  return clean;
}
