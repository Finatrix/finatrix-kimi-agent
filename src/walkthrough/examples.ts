/**
 * The illustrative figures the intro shows.
 *
 * These are literals on purpose. They are pictures of the kind of thing each
 * tool does, labelled on screen as example figures, and nothing here is
 * computed by — or imported from — a calculator. If a tool's maths changes,
 * this file does not need to, and the intro can never become a second,
 * drifting implementation of a formula.
 *
 * Two sets: rupee figures, and a generic set for every other currency, so a
 * reader in pounds or dollars is not shown a "₹80,000" month in their own
 * symbol. The 50/30/20 split is the guide's own definition (half, 30%, 20%),
 * written out rather than multiplied.
 */

export interface WalkthroughExample {
  income: number;
  needs: number;
  wants: number;
  save: number;
  /** What the person types in scene 2, and what it becomes. */
  typed: string;
  spend: number;
  method: string;
  earlier: ReadonlyArray<{ label: string; amount: number }>;
  goalName: string;
  goalTarget: number;
  goalYears: number;
  /** Shown as approximate; an example, not a plan. */
  monthly: number;
}

const INR: WalkthroughExample = {
  income: 80000,
  needs: 40000,
  wants: 24000,
  save: 16000,
  typed: '340 lunch upi',
  spend: 340,
  method: 'UPI',
  earlier: [{ label: 'Groceries', amount: 1250 }, { label: 'Metro', amount: 60 }],
  goalName: 'Home deposit',
  goalTarget: 1000000,
  goalYears: 5,
  monthly: 12100,
};

const GENERIC: WalkthroughExample = {
  income: 5000,
  needs: 2500,
  wants: 1500,
  save: 1000,
  typed: '14 lunch card',
  spend: 14,
  method: 'Card',
  earlier: [{ label: 'Groceries', amount: 86 }, { label: 'Bus', amount: 3 }],
  goalName: 'Home deposit',
  goalTarget: 60000,
  goalYears: 5,
  monthly: 730,
};

export function exampleFor(currency: string): WalkthroughExample {
  return currency === 'INR' ? INR : GENERIC;
}

/** Grouped digits with the currency symbol — Indian grouping for rupees. */
export function money(n: number, currency: string, sym: string): string {
  const rounded = Math.round(n);
  let digits: string;
  try {
    digits = new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { maximumFractionDigits: 0 }).format(rounded);
  } catch {
    digits = String(rounded);
  }
  return `${sym}${digits}`;
}
