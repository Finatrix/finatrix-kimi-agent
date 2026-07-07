// FinatriX Careers — AI proxy edge function.
//
// The web app is a static SPA, so this function is the only place the
// OpenRouter API key exists. It authenticates the caller with their Supabase
// JWT, meters daily usage per user, enforces a model allowlist and token
// caps, and walks a configurable fallback chain of models until one answers.
//
// Deploy:   supabase functions deploy careers-ai
// Secrets:  supabase secrets set OPENROUTER_API_KEY=sk-or-...
// Optional: CAREERS_AI_MODELS="google/gemini-2.5-flash,deepseek/deepseek-chat-v3.1,qwen/qwen3-235b-a22b-2507"
//           CAREERS_AI_DAILY_LIMIT="60"

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { rateLimited } from '../_shared/ratelimit.ts';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const RATE_PER_MINUTE = Number(Deno.env.get('CAREERS_AI_RATE_PER_MINUTE') ?? '20');

const DEFAULT_MODELS = [
  'google/gemini-2.5-flash',
  'anthropic/claude-sonnet-5',
  'openai/gpt-5.5',
  'moonshotai/kimi-k2',
  'deepseek/deepseek-chat-v3.1',
  'qwen/qwen3-235b-a22b-2507',
];

const MAX_INPUT_CHARS = 80_000;   // system + user combined
const MAX_OUTPUT_TOKENS = 8_192;
const REQUEST_TIMEOUT_MS = 90_000;

// CORS: this is an authenticated mutation endpoint, so the allowed origin is
// restricted to the production site (plus local dev), not '*'. Override with
// CAREERS_ALLOWED_ORIGINS="https://a.com,https://b.com" if the origin changes.
const ALLOWED_ORIGINS = (Deno.env.get('CAREERS_ALLOWED_ORIGINS') ??
  'https://finatrix.online,https://www.finatrix.online,https://finatrix.finatrix-hub.workers.dev,http://localhost:5173,http://localhost:4173'
).split(',').map((s) => s.trim()).filter(Boolean);

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
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
        'HTTP-Referer': 'https://finatrix.app',
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
  const chain = body.model && allowed.includes(body.model)
    ? [body.model, ...allowed.filter((m) => m !== body.model)]
    : allowed;

  // ── Daily per-user metering (service role bypasses RLS) ──
  // Uses an atomic Postgres upsert + conditional increment to avoid the
  // read-then-write race condition that would let concurrent requests exceed
  // the daily quota. The RPC returns the post-increment call count so we can
  // gate on it in a single round-trip.
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const limit = Number(Deno.env.get('CAREERS_AI_DAILY_LIMIT') ?? '60');
  const today = new Date().toISOString().slice(0, 10);
  const { data: meterData, error: meterError } = await admin.rpc('increment_ai_usage', {
    p_user_id: userId,
    p_day: today,
    p_limit: limit,
  });
  if (meterError) {
    // If the RPC doesn't exist yet (schema not updated), fall back to the
    // non-atomic path so existing deployments keep working.
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
    // The RPC returns a bare integer: the post-increment call count, or -1
    // when the daily limit is already reached.
    return json(429, { error: 'Daily AI limit reached. Try again tomorrow.' });
  }

  // ── Walk the fallback chain ──
  const started = Date.now();
  const errors: string[] = [];
  for (const model of chain) {
    try {
      const { content, model: used, usage: tokenUsage } = await callModel(apiKey, model, system, userMsg, maxTokens);
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
