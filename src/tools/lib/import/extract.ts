/**
 * File in, statement rows out.
 *
 * The orchestrator's whole job is routing plus honest failure. It validates the
 * upload before reading a byte of content, sends CSV/TSV to the delimited parser
 * and PDF to the text-layer parser, and converts every way this can go wrong
 * into a typed outcome the review sheet can act on — most importantly
 * `password-required`, which is a prompt rather than an error, because a locked
 * statement is the normal case rather than the exceptional one.
 *
 * Nothing here uploads anything. pdf.js runs in a worker in this tab, the CSV
 * reader is a string function, and the file's bytes never leave the device.
 *
 * Scanned, image-only PDFs are recognised and declined with a specific message.
 * The OCR fallback exists in this codebase (`careers/parser/ocr.ts`) and is the
 * obvious next step, but an amount misread by OCR is a wrong number in someone's
 * ledger — so it ships behind its own review rules rather than being quietly
 * folded in here.
 */

import { sanitizeText } from '../../../lib/sanitize';
import { parseCsvStatement, StatementParseError } from './csv';
import { parseTextStatement } from './statement';
import { reconcile, resolveDirections, type Reconciliation } from './reconcile';
import type { StatementDoc } from './types';

/** Statements are small documents; anything larger is not one. */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** Below this many characters, a PDF has no usable text layer. */
const MIN_PDF_TEXT_CHARS = 200;

export const ACCEPTED_EXTENSIONS = ['csv', 'tsv', 'txt', 'pdf'] as const;
/** What the file picker offers. */
export const ACCEPT_ATTRIBUTE = '.csv,.tsv,.txt,.pdf,text/csv,text/plain,application/pdf';

export type ImportFailure =
  | 'too-large'
  | 'empty'
  | 'unsupported'
  | 'password-required'
  | 'password-wrong'
  | 'scanned-pdf'
  | 'no-transactions'
  | 'unreadable';

export class ImportError extends Error {
  readonly kind: ImportFailure;

  constructor(kind: ImportFailure, message: string) {
    super(message);
    this.name = 'ImportError';
    this.kind = kind;
  }
}

export interface ExtractedStatement {
  doc: StatementDoc;
  /** Direction settled against the balance chain where one exists. */
  reconciliation: Reconciliation;
  /** Rows whose direction the balances proved outright. */
  directionsProved: number;
  /** Rows whose direction fell back to a hint or the default. */
  directionsAssumed: number;
  /** Pages read, for PDFs. */
  pages: number | null;
}

function extensionOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec((name || '').trim());
  return m ? m[1].toLowerCase() : '';
}

/** `%PDF` — checked rather than trusting the extension. */
async function looksLikePdf(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
}

/**
 * Read and parse an uploaded statement.
 *
 * `password` is supplied on the second attempt, after the caller has prompted
 * for it. It is passed through to pdf.js and is never retained here.
 */
export async function extractStatement(
  file: File,
  options: { password?: string; now?: Date } = {},
): Promise<ExtractedStatement> {
  const now = options.now ?? new Date();

  if (!file || file.size === 0) {
    throw new ImportError('empty', 'That file is empty. Please choose a statement with transactions in it.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new ImportError('too-large', 'That file is larger than 15 MB. Please upload a single statement period.');
  }

  const extension = extensionOf(file.name);
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new ImportError('unsupported', 'Unsupported format. Please upload a CSV or PDF statement.');
  }

  const isPdf = await looksLikePdf(file);
  if (extension === 'pdf' && !isPdf) {
    throw new ImportError('unsupported', 'This file has a .pdf name but is not a PDF. Please re-download it from your bank.');
  }

  let doc: StatementDoc;
  let pages: number | null = null;

  if (isPdf) {
    let text: string;
    try {
      // pdf.js is loaded only when a PDF is actually opened. It is by far the
      // heaviest thing this feature can reach for, and a static import would put
      // it in the Expense Tracker's chunk for every user who never imports
      // anything — as well as evaluating canvas globals the moment the module is
      // touched, which is not something a CSV import should require.
      const { extractPdfText, PdfError } = await import('../../../lib/pdfText');
      try {
        const read = await extractPdfText(await file.arrayBuffer(), options.password);
        text = read.text;
        pages = read.pages;
      } catch (e) {
        if (e instanceof PdfError) {
          if (e.kind === 'password-required') throw new ImportError('password-required', e.message);
          if (e.kind === 'password-wrong') throw new ImportError('password-wrong', e.message);
          // Same class of answer as the byte-size ceiling above — the file is
          // simply bigger than one import — so it reuses that kind and keeps
          // pdfText's own message, which names the actual page count.
          if (e.kind === 'too-many-pages') throw new ImportError('too-large', e.message);
          throw new ImportError('unreadable', e.message);
        }
        throw e;
      }
    } catch (e) {
      // Already-classified failures pass through; anything else (a failed
      // chunk load, an unexpected pdf.js internal) becomes the generic message.
      if (e instanceof ImportError) throw e;
      throw new ImportError('unreadable', 'Could not read this PDF. Try re-downloading it from your bank.');
    }

    if (text.trim().length < MIN_PDF_TEXT_CHARS) {
      throw new ImportError(
        'scanned-pdf',
        'This PDF has no selectable text — it looks like a scan or a photo. Please download the statement as a PDF or CSV from your bank instead.',
      );
    }
    doc = parseTextStatement(sanitizeText(text), now);
  } else {
    const raw = await file.text();
    // A NUL byte means this is a binary file wearing a .csv name — an .xls
    // saved with the wrong extension is the common case.
    if (raw.includes('\u0000')) {
      throw new ImportError('unsupported', 'That file is not readable as text. If it is an Excel file, export it as CSV first.');
    }
    try {
      doc = parseCsvStatement(sanitizeText(raw), now);
    } catch (e) {
      if (e instanceof StatementParseError) throw new ImportError('unreadable', e.message);
      throw new ImportError('unreadable', 'Could not read this file as a statement.');
    }
  }

  if (!doc.rows.length) {
    throw new ImportError(
      'no-transactions',
      'We read the file but found no transaction rows in it. If this is a summary or an interest certificate, try the full statement instead.',
    );
  }

  const { rows, proved, assumed } = resolveDirections(doc);
  const settled: StatementDoc = { ...doc, rows };

  return {
    doc: settled,
    reconciliation: reconcile(settled, rows),
    directionsProved: proved,
    directionsAssumed: assumed,
    pages,
  };
}
