import { afterEach, describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { deflateRawSync } from 'node:zlib';
import { readWorkbookGrid } from '../tools/lib/import/xlsx';

type Part = { name: string; body: string; deflate?: boolean; declaredSize?: number };

// Real ZIP records exercise offsets, sparse cells and the actual inflate path.
function archive(parts: Part[]): Uint8Array {
  const encoder = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const part of parts) {
    const name = encoder.encode(part.name);
    const raw = encoder.encode(part.body);
    const body = part.deflate ? deflateRawSync(raw) : raw;
    const header = new Uint8Array(30 + name.length);
    const h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(8, part.deflate ? 8 : 0, true);
    h.setUint32(18, body.length, true);
    h.setUint32(22, part.declaredSize ?? raw.length, true);
    h.setUint16(26, name.length, true);
    header.set(name, 30);
    local.push(header, body);
    const record = new Uint8Array(46 + name.length);
    const r = new DataView(record.buffer);
    r.setUint32(0, 0x02014b50, true);
    r.setUint16(10, part.deflate ? 8 : 0, true);
    r.setUint32(20, body.length, true);
    r.setUint32(24, part.declaredSize ?? raw.length, true);
    r.setUint16(28, name.length, true);
    r.setUint32(42, offset, true);
    record.set(name, 46);
    central.push(record);
    offset += header.length + body.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, parts.length, true);
  e.setUint16(10, parts.length, true);
  e.setUint32(12, size, true);
  e.setUint32(16, offset, true);
  const bytes = new Uint8Array(offset + size + end.length);
  let at = 0;
  for (const chunk of [...local, ...central, end]) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return bytes;
}
const xml = (rows: string) => `<worksheet><sheetData>${rows}</sheetData></worksheet>`;
const row = '<row><c r="A1" t="inlineStr"><is><t>Amount</t></is></c><c r="B1"><v>42</v></c></row>';
const sheet = (body = xml(row)): Part => ({ name: 'xl/worksheets/sheet1.xml', body });
const file = (bytes: Uint8Array) => new File([bytes as BlobPart], 'statement.xlsx');
const read = (parts: Part[]) => readWorkbookGrid(file(archive(parts)));

function workbookParts(target: string, date1904 = false): Part[] {
  return [
    { name: 'xl/workbook.xml', body: `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr date1904="${date1904}"/><sheets><sheet name="Statement" r:id="rId2"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', body: `<Relationships><Relationship Id="rId2" Target="${target}"/></Relationships>` },
  ];
}

afterEach(() => vi.unstubAllGlobals());

describe('spreadsheet import safety and fidelity', () => {
  it('reads real deflated XML using the browser stream contract', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    expect(await read([{ ...sheet(), deflate: true }])).toEqual([['Amount', '42']]);
  });

  it('rejects expanded entries above the memory budget before inflating them', async () => {
    await expect(read([{ ...sheet(), declaredSize: 20 * 1024 * 1024 }])).rejects.toThrow(/too large/i);
  });

  it('enforces actual inflated bytes even when a ZIP lies about its size', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    await expect(read([{ ...sheet(xml(row.repeat(100))), deflate: true, declaredSize: 50 }])).rejects.toThrow(/too large/i);
  });

  it('rejects truncated stored entries instead of accepting partial XML', async () => {
    await expect(read([{ ...sheet(), declaredSize: 1 }])).rejects.toThrow(/damaged/i);
  });

  it('reports malformed central directory lengths as a readable import error', async () => {
    const bytes = archive([sheet()]);
    const view = new DataView(bytes.buffer);
    const central = view.getUint32(bytes.length - 6, true);
    view.setUint16(central + 28, 65535, true);
    await expect(readWorkbookGrid(file(bytes))).rejects.toThrow(/damaged/i);
  });

  it('rejects missing central-directory records', async () => {
    const bytes = archive([sheet()]);
    const view = new DataView(bytes.buffer);
    view.setUint16(bytes.length - 14, 2, true);
    view.setUint16(bytes.length - 12, 2, true);
    await expect(readWorkbookGrid(file(bytes))).rejects.toThrow(/damaged/i);
  });

  it('rejects duplicate archive entries', async () => {
    await expect(read([sheet(), sheet()])).rejects.toThrow(/damaged/i);
  });

  it('refuses an oversized row set rather than silently dropping transactions', async () => {
    await expect(read([sheet(xml('<row/>'.repeat(20_001)))])).rejects.toThrow(/too large/i);
  });

  it('refuses out-of-range columns rather than moving them under the wrong header', async () => {
    await expect(read([sheet(xml('<row><c r="CM1"><v>999</v></c></row>'))])).rejects.toThrow(/too large/i);
  });

  it('uses workbook tab order rather than the lowest worksheet filename', async () => {
    const parts = [sheet(), { name: 'xl/worksheets/custom.xml', body: xml('<row><c r="A1"><v>123</v></c></row>') }];
    expect(await read([...parts, ...workbookParts('worksheets/custom.xml')])).toEqual([['123']]);
  });

  it('honours the 1904 date system without changing numeric amounts', async () => {
    const body = xml('<row><c r="A1" s="1"><v>44216</v></c><c r="B1"><v>44216</v></c></row>');
    expect(await read([
      sheet(body), ...workbookParts('worksheets/sheet1.xml', true),
      { name: 'xl/styles.xml', body: '<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>' },
    ])).toEqual([['2025-01-21', '44216']]);
  });

  it('refuses an external worksheet relationship without reading another sheet', async () => {
    await expect(read([sheet(), ...workbookParts('https://example.com/sheet.xml')])).rejects.toThrow(/damaged/i);
  });
});
