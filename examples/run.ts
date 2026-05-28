/**
 * Manual smoke test for the one-shot `run()` API.
 *
 * Sends a single prompt, prints the aggregated result, and exits after the
 * underlying session has been closed by `run()`.
 *
 * Usage:
 *   npx tsx examples/run.ts
 *   npx tsx examples/run.ts "What is 2 + 2?"
 */

import { run } from '@factory/droid-sdk';

async function main(): Promise<void> {
  const text = process.argv.slice(2).join(' ') || 'What is 2 + 2?';

  console.log(`Sending prompt: "${text}"\n`);

  const result = await run(text, {
    apiKey: process.env.FACTORY_API_KEY!,
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
