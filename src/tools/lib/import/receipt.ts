/**
 * A paper bill, read on the device.
 *
 * A receipt is not a statement and not a payments list: it is one purchase,
 * printed as a column of item lines, a few subtotals, taxes and one figure
 * that was actually paid. So it gets its own layout rules, the three the
 * feature asks for:
 *
 *  - **The total.** The figure on the line that says what was paid ("Grand
 *    Total", "Net Amount", "Amount Payable"…). Subtotals, savings, tax lines,
 *    cash tendered and change are never it. When the bill says nothing of the
 *    kind, the amount is left empty rather than guessed: the largest number on
 *    a receipt is as often a phone number or a GSTIN as a total.
 *  - **The shop.** The first line near the top that reads like a name, skipping
 *    "TAX INVOICE", addresses, phone numbers and registration numbers.
 *  - **The date.** Indian bills print day first: `14/08/26`, `14-08-2026`,
 *    `14.08.2026`, `14-Aug-2026`, `14 Aug 2026`, or ISO. A date after today is
 *    a misread, and dropped.
 *
 * Nothing here adds anything up. It picks out a figure the bill printed, and
 * `parseAmount` reads it exactly as it reads a statement's amount cell.
 */

import { parseAmount, parseStatementDate, todayKey } from './fields';
import type { StatementDoc } from './types';

export interface ReceiptReading {
  /** The printed total, or null when no line says what was paid. */
  amount: number | null;
  /** The shop's name as printed, or null. */
  merchant: string | null;
  /** `YYYY-MM-DD`, or null. */
  date: string | null;
}

/** Lines that say what was paid, strongest first. */
const PAID_LINE: readonly RegExp[] = [
  /\b(grand\s*total|net\s*(amount|amt|payable|total)|amount\s*payable|total\s*payable|bill\s*(amount|amt|total)|amount\s*due|total\s*due|to\s*pay|payable\s*amount|total\s*amount|total\s*amt|invoice\s*(total|amount|value))\b/i,
  /\btota[l1]\b/i,
];

/**
 * A "total" that is not the one paid. Checked before the paid lines, because
 * "Sub Total" and "Total Savings" both contain the word.
 */
const NOT_PAID = /\b(sub\s*-?\s*tota[l1]|tota[l1]\s*(qty|quantity|items?|savings?|saved|discount|disc|tax|gst|cgst|sgst|igst|mrp|weight|wt)|you\s*saved?|savings|tendered|change|round\s*(off|ing)|cash\s*(paid|received)|items?\s*count|no\.?\s*of\s*items|mrp)\b/i;

/**
 * An amount at the end of a line: `1,234.50`, `₹ 450`, `Rs.450.00`, `450/-`.
 * Receipts right-align what was paid, so the last figure is the one wanted;
 * a quantity or rate earlier on the line is not.
 */
const TRAILING_AMOUNT = /(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(?:\/-)?\s*$/i;

/** A line holding nothing but an amount, for a total split across two lines by the reader. */
const AMOUNT_ONLY = /^\s*(?:₹|rs\.?|inr)?\s*[:=]?\s*(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(?:\/-)?\s*$/i;

/** Day-first dates, found anywhere in a line ("Date: 14/08/26 Time: 18:22"). */
const DATE_TOKENS: readonly RegExp[] = [
  /\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\b/,
  /\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/,
  /\b(\d{1,2}[-\s/][a-z]{3,9}\.?[-\s/]\d{2,4})\b/i,
  /\b([a-z]{3,9}\.?\s\d{1,2},?\s\d{4})\b/i,
];

/** Headings and boilerplate printed above the shop's name, or instead of it. */
const NOT_A_NAME = /\b(tax\s*invoice|invoice|cash\s*memo|bill\s*of\s*supply|receipt|estimate|duplicate|original|copy|welcome|thank|gstin|gst\s*no|fssai|cin|pan|tin|ph(one)?|tel|mob(ile)?|email|www|http|date|time|bill\s*no|order|table|cashier|counter)\b/i;

/** How far down the bill the shop's name may be. */
const NAME_LINES = 6;

/** Longest shop name kept. A longer line is an address or a slogan. */
const MAX_NAME_CHARS = 40;

/** Amounts a till could print. Anything else is a misread. */
const MAX_AMOUNT = 10_000_000;

function amountAtEnd(line: string): number | null {
  const m = TRAILING_AMOUNT.exec(line);
  if (!m) return null;
  const parsed = parseAmount(m[1]);
  if (!parsed || parsed.value <= 0 || parsed.value > MAX_AMOUNT) return null;
  return parsed.value;
}

function amountOnly(line: string): number | null {
  const m = AMOUNT_ONLY.exec(line);
  if (!m) return null;
  const parsed = parseAmount(m[1]);
  if (!parsed || parsed.value <= 0 || parsed.value > MAX_AMOUNT) return null;
  return parsed.value;
}

/**
 * The amount paid: from the strongest kind of paid line the bill has, the
 * largest figure on such a line. Within one kind, a grand total is never
 * smaller than the totals it sums, so the largest is the one paid.
 */
function findTotal(lines: readonly string[]): number | null {
  for (const pattern of PAID_LINE) {
    const found: number[] = [];
    lines.forEach((line, i) => {
      if (!pattern.test(line) || NOT_PAID.test(line)) return;
      // The reader often puts the figure on the next line, when the label and
      // the amount sit in two columns.
      const value = amountAtEnd(line) ?? (i + 1 < lines.length ? amountOnly(lines[i + 1]) : null);
      if (value !== null) found.push(value);
    });
    if (found.length) return Math.max(...found);
  }
  return null;
}

function findMerchant(lines: readonly string[]): string | null {
  for (const raw of lines.slice(0, NAME_LINES)) {
    const line = raw.replace(/[|*_=~#<>]+/g, ' ').replace(/\s+/g, ' ').trim();
    const letters = (line.match(/\p{L}/gu) ?? []).length;
    if (letters < 3 || letters / line.length < 0.6) continue;
    if (NOT_A_NAME.test(line)) continue;
    const name = line.replace(/^[^\p{L}\d]+|[^\p{L}\d).]+$/gu, '');
    if (!name || name.length > MAX_NAME_CHARS) continue;
    return name;
  }
  return null;
}

function findDate(lines: readonly string[], now: Date): string | null {
  const today = todayKey(now);
  for (const line of lines) {
    for (const pattern of DATE_TOKENS) {
      const m = pattern.exec(line);
      if (!m) continue;
      const date = parseStatementDate(m[1], 'dmy', now);
      if (date && date <= today) return date;
    }
  }
  return null;
}

/** Read recognised text as a receipt. Every field is null when it was not found. */
export function parseReceipt(text: string, now: Date = new Date()): ReceiptReading {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return {
    amount: findTotal(lines),
    merchant: findMerchant(lines),
    date: findDate(lines, now),
  };
}

/** True when a reading found something worth showing. */
export function hasReading(reading: ReceiptReading): boolean {
  return reading.amount !== null || reading.merchant !== null || reading.date !== null;
}

/**
 * A receipt as a one-row statement, for an image that reached the screenshot
 * import (shared, or chosen there) and was neither a statement nor a payments
 * list. Held for review like every other recognised row.
 */
export function receiptStatement(text: string, now: Date = new Date()): StatementDoc {
  const reading = parseReceipt(text, now);
  const empty: StatementDoc = {
    source: 'ocr', rows: [], currency: null, openingBalance: null, closingBalance: null,
    skipped: 0, dateOrder: 'dmy', dateOrderAssumed: true,
  };
  // Without the figure paid there is no transaction to offer.
  if (reading.amount === null) return empty;
  return {
    ...empty,
    rows: [{
      line: 1,
      date: reading.date,
      postedDate: null,
      description: reading.merchant ?? 'Receipt',
      amount: reading.amount,
      direction: 'debit',
      balance: null,
      reference: null,
      currency: null,
    }],
  };
}

/** Largest photo read. Phone cameras stay well under it. */
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

export type ReceiptOutcome =
  | { ok: true; reading: ReceiptReading }
  | { ok: false; message: string };

/**
 * Recognise a photo of a bill on this device and read it as a receipt.
 * The photo is never uploaded: recognition runs in a worker in this tab.
 */
export async function readReceiptPhoto(file: File, now: Date = new Date()): Promise<ReceiptOutcome> {
  if (!file || file.size === 0) return { ok: false, message: 'That photo is empty. Please take it again.' };
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, message: 'That photo is larger than 15 MB. Please take a smaller one.' };
  if (file.type && !file.type.startsWith('image/')) {
    return { ok: false, message: 'That is not a photo. Please choose a picture of the bill.' };
  }
  let text: string;
  try {
    const { ocrImages } = await import('../../../lib/ocr');
    text = await ocrImages([file]);
  } catch (e) {
    return { ok: false, message: e instanceof Error && e.message ? e.message : 'Could not read this photo.' };
  }
  const reading = parseReceipt(text, now);
  if (!hasReading(reading)) {
    return {
      ok: false,
      message: 'No bill details were found in that photo. A straight, well-lit photo of the whole bill works best, or enter it by hand.',
    };
  }
  return { ok: true, reading };
}
