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

  /**
   * The real upload path: bytes arrive from `File.arrayBuffer()`. Under jsdom
   * that buffer belongs to another JS realm, and handing it to `digest`
   * unwrapped fails Web Crypto's brand check on Node 20 with
   * ERR_INVALID_ARG_TYPE — even though `buf instanceof ArrayBuffer` is true on
   * the calling side. It surfaced only as four confusing failures in the
   * pipeline suite, and only in CI, because a dev machine on Node 22 accepts
   * it. Hashing the same bytes through a File must give the same fingerprint
   * as hashing them directly, or every cached analysis silently misses.
   */
  it('hashes bytes that arrived through a File, across the realm boundary', async () => {
    const file = new File([new TextEncoder().encode('abc')], 'cv.pdf');
    expect(await sha256OfBytes(await file.arrayBuffer())).toBe(ABC);
  });

  it('accepts a typed array as readily as a raw buffer', async () => {
    expect(await sha256OfBytes(new TextEncoder().encode('abc'))).toBe(ABC);
  });

  it('hashes only the bytes a partial view covers, not its whole buffer', async () => {
    // A view with a non-zero byteOffset must not hash the padding around it.
    const padded = new TextEncoder().encode('xxabcxx');
    const slice = new Uint8Array(padded.buffer, 2, 3); // exactly "abc"
    expect(await sha256OfBytes(slice)).toBe(ABC);
  });
});
