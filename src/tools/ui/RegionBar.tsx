import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router';
import { useMarket } from '../MarketContext';
import { useCurrency } from '../CurrencyContext';
import { MARKET_LIST, type MarketId } from '../lib/markets';
import { CURRENCY_CODES, currencySym } from '../lib/format';
import { store } from '../lib/storage';
import { hasAnyData } from '../lib/settings';

/**
 * Country and currency, on the tool itself.
 *
 * ParkSmart, InvestMatch and PeerCompare are the three tools whose answers
 * change with the country — different instruments, tax shapes and benchmarks —
 * yet the only control for it lived three screens away in Settings. Someone
 * living abroad saw another country's rules with no hint where to fix them.
 *
 * Choosing a country here brings its currency with it, because that is what
 * the person asked for by choosing it, and the currency stays a visible,
 * independent control right beside it for the reader who keeps accounts in a
 * different one. Nothing is converted: the tools' packs are quoted in the
 * market's own currency, and the mismatch notice still says so if the two are
 * split on purpose.
 */
export function RegionBar() {
  const { id, market, setMarket, detected } = useMarket();
  const { code, setCode } = useCurrency();
  const uid = useId();
  const [status, setStatus] = useState('');

  // A first-time visitor who has never picked a currency and has no saved data
  // reads amounts in their detected country's currency straight away. Anyone
  // with data is left alone: silently relabelling their numbers would be wrong.
  useEffect(() => {
    if (detected && store.raw('fx_currency') == null && !hasAnyData() && code !== market.currency) {
      setCode(market.currency);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseCountry = (next: MarketId) => {
    const pack = MARKET_LIST.find((m) => m.id === next);
    if (!pack) return;
    setMarket(next);
    setCode(pack.currency);
    setStatus(`Country set to ${pack.name}. Amounts now use ${pack.currency}.`);
  };

  return (
    <section className="fx-region" aria-label="Country and currency">
      <div className="fx-region-row">
        <div className="fx-region-field">
          <label className="fl" htmlFor={`${uid}-country`}>Your country</label>
          <select
            id={`${uid}-country`}
            className="fs"
            value={id}
            onChange={(e) => chooseCountry(e.target.value as MarketId)}
          >
            {MARKET_LIST.map((m) => (
              <option key={m.id} value={m.id}>{m.flag} {m.name}</option>
            ))}
          </select>
        </div>
        <div className="fx-region-field">
          <label className="fl" htmlFor={`${uid}-currency`}>Currency</label>
          <select
            id={`${uid}-currency`}
            className="fs"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setStatus(`Currency set to ${e.target.value}.`);
            }}
          >
            {CURRENCY_CODES.map((c) => (
              <option key={c} value={c}>{currencySym(c).trim()} {c}{c === market.currency ? ` · ${market.name}` : ''}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="note fx-region-hint">
        {detected
          ? `We picked ${market.name} from your device settings. Change it if that is wrong.`
          : `Rules, instruments and benchmarks for ${market.name}.`}{' '}
        Choosing a country sets its currency; nothing is converted.{' '}
        Not listed? Pick the closest and set your own currency, or see the{' '}
        <Link to="/tools/reference">reference data</Link>.
      </p>
      <p className="fx-region-status" aria-live="polite">{status}</p>
    </section>
  );
}
