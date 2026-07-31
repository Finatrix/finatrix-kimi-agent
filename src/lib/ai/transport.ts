/**
 * The application's single AI transport.
 *
 * The browser never holds an OpenRouter key: every request goes to the
 * `careers-ai` Supabase Edge Function, which authenticates the user's JWT,
 * meters daily usage, enforces a model allowlist and token caps, and walks the
 * configured model fallback chain server-side.
 *
 * This module owns that HTTP contract *once*. Callers get a discriminated
 * result — never an exception — and map it to whatever error surface their
 * module already uses (Careers maps to CareersError; the Money tools render an
 * inline message). Adding a second consumer must never mean a second copy of
 * the transport.
 *
 * The edge function requests `response_format: json_object`, so every task
 * — including conversational ones — asks the model for a JSON object.
 */

import { supabase } from '../supabase';
import { invokeAuthed } from '../functions';
import { logAiUsage } from './usage';

export interface AiCompletionRequest {
  /** Opaque label used for metering and observability (e.g. 'parse', 'chat'). */
  task: string;
  system: string;
  user: string;
  /** Preferred model id; empty/undefined lets the server pick its default chain. */
  model?: string;
  maxTokens?: number;
}

export interface AiCompletionSuccess {
  ok: true;
  content: string;
  /** The model that actually answered (after any server-side fallback). */
  model: string;
  /** Wall-clock duration reported by the provider, in ms. */
  ms: number;
  promptTokens: number;
  completionTokens: number;
}

/**
 * Why a completion could not be produced. Kinds are transport-level facts, not
 * user-facing copy — each consumer phrases them for its own audience.
 */
export type AiFailureKind =
  /** Supabase env vars are missing from this build. */
  | 'not-configured'
  /** No signed-in session; the edge function requires one. */
  | 'no-session'
  /** The session was rejected (401). */
  | 'auth'
  /** Daily quota or burst limit hit (429). */
  | 'limit'
  /** The edge function is not deployed on this project (404). */
  | 'not-deployed'
  /** Could not reach the service at all. */
  | 'network'
  /** The model answered with nothing usable. */
  | 'empty'
  /** Anything else the server reported. */
  | 'failed';

export interface AiCompletionFailure {
  ok: false;
  kind: AiFailureKind;
  /** Server-provided detail when there was one; '' otherwise. */
  message: string;
}

export type AiCompletionResult = AiCompletionSuccess | AiCompletionFailure;

interface FunctionPayload {
  content?: string;
  model?: string;
  ms?: number;
  promptTokens?: number;
  completionTokens?: number;
}

/** Classify a Supabase FunctionsHttpError into a transport failure. */
async function classify(error: unknown): Promise<AiCompletionFailure> {
  // FunctionsHttpError carries the raw Response in `context`.
  const ctx = (error as { context?: Response })?.context;
  if (ctx instanceof Response) {
    let message = '';
    try {
      const body = (await ctx.clone().json()) as { error?: string };
      message = typeof body.error === 'string' ? body.error : '';
    } catch {
      /* non-JSON error body */
    }
    if (ctx.status === 401) return { ok: false, kind: 'auth', message };
    if (ctx.status === 429) return { ok: false, kind: 'limit', message };
    if (ctx.status === 404) return { ok: false, kind: 'not-deployed', message };
    return { ok: false, kind: 'failed', message };
  }
  const msg = error instanceof Error ? error.message : '';
  if (/fetch|network|Failed to send/i.test(msg)) return { ok: false, kind: 'network', message: '' };
  return { ok: false, kind: 'failed', message: '' };
}

/** Best-effort current user id for usage telemetry — never blocks the AI call. */
async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function meter(task: string, model: string, latencyMs: number, extra: {
  promptTokens?: number; completionTokens?: number; success: boolean; error?: string;
}): void {
  void currentUserId().then((uid) => {
    if (uid) logAiUsage(uid, { task, model, latencyMs, ...extra });
  });
}

/**
 * Ask the model for a completion. Resolves with a discriminated result and
 * never rejects, so callers can branch exhaustively instead of guessing at
 * exception shapes. Usage is metered for both outcomes, fire-and-forget.
 */
export async function requestCompletion(req: AiCompletionRequest): Promise<AiCompletionResult> {
  const started = Date.now();
  const { data, error, reason } = await invokeAuthed<FunctionPayload>('careers-ai', {
    task: req.task,
    system: req.system,
    user: req.user,
    model: req.model || undefined,
    maxTokens: req.maxTokens,
  });

  if (reason === 'not-configured') return { ok: false, kind: 'not-configured', message: '' };
  if (reason === 'no-session') return { ok: false, kind: 'no-session', message: '' };

  if (error) {
    const failure = await classify(error);
    meter(req.task, req.model ?? '', Date.now() - started, { success: false, error: failure.message || failure.kind });
    return failure;
  }

  const payload = (data ?? {}) as FunctionPayload;
  const content = payload.content;
  const model = String(payload.model ?? '');
  const ms = Number(payload.ms ?? 0);
  const promptTokens = Number(payload.promptTokens ?? 0);
  const completionTokens = Number(payload.completionTokens ?? 0);

  if (typeof content !== 'string' || !content.trim()) {
    meter(req.task, model, ms, { success: false, error: 'empty response' });
    return { ok: false, kind: 'empty', message: '' };
  }

  meter(req.task, model, ms, { promptTokens, completionTokens, success: true });
  return { ok: true, content, model, ms, promptTokens, completionTokens };
}
