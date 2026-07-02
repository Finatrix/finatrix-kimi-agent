import { describe, it, expect, beforeAll } from 'vitest';
import toolsHtml from './__fixtures__/original-tools-app.html?raw';
import { extractFnSource, extractConstSource, evalOriginalConst, compileScope } from './harness';
import {
  PS_OPTS, PS_M, PS_DL, psTax, computeParkSmart, type ParkOption,
} from '../../tools/lib/parksmart';
import { fmt } from '../../tools/lib/format';

beforeAll(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
});

describe('parksmart parity — data tables', () => {
  it('PS_OPTS / PS_M / PS_DL match the source', () => {
    expect(PS_OPTS).toEqual(evalOriginalConst(toolsHtml, 'PS_OPTS'));
    expect(PS_M).toEqual(evalOriginalConst(toolsHtml, 'PS_M'));
    expect(PS_DL).toEqual(evalOriginalConst(toolsHtml, 'PS_DL'));
  });
});

describe('parksmart parity — psTax across the grid', () => {
  const original = compileScope<(opt: ParkOption, gross: number, months: number, slab: number, amt: number) => number>(
    [extractFnSource(toolsHtml, 'psTax')],
    'psTax'
  );
  it('matches original psTax for equity/slab80tta/slab', () => {
    const opts = PS_OPTS;
    for (const opt of opts) {
      for (const gross of [0, 1000, 12500, 130000, 260000]) {
        for (const months of [0.5, 2, 4.5, 9, 15]) {
          for (const slab of [0, 0.2, 0.3]) {
            expect(psTax(opt, gross, months, slab, 100000)).toBe(original(opt, gross, months, slab, 100000));
          }
        }
      }
    }
  });
});

const TEMPLATE = `<input id="ps-amount"><input id="ps-duration"><input id="ps-slab"><div id="ps-input"></div><div id="ps-result" class="hidden"></div>`;

const runner = new Function(
  'P',
  `
  ${extractConstSource(toolsHtml, 'PS_OPTS')}
  ${extractConstSource(toolsHtml, 'PS_M')}
  ${extractConstSource(toolsHtml, 'PS_DL')}
  ${extractFnSource(toolsHtml, 'fmt')}
  ${extractFnSource(toolsHtml, 'num')}
  ${extractFnSource(toolsHtml, 'psTax')}
  function fxNotify(){}
  document.getElementById('ps-amount').value = String(P.amt);
  document.getElementById('ps-duration').value = P.dur;
  document.getElementById('ps-slab').value = String(P.slab);
  ${extractFnSource(toolsHtml, 'psCalc')}
  psCalc();
  const res = document.getElementById('ps-result');
  const cards = Array.from(res.querySelectorAll('.result-card-anim'));
  const heroGrid = res.querySelector('.result-hero-anim .grid3');
  return {
    hidden: res.classList.contains('hidden'),
    names: cards.map((c) => c.querySelector('span[style*="flex:1"]').textContent),
    nets: cards.map((c) => c.querySelector('span[style*="var(--green)"]').textContent),
    effRates: cards.map((c) => (c.textContent.match(/Post-tax ([\\d.]+)%/) || [])[1]),
    heroNet: heroGrid ? heroGrid.children[0].firstElementChild.textContent : null,
    heroEff: heroGrid ? heroGrid.children[1].firstElementChild.textContent : null,
    hasSplit: res.textContent.includes('Smart split idea'),
  };
`
) as (p: { amt: number; dur: string; slab: number }) => {
  hidden: boolean; names: string[]; nets: string[]; effRates: (string | undefined)[];
  heroNet: string | null; heroEff: string | null; hasSplit: boolean;
};

function runOriginal(amt: number, dur: string, slab: number) {
  document.body.innerHTML = TEMPLATE;
  document.getElementById('ps-result')!.classList.add('hidden');
  return runner({ amt, dur, slab });
}

const AMOUNTS = [5000, 50000, 100000, 500000, 2500000];
const DURS = ['0-1', '1-3', '3-6', '6-12', '12+'];
const SLABS = [0, 20, 30];

describe('parksmart parity — psCalc ranking', () => {
  for (const amt of AMOUNTS) {
    for (const dur of DURS) {
      for (const slabPct of SLABS) {
        it(`amt=${amt} dur=${dur} slab=${slabPct}%`, () => {
          const r = computeParkSmart(amt, dur, slabPct / 100);
          const dom = runOriginal(amt, dur, slabPct);
          expect(dom.hidden).toBe(false);
          expect(dom.names).toEqual(r.ranked.map((o) => o.n));
          expect(dom.nets).toEqual(r.ranked.map((o) => fmt(o.net)));
          expect(dom.effRates).toEqual(r.ranked.map((o) => o.effRate.toFixed(2)));
          expect(dom.heroNet).toBe(fmt(r.best!.net));
          expect(dom.heroEff).toBe(r.best!.effRate.toFixed(2) + '%');
          expect(dom.hasSplit).toBe(r.split !== null);
        });
      }
    }
  }

  it('rejects amounts under ₹1,000', () => {
    const dom = runOriginal(500, '3-6', 20);
    expect(dom.hidden).toBe(true);
    expect(computeParkSmart(500, '3-6', 0.2).valid).toBe(false);
  });
});
