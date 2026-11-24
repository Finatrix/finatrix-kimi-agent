/**
 * Currency + number formatting — a verbatim port of the formatters that lived
 * in public/tools-app.html (`CURRENCIES`, `fmt`, `cfmt`, `cfmtSh`).
 *
 * Hide amounts: `cfmt` and `cfmtSh` return `maskedAmount(code)` while the
 * device's switch is on (lib/hideAmounts.ts). With it off (the default) the
 * output is unchanged.
 *
 * The ONLY structural change: the original read a module-global `FXC` for the
 * active currency; these pure functions take the currency `code` as an argument
 * so they can be unit-tested and driven by React state. The arithmetic and
 * string output are byte-for-byte identical to the original for any given code.
 *
 * Nothing here is a "financial calculation" (these are display helpers), but
 * they are covered by parity tests anyway because tool output strings depend on
 * them.
 */

import { AMOUNT_MASK, amountsHidden } from './hideAmounts';

export interface CurrencyDef {
  sym: string;
}

export const CURRENCIES: Record<string, CurrencyDef> = {
  INR: { sym: '₹' }, USD: { sym: '$' }, EUR: { sym: '€' }, GBP: { sym: '£' }, JPY: { sym: '¥' },
  CNY: { sym: '¥' }, AUD: { sym: 'A$' }, CAD: { sym: 'C$' }, CHF: { sym: 'Fr' }, SGD: { sym: 'S$' },
  HKD: { sym: 'HK$' }, NZD: { sym: 'NZ$' }, AED: { sym: 'AED ' }, SAR: { sym: 'SAR ' }, QAR: { sym: 'QAR ' },
  KWD: { sym: 'KD ' }, ZAR: { sym: 'R' }, BRL: { sym: 'R$' }, MXN: { sym: 'Mex$' }, RUB: { sym: '₽' },
  KRW: { sym: '₩' }, TRY: { sym: '₺' }, IDR: { sym: 'Rp' }, MYR: { sym: 'RM' }, THB: { sym: '฿' },
  PHP: { sym: '₱' }, VND: { sym: '₫' }, PKR: { sym: 'Rs' }, BDT: { sym: '৳' }, LKR: { sym: 'Rs' },
  NPR: { sym: 'Rs' }, NGN: { sym: '₦' }, EGP: { sym: 'E£' }, ILS: { sym: '₪' }, SEK: { sym: 'kr' },
  NOK: { sym: 'kr' }, DKK: { sym: 'kr' }, PLN: { sym: 'zł' }, CZK: { sym: 'Kč' }, HUF: { sym: 'Ft' },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES);
/** Number of supported currencies — surfaced dynamically on the landing hero. */
export const CURRENCY_COUNT = CURRENCY_CODES.length;

export function currencySym(code: string): string {
  return (CURRENCIES[code] || { sym: '' }).sym;
}

/**
 * A hidden amount in `code`: "₹ ••••", "AED ••••". Hide amounts
 * (lib/hideAmounts.ts) shows this in place of every formatted amount.
 */
export function maskedAmount(code = 'INR'): string {
  const sym = currencySym(code).trim() || code;
  return `${sym} ${AMOUNT_MASK}`;
}

/** INR Lakh/Crore formatter (original `fmt`). */
export function fmt(n: number): string {
  n = Math.round(Number(n) || 0);
  const neg = n < 0 ? '−' : '';
  n = Math.abs(n);
  if (n >= 1e7) return neg + '₹' + (n / 1e7).toFixed(2).replace(/\.00$/, '') + ' Cr';
  if (n >= 1e5) return neg + '₹' + (n / 1e5).toFixed(2).replace(/\.00$/, '') + ' L';
  if (n >= 1000) return neg + '₹' + n.toLocaleString('en-IN');
  return neg + '₹' + n;
}

/** Currency-aware formatter (original `cfmt`). INR uses Lakh/Crore. */
export function cfmt(n: number, code = 'INR'): string {
  if (amountsHidden()) return maskedAmount(code);
  n = Math.round(Number(n) || 0);
  if (code === 'INR') return fmt(n);
  const neg = n < 0 ? '−' : '';
  n = Math.abs(n);
  try {
    return (
      neg +
      new Intl.NumberFormat('en', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(n)
    );
  } catch {
    return neg + currencySym(code) + n.toLocaleString('en-US');
  }
}

/** Short currency formatter (original `cfmtSh`). */
export function cfmtSh(n: number, code = 'INR'): string {
  if (amountsHidden()) return maskedAmount(code);
  if (code === 'INR') {
    if (Math.abs(n) >= 1e7) return '₹' + (n / 1e7).toFixed(1) + 'Cr';
    if (Math.abs(n) >= 1e5) return '₹' + Math.round(n / 1e5) + 'L';
    if (Math.abs(n) >= 1000) return '₹' + Math.round(n / 1000) + 'K';
    return '₹' + Math.round(n);
  }
  const sym = currencySym(code);
  const a = Math.abs(n);
  if (a >= 1e9) return sym + (n / 1e9).toFixed(1) + 'B';
  if (a >= 1e6) return sym + (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return sym + Math.round(n / 1e3) + 'K';
  return sym + Math.round(n);
}

/** HTML-escape helper (original `esc`) — used where tool text is interpolated. */
export function esc(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}
