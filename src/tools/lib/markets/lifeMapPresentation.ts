import type { Decision } from '../lifemap';
import type { MarketPack } from './types';

// These legacy cards contain Indian statutory benefits or fixed INR price/
// income assumptions. They are not eligible decisions in the three new packs.
const LOCAL_ONLY = new Set(['nps', 'elss', 'buy_home', 'buy_car_loan', 'buy_car_cash', 'upskill', 'sidehustle', 'fno']);

/** Select eligible scenarios and change copy only; no numeric effect is edited. */
export function lifeMapDecisionsForMarket(decisions: Decision[], market: MarketPack): Decision[] {
  if (!market.planningNote) return decisions;
  return decisions.filter((d) => !LOCAL_ONLY.has(d.id)).map((d) => ({
    ...d,
    t: d.t.replaceAll('SIP', 'monthly contribution').replaceAll('EMI', 'loan payment').replace('big-fat wedding', 'large wedding'),
    s: d.id === 'start_sip' || d.id === 'boost_sip'
      ? 'An illustrative contribution amount. Edit it to reflect your own plan; no investment product is selected.'
      : 'Illustrative model scenario. Its effect uses the existing simulation assumptions, not a local price, tax benefit or forecast.',
    imp: `Modeled effect: ${d.imp}`,
  }));
}
