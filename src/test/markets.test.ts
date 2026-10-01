import { peerSummariesFor } from '../reference/peerSummaries';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  MARKETS, MARKET_IDS, MARKET_LIST, MARKET_KEY, DEFAULT_MARKET,
  isMarketId, loadMarket, loadMarketChoice, marketFor, saveMarket,
} from '../tools/lib/markets';
import { netAfterTax } from '../tools/lib/markets/tax';
import { PS_OPTS, PS_M, IN_PARK, computeParkSmart, psTax } from '../tools/lib/parksmart';
import { IM_ALLOC, IM_RATE, IN_INVEST, computeInvestMatch } from '../tools/lib/investmatch';
import { PC_BENCH, PC_CITIES, IN_PEER, computePeerCompare, pcBracket } from '../tools/lib/peercompare';
import { GP_PATHS, GP_PRESETS, computeGoalPlanner } from '../tools/lib/goals';
import { CURRENCY_CODES } from '../tools/lib/format';
import { hasRate } from '../tools/lib/fx';

/**
 * Two things are being defended here.
 *
 * First, that India did not move. The parity suites already compare the Indian
 * tables against the archived original; these tests add the claim the packs
 * make on top of that — that `MARKETS.IN` IS those tables, so the default path
 * through every tool is still the code that shipped.
 *
 * Second, that a new market is a COMPLETE market. The failure mode for this
 * architecture is a half-filled pack: a UK user shown British instruments, a
 * British tax band and then an Indian peer benchmark, with nothing to tell them
 * which half is wrong.
 */

describe('the registry', () => {
  it('lists every declared market, and every listed market is declared', () => {
    expect(Object.keys(MARKETS).sort()).toEqual([...MARKET_IDS].sort());
    expect(MARKET_LIST.map((m) => m.id)).toEqual([...MARKET_IDS]);
  });

  it('falls back to the default rather than throwing on an unknown id', () => {
    expect(marketFor('ZZ').id).toBe(DEFAULT_MARKET);
    expect(marketFor(undefined).id).toBe(DEFAULT_MARKET);
    expect(isMarketId('ZZ')).toBe(false);
  });

  it('opens on India, so an existing user sees no change at all', () => {
    expect(DEFAULT_MARKET).toBe('IN');
    expect(MARKET_LIST[0].id).toBe('IN');
  });
});

describe('India is exactly what shipped', () => {
  const inr = MARKETS.IN;

  it('re-exports the original tables rather than copying them', () => {
    expect(inr.park.options).toBe(PS_OPTS);
    expect(inr.invest.alloc).toBe(IM_ALLOC);
    expect(inr.invest.rates).toBe(IM_RATE);
    expect(inr.peer.cities).toBe(PC_CITIES);
    expect(inr.peer.bench).toBe(PC_BENCH);
    expect(inr.goals.presets).toBe(GP_PRESETS);
    expect(inr.goals.paths).toBe(GP_PATHS);
  });

  it('keeps the thresholds and assumptions the tools were built on', () => {
    // 20% was the slab ParkSmart opened on before markets existed.
    expect(inr.park.defaultRate).toBe(20);
    expect(inr.park.minAmount).toBe(1000);
    expect(inr.park.splitThreshold).toBe(100000);
    expect(inr.invest.inflation).toBe(0.06);
    expect(inr.goals.inflation).toBe(0.06);
  });

  it('produces identical output passed explicitly or left to default', () => {
    for (const dur of Object.keys(PS_M)) {
      for (const slab of [0, 0.2, 0.3]) {
        expect(computeParkSmart(250000, dur, slab, IN_PARK))
          .toEqual(computeParkSmart(250000, dur, slab));
      }
    }
    const ans = { age: 29, income: 90000, monthly: 15000, risk: 'aggressive', horizon: '10+', goal: 'tax' };
    expect(computeInvestMatch(ans, IN_INVEST)).toEqual(computeInvestMatch(ans));

    const peer = { age: 31, cityKey: 'pune', income: 90000, savings: 400000, invest: 300000, debt: 50000, rate: 22, expenses: 45000 };
    expect(computePeerCompare(peer, IN_PEER)).toEqual(computePeerCompare(peer));

    const goal = { name: 'Flat', targetToday: 5000000, years: 10, existing: 200000, inflate: true };
    expect(computeGoalPlanner(goal, 0.06, GP_PATHS)).toEqual(computeGoalPlanner(goal));
  });
});

describe('the tax engine reproduces psTax', () => {
  it('matches branch for branch across the grid', () => {
    // The parity suite proves this against the archived original; this proves
    // the generic engine and the named export cannot drift apart either.
    for (const opt of PS_OPTS) {
      for (const gross of [0, 900, 12500, 130000, 260000]) {
        for (const months of [0.5, 2, 4.5, 9, 15]) {
          for (const rate of [0, 0.2, 0.3]) {
            expect(netAfterTax(IN_PARK.treatments[opt.tax], gross, months, rate))
              .toBe(psTax(opt, gross, months, rate, 100000));
          }
        }
      }
    }
  });

  it('exempts everything when a market levies no tax', () => {
    expect(netAfterTax({ exempt: true }, 5000, 12, 0.4)).toBe(5000);
  });

  it('tapers an allowance by the taxpayerrate when one is supplied', () => {
    // The UK's Personal Savings Allowance: £1,000 basic, £500 higher, none at
    // the additional rate. A flat figure would overstate the return for exactly
    // the people with the most at stake.
    const psa = MARKETS.GB.park.treatments.savings;
    const basic = netAfterTax(psa, 2000, 12, 0.2);
    const higher = netAfterTax(psa, 2000, 12, 0.4);
    const additional = netAfterTax(psa, 2000, 12, 0.45);
    expect(basic).toBeCloseTo(2000 - 1000 * 0.2, 6);
    expect(higher).toBeCloseTo(2000 - 1500 * 0.4, 6);
    expect(additional).toBeCloseTo(2000 - 2000 * 0.45, 6);
  });
});

describe('every market is a complete market', () => {
  for (const market of MARKET_LIST) {
    describe(market.name, () => {
      it('declares provenance a reader can check', () => {
        expect(market.asOf).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
        expect(market.sources.length).toBeGreaterThan(0);
        for (const source of market.sources) expect(source.trim().length).toBeGreaterThan(10);
      });

      it('uses a currency the product can display and convert', () => {
        expect(CURRENCY_CODES).toContain(market.currency);
        expect(hasRate(market.currency)).toBe(true);
      });

      it('names a country and a locale', () => {
        expect(market.country).toMatch(/^[a-z]{2}$/);
        expect(market.locale).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
      });

      it('gives every parking option a tax treatment that exists', () => {
        if (market.park.inputMode === 'net-rates') {
          expect(market.park.options).toEqual([]);
          expect(market.park.taxNote).toContain('no further tax deduction');
        } else expect(market.park.options.length).toBeGreaterThan(3);
        for (const opt of market.park.options) {
          expect(market.park.treatments[opt.tax], `${opt.n} → ${opt.tax}`).toBeDefined();
        }
      });

      it('offers at least one tax rate and a liquid option for the shortest term', () => {
        expect(market.park.rateOptions.length).toBeGreaterThan(0);
        // A default outside the list leaves the select uncontrolled and the
        // ranking priced at a rate the user was never shown.
        expect(market.park.rateOptions.map((o) => o.value)).toContain(market.park.defaultRate);
        // Without one, "under 1 month" ranks nothing and the tool dead-ends.
        if (market.park.inputMode === 'net-rates') expect(market.park.treatments.enteredNet).toEqual({ exempt: true });
        else expect(market.park.options.some((o) => o.liquid && o.minM === 0)).toBe(true);
      });

      it('quotes amounts above its own minimum', () => {
        expect(market.park.quickAmounts.length).toBeGreaterThan(0);
        for (const amount of market.park.quickAmounts) {
          expect(amount).toBeGreaterThanOrEqual(market.park.minAmount);
        }
      });

      it('allocates exactly 100% in every risk band', () => {
        for (const band of ['conservative', 'moderate', 'aggressive']) {
          const alloc = market.invest.alloc[band];
          expect(alloc, band).toBeDefined();
          expect(alloc.reduce((sum, a) => sum + a.p, 0), band).toBe(100);
          expect(market.invest.rates[band], band).toBeGreaterThan(0);
        }
      });

      it('orders expected returns by risk, or the risk question means nothing', () => {
        const { conservative, moderate, aggressive } = market.invest.rates;
        expect(conservative).toBeLessThan(moderate);
        expect(moderate).toBeLessThan(aggressive);
      });

      it('benchmarks every age bracket the tool can produce', () => {
        if (market.peer.mode === 'published-context') {
          expect(market.peer.bench).toEqual({});
          expect(peerSummariesFor(market.id).length).toBeGreaterThan(0);
          return;
        }
        for (const age of [18, 24, 27, 30, 35, 40, 55]) {
          expect(market.peer.bench[pcBracket(age)], String(age)).toBeDefined();
        }
      });

      it('gives every benchmark all three city tiers', () => {
        for (const [bracket, bench] of Object.entries(market.peer.bench)) {
          for (const tier of ['metro', 'tier2', 'tier3'] as const) {
            expect(bench.income[tier], `${bracket}/${tier}`).toBeGreaterThan(0);
            expect(bench.expenses[tier], `${bracket}/${tier}`).toBeGreaterThan(0);
          }
        }
      });

      it('has a fallback city that actually exists', () => {
        if (market.peer.mode === 'published-context') {
          expect(market.peer.cities).toEqual({});
          expect(market.peer.fallbackCity).toBe('');
          return;
        }
        expect(market.peer.cities[market.peer.fallbackCity]).toBeDefined();
        expect(market.peer.cities[market.peer.defaults.cityKey]).toBeDefined();
      });

      it('offers three goal paths, ordered by return, each naming instruments', () => {
        expect(market.goals.paths).toHaveLength(3);
        const rates = market.goals.paths.map((p) => p.rate);
        expect([...rates].sort((a, b) => b - a)).toEqual(rates);
        for (const path of market.goals.paths) expect(path.inst.length).toBeGreaterThan(10);
      });

      it('sets goal presets above its own minimum', () => {
        expect(market.goals.presets.length).toBeGreaterThan(0);
        for (const [, , amount] of market.goals.presets) {
          expect(amount).toBeGreaterThanOrEqual(market.goals.minTarget);
        }
      });

      it('writes its money strings in its own currency', () => {
        // A pack whose formatter still says "₹" is the exact bug the market
        // layer exists to prevent.
        const sample = market.invest.money(1234);
        expect(sample.length).toBeGreaterThan(0);
        if (market.id !== 'IN') expect(sample).not.toContain('₹');
      });

      it('ranks and computes end to end without a default anywhere', () => {
        const amount = market.park.quickAmounts[market.park.quickAmounts.length - 1];
        const rate = market.park.rateOptions[0].value / 100;
        const park = market.park.inputMode === 'net-rates' ? { ...market.park, options: [{ n: 'Entered example', rate: 3, tax: 'enteredNet', liquid: true, risk: 'User terms', ic: 'bank' as const, d: 'User input', minM: 0 }] } : market.park;
        const parked = computeParkSmart(amount, '6-12', rate, park);
        expect(parked.valid).toBe(true);
        expect(parked.ranked.length).toBeGreaterThan(0);
        // Post-tax can never exceed gross, in any jurisdiction.
        for (const option of parked.ranked) expect(option.net).toBeLessThanOrEqual(option.gross + 1e-9);

        const invested = computeInvestMatch(market.invest.defaults, market.invest);
        expect(invested.tooLow).toBe(false);
        expect(invested.alloc.length).toBeGreaterThan(0);

        if (market.peer.mode === 'published-context') {
          expect(peerSummariesFor(market.id).every((r) => r.market === market.id)).toBe(true);
          return;
        }
        const compared = computePeerCompare(market.peer.defaults, market.peer);
        expect(compared.score).toBeGreaterThan(0);
        expect(compared.metrics).toHaveLength(6);
      });
    });
  }
});

describe('choosing a market', () => {
  beforeEach(() => localStorage.clear());

  it('remembers a choice and reports it as chosen', () => {
    expect(loadMarketChoice()).toBeNull();
    saveMarket('GB');
    expect(loadMarketChoice()).toBe('GB');
    expect(loadMarket()).toBe('GB');
  });

  it('ignores a stored value that is not a market', () => {
    localStorage.setItem(MARKET_KEY, 'ZZ');
    // Junk is not a choice, so it falls through to detection exactly as an
    // empty store would. Asserting the resolved id here would be asserting the
    // test runner's own locale, which is not a fact about this code.
    expect(loadMarketChoice()).toBeNull();
    expect(isMarketId(loadMarket())).toBe(true);
  });

  it('never persists a guess — detection is a default, not a decision', () => {
    loadMarket();
    expect(localStorage.getItem(MARKET_KEY)).toBeNull();
  });
});
