/**
 * Removing identifiers from statement text before it can leave the device.
 *
 * WHY THIS IS ITS OWN FILE
 * ------------------------
 * A bank statement is the most sensitive document this product will ever be
 * handed. The import flow keeps the *file* on the device — pdfjs and the CSV
 * reader run in the browser, nothing is uploaded — but the categorisation step
 * does send description strings to a model, and a raw description routinely
 * carries the things that must never travel:
 *
 *     UPI/DR/412345678901/SWIGGY/ICIC/swiggy.payu@icici/Payment
 *     POS 4532 1122 3344 5566 WOOLWORTHS QV
 *     NEFT-HDFC0000123-50100234567890-RENT
 *
 * The transaction reference, the card PAN and the account number are all useless
 * for deciding "this is groceries", so they are stripped rather than trusted to
 * a privacy policy. What remains is the merchant-shaped part of the string,
 * which is the only part the model was ever asked about.
 *
 * This runs on the AI payload only. The user's own copy of the description is
 * stored unredacted, because the review sheet has to be able to show what the
 * statement actually said.
 *
 * The masks keep the last four digits. A user recognising "ending 5566" is the
 * difference between a review sheet they trust and one they cannot check.
 */

/** 13–19 digits, optionally grouped — a card PAN. Checked before short runs. */
const CARD_RE = /\b(?:\d[ -]?){12,18}\d\b/g;

/** ISO 13616 IBAN: country, checksum, then up to 30 alphanumerics. */
const IBAN_RE = /\b[A-Z]{2}\d{2}[ ]?(?:[A-Z0-9]{4}[ ]?){2,7}[A-Z0-9]{1,4}\b/g;

/** A bare account or reference number: nine or more digits. */
const LONG_DIGITS_RE = /\b\d{9,}\b/g;

/** Mask keeping the trailing four characters, so a row stays recognisable. */
function mask(match: string): string {
  const compact = match.replace(/[^A-Za-z0-9]/g, '');
  const tail = compact.slice(-4);
  return tail.length === 4 ? `••••${tail}` : '••••';
}

/**
 * Strip card numbers, IBANs and long account/reference digit runs.
 *
 * Order matters: the card pattern is applied first so a 16-digit PAN is masked
 * as one identifier rather than being partially consumed by the generic
 * long-digit rule.
 */
export function redactIdentifiers(text: string): string {
  if (typeof text !== 'string' || !text) return '';
  return text
    .replace(IBAN_RE, mask)
    .replace(CARD_RE, mask)
    .replace(LONG_DIGITS_RE, mask);
}

/**
 * True when a string still looks like it carries an identifier.
 *
 * Used by the test suite as a tripwire: if a future change to the AI payload
 * starts forwarding a field that was never redacted, this catches it there
 * rather than in production traffic.
 */
export function hasIdentifier(text: string): boolean {
  return (
    new RegExp(CARD_RE.source).test(text) ||
    new RegExp(IBAN_RE.source).test(text) ||
    new RegExp(LONG_DIGITS_RE.source).test(text)
  );
}
