import { describe, it, expect } from 'vitest';
import { sniffKind, validateResumeFile } from '../careers/parser/validate';
import { MAX_FILE_BYTES } from '../careers/constants';

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]; // %PDF-1.7
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0];
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function fileOf(bytes: number[], name: string, type = ''): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('sniffKind', () => {
  it('recognises PDF, OOXML zip and OLE containers', () => {
    expect(sniffKind(new Uint8Array(PDF_MAGIC))).toBe('pdf');
    expect(sniffKind(new Uint8Array(ZIP_MAGIC))).toBe('docx');
    expect(sniffKind(new Uint8Array(OLE_MAGIC))).toBe('doc');
    expect(sniffKind(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
  });
});

describe('validateResumeFile', () => {
  it('accepts a valid PDF', async () => {
    await expect(validateResumeFile(fileOf(PDF_MAGIC, 'cv.pdf', 'application/pdf')))
      .resolves.toEqual({ kind: 'pdf', extension: 'pdf' });
  });

  it('accepts modern Word content behind a legacy .doc name', async () => {
    await expect(validateResumeFile(fileOf(ZIP_MAGIC, 'cv.doc'))).resolves.toEqual({ kind: 'docx', extension: 'doc' });
  });

  it('rejects empty files', async () => {
    await expect(validateResumeFile(new File([], 'cv.pdf'))).rejects.toMatchObject({ code: 'validation' });
  });

  it('rejects oversized files without reading them', async () => {
    const big = new File([new ArrayBuffer(MAX_FILE_BYTES + 1)], 'cv.pdf');
    await expect(validateResumeFile(big)).rejects.toThrow(/10 MB/);
  });

  it('rejects unsupported extensions', async () => {
    await expect(validateResumeFile(fileOf(PDF_MAGIC, 'cv.txt'))).rejects.toThrow(/PDF, DOCX or DOC/);
  });

  it('rejects wrong declared MIME types', async () => {
    await expect(validateResumeFile(fileOf(PDF_MAGIC, 'cv.pdf', 'image/png'))).rejects.toMatchObject({ code: 'validation' });
  });

  it('rejects an executable renamed to .pdf (magic-byte mismatch)', async () => {
    await expect(validateResumeFile(fileOf([0x4d, 0x5a, 0x90, 0x00, 0, 0, 0, 0], 'cv.pdf')))
      .rejects.toThrow(/does not look like a valid/);
  });

  it('rejects a zip renamed to .pdf', async () => {
    await expect(validateResumeFile(fileOf(ZIP_MAGIC, 'cv.pdf'))).rejects.toThrow(/different contents/);
  });
});
