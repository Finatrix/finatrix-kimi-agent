import { describe, it, expect } from 'vitest';

import { ATTEMPTS, BACKOFF_MS, sampleUntilAnswered } from '../../scripts/lib/retry.mjs';

/**
 * The deploy verifier's transport, pinned in both directions.
 *
 * `npm run verify:production` runs immediately after `wrangler deploy` and is
 * the only thing that can fail a deploy AFTER the upload succeeded. Its retry
 * policy is therefore the line between two opposite mistakes:
 *
 *   • too little, and one dropped connection among ~150 requests reports a
 *     healthy production as broken — the failure that trains people to hit
 *     "re-run" without reading, which is how a real failure gets waved through;
 *   • too much, and a genuinely broken origin is retried into looking fine.
 *
 * Both are cheap to introduce by editing one comparison, so both are tested.
 */

/** A stub response with only what the retry policy actually reads. */
const answer = (status) => ({ status, body: null });

/** Counts calls and replays a script of outcomes, one per attempt. */
function transport(...outcomes) {
  const calls = [];
  return {
    calls,
    send: () => {
      // Indexed, not `??`-defaulted: `null` is a MEANINGFUL outcome here (no
      // response at all), and nullish-coalescing past it silently turned the
      // dropped-connection case into a first-attempt success.
      const outcome =
        calls.length < outcomes.length ? outcomes[calls.length] : outcomes[outcomes.length - 1];
      calls.push(outcome);
      return Promise.resolve(outcome);
    },
  };
}

/** No real waiting; records what the policy would have slept. */
function fakeClock() {
  const slept = [];
  return { slept, sleep: (ms) => { slept.push(ms); return Promise.resolve(); } };
}

describe('deploy verifier retry policy', () => {
  it('accepts the first answer and does not ask twice', async () => {
    const t = transport(answer(200));
    const clock = fakeClock();

    const res = await sampleUntilAnswered(t.send, { sleep: clock.sleep });

    expect(res?.status).toBe(200);
    expect(t.calls).toHaveLength(1);
    expect(clock.slept).toEqual([]);
  });

  it('recovers a deploy from a single dropped connection', async () => {
    // null is "no response at all" — a reset, a DNS failure, or the 20s
    // timeout firing. This exact sequence used to fail the whole pipeline.
    const t = transport(null, answer(200));
    const clock = fakeClock();

    const res = await sampleUntilAnswered(t.send, { sleep: clock.sleep });

    expect(res?.status).toBe(200);
    expect(t.calls).toHaveLength(2);
    expect(clock.slept).toEqual([BACKOFF_MS[0]]);
  });

  it('recovers from a transient Cloudflare 52x', async () => {
    const t = transport(answer(522), answer(521), answer(200));
    const clock = fakeClock();

    const res = await sampleUntilAnswered(t.send, { sleep: clock.sleep });

    expect(res?.status).toBe(200);
    expect(t.calls).toHaveLength(3);
    expect(clock.slept).toEqual(BACKOFF_MS);
  });

  it('still fails a production that is genuinely down', async () => {
    // The gate keeps its teeth: an origin that answers 500 every time is
    // reported as 500, not retried into a pass.
    const t = transport(answer(500));
    const clock = fakeClock();

    const res = await sampleUntilAnswered(t.send, { sleep: clock.sleep });

    expect(res?.status).toBe(500);
    expect(t.calls).toHaveLength(ATTEMPTS);
  });

  it('still fails a production that never responds', async () => {
    const t = transport(null);

    const res = await sampleUntilAnswered(t.send, { sleep: fakeClock().sleep });

    expect(res).toBeNull();
    expect(t.calls).toHaveLength(ATTEMPTS);
  });

  it('is bounded — a broken origin cannot stall the job', async () => {
    const t = transport(answer(503));

    await sampleUntilAnswered(t.send, { sleep: fakeClock().sleep });

    expect(t.calls.length).toBeLessThanOrEqual(ATTEMPTS);
  });

  /**
   * The half that is easy to lose in a refactor. A 4xx is the server telling
   * you something, and two callers read it verbatim: `checkSoft404` asserts a
   * real 404, and the edge-challenge detector keys off the 403 Cloudflare's bot
   * protection returns. Retrying either would waste seconds per URL and, for
   * the challenge, could turn one honest "UNVERIFIED, exit 0" into three.
   */
  it.each([400, 401, 403, 404, 429, 499])('returns %i unretried — it is an answer', async (status) => {
    const t = transport(answer(status));

    const res = await sampleUntilAnswered(t.send, { sleep: fakeClock().sleep });

    expect(res?.status).toBe(status);
    expect(t.calls).toHaveLength(1);
  });

  it('waits between attempts rather than hammering the edge', async () => {
    expect(BACKOFF_MS).toHaveLength(ATTEMPTS - 1);
    for (const ms of BACKOFF_MS) expect(ms).toBeGreaterThan(0);
    // Strictly increasing: a second failure is likelier to be real than the
    // first, so it is worth waiting longer before spending the last attempt.
    expect([...BACKOFF_MS].sort((a, b) => a - b)).toEqual(BACKOFF_MS);
  });
});
