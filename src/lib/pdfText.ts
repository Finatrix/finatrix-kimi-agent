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

/**
 * A NOTE ON `isEvalSupported`, so nobody has to rediscover this.
 *
 * pdf.js used to JIT-compile two things a HOSTILE file controls — PostScript
 * Type 4 shading functions and font charstring programs — through
 * `new Function`, and that path is what CVE-2024-4367 / GHSA-hq66-cqwq-w95j
 * turned into arbitrary script execution from a crafted font. The documented
 * mitigation was `getDocument({ isEvalSupported: false })`.
 *
 * That option does not exist here and must not be added back: pdf.js v5 deleted
 * `PostScriptCompiler` and the flag along with it, and pdfjs-dist 6.2.108
 * contains no `new Function` or `eval(` in either `pdf.mjs` or
 * `pdf.worker.mjs`. Passing it is a type error and a runtime no-op — the class
 * of bug is gone from the library rather than switched off in it.
 *
 * Worth knowing because the CSP is NOT the backstop it looks like. `script-src`
 * names no `'unsafe-eval'`, but pdf.js parses inside a dedicated Worker served
 * from `/assets/*`, and `public/_headers` deliberately attaches no policy to
 * that prefix (a blanket one would block WASM in the Tesseract worker). So if
 * an eval path ever returns to this dependency, nothing in the deployment
 * stops it — re-check this on any pdfjs major, and pin the flag again the day
 * it exists again. `src/test/uploadParsingHardening.test.ts` fails if it silently does.
 */

/**
 * Page ceiling for a single document.
 *
 * `numPages` is read from the file's own page tree, so it is attacker-chosen:
 * a few kilobytes of PDF can declare tens of thousands of pages, and the loop
 * below allocates per page. Unbounded, that is a frozen tab from a file the
 * user was invited to upload.
 *
 * 500 is far above any real input — a year of bank statements runs to tens of
 * pages, a résumé to a handful — and the limit REFUSES rather than truncating.
 * Silently returning the first N pages of a statement would drop transactions
 * and quietly produce a wrong ledger, which is worse than not importing at all.
 */
export const MAX_PDF_PAGES = 500;

/** Why a PDF could not be read, in terms the caller can act on. */
export type PdfFailure =
  /** Encrypted; a password is required and none was supplied. */
  | 'password-required'
  /** Encrypted; the supplied password was rejected. */
  | 'password-wrong'
  /** Structurally invalid or truncated. */
  | 'corrupt'
  /** More pages than this app will process in one go. */
  | 'too-many-pages'
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
    if (doc.numPages > MAX_PDF_PAGES) {
      throw new PdfError(
        'too-many-pages',
        `This PDF has ${doc.numPages} pages, which is more than FinatriX will read in one import `
          + `(the limit is ${MAX_PDF_PAGES}). Please split it, or download a shorter date range from your bank.`,
      );
    }
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
