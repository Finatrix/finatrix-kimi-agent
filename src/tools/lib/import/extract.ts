/**
 * File in, statement rows out.
 *
 * The orchestrator's whole job is routing plus honest failure. It validates the
 * upload before reading a byte of content, sends each format to the parser that
 * understands it, and converts every way this can go wrong into a typed outcome
 * the review sheet can act on — most importantly `password-required`, which is
 * a prompt rather than an error, because a locked statement is the normal case
 * rather than the exceptional one.
 *
 * FOUR ROUTES, ONE SET OF RULES
 * -----------------------------
 *   csv / tsv / txt   → the delimited parser
 *   .xlsx             → read to a grid, then the SAME delimited parser
 *   .xls              → whatever it really is (see `readLegacyWorkbook`)
 *   pdf (with text)   → the text-layer parser
 *   pdf (scanned)     → rendered to images, recognised, then the text parser
 *   png / jpg / webp  → recognised, then the text parser
 *
 * Everything converges on two parsers, so a statement cannot be read
 * differently depending on which format it was saved in. The spreadsheet reader
 * is this codebase's own (`xlsx.ts`) rather than SheetJS, whose parser carries
 * two unpatched high-severity advisories that are accepted only because nothing
 * calls it — see that file for the whole reasoning.
 *
 * OCR IS NOT TRUSTED THE WAY A FILE IS
 * ------------------------------------
 * Text recognition can misread a digit, and a misread digit in an amount is a
 * wrong number in somebody's ledger that nobody typed. So rows recovered by OCR
 * are marked `source: 'ocr'` and the review sheet holds every one of them back
 * for a human to confirm. This is what "scanned PDFs are declined" was
 * protecting against; reading them and being honest about the confidence is a
 * better answer than refusing.
 *
 * Nothing here uploads anything. pdf.js and Tesseract both run in workers in
 * this tab, the spreadsheet reader uses the platform's own inflate, and the
 * file's bytes never leave the device.
 */

import { sanitizeText } from '../../../lib/sanitize';
import { pdfCompatibilityMessage } from '../../../lib/pdfCompatibility';
import { parseCsvStatement, parseStatementMatrix, StatementParseError } from './csv';
import { parseTextStatement } from './statement';
import { maskedLines, parseLooseList, rowsFromLayout, type LayoutItem } from './looseList';
import { readWorkbookGrid } from './xlsx';
import { receiptStatement } from './receipt';
import { reconcile, resolveDirections, type Reconciliation } from './reconcile';
import type { StatementDoc } from './types';

/** Statements are small documents; anything larger is not one. */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/**
 * The most statement text one import will read, in characters.
 *
 * `sanitizeText` shortens anything over its limit, and its default limit
 * (200,000 characters) was chosen for a CV. Applied to a statement it cut a
 * 5,000-row export off at row 4,425 without a word: the missing rows were
 * simply never offered, the row at the cut was read from half a line, and the
 * balance check still passed because it only compares the rows it was given.
 *
 * So statement text is never shortened. This ceiling equals the file ceiling —
 * decoded text cannot be longer than the bytes it came from, so no accepted
 * delimited file can reach it — and anything that somehow does is refused by
 * name, the way the spreadsheet reader refuses rather than reads in part.
 */
const MAX_STATEMENT_CHARS = MAX_FILE_BYTES;

const TOO_LONG = 'This statement is too long to read in one go. Please download a shorter date range from your bank.';

/** Clean statement text. Never shortens it: over the ceiling is a refusal. */
function statementText(raw: string): string {
  if (raw.length > MAX_STATEMENT_CHARS) throw new ImportError('too-large', TOO_LONG);
  return sanitizeText(raw, MAX_STATEMENT_CHARS);
}

/** Below this many characters, a PDF has no usable text layer. */
const MIN_PDF_TEXT_CHARS = 200;

/**
 * Below this many characters, recognition found nothing usable.
 *
 * Lower than the PDF threshold on purpose: a phone photo of one page of a
 * statement is a legitimate input and carries far less text than a whole
 * document, while a photo of a cat still lands well under it.
 */
const MIN_OCR_TEXT_CHARS = 40;

/**
 * Works out which recognised lines form each transaction. Injected by the
 * caller (the AI layer supplies one) so this library never imports a model; it
 * receives lines with every digit hidden and answers in line numbers only.
 */
export type LayoutReader = (maskedLines: readonly string[]) => Promise<LayoutItem[] | null>;

/**
 * Text recognised from an image. A statement is tried first. When that finds
 * no dated rows the text is read as a payments or card-app list instead (see
 * looseList.ts): by the layout reader when one is available and it finds at
 * least as many rows, otherwise by the on-device rules.
 */
export async function readRecognisedText(text: string, now: Date, layout?: LayoutReader): Promise<StatementDoc> {
  const statement = parseTextStatement(text, now, 'ocr');
  if (statement.rows.length > 0) return statement;
  const local = parseLooseList(text, now);
  if (layout) {
    const items = await layout(maskedLines(text)).catch(() => null);
    if (items) {
      const assisted = rowsFromLayout(text, items, now);
      if (assisted.rows.length >= local.rows.length && assisted.rows.length > 0) return assisted;
    }
  }
  if (local.rows.length > 0) return local;
  // Neither a statement nor a payments list: a photo of a paper bill reads as
  // one purchase, or as nothing at all when it prints no total.
  const receipt = receiptStatement(text, now);
  return receipt.rows.length > 0 ? receipt : statement;
}

export const ACCEPTED_EXTENSIONS = [
  'csv', 'tsv', 'txt', 'pdf', 'xlsx', 'xls',
  'png', 'jpg', 'jpeg', 'webp', 'bmp',
] as const;

/** Extensions routed through text recognition. */
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp']);

/** What the file picker offers. */
export const ACCEPT_ATTRIBUTE = [
  '.csv,.tsv,.txt,.pdf,.xlsx,.xls',
  '.png,.jpg,.jpeg,.webp,.bmp',
  'text/csv,text/plain,application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png,image/jpeg,image/webp,image/bmp',
].join(',');

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
  /**
   * True when nothing in the file settled which way any row moved: no balance
   * step proved one and the bank stated none. Every direction is then a reading
   * of a sign convention, and the review sheet offers to swap the lot.
   */
  directionsUncertain?: boolean;
  /** Pages read, for PDFs. */
  pages: number | null;
  /** Files in a batch that could not be read, and why. Absent for one file. */
  skipped?: { name: string; reason: string }[];
}

function extensionOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec((name || '').trim());
  return m ? m[1].toLowerCase() : '';
}

/** What a browser calls each accepted format, for a file whose name does not say. */
const EXTENSION_OF_TYPE: Readonly<Record<string, string>> = {
  'text/csv': 'csv',
  'text/comma-separated-values': 'csv',
  'application/csv': 'csv',
  'text/tab-separated-values': 'tsv',
  'text/plain': 'txt',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
};

/**
 * The format to read a file as: its extension, or — when the name carries none
 * we accept — the type the browser reports.
 *
 * A statement shared out of a banking app on a phone often arrives as
 * `statement` or `document:1000012345`, with a perfectly good `text/csv` type
 * and no extension at all. Refusing it as "unsupported" was refusing a CSV for
 * the way it was named. The content checks below still apply either way.
 */
function kindOf(file: File): string {
  const extension = extensionOf(file.name);
  if ((ACCEPTED_EXTENSIONS as readonly string[]).includes(extension)) return extension;
  const type = (file.type || '').split(';')[0].trim().toLowerCase();
  return EXTENSION_OF_TYPE[type] ?? extension;
}

/** `%PDF` — checked rather than trusting the extension. */
async function looksLikePdf(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
}

/**
 * Recognise text across images, and refuse a result that is plainly not a
 * statement rather than handing the parser noise to find rows in.
 */
async function recogniseImages(images: readonly Blob[]): Promise<string> {
  // Tesseract and its WASM core are several megabytes and are loaded only when
  // an image is actually opened — a CSV import must not pay for them.
  const { ocrImages } = await import('../../../lib/ocr');
  let text: string;
  try {
    text = await ocrImages(images);
  } catch (e) {
    throw new ImportError('unreadable', e instanceof Error ? e.message : 'Could not read this image.');
  }
  if (text.trim().length < MIN_OCR_TEXT_CHARS) {
    throw new ImportError(
      'no-transactions',
      'No readable text was found in this image. A straight, well-lit photo of the statement itself usually works — or export it as a PDF or CSV from your bank.',
    );
  }
  return text;
}

/** Read a spreadsheet into the same grid the delimited parser consumes. */
async function readWorkbook(file: File, now: Date): Promise<StatementDoc> {
  try {
    return parseStatementMatrix(await readWorkbookGrid(file), now, 'spreadsheet');
  } catch (e) {
    if (e instanceof StatementParseError) throw new ImportError('unreadable', e.message);
    throw new ImportError('unreadable', 'Could not read this spreadsheet. Try exporting it as CSV instead.');
  }
}

/** Delimited text → statement, with parser failures turned into typed ones. */
function readDelimited(raw: string, now: Date): StatementDoc {
  try {
    return parseCsvStatement(statementText(raw), now);
  } catch (e) {
    if (e instanceof ImportError) throw e;
    if (e instanceof StatementParseError) throw new ImportError('unreadable', e.message);
    throw new ImportError('unreadable', 'Could not read this file as a statement.');
  }
}

/** Cells of the largest table in an HTML document, as the grid the parser reads. */
function htmlTableGrid(html: string): string[][] {
  // A parsed document is inert: its scripts never run and nothing in it is
  // fetched. Only text is taken from it.
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  let best: string[][] = [];
  // Banks wrap the statement in layout tables; the one with the most rows of
  // its own is the statement.
  for (const table of Array.from(parsed.querySelectorAll('table'))) {
    const grid = Array.from(table.rows, (row) =>
      Array.from(row.cells, (cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 2_000)));
    if (grid.length > best.length) best = grid;
  }
  return best;
}

const OLD_XLS = 'This is an old-format .xls file. Please open it and save as .xlsx, or export it as CSV.';

/**
 * Read a file named `.xls`, which is four different things in practice.
 *
 * The binary Excel 97 format is the only one that needs a real spreadsheet
 * parser, and it is still declined (see xlsx.ts for why none is shipped). But
 * banks routinely give the `.xls` name to things that are not that: a modern
 * workbook, a tab-separated text file, or a web page holding one table — all of
 * which the importer can already read, and all of which used to be turned away
 * with "old-format .xls" purely on their name.
 */
async function readLegacyWorkbook(file: File, now: Date): Promise<StatementDoc> {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());

  // "PK": a modern workbook under the old name.
  if (head[0] === 0x50 && head[1] === 0x4b) {
    return readWorkbook(new File([file], file.name.replace(/\.xls$/i, '.xlsx'), { type: file.type }), now);
  }
  // D0 CF 11 E0: the binary format itself.
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) {
    throw new ImportError('unsupported', OLD_XLS);
  }

  const raw = await file.text();
  if (raw.includes('\u0000')) throw new ImportError('unsupported', OLD_XLS);

  if (/<table[\s>]/i.test(raw)) {
    if (raw.length > MAX_STATEMENT_CHARS) throw new ImportError('too-large', TOO_LONG);
    try {
      return parseStatementMatrix(htmlTableGrid(raw), now, 'spreadsheet');
    } catch (e) {
      if (e instanceof StatementParseError) throw new ImportError('unreadable', e.message);
      throw new ImportError('unreadable', 'Could not read this spreadsheet. Try exporting it as CSV instead.');
    }
  }
  return readDelimited(raw, now);
}

/**
 * Read and parse an uploaded statement.
 *
 * `password` is supplied on the second attempt, after the caller has prompted
 * for it. It is passed through to pdf.js and is never retained here.
 */
export async function extractStatement(
  file: File,
  options: { password?: string; now?: Date; layout?: LayoutReader } = {},
): Promise<ExtractedStatement> {
  const now = options.now ?? new Date();

  if (!file || file.size === 0) {
    throw new ImportError('empty', 'That file is empty. Please choose a statement with transactions in it.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new ImportError('too-large', 'That file is larger than 15 MB. Please upload a single statement period.');
  }

  const extension = kindOf(file);
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new ImportError('unsupported', 'Unsupported format. Please upload a CSV, Excel or PDF statement, or a clear photo of one.');
  }

  const isPdf = await looksLikePdf(file);
  if (extension === 'pdf' && !isPdf) {
    throw new ImportError('unsupported', 'This file has a .pdf name but is not a PDF. Please re-download it from your bank.');
  }

  let doc: StatementDoc;
  let pages: number | null = null;

  if (IMAGE_EXTENSIONS.has(extension) && !isPdf) {
    doc = await readRecognisedText(statementText(await recogniseImages([file])), now, options.layout);
  } else if (extension === 'xls') {
    doc = await readLegacyWorkbook(file, now);
  } else if (extension === 'xlsx') {
    doc = await readWorkbook(file, now);
  } else if (isPdf) {
    const compatibilityMessage = pdfCompatibilityMessage();
    if (compatibilityMessage) throw new ImportError('unsupported', compatibilityMessage);
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
      // A scan, or a photograph saved as a PDF. Rendered and recognised rather
      // than refused — and every row it produces is held for review, because
      // that is the honest way to use a reading that might have misread a 3.
      const { renderPdfPages } = await import('../../../lib/pdfText');
      const images = await renderPdfPages(await file.arrayBuffer(), options.password)
        .catch(() => [] as Blob[]);
      if (!images.length) {
        throw new ImportError(
          'scanned-pdf',
          'This PDF has no selectable text and could not be scanned on this device. Please download the statement as a PDF or CSV from your bank instead.',
        );
      }
      doc = await readRecognisedText(statementText(await recogniseImages(images)), now, options.layout);
    } else {
      doc = parseTextStatement(statementText(text), now);
    }
  } else {
    const raw = await file.text();
    // A NUL byte means this is a binary file wearing a .csv name — an .xls
    // saved with the wrong extension is the common case.
    if (raw.includes('\u0000')) {
      throw new ImportError('unsupported', 'That file is not readable as text. If it is an Excel file, export it as CSV first.');
    }
    doc = readDelimited(raw, now);
  }

  if (!doc.rows.length) {
    throw new ImportError(
      'no-transactions',
      'We read the file but found no transaction rows in it. If this is a summary or an interest certificate, try the full statement instead.',
    );
  }

  const { rows, proved, assumed, balanceKind, newestFirst } = resolveDirections(doc);
  const settled: StatementDoc = { ...doc, rows, balanceKind, newestFirst };

  return {
    doc: settled,
    reconciliation: reconcile(settled, rows),
    directionsProved: proved,
    directionsAssumed: assumed,
    directionsUncertain: proved === 0 && !rows.some((r) => r.directionStated),
    pages,
  };
}

/** Most files one import reads at once. A share sheet can send many more. */
export const MAX_BATCH_FILES = 10;

/**
 * Read several files (screenshots shared together, usually) as one review.
 *
 * Each file is read on its own, exactly as `extractStatement` reads a single
 * file, and the rows are put side by side. Recognised text is never joined
 * across images first: the payments-list reader groups neighbouring lines, and
 * the last row of one screenshot is not part of the first row of the next.
 *
 * A file that cannot be read is listed in `skipped` instead of failing the
 * batch. Only when none can be read is that an error. Balances are not carried
 * across files: two screenshots are two documents.
 */
export async function extractStatements(
  files: readonly File[],
  options: { now?: Date; layout?: LayoutReader } = {},
): Promise<ExtractedStatement> {
  if (files.length === 1) return extractStatement(files[0], options);
  if (!files.length) {
    throw new ImportError('empty', 'Nothing was chosen. Please pick a statement or a screenshot.');
  }

  const read: ExtractedStatement[] = [];
  const skipped: { name: string; reason: string }[] = [];
  let firstError: ImportError | null = null;

  for (const [index, file] of files.entries()) {
    const name = file.name || `Image ${index + 1}`;
    if (index >= MAX_BATCH_FILES) {
      skipped.push({ name, reason: `Only ${MAX_BATCH_FILES} files are read at a time.` });
      continue;
    }
    try {
      read.push(await extractStatement(file, options));
    } catch (e) {
      const error = e instanceof ImportError ? e : new ImportError('unreadable', 'Could not read this file.');
      firstError ??= error;
      const locked = error.kind === 'password-required' || error.kind === 'password-wrong';
      skipped.push({ name, reason: locked ? 'It is password-protected. Import it on its own.' : error.message });
    }
  }

  if (!read.length) {
    throw new ImportError(
      firstError?.kind === 'too-large' || firstError?.kind === 'unsupported' ? firstError.kind : 'no-transactions',
      `None of these ${files.length} files could be read. ${firstError?.message ?? ''}`.trim(),
    );
  }

  const rows: StatementDoc['rows'] = [];
  let offset = 0;
  for (const part of read) {
    // Line numbers stay unique across the batch, in the order the files came.
    // Directions were already settled file by file; a balance chain running
    // from one file into the next would only invent a mismatch.
    for (const row of part.doc.rows) rows.push({ ...row, line: row.line + offset, balance: null });
    offset += Math.max(0, ...part.doc.rows.map((row) => row.line)) + 1;
  }

  const docs = read.map((part) => part.doc);
  const currencies = new Set(docs.map((doc) => doc.currency));
  // A file whose own dates settled dd/mm against mm/dd outranks one that assumed.
  const decided = docs.find((doc) => !doc.dateOrderAssumed) ?? docs[0];
  const doc: StatementDoc = {
    // One recognised image holds the whole batch back for review. Erring that
    // way costs a tick; erring the other way imports a misread digit.
    source: docs.some((d) => d.source === 'ocr') ? 'ocr' : docs[0].source,
    rows,
    currency: currencies.size === 1 ? docs[0].currency : null,
    openingBalance: null,
    closingBalance: null,
    skipped: docs.reduce((sum, d) => sum + d.skipped, 0),
    dateOrder: decided.dateOrder,
    dateOrderAssumed: decided.dateOrderAssumed,
    columnsInferred: docs.some((d) => d.columnsInferred) || undefined,
  };

  const pages = read.map((part) => part.pages).filter((p): p is number => p !== null);
  return {
    doc,
    reconciliation: reconcile(doc, rows),
    directionsProved: read.reduce((sum, part) => sum + part.directionsProved, 0),
    directionsAssumed: read.reduce((sum, part) => sum + part.directionsAssumed, 0),
    directionsUncertain: read.every((part) => part.directionsUncertain),
    pages: pages.length ? pages.reduce((a, b) => a + b, 0) : null,
    skipped,
  };
}
