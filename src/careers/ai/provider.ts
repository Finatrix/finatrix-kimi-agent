/**
 * AI provider layer. Every AI request in the Careers module flows through
 * here — pages and services never talk to a model API directly.
 *
 * The active provider is a single configuration value below. Adding a new
 * backend (OpenAI, Anthropic, Google, Azure, a local LLM…) means writing one
 * transport that implements AiProvider and registering it in PROVIDERS.
 */

import { openRouterProvider } from './openrouter';

export type AiTask = 'parse' | 'dna' | 'score' | 'ats';

export interface AiRequest {
  task: AiTask;
  system: string;
  user: string;
  /** Preferred model id; empty string lets the server pick its default chain. */
  model?: string;
  maxTokens?: number;
}

export interface AiCompletion {
  content: string;
  /** The model that actually answered (after any server-side fallback). */
  model: string;
  /** Wall-clock duration reported by the provider, in ms. */
  ms: number;
  /** Token counts when the transport can report them (0 otherwise). */
  promptTokens: number;
  completionTokens: number;
}

export interface AiProvider {
  readonly id: string;
  complete(req: AiRequest): Promise<AiCompletion>;
}

const PROVIDERS: Record<string, AiProvider> = {
  openrouter: openRouterProvider,
};

/** The single switch that selects the AI backend. */
const ACTIVE_PROVIDER = 'openrouter';

export function getAiProvider(): AiProvider {
  return PROVIDERS[ACTIVE_PROVIDER];
}
