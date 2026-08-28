/**
 * The single gate every attacker-supplied destination passes through.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `?next=` on the sign-in page is a redirect target chosen by whoever wrote the
 * link. Honour it unchecked and the page becomes an open redirector: a URL that
 * reads as finatrix.co, shows the real sign-in form, and hands the browser to
 * somebody else's site the moment the password is accepted. That is the setup
 * for a credential-phishing chain, and it is a redirect the user has every
 * reason to trust, because everything up to the last hop was genuine.
 *
 * The check used to be written inline, twice — once in Login.tsx and once again
 * as "belt and braces" in AuthContext — as:
 *
 *     next.startsWith('/') && !next.startsWith('//')
 *
 * That is the right IDEA expressed as string prefixes, and string prefixes are
 * not how a browser reads a URL. The WHATWG parser folds `\`, and strips tabs
 * and newlines, BEFORE it decides where the authority ends, so every one of
 * these clears both prefix tests and then parses as a path that begins `//`:
 *
 *     /\evil.example        →  //evil.example
 *     /<TAB>/evil.example   →  //evil.example
 *     /<LF>/evil.example    →  //evil.example
 *     /./\evil.example      →  //evil.example
 *
 * Today those land back on this origin rather than off it, because both call
 * sites happen to concatenate the value onto `window.location.origin` or hand
 * it to react-router. In other words the guard is not what is protecting the
 * app — the consumers are — and the day one of them passes the value to
 * `location.href`, or a `redirectTo` that is resolved relative rather than
 * absolute, the guard silently stops holding. A security control whose
 * correctness depends on how its callers happen to use the result is not a
 * control; it is a coincidence.
 *
 * So this resolves the candidate the way the browser will, against a fixed
 * origin, and accepts it only if it is still on that origin. What comes back is
 * always a normalised same-site path, never the caller's raw string.
 */

/**
 * A same-site path from an untrusted string, or `fallback` if it is not one.
 *
 * Returns `pathname + search + hash` re-serialised by the URL parser, so the
 * caller receives what the browser would actually navigate to rather than the
 * text it was handed. Anything absolute, protocol-relative, scheme-bearing
 * (`javascript:`, `data:`), or cross-origin resolves away and yields `fallback`.
 *
 * @param candidate  The untrusted value, e.g. `new URLSearchParams(search).get('next')`.
 * @param fallback   Where to go instead. Must itself be a same-site path.
 * @param origin     The origin to resolve against. Defaults to the live one.
 */
export function safeInternalPath(
  candidate: string | null | undefined,
  fallback: string,
  origin: string = typeof window !== 'undefined' ? window.location.origin : 'https://finatrix.co',
): string {
  if (!candidate) return fallback;

  let resolved: URL;
  let base: URL;
  try {
    base = new URL(origin);
    resolved = new URL(candidate, base);
  } catch {
    // A candidate the URL parser refuses outright is not something to salvage.
    return fallback;
  }

  // `new URL('https://evil.example', base)` parses happily and simply ignores
  // the base — an absolute URL is exactly how this attack is written — so the
  // origin comparison is the whole check, not a formality.
  if (resolved.origin !== base.origin) return fallback;

  // `javascript:` and `data:` never reach here (their origin is "null", which
  // cannot equal a real one), but a protocol equality test states the intent
  // rather than relying on a null-origin implementation detail.
  if (resolved.protocol !== base.protocol) return fallback;

  const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;

  // The last gate, and the subtle one. Resolving against this origin is not the
  // end of the job, because the RESULT is handed back as a relative reference —
  // and a relative reference beginning `//` is protocol-relative, so it names an
  // authority all over again. `/./\evil.example` resolves to a URL on this
  // origin whose pathname is `//evil.example`; returning that pathname would
  // hand the caller the exact string this function exists to reject, laundered
  // through a check it passed. A path that survives here has to be unambiguous
  // on its own, not merely same-origin in the context it was resolved in.
  if (!path.startsWith('/') || path.startsWith('//')) return fallback;

  return path;
}
