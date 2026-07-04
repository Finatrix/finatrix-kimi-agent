/**
 * AI Knowledge Base (Phase 3, Module 19). STAR stories, notes, achievements,
 * leadership/failure/success stories and projects — searchable, and reused
 * by the interview simulator when building STAR answers.
 */

import { supabase } from '../../lib/supabase';
import type { KnowledgeItemRow, KnowledgeKind } from '../types/phase3';
import { mapSupabaseError } from '../utils/errors';
import { sanitizeField, sanitizeProse, sanitizeStringArray } from '../utils/sanitize';

export async function listKnowledgeItems(userId: string): Promise<KnowledgeItemRow[]> {
  const { data, error } = await supabase
    .from('knowledge_items')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw mapSupabaseError(error, 'Loading your knowledge base');
  return (data ?? []) as KnowledgeItemRow[];
}

export async function upsertKnowledgeItem(
  userId: string,
  fields: Partial<KnowledgeItemRow> & { title: string; id?: string }
): Promise<KnowledgeItemRow> {
  const payload = {
    user_id: userId,
    kind: (fields.kind ?? 'note') as KnowledgeKind,
    title: sanitizeField(fields.title, 200),
    body: sanitizeProse(fields.body ?? '', 6_000),
    tags: sanitizeStringArray(fields.tags ?? [], 12, 40),
  };
  const query = fields.id
    ? supabase.from('knowledge_items').update(payload).eq('user_id', userId).eq('id', fields.id)
    : supabase.from('knowledge_items').insert(payload);
  const { data, error } = await query.select().single();
  if (error) throw mapSupabaseError(error, 'Saving the item');
  return data as KnowledgeItemRow;
}

export async function deleteKnowledgeItem(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('knowledge_items').delete().eq('user_id', userId).eq('id', id);
  if (error) throw mapSupabaseError(error, 'Deleting the item');
}

export function searchKnowledge(items: KnowledgeItemRow[], query: string): KnowledgeItemRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => [i.title, i.body, i.tags.join(' ')].join(' ').toLowerCase().includes(q));
}

/** Compact digest handed to interview-answer prompts so STAR answers can draw on real stories. */
export function knowledgeDigest(items: KnowledgeItemRow[], max = 10): string {
  return items.slice(0, max).map((i) => `[${i.kind}] ${i.title}: ${i.body.slice(0, 400)}`).join('\n');
}
