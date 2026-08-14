/**
 * Reading the text layer of a PDF, including password-protected ones.
 *
 * Bank statements are the reason the password path exists. Almost every Indian
 * bank emails statements encrypted with a customer-specific key — a date of
 * birth, a PAN fragment, a card suffix — so a statement importer that cannot
 * open a protected PDF cannot open most of the PDFs it will ever be handed. The
 * password is passed straight to pdf.js, is held only for the duration of the
 * call, and is never stored, logged or sent anywhere.
 *
 * Everything runs in the browser: the file's bytes never leave the device.
 *
 * Lives in the shared lib rather than under a feature because it is generic
 * infrastructure, in the same way `lib/ai/transport.ts` is. `careers/parser/pdf.ts`
 * predates it and still carries its own copy of the open-and-extract logic;
 * that one should fold into this when Careers is next opened.
 */

import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** Why a PDF could not be read, in terms the caller can act on. */
export type PdfFailure =
  /** Encrypted; a password is required and none was supplied. */
  | 'password-required'
  /** Encrypted; the supplied password was rejected. */
  | 'password-wrong'
  /** Structurally invalid or truncated. */
  | 'corrupt'
  /** Opened, but anything else went wrong while reading. */
  | 'unreadable';

export class PdfError extends Error {
  readonly kind: PdfFailure;

  constructor(kind: PdfFailure, message: string) {
    super(message);
    this.name = 'PdfError';
    this.kind = kind;
  }
}

export interface PdfText {
  text: string;
  pages: number;
}

/**
 * Extract every page's text, preserving line structure.
 *
 * pdf.js reports text as positioned items rather than lines, so lines are
 * rebuilt from the vertical coordinate of each item. That matters more here than
 * in a résumé: a statement row is only a row because its date, description and
 * amount share a baseline, and text concatenated in reading order without that
 * grouping would merge two transactions into one line.
 */
export async function extractPdfText(bytes: ArrayBuffer, password?: string): Promise<PdfText> {
  const task = pdfjs.getDocument({ data: bytes.slice(0), password });
  const doc = await open(task, password);
  try {
    const pages: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();

      // Group items by baseline. transform[5] is the y translation; rounding
      // absorbs the sub-pixel drift between cells of the same printed row.
      const lines = new Map<number, { x: number; str: string }[]>();
      for (const item of content.items) {
        if (!('str' in item) || !item.str) continue;
        const y = Math.round((item.transform[5] as number) * 2) / 2;
        const bucket = lines.get(y) ?? [];
        bucket.push({ x: item.transform[4] as number, str: item.str });
        lines.set(y, bucket);
      }

      const ordered = [...lines.entries()]
        .sort((a, b) => b[0] - a[0])          // top of page downwards
        .map(([, items]) => items.sort((a, b) => a.x - b.x).map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim())
        .filter(Boolean);

      pages.push(ordered.join('\n'));
      page.cleanup();
    }
    return { text: pages.join('\n'), pages: doc.numPages };
  } finally {
    // Tears down the worker and releases the decoded document. Awaiting the
    // loading task rather than the proxy is what pdf.js exposes for this.
    await task.destroy().catch(() => undefined);
  }
}

type LoadingTask = ReturnType<typeof pdfjs.getDocument>;

async function open(task: LoadingTask, password?: string) {
  try {
    return await task.promise;
  } catch (e) {
    const err = e as { name?: string; code?: number; message?: string };
    if (err?.name === 'PasswordException') {
      // pdf.js code 1 = NEED_PASSWORD, 2 = INCORRECT_PASSWORD.
      throw new PdfError(
        err.code === 2 || password ? 'password-wrong' : 'password-required',
        err.code === 2 || password
          ? 'That password did not open the file. Check it and try again.'
          : 'This PDF is password-protected.',
      );
    }
    if (err?.name === 'InvalidPDFException') {
      throw new PdfError('corrupt', 'This PDF appears to be damaged and cannot be read.');
    }
    throw new PdfError('unreadable', 'Could not open this PDF. Try re-downloading it from your bank.');
  }
}
