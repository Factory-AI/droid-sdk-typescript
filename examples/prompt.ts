/**
 * Manual smoke test for the one-shot `prompt()` API.
 *
 * Sends a single prompt, prints the aggregated result, and exits after the
 * underlying session has been closed by `prompt()`.
 *
 * Usage:
 *   npx tsx examples/prompt.ts
 *   npx tsx examples/prompt.ts "What is 2 + 2?"
 */

import { prompt } from '../src/index.js';

async function main(): Promise<void> {
  const text = process.argv.slice(2).join(' ') || 'What is 2 + 2?';

  console.log(`Sending prompt: "${text}"\n`);

  const result = await prompt(text, {
    cwd: process.cwd(),
  });

  console.log('=== Result ===');
  console.log(result.text);
  console.log(`Messages received: ${result.messages.length}`);

  if (result.tokenUsage) {
    console.log(
      `Tokens — input: ${result.tokenUsage.inputTokens}, ` +
        `output: ${result.tokenUsage.outputTokens}`
    );
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
