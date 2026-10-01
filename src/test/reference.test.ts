import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ASSUMPTIONS, assumptionFor, assumptionsForTool,
  CONFLICTS, OPEN_GATES,
  DEPOSIT_PROTECTION, compareToCap, depositProtectionFor,
  HEURISTICS, UNSUPPORTED_HEURISTICS,
  INFLATION_OBSERVATIONS, inflationFor, periodLabel,
  METHODOLOGIES, TOOL_METHODOLOGY, methodologyForTool, referenceLimitsFor,
  PEER_DATASETS, canRankPercentile,
  REFERENCE_MARKETS, RETIREMENT_SYSTEMS, canProjectStatutoryBenefit,
  SOURCES, sourceById,
  TAX_SCHEDULES, taxPolicyFor, taxSchedulesFor,
  evaluateFreshness, resolveReference, preferSourceFor,
  referenceErrors, validateReference,
  reviewReport,
  findAvoidedClaims, DISCLAIMERS, TIER_LABELS,
  isReferenceMarket,
  type ReferenceMarket,
} from '../reference';
import { MARKET_IDS } from '../tools/lib/markets/types';

/**
 * The reference layer's job is to make a particular class of mistake
 * impossible rather than unlikely: a number on screen that nobody can check, a
 * missing legal value rendered as zero, a regional rule applied nationally, or
 * a published statistic quietly promoted into a thirty-year projection.
 *
 * Every test here defends one of those.
 */

const AS_OF = new Date(2026, 8, 12); // 12 September 2026, the pack's research cutoff.

describe('structural validity', () => {
  it('has no validation errors at all', () => {
    // Printed rather than counted, so a failure names the record and the rule.
    expect(referenceErrors().map((i) => `${i.where}: ${i.message}`)).toEqual([]);
  });

  it('reports warnings as warnings rather than failing on them', () => {
    const all = validateReference();
    expect(all.every((i) => i.severity === 'error' || i.severity === 'warning')).toBe(true);
  });

  it('gives every source a unique id and an https link', () => {
    expect(new Set(SOURCES.map((s) => s.id)).size).toBe(SOURCES.length);
    expect(SOURCES.every((s) => s.url.startsWith('https://'))).toBe(true);
  });

  it('gives every assumption a unique id', () => {
    expect(new Set(ASSUMPTIONS.map((a) => a.id)).size).toBe(ASSUMPTIONS.length);
  });

  it('resolves every source id an assumption, gate or conflict cites', () => {
    const cited = [
      ...ASSUMPTIONS.flatMap((a) => a.sourceIds),
      ...OPEN_GATES.flatMap((g) => g.sourceIds),
      ...CONFLICTS.flatMap((c) => c.sourceIds),
      ...DEPOSIT_PROTECTION.flatMap((d) => d.sourceIds),
      ...TAX_SCHEDULES.flatMap((t) => t.sourceIds),
      ...RETIREMENT_SYSTEMS.flatMap((r) => r.sourceIds),
      ...HEURISTICS.flatMap((h) => h.sourceIds),
    ];
    expect(cited.filter((id) => sourceById(id) === undefined)).toEqual([]);
  });

  it('only uses market codes it declares', () => {
    const codes = [
      ...SOURCES.map((s) => s.market),
      ...ASSUMPTIONS.map((a) => a.market),
      ...DEPOSIT_PROTECTION.map((d) => d.market),
      ...INFLATION_OBSERVATIONS.map((o) => o.market),
      ...PEER_DATASETS.map((d) => d.market),
    ];
    expect(codes.filter((c) => !isReferenceMarket(c))).toEqual([]);
  });
});

describe('country isolation', () => {
  it('covers every market the product actually offers', () => {
    // The reference layer may be wider than the product. It must never be
    // narrower, or a live market would have data with no provenance behind it.
    expect(MARKET_IDS.filter((id) => !REFERENCE_MARKETS.includes(id as ReferenceMarket))).toEqual([]);
  });

  it('never returns one market’s value for another', () => {
    for (const m of REFERENCE_MARKETS) {
      expect(depositProtectionFor(m)?.market ?? m).toBe(m);
      expect(inflationFor(m)?.market ?? m).toBe(m);
      for (const a of assumptionsForTool(m, 'parksmart')) expect(a.market).toBe(m);
      for (const s of taxSchedulesFor(m)) expect(s.market).toBe(m);
    }
  });

  it('names CN as Mainland China rather than China', () => {
    const cn = DEPOSIT_PROTECTION.find((d) => d.market === 'CN');
    expect(cn?.applicability).toMatch(/Mainland China only/);
    expect(cn?.applicability).toMatch(/Hong Kong/);
  });

  it('has no deposit record for a market it does not list', () => {
    expect(DEPOSIT_PROTECTION.every((d) => REFERENCE_MARKETS.includes(d.market))).toBe(true);
  });
});

describe('deposit protection', () => {
  it('carries the current UK limit and its commencement date', () => {
    const gb = depositProtectionFor('GB');
    expect(gb?.limit).toBe(120000);
    expect(gb?.effectiveDate).toBe('2025-12-01');
  });

  it('records the UAE as unverified, never as zero or unlimited', () => {
    const ae = depositProtectionFor('AE');
    expect(ae?.limit).toBeNull();
    expect(ae?.quality).toBe('NO_AUTHORITATIVE_DEFAULT');
    // The specific fabrications the research warned against.
    expect(ae?.applicability).not.toMatch(/\b0\b|unlimited/i);
  });

  it('asks for verification rather than comparing, when there is no cap', () => {
    const c = compareToCap('AE', 1_000_000, 'AED');
    expect(c.kind).toBe('unverified');
  });

  it('compares an amount against a verified cap', () => {
    expect(compareToCap('IN', 400_000, 'INR')).toMatchObject({ kind: 'within', limit: 500000 });
    expect(compareToCap('IN', 700_000, 'INR')).toMatchObject({ kind: 'above', excess: 200_000 });
  });

  it('says nothing rather than something wrong for a nonsense amount', () => {
    expect(compareToCap('IN', Number.NaN, 'INR').kind).toBe('within');
    expect(compareToCap('IN', -5, 'INR').kind).toBe('within');
  });

  it('refuses to compare an amount against a limit in another currency', () => {
    // Someone can hold rupees while comparing against UK rules. ₹700,000 is not
    // "above £120,000"; the two numbers have no relationship at all, and
    // converting would stack a dated FX rate under a legal threshold.
    const c = compareToCap('GB', 700_000, 'INR');
    expect(c).toMatchObject({ kind: 'not-comparable', limit: 120000, currency: 'GBP', amountCurrency: 'INR' });
  });

  it('leaves China’s joint-account treatment blank rather than assuming equal shares', () => {
    expect(depositProtectionFor('CN')?.jointAccounts).toBeNull();
  });

  it('has no record at all for a market outside the layer', () => {
    expect(compareToCap('ZZ' as ReferenceMarket, 100, 'INR').kind).toBe('no-record');
  });
});

describe('data quality and freshness', () => {
  it('escalates a current value to review-due once its date passes', () => {
    // A month past its date: overdue, but not yet far enough to be disbelieved.
    const v = evaluateFreshness(
      { quality: 'VERIFIED_CURRENT', reviewDue: '2026-08-12', lastVerified: '2026-05-12' },
      AS_OF,
    );
    expect(v.state).toBe('REVIEW_DUE');
    expect(v.escalated).toBe(true);
    expect(v.showsWarning).toBe(true);
  });

  it('escalates to stale once it is a quarter overdue', () => {
    const v = evaluateFreshness(
      { quality: 'VERIFIED_CURRENT', reviewDue: '2026-01-01', lastVerified: '2025-12-01' },
      new Date(2026, 11, 1),
    );
    expect(v.state).toBe('STALE');
  });

  it('never promotes a state', () => {
    const v = evaluateFreshness(
      { quality: 'STALE', reviewDue: '2099-01-01', lastVerified: '2026-09-12' },
      AS_OF,
    );
    expect(v.state).toBe('STALE');
  });

  it('leaves user-supplied and illustrative values alone forever', () => {
    for (const quality of ['USER_SUPPLIED', 'ILLUSTRATIVE', 'VERIFIED_STATIC'] as const) {
      const v = evaluateFreshness({ quality, reviewDue: '2000-01-01', lastVerified: '2000-01-01' }, AS_OF);
      expect(v.state).toBe(quality);
      expect(v.showsWarning).toBe(false);
      expect(v.notice).toBeNull();
    }
  });

  it('treats an unusable review date as due for review rather than as fresh', () => {
    const v = evaluateFreshness({ quality: 'VERIFIED_CURRENT', reviewDue: 'soon', lastVerified: '2026-09-12' }, AS_OF);
    expect(v.state).toBe('REVIEW_DUE');
  });

  it('holds the pack’s own review states', () => {
    expect(inflationFor('IN')?.quality).toBe('REVIEW_DUE');
    expect(inflationFor('AE')?.quality).toBe('STALE');
    expect(inflationFor('US')?.quality).toBe('VERIFIED_CURRENT');
  });
});

describe('the resolver', () => {
  const base = {
    quality: 'VERIFIED_CURRENT' as const,
    reviewDue: '2099-01-01',
    lastVerified: '2026-09-12',
    scope: 'NATIONAL' as const,
    sourceIds: ['UK-FSCS-001'],
    activationBlockers: [] as string[],
    value: 120000,
  };

  it('allows a current national value for any use', () => {
    for (const use of ['CONTEXT', 'COMPARISON', 'MARKET_SPECIFIC_RESULT', 'CALCULATION'] as const) {
      expect(resolveReference(base, use, AS_OF).usable).toBe(true);
    }
  });

  it('asks for user input rather than inventing a missing value', () => {
    const r = resolveReference({ ...base, value: null }, 'COMPARISON', AS_OF);
    expect(r.usable).toBe(false);
    expect(r.behaviour).toBe('REQUEST_USER_INPUT');
  });

  it('never applies a region-specific rule nationally', () => {
    const r = resolveReference({ ...base, scope: 'STATE_SPECIFIC' }, 'MARKET_SPECIFIC_RESULT', AS_OF);
    expect(r.usable).toBe(false);
    expect(r.notice).toMatch(/region/i);
  });

  it('degrades by exactly one step, proportionate to the use', () => {
    const blocked = { ...base, activationBlockers: ['NOT_APPROVED'] };
    expect(resolveReference(blocked, 'COMPARISON', AS_OF).behaviour).toBe('REMOVE_REFERENCE_COMPARISON');
    expect(resolveReference(blocked, 'MARKET_SPECIFIC_RESULT', AS_OF).behaviour).toBe('DISABLE_MARKET_SPECIFIC_RESULT');
    expect(resolveReference(blocked, 'CALCULATION', AS_OF).behaviour).toBe('BLOCK_CALCULATION');
  });

  it('lets a blocked value still be shown as context', () => {
    const r = resolveReference({ ...base, activationBlockers: ['NOT_APPROVED'] }, 'CONTEXT', AS_OF);
    expect(r.usable).toBe(true);
    expect(r.behaviour).toBe('USE_WITH_WARNING');
  });

  it('keeps stale data readable as context but out of every calculation', () => {
    const stale = { ...base, quality: 'STALE' as const };
    expect(resolveReference(stale, 'CONTEXT', AS_OF).usable).toBe(true);
    expect(resolveReference(stale, 'CALCULATION', AS_OF).usable).toBe(false);
  });

  it('pauses a calculation on a value awaiting review, without hiding it', () => {
    const due = { ...base, reviewDue: '2026-08-12' };
    expect(resolveReference(due, 'CALCULATION', AS_OF).behaviour).toBe('BLOCK_CALCULATION');
    expect(resolveReference(due, 'CONTEXT', AS_OF).usable).toBe(true);
  });

  it('attaches the resolved sources so a caller can always cite them', () => {
    expect(resolveReference(base, 'CONTEXT', AS_OF).sources.map((s) => s.id)).toEqual(['UK-FSCS-001']);
  });

  it('ranks an on-topic statistics office above off-topic legislation', () => {
    const stats = sourceById('UK-ONS-002')!;
    const law = sourceById('CN-MOJ-001')!;
    expect(preferSourceFor('peer', [law, stats])[0].id).toBe('UK-ONS-002');
  });
});

describe('tax', () => {
  it('approves automatic calculation nowhere', () => {
    expect(TAX_SCHEDULES.every((s) => s.automaticCalculationApproved === false)).toBe(true);
    for (const m of REFERENCE_MARKETS) {
      expect(taxPolicyFor(m, 'TOTAL_PERSONAL_TAX').policy).toBe('BLOCKED');
    }
  });

  it('asks the user for net income in every market', () => {
    for (const m of REFERENCE_MARKETS) {
      expect(taxPolicyFor(m, 'NET_INCOME').policy).toBe('USER_INPUT');
    }
  });

  it('marks payroll as regionally determined where it is', () => {
    for (const m of ['US', 'AE', 'CN'] as const) {
      expect(taxPolicyFor(m, 'PAYROLL_AND_SOCIAL').regionSpecific).toBe(true);
    }
    expect(taxPolicyFor('GB', 'PAYROLL_AND_SOCIAL').regionSpecific).toBe(false);
  });

  it('keeps the Scottish schedule separate and region-scoped', () => {
    const gb = taxSchedulesFor('GB');
    expect(gb).toHaveLength(2);
    expect(gb.every((s) => s.scope === 'REGION_SPECIFIC')).toBe(true);
  });

  it('has no schedule for the UAE', () => {
    expect(taxSchedulesFor('AE')).toEqual([]);
  });

  it('refuses to call India’s rebate threshold a zero-rate band', () => {
    const inSchedule = taxSchedulesFor('IN')[0];
    expect(inSchedule.bands[0].upperExclusive).toBe(400000);
    expect(inSchedule.applicability).toMatch(/rebate/i);
  });
});

describe('retirement', () => {
  it('projects no statutory benefit in any market', () => {
    for (const m of REFERENCE_MARKETS) expect(canProjectStatutoryBenefit(m)).toBe(false);
  });

  it('says what the user has to supply, in every market', () => {
    for (const r of RETIREMENT_SYSTEMS) expect(r.mustAsk.length).toBeGreaterThan(0);
  });

  it('flags the markets whose rules turn on region or legal cohort', () => {
    const flagged = RETIREMENT_SYSTEMS.filter((r) => r.regionOrCohortDependent).map((r) => r.market).sort();
    expect(flagged).toEqual(['AE', 'CN', 'SG']);
  });

  it('requires the user to supply a pension figure rather than inferring one', () => {
    const a = assumptionFor('GB', 'STATUTORY_PENSION_BENEFIT');
    expect(a?.value).toBe('USER_INPUT_REQUIRED');
    expect(a?.quality).toBe('NO_AUTHORITATIVE_DEFAULT');
    expect(a?.reason).toBeTruthy();
  });
});

describe('peer data', () => {
  it('has ingested no benchmark value and enabled no percentile', () => {
    expect(PEER_DATASETS.every((d) => d.valuesIngested === false)).toBe(true);
    expect(PEER_DATASETS.every((d) => d.percentileEnabled === false)).toBe(true);
    for (const m of REFERENCE_MARKETS) expect(canRankPercentile(m)).toBe(false);
  });

  it('records an absence as a named gap rather than an empty result', () => {
    const gaps = PEER_DATASETS.filter((d) => d.title === null);
    expect(gaps.map((g) => g.market).sort()).toEqual(['AE', 'CN', 'SG']);
    expect(gaps.every((g) => g.limitations.length > 0)).toBe(true);
  });

  it('states what remains before any dataset could be used', () => {
    expect(PEER_DATASETS.every((d) => d.remainingWork.trim().length > 0)).toBe(true);
  });

  it('keeps the Great Britain coverage gap visible', () => {
    const was = PEER_DATASETS.find((d) => d.id === 'GB-WAS-2020-22');
    expect(was?.geography).toMatch(/excludes Northern Ireland/);
  });
});

describe('heuristics', () => {
  it('never attaches a number to an unsupported rule of thumb', () => {
    expect(UNSUPPORTED_HEURISTICS.every((h) => h.referenceValue === null)).toBe(true);
  });

  it('never uses an unsupported rule of thumb in the product', () => {
    expect(UNSUPPORTED_HEURISTICS.every((h) => h.usedInProduct === 'NOT_USED')).toBe(true);
  });

  it('records the age-based allocation rule specifically as unsupported', () => {
    expect(HEURISTICS.find((h) => h.id === 'H-AGE-EQUITY')?.classification).toBe('UNSUPPORTED');
  });

  it('names the origin market of guidance that came from one country', () => {
    expect(HEURISTICS.find((h) => h.id === 'H-EMERGENCY-RESERVE')?.originMarket).toBe('AU');
  });
});

describe('assumptions', () => {
  it('separates published references from planning choices', () => {
    for (const a of ASSUMPTIONS) {
      if (a.tier === 'ASSUMED') expect(a.sourceIds).toEqual([]);
      if (a.tier === 'REFERENCE' && a.value !== null) expect(a.sourceIds.length).toBeGreaterThan(0);
    }
  });

  it('never lets the user edit a statutory value', () => {
    const caps = ASSUMPTIONS.filter((a) => a.variable === 'DEPOSIT_PROTECTION_LIMIT');
    expect(caps).toHaveLength(REFERENCE_MARKETS.length);
    expect(caps.every((a) => a.userEditable === false)).toBe(true);
  });

  it('holds no planning value in the registry, only its classification', () => {
    const inflation = assumptionFor('IN', 'LONG_RUN_INFLATION');
    expect(inflation?.valueSource).toBe('MARKET_PACK');
    expect(inflation?.value).toBeNull();
    expect(inflation?.quality).toBe('ILLUSTRATIVE');
  });

  it('marks every CPI observation as barred from becoming a projection input', () => {
    const cpi = ASSUMPTIONS.filter((a) => a.variable === 'CPI_OBSERVATION');
    expect(cpi).toHaveLength(REFERENCE_MARKETS.length);
    expect(cpi.every((a) => a.activationBlockers.includes('NEVER_A_PROJECTION_INPUT'))).toBe(true);
  });

  it('treats nothing as calculation-critical yet', () => {
    expect(ASSUMPTIONS.filter((a) => a.calculationCritical)).toEqual([]);
  });
});

describe('methodology lookup', () => {
  it('maps every tool to exactly one methodology that exists', () => {
    for (const [tool, id] of Object.entries(TOOL_METHODOLOGY)) {
      expect(METHODOLOGIES[id]).toBeDefined();
      expect(methodologyForTool(tool)?.id).toBe(id);
    }
  });

  it('returns nothing for a tool it does not know', () => {
    expect(methodologyForTool('not-a-tool')).toBeUndefined();
  });

  it('adds reference-driven limits only where there is something to add', () => {
    expect(referenceLimitsFor('parksmart', 'US').length).toBeGreaterThan(0);
    expect(referenceLimitsFor('networth', 'IN')).toEqual([]);
  });

  it('says social contributions are regional only where they are', () => {
    const us = referenceLimitsFor('parksmart', 'US').join(' ');
    const gb = referenceLimitsFor('parksmart', 'GB').join(' ');
    expect(us).toMatch(/regionally/);
    expect(gb).not.toMatch(/regionally/);
  });

  it('keeps every methodology at 1.0.0, because no formula changed', () => {
    expect(Object.values(METHODOLOGIES).every((m) => m.version === '1.0.0')).toBe(true);
  });
});

describe('user-facing language', () => {
  /** Every string this layer can put in front of a reader. */
  const copy = [
    ...DEPOSIT_PROTECTION.flatMap((d) => [d.aggregation, d.eligible, d.exclusions, d.applicability, d.jointAccounts ?? '']),
    ...INFLATION_OBSERVATIONS.flatMap((o) => [o.measure, o.notes]),
    ...TAX_SCHEDULES.flatMap((t) => [t.applicability, t.excluded]),
    ...RETIREMENT_SYSTEMS.flatMap((r) => [r.modelling, r.notModelled, ...r.mustAsk]),
    ...PEER_DATASETS.flatMap((d) => [d.limitations, d.remainingWork]),
    ...HEURISTICS.map((h) => h.limitations),
    ...Object.values(DISCLAIMERS),
    ...Object.values(TIER_LABELS),
    ...REFERENCE_MARKETS.flatMap((m) => ['parksmart', 'lifemap', 'goals', 'investmatch', 'peercompare'].flatMap((t) => referenceLimitsFor(t, m))),
  ];

  it('uses none of the phrasings a financial product should avoid', () => {
    const offenders = copy.flatMap((text) =>
      findAvoidedClaims(text).map((c) => `"${c.avoid}" in: ${text.slice(0, 70)}…`),
    );
    expect(offenders).toEqual([]);
  });

  it('detects a banned phrase when one is present', () => {
    // Guards the guard: a matcher that never matches would pass the test above
    // for the wrong reason.
    expect(findAvoidedClaims('This account is risk-free and guaranteed.').map((c) => c.avoid))
      .toEqual(expect.arrayContaining(['risk-free', 'guaranteed']));
  });
});

describe('the review mechanism', () => {
  it('reports only what the research itself flagged, on the day it was compiled', () => {
    // Not an empty report: the UAE price series was recorded as stale by the
    // researchers, and India's as awaiting a release. Those are findings, and
    // the report is supposed to carry them from day one.
    const report = reviewReport(new Date(2026, 8, 12));
    expect(report.overdue.map((i) => i.id)).toEqual(['AE-CPI_OBSERVATION']);
    expect(report.due.map((i) => i.id)).toEqual(['IN-CPI_OBSERVATION']);
  });

  it('lists a reference once, however many registries project it', () => {
    // The assumption registry projects the deposit and inflation records rather
    // than copying them, so every id in it also exists in a domain registry.
    const report = reviewReport(new Date(2030, 0, 1));
    const ids = [...report.due, ...report.overdue].map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('surfaces overdue references worst-impact first', () => {
    const report = reviewReport(new Date(2027, 6, 1));
    expect(report.total).toBeGreaterThan(0);
    const impacts = [...report.overdue, ...report.due].map((i) => i.impact);
    const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
    expect(impacts.map((i) => rank[i])).toEqual([...impacts.map((i) => rank[i])].sort((a, b) => a - b));
  });

  it('never asks anyone to review a planning assumption', () => {
    const report = reviewReport(new Date(2030, 0, 1));
    const planning = new Set(ASSUMPTIONS.filter((a) => a.tier === 'ASSUMED').map((a) => a.id));
    expect([...report.due, ...report.overdue].filter((i) => planning.has(i.id))).toEqual([]);
  });
});

describe('gates and conflicts', () => {
  it('says, for every gate, what the product does and what would change it', () => {
    expect(OPEN_GATES.every((g) => g.productBehaviour && g.requiredToClose)).toBe(true);
  });

  it('states the calculation impact of every conflict', () => {
    expect(CONFLICTS.every((c) => c.calculationImpact.trim().length > 0)).toBe(true);
  });

  it('records the UK limit correction, and that no number moved', () => {
    const c = CONFLICTS.find((x) => x.id === 'C-01');
    expect(c?.resolution).toBe('REPOSITORY_UPDATED');
    expect(c?.calculationImpact).toMatch(/^None/);
  });

  it('keeps the repository’s value where the repository is the better evidence', () => {
    const kept = CONFLICTS.filter((c) => c.resolution === 'REPOSITORY_PREFERRED');
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every((c) => c.calculationImpact.startsWith('None'))).toBe(true);
  });
});

describe('the one-way dependency', () => {
  const dir = path.resolve(__dirname, '../reference');

  it('imports nothing from the tools it serves', () => {
    // A reference value that can reach into a calculator is no longer a
    // reference — it is an input, and the separation this layer exists to
    // enforce is gone. Checked at the file level so it cannot be reintroduced
    // by a convenience import somebody adds in a hurry.
    const offenders: string[] = [];
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.ts')) continue;
      const src = fs.readFileSync(path.join(dir, file), 'utf8');
      for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
        const spec = m[1];
        if (spec.includes('tools/') || spec.startsWith('../tools')) offenders.push(`${file} → ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps published price observations out of every calculator', () => {
    // The specific failure this prevents: one month's CPI print being passed to
    // a function whose parameter is called `inflation` and whose horizon is
    // thirty years.
    const libs = path.resolve(__dirname, '../tools/lib');
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.name.endsWith('.ts')) continue;
        const src = fs.readFileSync(full, 'utf8');
        if (/reference\/inflation|INFLATION_OBSERVATIONS|inflationFor/.test(src)) {
          offenders.push(path.relative(libs, full));
        }
      }
    };
    walk(libs);
    expect(offenders).toEqual([]);
  });
});

describe('label helpers', () => {
  it('renders a month and a quarter without inventing a day', () => {
    expect(periodLabel('2026-07')).toBe('July 2026');
    expect(periodLabel('2025-Q4')).toBe('Q4 2025');
    expect(periodLabel('nonsense')).toBe('nonsense');
    expect(periodLabel('2026-13')).toBe('2026-13');
  });
});

describe('no duplicate source of truth for a statutory limit', () => {
  const dir = path.resolve(__dirname, '../tools/lib/markets');
  const packs = fs.readdirSync(dir).filter((f) => /^(in|us|gb|ae)\.ts$/.test(f));

  it('reads every market pack in the registry', () => {
    expect(packs.sort()).toEqual(['ae.ts', 'gb.ts', 'in.ts', 'us.ts']);
  });

  it('states no protection amount in market-pack prose', () => {
    // The failure this prevents, in full: the UK limit rose to £120,000 on
    // 1 December 2025 and the product went on saying £85,000 in four separate
    // sentences, because prose cannot carry an effective date and nothing could
    // tell it had lapsed. The figure now lives once, dated, in the registry.
    //
    // Matches a currency amount within 60 characters of a protection scheme's
    // name — close enough to catch "FSCS protected to £85,000" and loose enough
    // that a rephrasing cannot slip past it.
    const near = /(FSCS|FDIC|DICGC|SDIC|deposit (protection|guarantee|insurance)|protected|insured)[^.]{0,60}?([£$₹€]\s?[\d,]{3,}|\b\d[\d,]*\s?(K|L|lakh|crore)\b)/i;
    const offenders: string[] = [];
    for (const file of packs) {
      const src = fs.readFileSync(path.join(dir, file), 'utf8');
      for (const [i, line] of src.split('\n').entries()) {
        // The banner comments explain the rule by quoting the old value.
        if (line.trimStart().startsWith('*')) continue;
        if (near.test(line)) offenders.push(`${file}:${i + 1}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the one figure that cannot be moved in agreement with the registry', () => {
    // India's instrument table is parity-pinned field-for-field against the
    // archived original, `d` strings included, so "DICGC insured to ₹5L" cannot
    // be rewritten without breaking parity — and parity outranks tidiness. The
    // duplicate is therefore frozen in place and checked instead: if the
    // registry limit ever moves without that sentence moving with it, this
    // fails and names both.
    const parksmart = fs.readFileSync(path.resolve(__dirname, '../tools/lib/parksmart.ts'), 'utf8');
    expect(parksmart).toMatch(/DICGC insured to ₹5L/);
    expect(depositProtectionFor('IN')?.limit).toBe(500_000);
  });
});
