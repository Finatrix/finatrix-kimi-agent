/**
 * Content hashing. SHA-256 fingerprints detect duplicate uploads (same file =
 * same hash → reuse the cached analysis instead of paying for AI again).
 */

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * SHA-256 of raw file bytes, as lowercase hex.
 *
 * The bytes are wrapped in a `Uint8Array` view rather than handed to `digest`
 * directly. A bare `ArrayBuffer` that crosses a JS realm boundary — which is
 * exactly what `File.arrayBuffer()` produces under jsdom — fails Web Crypto's
 * cross-realm brand check even though `buf instanceof ArrayBuffer` is `true` on
 * the calling side, and Node 20 rejects it outright:
 *
 *   TypeError: 2nd argument is not instance of ArrayBuffer, Buffer,
 *              TypedArray, or DataView   (ERR_INVALID_ARG_TYPE)
 *
 * The view is constructed with the local `Uint8Array`, so it always carries the
 * current realm's brand. It is zero-copy — it borrows the same memory — so this
 * costs nothing on a real upload. `sha256OfText` never hit this because a
 * `TextEncoder` already hands back a local view.
 *
 * Accepts any `BufferSource` so a caller that already holds a typed array does
 * not have to detach a buffer to call this.
 */
export async function sha256OfBytes(bytes: BufferSource): Promise<string> {
  const view = ArrayBuffer.isView(bytes)
    ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', view);
  return toHex(digest);
}

/** SHA-256 of a UTF-8 string (used to key AI analysis caching). */
export async function sha256OfText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return toHex(digest);
}
