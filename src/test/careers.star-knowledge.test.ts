/**
 * Regression: Knowledge Base stories flow into the STAR prompt (the Phase 3
 * gap where knowledgeDigest() existed but was never passed to buildStarPrompt).
 */
import { describe, it, expect } from 'vitest';
import { buildStarPrompt } from '../careers/ai/prompts-jobs';
import { knowledgeDigest } from '../careers/services/knowledge';
import type { KnowledgeItemRow } from '../careers/types/phase3';

const item = (over: Partial<KnowledgeItemRow>): KnowledgeItemRow =>
  ({
    id: 'k1', user_id: 'u1', kind: 'star', title: 'Migrated risk models',
    body: 'Led the migration of 12 credit-risk models to a new platform.',
    tags: [], created_at: '', updated_at: '',
    ...over,
  }) as KnowledgeItemRow;

describe('STAR prompt × Knowledge Base integration', () => {
  it('includes saved stories in the user prompt when knowledge is provided', () => {
    const digest = knowledgeDigest([item({}), item({ id: 'k2', title: 'AML case win' })]);
    const { user, system } = buildStarPrompt('resume digest', 'Tell me about a challenge', '', digest);
    expect(user).toContain('SAVED STORIES');
    expect(user).toContain('Migrated risk models');
    expect(user).toContain('AML case win');
    expect(system).toContain('saved stories');
  });

  it('omits the saved-stories section when there is no knowledge', () => {
    const { user } = buildStarPrompt('resume digest', 'Tell me about a challenge', '');
    expect(user).not.toContain('SAVED STORIES');
  });

  it('caps the digest at the requested number of items', () => {
    const many = Array.from({ length: 15 }, (_, i) => item({ id: `k${i}`, title: `Story ${i}` }));
    const digest = knowledgeDigest(many, 10);
    expect(digest).toContain('Story 9');
    expect(digest).not.toContain('Story 10');
  });
});
