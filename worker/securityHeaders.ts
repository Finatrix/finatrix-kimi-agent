/**
 * Security headers for responses the Worker generates itself. Asset responses
 * get theirs from `public/_headers`, but redirects, `/healthz` and the API
 * routes never touch the assets runtime, so without this they would ship bare —
 * including the 301 that every visitor to a legacy domain receives, which is
 * precisely the response that most needs to carry HSTS.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};
