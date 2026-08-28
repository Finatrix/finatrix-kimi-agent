/**
 * FinatriX AI — the one place a question becomes an answer.
 *
 * The transport is `src/lib/ai/transport.ts`, the same module Careers uses, so
 * there is exactly one implementation of "how do we reach OpenRouter" and the
 * browser never holds a key. This file is the money-tools adapter: it builds the
 * data snapshot, fences the prompt, calls the shared transport and maps the
 * transport's failure kinds onto wording that fits this surface.
 *
 * It resolves with a discriminated result and never rejects, matching the
 * transport's own contract.
 */

import { requestCompletion } from '../../lib/ai/transport';
import { assessConfidence, confidenceInstruction, type Confidence } from './confidence';
import { buildSnapshot, type FinanceSnapshot, type SnapshotInput } from './context';
import { describeFocus, type AiFocus } from './focus';
import { buildFocusDetail } from './focusData';
import {
  SYSTEM_PROMPT, buildUserMessage, sanitizeQuestion, MONTHLY_REVIEW_QUESTION,
} from './prompts';
import { parseAiAnswer, type AiAnswer } from './validate';

/** Room for a full monthly review; the edge function caps it at 8,192. */
const MAX_OUTPUT_TOKENS = 3_200;

/**
 * The model this surface asks for first.
 *
 * The edge function walks a fallback chain and its default chain leads with a
 * fast, cheap model — the right choice for the Careers tasks it was built for,
 * which are extraction and classification. This surface is different: the
 * questions are open-ended, half of them are teaching rather than lookup, and
 * the answer has to hold a grounding contract, a mode decision and a JSON
 * schema at the same time. That is reasoning work, and it is worth the stronger
 * model.
 *
 * Requested, never required. The server only honours a model on its allowlist
 * and falls back through the rest of the chain if it is unavailable, so a
 * deployment that has not been configured for this model still answers — just
 * with the next one down.
 */
const CHAT_MODEL = 'anthropic/claude-sonnet-5';

export interface AskSuccess extends AiAnswer {
  ok: true;
  /** Which model answered, after any server-side fallback. */
  model: string;
  /**
   * How much data the answer stands on. Measured from the snapshot before the
   * model was called — never something the model was asked to rate about
   * itself. See `confidence.ts`.
   *
   * Null for a `general` answer. The badge rates the user's *records*, and an
   * explanation of how compounding works did not stand on them — badging it
   * "Low confidence" because the account is new would be a false statement
   * about a correct answer.
   */
  confidence: Confidence | null;
}

export interface AskFailure {
  ok: false;
  /** User-facing sentence, already phrased for this surface. */
  message: string;
  /** True when retrying the same question could plausibly work. */
  retryable: boolean;
}

export type AskResult = AskSuccess | AskFailure;

export interface AskOptions extends SnapshotInput {
  question: string;
  /** Recent turns, oldest first, for follow-up questions. */
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  /**
   * What the user was looking at when they asked. Carries identity only — the
   * figures behind it are resolved here, from the store, at ask-time.
   */
  focus?: AiFocus | null;
}

/**
 * Ask a question about the signed-in user's own money data.
 *
 * The snapshot is rebuilt for every question rather than cached: the user can
 * log a transaction with the panel open, and an assistant answering from a stale
 * snapshot would be confidently wrong.
 */
export async function ask(opts: AskOptions): Promise<AskResult> {
  const question = sanitizeQuestion(opts.question);
  if (!question) {
    return { ok: false, message: 'Ask a question about your budget or spending.', retryable: false };
  }

  let snapshot: FinanceSnapshot;
  try {
    snapshot = buildSnapshot(opts);
  } catch {
    return {
      ok: false,
      message: 'Could not read your data just now. Reload the page and try again.',
      retryable: true,
    };
  }

  // Measured before the call, so the badge the user sees and the hedging the
  // model is told to apply come from the same reading of the evidence.
  const confidence = assessConfidence(snapshot);

  // A focus that cannot be resolved (a category that no longer exists, say) is
  // not worth failing over — the snapshot alone still answers most questions.
  let focusDetail: unknown = null;
  if (opts.focus) {
    try {
      focusDetail = buildFocusDetail(opts.focus, opts);
    } catch {
      focusDetail = null;
    }
  }

  const result = await requestCompletion({
    task: 'money-chat',
    model: CHAT_MODEL,
    system: SYSTEM_PROMPT,
    user: buildUserMessage(snapshot, question, opts.history ?? [], {
      focusSubject: opts.focus ? describeFocus(opts.focus).title : undefined,
      focusDetail,
      confidenceInstruction: confidenceInstruction(confidence),
    }),
    maxTokens: MAX_OUTPUT_TOKENS,
  });

  if (!result.ok) return failureFor(result.kind, result.message);

  const parsed = parseAiAnswer(result.content);
  if (!parsed) {
    return {
      ok: false,
      message: 'The assistant returned an empty answer. Please ask again.',
      retryable: true,
    };
  }

  return {
    ok: true,
    model: result.model,
    ...parsed,
    confidence: parsed.mode === 'general' ? null : confidence,
  };
}

/** Generate the fixed monthly review brief for the month in the snapshot. */
export function askForMonthlyReview(opts: Omit<AskOptions, 'question'>): Promise<AskResult> {
  // No history: the review is a standalone document, and replaying chat into it
  // makes the same month produce a different report each time.
  return ask({ ...opts, question: MONTHLY_REVIEW_QUESTION, history: [] });
}

/**
 * Transport failures, phrased for someone looking at their own budget rather
 * than at a stack trace. Careers maps the same kinds onto CareersError; the
 * kinds are shared, the wording is not.
 */
function failureFor(kind: string, detail: string): AskFailure {
  switch (kind) {
    case 'not-configured':
      return {
        ok: false,
        retryable: false,
        message: 'FinatriX AI needs the backend configured for this build.',
      };
    case 'no-session':
    case 'auth':
      return {
        ok: false,
        retryable: false,
        message: 'Sign in to ask FinatriX AI about your money — it only ever reads your own data.',
      };
    case 'limit':
      return {
        ok: false,
        retryable: false,
        message: detail || 'You have reached today’s AI limit. It resets tomorrow.',
      };
    case 'not-deployed':
      return {
        ok: false,
        retryable: false,
        message: 'FinatriX AI is not available on this deployment yet.',
      };
    case 'network':
      return {
        ok: false,
        retryable: true,
        message: 'Could not reach FinatriX AI. Check your connection and try again.',
      };
    case 'empty':
      return {
        ok: false,
        retryable: true,
        message: 'The assistant returned an empty answer. Please ask again.',
      };
    default:
      return {
        ok: false,
        retryable: true,
        message: detail || 'FinatriX AI could not answer that. Please try again.',
      };
  }
}
