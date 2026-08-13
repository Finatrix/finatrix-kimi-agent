/**
 * Natural-language quick add — "340 lunch yesterday upi" becomes a transaction.
 *
 * WHY
 * ---
 * Logging a spend is the one action a tracker asks for every single day, and
 * the structured form costs four interactions (amount, category, note, submit).
 * The fastest possible entry is one line of the words someone would have used
 * anyway. Everything this parser finds is still shown back before it is saved —
 * it fills the form, it does not bypass it — so a wrong guess is corrected in
 * place rather than discovered later in the ledger.
 *
 * CONTRACT
 * --------
 * Pure and total: any string parses. Anything not understood is left in the
 * note rather than dropped, because silently discarding a word the user typed
 * is how a "smart" input loses trust. The amount is the only required part; a
 * parse with no amount is simply `ok: false` and the form stays as it was.
 *
 * NOT a calculation change: this only fills fields the user could have typed
 * by hand. Amount parsing defers to `evaluateFormula`, the same evaluator the
 * amount input already uses, so "120/4" means the same thing in both places.
 */
import { ymdLocal } from '../../lib/date';
import { evaluateFormula } from './formula';
import { PAYMENT_METHODS } from './expense';

export interface QuickAddResult {
  ok: boolean;
  /** Signed amount. 0 when nothing parseable was found. */
  amount: number;
  /** Category key, when one was recognised confidently. */
  category?: string;
  /** Local `YYYY-MM-DD`. Always set — defaults to today. */
  date: string;
  /** Whatever was left after the understood parts were removed. */
  note: string;
  /** One of PAYMENT_METHODS, when named. */
  paymentMethod?: string;
  /** Tags written as #hashtags. */
  tags?: string[];
  /** Human-readable account of what was understood, for the preview. */
  parts: string[];
}

/**
 * Words that name a payment method, mapped to the canonical label.
 *
 * Written as an alias table rather than a fuzzy match: "card" must not become
 * "Credit card" when the user might have meant debit, so ambiguous words map
 * to nothing and the structured field is simply left for the user.
 */
const PAYMENT_ALIASES: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI', gpay: 'UPI', googlepay: 'UPI', phonepe: 'UPI', paytm: 'UPI', bhim: 'UPI',
  credit: 'Credit card', creditcard: 'Credit card', cc: 'Credit card',
  debit: 'Debit card', debitcard: 'Debit card',
  netbanking: 'Bank transfer', neft: 'Bank transfer', imps: 'Bank transfer',
  rtgs: 'Bank transfer', transfer: 'Bank transfer', bank: 'Bank transfer',
  wallet: 'Wallet', cheque: 'Cheque', check: 'Cheque',
};

/**
 * Keywords that suggest a category, by canonical Budget Builder key.
 *
 * Deliberately conservative and India-first. A word only appears here when it
 * names the spend rather than merely co-occurring with it — "office" is not
 * transport even though commutes go there.
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  eating_out: ['lunch', 'dinner', 'breakfast', 'brunch', 'coffee', 'chai', 'tea', 'restaurant',
    'cafe', 'swiggy', 'zomato', 'pizza', 'burger', 'snack', 'takeaway', 'dining'],
  groceries: ['groceries', 'grocery', 'vegetables', 'veggies', 'supermarket', 'bigbasket',
    'blinkit', 'zepto', 'dmart', 'kirana', 'milk', 'ration'],
  transport: ['uber', 'ola', 'taxi', 'cab', 'auto', 'rickshaw', 'metro', 'bus', 'train',
    'petrol', 'diesel', 'fuel', 'parking', 'toll', 'rapido'],
  rent: ['rent', 'landlord', 'maintenance'],
  utilities: ['electricity', 'water', 'gas', 'bill', 'bills', 'broadband', 'wifi', 'internet'],
  medical: ['doctor', 'medicine', 'medicines', 'pharmacy', 'hospital', 'clinic', 'dentist', 'chemist'],
  shopping: ['clothes', 'shirt', 'shoes', 'amazon', 'flipkart', 'myntra', 'shopping'],
  subscriptions: ['netflix', 'spotify', 'prime', 'subscription', 'hotstar', 'youtube', 'icloud'],
  entertainment: ['movie', 'cinema', 'concert', 'game', 'games', 'pvr'],
  personal_care: ['salon', 'haircut', 'spa', 'gym', 'grooming'],
  travel: ['flight', 'hotel', 'trip', 'holiday', 'airbnb', 'vacation'],
  phone: ['recharge', 'mobile', 'airtel', 'jio', 'vodafone'],
  gifts: ['gift', 'gifts', 'donation', 'charity'],
};

/** Weekday names → JS day index, for "last friday" / "on monday". */
const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, thursday: 4, thu: 4, thurs: 4, friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

/** Strip a token to comparable letters. */
function norm(token: string): string {
  return token.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * The most recent occurrence of a weekday, today included.
 *
 * "Friday" said on a Friday means today, not a week ago — the reading a person
 * intends when logging something they just paid for.
 */
function lastWeekday(now: Date, target: number): Date {
  const d = new Date(now);
  const diff = (d.getDay() - target + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

interface DateHit { date: Date; consumed: number }

/** Resolve a relative date phrase starting at `i`, or null. */
function matchDate(tokens: string[], i: number, now: Date): DateHit | null {
  const a = norm(tokens[i]);
  const b = i + 1 < tokens.length ? norm(tokens[i + 1]) : '';

  if (a === 'today') return { date: new Date(now), consumed: 1 };
  if (a === 'yesterday' || a === 'yday') {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return { date: d, consumed: 1 };
  }
  // "2 days ago" / "3 weeks ago"
  const n = Number(a);
  if (Number.isFinite(n) && n > 0 && (b === 'days' || b === 'day' || b === 'weeks' || b === 'week')) {
    const ago = i + 2 < tokens.length ? norm(tokens[i + 2]) : '';
    if (ago === 'ago') {
      const d = new Date(now);
      d.setDate(d.getDate() - n * (b.startsWith('week') ? 7 : 1));
      return { date: d, consumed: 3 };
    }
  }
  // "last friday" — same day as a bare weekday, but consumes the qualifier.
  if ((a === 'last' || a === 'on') && b in WEEKDAYS) {
    return { date: lastWeekday(now, WEEKDAYS[b]), consumed: 2 };
  }
  if (a in WEEKDAYS) return { date: lastWeekday(now, WEEKDAYS[a]), consumed: 1 };

  // An explicit ISO day, which is what the date field itself round-trips.
  if (/^\d{4}-\d{2}-\d{2}$/.test(tokens[i])) {
    const d = new Date(tokens[i] + 'T00:00:00');
    if (!isNaN(d.getTime())) return { date: d, consumed: 1 };
  }
  return null;
}

/**
 * Parse one line into the fields of a transaction.
 *
 * `validKeys` is the user's live category set: a keyword only wins when the
 * category it names actually exists for this user, so the guess can never
 * point at a category they have archived or never had.
 */
export function parseQuickAdd(
  input: string,
  now: Date,
  validKeys: ReadonlySet<string> = new Set(),
): QuickAddResult {
  const text = input.trim();
  const fallback: QuickAddResult = {
    ok: false, amount: 0, date: ymdLocal(now), note: '', parts: [],
  };
  if (!text) return fallback;

  const tokens = text.split(/\s+/);
  const leftovers: string[] = [];
  const tags: string[] = [];
  const parts: string[] = [];

  let amount = 0;
  let amountFound = false;
  let date = new Date(now);
  let dateFound = false;
  let category: string | undefined;
  let paymentMethod: string | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i];

    // #tag
    if (raw.startsWith('#') && raw.length > 1) {
      tags.push(raw.slice(1));
      continue;
    }

    // Date phrases are matched before anything else consumes their words.
    if (!dateFound) {
      const hit = matchDate(tokens, i, now);
      if (hit) {
        date = hit.date;
        dateFound = true;
        i += hit.consumed - 1;
        continue;
      }
    }

    const key = norm(raw);

    // Payment method.
    if (!paymentMethod && key in PAYMENT_ALIASES) {
      paymentMethod = PAYMENT_ALIASES[key];
      continue;
    }

    // Amount: the first token that reads as money. Currency symbols, commas
    // and a trailing "k" are stripped; the rest defers to the shared formula
    // evaluator so "120/4" behaves exactly as it does in the amount field.
    if (!amountFound) {
      const cleaned = raw.replace(/[₹$€£¥,]/g, '');
      const kSuffix = /^(-?\d+(?:\.\d+)?)k$/i.exec(cleaned);
      if (kSuffix) {
        amount = Number(kSuffix[1]) * 1000;
        amountFound = true;
        continue;
      }
      if (/^-?[\d.]+$/.test(cleaned) || /^-?[\d.]+[+\-*/]/.test(cleaned)) {
        const parsed = evaluateFormula(cleaned);
        if (parsed.ok && parsed.value !== 0) {
          amount = parsed.value;
          amountFound = true;
          continue;
        }
      }
    }

    // Category keyword. The word stays in the note: "lunch" is both the
    // category signal and the best description of the spend.
    if (!category) {
      for (const [catKey, words] of Object.entries(CATEGORY_KEYWORDS)) {
        if (words.includes(key) && validKeys.has(catKey)) {
          category = catKey;
          break;
        }
      }
    }
    leftovers.push(raw);
  }

  if (!amountFound) return { ...fallback, note: text };

  if (dateFound) parts.push(ymdLocal(date) === ymdLocal(now) ? 'today' : ymdLocal(date));
  if (category) parts.push('category');
  if (paymentMethod) parts.push(paymentMethod);
  if (tags.length) parts.push(`${tags.length} tag${tags.length > 1 ? 's' : ''}`);

  return {
    ok: true,
    amount,
    ...(category ? { category } : {}),
    date: ymdLocal(date),
    note: leftovers.join(' ').trim(),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(tags.length ? { tags } : {}),
    parts,
  };
}

/** Payment labels this parser can produce — kept honest against the source list. */
export const QUICK_ADD_PAYMENTS: readonly string[] = PAYMENT_METHODS;
