/**
 * Countries for travel mode's "Where are you going?", each with the currency
 * that fills in when it is picked. Only countries whose currency the app can
 * convert (`BASELINE_RATES`); anywhere else, pick the currency you will pay in.
 * A few well-known cities are named so the list can be found by them too.
 */
export interface Place {
  name: string;
  currency: string;
}

const EURO = ['Austria', 'Belgium', 'Croatia', 'Finland', 'France', 'Germany', 'Greece', 'Ireland', 'Italy', 'Netherlands', 'Portugal', 'Spain'];

export const PLACES: readonly Place[] = [
  { name: 'Australia', currency: 'AUD' },
  { name: 'Bangladesh', currency: 'BDT' },
  { name: 'Brazil', currency: 'BRL' },
  { name: 'Canada', currency: 'CAD' },
  { name: 'China', currency: 'CNY' },
  { name: 'Czechia (Prague)', currency: 'CZK' },
  { name: 'Denmark', currency: 'DKK' },
  { name: 'Egypt', currency: 'EGP' },
  { name: 'Hong Kong', currency: 'HKD' },
  { name: 'Hungary (Budapest)', currency: 'HUF' },
  { name: 'India', currency: 'INR' },
  { name: 'Indonesia (Bali)', currency: 'IDR' },
  { name: 'Israel', currency: 'ILS' },
  { name: 'Japan', currency: 'JPY' },
  { name: 'Kuwait', currency: 'KWD' },
  { name: 'Malaysia (Kuala Lumpur)', currency: 'MYR' },
  { name: 'Mexico', currency: 'MXN' },
  { name: 'Nepal', currency: 'NPR' },
  { name: 'New Zealand', currency: 'NZD' },
  { name: 'Nigeria', currency: 'NGN' },
  { name: 'Norway', currency: 'NOK' },
  { name: 'Pakistan', currency: 'PKR' },
  { name: 'Philippines', currency: 'PHP' },
  { name: 'Poland', currency: 'PLN' },
  { name: 'Qatar (Doha)', currency: 'QAR' },
  { name: 'Russia', currency: 'RUB' },
  { name: 'Saudi Arabia', currency: 'SAR' },
  { name: 'Singapore', currency: 'SGD' },
  { name: 'South Africa', currency: 'ZAR' },
  { name: 'South Korea (Seoul)', currency: 'KRW' },
  { name: 'Sri Lanka', currency: 'LKR' },
  { name: 'Sweden', currency: 'SEK' },
  { name: 'Switzerland', currency: 'CHF' },
  { name: 'Thailand (Bangkok, Phuket)', currency: 'THB' },
  { name: 'Turkey (Istanbul)', currency: 'TRY' },
  { name: 'United Arab Emirates (Dubai, Abu Dhabi)', currency: 'AED' },
  { name: 'United Kingdom (London)', currency: 'GBP' },
  { name: 'United States', currency: 'USD' },
  { name: 'Vietnam', currency: 'VND' },
  ...EURO.map((name) => ({ name, currency: 'EUR' })),
].sort((a, b) => a.name.localeCompare(b.name));
