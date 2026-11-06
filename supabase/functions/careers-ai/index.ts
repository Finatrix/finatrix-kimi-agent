// FinatriX Careers — AI proxy edge function.
//
// The web app is a static SPA, so this function is the only place the
// OpenRouter API key exists. It authenticates the caller with their Supabase
// JWT, meters daily usage per user, enforces a model allowlist and token
// caps, and walks a configurable fallback chain of models until one answers.
//
// Deploy:   supabase functions deploy careers-ai
// Secrets:  supabase secrets set OPENROUTER_API_KEY=sk-or-...
// Optional: CAREERS_AI_MODELS="google/gemini-3.8-flash,deepseek/deepseek-v4.1-flash,qwen/qwen3.8-flash"
//           CAREERS_AI_DAILY_LIMIT="60"              per-user calls/day
//           CAREERS_AI_DAILY_TOKENS="150000"         per-user tokens/day (0 = off)
//           CAREERS_AI_GLOBAL_DAILY_TOKENS="20000000" platform tokens/day (0 = off)
//           CAREERS_AI_CACHE_TTL_MS="900000"         identical-prompt cache (0 = off)
//
// The token budgets and the cache need migration
// supabase/migrations/20260814000100_ai_token_budget.sql. Until it is applied
// the function falls back to the call-only meter and simply does not cache.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { rateLimited } from '../_shared/ratelimit.ts';
import {
  FREE_PLAN_FALLBACK_QUOTA,
  decideEntitlement,
  isFreeTierTask,
  type PlanSnapshot,
} from './entitlement.ts';
import { corsHeaders } from '../_shared/origins.ts';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const RATE_PER_MINUTE = Number(Deno.env.get('CAREERS_AI_RATE_PER_MINUTE') ?? '20');

const DEFAULT_MODELS = [
  'google/gemini-3.8-flash',
  'anthropic/claude-sonnet-5.5',
  'openai/gpt-6.1-sol',
  'moonshotai/kimi-k3',
  'deepseek/deepseek-v4.1-flash',
  'qwen/qwen3.8-flash',
];

/**
 * Models this chain used to name, and the one that replaced each. The mobile
 * apps bundle their model ids (the money assistant asks for a specific model),
 * so a build already on a phone keeps requesting the old id for as long as it
 * is installed. Without this the request would miss the allowlist and be
 * answered by whichever model heads the chain instead of the one asked for.
 * Mirrors RETIRED_MODEL_IDS in src/careers/constants/index.ts, which does the
 * same for a model saved in a user's settings.
 */
const RETIRED_MODELS: Record<string, string> = {
  'google/gemini-2.5-flash': 'google/gemini-3.8-flash',
  'anthropic/claude-sonnet-5': 'anthropic/claude-sonnet-5.5',
  'openai/gpt-5.5': 'openai/gpt-6.1-sol',
  'moonshotai/kimi-k2': 'moonshotai/kimi-k3',
  'deepseek/deepseek-chat-v3.1': 'deepseek/deepseek-v4.1-flash',
  'qwen/qwen3-235b-a22b-2507': 'qwen/qwen3.8-flash',
};

/** The requested model if the allowlist has it, else its successor if it does; otherwise none. */
function resolveRequestedModel(requested: unknown, allowed: string[]): string | undefined {
  if (typeof requested !== 'string' || !requested) return undefined;
  if (allowed.includes(requested)) return requested;
  const successor = RETIRED_MODELS[requested];
  return successor && allowed.includes(successor) ? successor : undefined;
}

const MAX_INPUT_CHARS = 80_000;   // system + user combined
const MAX_OUTPUT_TOKENS = 8_192;
const REQUEST_TIMEOUT_MS = 90_000;

/**
 * Cost controls beyond the daily call count.
 *
 * A call cap does not bound spend: 60 calls is anywhere from ~15K to ~500K
 * output tokens depending on the task, and a per-user cap says nothing about
 * the total across all users. So there are three further limits, all opt-out
 * by setting them to 0:
 *
 *  - a per-user daily TOKEN budget (what actually drives the bill),
 *  - a GLOBAL daily token ceiling (a hard stop that does not scale with signups),
 *  - a short-lived per-user response cache (a repeated question costs nothing).
 */
const DAILY_TOKEN_BUDGET = Number(Deno.env.get('CAREERS_AI_DAILY_TOKENS') ?? '150000');
const GLOBAL_DAILY_TOKENS = Number(Deno.env.get('CAREERS_AI_GLOBAL_DAILY_TOKENS') ?? '20000000');
/** How long an identical prompt may be answered from the cache. */
const CACHE_TTL_MS = Number(Deno.env.get('CAREERS_AI_CACHE_TTL_MS') ?? '900000'); // 15 min

/**
 * Cache key for a prompt. Includes the requested model, because the same
 * question answered by a different model is a different answer.
 *
 * SHA-256 via WebCrypto — available in the Deno runtime with no dependency.
 */
async function promptHash(model: string, system: string, user: string): Promise<string> {
  const data = new TextEncoder().encode(`${model}\u0000${system}\u0000${user}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// CORS: see ../_shared/origins.ts for why the allowlist is built from
// CANONICAL_HOST and CAREERS_ALLOWED_ORIGINS is additive. Bearer-JWT
// authenticated and cookieless, so reflecting any well-formed web origin is
// safe (no ambient credentials to ride on) and stops allowlist drift after a
// domain change from surfacing as a browser "CORS" error.
function corsFor(req: Request): Record<string, string> {
  return corsHeaders(req, {
    headers: 'authorization, x-client-info, apikey, content-type',
    methods: 'POST, OPTIONS',
    reflectAnyWebOrigin: true,
  });
}

function jsonWith(cors: Record<string, string>) {
  return (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
}

function configuredModels(): string[] {
  const raw = Deno.env.get('CAREERS_AI_MODELS') ?? '';
  const models = raw.split(',').map((m) => m.trim()).filter(Boolean);
  return models.length ? models : DEFAULT_MODELS;
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

/**
 * OpenRouter provider routing: send prompts only to providers that neither
 * store them nor train on them (`provider.data_collection: "deny"`).
 *
 * What reaches the model is the user's own question and the figures relevant
 * to it, or merchant descriptions from a statement import — sent only after
 * the in-app consent prompt (src/lib/ai/consent.ts). Consent covers processing
 * to produce an answer; it is not consent to a provider keeping the text.
 *
 * A model with no compliant provider fails with a 404 from OpenRouter, which
 * the fallback chain below treats like any other failure and moves on. It does
 * NOT fall back to "allow" — an answer is not worth quietly widening where the
 * data goes. `CAREERS_AI_DATA_COLLECTION=allow` is the explicit, reviewed way
 * to relax it if the whole chain ever has nowhere compliant to run.
 */
function providerPreferences(): { data_collection: 'deny' | 'allow' } {
  return { data_collection: Deno.env.get('CAREERS_AI_DATA_COLLECTION') === 'allow' ? 'allow' : 'deny' };
}

async function callModel(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  maxTokens: number,
): Promise<{ content: string; model: string; usage: TokenUsage }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://finatrix.co',
        'X-Title': 'FinatriX Careers',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: maxTokens,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        provider: providerPreferences(),
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenRouter ${res.status} on ${model}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const content: unknown = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error(`Empty completion from ${model}`);
    }
    return {
      content,
      model: String(data?.model ?? model),
      usage: {
        promptTokens: Number(data?.usage?.prompt_tokens) || 0,
        completionTokens: Number(data?.usage?.completion_tokens) || 0,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  const CORS = corsFor(req);
  const json = jsonWith(CORS);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) return json(500, { error: 'AI is not configured on the server yet.' });

  // ── Authenticate the caller with their own JWT ──
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await anonClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: 'Sign in to use AI analysis.' });
  const userId = userData.user.id;

  // Burst protection (per-isolate; the atomic daily quota below is the
  // authoritative limit).
  if (rateLimited(userId, RATE_PER_MINUTE)) {
    return json(429, { error: 'Too many AI requests. Wait a minute and try again.' });
  }

  // ── Parse and bound the request ──
  let body: { task?: string; system?: string; user?: string; model?: string; maxTokens?: number };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }
  const task = typeof body.task === 'string' ? body.task : 'unknown';
  const system = typeof body.system === 'string' ? body.system : '';
  const userMsg = typeof body.user === 'string' ? body.user : '';
  if (!system || !userMsg) return json(400, { error: 'Missing prompt.' });
  if (system.length + userMsg.length > MAX_INPUT_CHARS) {
    return json(413, { error: 'Prompt too large.' });
  }
  const maxTokens = Math.min(
    Math.max(256, Number(body.maxTokens) || 4096),
    MAX_OUTPUT_TOKENS,
  );

  const allowed = configuredModels();
  // An explicitly requested model must be on the allowlist; it is tried first.
  const requested = resolveRequestedModel(body.model, allowed);
  const chain = requested
    ? [requested, ...allowed.filter((m) => m !== requested)]
    : allowed;

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const limit = Number(Deno.env.get('CAREERS_AI_DAILY_LIMIT') ?? '60');
  const today = new Date().toISOString().slice(0, 10);

  // ── Entitlement ──
  // Read with the SERVICE ROLE, never the caller's client: the point is to
  // learn what they are actually entitled to, and the caller can influence
  // anything read through their own token. Joined to subscription_plans so the
  // quota comes from the plan row rather than from an env var shared by every
  // account (see ./entitlement.ts for what this replaces). The free money-tool
  // tasks run on every plan, so they skip the lookup.
  let snapshot: PlanSnapshot | null = null;
  if (!isFreeTierTask(task)) {
    const { data: subRow, error: subError } = await admin
      .from('subscriptions')
      .select('plan_id, subscription_plans(ai_quota_monthly)')
      .eq('user_id', userId)
      .in('status', ['trialing', 'active', 'past_due'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subError) {
      // Not a 402: a paying user must not be told to upgrade because a read failed.
      console.error(JSON.stringify({ fn: 'careers-ai', task, stage: 'plan-lookup', code: subError.code }));
      return json(503, { error: 'Could not check your plan right now. Please try again.' });
    }
    const planJoin = (subRow as { subscription_plans?: { ai_quota_monthly: number | null } | null } | null)
      ?.subscription_plans ?? null;
    snapshot = subRow
      ? {
          planId: (subRow as { plan_id?: string }).plan_id ?? null,
          // A join that came back empty must not read as "unlimited".
          aiQuotaMonthly: planJoin ? planJoin.ai_quota_monthly : FREE_PLAN_FALLBACK_QUOTA,
        }
      : null;
  }

  const entitlement = decideEntitlement(task, snapshot);
  if (!entitlement.allowed) {
    console.info(JSON.stringify({ fn: 'careers-ai', task, refused: 'entitlement', plan: entitlement.planId }));
    return json(entitlement.status, { error: entitlement.reason });
  }
  const monthLimit = entitlement.monthlyCallLimit ?? 0; // 0 = unlimited, per the RPC

  // ── Response cache ──
  // Checked before metering: a cache hit costs nothing, so charging a call or
  // a token against it would be metering something that never happened. The
  // burst limiter above still applies, which is what keeps the cache itself
  // from becoming a free hammer.
  const hash = await promptHash(requested ?? '', system, userMsg);
  if (CACHE_TTL_MS > 0) {
    const { data: cached } = await admin
      .from('ai_response_cache')
      .select('content, model, created_at')
      .eq('user_id', userId)
      .eq('prompt_hash', hash)
      .maybeSingle();
    if (cached?.content && Date.now() - new Date(cached.created_at).getTime() < CACHE_TTL_MS) {
      console.info(JSON.stringify({ fn: 'careers-ai', task, cached: true, model: cached.model }));
      return json(200, {
        content: cached.content,
        model: cached.model,
        task,
        ms: 0,
        cached: true,
        promptTokens: 0,
        completionTokens: 0,
      });
    }
  }

  // ── Daily metering: calls, tokens, and a global ceiling ──
  // One atomic RPC so concurrent requests cannot race past a quota. Returns
  // the post-increment call count, or a negative sentinel naming which limit
  // was hit.
  let metered = false;
  let { data: gateData, error: gateError } = await admin.rpc('begin_ai_call_v2', {
    p_user_id: userId,
    p_day: today,
    p_call_limit: limit,
    p_month_limit: monthLimit,
    p_quota_call: entitlement.quotaCall,
    p_token_limit: DAILY_TOKEN_BUDGET,
    p_global_limit: GLOBAL_DAILY_TOKENS,
  });
  if (gateError) {
    // v2 not deployed yet: fall back to the call/token meter, which enforces
    // everything except the monthly quota. Degrading to the previous behaviour
    // beats failing every request closed during a rollout.
    ({ data: gateData, error: gateError } = await admin.rpc('begin_ai_call', {
      p_user_id: userId,
      p_day: today,
      p_call_limit: limit,
      p_token_limit: DAILY_TOKEN_BUDGET,
      p_global_limit: GLOBAL_DAILY_TOKENS,
    }));
  }
  if (!gateError) {
    metered = true;
    const code = Number(gateData);
    if (code === -1) return json(429, { error: 'Daily AI limit reached. Try again tomorrow.' });
    if (code === -2) {
      return json(429, { error: "You've used today's AI allowance. It resets tomorrow." });
    }
    if (code === -3) {
      // Deliberately not phrased as the user's fault — it is not.
      return json(503, { error: 'AI is at capacity right now. Please try again later.' });
    }
    if (code === -4) {
      return json(429, {
        error: "You've used this month's AI analyses for your plan. It resets next month.",
      });
    }
  } else {
    // The token-budget RPC is not deployed yet. Fall back to the call-only
    // meter so an un-migrated deployment keeps working rather than failing
    // closed on every request.
    const { data: meterData, error: meterError } = await admin.rpc('increment_ai_usage', {
      p_user_id: userId,
      p_day: today,
      p_limit: limit,
    });
    if (meterError) {
      const { data: usage } = await admin
        .from('careers_ai_usage')
        .select('calls')
        .eq('user_id', userId)
        .eq('day', today)
        .maybeSingle();
      const calls = usage?.calls ?? 0;
      if (calls >= limit) {
        return json(429, { error: 'Daily AI limit reached. Try again tomorrow.' });
      }
      await admin
        .from('careers_ai_usage')
        .upsert({ user_id: userId, day: today, calls: calls + 1 }, { onConflict: 'user_id,day' });
    } else if (Number(meterData) === -1) {
      return json(429, { error: 'Daily AI limit reached. Try again tomorrow.' });
    }
  }

  // ── Walk the fallback chain ──
  const started = Date.now();
  const errors: string[] = [];
  for (const model of chain) {
    try {
      const { content, model: used, usage: tokenUsage } = await callModel(
        apiKey, model, system, userMsg, maxTokens,
      );
      // Structured, PII-free observability. The completion itself is NEVER
      // logged: for the `parse` task it is the user's résumé rendered as JSON
      // (name, email, phone, employers, credential ids), and edge-function logs
      // have neither the RLS protection nor the retention policy that the
      // careers tables do. Log only shape and cost.
      console.info(JSON.stringify({
        fn: 'careers-ai', task, model: used, ms: Date.now() - started,
        promptTokens: tokenUsage.promptTokens, completionTokens: tokenUsage.completionTokens,
      }));

      // Record the real cost and populate the cache. Both are best-effort and
      // deliberately not awaited into the failure path: the user has a valid
      // answer, and losing a meter update must never turn that into an error.
      // The metering write is skipped when the gate RPC was unavailable —
      // there is nothing on the old schema to record tokens into.
      if (metered) {
        admin.rpc('record_ai_tokens', {
          p_user_id: userId,
          p_day: today,
          p_prompt: tokenUsage.promptTokens,
          p_completion: tokenUsage.completionTokens,
        }).then(undefined, () => undefined);
      }
      if (CACHE_TTL_MS > 0) {
        admin.from('ai_response_cache').upsert(
          { user_id: userId, prompt_hash: hash, task, model: used, content, created_at: new Date().toISOString() },
          { onConflict: 'user_id,prompt_hash' },
        ).then(
          () => admin.rpc('prune_ai_cache', {}).then(undefined, () => undefined),
          () => undefined,
        );
      }

      return json(200, {
        content,
        model: used,
        task,
        ms: Date.now() - started,
        promptTokens: tokenUsage.promptTokens,
        completionTokens: tokenUsage.completionTokens,
      });
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  console.error('careers-ai: all models failed', { task, errors });
  return json(502, { error: 'AI analysis is temporarily unavailable. Please try again.' });
});
