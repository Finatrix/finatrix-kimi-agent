/**
 * FinatriX Careers Phase 4 — Enterprise Platform. Row shapes mirror
 * supabase/careers_phase4_schema.sql. No payment gateway is wired yet
 * (Module 2, deferred): subscriptions/billing_history are managed directly
 * until Stripe/Razorpay webhooks land.
 */

// ─────────────────────────── RBAC ───────────────────────────

export type PlatformRole = 'user' | 'support' | 'admin' | 'super_admin';

export interface PlatformRoleRow {
  user_id: string;
  role: PlatformRole;
  granted_by: string | null;
  created_at: string;
}

export function isAdminRole(role: PlatformRole | null | undefined): boolean {
  return role === 'admin' || role === 'super_admin';
}

// ─────────────────────────── organizations (Module 12 foundation) ───────────────────────────

export type OrganizationKind = 'company' | 'university' | 'coaching' | 'enterprise';
export type OrgMemberRole = 'owner' | 'admin' | 'member';

export interface OrganizationRow {
  id: string;
  name: string;
  kind: OrganizationKind;
  owner_user_id: string | null;
  plan_id: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMemberRow {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgMemberRole;
  invited_by: string | null;
  joined_at: string;
}

// ─────────────────────────── subscription platform (Module 1) ───────────────────────────

export const PLAN_IDS = ['free', 'student', 'professional', 'premium', 'enterprise'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface SubscriptionPlanRow {
  id: PlanId | string;
  name: string;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  ai_quota_monthly: number | null;
  storage_mb: number | null;
  resume_limit: number | null;
  application_limit: number | null;
  features: string[];
  trial_days: number;
  is_active: boolean;
  sort_order: number;
}

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
export type PaymentProvider = 'manual' | 'stripe' | 'razorpay';

export interface SubscriptionRow {
  id: string;
  user_id: string;
  org_id: string | null;
  plan_id: string;
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_start: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  coupon_code: string | null;
  provider: PaymentProvider;
  provider_customer_id: string;
  provider_subscription_id: string;
  created_at: string;
  updated_at: string;
}

export interface CouponRow {
  code: string;
  percent_off: number | null;
  amount_off: number | null;
  currency: string;
  max_redemptions: number | null;
  times_redeemed: number;
  valid_until: string | null;
  active: boolean;
}

export type BillingStatus = 'paid' | 'failed' | 'refunded' | 'pending';

export interface BillingHistoryRow {
  id: string;
  user_id: string;
  subscription_id: string | null;
  amount: number;
  currency: string;
  status: BillingStatus;
  provider: PaymentProvider;
  provider_ref: string;
  invoice_url: string;
  created_at: string;
}

export interface UsageCounterRow {
  user_id: string;
  period: string; // 'YYYY-MM'
  ai_calls: number;
  storage_bytes: number;
  resumes_count: number;
  applications_count: number;
  updated_at: string;
}

/** Which quota a feature-gate check is against. */
export type QuotaKind = 'ai_calls' | 'storage_bytes' | 'resumes_count' | 'applications_count';

export interface QuotaCheck {
  kind: QuotaKind;
  used: number;
  limit: number | null; // null = unlimited
  remaining: number | null;
  exceeded: boolean;
}

// ─────────────────────────── feature flags (Module 3) ───────────────────────────

export type FlagScope = 'user' | 'org' | 'plan';

export interface FeatureFlagOverrideRow {
  id: string;
  flag: string;
  scope: FlagScope;
  scope_id: string;
  enabled: boolean;
  rollout_percent: number;
  is_beta: boolean;
  is_kill_switch: boolean;
  updated_at: string;
}

// ─────────────────────────── AI usage intelligence (Module 5) ───────────────────────────

export interface AiUsageLogRow {
  id: string;
  user_id: string;
  org_id: string | null;
  task: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  cache_hit: boolean;
  success: boolean;
  error: string;
  cost_estimate: number;
  created_at: string;
}

export interface AiUsageSummary {
  totalCalls: number;
  totalTokens: number;
  totalCost: number;
  avgLatencyMs: number;
  cacheHitRate: number;
  failureRate: number;
  byModel: { model: string; calls: number; tokens: number; cost: number }[];
  byTask: { task: string; calls: number }[];
  dailyTrend: { day: string; calls: number; tokens: number }[];
}

// ─────────────────────────── audit log ───────────────────────────

export interface AuditLogRow {
  id: string;
  actor_user_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  meta: Record<string, unknown>;
  created_at: string;
}

// ─────────────────────────── support tickets ───────────────────────────

export type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface SupportTicketRow {
  id: string;
  user_id: string;
  subject: string;
  body: string;
  status: TicketStatus;
  priority: TicketPriority;
  created_at: string;
  updated_at: string;
}

export interface SupportTicketMessageRow {
  id: string;
  ticket_id: string;
  author_id: string | null;
  is_staff: boolean;
  body: string;
  created_at: string;
}

// ─────────────────────────── announcements ───────────────────────────

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  audience: string; // all | plan:<id> | org:<id>
  starts_at: string;
  ends_at: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
}
