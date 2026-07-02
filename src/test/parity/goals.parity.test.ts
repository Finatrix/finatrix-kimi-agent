import { describe, it, expect, beforeAll } from 'vitest';
import toolsHtml from './__fixtures__/original-tools-app.html?raw';
import { extractFnSource, extractConstSource, evalOriginalConst, compileScope } from './harness';
import {
  GP_PATHS, GP_PRESETS, gpSip, gpStepUp, computeGoalPlanner, type GoalInput,
} from '../../tools/lib/goals';
import { fmt } from '../../tools/lib/format';

beforeAll(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
});

describe('goals parity — data + pure fns', () => {
  it('GP_PATHS / GP_PRESETS match the source', () => {
    expect(GP_PATHS).toEqual(evalOriginalConst(toolsHtml, 'GP_PATHS'));
    expect(GP_PRESETS).toEqual(evalOriginalConst(toolsHtml, 'GP_PRESETS'));
  });
  it('gpSip + gpStepUp match across grids', () => {
    const oSip = compileScope<(t: number, r: number, n: number) => number>([extractFnSource(toolsHtml, 'gpSip')], 'gpSip');
    const oStep = compileScope<(t: number, a: number, y: number) => number>([extractFnSource(toolsHtml, 'gpStepUp')], 'gpStepUp');
    for (const target of [0, 1000, 500000, 5000000, 30000000]) {
      for (const rate of [0.08, 0.12, 0.14]) {
        for (const years of [1, 3, 10, 25, 40]) {
          expect(gpSip(target, rate / 12, years * 12)).toBe(oSip(target, rate / 12, years * 12));
          expect(gpStepUp(target, rate, years)).toBe(oStep(target, rate, years));
        }
      }
    }
  });
});

const TEMPLATE = `<input id="gp-name"><input id="gp-target"><input id="gp-years"><input id="gp-existing"><input type="checkbox" id="gp-inflate"><div id="gp-input"></div><div id="gp-result" class="hidden"></div>`;

const runner = new Function(
  'P',
  `
  ${extractConstSource(toolsHtml, 'GP_PATHS')}
  ${extractFnSource(toolsHtml, 'fmt')}
  ${extractFnSource(toolsHtml, 'esc')}
  ${extractFnSource(toolsHtml, 'num')}
  ${extractFnSource(toolsHtml, 'gpSip')}
  ${extractFnSource(toolsHtml, 'gpStepUp')}
  function fxNotify(){}
  document.getElementById('gp-name').value = P.name;
  document.getElementById('gp-target').value = String(P.targetToday);
  document.getElementById('gp-years').value = String(P.years);
  document.getElementById('gp-existing').value = String(P.existing);
  document.getElementById('gp-inflate').checked = !!P.inflate;
  ${extractFnSource(toolsHtml, 'gpCalc')}
  gpCalc();
  const res = document.getElementById('gp-result');
  const cards = Array.from(res.querySelectorAll('.result-card-anim'));
  const perPath = cards.map((c) => {
    const tds = Array.from(c.querySelectorAll('table.cmp td')).map((td) => td.textContent);
    const invSpan = Array.from(c.querySelectorAll('span')).find((s) => /Your money/.test(s.textContent));
    return {
      monthly: c.querySelector('[style*="30px"]').textContent,
      stepStart: c.querySelector('[style*="18px"]').textContent,
      invested: tds[1], totalValue: tds[3], gains: tds[5], daily: tds[7],
      investPct: invSpan ? invSpan.textContent : null,
    };
  });
  return { hidden: res.classList.contains('hidden'), perPath };
`
) as (p: GoalInput) => {
  hidden: boolean;
  perPath: { monthly: string; stepStart: string; invested: string; totalValue: string; gains: string; daily: string; investPct: string | null }[];
};

function runOriginal(input: GoalInput) {
  document.body.innerHTML = TEMPLATE;
  document.getElementById('gp-result')!.classList.add('hidden');
  return runner(input);
}

const squish = (s: string) => (s || '').replace(/\s+/g, '');

describe('goals parity — gpCalc rendered figures', () => {
  for (const targetToday of [1000000, 5000000, 30000000]) {
    for (const years of [3, 10, 25]) {
      for (const existing of [0, 500000]) {
        for (const inflate of [true, false]) {
          const input: GoalInput = { name: 'Test', targetToday, years, existing, inflate };
          it(`target=${targetToday} years=${years} existing=${existing} inflate=${inflate}`, () => {
            const r = computeGoalPlanner(input);
            const dom = runOriginal(input);
            expect(dom.hidden).toBe(false);
            expect(dom.perPath.length).toBe(r.results.length);
            r.results.forEach((p, i) => {
              const d = dom.perPath[i];
              expect(d.monthly).toBe(fmt(p.monthly));
              expect(squish(d.stepStart)).toBe(squish(`${fmt(p.stepStart)} to start`));
              expect(d.invested).toBe(fmt(p.invested));
              expect(d.totalValue).toBe(fmt(p.totalValue));
              expect(d.gains).toBe(fmt(p.gains));
              expect(d.daily).toBe(`${fmt(Math.round(p.monthly / 30))}/day`);
              expect(squish(d.investPct || '')).toBe(squish(`Your money ${p.investPct}%`));
            });
          });
        }
      }
    }
  }

  it('rejects a target under ₹1,000', () => {
    const dom = runOriginal({ name: '', targetToday: 500, years: 10, existing: 0, inflate: true });
    expect(dom.hidden).toBe(true);
    expect(computeGoalPlanner({ name: '', targetToday: 500, years: 10, existing: 0, inflate: true }).valid).toBe(false);
  });
});
