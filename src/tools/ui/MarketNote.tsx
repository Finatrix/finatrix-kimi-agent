import { Link } from 'react-router';
import type { MarketPack } from '../lib/markets';

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

  return (
    <aside
      className={className}
      aria-label="Where these figures come from"
      style={{
        margin: '18px 0 0',
        padding: '12px 14px',
        border: '1px solid var(--hair2)',
        borderRadius: 12,
        fontSize: 12,
        lineHeight: 1.7,
        color: 'var(--ink3)',
      }}
    >
      <div style={{ fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>
        <span aria-hidden="true">{market.flag}</span>{' '}
        Figures for {market.name} · reviewed {reviewed}
      </div>
      <div>
        {market.planningNote ? 'Published references and user-selected scenarios are shown separately. Sources:' : 'Indicative averages, not quotes — check the current rate before you commit. Sources:'}{' '}
        {market.sources.join('; ')}.
      </div>
      {market.planningNote && <p>{market.planningNote}</p>}
      <div style={{ marginTop: 6 }}>
        {/* Two different questions, so two links. "Not where you live" is a
            setting; "where does this come from" is the evidence, and the second
            has had nowhere to point until now. */}
        Not where you live?{' '}
        <Link to="/tools/settings" style={{ color: 'var(--accent-text)', textDecoration: 'underline' }}>
          Change your market
        </Link>
        {' · '}
        <Link to="/tools/reference" style={{ color: 'var(--accent-text)', textDecoration: 'underline' }}>
          See the published rules and sources
        </Link>
      </div>
    </aside>
  );
}
