/**
 * One-shot `run()` example.
 *
 * Sends a single prompt and prints the aggregated result. `run()` closes the
 * underlying session for you.
 *
 * Usage:
 *   npx tsx examples/node/run.ts
 *   npx tsx examples/node/run.ts "What is 2 + 2?"
 */

import { run } from '@factory/droid-sdk/node';

const { text, messages, tokenUsage } = await run(
  process.argv.slice(2).join(' ') || 'What is 2 + 2?'
);

console.log(text);
console.log(`\nmessages: ${messages.length}`);

if (tokenUsage) {
  console.log(
    `tokens: ${tokenUsage.inputTokens} in, ${tokenUsage.outputTokens} out`
  );
}
