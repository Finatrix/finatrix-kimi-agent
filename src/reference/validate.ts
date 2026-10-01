/**
 * Structural validation for the reference layer.
 *
 * WHAT THIS CAN AND CANNOT CHECK
 * ------------------------------
 * It cannot tell you whether the FSCS limit is right. Nothing in a repository
 * can; that takes a person opening the FSCS's page. What it can do is make the
 * whole class of *structural* errors impossible to ship: a citation pointing at
 * a source id that does not exist, a tax band that skips a range of income, a
 * review date before the verification date, a rate expressed as 20 where every
 * other rate in the file is 0.2, a limit that is `NaN`.
 *
 * Those are the errors that survive review, because each one looks fine in the
 * diff that introduces it and only misbehaves in combination with something
 * else. A validator that runs over the assembled whole is the only thing that
 * catches them.
 *
 * SEVERITY DECIDES WHAT BREAKS
 * ----------------------------
 * `error` means the data is internally inconsistent and something on screen
 * would be wrong or missing. The test suite fails on any of these, so they
 * cannot reach a build. `warning` means the data is coherent but weaker than it
 * should be — a source with no effective date, an assumption with no citation —
 * and is reported rather than enforced, because several are true of correctly
 * recorded research and making them fatal would force somebody to invent a date.
 *
 * The distinction is the whole design. A validator where everything is fatal
 * gets bypassed within a month.
 */

import { PEER_SUMMARIES } from './peerSummaries';
import { ASSUMPTIONS } from './assumptions';
import { DEPOSIT_PROTECTION } from './deposits';
import { CONFLICTS, OPEN_GATES } from './gates';
import { HEURISTICS } from './heuristics';
import { INFLATION_OBSERVATIONS } from './inflation';
import { PEER_DATASETS } from './peerDatasets';
import { RETIREMENT_SYSTEMS } from './retirement';
import { SOURCES } from './sources';
import { TAX_SCHEDULES } from './taxReference';
import {
  DATA_QUALITY_STATES,
  GEOGRAPHIC_SCOPES,
  REFERENCE_MARKETS,
  REVIEW_CADENCES,
  isReferenceMarket,
} from './types';

export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  readonly severity: IssueSeverity;
  /** Which record, by its own id, so a failure names the line to open. */
  readonly where: string;
  readonly message: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** ISO 4217 codes this layer is allowed to express money in. */
const CURRENCIES: readonly string[] = ['INR', 'AUD', 'USD', 'GBP', 'AED', 'SGD', 'CNY'];

function isValidDay(iso: string): boolean {
  if (!ISO_DATE.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  // Round-trips only when the components describe a real calendar day, which
  // rejects 2026-02-30 and 2026-13-01 that a regex alone would wave through.
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/** Chronological order, tolerating either side being absent. */
function notBefore(later: string | null, earlier: string | null): boolean {
  if (!later || !earlier) return true;
  return later >= earlier;
}

export function validateReference(): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (where: string, message: string) => issues.push({ severity: 'error', where, message });
  const warn = (where: string, message: string) => issues.push({ severity: 'warning', where, message });

  // ---- Sources -------------------------------------------------------------
  const sourceIds = new Set<string>();
  for (const s of SOURCES) {
    const at = `source ${s.id}`;
    if (sourceIds.has(s.id)) err(at, 'duplicate source id');
    sourceIds.add(s.id);

    if (!isReferenceMarket(s.market)) err(at, `unknown market ${s.market}`);
    if (!GEOGRAPHIC_SCOPES.includes(s.scope)) err(at, `unknown geographic scope ${s.scope}`);
    if (!REVIEW_CADENCES.includes(s.cadence)) err(at, `unknown review cadence ${s.cadence}`);
    if (s.tier < 1 || s.tier > 9 || !Number.isInteger(s.tier)) err(at, `tier ${s.tier} is outside 1-9`);

    // A citation a reader cannot open is not a citation. `http:` is refused
    // rather than upgraded: a government page served without TLS is a signal
    // worth surfacing, not a formatting detail to paper over.
    if (!s.url.startsWith('https://')) err(at, 'url must be an https link');

    if (!isValidDay(s.lastVerified)) err(at, `lastVerified "${s.lastVerified}" is not a real date`);
    if (!isValidDay(s.reviewDue)) err(at, `reviewDue "${s.reviewDue}" is not a real date`);
    if (s.effectiveDate !== null && !isValidDay(s.effectiveDate)) err(at, `effectiveDate "${s.effectiveDate}" is not a real date`);
    if (s.publicationDate !== null && !isValidDay(s.publicationDate)) err(at, `publicationDate "${s.publicationDate}" is not a real date`);
    if (!notBefore(s.reviewDue, s.lastVerified)) err(at, 'reviewDue falls before lastVerified');

    if (s.effectiveDate === null && s.publicationDate === null) {
      warn(at, 'neither an effective nor a publication date was established');
    }
    if (!s.verificationScope.trim()) err(at, 'verificationScope must say what was actually checked');
  }

  // ---- Deposit protection --------------------------------------------------
  const depositMarkets = new Set<string>();
  for (const d of DEPOSIT_PROTECTION) {
    const at = `deposit ${d.market}`;
    if (depositMarkets.has(d.market)) err(at, 'duplicate deposit record for market');
    depositMarkets.add(d.market);

    if (!CURRENCIES.includes(d.currency)) err(at, `unsupported currency ${d.currency}`);
    if (d.limit !== null && (!Number.isFinite(d.limit) || d.limit <= 0)) {
      err(at, `limit ${d.limit} is not a positive finite amount`);
    }
    // The single most important invariant in this layer: an unverified cap must
    // never be recorded as zero, because zero renders as a confident claim that
    // nothing is protected.
    if (d.limit === 0) err(at, 'a limit of 0 asserts that nothing is protected — use null');
    if (d.limit === null && d.quality !== 'NO_AUTHORITATIVE_DEFAULT') {
      err(at, 'a record with no limit must be NO_AUTHORITATIVE_DEFAULT');
    }
    if (d.limit !== null && d.quality === 'NO_AUTHORITATIVE_DEFAULT') {
      err(at, 'a record with a limit cannot be NO_AUTHORITATIVE_DEFAULT');
    }
    for (const id of d.sourceIds) if (!sourceIds.has(id)) err(at, `cites unknown source ${id}`);
    if (d.sourceIds.length === 0) err(at, 'a statutory limit must cite at least one source');
  }
  for (const m of REFERENCE_MARKETS) {
    if (!depositMarkets.has(m)) warn(`deposit ${m}`, 'no deposit-protection record for this market');
  }

  // ---- Inflation -----------------------------------------------------------
  for (const o of INFLATION_OBSERVATIONS) {
    const at = `inflation ${o.market}`;
    if (!Number.isFinite(o.observedYoY)) err(at, 'observedYoY is not a finite number');
    // Expressed as a percent, not a fraction. A 3.4 that should have been 0.034
    // is the classic unit error, and at this magnitude it is unmistakable.
    if (Math.abs(o.observedYoY) > 100) err(at, `observedYoY ${o.observedYoY} is implausible as a percentage`);
    if (o.observedYoY !== 0 && Math.abs(o.observedYoY) < 0.01) {
      warn(at, 'observedYoY looks like a fraction; this field is a percentage');
    }
    if (!/^\d{4}-(\d{2}|Q[1-4])$/.test(o.observationPeriod)) err(at, `observationPeriod "${o.observationPeriod}" is not YYYY-MM or YYYY-Qn`);
    if (!sourceIds.has(o.sourceId)) err(at, `cites unknown source ${o.sourceId}`);
    if (o.confirmedLatest && (o.quality === 'STALE' || o.quality === 'REVIEW_DUE')) {
      err(at, 'cannot be badged as the latest release while also stale or under review');
    }
  }

  // ---- Tax schedules -------------------------------------------------------
  const scheduleIds = new Set<string>();
  for (const s of TAX_SCHEDULES) {
    const at = `tax ${s.id}`;
    if (scheduleIds.has(s.id)) err(at, 'duplicate tax schedule id');
    scheduleIds.add(s.id);
    if (!CURRENCIES.includes(s.currency)) err(at, `unsupported currency ${s.currency}`);
    for (const id of s.sourceIds) if (!sourceIds.has(id)) err(at, `cites unknown source ${id}`);
    if (s.sourceIds.length === 0) err(at, 'a tax schedule must cite its source');

    if (s.bands.length === 0) {
      err(at, 'no bands');
    } else {
      if (s.bands[0].lowerInclusive !== 0) err(at, 'the first band must start at zero');
      const top = s.bands[s.bands.length - 1];
      if (top.upperExclusive !== null) err(at, 'the final band must be open-ended');
      s.bands.forEach((b, i) => {
        // Rates are decimal fractions everywhere in this layer. A 30 where 0.3
        // was meant would be a hundredfold error in anything that read it.
        if (!Number.isFinite(b.marginalRate) || b.marginalRate < 0 || b.marginalRate > 1) {
          err(at, `band ${i} rate ${b.marginalRate} is not a decimal fraction between 0 and 1`);
        }
        if (b.upperExclusive !== null && b.upperExclusive <= b.lowerInclusive) {
          err(at, `band ${i} has a non-positive width`);
        }
        // Contiguity. A gap means income in it is taxed at no rate at all, and
        // an overlap means it is taxed at two.
        const prev = s.bands[i - 1];
        if (prev && prev.upperExclusive !== b.lowerInclusive) {
          err(at, `band ${i} does not start where band ${i - 1} ends`);
        }
      });
    }
    // The invariant the whole tax policy rests on.
    if (s.automaticCalculationApproved !== false) err(at, 'automatic tax calculation is not approved in any market');
  }

  // ---- Assumptions ---------------------------------------------------------
  const assumptionIds = new Set<string>();
  for (const a of ASSUMPTIONS) {
    const at = `assumption ${a.id}`;
    if (assumptionIds.has(a.id)) err(at, 'duplicate assumption id');
    assumptionIds.add(a.id);

    if (!isReferenceMarket(a.market)) err(at, `unknown market ${a.market}`);
    if (!DATA_QUALITY_STATES.includes(a.quality)) err(at, `unknown data-quality state ${a.quality}`);
    if (!GEOGRAPHIC_SCOPES.includes(a.scope)) err(at, `unknown geographic scope ${a.scope}`);
    if (!isValidDay(a.lastVerified)) err(at, `lastVerified "${a.lastVerified}" is not a real date`);
    if (!isValidDay(a.reviewDue)) err(at, `reviewDue "${a.reviewDue}" is not a real date`);
    if (!notBefore(a.reviewDue, a.lastVerified)) err(at, 'reviewDue falls before lastVerified');
    for (const id of a.sourceIds) if (!sourceIds.has(id)) err(at, `cites unknown source ${id}`);

    if (typeof a.value === 'number' && !Number.isFinite(a.value)) err(at, 'value is not finite');

    // A missing value has to say why. "No value, no reason" is indistinguishable
    // from an oversight, and an oversight is what a reader will assume.
    if (a.quality === 'NO_AUTHORITATIVE_DEFAULT' && !a.reason) {
      err(at, 'NO_AUTHORITATIVE_DEFAULT requires a stated reason');
    }
    // A published value with no citation cannot be checked, which is the one
    // thing this layer exists to guarantee. Planning assumptions are exempt
    // because having no source is precisely what makes them assumptions.
    if (a.tier === 'REFERENCE' && a.sourceIds.length === 0 && a.value !== null) {
      err(at, 'a reference value must cite at least one source');
    }
    if (a.tier === 'ASSUMED' && a.sourceIds.length > 0) {
      err(at, 'a planning assumption must not claim a source — that is what makes it an assumption');
    }
    // Two safety interlocks. A statutory value the user may edit is not
    // statutory; a calculation-critical value with unmet preconditions would be
    // used in arithmetic it has not been cleared for.
    if (a.tier === 'REFERENCE' && a.userEditable && a.valueSource === 'REFERENCE_REGISTRY') {
      err(at, 'a published reference value must not be user-editable');
    }
    if (a.calculationCritical && a.activationBlockers.length > 0) {
      err(at, 'a calculation-critical value cannot have unmet activation blockers');
    }
  }

  // ---- Peer datasets -------------------------------------------------------
  const datasetIds = new Set<string>();
  for (const d of PEER_DATASETS) {
    const at = `dataset ${d.id}`;
    if (datasetIds.has(d.id)) err(at, 'duplicate dataset id');
    datasetIds.add(d.id);
    if (d.sourceId !== null && !sourceIds.has(d.sourceId)) err(at, `cites unknown source ${d.sourceId}`);
    if (!d.limitations.trim()) err(at, 'every dataset must state its limitations');
    if (!d.remainingWork.trim()) err(at, 'every dataset must state what remains before it can be used');
    // A gap record with a title would be a dataset somebody forgot to finish.
    if (d.title === null && d.sourceId !== null) err(at, 'a gap record cannot cite a source');
    if (d.percentileEnabled !== false || d.valuesIngested !== false) {
      err(at, 'no peer dataset has been cleared for ingestion or ranking');
    }
  }

  // ---- Retirement ----------------------------------------------------------
  for (const r of RETIREMENT_SYSTEMS) {
    const at = `retirement ${r.market}`;
    for (const id of r.sourceIds) if (!sourceIds.has(id)) err(at, `cites unknown source ${id}`);
    if (r.mustAsk.length === 0) err(at, 'must name what the user has to supply');
  }

  // ---- Heuristics ----------------------------------------------------------
  for (const h of HEURISTICS) {
    const at = `heuristic ${h.id}`;
    for (const id of h.sourceIds) if (!sourceIds.has(id)) err(at, `cites unknown source ${id}`);
    // The whole point of the classification: a rule of thumb with no support
    // must not carry a number, because a number is what makes it look like one.
    if (h.classification === 'UNSUPPORTED' && h.referenceValue !== null) {
      err(at, 'an unsupported rule of thumb must not carry a reference value');
    }
    if (h.classification === 'UNSUPPORTED' && h.usedInProduct !== 'NOT_USED') {
      err(at, 'an unsupported rule of thumb must not be used in the product');
    }
  }

  // ---- Gates and conflicts -------------------------------------------------
  const gateIds = new Set<string>();
  for (const g of OPEN_GATES) {
    const at = `gate ${g.id}`;
    if (gateIds.has(g.id)) err(at, 'duplicate gate id');
    gateIds.add(g.id);
    for (const id of g.sourceIds) if (!sourceIds.has(id)) err(at, `cites unknown source ${id}`);
    if (!g.productBehaviour.trim()) err(at, 'a gate must say what the product does today');
    if (!g.requiredToClose.trim()) err(at, 'a gate must say what would close it');
  }
  const conflictIds = new Set<string>();
  for (const c of CONFLICTS) {
    const at = `conflict ${c.id}`;
    if (conflictIds.has(c.id)) err(at, 'duplicate conflict id');
    conflictIds.add(c.id);
    for (const id of c.sourceIds) if (!sourceIds.has(id)) err(at, `cites unknown source ${id}`);
    if (!c.calculationImpact.trim()) err(at, 'a conflict must state its calculation impact');
  }

  const summaryIds = new Set<string>();
  for (const row of PEER_SUMMARIES) {
    const at = `peer summary ${row.id}`;
    if (summaryIds.has(row.id)) err(at, 'duplicate summary id');
    summaryIds.add(row.id);
    const source = SOURCES.find((s) => s.id === row.sourceId);
    if (!source || source.market !== row.market || source.url !== row.sourceUrl) err(at, 'source identity, market or URL mismatch');
    if (!Number.isFinite(row.value) || !CURRENCIES.includes(row.currency)) err(at, 'invalid value or currency');
    if (!isValidDay(row.lastVerified) || !row.period || !row.definition || !row.population || !row.locator || !row.attribution) err(at, 'summary provenance incomplete');
    if (!row.licenceUrl.startsWith('https://')) err(at, 'reuse terms must be linked');
  }
  return issues;
}

/** Errors only — the set a build is allowed to fail on. */
export function referenceErrors(): readonly ValidationIssue[] {
  return validateReference().filter((i) => i.severity === 'error');
}
