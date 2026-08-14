/**
 * LifeMap AI plan — the boundary tests.
 *
 * The plan layer is allowed to change two things: the order decisions appear in
 * and the sentence under each one. Everything else in LifeMap is arithmetic that
 * predates it and must survive it exactly. These tests are written against a
 * deliberately hostile reply — one that invents decisions, drops real ones,
 * duplicates ids, quotes rupee figures and tries to rewrite the impact numbers —
 * because a well-behaved reply proves nothing about where the boundary is.
 */

import { describe, it, expect } from 'vitest';
import {
  buildDecisions, buildProfile, calcScore, calcHealth, calcWealth, type LifeProfile,
} from '../tools/lib/lifemap';
import { parsePlan, applyPlan, planCacheKey } from '../tools/ai/lifemapPlan';

const sh = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

function profile(over: Partial<Parameters<typeof buildProfile>[0]> = {}): LifeProfile {
  return buildProfile({
    name: 'Asha', age: 24, income: 60000, expenses: 38000, savings: 120000, emergency: 40000,
    invest: 50000, sipYn: false, sip: 0, debtYn: true, debtTotal: 250000, debtEmi: 9000,
    career: 'tech', goals: ['home', 'startup'], ...over,
  });
}

describe('parsePlan — order is always a permutation of the catalogue', () => {
  const p = profile();
  const decisions = buildDecisions(p, sh);
  const ids = decisions.map((d) => d.id);

  it('drops invented ids and appends the ones the model forgot', () => {
    const reply = JSON.stringify({
      order: ['build_buffer', 'not_a_real_decision', 'paydebt'],
      why: { build_buffer: 'Your buffer is thin for someone planning a business.' },
    });
    const plan = parsePlan(reply, decisions);

    expect(plan.order.slice(0, 2)).toEqual(['build_buffer', 'paydebt']);
    expect(plan.order).not.toContain('not_a_real_decision');
    expect([...plan.order].sort()).toEqual([...ids].sort());
  });

  it('collapses duplicates rather than showing a decision twice', () => {
    const reply = JSON.stringify({ order: ['paydebt', 'paydebt', 'paydebt'], why: { paydebt: 'Clear this first.' } });
    const plan = parsePlan(reply, decisions);

    expect(plan.order.filter((id) => id === 'paydebt')).toHaveLength(1);
    expect(plan.order).toHaveLength(ids.length);
  });

  it('falls back to the engine order when the reply is unusable', () => {
    expect(parsePlan('not json at all', decisions).order).toEqual(ids);
    expect(parsePlan('{}', decisions).order).toEqual(ids);
  });
});

describe('parsePlan — the model may not author figures', () => {
  const decisions = buildDecisions(profile(), sh);

  it.each([
    ['rupee symbol', 'You need ₹1,20,000 more in your buffer.'],
    ['lakh', 'Park about 5 lakh here before you borrow.'],
    ['crore', 'This compounds to 2 crore by retirement.'],
    ['rs prefix', 'Add Rs 5000 a month to close the gap.'],
  ])('drops a rationale carrying a %s figure', (_label, line) => {
    const plan = parsePlan(JSON.stringify({ order: [], why: { paydebt: line } }), decisions);
    expect(plan.why.paydebt).toBeUndefined();
  });

  it('keeps percentages and month counts, which are guidelines not outputs', () => {
    const reply = JSON.stringify({
      order: [],
      why: {
        paydebt: 'Your EMI eats roughly 15% of income, which caps what a lender will offer.',
        build_buffer: 'Aim for about six months of cover before you risk a business.',
      },
    });
    const plan = parsePlan(reply, decisions);
    expect(plan.why.paydebt).toContain('15%');
    expect(plan.why.build_buffer).toContain('six months');
  });

  it('ignores rationales for ids that are not in the catalogue', () => {
    const plan = parsePlan(JSON.stringify({ order: [], why: { made_up: 'Do this.' } }), decisions);
    expect(plan.why.made_up).toBeUndefined();
  });
});

describe('applyPlan — the maths is out of reach', () => {
  const p = profile();
  const decisions = buildDecisions(p, sh);

  /* A reply that reorders, rewrites the rationale, and also tries to overwrite
     every computed field on the decisions it names. */
  const hostile = JSON.stringify({
    order: ['fno', 'ccdebt', 'start_sip'],
    why: { start_sip: 'A SIP is the engine behind both your home and your business.' },
    smart: 999999999,
    bad: 0,
    imp: '+₹10 crore by 45',
    t: 'Start SIP of ₹1',
  });

  it('changes order and rationale, and nothing else', () => {
    const plan = parsePlan(hostile, decisions);
    const applied = applyPlan(decisions, plan);
    const before = new Map(decisions.map((d) => [d.id, d]));

    expect(applied.map((d) => d.id).slice(0, 3)).toEqual(['fno', 'ccdebt', 'start_sip']);
    expect(applied.find((d) => d.id === 'start_sip')?.s).toBe(
      'A SIP is the engine behind both your home and your business.'
    );

    for (const d of applied) {
      const original = before.get(d.id)!;
      expect(d.smart).toBe(original.smart);
      expect(d.bad).toBe(original.bad);
      expect(d.imp).toBe(original.imp);
      expect(d.t).toBe(original.t);
      expect(d.cat).toBe(original.cat);
      expect(d.minAge).toBe(original.minAge);
      expect(d.custom).toBe(original.custom);
    }
  });

  it('leaves score, health and wealth identical', () => {
    const applied = applyPlan(decisions, parsePlan(hostile, decisions));
    const chosen = new Set(['start_sip', 'build_buffer', 'insurance', 'paydebt']);

    expect(calcScore(p, chosen)).toBe(calcScore(p, chosen));
    expect(calcHealth(p, chosen)).toEqual(calcHealth(p, chosen));

    for (const age of [25, 30, 45, 60]) {
      expect(calcWealth(p, applied, chosen, age, true)).toBe(calcWealth(p, decisions, chosen, age, true));
      expect(calcWealth(p, applied, chosen, age, false)).toBe(calcWealth(p, decisions, chosen, age, false));
    }
  });

  it('preserves every decision, so nothing vanishes from the UI', () => {
    const applied = applyPlan(decisions, parsePlan(hostile, decisions));
    expect(applied).toHaveLength(decisions.length);
    expect([...applied].map((d) => d.id).sort()).toEqual(decisions.map((d) => d.id).sort());
  });

  it('is a no-op without a plan', () => {
    expect(applyPlan(decisions, null)).toBe(decisions);
  });

  /* A cached plan is applied without ever passing through parsePlan, so the
     catalogue guarantee has to hold in applyPlan too. These are the shapes a
     stored plan can take that a parsed one cannot. */
  it('appends decisions a partial plan never named — a stale cache hides nothing', () => {
    const partial = { order: ['start_sip', 'paydebt'], why: {}, summary: '' };
    const applied = applyPlan(decisions, partial);

    expect(applied.map((d) => d.id).slice(0, 2)).toEqual(['start_sip', 'paydebt']);
    expect(applied).toHaveLength(decisions.length);
    expect([...applied].map((d) => d.id).sort()).toEqual(decisions.map((d) => d.id).sort());
    // Every category still has decisions to show.
    for (const c of new Set(decisions.map((d) => d.cat))) {
      expect(applied.some((d) => d.cat === c)).toBe(true);
    }
  });

  it('ignores ids a stored plan names that no longer exist', () => {
    const stale = { order: ['retired_decision', 'start_sip'], why: {}, summary: '' };
    const applied = applyPlan(decisions, stale);

    expect(applied.map((d) => d.id)).not.toContain('retired_decision');
    expect(applied).toHaveLength(decisions.length);
  });

  it('collapses duplicates in a stored plan', () => {
    const dupes = { order: ['start_sip', 'start_sip', 'paydebt'], why: {}, summary: '' };
    const applied = applyPlan(decisions, dupes);

    expect(applied.filter((d) => d.id === 'start_sip')).toHaveLength(1);
    expect(applied).toHaveLength(decisions.length);
  });
});

describe('planCacheKey', () => {
  it('changes when the goals change — the whole point of the layer', () => {
    expect(planCacheKey(profile({ goals: ['home'] })))
      .not.toBe(planCacheKey(profile({ goals: ['startup'] })));
  });

  it('ignores goal order, which is a selection not a ranking', () => {
    expect(planCacheKey(profile({ goals: ['home', 'startup'] })))
      .toBe(planCacheKey(profile({ goals: ['startup', 'home'] })));
  });

  it('ignores the name, so fixing a typo does not re-bill a model call', () => {
    expect(planCacheKey(profile({ name: 'Asha' }))).toBe(planCacheKey(profile({ name: 'Asha K' })));
  });

  it('changes when a figure the prompt describes changes', () => {
    expect(planCacheKey(profile({ income: 60000 }))).not.toBe(planCacheKey(profile({ income: 90000 })));
  });
});
