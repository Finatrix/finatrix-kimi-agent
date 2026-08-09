/**
 * One source of truth for edge-function CORS.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Every function used to build its own allowlist like this:
 *
 *     const ALLOWED_ORIGINS = (Deno.env.get('CAREERS_ALLOWED_ORIGINS') ?? '<defaults>')
 *
 * `??` makes the environment variable REPLACE the built-in list rather than
 * extend it. During the finatrix.online → finatrix.co migration that turned a
 * forgotten dashboard secret into a production outage: the secret still read
 * `https://finatrix.online,...`, so the code default naming the new domain was
 * never evaluated, and `analytics-collect` — the one function that does strict
 * membership rather than reflecting the caller — answered every request from
 * https://finatrix.co with `Access-Control-Allow-Origin: https://finatrix.online`.
 * The browser rejected all of it: 100% of analytics, error reports and web
 * vitals dropped, and the console filled with CORS errors, while the repository,
 * the build and every local test stayed green.
 *
 * The rule here inverts that failure mode: the canonical origins are ALWAYS
 * allowed, derived from one constant, and `CAREERS_ALLOWED_ORIGINS` is purely
 * ADDITIVE — it can grant extra origins but can never revoke the site's own.
 * A stale secret is now inert instead of fatal. Moving domains again means
 * editing `CANONICAL_HOST` in one place.
 */

/**
 * The canonical production apex. MUST equal `CANONICAL_HOST` in
 * src/shared/routes.ts — `src/test/edge-cors.test.ts` fails the build if the
 * two ever drift. It is duplicated rather than imported because Supabase
 * bundles each function from `supabase/functions/`, so a reach into `src/`
 * would not survive `supabase functions deploy`.
 */
/**
 * Minimal ambient declaration for the one Deno API this module touches.
 *
 * These files run on Deno, but `src/test/edge-cors.test.ts` imports this module
 * so the drift guard against src/shared/routes.ts is a real assertion rather
 * than a string comparison. That pulls the file into the app's `tsc -b`
 * program, which has no Deno types. Declaring only `env.get` keeps the build
 * honest — full `@types/deno` would be a dependency added for one property.
 */
declare const Deno: { env: { get(key: string): string | undefined } };

export const CANONICAL_HOST = 'finatrix.co';

/** The canonical origin. Used as the safe fallback for any request that
 *  carries no usable `Origin` header, so the header is never sourced from a
 *  possibly-stale environment variable. */
export const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;

/** Local dev servers: `vite dev` (5173) and `vite preview` (4173). */
const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:4173'];

/** Origins that are always allowed, whatever the environment says. */
const BASE_ORIGINS = [CANONICAL_ORIGIN, `https://www.${CANONICAL_HOST}`, ...DEV_ORIGINS];

/**
 * The effective allowlist: the built-in origins plus anything named in
 * `CAREERS_ALLOWED_ORIGINS`. Additive by design — see the note above.
 */
export const ALLOWED_ORIGINS: string[] = [
  ...new Set([
    ...BASE_ORIGINS,
    ...(Deno.env.get('CAREERS_ALLOWED_ORIGINS') ?? '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean),
  ]),
];

/** Any localhost / 127.0.0.1 origin, on any port, for local dev. */
export function isLocalOrigin(origin: string): boolean {
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

/** A well-formed http(s) web origin with no path, e.g. `https://finatrix.co`. */
export function isWebOrigin(origin: string): boolean {
  return /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin);
}

export interface CorsOptions {
  /** Value for `Access-Control-Allow-Headers`. */
  headers: string;
  /** Value for `Access-Control-Allow-Methods`. */
  methods: string;
  /**
   * Reflect ANY well-formed web origin, not just allow-listed ones.
   *
   * Safe — and correct — for the authenticated `careers-*` endpoints: they are
   * bearer-token APIs with no cookie auth and no `Allow-Credentials`, so
   * reflecting an origin grants a third-party site nothing it could not already
   * do with `fetch` from a server. Turning it on means an allowlist that drifts
   * behind a domain change degrades to "still works" instead of "browser CORS
   * error", which is the entire lesson of this migration.
   *
   * `analytics-collect` deliberately leaves it OFF: it is an unauthenticated
   * write endpoint, so a strict allowlist is what stops any site on the
   * internet from posting events into FinatriX's analytics table.
   */
  reflectAnyWebOrigin: boolean;
  /**
   * Send `Access-Control-Allow-Credentials: true`.
   *
   * Required by `navigator.sendBeacon`, which the analytics client uses as its
   * primary transport. The Beacon spec fixes the request's credentials mode to
   * "include" — it is not configurable — and the CORS check for a credentialed
   * request FAILS unless the response carries this header. Without it the
   * browser discards the beacon before it leaves the machine.
   *
   * That is not theoretical: on production, Firefox rejected every
   * `analytics-collect` beacon with NS_ERROR_DOM_BAD_URI and WebKit with
   * "Credentials flag is true, but Access-Control-Allow-Credentials is not
   * 'true'". The loss is silent — `sendBeacon` returns `true` for "queued",
   * so the client's `fetch(keepalive)` fallback never runs, and the endpoint
   * itself answers a plain server-side POST with 204, so every server-side
   * check passes while real browsers deliver nothing.
   *
   * MUST NOT be combined with `reflectAnyWebOrigin` — see the guard in
   * `corsHeaders`. Credentials plus an arbitrarily reflected origin is what
   * turns a CORS policy into a same-origin bypass for every site on the
   * internet. Safe on `analytics-collect` precisely because that function
   * pins a strict allowlist, and safe in kind because the endpoint is
   * cookieless and anonymous: there are no ambient credentials to ride on.
   */
  allowCredentials?: boolean;
}

/**
 * CORS headers for `req`.
 *
 * A request whose `Origin` is allowed (or reflectable) gets that origin echoed
 * back. Everything else — absent, malformed, or not permitted — gets
 * `CANONICAL_ORIGIN`, which denies the caller without ever advertising a
 * retired domain. `Vary: Origin` is always set so shared caches never serve one
 * origin's response to another.
 */
export function corsHeaders(req: Request, opts: CorsOptions): Record<string, string> {
  // Reflecting any origin AND allowing credentials would let every site on the
  // internet make credentialed cross-origin calls with the browser's ambient
  // authority. Fail loudly at the call site rather than silently emitting it.
  if (opts.reflectAnyWebOrigin && opts.allowCredentials) {
    throw new Error(
      'corsHeaders: allowCredentials cannot be combined with reflectAnyWebOrigin',
    );
  }
  const origin = req.headers.get('Origin') ?? '';
  const permitted = Boolean(origin) && (
    ALLOWED_ORIGINS.includes(origin)
    || isLocalOrigin(origin)
    || (opts.reflectAnyWebOrigin && isWebOrigin(origin))
  );
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': permitted ? origin : CANONICAL_ORIGIN,
    'Access-Control-Allow-Headers': opts.headers,
    'Access-Control-Allow-Methods': opts.methods,
    Vary: 'Origin',
  };
  // Only for a permitted origin: emitting it alongside the fallback origin
  // would advertise credentialed access the caller does not have.
  if (opts.allowCredentials && permitted) {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}
