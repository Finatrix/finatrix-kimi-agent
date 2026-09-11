import { describe, it, expect } from 'vitest';
import { readWorkbookGrid } from '../tools/lib/import/xlsx';
import { parseStatementMatrix } from '../tools/lib/import/csv';
import { buildDrafts } from '../tools/lib/import/draft';
import { needsReview } from '../tools/lib/import/status';
import { rememberConfirmed } from '../tools/lib/import/learned';
import type { StatementDoc } from '../tools/lib/import/types';

/**
 * Reading a spreadsheet without a spreadsheet library.
 *
 * The reason this reader exists is a supply-chain one, and it is worth keeping
 * in view: `xlsx@0.18.5` has two unpatched high-severity advisories, both in
 * its workbook PARSER, accepted by `scripts/audit-production-deps.mjs` only
 * because nothing in the app reads a workbook. Handing it a file a user
 * uploaded is exactly the case those advisories describe, so `.xlsx` is
 * unzipped and read here instead — see `tools/lib/import/xlsx.ts`.
 *
 * The fixtures below are real .xlsx archives, assembled byte by byte. A
 * hand-rolled reader tested against a hand-waved fixture proves nothing; these
 * exercise the actual central directory, the actual shared string table and the
 * actual style-driven date decoding.
 */

/* ── A minimal .xlsx, built by hand ─────────────────────────────────────── */

interface Part { name: string; body: string }

/** Little-endian writers, because a ZIP is little-endian throughout. */
function u16(n: number): number[] { return [n & 0xff, (n >> 8) & 0xff]; }
function u32(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
}

/**
 * A ZIP with every entry STORED rather than deflated.
 *
 * Stored entries keep the fixture readable and exercise the same central
 * directory walk; the inflate path is the platform's own DecompressionStream
 * and is not this reader's code to prove.
 */
function zip(parts: Part[]): Uint8Array {
  const encoder = new TextEncoder();
  const local: number[] = [];
  const central: number[] = [];
  const offsets: number[] = [];

  for (const part of parts) {
    const name = encoder.encode(part.name);
    const body = encoder.encode(part.body);
    offsets.push(local.length);
    local.push(
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0),                    // crc32 — not checked by the reader
      ...u32(body.length), ...u32(body.length),
      ...u16(name.length), ...u16(0),
      ...name, ...body,
    );
  }

  parts.forEach((part, i) => {
    const name = encoder.encode(part.name);
    const body = encoder.encode(part.body);
    central.push(
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0),
      ...u32(body.length), ...u32(body.length),
      ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(offsets[i]),
      ...name,
    );
  });

  const eocd = [
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(parts.length), ...u16(parts.length),
    ...u32(central.length), ...u32(local.length), ...u16(0),
  ];
  return new Uint8Array([...local, ...central, ...eocd]);
}

const SHEET_XML = (rows: string) =>
  `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;

const SHARED = (values: string[]) =>
  `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${
    values.map((v) => `<si><t>${v}</t></si>`).join('')}</sst>`;

/** Style 0 is General; style 1 points at built-in date format 14 (dd/mm/yyyy). */
const STYLES = `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`;

function workbook(sheet: string, shared: string[] = [], styles = STYLES): File {
  const bytes = zip([
    { name: 'xl/worksheets/sheet1.xml', body: sheet },
    { name: 'xl/sharedStrings.xml', body: SHARED(shared) },
    { name: 'xl/styles.xml', body: styles },
  ]);
  return new File([bytes as BlobPart], 'statement.xlsx');
}

/* ── The tests ──────────────────────────────────────────────────────────── */

describe('reading an .xlsx', () => {
  it('reads a grid, resolving text through the shared string table', async () => {
    // Text in a worksheet is a POINTER into sharedStrings, not a literal. A
    // reader that skips that table sees a grid of numbers with no descriptions,
    // which for a statement means no merchants at all.
    const sheet = SHEET_XML(
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'
      + '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>1250.5</v></c></row>',
    );
    const grid = await readWorkbookGrid(workbook(sheet, ['Date', 'Amount', 'Blue Bottle']));
    expect(grid).toEqual([['Date', 'Amount'], ['Blue Bottle', '1250.5']]);
  });

  it('keeps a gap in the middle of a row', async () => {
    // Empty cells are simply absent from the XML. Without honouring `r`, every
    // column after a gap shifts left and the amount lands under the wrong header.
    const sheet = SHEET_XML('<row r="1"><c r="A1"><v>1</v></c><c r="C1"><v>3</v></c></row>');
    expect(await readWorkbookGrid(workbook(sheet))).toEqual([['1', '', '3']]);
  });

  it('converts a date-formatted serial into a real date', async () => {
    // 45,678 is 21 January 2025. It reaches the file as a bare number.
    const sheet = SHEET_XML('<row r="1"><c r="A1" s="1"><v>45678</v></c></row>');
    expect(await readWorkbookGrid(workbook(sheet))).toEqual([['2025-01-21']]);
  });

  /**
   * The one that matters most. Almost every cell in a real workbook carries a
   * style attribute, so "has a style" proves nothing. Treating it as proof
   * turns an amount of 45,678 into a date — an amount silently replaced in
   * somebody's ledger, from a file they were invited to upload.
   */
  it('does not turn an amount into a date just because the cell has a style', async () => {
    const sheet = SHEET_XML('<row r="1"><c r="A1" s="0"><v>45678</v></c></row>');
    expect(await readWorkbookGrid(workbook(sheet))).toEqual([['45678']]);
  });

  it('recognises a custom date format, and leaves a custom currency format alone', async () => {
    const styles = `<?xml version="1.0"?><styleSheet><numFmts>`
      + `<numFmt numFmtId="164" formatCode="dd-mmm-yy"/>`
      + `<numFmt numFmtId="165" formatCode="&quot;kr&quot;#,##0.00"/>`
      + `</numFmts><cellXfs count="2"><xf numFmtId="164"/><xf numFmtId="165"/></cellXfs></styleSheet>`;
    // The Swedish krona format contains an "r" and a "d" would be a disaster;
    // quoted literals are stripped before the code is tested for date tokens.
    const sheet = SHEET_XML(
      '<row r="1"><c r="A1" s="0"><v>45678</v></c><c r="B1" s="1"><v>45678</v></c></row>',
    );
    expect(await readWorkbookGrid(workbook(sheet, [], styles))).toEqual([['2025-01-21', '45678']]);
  });

  it('refuses the old binary .xls by name rather than failing obscurely', async () => {
    const file = new File([new Uint8Array([0x50, 0x4b, 3, 4]) as BlobPart], 'old.xls');
    await expect(readWorkbookGrid(file)).rejects.toThrow(/save as \.xlsx/i);
  });

  it('refuses a file that is not a spreadsheet at all', async () => {
    const file = new File(['just some text' as BlobPart], 'fake.xlsx');
    await expect(readWorkbookGrid(file)).rejects.toThrow(/not a spreadsheet/i);
  });

  it('feeds the same column-mapping rules a CSV goes through', async () => {
    // One parser for both formats, so a statement cannot be read differently
    // depending on which way the bank exported it.
    const sheet = SHEET_XML(
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>'
      + '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="C2"><v>1250.5</v></c></row>',
    );
    const grid = await readWorkbookGrid(
      workbook(sheet, ['Date', 'Description', 'Debit', '05/07/2026', 'BLUE BOTTLE COFFEE']),
    );
    const doc = parseStatementMatrix(grid, new Date('2026-08-01'), 'spreadsheet');
    expect(doc.source).toBe('spreadsheet');
    expect(doc.rows).toHaveLength(1);
    expect(doc.rows[0].amount).toBe(1250.5);
    expect(doc.rows[0].date).toBe('2026-07-05');
  });
});

describe('rows read by text recognition are never trusted silently', () => {
  const ocrDoc = (): StatementDoc => ({
    source: 'ocr',
    rows: [{
      line: 1, date: '2026-07-05', postedDate: null,
      description: 'BLUE BOTTLE COFFEE', amount: 250, direction: 'debit',
      balance: null, reference: null, currency: null,
    }],
    currency: 'INR', openingBalance: null, closingBalance: null,
    skipped: 0, dateOrder: 'dmy', dateOrderAssumed: false,
  });

  /**
   * OCR can turn a 3 into an 8. A row that looks perfect may carry an amount
   * nobody typed and nobody checked, and that is not something to write into a
   * ledger on a tick the user never had to give.
   */
  /**
   * A merchant this user has categorised before, so the row is otherwise ready
   * to import. Built through `rememberConfirmed` rather than written out by
   * hand: the map is keyed by `merchantKey`, and a fixture that guessed the key
   * would silently test nothing.
   */
  const LEARNED = rememberConfirmed(
    {},
    [{ merchant: 'Blue Bottle Coffee', category: 'eating_out', origin: 'user' }],
    new Date('2026-07-01'),
  );

  it('holds every recognised row back for review, however clean it looks', () => {
    const drafts = buildDrafts(ocrDoc(), LEARNED, new Set(['eating_out']));
    expect(drafts[0].issues).toContain('recognised-text');
    expect(drafts[0].include).toBe(false);
    expect(needsReview(drafts[0])).toBe(true);
  });

  it('still ticks the same row when it came out of a file', () => {
    const fromFile = { ...ocrDoc(), source: 'csv' as const };
    const drafts = buildDrafts(fromFile, LEARNED, new Set(['eating_out']));
    expect(drafts[0].issues).not.toContain('recognised-text');
    // Same row, same category, same everything — ticked, because a file is not
    // a photograph. The held-back tick above is about the reading, not the row.
    expect(drafts[0].include).toBe(true);
  });
});
