/**
 * Content hashing. SHA-256 fingerprints detect duplicate uploads (same file =
 * same hash → reuse the cached analysis instead of paying for AI again).
 */

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** SHA-256 of raw file bytes, as lowercase hex. */
export async function sha256OfBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return toHex(digest);
}

/** SHA-256 of a UTF-8 string (used to key AI analysis caching). */
export async function sha256OfText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return toHex(digest);
}
