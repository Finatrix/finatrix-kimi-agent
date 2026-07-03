import { describe, it, expect } from 'vitest';
import { extractDocText } from '../careers/parser/doc';
import { CareersError } from '../careers/utils/errors';

function utf16Buffer(text: string, junkBytes = 64): ArrayBuffer {
  const junk = new Uint8Array(junkBytes).fill(0x01);
  const encoded = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    encoded[i * 2] = code & 0xff;
    encoded[i * 2 + 1] = code >> 8;
  }
  const out = new Uint8Array(junk.length * 2 + encoded.length);
  out.set(junk, 0);
  out.set(encoded, junk.length);
  out.set(junk, junk.length + encoded.length);
  return out.buffer;
}

const PROSE =
  'Jane Smith is a senior compliance analyst with nine years of experience across banking ' +
  'and fintech. She led AML monitoring programmes, managed regulator relationships and ' +
  'built a fraud triage team of six people covering three markets.';

describe('extractDocText', () => {
  it('recovers UTF-16 prose runs from a binary .doc-like buffer', () => {
    const text = extractDocText(utf16Buffer(PROSE));
    expect(text).toContain('senior compliance analyst');
    expect(text).toContain('fraud triage team');
  });

  it('throws a clear conversion error when too little text is legible', () => {
    expect(() => extractDocText(utf16Buffer('Hi'))).toThrowError(CareersError);
    expect(() => extractDocText(new Uint8Array(500).fill(7).buffer)).toThrow(/save it as PDF or DOCX/i);
  });
});
