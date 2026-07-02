import { describe, it, expect, beforeAll } from 'vitest';
import toolsHtml from './__fixtures__/original-tools-app.html?raw';
import { extractFnSource, extractConstSource, evalOriginalConst } from './harness';
import {
  IM_ALLOC, IM_RATE, IM_HY, IM_RL, IM_Q, computeInvestMatch, type ImAnswers,
} from '../../tools/lib/investmatch';
import { fmt } from '../../tools/lib/format';

beforeAll(() => {
  // jsdom doesn't implement scrollTo; imBuild calls it.
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
});

describe('investmatch parity — data tables', () => {
  it('IM_ALLOC / IM_RATE / IM_HY / IM_RL / IM_Q match the source', () => {
    expect(IM_ALLOC).toEqual(evalOriginalConst(toolsHtml, 'IM_ALLOC'));
    expect(IM_RATE).toEqual(evalOriginalConst(toolsHtml, 'IM_RATE'));
    expect(IM_HY).toEqual(evalOriginalConst(toolsHtml, 'IM_HY'));
    expect(IM_RL).toEqual(evalOriginalConst(toolsHtml, 'IM_RL'));
    expect(IM_Q).toEqual(evalOriginalConst(toolsHtml, 'IM_Q'));
  });
});

const TEMPLATE = `<div id="im-quiz"></div><div id="im-result" class="hidden"></div>`;

const runner = new Function(
  'P',
  `
  ${extractConstSource(toolsHtml, 'IM_ALLOC')}
  ${extractConstSource(toolsHtml, 'IM_RATE')}
  ${extractConstSource(toolsHtml, 'IM_HY')}
  ${extractConstSource(toolsHtml, 'IM_RL')}
  ${extractFnSource(toolsHtml, 'fmt')}
  function imSaveNum(){}
  function fxNotify(){}
  let imAns = P.ans;
  ${extractFnSource(toolsHtml, 'imBuild')}
  imBuild();
  const res = document.getElementById('im-result');
  const q = (sel) => res.querySelector(sel);
  const gridVals = Array.from(res.querySelectorAll('.grid3'))[0];
  return {
    empty: res.classList.contains('hidden'),
    fv: q('.big-num') ? q('.big-num').textContent : null,
    heroLabel: q('.result-hero-anim > div') ? q('.result-hero-anim > div').textContent : null,
    heroNote: q('.result-hero-anim .note') ? q('.result-hero-anim .note').textContent : null,
    grid: gridVals ? Array.from(gridVals.children).map((c) => c.firstElementChild.textContent) : [],
    insights: Array.from(res.querySelectorAll('.tip.tip-info')).map((e) => e.textContent),
    allocPcts: Array.from(res.querySelectorAll('.row-line')).map((row) => row.children[2] ? row.children[2].textContent : ''),
    allocAmts: Array.from(res.querySelectorAll('.row-line')).map((row) => row.children[3] ? row.children[3].textContent : ''),
  };
`
) as (p: { ans: ImAnswers }) => {
  empty: boolean; fv: string | null; heroLabel: string | null; heroNote: string | null;
  grid: (string | null)[]; insights: string[]; allocPcts: string[]; allocAmts: string[];
};

function runOriginal(ans: ImAnswers) {
  document.body.innerHTML = TEMPLATE;
  document.getElementById('im-result')!.classList.add('hidden');
  return runner({ ans });
}

const squish = (s: string) => (s || '').replace(/\s+/g, '');

const CASES: Array<{ name: string; ans: ImAnswers }> = [
  { name: 'moderate / 5-10 / wealth', ans: { age: 25, income: 50000, monthly: 10000, risk: 'moderate', horizon: '5-10', goal: 'wealth' } },
  { name: 'aggressive / 10+ / retirement', ans: { age: 30, income: 120000, monthly: 25000, risk: 'aggressive', horizon: '10+', goal: 'retirement' } },
  { name: 'aggressive / 1-3 → downgraded conservative', ans: { age: 40, income: 80000, monthly: 5000, risk: 'aggressive', horizon: '1-3', goal: 'house' } },
  { name: 'aggressive / 3-5 → downgraded moderate', ans: { age: 26, income: 60000, monthly: 4000, risk: 'aggressive', horizon: '3-5', goal: 'tax' } },
  { name: 'young + conservative insight', ans: { age: 22, income: 40000, monthly: 3000, risk: 'conservative', horizon: '5-10', goal: 'emergency' } },
  { name: 'low % of income insight', ans: { age: 35, income: 200000, monthly: 5000, risk: 'moderate', horizon: '3-5', goal: 'wealth' } },
  { name: 'decimals', ans: { age: 29, income: 75000.5, monthly: 12345.75, risk: 'moderate', horizon: '5-10', goal: 'wealth' } },
];

describe('investmatch parity — imBuild rendered figures', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const r = computeInvestMatch(c.ans);
      const dom = runOriginal(c.ans);

      expect(dom.fv).toBe(fmt(r.fv));
      expect(squish(dom.heroLabel || '')).toBe(squish(`Your ${IM_RL[r.effRisk]} portfolio could grow to`));
      expect(squish(dom.heroNote || '')).toBe(
        squish(`in ${r.years} years at ~${Math.round(r.rate * 100)}% p.a. · worth ${fmt(r.realFv)} in today's money`)
      );
      expect(dom.grid).toEqual([fmt(r.invested), fmt(r.gains), `${r.growthPct}%`]);
      expect(dom.insights.map(squish)).toEqual(r.insights.map(squish));
      expect(dom.allocPcts).toEqual(r.alloc.map((a) => `${a.p}%`));
      expect(dom.allocAmts).toEqual(r.alloc.map((a) => `${fmt((c.ans.monthly * a.p) / 100)}/mo`));
    });
  }

  it('rejects a monthly investment under ₹100 (no result, matches tooLow)', () => {
    const ans: ImAnswers = { age: 25, income: 50000, monthly: 50, risk: 'moderate', horizon: '5-10', goal: 'wealth' };
    const dom = runOriginal(ans);
    expect(dom.empty).toBe(true); // original returns before rendering
    expect(computeInvestMatch(ans).tooLow).toBe(true);
  });
});
