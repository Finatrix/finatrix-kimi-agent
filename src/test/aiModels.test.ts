import { describe, expect, it } from 'vitest';
import { AI_MODEL_OPTIONS, RETIRED_MODEL_IDS } from '../careers/constants';
import { resolveSettings } from '../careers/services/careerProfile';
import type { CareerProfileRow } from '../careers/types';
import { estimateCost } from '../lib/ai/usage';
import { CHAT_MODEL } from '../tools/ai/assistant';

/**
 * A model id is named in four places that must move together: the edge
 * function's chain (Deno, out of reach here), the picker, the cost table and
 * the chat model. These guard the three this app owns — a miss in the cost
 * table is silent, because an unpriced model is quietly costed at a default.
 */

const UNPRICED = estimateCost('not/a-model', 1000, 1000);
const isPriced = (id: string) => estimateCost(id, 1000, 1000) !== UNPRICED;
const offered = AI_MODEL_OPTIONS.map((m) => m.id).filter(Boolean);

describe('model ids and the cost table', () => {
  it.each(offered)('prices the picker option %s', (id) => {
    expect(isPriced(id)).toBe(true);
  });

  it('prices the money assistant model', () => {
    expect(isPriced(CHAT_MODEL)).toBe(true);
  });

  it('offers the money assistant model in the picker, so one id is not defined twice and left to drift', () => {
    expect(offered).toContain(CHAT_MODEL);
  });

  it.each(Object.keys(RETIRED_MODEL_IDS))('still prices the retired id %s', (id) => {
    expect(isPriced(id)).toBe(true);
  });
});

describe('RETIRED_MODEL_IDS', () => {
  it.each(Object.entries(RETIRED_MODEL_IDS))('sends %s to an option the picker offers', (_old, successor) => {
    expect(offered).toContain(successor);
  });

  it('never retires an id the picker still offers', () => {
    // Object.keys, not toHaveProperty: that reads the dots in an id as a path.
    for (const id of offered) expect(Object.keys(RETIRED_MODEL_IDS)).not.toContain(id);
  });
});

describe('resolveSettings: saved model', () => {
  const withModel = (model: string) =>
    resolveSettings({ settings: { model } } as unknown as CareerProfileRow);

  it('reads a saved retired model as its successor, so the picker and the request agree', () => {
    expect(withModel('anthropic/claude-sonnet-5').model).toBe('anthropic/claude-sonnet-5.5');
  });

  it.each(Object.entries(RETIRED_MODEL_IDS))('migrates %s', (old, successor) => {
    expect(withModel(old).model).toBe(successor);
  });

  it.each(offered)('leaves the current model %s alone', (id) => {
    expect(withModel(id).model).toBe(id);
  });

  it('keeps Automatic, and defaults to it with no profile', () => {
    expect(withModel('').model).toBe('');
    expect(resolveSettings(null).model).toBe('');
  });

  it('does not touch an unknown id: the server ignores it and uses its own chain', () => {
    expect(withModel('some/other-model').model).toBe('some/other-model');
  });
});
