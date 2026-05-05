/**
 * Manual smoke test for replacing Droid's system prompt through the SDK.
 *
 * Usage:
 *   npx tsx examples/system-prompt.ts
 */

import { run } from '../src/index.js';

async function main(): Promise<void> {
  const result = await run('Say hello in one sentence.', {
    cwd: process.cwd(),
    systemPrompt: 'You are a concise assistant.',
  });

  console.log(result.text);
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
