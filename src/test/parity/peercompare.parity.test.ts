import { describe, it, expect } from 'vitest';
import toolsHtml from './__fixtures__/original-tools-app.html?raw';
import { evalOriginalConst } from './harness';
import { PC_CITIES } from '../../tools/lib/peercompare';

/**
 * PeerCompare parity — retired, except for the city table.
 *
 * This file used to hold the fullest parity suite in the project: `PC_BENCH`
 * pinned to the fixture, `pcBracket`/`pcPct` compared across grids, and 40
 * rendered-output comparisons against the original `pcCompare()` DOM. All of it
 * has gone, deliberately, because the behaviour it was protecting was wrong:
 *
 *   • `PC_BENCH` was 126 hand-written "averages" by age bracket and city tier,
 *     presented as sourced to "RBI, PLFS & survey data". They were not, and
 *     could not be — MoSPI publishes no earnings breakdown by age, and no
 *     official Indian series reports household savings, investments or net
 *     worth by age and city tier. The table is gone; `benchmarks.ts` carries
 *     what is actually publishable, with publisher, period and URL.
 *   • `pcPct` was rendered as a percentile in both the code and the UI. It is a
 *     logistic curve over a ratio, not a percentile. Renamed `comparisonIndex`.
 *   • `dti` was `debt / (income * 12)` — total outstanding debt over annual
 *     income — labelled "Debt-to-income" and thresholded at 40%, which is the
 *     conventional limit for the monthly-payment ratio. Replaced by a real
 *     debt-service ratio computed from a new EMI input.
 *
 * Holding any of that to the fixture meant CI would fail the moment somebody
 * fixed it, which is precisely what kept it shipped. Correctness assertions
 * now live in `peercompare.test.ts`, checked against published figures and
 * stated guidelines rather than against the previous implementation.
 *
 * The city table survives here because it genuinely is unchanged data, and
 * because pinning it proves the rewrite did not quietly edit the one part it
 * had no reason to touch.
 */
describe('peercompare parity — the city table is unchanged', () => {
  it('PC_CITIES still matches the source', () => {
    expect(PC_CITIES).toEqual(evalOriginalConst(toolsHtml, 'PC_CITIES'));
  });
});
