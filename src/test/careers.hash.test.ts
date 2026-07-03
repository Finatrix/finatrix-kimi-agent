import { describe, it, expect } from 'vitest';
import { sha256OfBytes, sha256OfText } from '../careers/utils/hash';

// Known SHA-256 vector: "abc"
const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

describe('careers hashing', () => {
  it('hashes text to the known SHA-256 vector', async () => {
    expect(await sha256OfText('abc')).toBe(ABC);
  });

  it('hashes raw bytes identically to the same text', async () => {
    const bytes = new TextEncoder().encode('abc');
    expect(await sha256OfBytes(bytes.buffer as ArrayBuffer)).toBe(ABC);
  });

  it('different content yields different fingerprints', async () => {
    expect(await sha256OfText('resume-a')).not.toBe(await sha256OfText('resume-b'));
  });
});
