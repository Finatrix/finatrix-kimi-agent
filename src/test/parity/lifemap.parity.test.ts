import { describe, it, expect } from 'vitest';
import toolsHtml from './__fixtures__/original-tools-app.html?raw';
import { extractFnSource, extractConstSource, evalOriginalConst } from './harness';
import {
  LM_GOALS, LM_CAREER_BOOST, LM_MILESTONES, LM_CATS, LM_HEALTH_CATS,
  buildDecisions, calcWealth, calcScore, calcHealth, type LifeProfile,
} from '../../tools/lib/lifemap';
import { cfmtSh } from '../../tools/lib/format';

const sh = (n: number) => cfmtSh(n, 'INR');

describe('lifemap parity — data tables', () => {
  it('LM_* constants match the source', () => {
    expect(LM_GOALS).toEqual(evalOriginalConst(toolsHtml, 'LM_GOALS'));
    expect(LM_CAREER_BOOST).toEqual(evalOriginalConst(toolsHtml, 'LM_CAREER_BOOST'));
    expect(LM_MILESTONES).toEqual(evalOriginalConst(toolsHtml, 'LM_MILESTONES'));
    expect(LM_CATS).toEqual(evalOriginalConst(toolsHtml, 'LM_CATS'));
    expect(LM_HEALTH_CATS).toEqual(evalOriginalConst(toolsHtml, 'LM_HEALTH_CATS'));
  });
});

interface OracleOut {
  dec: { id: string; cat: string; smart: number; bad: number; minAge: number; custom: boolean; ck: string | null; ca: number | null }[];
  score: number;
  health: { savings: number; investment: number; debt: number; protection: number; growth: number };
  wealth: Record<number, { smart: number; imp: number }>;
}

const runner = new Function(
  'P',
  `
  ${extractConstSource(toolsHtml, 'CURRENCIES')}
  let FXC='INR';
  ${extractFnSource(toolsHtml, 'fmt')}
  ${extractFnSource(toolsHtml, 'cfmtSh')}
  ${extractConstSource(toolsHtml, 'LM_CAREER_BOOST')}
  function lmFmtSh(n){ return cfmtSh(n); }
  let lmP = P.p;
  let lmDec = [];
  let lmApplied = new Set(P.applied);
  ${extractFnSource(toolsHtml, 'lmBuildDecisions')}
  ${extractFnSource(toolsHtml, 'lmCalcWealth')}
  ${extractFnSource(toolsHtml, 'lmCalcScore')}
  ${extractFnSource(toolsHtml, 'lmCalcHealth')}
  lmBuildDecisions();
  const wealth = {};
  P.ages.forEach((age) => { wealth[age] = { smart: lmCalcWealth(age, true), imp: lmCalcWealth(age, false) }; });
  return {
    dec: lmDec.map((d) => ({ id: d.id, cat: d.cat, smart: d.smart, bad: d.bad, minAge: d.minAge, custom: !!d.custom, ck: d.ck || null, ca: d.ca != null ? d.ca : null })),
    score: lmCalcScore(),
    health: lmCalcHealth(),
    wealth,
  };
`
) as (p: { p: LifeProfile; applied: string[]; ages: number[] }) => OracleOut;

const PROFILES: LifeProfile[] = [
  { name: 'A', age: 22, income: 35000, expenses: 22000, savings: 150000, emergency: 60000, invest: 50000, sip: 0, debtTotal: 0, debtEmi: 0, career: 'tech', goals: ['home'] },
  { name: 'B', age: 30, income: 120000, expenses: 60000, savings: 800000, emergency: 300000, invest: 500000, sip: 15000, debtTotal: 2000000, debtEmi: 40000, career: 'finance', goals: ['retire'] },
  { name: 'C', age: 26, income: 50000, expenses: 45000, savings: 20000, emergency: 5000, invest: 0, sip: 2000, debtTotal: 300000, debtEmi: 8000, career: 'govt', goals: [] },
  { name: 'D', age: 40, income: 200000, expenses: 90000, savings: 5000000, emergency: 600000, invest: 8000000, sip: 50000, debtTotal: 0, debtEmi: 0, career: 'startup', goals: ['luxury'] },
];
const APPLIED_SETS: string[][] = [
  [],
  ['start_sip', 'insurance', 'upskill', 'build_buffer'],
  ['boost_sip', 'stepup_10', 'buy_home', 'paydebt', 'ccwise'],
  ['fno', 'ccdebt', 'buy_car_loan', 'lifestyle_creep', 'noinsure'],
  ['diversify', 'nps', 'elss', 'sidehustle', 'switchjob', 'negotiate', 'passive'],
];

describe('lifemap parity — decisions engine + wealth/score/health', () => {
  for (let pi = 0; pi < PROFILES.length; pi++) {
    for (let ai = 0; ai < APPLIED_SETS.length; ai++) {
      const p = PROFILES[pi];
      const applied = new Set(APPLIED_SETS[ai]);
      const ages = [p.age - 1, p.age, 27, 30, 40, 55, 60];
      it(`profile#${pi} applied#${ai}`, () => {
        const myDec = buildDecisions(p, sh);
        const oracle = runner({ p, applied: APPLIED_SETS[ai], ages });

        // Decisions: numeric fields must match exactly (id/cat/smart/bad/minAge/custom/ck/ca).
        expect(myDec.map((d) => ({ id: d.id, cat: d.cat, smart: d.smart, bad: d.bad, minAge: d.minAge, custom: d.custom, ck: d.ck ?? null, ca: d.ca ?? null }))).toEqual(oracle.dec);

        expect(calcScore(p, applied)).toBe(oracle.score);
        expect(calcHealth(p, applied)).toEqual(oracle.health);

        for (const age of ages) {
          expect(calcWealth(p, myDec, applied, age, true)).toBeCloseTo(oracle.wealth[age].smart, 4);
          expect(calcWealth(p, myDec, applied, age, false)).toBeCloseTo(oracle.wealth[age].imp, 4);
        }
      });
    }
  }
});
