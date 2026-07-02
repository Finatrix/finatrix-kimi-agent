import { describe, it, expect, beforeAll } from 'vitest';
import toolsHtml from './__fixtures__/original-tools-app.html?raw';
import { extractFnSource, extractConstSource, evalOriginalConst, compileScope } from './harness';
import {
  PC_CITIES, PC_BENCH, pcBracket, pcPct, computePeerCompare, type PeerInput,
} from '../../tools/lib/peercompare';
import { fmt } from '../../tools/lib/format';

beforeAll(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
});

describe('peercompare parity — data + pure fns', () => {
  it('PC_CITIES / PC_BENCH match the source', () => {
    expect(PC_CITIES).toEqual(evalOriginalConst(toolsHtml, 'PC_CITIES'));
    expect(PC_BENCH).toEqual(evalOriginalConst(toolsHtml, 'PC_BENCH'));
  });
  it('pcBracket + pcPct match across grids', () => {
    const oBr = compileScope<(a: number) => string>([extractFnSource(toolsHtml, 'pcBracket')], 'pcBracket');
    for (let age = 16; age <= 75; age++) expect(pcBracket(age)).toBe(oBr(age));
    const oPct = compileScope<(r: number) => number>([extractFnSource(toolsHtml, 'pcPct')], 'pcPct');
    for (const ratio of [-1, 0, 0.1, 0.5, 0.8, 1, 1.25, 2, 3.7, 10, 100, NaN, Infinity]) {
      expect(pcPct(ratio)).toBe(oPct(ratio));
    }
  });
});

const IDS = ['pc-age', 'pc-city', 'pc-income', 'pc-savings', 'pc-invest', 'pc-debt', 'pc-rate', 'pc-expenses'];
const TEMPLATE = IDS.map((id) => `<input id="${id}">`).join('') + `<div id="pc-input"></div><div id="pc-result" class="hidden"></div>`;

const runner = new Function(
  'P',
  `
  ${extractConstSource(toolsHtml, 'PC_CITIES')}
  ${extractConstSource(toolsHtml, 'PC_BENCH')}
  ${extractFnSource(toolsHtml, 'fmt')}
  ${extractFnSource(toolsHtml, 'num')}
  ${extractFnSource(toolsHtml, 'pcBracket')}
  ${extractFnSource(toolsHtml, 'pcPct')}
  document.getElementById('pc-age').value = String(P.age);
  document.getElementById('pc-city').value = P.cityKey;
  document.getElementById('pc-income').value = String(P.income);
  document.getElementById('pc-savings').value = String(P.savings);
  document.getElementById('pc-invest').value = String(P.invest);
  document.getElementById('pc-debt').value = String(P.debt);
  document.getElementById('pc-rate').value = String(P.rate);
  document.getElementById('pc-expenses').value = String(P.expenses);
  ${extractFnSource(toolsHtml, 'pcCompare')}
  pcCompare();
  const res = document.getElementById('pc-result');
  const scoreEl = res.querySelector('[style*="42px"]');
  const metricCards = Array.from(res.querySelectorAll('.card')).filter((c) => /\\d+th percentile ·/.test(c.textContent));
  const metricPcts = metricCards.map((c) => {
    const m = c.textContent.match(/(\\d+)th percentile · (Ahead|On track|Behind)/);
    return { pct: Number(m[1]), label: m[2] };
  });
  const statsCard = Array.from(res.querySelectorAll('.card')).find((c) => /Additional stats/.test(c.textContent));
  const stats = statsCard ? Array.from(statsCard.querySelector('.grid2').children).map((d) => d.firstElementChild.textContent) : [];
  const tips = Array.from(res.querySelectorAll('.tip')).map((t) => ({
    warn: t.className.includes('tip-warn'),
    title: t.querySelector('b') ? t.querySelector('b').textContent : '',
  }));
  return { score: scoreEl ? scoreEl.textContent : null, metricPcts, stats, tips };
`
) as (p: PeerInput) => {
  score: string | null;
  metricPcts: { pct: number; label: string }[];
  stats: string[];
  tips: { warn: boolean; title: string }[];
};

const LABEL = { ahead: 'Ahead', ontrack: 'On track', behind: 'Behind' } as const;

const PROFILES: Omit<PeerInput, 'age' | 'cityKey'>[] = [
  { income: 50000, savings: 200000, invest: 100000, debt: 0, rate: 20, expenses: 30000 },
  { income: 300000, savings: 5000000, invest: 8000000, debt: 0, rate: 40, expenses: 80000 },
  { income: 15000, savings: 5000, invest: 0, debt: 500000, rate: 5, expenses: 20000 },
  { income: 0, savings: 0, invest: 0, debt: 0, rate: 0, expenses: 0 },
  { income: 55000.5, savings: 123456.75, invest: 98765.25, debt: 12000.5, rate: 22.5, expenses: 31000.75 },
];

describe('peercompare parity — pcCompare rendered figures', () => {
  for (const age of [22, 27, 34, 50]) {
    for (const cityKey of ['mumbai', 'tier3']) {
      for (let p = 0; p < PROFILES.length; p++) {
        const input: PeerInput = { age, cityKey, ...PROFILES[p] };
        it(`age=${age} city=${cityKey} profile#${p}`, () => {
          const r = computePeerCompare(input);
          const dom = runOriginal(input);
          expect(dom.score).toBe(String(r.score));
          expect(dom.metricPcts).toEqual(r.metrics.map((m) => ({ pct: m.pct, label: LABEL[m.status] })));
          expect(dom.stats).toEqual([
            r.eMonths >= 99 ? '∞' : String(r.eMonths),
            `${r.dti}%`,
            fmt(r.nw),
            `${r.investedRatio}%`,
          ]);
          expect(dom.tips).toEqual(r.tips.map((t) => ({ warn: t[0] === 'warn', title: t[1] })));
        });
      }
    }
  }
});

function runOriginal(input: PeerInput) {
  document.body.innerHTML = TEMPLATE;
  document.getElementById('pc-result')!.classList.add('hidden');
  return runner(input);
}
