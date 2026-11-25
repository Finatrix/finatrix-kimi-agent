/**
 * The AI built into the phone: Apple's on-device model (iPhone, iOS 26+, with
 * Apple Intelligence on) and Gemini Nano (supported Android phones), through
 * the in-repo `FxOnDeviceAi` plugin:
 *   ios/App/App/FxOnDeviceAiPlugin.swift      (FoundationModels)
 *   android/app/src/main/java/co/finatrix/app/OnDeviceAiPlugin.java
 *                                             (ML Kit GenAI Prompt API)
 *
 * It is a second path *inside* `requestCompletion`, never a second transport:
 * the consent gate runs before it, and every caller's own checks (the money
 * chat's grounding, the action resolver, category validation) run on its
 * answer exactly as they run on the cloud's. The model ranks and explains; it
 * never sets a number, here as everywhere.
 *
 * The cloud AI stays the fallback. Whenever the phone has no model, the model
 * is still downloading, the request is too long for it, it refuses, errors,
 * takes too long, or its reply fails the caller's own check, the request goes
 * to the cloud exactly as it did before this path existed.
 */
import { registerPlugin } from '@capacitor/core';
import { useEffect, useState } from 'react';
import { isNativeApp } from '../../native/platform';
import { extractJson } from './json';

/** Which on-device model a phone has. */
export type OnDeviceEngine = 'apple' | 'gemini-nano';

/**
 * - `available`: ready to answer now.
 * - `preparing`: supported, but the model is still downloading or Apple
 *   Intelligence is switched off. Cloud answers meanwhile.
 * - `unsupported`: this phone (or the web) has no on-device model.
 */
export type OnDeviceState = 'available' | 'preparing' | 'unsupported';

export interface OnDeviceStatus {
  state: OnDeviceState;
  engine: OnDeviceEngine | null;
  /** The model's context window in tokens, as the phone reports it. */
  contextTokens: number;
}

interface FxOnDeviceAiPlugin {
  status(options?: { prepare?: boolean }): Promise<{ state?: unknown; engine?: unknown; contextTokens?: unknown }>;
  generate(options: { system: string; user: string; maxTokens: number }): Promise<{ content?: unknown }>;
}

const FxOnDeviceAi = registerPlugin<FxOnDeviceAiPlugin>('FxOnDeviceAi');

export const UNSUPPORTED: OnDeviceStatus = { state: 'unsupported', engine: null, contextTokens: 0 };

/**
 * The tasks small enough, and checked closely enough, to answer on the phone:
 * the money chat (only when the whole request fits — see `planOnDevice`), the
 * voice assistant's action picker, and category suggestions for a statement
 * import. Careers (long resumes) and statement layout stay in the cloud.
 */
export const ON_DEVICE_TASKS: ReadonlySet<string> = new Set(['money-chat', 'money-action', 'statement-categorize']);

/** A slow phone must not leave the user waiting longer than the cloud would. */
export const ON_DEVICE_TIMEOUT_MS = 30_000;

/** Output tokens a request must leave room for before it is worth trying. */
export const MIN_OUTPUT_RESERVE = 1_024;

const MODEL_LABEL: Record<OnDeviceEngine, string> = {
  apple: 'Apple on-device model',
  'gemini-nano': 'Gemini Nano on this phone',
};

export function onDeviceModelLabel(engine: OnDeviceEngine): string {
  return MODEL_LABEL[engine];
}

// ── The user's choice ────────────────────────────────────────────────────────

const PREF_KEY = 'fx_ai_on_device';
const PREF_EVENT = 'fx:ai-on-device';

/**
 * Whether to use the phone's own AI when it can. On unless turned off: the
 * same answer that stays on the phone is the more private one. Per device,
 * like the AI consent itself, and never synced.
 */
export function onDevicePreferred(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setOnDevicePreferred(on: boolean): void {
  try {
    if (on) localStorage.removeItem(PREF_KEY);
    else localStorage.setItem(PREF_KEY, '0');
  } catch {
    /* Storage blocked: the choice lasts as long as this page does. */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PREF_EVENT));
}

// ── Status ──────────────────────────────────────────────────────────────────

/** A plugin answer, checked: anything unexpected reads as "unsupported". */
export function toStatus(raw: { state?: unknown; engine?: unknown; contextTokens?: unknown } | null | undefined): OnDeviceStatus {
  const engine = raw?.engine === 'apple' || raw?.engine === 'gemini-nano' ? raw.engine : null;
  const state = raw?.state === 'available' || raw?.state === 'preparing' ? raw.state : 'unsupported';
  const contextTokens = typeof raw?.contextTokens === 'number' && Number.isFinite(raw.contextTokens)
    ? Math.max(0, Math.floor(raw.contextTokens))
    : 0;
  if (!engine || state === 'unsupported') return UNSUPPORTED;
  if (state === 'available' && contextTokens <= 0) return { state: 'preparing', engine, contextTokens: 0 };
  return { state, engine, contextTokens };
}

/**
 * Ask the phone. Never rejects: the web, an old app build or an error is
 * "unsupported". `prepare` lets Android start downloading Gemini Nano when it
 * is supported but not on the phone yet; only a request about to use the
 * model passes it, never a screen that merely describes it.
 */
export async function onDeviceStatus(prepare = false): Promise<OnDeviceStatus> {
  if (!isNativeApp()) return UNSUPPORTED;
  try {
    return toStatus(await FxOnDeviceAi.status({ prepare }));
  } catch {
    return UNSUPPORTED;
  }
}

/** The phone's status, for screens that describe it. `null` until known. */
export function useOnDeviceAi(): OnDeviceStatus | null {
  const [status, setStatus] = useState<OnDeviceStatus | null>(isNativeApp() ? null : UNSUPPORTED);
  useEffect(() => {
    if (!isNativeApp()) return;
    let live = true;
    void onDeviceStatus().then((s) => { if (live) setStatus(s); });
    return () => { live = false; };
  }, []);
  return status;
}

/** The user's choice, kept in step across every component that shows it. */
export function useOnDevicePreference(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(onDevicePreferred);
  useEffect(() => {
    const sync = () => setOn(onDevicePreferred());
    window.addEventListener(PREF_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(PREF_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return [on, setOnDevicePreferred];
}

// ── Does the request fit? ───────────────────────────────────────────────────

/**
 * A deliberately high token estimate. English runs about 4 characters a token;
 * JSON and digits run nearer 3; Indian scripts can be a token per character or
 * worse. So: 3 ASCII characters per token, and a token for every other
 * character. Overestimating only sends a request to the cloud that might have
 * fitted; underestimating would cost a failed on-device attempt first.
 */
export function estimateTokens(text: string): number {
  let ascii = 0;
  let other = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) < 128) ascii += 1;
    else other += 1;
  }
  return Math.ceil(ascii / 3) + other;
}

/**
 * How many output tokens to allow on the phone, or `null` when the request is
 * too long to be worth trying there.
 *
 * input = estimate(system) + estimate(user)
 * room  = contextTokens − input
 * Try only when room ≥ min(maxTokens, MIN_OUTPUT_RESERVE); then allow
 * min(maxTokens, room). A reply cut short by that limit is not valid JSON, so
 * it fails the check and goes to the cloud.
 */
export function planOnDevice(system: string, user: string, maxTokens: number, contextTokens: number): number | null {
  const wanted = Math.max(1, Math.floor(maxTokens));
  const room = contextTokens - estimateTokens(system) - estimateTokens(user);
  if (room < Math.min(wanted, MIN_OUTPUT_RESERVE)) return null;
  return Math.min(wanted, room);
}

// ── Asking ──────────────────────────────────────────────────────────────────

export interface OnDeviceRequest {
  task: string;
  system: string;
  user: string;
  maxTokens?: number;
  /** The caller's own test of a usable reply, on top of "a non-empty JSON object". */
  acceptLocal?: (content: string) => boolean;
}

export type OnDeviceOutcome =
  | { ok: true; content: string; model: string; ms: number }
  /** Why the cloud answers instead. For tests and logs; never shown to the user. */
  | { ok: false; reason: 'web' | 'off' | 'task' | 'unsupported' | 'preparing' | 'too-long' | 'failed' | 'timeout' | 'unusable' };

const DEFAULT_MAX_TOKENS = 1_024;

function isUsableJson(content: string): boolean {
  return Object.keys(extractJson(content)).length > 0;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve('timeout'), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

/**
 * Try to answer on the phone. Never rejects. The caller must already have
 * checked consent: this runs *after* the gate, never instead of it.
 */
export async function tryOnDevice(req: OnDeviceRequest): Promise<OnDeviceOutcome> {
  if (!isNativeApp()) return { ok: false, reason: 'web' };
  if (!ON_DEVICE_TASKS.has(req.task)) return { ok: false, reason: 'task' };
  if (!onDevicePreferred()) return { ok: false, reason: 'off' };

  const status = await onDeviceStatus(true);
  if (status.state !== 'available' || !status.engine) {
    return { ok: false, reason: status.state === 'preparing' ? 'preparing' : 'unsupported' };
  }

  const maxTokens = planOnDevice(req.system, req.user, req.maxTokens ?? DEFAULT_MAX_TOKENS, status.contextTokens);
  if (maxTokens == null) return { ok: false, reason: 'too-long' };

  const started = Date.now();
  let raw: { content?: unknown } | 'timeout';
  try {
    raw = await withTimeout(FxOnDeviceAi.generate({ system: req.system, user: req.user, maxTokens }), ON_DEVICE_TIMEOUT_MS);
  } catch {
    // Refused (guardrails), an unsupported language, context overflow, busy,
    // or any other error: all of them mean "ask the cloud".
    return { ok: false, reason: 'failed' };
  }
  if (raw === 'timeout') return { ok: false, reason: 'timeout' };

  const content = typeof raw?.content === 'string' ? raw.content : '';
  if (!isUsableJson(content) || (req.acceptLocal && !req.acceptLocal(content))) return { ok: false, reason: 'unusable' };

  return { ok: true, content, model: onDeviceModelLabel(status.engine), ms: Date.now() - started };
}
