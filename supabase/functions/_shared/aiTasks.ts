/**
 * The AI tasks any signed-in user may run, and exactly what each may ask for.
 *
 * Without this, careers-ai was a general model endpoint: the caller wrote the
 * system prompt and picked the model. Each task's prompt is pinned by hash, so
 * nothing is duplicated here and an installed app keeps working for as long as
 * its prompt is listed. Careers tasks are not listed: they need a paid plan.
 *
 * A prompt edit must add its hash here (`src/test/aiTasks.test.ts` fails until
 * it does). Never remove a hash while a mobile build that sends it is installed.
 */

export interface PublicAiTask {
  systemHashes: readonly string[];
  /** Models the caller may request first. Anything else starts at the chain's head. */
  models: readonly string[];
}

/** Above every value the listed tasks have shipped with. */
export const PUBLIC_MAX_OUTPUT_TOKENS = 4_096;

export const PUBLIC_AI_TASKS: Readonly<Record<string, PublicAiTask>> = {
  'money-chat': {
    models: ['anthropic/claude-sonnet-5.5'],
    systemHashes: [
      'a9af8512fbcb37b4bccfe0327412c4158bf784aec1a47e5f05e58cc916f3dd22',
      '211c84d7f55dc16b7a4e2500a80d072d51a2ea76e007dfc3f6d651db7d512116',
      '4b2913d3cc56ccbc46726b669b2941bb5a98e83e4ae8919b6a23b54f642c60b5',
      '90d0e44b6e536f496be365d32498bfc3881c37664d90dfe0e72b535a05883a21',
      '1d1bbffb327f365d0215a2ad2e7fbe27c6cb3b8a241ec3e0967ecce9f55e5d6c',
      '23f92893247ffbf3071b66e493bd00fb5d9bfdbe3eb0d42e90a503b9923d71d3',
    ],
  },
  'statement-categorize': {
    models: [],
    systemHashes: ['f86f2bcc39ec92e7145ae95ed34e5e5ac200d8b5db98b1f3330a5d1326633df7'],
  },
  'statement-layout': {
    models: [],
    systemHashes: ['bfbc30f94253fec994c89a7f0cf60a1bcd20caa00c6aa5446f2d081be4cbe1b1'],
  },
};

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** True when `system` is a prompt this task has actually shipped with. */
export async function isPinnedSystemPrompt(task: PublicAiTask, system: string): Promise<boolean> {
  return task.systemHashes.includes(await sha256Hex(system));
}
