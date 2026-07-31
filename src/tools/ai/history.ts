/**
 * Conversation history — one transcript per authenticated user.
 *
 * Stored per user id, so signing in as somebody else can never surface the
 * previous account's conversation, and `pruneOtherUsers` deletes any transcript
 * that is not the current user's the moment the panel opens. A conversation
 * about someone's rent and medical spending should not outlive their session on
 * a shared device.
 *
 * Deliberately outside `SYNC_KEYS`: the cloud row holds the user's financial
 * records, and a chat transcript is a device-local convenience, not a record.
 * Keeping it out of the sync payload also leaves that contract untouched.
 */

import { store, getJSON, setJSON } from '../lib/storage';
import type { Confidence } from './confidence';
import type { AiChart } from './validate';

const PREFIX = 'fx_ai_chat_';
/** Kept short: this is context for a follow-up, not an archive. */
const MAX_MESSAGES = 40;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** ISO timestamp. */
  at: string;
  /** Assistant turns only. */
  model?: string;
  chart?: AiChart | null;
  followUps?: string[];
  /** How much data the answer stood on, measured when it was given. */
  confidence?: Confidence;
  /** What the question was about, for the subject line above a turn. */
  focusTitle?: string;
  /** True when this turn is a failure notice rather than an answer. */
  failed?: boolean;
}

function keyFor(uid: string): string {
  return PREFIX + uid;
}

export function loadHistory(uid: string): ChatMessage[] {
  if (!uid) return [];
  const raw = getJSON<unknown>(keyFor(uid), []);
  if (!Array.isArray(raw)) return [];
  return raw.filter(isMessage).slice(-MAX_MESSAGES);
}

export function saveHistory(uid: string, messages: ChatMessage[]): void {
  if (!uid) return;
  setJSON(keyFor(uid), messages.slice(-MAX_MESSAGES));
}

export function clearHistory(uid: string): void {
  if (!uid) return;
  store.remove(keyFor(uid));
}

/**
 * Drop every stored transcript that does not belong to `uid`. Called when the
 * assistant opens, which is the first moment we know who is signed in.
 * Enumerating localStorage directly is intentional — the storage wrapper has no
 * key listing, and this must also catch keys written before a sign-out.
 */
export function pruneOtherUsers(uid: string): void {
  let keys: string[];
  try {
    keys = Object.keys(localStorage);
  } catch {
    return; // storage blocked — nothing was persisted to prune
  }
  for (const k of keys) {
    if (k.startsWith(PREFIX) && k !== keyFor(uid)) store.remove(k);
  }
}

/** Generate a message id. Mirrors `genExpenseId`'s fallback for old webviews. */
export function newMessageId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return 'm_' + crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return 'm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function isMessage(v: unknown): v is ChatMessage {
  if (!v || typeof v !== 'object') return false;
  const m = v as Partial<ChatMessage>;
  return typeof m.id === 'string'
    && (m.role === 'user' || m.role === 'assistant')
    && typeof m.text === 'string'
    && typeof m.at === 'string';
}
