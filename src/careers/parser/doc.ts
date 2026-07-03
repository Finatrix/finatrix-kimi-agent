/**
 * Legacy .doc (OLE2 binary Word) text extraction.
 *
 * There is no maintained browser library for the 1997 binary format, but its
 * text is stored as plain runs of Windows-1252 or UTF-16LE inside the
 * compound file. Scanning for those runs recovers the prose of virtually all
 * real-world resumes; if too little legible text comes out we fail with a
 * clear "please convert" message instead of feeding garbage to the AI.
 */

import { CareersError } from '../utils/errors';

const MIN_LEGIBLE_CHARS = 200;
const MIN_RUN = 24; // shorter runs are usually metadata/junk

function isPrintable(code: number): boolean {
  return (code >= 0x20 && code < 0x7f) || code === 0x0a || code === 0x0d || code === 0x09 ||
    (code >= 0xa0 && code <= 0x17f) || code === 0x2019 || code === 0x2013 || code === 0x2014;
}

/** Collect printable UTF-16LE runs (how Word ≥97 usually stores text). */
function scanUtf16(bytes: Uint8Array): string[] {
  const runs: string[] = [];
  let current = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = bytes[i] | (bytes[i + 1] << 8);
    if (isPrintable(code)) {
      current += String.fromCharCode(code);
    } else {
      if (current.length >= MIN_RUN) runs.push(current);
      current = '';
    }
  }
  if (current.length >= MIN_RUN) runs.push(current);
  return runs;
}

/** Collect printable single-byte (CP-1252-ish) runs as a fallback. */
function scanAnsi(bytes: Uint8Array): string[] {
  const runs: string[] = [];
  let current = '';
  for (let i = 0; i < bytes.length; i++) {
    const code = bytes[i];
    if (isPrintable(code)) {
      current += String.fromCharCode(code);
    } else {
      if (current.length >= MIN_RUN) runs.push(current);
      current = '';
    }
  }
  if (current.length >= MIN_RUN) runs.push(current);
  return runs;
}

function looksLikeProse(run: string): boolean {
  const letters = (run.match(/[a-zA-Z]/g) ?? []).length;
  return letters / run.length > 0.5 && run.includes(' ');
}

export function extractDocText(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  const utf16 = scanUtf16(view).filter(looksLikeProse);
  const ansi = scanAnsi(view).filter(looksLikeProse);
  // Prefer whichever encoding recovered more real text.
  const utf16Len = utf16.reduce((n, r) => n + r.length, 0);
  const ansiLen = ansi.reduce((n, r) => n + r.length, 0);
  const text = (utf16Len >= ansiLen ? utf16 : ansi).join('\n').trim();
  if (text.length < MIN_LEGIBLE_CHARS) {
    throw new CareersError(
      'extraction',
      'Could not read enough text from this legacy .doc file. Please save it as PDF or DOCX and upload again.'
    );
  }
  return text;
}
