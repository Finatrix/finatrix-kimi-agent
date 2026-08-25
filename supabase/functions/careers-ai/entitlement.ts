/**
 * Who may spend AI budget, and how much.
 *
 * Pure and dependency-free so it can be unit-tested: the decision this makes is
 * the one that was missing entirely, and it is not the kind of thing to leave
 * only exercised in production.
 *
 * ── The gap this closes ────────────────────────────────────────────────────
 * `careers-ai` authenticated the caller and then applied one flat daily call
 * ceiling from an env var, identical for every account. It never read
 * `subscriptions`. Two consequences:
 *
 *   • A Free user — who by product decision gets no Careers access at all —
 *     could call the endpoint directly and receive the full daily allowance of
 *     paid OpenRouter inference.
 *   • The per-plan quotas advertised on /pricing (100 / 500 / 2,000 analyses a
 *     month) were enforced nowhere, in either direction. Student could consume
 *     roughly 18x what was sold; Premium was capped below what it bought.
 *
 * ── Why this is not simply "paid plans only" ───────────────────────────────
 * `careers-ai` is the whole application's AI transport, not just Careers'. The
 * FREE money tools reach it too — the assistant in the calculators, and the
 * bank-statement categoriser in the Expense Tracker. Refusing every non-paid
 * caller would have broken both.
 *
 * So the gate is per TASK. `FREE_TIER_TASKS` is an allowlist of the money-tool
 * tasks, which any plan may run against its own quota; everything else is a
 * Careers task and requires a paid plan. An allowlist rather than a list of
 * Careers tasks on purpose: `tasks-jobs.ts` and `tasks-phase3.ts` pass dynamic
 * labels through, so a Careers task nobody remembered to register defaults to
 * REQUIRING payment rather than to being free.
 */

/**
 * What a caller gets when there is no subscription row, or when the plan join
 * comes back empty.
 *
 * Matches the `free` row seeded in `subscription_plans` (ai_quota_monthly = 20),
 * and `careersAiEntitlement.test.ts` pins the two together. Stated as the
 * fallback so a failed lookup degrades to the SMALLEST allowance rather than to
 * no limit — the failure mode of a quota system should never be a blank cheque.
 */
export const FREE_PLAN_FALLBACK_QUOTA = 20;

/** Plans that grant Careers access. Mirrors `PAID_PLAN_IDS` in CareersPaywallGate. */
export const PAID_PLAN_IDS = ['student', 'professional', 'premium', 'enterprise'] as const;

/**
 * Tasks the free money tools issue. Everything not listed is a Careers task.
 *
 * Keep in step with the `task:` labels in `src/tools/ai/` — there are only two,
 * and `careersAiEntitlement.test.ts` fails if a third appears without landing
 * here.
 */
export const FREE_TIER_TASKS = ['money-chat', 'statement-categorize'] as const;

export interface PlanSnapshot {
  /** `subscriptions.plan_id`, or null when the user has no subscription row. */
  planId: string | null;
  /** `subscription_plans.ai_quota_monthly`. `null` means unlimited. */
  aiQuotaMonthly: number | null;
}

export type EntitlementDecision =
  | {
      allowed: true;
      planId: string;
      /** Calls permitted this calendar month. `null` means unlimited. */
      monthlyCallLimit: number | null;
    }
  | {
      allowed: false;
      planId: string;
      /** HTTP status the function should answer with. */
      status: 402;
      reason: string;
    };

/** A user with no subscription row is on Free, not in limbo. */
export function effectivePlanId(snapshot: PlanSnapshot | null): string {
  return snapshot?.planId || 'free';
}

export function isPaidPlan(planId: string): boolean {
  return (PAID_PLAN_IDS as readonly string[]).includes(planId);
}

export function isFreeTierTask(task: string): boolean {
  return (FREE_TIER_TASKS as readonly string[]).includes(task);
}

/**
 * Decide whether `task` may run for this plan, and against what monthly quota.
 *
 * `402 Payment Required` rather than 403: the caller is authenticated and known,
 * the request is well-formed, and the only thing missing is a plan. The client
 * transport maps 402 to an `entitlement` failure so the UI can offer an upgrade
 * instead of rendering a generic error.
 */
export function decideEntitlement(task: string, snapshot: PlanSnapshot | null): EntitlementDecision {
  const planId = effectivePlanId(snapshot);

  if (!isFreeTierTask(task) && !isPaidPlan(planId)) {
    return {
      allowed: false,
      planId,
      status: 402,
      reason: 'FinatriX Careers AI needs a paid plan. The money tools stay free.',
    };
  }

  // No subscription row means Free, which has a quota rather than none.
  // `null` on a real row genuinely means unlimited (Enterprise) and is passed
  // through as such; the caller normalises a missing plan join to the fallback
  // before building the snapshot, so there is no third state to handle here.
  return {
    allowed: true,
    planId,
    monthlyCallLimit: snapshot ? snapshot.aiQuotaMonthly : FREE_PLAN_FALLBACK_QUOTA,
  };
}
