import { Link } from 'react-router';
import type { MarketPack } from '../lib/markets';
import { useMarket } from '../MarketContext';
import { useCurrency } from '../CurrencyContext';

/**
 * Where a tool's numbers come from, and when they were last checked.
 *
 * Rendered under any tool whose output depends on market data — rates,
 * allocations, peer benchmarks. It exists because those figures are claims about
 * the world that a reader has every right to audit, and until now the product
 * made them without saying so: "Liquid mutual fund 7.0%" with no date attached
 * is a number nobody can check and nobody should fully trust.
 *
 * It is also the escape hatch. Someone shown Indian instruments who does not
 * live in India needs a visible way out, and one sentence into Settings beats
 * discovering the setting by accident three screens away.
 */
export function MarketNote({ market, className }: { market: MarketPack; className?: string }) {
  const [year, month] = market.asOf.split('-');
  const reviewed = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('en', {
    month: 'long',
    year: 'numeric',
  });

  // One strip per tool page. It used to be followed by a "Built with care · Not
  // financial advice" line, the educational row and the shell's own
  // "assumptions reviewed" line — the same message four times. The statements
  // are all still here; the sources sit behind one disclosure, and the shell
  // hides its duplicate line when this strip is on the page (tools.css).
  return (
    <aside
      className={`fx-market-note${className ? ` ${className}` : ''}`}
      aria-label="Where these figures come from"
    >
      <div className="fx-market-note-head">
        <span aria-hidden="true">{market.flag}</span>{' '}
        Figures for {market.name} · reviewed {reviewed}
      </div>
      <div>
        {market.planningNote
          ? 'Published references and user-selected scenarios are shown separately.'
          : 'Indicative averages, not quotes — check the current rate before you commit.'}{' '}
        Educational tool, not financial advice.
      </div>
      {market.planningNote && <p>{market.planningNote}</p>}
      <details>
        <summary>Sources and how to change market</summary>
        <div>{market.sources.join('; ')}.</div>
        <div style={{ marginTop: 6 }}>
          {/* Two different questions, so two links. "Not where you live" is a
              setting; "where does this come from" is the evidence. */}
          Not where you live?{' '}
          <Link to="/tools/settings">Change your market</Link>
          {' · '}
          <Link to="/tools/reference">See the published rules and sources</Link>
          {' · '}
          <Link to="/editorial-standards">How we review</Link>
        </div>
      </details>
    </aside>
  );
}

/**
 * Says so when the market's rules and the display currency are different.
 *
 * The two are stored separately on purpose (lib/markets), but nothing on the
 * page admitted it: with UK rules and ₹ selected, ParkSmart offered rupee
 * amounts beside a "£1,000" allowance and Goals a "£1 Million" preset above ₹
 * fields. This only labels what is already true — it converts nothing.
 */
export function MarketCurrencyNotice() {
  const { market } = useMarket();
  const currency = useCurrency();
  if (currency.code === market.currency) return null;
  return (
    <aside className="fx-market-mismatch" aria-label="Market and currency differ">
      <p>
        <b>Rules are for {market.name}; your amounts are in {currency.code}.</b>{' '}
        Allowances, limits and presets are quoted in {market.currency} and are not converted.
      </p>
      <div className="fx-market-mismatch-actions">
        <button type="button" className="btn btn-sm" onClick={() => currency.setCode(market.currency)}>
          Show amounts in {market.currency}
        </button>
        <Link to="/tools/settings">Change market</Link>
      </div>
    </aside>
  );
}
