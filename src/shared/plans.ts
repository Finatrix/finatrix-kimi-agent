/**
 * Careers plan copy for the PUBLIC pricing surface.
 *
 * Why this is a constant and not a fetch: `/pricing` has to be readable by an
 * anonymous visitor, by a crawler that runs no JavaScript, and by an AI answer
 * engine quoting a price — none of which can authenticate, and
 * `subscription_plans` is `select to authenticated`. Fetching would also put a
 * network round-trip in front of the single most important number on the most
 * commercially important page. The signed-in surfaces (BillingPage,
 * CareersProPaywall) still read the database, which stays the billing source of
 * truth: checkout prices the plan server-side from that table, never from here,
 * so this file cannot cause a wrong charge — only a wrong advertisement.
 *
 * `plans.test.ts` parses the seed in `supabase/careers_phase4_schema.sql` and
 * fails if any id, name or price here disagrees with it. That is the whole
 * reason the duplication is acceptable.
 */

export interface PlanCopy {
  /** Matches `subscription_plans.id`. */
  id: string;
  name: string;
  /** INR, per month / per year. `0` means "no self-serve checkout" (Enterprise). */
  priceMonthly: number;
  priceYearly: number;
  /** One line on who this plan is for. */
  bestFor: string;
  /** What you get, written for a buyer rather than as a database feature list. */
  features: readonly string[];
  /** Highlighted as the default recommendation. Exactly one plan may set this. */
  featured?: boolean;
}

/**
 * The paid plans, in display order. `free` is deliberately absent: the Free tier
 * grants no Careers access at all (see `CareersPaywallGate`), so listing it as a
 * Careers plan would advertise a product it does not include. The free MONEY
 * tools are presented separately on the pricing page, which is what "free" here
 * actually refers to.
 */
export const CAREERS_PLANS: readonly PlanCopy[] = [
  {
    id: 'student',
    name: 'Student',
    priceMonthly: 199,
    priceYearly: 1999,
    bestFor: 'First job or internship hunt, on a student budget.',
    features: [
      'Multi-source job search with match scoring',
      'Up to 5 resume versions, 50 tracked applications',
      '100 AI analyses a month',
      'Career DNA profile and interview preparation',
    ],
  },
  {
    id: 'professional',
    name: 'Professional',
    priceMonthly: 999,
    priceYearly: 9999,
    bestFor: 'An active, deliberate search while you are already working.',
    featured: true,
    features: [
      'Everything in Student',
      'Up to 15 resume versions, 200 tracked applications',
      '500 AI analyses a month',
      'Resume tailoring per job description',
      'AI outreach drafting and offer analysis',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    priceMonthly: 2499,
    priceYearly: 24999,
    bestFor: 'A senior search running many roles and conversations at once.',
    features: [
      'Everything in Professional',
      'Up to 50 resume versions, 1,000 tracked applications',
      '2,000 AI analyses a month',
      'Priority AI and unlimited cover letters',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    priceMonthly: 0,
    priceYearly: 0,
    bestFor: 'Universities and organisations placing candidates at scale.',
    features: [
      'Everything in Premium',
      'Organisation management and seats',
      'Recruiter and university portal',
      'Priority support',
    ],
  },
] as const;

/** The lowest advertised monthly price — the "from ₹X" figure used across the site. */
export const CAREERS_FROM_PRICE = Math.min(
  ...CAREERS_PLANS.filter((p) => p.priceMonthly > 0).map((p) => p.priceMonthly),
);

/**
 * Yearly saving as a whole percentage, computed rather than written down —
 * a hardcoded "save 17%" is a claim that silently becomes false the first time
 * a price moves.
 */
export function yearlySavingPct(plan: PlanCopy): number {
  if (plan.priceMonthly <= 0 || plan.priceYearly <= 0) return 0;
  const full = plan.priceMonthly * 12;
  return Math.round(((full - plan.priceYearly) / full) * 100);
}

/** `1999` → `₹1,999`. Indian digit grouping, no decimals — every price here is whole rupees. */
export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}
