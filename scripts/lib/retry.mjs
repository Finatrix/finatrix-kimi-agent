/**
 * Sample a request more than once before letting it fail a deploy.
 *
 * `scripts/verify-production.mjs` makes on the order of 150 sequential requests
 * to a live edge from whichever CI runner the job landed on, and every check it
 * performs turns "no response" into a hard failure. At that volume a single TCP
 * reset, DNS blip or slow response is not unlikely — and the consequence is out
 * of all proportion to the cause: `wrangler deploy` has already succeeded,
 * production is serving correctly, and the pipeline reports the site as broken.
 *
 * That failure is worse than useless. It teaches everyone to re-run the
 * workflow instead of reading it, which is exactly how a REAL failure gets
 * waved through.
 *
 * Retrying costs the gate nothing: an origin that is genuinely down fails every
 * attempt and still fails the deploy. What disappears is the single-sample
 * noise.
 */

/** Attempts in total, not retries after the first. */
export const ATTEMPTS = 3;

/** Waited BETWEEN attempts, so `ATTEMPTS - 1` values. */
export const BACKOFF_MS = [500, 2_000];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Call `send` until it returns an answer, up to `attempts` times.
 *
 * "An answer" is any response below 500, and every 4xx is one — a 404 and a 403
 * are the server telling you something, and two callers depend on reading them
 * verbatim: the soft-404 check wants a real 404, and the edge-challenge
 * detector wants the 403 Cloudflare's bot protection returns. Retrying those
 * would be both pointless and wrong.
 *
 * 5xx and a null (network error or timeout) are retried, because neither is an
 * answer. Cloudflare's own 52x family in particular — 521 origin down, 522
 * connection timed out, 524 origin took too long — is emitted at the edge for
 * conditions that routinely clear within seconds.
 *
 * @param {() => Promise<Response | null>} send one attempt; null means no response
 * @param {{attempts?: number, backoffMs?: number[], sleep?: (ms: number) => Promise<void>}} [options]
 * @returns {Promise<Response | null>} the first answer, or the last attempt's result
 */
export async function sampleUntilAnswered(send, options = {}) {
  const { attempts = ATTEMPTS, backoffMs = BACKOFF_MS, sleep = wait } = options;

  for (let attempt = 1; ; attempt++) {
    const res = await send();
    if (res && res.status < 500) return res;
    if (attempt >= attempts) return res;

    // Nothing reads a discarded body, and an unconsumed one holds its socket
    // out of the pool for the rest of the run.
    await res?.body?.cancel?.().catch(() => {});
    await sleep(backoffMs[attempt - 1] ?? backoffMs[backoffMs.length - 1] ?? 0);
  }
}
