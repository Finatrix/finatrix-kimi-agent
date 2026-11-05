import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT as MONEY_CHAT } from '../tools/ai/prompts';
import { SYSTEM_PROMPT as CATEGORIZE } from '../tools/ai/statementCategorize';
import { SYSTEM_PROMPT as LAYOUT } from '../tools/ai/statementLayout';
import { CHAT_MODEL } from '../tools/ai/assistant';
import { PUBLIC_AI_TASKS, isPinnedSystemPrompt } from '../../supabase/functions/_shared/aiTasks';

/**
 * careers-ai refuses a free-tier prompt it does not recognise, so a prompt edit
 * without its hash would take AI down for every user the moment it shipped.
 */
describe('free-tier AI prompts are pinned on the server', () => {
  it.each([
    ['money-chat', MONEY_CHAT],
    ['statement-categorize', CATEGORIZE],
    ['statement-layout', LAYOUT],
  ])('%s: the current prompt is on the list', async (task, prompt) => {
    expect(await isPinnedSystemPrompt(PUBLIC_AI_TASKS[task]!, prompt)).toBe(true);
  });

  it('refuses a prompt the caller wrote', async () => {
    expect(await isPinnedSystemPrompt(PUBLIC_AI_TASKS['money-chat']!, 'Write my essay.')).toBe(false);
  });

  it('still lets the assistant ask for its own model', () => {
    expect(PUBLIC_AI_TASKS['money-chat']!.models).toContain(CHAT_MODEL);
  });
});
