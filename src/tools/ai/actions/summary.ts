/**
 * The sentence a card is announced with: the transcript's text for the turn,
 * and what voice reads aloud. Every figure in it is one the card shows,
 * formatted the same way.
 */
import { fmtExact, fmtForeign, fmtTripDay, type Trip } from '../../lib/trips';
import { priceExpense, type AssistantAction } from './plan';

export interface SummaryContext {
  /** Formats a home-currency amount as the screen does. */
  money: (n: number) => string;
  categoryLabel: (key: string, month: string) => string;
  trips: readonly Trip[];
  today: string;
}

function dayWords(ymd: string, today: string): string {
  if (ymd === today) return 'today';
  return fmtTripDay(ymd);
}

export function actionSummary(a: AssistantAction, ctx: SummaryContext): string {
  if (a.kind === 'open') return `Opening ${a.label}.`;
  if (a.kind === 'calc') {
    const lines = a.result.results.map((r) => `${r.label}: ${r.amount != null ? ctx.money(r.amount) : r.count}${r.perMonth ? ' a month' : ''}`);
    return `${a.label}. ${lines.join('. ')}. ${a.result.basis}`;
  }
  if (a.kind === 'budget') {
    return `Set your ${ctx.categoryLabel(a.category, a.month)} budget to ${ctx.money(a.amount)}? Check the card and tap Save.`;
  }
  const priced = priceExpense(a, ctx.trips);
  const amount = priced.ok && priced.inTripCurrency ? fmtForeign(a.typed, priced.currency) : fmtExact(a.typed, a.homeCurrency);
  const what = a.category ? ` for ${ctx.categoryLabel(a.category, a.date.slice(0, 7))}` : '';
  const next = a.category ? 'Check the card and tap Save.' : 'Choose a category on the card, then tap Save.';
  return `Log ${amount}${what}, ${dayWords(a.date, ctx.today)}? ${next}`;
}
