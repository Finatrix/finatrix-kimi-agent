/**
 * What the user actually said, and the numbers in it.
 *
 * The action model copies spans out of the user's message. It is never trusted
 * to produce a number: every span is checked against the message here, and the
 * app reads the number out of it with its own parser. A span the user did not
 * say is refused, so a model that invents "₹5,000" gets nowhere.
 *
 * Pure: no storage, no React.
 */
import { asciiDigits } from '../validate';
import { CURRENCY_CODES, currencySym } from '../../lib/format';

/** Lower case, 0–9 digits, one space between words, no thousands commas. */
export function normalizeSpoken(text: string): string {
  return asciiDigits(String(text ?? ''))
    .normalize('NFKC')
    .toLowerCase()
    .replace(/(\d),(?=\d)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True when `span` is something the user said: it appears in `utterance`, and
 * a number in it is not part of a longer number ("450" does not match "4500",
 * and "4.5k" does not match "14.5k").
 */
export function saidInMessage(span: string, utterance: string): boolean {
  const s = normalizeSpoken(span);
  if (!s) return false;
  const u = normalizeSpoken(utterance);
  const re = new RegExp(`(?<![\\d.])${escapeRe(s)}(?![\\d])`);
  return re.test(u);
}

/** How many times the user said this span: a plan may use a span at most that often. */
export function timesSaid(span: string, utterance: string): number {
  const s = normalizeSpoken(span);
  if (!s) return 0;
  const u = normalizeSpoken(utterance);
  return u.match(new RegExp(`(?<![\\d.])${escapeRe(s)}(?![\\d])`, 'g'))?.length ?? 0;
}

/** Spoken size words, as the multiplier the user meant. Never a guess: an unknown word fails. */
const SCALE: Readonly<Record<string, number>> = {
  k: 1_000, thousand: 1_000, hazar: 1_000, hazaar: 1_000, 'हज़ार': 1_000, 'हजार': 1_000,
  l: 100_000, lakh: 100_000, lakhs: 100_000, lac: 100_000, lacs: 100_000, 'लाख': 100_000,
  cr: 10_000_000, crore: 10_000_000, crores: 10_000_000, 'करोड़': 10_000_000,
  m: 1_000_000, mn: 1_000_000, million: 1_000_000,
};

/** Words and symbols that may sit around a spoken amount and carry no value. */
const NOISE = /(?:rs\.?|inr|rupees?|₹|\$|€|£|¥|aed|usd|eur|gbp|dirhams?|dollars?|euros?|pounds?|रुपये|रुपए|रुपया)/g;

/**
 * The amount in a span the user said: "₹450" → 450, "8k" → 8000,
 * "1.5 lakh" → 150000, "2,50,000" → 250000.
 *
 * Exactly one number, optionally followed by one scale word. Anything else
 * (two numbers, a sum, a word it does not know) is null, and the card asks
 * instead of guessing. A scale word is the user's own unit, so reading
 * "8k" as 8,000 is reading what they said, not working something out.
 */
export function parseSpokenAmount(span: string): number | null {
  const text = normalizeSpoken(span).replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
  const m = /^(\d+(?:\.\d+)?)\s*([^\d\s.]+)?$/.exec(text);
  if (!m) return null;
  const base = Number(m[1]);
  const scale = m[2] ? SCALE[m[2]] : 1;
  if (!scale || !Number.isFinite(base)) return null;
  // Rounded to paise/cents: 1.5 × 100000 is exact, but 0.07 × 1000 is not in
  // binary, and a ledger should not hold 70.00000000000001.
  const value = Math.round(base * scale * 100) / 100;
  return value > 0 && value <= 1e12 ? value : null;
}

/** A whole number of years or months the user said: "15", "15 years" → 15. */
export function parseSpokenCount(span: string): number | null {
  const text = normalizeSpoken(span);
  const m = /^(\d{1,3})(?:\s*[^\d\s]+)?$/.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * The words a person uses for a currency, beyond its code and symbol. Only the
 * currencies a trip is likely to be in; any other is still recognised by its
 * code ("50 SGD") or symbol.
 */
const CURRENCY_WORDS: Readonly<Record<string, readonly string[]>> = {
  INR: ['rupee', 'rupees', 'rs', 'रुपये', 'रुपए'],
  AED: ['dirham', 'dirhams'],
  USD: ['dollar', 'dollars', 'bucks'],
  EUR: ['euro', 'euros'],
  GBP: ['pound', 'pounds', 'quid'],
  THB: ['baht'],
  SGD: ['singapore dollar', 'singapore dollars'],
  MYR: ['ringgit'],
  JPY: ['yen'],
  CNY: ['yuan', 'rmb', 'renminbi'],
  LKR: ['sri lankan rupee', 'sri lankan rupees'],
  NPR: ['nepali rupee', 'nepali rupees'],
  IDR: ['rupiah'],
  VND: ['dong'],
  SAR: ['riyal', 'riyals'],
  QAR: ['qatari riyal', 'qatari riyals'],
  CHF: ['franc', 'francs'],
  AUD: ['australian dollar', 'australian dollars'],
  CAD: ['canadian dollar', 'canadian dollars'],
  KRW: ['won'],
  TRY: ['lira'],
  ZAR: ['rand'],
};

/**
 * True when the user named `code` in `utterance`: by its code, its own symbol
 * or a word for it. The model may pick a currency, but only one the user said.
 */
export function namedCurrency(code: string, utterance: string): boolean {
  const c = String(code ?? '').toUpperCase();
  if (!CURRENCY_CODES.includes(c)) return false;
  const u = normalizeSpoken(utterance);
  const words = [c.toLowerCase(), ...(CURRENCY_WORDS[c] ?? [])];
  if (words.some((w) => new RegExp(`(?<![\\p{L}])${escapeRe(w)}(?![\\p{L}])`, 'u').test(u))) return true;
  const sym = currencySym(c);
  // A bare "$" is every dollar; it names USD only, and only when it is not
  // also another currency's prefix ("S$", "A$") in the message.
  if (!sym || /^[A-Za-z]+$/.test(sym)) return false;
  if (sym === '$') return c === 'USD' && /(?<![a-z])\$/.test(u);
  return u.includes(sym.toLowerCase());
}
