/** Published facts and unresolved rules for all seven supported markets.
 * Tool availability is separate from permission to infer tax, pension or
 * statistical ranks. The page selector never changes the saved tool market.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  DISCLAIMERS,
  MARKET_FLAGS,
  MARKET_NAMES,
  REFERENCE_AS_OF,
  REFERENCE_MARKETS,
  depositProtectionFor,
  evaluateFreshness,
  gatesForMarket,
  inflationFor,
  peerDatasetsFor,
  periodLabel,
  retirementFor,
  sourcesByIds,
  taxPolicyFor,
  taxSchedulesFor,
  verifiedLabel,
  type ReferenceMarket,
  type ReferenceSource,
} from '../../reference';
import { MARKET_IDS } from '../lib/markets/types';
import { useOptionalMarket } from '../MarketContext';
import { PageHead, ToolFoot } from '../ui/common';
import { ReferenceFinder } from '../ui/ReferenceFinder';

/** Markets the tools are localised for, as a lookup. */
const IN_PRODUCT = new Set<string>(MARKET_IDS);

/** `120000` + `'GBP'` → `£120,000`, in the currency the rule is written in. */
function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
}

function Sources({ ids }: { ids: readonly string[] }) {
  const sources: readonly ReferenceSource[] = sourcesByIds(ids);
  if (sources.length === 0) return null;
  return (
    <ul className="fx-ref-sources">
      {sources.map((s) => (
        <li key={s.id}>
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="fx-method-link">
            {s.authority} — {s.title}
          </a>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card fx-refpage-section" aria-labelledby={`ref-${title.replace(/\W+/g, '-').toLowerCase()}`}>
      <h2 id={`ref-${title.replace(/\W+/g, '-').toLowerCase()}`} className="fx-refpage-h2">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** "Available in the tools" / "Reference data only", with what that means. */
function MarketStatus({ market }: { market: ReferenceMarket }) {
  return <div className="fx-refpage-status" data-available={IN_PRODUCT.has(market)}>
    <span className="fx-refpage-status-tag">Available in the tools</span>
    <p className="note">Select {MARKET_NAMES[market]} in <Link to="/tools/settings" className="fx-method-link">Settings</Link>.
      {' '}Australia, Singapore and Mainland China use your entered net rates in ParkSmart and dated official summaries in PeerCompare.
      Tax and statutory retirement calculations remain outside the tools’ scope.</p>
  </div>;
}

function DepositSection({ market }: { market: ReferenceMarket }) {
  const record = depositProtectionFor(market);
  if (!record) return null;
  const freshness = evaluateFreshness(record);

  return (
    <Section title="Deposit protection">
      <div className="fx-refpage-headline">
        <span className="fx-refpage-authority">{record.authority}</span>
        <span className="fx-refpage-figure">
          {record.limit === null ? 'Not verified' : money(record.limit, record.currency)}
        </span>
      </div>

      {record.limit === null ? (
        <p className="note fx-refpage-absent">
          No operative retail guarantee scheme was verified for this market. That is a gap in the
          evidence, not a finding that deposits here are unprotected — and it is why no figure is
          shown rather than a zero.
        </p>
      ) : (
        <p className="note">{record.aggregation}</p>
      )}

      <dl className="fx-method-rows">
        <div>
          <dt>Eligible</dt>
          <dd>{record.eligible}</dd>
        </div>
        <div>
          <dt>Excluded</dt>
          <dd>{record.exclusions}</dd>
        </div>
        <div>
          <dt>Joint accounts</dt>
          <dd>{record.jointAccounts ?? 'Not settled by the source text — confirm with the authority.'}</dd>
        </div>
        {record.effectiveDate && (
          <div>
            <dt>Applies from</dt>
            <dd>{verifiedLabel(record.effectiveDate)}</dd>
          </div>
        )}
        <div>
          <dt>Last reviewed</dt>
          <dd>
            {verifiedLabel(record.lastVerified)}
            {freshness.showsWarning ? ' · due for review' : ''}
          </dd>
        </div>
      </dl>

      <p className="note fx-refpage-fine">{record.applicability}</p>
      <Sources ids={record.sourceIds} />
    </Section>
  );
}

function InflationSection({ market }: { market: ReferenceMarket }) {
  const cpi = inflationFor(market);
  if (!cpi) return null;
  const freshness = evaluateFreshness(cpi);

  return (
    <Section title="Published inflation">
      <div className="fx-refpage-headline">
        <span className="fx-refpage-authority">{cpi.measure}</span>
        <span className="fx-refpage-figure">{cpi.observedYoY}%</span>
      </div>
      <p className="note">
        Year on year for {periodLabel(cpi.observationPeriod)}.{' '}
        {cpi.confirmedLatest
          ? 'This was the most recent verified release.'
          : 'A newer release may exist and has not been verified, so this is not badged as the latest.'}
      </p>
      <p className="note fx-refpage-fine">
        {cpi.notes} This is an observation, not a planning rate: the Goal Planner and LifeMap use a
        separate long-run assumption, because one month&rsquo;s reading is far too volatile to plan a
        decade against.
      </p>
      <dl className="fx-method-rows">
        <div>
          <dt>Last reviewed</dt>
          <dd>
            {verifiedLabel(cpi.lastVerified)}
            {freshness.showsWarning ? ` · ${freshness.state === 'STALE' ? 'may be out of date' : 'due for review'}` : ''}
          </dd>
        </div>
      </dl>
      <Sources ids={[cpi.sourceId]} />
    </Section>
  );
}

function TaxSection({ market }: { market: ReferenceMarket }) {
  const schedules = taxSchedulesFor(market);
  const totalTax = taxPolicyFor(market, 'TOTAL_PERSONAL_TAX');
  const payroll = taxPolicyFor(market, 'PAYROLL_AND_SOCIAL');

  return (
    <Section title="Income tax">
      <p className="note">
        FinatriX does not work out a tax liability in any market, and is not becoming
        tax-preparation software. {totalTax.why} Where a tool needs a tax figure it asks you for
        your marginal rate, or for the income that actually reaches your account.
      </p>
      {payroll.regionSpecific && (
        <p className="note fx-refpage-absent">{payroll.why}</p>
      )}

      {schedules.length === 0 ? (
        <p className="note fx-refpage-fine">
          No ordinary-income rate schedule is recorded for this market.
        </p>
      ) : (
        schedules.map((s) => (
          <div key={s.id} className="fx-refpage-schedule">
            <h3 className="fx-refpage-h3">{s.period}</h3>
            <p className="note">Applied to: {s.incomeBasis.toLowerCase()}.</p>
            {/* The scroll box is the wrapper, not the table. `display:block` on a
                table makes its rows generate an anonymous table that shrinks to
                fit, so a two-column band list collapsed to a third of the width
                it had. A real table inside an overflow container keeps the
                layout algorithm and still refuses to widen the page. */}
            <div className="fx-refpage-tablewrap">
            <table className="fx-refpage-table">
              <caption className="fx-refpage-caption">
                Marginal rates for {s.period}. One component of a tax position, not the position.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Income band</th>
                  <th scope="col">Rate</th>
                </tr>
              </thead>
              <tbody>
                {s.bands.map((b) => (
                  <tr key={b.lowerInclusive}>
                    <th scope="row">
                      {b.upperExclusive === null
                        ? `${money(b.lowerInclusive, s.currency)} and above`
                        : `${money(b.lowerInclusive, s.currency)} – ${money(b.upperExclusive, s.currency)}`}
                    </th>
                    <td>{(b.marginalRate * 100).toFixed(b.marginalRate * 100 % 1 === 0 ? 0 : 1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <p className="note fx-refpage-fine">{s.applicability}</p>
            <p className="note fx-refpage-fine">
              <b>Not included:</b> {s.excluded}
            </p>
            <Sources ids={s.sourceIds} />
          </div>
        ))
      )}
    </Section>
  );
}

function RetirementSection({ market }: { market: ReferenceMarket }) {
  const record = retirementFor(market);
  if (!record) return null;

  return (
    <Section title="Retirement">
      <p className="note">
        <b>{record.schemes.join(' · ')}</b>
      </p>
      <p className="note">{record.modelling}</p>
      <h3 className="fx-refpage-h3">What you would have to supply</h3>
      <ul className="fx-refpage-list">
        {record.mustAsk.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
      <h3 className="fx-refpage-h3">What FinatriX does not model</h3>
      <p className="note fx-refpage-fine">{record.notModelled}</p>
      <Sources ids={record.sourceIds} />
    </Section>
  );
}

function PeerSection({ market }: { market: ReferenceMarket }) {
  const datasets = peerDatasetsFor(market);
  if (datasets.length === 0) return null;

  return (
    <Section title="Peer statistics">
      <p className="note">
        PeerCompare uses published summaries for Australia, Singapore and Mainland China, and existing modeled grids for the other four markets. None of
        the published surveys below has been cleared to produce a percentile — a median tells you
        which side of the middle you are on and cannot place you in a distribution, and no two of
        these count the same unit.
      </p>
      {datasets.map((d) => (
        <div key={d.id} className="fx-refpage-dataset">
          <div className="fx-refpage-headline">
            <span className="fx-refpage-authority">
              {d.title ?? `No usable ${d.measure.toLowerCase()} distribution found`}
            </span>
            {d.observationPeriod && <span className="fx-refpage-period">{d.observationPeriod}</span>}
          </div>
          <p className="note fx-refpage-fine">{d.limitations}</p>
          <p className="note fx-refpage-fine">
            <b>Before it could be used:</b> {d.remainingWork}
          </p>
          {d.sourceId && <Sources ids={[d.sourceId]} />}
        </div>
      ))}
    </Section>
  );
}

function GatesSection({ market }: { market: ReferenceMarket }) {
  const gates = gatesForMarket(market);
  if (gates.length === 0) return null;

  return (
    <Section title="What is deliberately switched off">
      <p className="note">
        Each of these is a feature FinatriX could plausibly offer and does not, because the evidence
        does not support it yet. Written down so an empty space reads as a decision rather than an
        oversight.
      </p>
      {gates.map((g) => (
        <div key={g.id} className="fx-refpage-gate">
          <h3 className="fx-refpage-h3">
            {g.area}
            {g.market === null && <span className="fx-refpage-scope"> · every market</span>}
          </h3>
          <p className="note">{g.productBehaviour}</p>
          <p className="note fx-refpage-fine">
            <b>Would take:</b> {g.requiredToClose}
          </p>
        </div>
      ))}
    </Section>
  );
}

export default function ReferencePage() {
  const active = useOptionalMarket();
  // Local state, never the global market setting. Reading Australia's deposit
  // cap must not switch the user's calculators to a market the calculators do
  // not have — and Australia cannot be set as a tool market at all.
  const [selected, setSelected] = useState<ReferenceMarket>(() => active?.id ?? 'IN');
  const [topic, setTopic] = useState('all');
  const name = useMemo(() => MARKET_NAMES[selected], [selected]);

  return (
    <div className="fx-page fx-refpage">
      <PageHead
        chip="Reference data"
        chipColor="var(--blue)"
        chipBg="color-mix(in srgb, var(--blue) 10%, transparent)"
        icon="bills"
        title="Where the numbers come from."
      >
        The published rules and statistics behind FinatriX&rsquo;s market-specific answers, with the
        date each one took effect, the date it was last checked, and the gaps we have not filled.
        Researched across {REFERENCE_MARKETS.length} markets as at {verifiedLabel(REFERENCE_AS_OF)}.
      </PageHead>

      <div className="card fx-refpage-picker">
        <label htmlFor="ref-market" className="fx-refpage-label">
          Market
        </label>
        <select
          id="ref-market"
          /* `fs` is the form-select class the Settings market picker uses —
             full width, 48px tall, with the shared chevron. `sel` is an
             option-card modifier and styles nothing here, which left this
             control at the browser default and 1px under the WCAG 2.2
             pointer-target minimum. */
          className="fs"
          value={selected}
          onChange={(e) => setSelected(e.target.value as ReferenceMarket)}
        >
          {REFERENCE_MARKETS.map((m) => (
            <option key={m} value={m}>
              {MARKET_FLAGS[m]} {MARKET_NAMES[m]}
              {IN_PRODUCT.has(m) ? '' : ' — reference only'}
            </option>
          ))}
        </select>
        <p className="note fx-refpage-picker-note">
          Choosing here only changes what this page shows. Your tools stay on the market you set in{' '}
          <Link to="/tools/settings" className="fx-method-link">
            Settings
          </Link>
          .
        </p>
      </div>

      <h2 className="fx-refpage-market">
        <span aria-hidden="true">{MARKET_FLAGS[selected]}</span> {name}
      </h2>
      <MarketStatus market={selected} />

      <ReferenceFinder market={selected} />
      <div className="card">
        <label className="fl" htmlFor="reference-topic">Focus on a topic</label>
        <select className="fs" id="reference-topic" value={topic} onChange={event => setTopic(event.target.value)}>
          <option value="all">All reference topics</option><option value="deposit">Deposit protection</option><option value="inflation">Published inflation</option><option value="tax">Income tax</option><option value="retirement">Retirement</option><option value="peer">Peer statistics</option><option value="gates">Evidence gaps</option>
        </select>
      </div>
      {(topic === 'all' || topic === 'deposit') && <DepositSection market={selected} />}
      {(topic === 'all' || topic === 'inflation') && <InflationSection market={selected} />}
      {(topic === 'all' || topic === 'tax') && <TaxSection market={selected} />}
      {(topic === 'all' || topic === 'retirement') && <RetirementSection market={selected} />}
      {(topic === 'all' || topic === 'peer') && <PeerSection market={selected} />}
      {(topic === 'all' || topic === 'gates') && <GatesSection market={selected} />}

      <p className="note fx-refpage-fine">
        {DISCLAIMERS.FOOTER} Every figure here was extracted from the source linked beside it on{' '}
        {verifiedLabel(REFERENCE_AS_OF)} and is maintained by hand — check the authority before
        acting on any of it.{' '}
        <Link to="/editorial-standards" className="fx-method-link">
          How we check our work
        </Link>
        .
      </p>

      <ToolFoot>
        Built with care by <b>FinatriX</b> · Not financial advice
      </ToolFoot>
    </div>
  );
}
