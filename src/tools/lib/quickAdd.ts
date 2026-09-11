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
 *
 * HOW A CATEGORY IS RECOGNISED
 * ----------------------------
 * Three vocabularies, strongest first:
 *
 *   history — words the user's own ledger has already filed one way, so
 *             "60 Claude" lands in Subscriptions because that is where the
 *             last Claude went. Nothing beats the user's own decisions.
 *   label   — the words of the category's own name, including multi-word names
 *             ("eating out", "personal care", "investment for loan") and every
 *             custom category the user has created. This is the vocabulary a
 *             person assumes exists, because they are the words on screen.
 *   keyword — a curated alias table for the words people actually type, which
 *             are usually not the category's name ("swiggy", "petrol", "emi").
 *
 * The longest phrase wins, then the strongest source, then the earliest
 * position. So "internet bill" is Internet rather than Utilities, and
 * "investment for loan" beats the bare "loan" inside it.
 *
 * Every pass runs over words no earlier pass claimed, so no word does two jobs:
 * "100 transfer for temple" is the Transfers category, while "1200 rent
 * transfer" is Rent paid by bank transfer.
 */
import { ymdLocal } from '../../lib/date';
import { migrateCategory } from './expense';
import { evaluateFormula } from './formula';

/** Which vocabulary recognised the category — shown back, never hidden. */
export type CategorySource = 'history' | 'label' | 'keyword';

export interface QuickAddResult {
  ok: boolean;
  /** Signed amount. 0 when nothing parseable was found. */
  amount: number;
  /** Category key, when one was recognised confidently. */
  category?: string;
  /** How that category was recognised. Absent when none was. */
  categorySource?: CategorySource;
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

/** A live category, as the parser needs to know it. */
export interface QuickAddCategory {
  k: string;
  l: string;
}

/**
 * Everything the parser is allowed to recognise, all of it derived from the
 * user's own data. Passing a bare key set is still supported (the ⌘K palette
 * has no page state to draw labels from) and behaves as it always did, plus
 * label matching derived from the key itself.
 */
export interface QuickAddVocabulary {
  categories: readonly QuickAddCategory[];
  /** Word → category key, learned from the ledger. See `learnCategoryWords`. */
  learned?: ReadonlyMap<string, string>;
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
 *
 * A word that is already a category's NAME does not need to be here: labels are
 * matched directly, and matching them here as well would only make the weaker
 * source say the same thing. What belongs here is what people type INSTEAD of
 * the name — the merchant, the instrument, the everyday word.
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  eating_out: ['lunch', 'dinner', 'breakfast', 'brunch', 'coffee', 'chai', 'tea', 'restaurant',
    'cafe', 'swiggy', 'zomato', 'pizza', 'burger', 'snack', 'takeaway', 'dining', 'dominos',
    'kfc', 'mcdonalds', 'starbucks', 'biryani', 'meal', 'food'],
  groceries: ['groceries', 'grocery', 'vegetables', 'veggies', 'supermarket', 'bigbasket',
    'blinkit', 'zepto', 'dmart', 'kirana', 'milk', 'ration', 'instamart'],
  transport: ['uber', 'ola', 'taxi', 'cab', 'auto', 'rickshaw', 'metro', 'bus', 'train',
    'petrol', 'diesel', 'fuel', 'parking', 'toll', 'rapido', 'commute'],
  rent: ['rent', 'landlord', 'maintenance', 'lease'],
  utilities: ['electricity', 'water', 'gas', 'bill', 'bills', 'eb', 'tneb', 'cylinder'],
  internet: ['broadband', 'wifi', 'fiber', 'fibre', 'jiofiber'],
  insurance: ['premium', 'lic', 'policy', 'mediclaim'],
  medical: ['doctor', 'medicine', 'medicines', 'pharmacy', 'hospital', 'clinic', 'dentist',
    'chemist', 'health'],
  shopping: ['clothes', 'shirt', 'shoes', 'amazon', 'flipkart', 'myntra', 'shopping', 'nykaa',
    'ajio', 'meesho', 'decathlon', 'ikea'],
  subscriptions: ['netflix', 'spotify', 'prime', 'subscription', 'hotstar', 'youtube', 'icloud',
    'claude', 'chatgpt', 'openai', 'anthropic', 'github', 'adobe', 'canva', 'notion', 'figma',
    'membership', 'renewal'],
  entertainment: ['movie', 'cinema', 'concert', 'game', 'games', 'pvr', 'bookmyshow', 'theatre'],
  personal_care: ['salon', 'haircut', 'spa', 'gym', 'grooming', 'barber', 'parlour', 'skincare'],
  travel: ['flight', 'hotel', 'trip', 'holiday', 'airbnb', 'vacation', 'irctc', 'makemytrip',
    'goibibo', 'oyo', 'resort'],
  phone: ['recharge', 'mobile', 'airtel', 'jio', 'vodafone', 'bsnl', 'postpaid', 'prepaid', 'sim'],
  gifts: ['gift', 'gifts', 'donation', 'charity'],
  going_out: ['pub', 'bar', 'club', 'party', 'drinks', 'outing'],
  emergency: ['contingency'],
  stocks: ['stock', 'stocks', 'equity', 'shares', 'sip', 'mutual', 'mf', 'nifty', 'demat',
    'zerodha', 'groww', 'upstox'],
  gold: ['sgb', 'sgbs', 'silver', 'bullion', 'jewellery', 'jewelry'],
  self_invest: ['course', 'courses', 'tuition', 'udemy', 'coursera', 'certification', 'training',
    'workshop', 'education'],
  loan_invest: ['emi', 'loan', 'repayment', 'instalment', 'installment'],
};

/** Weekday names → JS day index, for "last friday" / "on monday". */
const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, thursday: 4, thu: 4, thurs: 4, friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

/**
 * Grammar words, excluded from what the ledger teaches.
 *
 * Only function words: filtering by meaning would decide for the user which of
 * their own words are worth learning, which is exactly the judgement the
 * learned map exists to avoid making.
 */
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'into', 'is', 'it', 'its',
  'my', 'of', 'on', 'or', 'our', 'the', 'this', 'that', 'to', 'was', 'were', 'with', 'via',
]);

/** Strip a token to comparable letters. */
function norm(token: string): string {
  return token.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * A crude singular, used only to widen matching.
 *
 * "snacks" must find the `snack` alias and "stock" must find the Stocks label.
 * Applied to both sides of the match, so it never has to be right about English
 * — only consistent.
 */
function singular(word: string): string {
  if (word.length >= 4 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** Split any human string into comparable words. */
function words(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
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

/* ══════════════════════════════════════════════════════════════════════════
   What the ledger has already taught
   ══════════════════════════════════════════════════════════════════════════ */

/** The share of a word's uses that must agree before it is worth trusting. */
const LEARNED_MAJORITY = 0.6;

/**
 * Words the user's own transactions have filed one way, from their merchants
 * and notes.
 *
 * A word is only learned when a clear majority of its uses agree on one
 * category. A word the user has genuinely split between two categories teaches
 * nothing, and guessing at it would put a category on screen that their own
 * history contradicts — the one mistake this map exists to prevent.
 *
 * Categories are resolved through `migrateCategory`, so a pre-merge key teaches
 * the category it became rather than one that no longer exists.
 */
export function learnCategoryWords(
  items: readonly { category?: string; merchant?: string; note?: string }[],
  validKeys: ReadonlySet<string>,
): Map<string, string> {
  /** word → category key → times seen. */
  const tally = new Map<string, Map<string, number>>();

  const record = (word: string, key: string) => {
    if (!word || word.length < 3 || STOP_WORDS.has(word) || /^\d+$/.test(word)) return;
    const byCat = tally.get(word) ?? new Map<string, number>();
    byCat.set(key, (byCat.get(key) ?? 0) + 1);
    tally.set(word, byCat);
  };

  for (const e of items) {
    const key = migrateCategory(e.category ?? '', validKeys);
    if (!validKeys.has(key)) continue;
    for (const source of [e.merchant, e.note]) {
      if (!source) continue;
      const w = words(source);
      // The whole phrase as well as its parts: "book publishing" is a stronger
      // signal than either half, and costs one more entry to remember.
      if (w.length > 1) record(w.join(' '), key);
      for (const one of w) record(singular(one), key);
    }
  }

  const learned = new Map<string, string>();
  for (const [word, byCat] of tally) {
    let best = '';
    let bestCount = 0;
    let total = 0;
    for (const [key, count] of byCat) {
      total += count;
      if (count > bestCount) { best = key; bestCount = count; }
    }
    if (best && bestCount / total >= LEARNED_MAJORITY) learned.set(word, best);
  }
  return learned;
}

/* ══════════════════════════════════════════════════════════════════════════
   Category matching
   ══════════════════════════════════════════════════════════════════════════ */

const SOURCE_RANK: Record<CategorySource, number> = { history: 3, label: 2, keyword: 1 };

interface PhraseEntry { key: string; source: CategorySource }
interface CategoryIndex { phrases: Map<string, PhraseEntry>; maxWords: number }

function normaliseVocabulary(
  vocab: ReadonlySet<string> | QuickAddVocabulary,
): QuickAddVocabulary {
  if (vocab instanceof Set) {
    // A bare key set still gets label matching: `eating_out` is "eating out",
    // which is what the user sees on the button anyway.
    return { categories: [...vocab].map((k) => ({ k, l: k.replace(/_/g, ' ') })) };
  }
  return vocab as QuickAddVocabulary;
}

function buildIndex(vocab: QuickAddVocabulary): CategoryIndex {
  const phrases = new Map<string, PhraseEntry>();
  let maxWords = 0;

  const add = (phrase: string, key: string, source: CategorySource) => {
    const w = words(phrase);
    if (!w.length) return;
    const existing = phrases.get(w.join(' '));
    if (existing && SOURCE_RANK[existing.source] >= SOURCE_RANK[source]) return;
    phrases.set(w.join(' '), { key, source });
    phrases.set(w.map(singular).join(' '), { key, source });
    maxWords = Math.max(maxWords, w.length);
  };

  const valid = new Set(vocab.categories.map((c) => c.k));

  // Weakest first, so a stronger source overwrites rather than being blocked.
  for (const [key, aliases] of Object.entries(CATEGORY_KEYWORDS)) {
    if (!valid.has(key)) continue;
    for (const alias of aliases) add(alias, key, 'keyword');
  }
  for (const c of vocab.categories) {
    add(c.l, c.k, 'label');
    add(c.k.replace(/_/g, ' '), c.k, 'label');
  }
  for (const [word, key] of vocab.learned ?? []) {
    if (valid.has(key)) add(word, key, 'history');
  }

  return { phrases, maxWords: Math.max(1, maxWords) };
}

interface CategoryHit { key: string; source: CategorySource; start: number; end: number }

/**
 * The best category phrase in `wordList`, ignoring positions already claimed.
 *
 * Longest phrase first, because a longer phrase is a more specific claim:
 * "investment for loan" describes the spend better than the "loan" inside it.
 * Ties go to the stronger source, then to the earliest position — the word the
 * user reached for first.
 */
function matchCategory(
  wordList: readonly string[],
  claimed: readonly boolean[],
  index: CategoryIndex,
): CategoryHit | null {
  let best: CategoryHit | null = null;
  let bestLength = 0;

  for (let start = 0; start < wordList.length; start += 1) {
    if (claimed[start] || !wordList[start]) continue;
    const limit = Math.min(index.maxWords, wordList.length - start);
    for (let length = limit; length >= 1; length -= 1) {
      let usable = true;
      for (let k = start; k < start + length; k += 1) {
        if (claimed[k] || !wordList[k]) { usable = false; break; }
      }
      if (!usable) continue;
      const slice = wordList.slice(start, start + length);
      const hit = index.phrases.get(slice.join(' '))
        ?? index.phrases.get(slice.map(singular).join(' '));
      if (!hit) continue;
      const better = length > bestLength
        || (length === bestLength && best !== null
            && SOURCE_RANK[hit.source] > SOURCE_RANK[best.source]);
      if (best === null || better) {
        best = { key: hit.key, source: hit.source, start, end: start + length };
        bestLength = length;
      }
      break; // Longest match at this position wins; shorter ones are inside it.
    }
  }
  return best;
}

/** How a recognised category is described in the preview. */
const SOURCE_PART: Record<CategorySource, string> = {
  history: 'category (from your history)',
  label: 'category',
  keyword: 'category',
};

/* ══════════════════════════════════════════════════════════════════════════
   The parser
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Parse one line into the fields of a transaction.
 *
 * `vocab` is the user's live category set — either the bare keys or the fuller
 * {@link QuickAddVocabulary}. Either way a category only wins when it actually
 * exists for this user, so the guess can never point at a category they have
 * archived or never had.
 */
export function parseQuickAdd(
  input: string,
  now: Date,
  vocab: ReadonlySet<string> | QuickAddVocabulary = new Set<string>(),
): QuickAddResult {
  const text = input.trim();
  const fallback: QuickAddResult = {
    ok: false, amount: 0, date: ymdLocal(now), note: '', parts: [],
  };
  if (!text) return fallback;

  const tokens = text.split(/\s+/);
  const tags: string[] = [];
  const parts: string[] = [];
  /** Tokens spoken for by an earlier pass — no word does two jobs. */
  const claimed = tokens.map(() => false);
  /** Tokens that should not appear in the note. */
  const hidden = tokens.map(() => false);

  let amount = 0;
  let amountFound = false;
  let date = new Date(now);
  let dateFound = false;

  /* ── Pass A: tags, dates and the amount ── */
  for (let i = 0; i < tokens.length; i += 1) {
    const raw = tokens[i];

    if (raw.startsWith('#') && raw.length > 1) {
      tags.push(raw.slice(1));
      claimed[i] = true;
      hidden[i] = true;
      continue;
    }

    if (!dateFound) {
      const hit = matchDate(tokens, i, now);
      if (hit) {
        date = hit.date;
        dateFound = true;
        for (let k = i; k < i + hit.consumed; k += 1) { claimed[k] = true; hidden[k] = true; }
        i += hit.consumed - 1;
        continue;
      }
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
        claimed[i] = true;
        hidden[i] = true;
        continue;
      }
      if (/^-?[\d.]+$/.test(cleaned) || /^-?[\d.]+[+\-*/]/.test(cleaned)) {
        const parsed = evaluateFormula(cleaned);
        if (parsed.ok && parsed.value !== 0) {
          amount = parsed.value;
          amountFound = true;
          claimed[i] = true;
          hidden[i] = true;
          continue;
        }
      }
    }
  }

  if (!amountFound) return { ...fallback, note: text };

  /* ── Pass B: the category, over what is left ──
     The word that names the category stays in the note: "lunch" is both the
     category signal and the best description of the spend. */
  const index = buildIndex(normaliseVocabulary(vocab));
  const hit = matchCategory(tokens.map(norm), claimed, index);
  if (hit) for (let k = hit.start; k < hit.end; k += 1) claimed[k] = true;

  /* ── Pass C: the payment method, over what neither of those took ── */
  let paymentMethod: string | undefined;
  for (let i = 0; i < tokens.length && !paymentMethod; i += 1) {
    if (claimed[i]) continue;
    const key = norm(tokens[i]);
    if (key in PAYMENT_ALIASES) {
      paymentMethod = PAYMENT_ALIASES[key];
      claimed[i] = true;
      hidden[i] = true;
    }
  }

  const note = tokens.filter((_, i) => !hidden[i]).join(' ').trim();

  if (dateFound) parts.push(ymdLocal(date) === ymdLocal(now) ? 'today' : ymdLocal(date));
  if (hit) parts.push(SOURCE_PART[hit.source]);
  if (paymentMethod) parts.push(paymentMethod);
  if (tags.length) parts.push(`${tags.length} tag${tags.length > 1 ? 's' : ''}`);

  return {
    ok: true,
    amount,
    ...(hit ? { category: hit.key, categorySource: hit.source } : {}),
    date: ymdLocal(date),
    note,
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(tags.length ? { tags } : {}),
    parts,
  };
}
