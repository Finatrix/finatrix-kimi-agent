import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The phone's own AI (step 3.7). Pinned here:
 *
 *  1. the request-size rule (`planOnDevice`), with the worked example from the PR;
 *  2. every way the on-device attempt says no, so the cloud answers instead;
 *  3. the consent gate still runs first: without permission nothing reaches
 *     the on-device model either;
 *  4. the money chat's grounding checks run on an on-device answer exactly as
 *     on a cloud one, and the answer is labelled as answered on the phone.
 */

const h = vi.hoisted(() => ({
  native: true,
  status: { state: 'available', engine: 'apple', contextTokens: 4096 } as Record<string, unknown>,
  statusCalls: [] as Array<{ prepare?: boolean } | undefined>,
  generate: vi.fn(),
  invoked: 0,
}));

function mockNative() {
  vi.doMock('../native/platform', () => ({ isNativeApp: () => h.native }));
  vi.doMock('@capacitor/core', () => ({
    registerPlugin: () => ({
      status: async (options?: { prepare?: boolean }) => { h.statusCalls.push(options); return h.status; },
      generate: h.generate,
    }),
  }));
}

function mockCloud() {
  vi.doMock('../lib/supabase', () => ({
    isSupabaseConfigured: true,
    supabase: { auth: { getUser: async () => ({ data: { user: null } }) } },
  }));
  vi.doMock('../lib/functions', () => ({
    readAccessToken: async () => 'token',
    invokeAuthed: async () => {
      h.invoked += 1;
      return { data: { content: '{"answer":"from the cloud"}', model: 'cloud-model' }, error: null, reason: null };
    },
  }));
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  h.native = true;
  h.status = { state: 'available', engine: 'apple', contextTokens: 4096 };
  h.statusCalls = [];
  h.generate.mockReset();
  h.generate.mockResolvedValue({ content: '{"action":"none"}' });
  h.invoked = 0;
  mockNative();
  mockCloud();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the request-size rule', () => {
  it('estimates ASCII at 3 characters a token and anything else at a token a character', async () => {
    const { estimateTokens } = await import('../lib/ai/onDevice');
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcdef')).toBe(2);
    expect(estimateTokens('abcdefg')).toBe(3);
    expect(estimateTokens('₹450')).toBe(2); // "450" → 1, "₹" → 1
    expect(estimateTokens('खाना')).toBe(4);
  });

  it('matches the worked example in the PR', async () => {
    const { planOnDevice } = await import('../lib/ai/onDevice');
    // Voice action: 2,658-char prompt + 600-char message, 256 tokens wanted, 4,096 context.
    // input = 886 + 200 = 1,086; room = 3,010 ≥ min(256, 1,024) → allow min(256, 3,010) = 256.
    expect(planOnDevice('x'.repeat(2_658), 'y'.repeat(600), 256, 4_096)).toBe(256);
    // Category suggestions: 1,962 + 4,500 chars, 3,500 wanted.
    // input = 654 + 1,500 = 2,154; room = 1,942 ≥ min(3,500, 1,024) → allow min(3,500, 1,942) = 1,942.
    expect(planOnDevice('x'.repeat(1_962), 'y'.repeat(4_500), 3_500, 4_096)).toBe(1_942);
    // Money chat: 14,424-char prompt alone is 4,808 tokens > 4,096 → cloud.
    expect(planOnDevice('x'.repeat(14_424), 'y'.repeat(3_000), 3_200, 4_096)).toBeNull();
    // Same chat on a model that reports a larger window → tried on the phone.
    expect(planOnDevice('x'.repeat(14_424), 'y'.repeat(3_000), 3_200, 16_384)).toBe(3_200);
  });

  it('needs room for the smaller of the wanted output and the 1,024-token reserve', async () => {
    const { planOnDevice } = await import('../lib/ai/onDevice');
    // room exactly 1,024 for a 3,500-token task → tried, capped at 1,024
    expect(planOnDevice('', 'y'.repeat(3 * 3_072), 3_500, 4_096)).toBe(1_024);
    // one token less → cloud
    expect(planOnDevice('', 'y'.repeat(3 * 3_073), 3_500, 4_096)).toBeNull();
  });
});

describe('reading the phone status', () => {
  it('treats anything unexpected as unsupported', async () => {
    const { toStatus, UNSUPPORTED } = await import('../lib/ai/onDevice');
    expect(toStatus(null)).toEqual(UNSUPPORTED);
    expect(toStatus({ state: 'available', engine: 'gpt', contextTokens: 4096 })).toEqual(UNSUPPORTED);
    expect(toStatus({ state: 'ready', engine: 'apple', contextTokens: 4096 })).toEqual(UNSUPPORTED);
    expect(toStatus({ state: 'available', engine: 'gemini-nano', contextTokens: 4000 }))
      .toEqual({ state: 'available', engine: 'gemini-nano', contextTokens: 4000 });
    // "available" with no usable window cannot answer anything yet.
    expect(toStatus({ state: 'available', engine: 'apple', contextTokens: 'big' }))
      .toEqual({ state: 'preparing', engine: 'apple', contextTokens: 0 });
  });

  it('is unsupported on the web without asking a plugin', async () => {
    h.native = false;
    const { onDeviceStatus, UNSUPPORTED } = await import('../lib/ai/onDevice');
    await expect(onDeviceStatus()).resolves.toEqual(UNSUPPORTED);
    expect(h.statusCalls).toHaveLength(0);
  });
});

describe('tryOnDevice', () => {
  const action = { task: 'money-action', system: 'Pick an action.', user: 'Add 450 for lunch', maxTokens: 256 };

  it('answers on the phone and labels the model', async () => {
    const { tryOnDevice } = await import('../lib/ai/onDevice');
    const out = await tryOnDevice(action);
    expect(out).toMatchObject({ ok: true, content: '{"action":"none"}', model: 'Apple on-device model' });
    expect(h.generate).toHaveBeenCalledWith({ system: 'Pick an action.', user: 'Add 450 for lunch', maxTokens: 256 });
    // A request about to use the model may start Android's download.
    expect(h.statusCalls).toEqual([{ prepare: true }]);
  });

  it('never runs on the web', async () => {
    h.native = false;
    const { tryOnDevice } = await import('../lib/ai/onDevice');
    await expect(tryOnDevice(action)).resolves.toEqual({ ok: false, reason: 'web' });
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('leaves tasks outside the list to the cloud', async () => {
    const { tryOnDevice } = await import('../lib/ai/onDevice');
    await expect(tryOnDevice({ ...action, task: 'ats' })).resolves.toEqual({ ok: false, reason: 'task' });
    await expect(tryOnDevice({ ...action, task: 'statement-layout' })).resolves.toEqual({ ok: false, reason: 'task' });
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('respects the user turning it off', async () => {
    const { tryOnDevice, setOnDevicePreferred, onDevicePreferred } = await import('../lib/ai/onDevice');
    expect(onDevicePreferred()).toBe(true);
    setOnDevicePreferred(false);
    await expect(tryOnDevice(action)).resolves.toEqual({ ok: false, reason: 'off' });
    setOnDevicePreferred(true);
    await expect(tryOnDevice(action)).resolves.toMatchObject({ ok: true });
  });

  it('waits for a model that is still preparing, and skips phones without one', async () => {
    const { tryOnDevice } = await import('../lib/ai/onDevice');
    h.status = { state: 'preparing', engine: 'gemini-nano', contextTokens: 0 };
    await expect(tryOnDevice(action)).resolves.toEqual({ ok: false, reason: 'preparing' });
    h.status = { state: 'unsupported', engine: 'apple', contextTokens: 0 };
    await expect(tryOnDevice(action)).resolves.toEqual({ ok: false, reason: 'unsupported' });
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('sends a request too long for the model to the cloud without trying', async () => {
    const { tryOnDevice } = await import('../lib/ai/onDevice');
    await expect(tryOnDevice({ ...action, task: 'money-chat', system: 'x'.repeat(14_424), maxTokens: 3_200 }))
      .resolves.toEqual({ ok: false, reason: 'too-long' });
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('falls back on a refusal or error', async () => {
    h.generate.mockImplementation(() => Promise.reject(Object.assign(new Error('guardrail'), { code: 'failed' })));
    const { tryOnDevice } = await import('../lib/ai/onDevice');
    await expect(tryOnDevice(action)).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it('falls back on a reply that is not a JSON object, or fails the caller’s check', async () => {
    const { tryOnDevice } = await import('../lib/ai/onDevice');
    h.generate.mockResolvedValue({ content: 'Sure! Here is your answer.' });
    await expect(tryOnDevice(action)).resolves.toEqual({ ok: false, reason: 'unusable' });
    h.generate.mockResolvedValue({ content: '{}' });
    await expect(tryOnDevice(action)).resolves.toEqual({ ok: false, reason: 'unusable' });
    h.generate.mockResolvedValue({ content: '{"action":"teleport"}' });
    await expect(tryOnDevice({ ...action, acceptLocal: () => false })).resolves.toEqual({ ok: false, reason: 'unusable' });
    h.generate.mockResolvedValue({ content: 42 });
    await expect(tryOnDevice(action)).resolves.toEqual({ ok: false, reason: 'unusable' });
  });

  it('gives up on a phone that takes too long', async () => {
    vi.useFakeTimers();
    h.generate.mockImplementation(() => new Promise(() => {}));
    const { tryOnDevice, ON_DEVICE_TIMEOUT_MS } = await import('../lib/ai/onDevice');
    const pending = tryOnDevice(action);
    await vi.advanceTimersByTimeAsync(ON_DEVICE_TIMEOUT_MS);
    await expect(pending).resolves.toEqual({ ok: false, reason: 'timeout' });
  });
});

describe('the transport', () => {
  const req = { task: 'money-action', system: 'Pick an action.', user: 'Add 450 for lunch', maxTokens: 256 };

  it('asks for permission first: without it nothing reaches the phone’s model either', async () => {
    const { requestCompletion } = await import('../lib/ai/transport');
    await expect(requestCompletion(req)).resolves.toEqual({ ok: false, kind: 'no-consent', message: '' });
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.statusCalls).toHaveLength(0);
    expect(h.invoked).toBe(0);
  });

  it('answers on the phone once allowed, and sends nothing to the cloud', async () => {
    localStorage.setItem('fx_ai_consent', '1');
    const { requestCompletion } = await import('../lib/ai/transport');
    const result = await requestCompletion(req);
    expect(result).toMatchObject({ ok: true, onDevice: true, model: 'Apple on-device model', promptTokens: 0, completionTokens: 0 });
    expect(h.invoked).toBe(0);
  });

  it('uses the cloud whenever the phone cannot answer', async () => {
    localStorage.setItem('fx_ai_consent', '1');
    h.generate.mockImplementation(() => Promise.reject(new Error('busy')));
    const { requestCompletion } = await import('../lib/ai/transport');
    const result = await requestCompletion(req);
    expect(result).toMatchObject({ ok: true, content: '{"answer":"from the cloud"}', model: 'cloud-model' });
    expect(result.ok && result.onDevice).toBeFalsy();
    expect(h.invoked).toBe(1);
  });

  it('uses the cloud when the caller rejects the phone’s reply', async () => {
    localStorage.setItem('fx_ai_consent', '1');
    const { requestCompletion } = await import('../lib/ai/transport');
    const result = await requestCompletion({ ...req, acceptLocal: () => false });
    expect(result).toMatchObject({ ok: true, model: 'cloud-model' });
    expect(h.invoked).toBe(1);
  });

  it('keeps tasks outside the list in the cloud', async () => {
    localStorage.setItem('fx_ai_consent', '1');
    const { requestCompletion } = await import('../lib/ai/transport');
    await requestCompletion({ ...req, task: 'parse' });
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.invoked).toBe(1);
  });
});

describe('the money chat on the phone', () => {
  const tx = (date: string, amount: number, category = 'groceries') => ({ id: `${date}-${category}-${amount}`, date, category, amount });

  async function askWith(content: string, onDevice: boolean) {
    const seen: Array<{ acceptLocal?: (c: string) => boolean }> = [];
    vi.doMock('../lib/ai/transport', () => ({
      requestCompletion: async (r: { acceptLocal?: (c: string) => boolean }) => {
        seen.push(r);
        return { ok: true, content, model: onDevice ? 'Apple on-device model' : 'cloud-model', ms: 1, promptTokens: 0, completionTokens: 0, ...(onDevice ? { onDevice: true } : {}) };
      },
    }));
    const { BUILTIN_CATS } = await import('../tools/lib/budget');
    const { ask } = await import('../tools/ai/assistant');
    const result = await ask({
      month: '2026-03', now: new Date(2026, 2, 15), currency: 'INR', cats: BUILTIN_CATS,
      items: [tx('2026-03-02', 300), tx('2026-02-20', 2000)],
      budgetStore: { '2026-03': { income: '5000', n: '50', w: '30', s: '20', vals: { groceries: 600 } } },
      question: 'Explain my income',
    });
    return { result, seen };
  }

  it('runs the same grounding checks and withholds the same tiles', async () => {
    const content = JSON.stringify({
      mode: 'data',
      answer: 'Your income is ₹5,000 and you have ₹77,777 put away.',
      highlights: [
        { label: 'Income', value: 5000, unit: 'currency', source: 'data.income' },
        { label: 'Invented', value: 77777, unit: 'currency', source: 'data.income' },
      ],
    });
    const device = await askWith(content, true);
    vi.resetModules();
    const cloud = await askWith(content, false);
    expect(device.result.ok && cloud.result.ok).toBe(true);
    if (!device.result.ok || !cloud.result.ok) return;
    expect(device.result.origin).toBe('device');
    expect(cloud.result.origin).toBeUndefined();
    // Identical checks, identical outcome: only the label differs.
    expect(device.result.highlights).toEqual(cloud.result.highlights);
    expect(device.result.highlights.map((x) => x.label)).toEqual(['Income']);
    expect(device.result.grounding).toEqual(cloud.result.grounding);
    expect(device.result.grounding).not.toBeNull();
    expect(device.result.grounding!.unmatched).toEqual(expect.arrayContaining([expect.stringContaining('77,777')]));
  });

  it('asks the transport to reject a malformed on-device reply', async () => {
    const { seen } = await askWith(JSON.stringify({ mode: 'general', answer: 'ok' }), true);
    const accept = seen[0].acceptLocal!;
    expect(accept(JSON.stringify({ mode: 'general', answer: 'Compounding is growth on growth.' }))).toBe(true);
    expect(accept('{"nothing":"useful"}')).toBe(false);
  });
});
