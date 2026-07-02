import { describe, it, expect } from 'vitest';
// Raw source of the ORIGINAL tools app — the parity reference.
import toolsHtml from './__fixtures__/original-tools-app.html?raw';
import { extractFnSource, extractConstSource, evalOriginalConst, compileScope } from './harness';
import { CURRENCIES, CURRENCY_CODES, fmt, cfmt, cfmtSh } from '../../tools/lib/format';

// A numeric grid that exercises every branch of the formatters (thousands,
// Lakh, Crore, negatives, rounding, sub-rupee).
const GRID = [
  0, 1, 0.4, 0.5, 12.5, 99, 100.5, 999, 1000, 1500, 50000.75, 99999, 100000,
  123456, 250000.75, 999999, 1000000, 1234567, 9999999, 1e7, 12345678, 99999999,
  123456789, -1, -1500, -99999, -1234567, -1e7,
];

const CURRENCIES_SRC = extractConstSource(toolsHtml, 'CURRENCIES');
const FMT_SRC = extractFnSource(toolsHtml, 'fmt');

describe('format parity — CURRENCIES table', () => {
  it('matches the original CURRENCIES object exactly', () => {
    expect(CURRENCIES).toEqual(evalOriginalConst(toolsHtml, 'CURRENCIES'));
  });

  it('exposes exactly 40 currencies (the count shown on the hero)', () => {
    expect(CURRENCY_CODES.length).toBe(40);
  });
});

describe('format parity — fmt (INR Lakh/Crore)', () => {
  const original = compileScope<(n: number) => string>([FMT_SRC], 'fmt');
  it('matches the original fmt across the grid', () => {
    for (const n of GRID) expect(fmt(n)).toBe(original(n));
  });
});

describe('format parity — cfmt / cfmtSh (all currencies)', () => {
  for (const code of CURRENCY_CODES) {
    it(`cfmt matches original for ${code}`, () => {
      const original = compileScope<(n: number) => string>(
        [`let FXC = ${JSON.stringify(code)};`, CURRENCIES_SRC, FMT_SRC, extractFnSource(toolsHtml, 'cfmt')],
        'cfmt'
      );
      for (const n of GRID) expect(cfmt(n, code)).toBe(original(n));
    });

    it(`cfmtSh matches original for ${code}`, () => {
      const original = compileScope<(n: number) => string>(
        [`let FXC = ${JSON.stringify(code)};`, CURRENCIES_SRC, extractFnSource(toolsHtml, 'cfmtSh')],
        'cfmtSh'
      );
      for (const n of GRID) expect(cfmtSh(n, code)).toBe(original(n));
    });
  }
});
