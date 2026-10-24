/**
 * SHA-1 in plain JS, for hashing many short inputs (SimHash shingles) where a crypto API call per input costs more
 * than the hash itself. Not for security: here SHA-1 is only a well-spread hash whose output must stay stable.
 */

const W = new Int32Array(80);
let block = new Uint8Array(128);

/** Writes SHA-1(bytes[start, end)) into `out` as five big-endian 32-bit words. Inputs must be under 512 MB. */
export function sha1Into(bytes: Uint8Array, start: number, end: number, out: Int32Array): void {
  const len = end - start;
  const total = (((len + 8) >> 6) + 1) << 6;
  if (block.length < total) block = new Uint8Array(total);
  for (let i = 0; i < len; i++) block[i] = bytes[start + i]!;
  block[len] = 0x80;
  block.fill(0, len + 1, total - 4);
  const bits = len * 8;
  block[total - 4] = bits >>> 24;
  block[total - 3] = (bits >>> 16) & 0xff;
  block[total - 2] = (bits >>> 8) & 0xff;
  block[total - 1] = bits & 0xff;

  let h0 = 0x67452301 | 0, h1 = 0xefcdab89 | 0, h2 = 0x98badcfe | 0, h3 = 0x10325476 | 0, h4 = 0xc3d2e1f0 | 0;
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) {
      const p = off + i * 4;
      W[i] = (block[p]! << 24) | (block[p + 1]! << 16) | (block[p + 2]! << 8) | block[p + 3]!;
    }
    for (let i = 16; i < 80; i++) {
      const x = W[i - 3]! ^ W[i - 8]! ^ W[i - 14]! ^ W[i - 16]!;
      W[i] = (x << 1) | (x >>> 31);
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      const f = i < 20 ? ((b & c) | (~b & d)) + 0x5a827999
        : i < 40 ? (b ^ c ^ d) + 0x6ed9eba1
        : i < 60 ? ((b & c) | (b & d) | (c & d)) + (0x8f1bbcdc | 0)
        : (b ^ c ^ d) + (0xca62c1d6 | 0);
      const t = (((a << 5) | (a >>> 27)) + f + e + W[i]!) | 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = t;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }
  out[0] = h0;
  out[1] = h1;
  out[2] = h2;
  out[3] = h3;
  out[4] = h4;
}
