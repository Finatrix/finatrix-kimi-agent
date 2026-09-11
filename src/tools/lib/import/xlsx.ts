/**
 * Reading a spreadsheet, without a spreadsheet library.
 *
 * WHY NOT SheetJS, WHICH IS ALREADY A DEPENDENCY
 * ----------------------------------------------
 * Because using its parser would take the app's dependency gate from green to
 * red, for real reasons rather than bureaucratic ones. `xlsx@0.18.5` carries
 * two high-severity advisories — GHSA-4r6h-8v6p-xvw6 (prototype pollution) and
 * GHSA-5pgg-2g8v-p4x9 (ReDoS) — and BOTH are in the workbook parser. They are
 * accepted in `scripts/audit-production-deps.mjs` on exactly one ground: this
 * app only ever WRITES workbooks, so the vulnerable code is unreachable, and
 * `src/test/xlsx-write-only.test.ts` fails the build if that stops being true.
 * There is no fix on the npm registry; the patched build ships only from
 * SheetJS's own CDN, and taking a non-registry tarball as a production
 * dependency is the larger supply-chain risk.
 *
 * Calling `XLSX.read` on a file a user uploaded is precisely the case those
 * advisories describe. So this reads the file itself.
 *
 * WHAT AN .xlsx ACTUALLY IS
 * -------------------------
 * A ZIP archive of XML. The two entries that matter are the worksheet
 * (`xl/worksheets/sheet1.xml`, a grid of `<c>` cells) and the shared string
 * table (`xl/sharedStrings.xml`, where every text value actually lives — a cell
 * with `t="s"` holds an index into it, not the text). Both are read with
 * `DOMParser`, which the browser already has and which does not resolve
 * external entities.
 *
 * The ZIP is inflated with `DecompressionStream('deflate-raw')` — a platform
 * API, no dependency, and one that cannot be made to execute anything. What
 * this file adds is about 150 lines of central-directory walking, which is a
 * far smaller and far more auditable surface than a general-purpose workbook
 * parser that also understands formulas, macros and defined names.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * Formulas are not evaluated — the cached value is read, which is what the
 * bank's export contains anyway. Macros, embedded objects, external links and
 * every other workbook feature are ignored rather than interpreted. A statement
 * is a table of numbers; nothing else in the format is wanted here.
 *
 * `.xls` (the old binary format) is NOT supported and is refused by name, so
 * the user is told to re-export rather than left with a silent failure.
 */

import { StatementParseError } from './csv';

/** Cell text is capped so one pathological cell cannot become the whole heap. */
const MAX_CELL_CHARS = 2_000;

/** Rows read from a sheet. Far above any statement; a ceiling all the same. */
const MAX_ROWS = 20_000;

/** Columns read from a row. */
const MAX_COLS = 64;

// Bound the expanded XML, not only the compressed upload: a small ZIP can
// otherwise inflate into gigabytes before the row limit is ever consulted.
const MAX_XML_BYTES = 16 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 2_000;
const DAMAGED = 'This spreadsheet appears to be damaged. Please re-export it or use CSV.';
const TOO_LARGE = 'This spreadsheet is too large to read safely. Please export a single statement period as CSV.';

/** A ZIP entry, as far as this reader cares. */
interface ZipEntry {
  name: string;
  /** 0 = stored, 8 = deflate. Anything else is refused. */
  method: number;
  offset: number;
  compressedSize: number;
  uncompressedSize: number;
  flags: number;
}

/** ZIP record signatures, little-endian as they appear in the file. */
const SIG_END_OF_CENTRAL_DIR = 0x06054b50;
const SIG_CENTRAL_FILE_HEADER = 0x02014b50;
const SIG_LOCAL_FILE_HEADER = 0x04034b50;

/**
 * List the archive's entries from its central directory.
 *
 * The central directory is read rather than the local headers scanned, because
 * a local header may declare sizes of zero and defer them to a data descriptor
 * after the payload — the central directory always carries the real ones.
 */
function readCentralDirectory(view: DataView): ZipEntry[] {
  // The end-of-central-directory record is last, after a comment of up to 64KB.
  const maxBack = Math.min(view.byteLength, 0xffff + 22);
  let eocd = -1;
  for (let i = view.byteLength - 22; i >= view.byteLength - maxBack; i -= 1) {
    if (i < 0) break;
    if (view.getUint32(i, true) === SIG_END_OF_CENTRAL_DIR) { eocd = i; break; }
  }
  if (eocd < 0) throw new StatementParseError('This file is not a readable spreadsheet.');

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const directoryEnd = p + view.getUint32(eocd + 12, true);
  if (count > MAX_ARCHIVE_ENTRIES) throw new StatementParseError(TOO_LARGE);
  if (view.getUint16(eocd + 4, true) !== 0 || view.getUint16(eocd + 6, true) !== 0
    || view.getUint16(eocd + 8, true) !== count
    || directoryEnd !== eocd || eocd + 22 + view.getUint16(eocd + 20, true) !== view.byteLength) {
    throw new StatementParseError(DAMAGED);
  }
  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  const decoder = new TextDecoder();

  for (let i = 0; i < count; i += 1) {
    if (p + 46 > directoryEnd || view.getUint32(p, true) !== SIG_CENTRAL_FILE_HEADER) {
      throw new StatementParseError(DAMAGED);
    }
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const uncompressedSize = view.getUint32(p + 24, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    const next = p + 46 + nameLength + extraLength + commentLength;
    if (next > directoryEnd || offset + 30 > view.getUint32(eocd + 16, true)) {
      throw new StatementParseError(DAMAGED);
    }
    const name = decoder.decode(new Uint8Array(view.buffer, view.byteOffset + p + 46, nameLength));
    if (names.has(name)) throw new StatementParseError(DAMAGED);
    names.add(name);
    entries.push({ name, method, offset, compressedSize, uncompressedSize, flags });
    p = next;
  }
  if (p !== directoryEnd) throw new StatementParseError(DAMAGED);
  return entries;
}

/** Read one bounded XML entry, rejecting truncation and excessive inflation. */
async function readEntry(bytes: Uint8Array, view: DataView, entry: ZipEntry): Promise<string> {
  const p = entry.offset;
  if (p + 30 > view.byteLength || view.getUint32(p, true) !== SIG_LOCAL_FILE_HEADER) {
    throw new StatementParseError(DAMAGED);
  }
  if ((entry.flags | view.getUint16(p + 6, true)) & 1) {
    throw new StatementParseError('This spreadsheet is encrypted. Please export an unlocked .xlsx or CSV file.');
  }
  if (entry.uncompressedSize > MAX_XML_BYTES) throw new StatementParseError(TOO_LARGE);
  const nameLength = view.getUint16(p + 26, true);
  const extraLength = view.getUint16(p + 28, true);
  const start = p + 30 + nameLength + extraLength;
  if (start + entry.compressedSize > view.byteLength
    || view.getUint16(p + 8, true) !== entry.method) throw new StatementParseError(DAMAGED);
  const body = bytes.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) {
    if (body.length !== entry.uncompressedSize) throw new StatementParseError(DAMAGED);
    return new TextDecoder().decode(body);
  }
  if (entry.method !== 8) {
    throw new StatementParseError('This spreadsheet uses a compression method FinatriX cannot read. Please save it as .xlsx or export it as CSV.');
  }
  if (typeof DecompressionStream !== 'function') {
    throw new StatementParseError('This browser cannot open spreadsheets. Please export the statement as CSV instead.');
  }
  try {
    const reader = new Blob([body as BlobPart]).stream()
      .pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const decoder = new TextDecoder();
    let total = 0;
    let text = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_XML_BYTES || total > entry.uncompressedSize) {
          await reader.cancel();
          throw new StatementParseError(TOO_LARGE);
        }
        text += decoder.decode(value, { stream: true });
      }
      if (total !== entry.uncompressedSize) throw new StatementParseError(DAMAGED);
      return text + decoder.decode();
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    if (error instanceof StatementParseError) throw error;
    throw new StatementParseError('Could not decompress this spreadsheet. Please re-export it or use CSV.');
  }
}

/** `BC12` → 54. Column letters are base-26 with no zero. */
function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function parseXml(text: string, what: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new StatementParseError(`The ${what} inside this spreadsheet could not be read.`);
  }
  return doc;
}

/**
 * The shared string table.
 *
 * Text in a worksheet is almost always a pointer into this table rather than a
 * literal, so a reader that skips it sees a grid of numbers with no
 * descriptions — which for a bank statement means no merchants and no
 * reference to match anything against.
 */
function readSharedStrings(xml: string): string[] {
  const doc = parseXml(xml, 'text table');
  return [...doc.getElementsByTagName('si')].map((si) => {
    // Rich text splits one string across several <t> runs; the string is their
    // concatenation, in document order.
    const runs = [...si.getElementsByTagName('t')].map((t) => t.textContent ?? '');
    return runs.join('').slice(0, MAX_CELL_CHARS);
  });
}

/**
 * Excel keeps dates as a serial number, so a date column arrives as `45678`.
 *
 * Day 1 is 1 January 1900, and the format contains a deliberate bug — 1900 is
 * treated as a leap year for Lotus compatibility — so serials at or below 60
 * are ambiguous and are left alone rather than converted to a date that is off
 * by one. Everything above that converts exactly.
 *
 * The arithmetic is done in UTC and read back in UTC. A serial is a whole
 * number of days with no timezone in it, so anchoring both ends to the same
 * meridian is what keeps 45678 the same calendar day east of Greenwich as west
 * of it — the failure `lib/date.ts` exists to prevent everywhere else.
 */
const EPOCH_OFFSET_DAYS = 25_569; // 1899-12-30 → 1970-01-01

function excelSerialToIso(serial: number, date1904: boolean): string | null {
  if (!Number.isFinite(serial) || serial < 0 || (!date1904 && serial <= 60) || serial > 60_000) return null;
  const offset = date1904 ? EPOCH_OFFSET_DAYS - 1462 : EPOCH_OFFSET_DAYS;
  const d = new Date(Math.round((serial - offset) * 86_400_000));
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Built-in number-format ids that mean a date or a time. */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/**
 * Which style indices are date formats.
 *
 * THIS LOOKUP IS NOT OPTIONAL, and the reason is worth stating plainly. Almost
 * every cell in a real workbook carries a style attribute, so "has a style" is
 * not evidence of anything. Treating it as evidence would convert an amount of
 * 45,678 into a date — an amount silently replaced by a date in somebody's
 * ledger, from a file they were invited to upload.
 *
 * `cellXfs` is the list the `s` attribute indexes into; each entry names a
 * `numFmtId`. Ids below 164 are Excel's built-ins; above that they are custom
 * formats declared in the same file, whose format code has to be read.
 */
function readDateStyles(xml: string): Set<number> {
  const doc = parseXml(xml, 'formats');
  const dateFormatIds = new Set(BUILTIN_DATE_FORMATS);

  for (const fmt of doc.getElementsByTagName('numFmt')) {
    const id = Number(fmt.getAttribute('numFmtId'));
    const code = fmt.getAttribute('formatCode') ?? '';
    // Quoted literals and bracketed sections (colours, conditions, locale ids)
    // are removed first: a currency format like `"kr"#,##0.00` would otherwise
    // read as a date because of the r, and `[$-409]0.00` because of nothing at
    // all. What is left is the actual placeholders, where y/m/d/h/s mean time.
    const bare = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '');
    if (Number.isFinite(id) && /[ymdhs]/i.test(bare)) dateFormatIds.add(id);
  }

  const styles = new Set<number>();
  const cellXfs = doc.getElementsByTagName('cellXfs')[0];
  if (!cellXfs) return styles;
  [...cellXfs.getElementsByTagName('xf')].forEach((xf, index) => {
    if (dateFormatIds.has(Number(xf.getAttribute('numFmtId')))) styles.add(index);
  });
  return styles;
}

/**
 * Read the first worksheet of an .xlsx into a grid of strings.
 *
 * A grid rather than typed values on purpose: it is handed straight to the
 * delimited-statement parser, which already knows how to find a date column, a
 * description and an amount among strings, and has the tests to prove it. One
 * parser for both file types means a CSV and the same statement as a workbook
 * cannot disagree about what they contain.
 */
export async function readWorkbookGrid(file: File): Promise<string[][]> {
  if (/\.xls$/i.test(file.name)) {
    throw new StatementParseError('This is an old-format .xls file. Please open it and save as .xlsx, or export it as CSV.');
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // "PK\3\4" — checked rather than trusting the extension.
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new StatementParseError('This file has a spreadsheet name but is not a spreadsheet. Please re-export it from your bank.');
  }

  const entries = readCentralDirectory(view);
  let sheetEntry: ZipEntry | undefined = entries
    .filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))[0];
  let date1904 = false;
  const workbookEntry = entries.find((e) => e.name === 'xl/workbook.xml');
  if (workbookEntry) {
    const workbook = parseXml(await readEntry(bytes, view, workbookEntry), 'workbook');
    date1904 = /^(1|true)$/i.test(workbook.getElementsByTagName('workbookPr')[0]?.getAttribute('date1904') ?? '');
    // Sheet filenames do not encode tab order. Follow the first tab's actual
    // relationship, including valid custom worksheet filenames.
    const firstSheet = workbook.getElementsByTagName('sheet')[0];
    const relationId = firstSheet?.getAttribute('r:id');
    const relationships = entries.find((e) => e.name === 'xl/_rels/workbook.xml.rels');
    if (!relationId || !relationships) throw new StatementParseError(DAMAGED);
    const rels = parseXml(await readEntry(bytes, view, relationships), 'worksheet links');
    const relation = [...rels.getElementsByTagName('Relationship')]
      .find((el) => el.getAttribute('Id') === relationId);
    const target = relation?.getAttribute('Target');
    if (!target || relation?.getAttribute('TargetMode') === 'External') throw new StatementParseError(DAMAGED);
    const resolved = new URL(target, 'https://workbook.invalid/xl/workbook.xml');
    if (resolved.origin !== 'https://workbook.invalid' || resolved.search || resolved.hash) {
      throw new StatementParseError(DAMAGED);
    }
    sheetEntry = entries.find((e) => e.name === decodeURIComponent(resolved.pathname.slice(1)));
  }
  if (!sheetEntry) {
    throw new StatementParseError('This spreadsheet has no worksheets in it.');
  }

  const stringsEntry = entries.find((e) => /^xl\/sharedStrings\.xml$/i.test(e.name));
  const shared = stringsEntry
    ? readSharedStrings(await readEntry(bytes, view, stringsEntry))
    : [];

  const stylesEntry = entries.find((e) => /^xl\/styles\.xml$/i.test(e.name));
  // No styles file means nothing can be proved to be a date, so nothing is
  // converted. A date left as its serial is a visible, fixable problem; an
  // amount turned into a date is an invisible, wrong one.
  const dateStyles = stylesEntry
    ? readDateStyles(await readEntry(bytes, view, stylesEntry))
    : new Set<number>();

  const doc = parseXml(await readEntry(bytes, view, sheetEntry), 'worksheet');
  const grid: string[][] = [];

  const rows = doc.getElementsByTagName('row');
  if (rows.length > MAX_ROWS) throw new StatementParseError(TOO_LARGE);
  for (const row of rows) {
    const cells: string[] = [];
    const rowCells = row.getElementsByTagName('c');
    if (rowCells.length > MAX_COLS) throw new StatementParseError(TOO_LARGE);
    for (const cell of rowCells) {
      const at = columnIndex(cell.getAttribute('r') ?? '');
      const type = cell.getAttribute('t');
      let value: string;

      if (type === 's') {
        const index = Number(cell.getElementsByTagName('v')[0]?.textContent ?? '');
        value = shared[index] ?? '';
      } else if (type === 'inlineStr') {
        value = [...cell.getElementsByTagName('t')].map((t) => t.textContent ?? '').join('');
      } else {
        // `v` is the cached value; for a formula cell that is what the writer
        // last computed, which is the figure the user sees in their sheet.
        const raw = cell.getElementsByTagName('v')[0]?.textContent ?? '';
        // A date is a serial number wearing a date format — and only a cell
        // whose style really is a date format is converted. See readDateStyles.
        const style = Number(cell.getAttribute('s'));
        value = dateStyles.has(style) && /^\d+(\.\d+)?$/.test(raw)
          ? excelSerialToIso(Number(raw), date1904) ?? raw
          : raw;
      }

      // Cells are sparse: an empty column is simply absent from the XML, so the
      // position has to come from `r` or every row after a gap shifts left.
      if (at >= 0 && at < MAX_COLS) {
        while (cells.length < at) cells.push('');
        cells[at] = value.slice(0, MAX_CELL_CHARS);
      } else if (at >= MAX_COLS) {
        throw new StatementParseError(TOO_LARGE);
      } else {
        cells.push(value.slice(0, MAX_CELL_CHARS));
      }
    }
    grid.push(cells);
  }

  return grid;
}
