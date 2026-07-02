import { describe, it, expect } from 'vitest';
import toolsHtml from './__fixtures__/original-tools-app.html?raw';
import { extractFnSource } from './harness';
import {
  BB_NEEDS, BB_WANTS, BB_SAVE, computeBudget, type BudgetVals, type BudgetInput,
} from '../../tools/lib/budget';
import { fmt } from '../../tools/lib/format';

/* ── 1. Categories are the exact V4 set (categorisation intentionally changed) ── */
describe('budget — V4 category set', () => {
  it('matches the exact V4 categories', () => {
    expect(BB_NEEDS.map((c) => c.l)).toEqual([
      'Rent', 'Groceries', 'Utilities / Bills', 'Transport', 'Insurance', 'Medical', 'Phone', 'Internet', 'Other Needs',
    ]);
    expect(BB_WANTS.map((c) => c.l)).toEqual([
      'Eating Out', 'Going Out', 'Shopping', 'Subscriptions', 'Entertainment', 'Personal Care', 'Travel / Holidays', 'Gifts', 'Other Wants',
    ]);
    expect(BB_SAVE.map((c) => c.l)).toEqual([
      'Emergency Fund', 'Investment for Loan', 'Stocks / Equity', 'Gold / SGBs', 'Self Investment', 'Transfers', 'Home Deposit', 'Other Savings',
    ]);
  });
});

/* ── 2. The ORIGINAL bbUpdate/bbCat math is preserved. We inject the NEW
   categories into the original engine and confirm every rendered figure still
   matches computeBudget — proving ONLY categorisation changed, not the math. ── */
const TEMPLATE = `
  <input id="bb-income"><input id="bb-pct-needs"><input id="bb-pct-wants"><input id="bb-pct-save">
  <div id="bb-split-warn"></div><div id="bb-segbar"></div>
  <div id="bb-needs-label"></div><div id="bb-wants-label"></div><div id="bb-save-label"></div>
  <div id="bb-seglabels"></div>
  <div id="bb-needs-fill"></div><span id="bb-needs-used"></span><span id="bb-needs-limit"></span><span id="bb-needs-status"></span>
  <div id="bb-wants-fill"></div><span id="bb-wants-used"></span><span id="bb-wants-limit"></span><span id="bb-wants-status"></span>
  <div id="bb-save-fill"></div><span id="bb-save-used"></span><span id="bb-save-limit"></span><span id="bb-save-status"></span>
  <div id="bb-summary"></div><div id="bb-insights"></div>
`;

interface DomReadout {
  warn: string;
  segWidths: string[];
  segLabels: string;
  cats: Record<'needs' | 'wants' | 'save', { status: string; statusCls: string; used: string; limit: string; fill: string }>;
  summary: string;
  insights: string;
}

const runner = new Function(
  'P',
  `
  ${extractFnSource(toolsHtml, 'fmt')}
  function cfmt(n){ return fmt(n); }
  ${extractFnSource(toolsHtml, 'num')}
  const BB_NEEDS = ${JSON.stringify(BB_NEEDS)};
  const BB_WANTS = ${JSON.stringify(BB_WANTS)};
  const BB_SAVE = ${JSON.stringify(BB_SAVE)};
  ${extractFnSource(toolsHtml, 'bbCat')}
  function bbSave(){}
  const bbVals = P.vals;
  document.getElementById('bb-income').value = String(P.income);
  document.getElementById('bb-pct-needs').value = String(P.needs);
  document.getElementById('bb-pct-wants').value = String(P.wants);
  document.getElementById('bb-pct-save').value = String(P.save);
  ${extractFnSource(toolsHtml, 'bbUpdate')}
  bbUpdate();
  const g = (id) => document.getElementById(id);
  const cat = (n) => ({
    status: g('bb-'+n+'-status').textContent,
    statusCls: g('bb-'+n+'-status').className,
    used: g('bb-'+n+'-used').textContent,
    limit: g('bb-'+n+'-limit').textContent,
    fill: g('bb-'+n+'-fill').style.width,
  });
  return {
    warn: g('bb-split-warn').style.display,
    segWidths: Array.from(g('bb-segbar').children).map((c) => c.style.width),
    segLabels: g('bb-seglabels').textContent,
    cats: { needs: cat('needs'), wants: cat('wants'), save: cat('save') },
    summary: g('bb-summary').textContent,
    insights: g('bb-insights').textContent,
  };
`
) as (p: { income: number | string; needs: number | string; wants: number | string; save: number | string; vals: BudgetVals }) => DomReadout;

function runOriginal(input: BudgetInput): DomReadout {
  document.body.innerHTML = TEMPLATE;
  return runner({ income: input.incomeRaw, needs: input.needsRaw, wants: input.wantsRaw, save: input.saveRaw, vals: input.vals });
}

function expectedFromMine(input: BudgetInput) {
  const r = computeBudget(input);
  const catStr = (key: 'needs' | 'wants' | 'save') => {
    const res = r.cats[key];
    const status = res.state === 'empty' ? 'Not filled' : res.state === 'over' ? `Over by ${fmt(res.overBy)}` : 'Within limit';
    const statusCls = res.state === 'empty' ? 'pill pill-mute' : res.state === 'over' ? 'pill pill-bad' : 'pill pill-ok';
    return { status, statusCls, used: `${fmt(res.total)} used`, limit: `limit ${fmt(res.limit)}` };
  };
  const summary =
    `${r.pos ? 'Unallocated' : 'Over budget by'}${fmt(Math.abs(r.free))}` +
    `Allocated ${fmt(r.spent)} of ${fmt(r.income)} (${r.allocatedPct}%) · Actual savings rate: ${r.savePct}%`;
  const insights = r.tips.length ? 'Insights' + r.tips.map((t) => `${t[1]}${t[2]}`).join('') : '';
  return {
    r,
    warn: r.splitWarn ? 'block' : 'none',
    segWidths: [r.nPctV, r.wPctV, r.sPctV],
    segLabels: `Needs ${fmt(r.nL)}Wants ${fmt(r.wL)}Save ${fmt(r.sL)}`,
    cats: { needs: catStr('needs'), wants: catStr('wants'), save: catStr('save') },
    summary,
    insights,
  };
}

const INCOMES = [0, 50000, 33333, 120000, 100.5, 987654];
const PCTS: Array<[number, number, number]> = [
  [50, 30, 20], [60, 30, 10], [40, 40, 20], [33, 33, 33], [0, 0, 0], [70, 20, 20],
];
// Value sets use the NEW category keys; the last two exercise the key-specific
// tips (which reference emi/sip/efund literally in the shared compute code).
const VAL_SETS: BudgetVals[] = [
  {},
  { rent: 20000, groceries: 8000, eating_out: 5000, emergency: 10000 },
  { rent: 40000, transport: 8000, insurance: 5000 },
  { self_invest: 5000, stocks: 3000 },
  { emergency: 3000, gold: 100000, transfers: 20000 },
  { rent: 12500.5, eating_out: 999.99, home_deposit: 4000 },
  { emi: 30000, sip: 5000 },
];

describe('budget parity — bbUpdate/bbCat rendered figures (new categories)', () => {
  for (const income of INCOMES) {
    for (const [needs, wants, save] of PCTS) {
      for (const vals of VAL_SETS) {
        const input: BudgetInput = { incomeRaw: income, needsRaw: needs, wantsRaw: wants, saveRaw: save, vals };
        it(`income=${income} split=${needs}/${wants}/${save} vals=${JSON.stringify(vals)}`, () => {
          const dom = runOriginal(input);
          const mine = expectedFromMine(input);
          const squish = (s: string) => (s || '').replace(/\s+/g, '');

          expect(dom.warn).toBe(mine.warn);
          expect(dom.segWidths.map((w) => Math.round(parseFloat(w)))).toEqual(mine.segWidths);
          expect(squish(dom.segLabels)).toBe(squish(mine.segLabels));
          expect(squish(dom.summary)).toBe(squish(mine.summary));
          expect(squish(dom.insights)).toBe(squish(mine.insights));

          for (const key of ['needs', 'wants', 'save'] as const) {
            expect(dom.cats[key].status).toBe(mine.cats[key].status);
            expect(dom.cats[key].statusCls).toBe(mine.cats[key].statusCls);
            expect(dom.cats[key].used).toBe(mine.cats[key].used);
            expect(dom.cats[key].limit).toBe(mine.cats[key].limit);
            expect(parseFloat(dom.cats[key].fill || '0')).toBeCloseTo(mine.r.cats[key].fillPct, 6);
          }
        });
      }
    }
  }
});
