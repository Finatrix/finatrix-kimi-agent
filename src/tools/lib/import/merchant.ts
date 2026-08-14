/**
 * Turning a printed description into a payee name.
 *
 * Banks do not print merchants, they print routing. The same coffee shop
 * arrives as `POS 1234 BLUE TOKAI BENGALURU KA`, `UPI/DR/4123/BLUETOKAI/HDFC/…`
 * or `BLUE TOKAI COFFEE ROA*`, and a ledger full of those is a ledger nobody
 * reads. This module recovers the name deterministically wherever it can — from
 * the merchant table for known brands, and structurally for everything else.
 *
 * It is deliberately conservative. Where the structure does not clearly yield a
 * name it returns its best candidate and lets the AI layer refine it, because a
 * confidently wrong payee is worse than an unpolished one. The original
 * description is never discarded: it travels with the row into the transaction's
 * note, so the user can always see what the bank actually said.
 *
 * `merchantKey` is the other half of this file's job — a stable identity for a
 * payee, used by the learned-category map and by duplicate detection. Two
 * spellings of the same shop have to collapse to one key or "remember my
 * choice" silently stops working.
 */

import { sanitizeField } from '../../../lib/sanitize';
import { RAIL_TOKENS, matchRule } from './rules';

/** Longest payee name we will derive. Past this it is routing, not a name. */
const MAX_MERCHANT_CHARS = 40;
/** Most words kept from a structurally-derived name. */
const MAX_MERCHANT_WORDS = 4;

/** Separators banks use between the parts of a description. */
const SEGMENT_RE = /[/|*\\]+|\s-\s|--+/;

/** A four-letter IFSC/SWIFT-style bank stub, which is routing rather than a payee. */
const BANK_STUB_RE = /^(?:HDFC|ICIC|SBIN|UTIB|KKBK|YESB|PYTM|IDIB|PUNB|BARB|CNRB|IOBA|MAHB|ANDB|OKAXIS|OKHDFC|OKICICI|OKSBI|AXIS|SBI|BOB|PNB|IDFC|RBL|AUBL|INDB|FDRL|KVBL|TMBL|DBSS|HSBC|CITI|SCBL)$/;

/** Words that only ever describe the rail, never the shop. */
function isRailToken(token: string): boolean {
  return RAIL_TOKENS.has(token) || BANK_STUB_RE.test(token);
}

/**
 * A candidate name from one segment of a description, or '' when the segment is
 * routing. Segments carrying digits are rejected outright: reference numbers,
 * account stubs and terminal ids all look like words otherwise.
 */
function candidateFrom(segment: string): string {
  const cleaned = segment
    .replace(/@\S+/g, ' ')          // UPI handles: the local part is the useful half
    .replace(/[^A-Za-z0-9&.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';

  const words = cleaned.split(' ').filter((w) => {
    const upper = w.toUpperCase();
    if (/\d/.test(w)) return false;             // refs, terminal ids, dates
    if (upper.length < 2) return false;
    return !isRailToken(upper);
  });
  if (!words.length) return '';

  return words.slice(0, MAX_MERCHANT_WORDS).join(' ').slice(0, MAX_MERCHANT_CHARS).trim();
}

/**
 * Best-effort payee name for a description.
 *
 * Known brands resolve to their canonical spelling ("AMZN MKTPLACE PMTS" →
 * "Amazon") so the ledger groups them; everything else is reduced structurally
 * and title-cased. Returns '' when nothing name-shaped survives, which the
 * review sheet shows as "no merchant" rather than inventing one.
 */
export function deriveMerchant(description: string, validKeys: ReadonlySet<string>): string {
  const clean = sanitizeField(description, 300);
  if (!clean) return '';

  const upper = clean.toUpperCase();
  const rule = matchRule(upper, validKeys);
  if (rule?.merchant) return rule.merchant;

  // Structural pass: take the first segment that reads like a name.
  for (const segment of clean.split(SEGMENT_RE)) {
    const candidate = candidateFrom(segment);
    if (candidate) return titleCase(candidate);
  }
  return '';
}

/** Words that stay lower-case inside a name, and initialisms that stay upper. */
const LOWER_WORDS = new Set(['and', 'of', 'the', 'for', 'de', 'da']);
const KEEP_UPPER = new Set(['LIC', 'ATM', 'IT', 'HP', 'BP', 'KFC', 'CCD', 'IKEA', 'BSNL', 'IRCTC']);

/** `SHARMA GENERAL STORE` → `Sharma General Store`. */
export function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => {
      const upper = word.toUpperCase();
      if (KEEP_UPPER.has(upper)) return upper;
      if (i > 0 && LOWER_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ')
    .trim();
}

/**
 * Stable identity for a payee.
 *
 * Case, punctuation and spacing are all noise a bank varies between statements,
 * so they are stripped. Everything that reaches here has already been reduced to
 * a name, so this does no further interpretation — it only has to be consistent.
 */
export function merchantKey(merchant: string): string {
  return (merchant || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Identity for duplicate detection, which needs to compare rows whose merchant
 * was never resolved. Falls back to the description, reduced the same way and
 * clipped so a trailing reference number cannot make two copies of one
 * transaction look different.
 */
export function dedupeKey(merchant: string, description: string): string {
  const fromMerchant = merchantKey(merchant);
  if (fromMerchant.length >= 4) return fromMerchant;
  return (description || '')
    .toLowerCase()
    .replace(/\d+/g, '')
    .replace(/[^a-z]+/g, '')
    .slice(0, 24);
}
